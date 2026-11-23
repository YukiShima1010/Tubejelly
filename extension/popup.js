import { api, ApiError, normalizeServerUrl, originPattern } from './lib/api.js';
import { callBackground } from './lib/actions.js';
import * as storage from './lib/storage.js';
import {
  refreshActiveJobs,
  stopPollingIfIdle,
  updateBadge,
} from './lib/sync.js';
import { cleanTabTitle, parseYouTubeUrl } from './lib/youtube.js';

const POLL_INTERVAL_MS = 2000;

const STATUS_LABELS = {
  queued: '待機中',
  running: '実行中',
  succeeded: '成功',
  failed: '失敗',
  unknown: '不明',
};

const KIND_LABELS = {
  music: '🎵 ミュージック',
  video: '🎬 動画',
};

const $ = (id) => document.getElementById(id);

const state = {
  /** @type {{ url: string, title: string, parsed: ReturnType<typeof parseYouTubeUrl> } | null} */
  tab: null,
  /** 詳細を開いているジョブID */
  expanded: new Set(),
  /** @type {Map<string, { el: HTMLElement, signature: string }>} */
  jobEls: new Map(),
  polling: false,
  adding: false,
  setupFilled: false,
  kindInitialized: false,
  /** @type {'network' | 'action' | null} */
  bannerSource: null,
  unlinkArmedUntil: 0,
  renderQueued: false,
  renderChain: Promise.resolve(),
};

// ---------------------------------------------------------------------------
// 共通

function show(id, visible) {
  $(id).hidden = !visible;
}

function showBanner(message, kind = 'warn', source = 'action') {
  const banner = $('banner');
  banner.textContent = message;
  banner.classList.toggle('error', kind === 'error');
  banner.hidden = false;
  state.bannerSource = source;
}

function hideBanner(source) {
  if (source && state.bannerSource !== source) return;
  $('banner').hidden = true;
  state.bannerSource = null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function defaultDeviceName() {
  const platform = navigator.userAgentData?.platform || '';
  return platform ? `Chrome (${platform})` : 'Chrome';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 401を受けたら連携情報を消して初期設定に戻す */
async function handleUnauthorized(error) {
  if (error instanceof ApiError && error.status === 401) {
    await storage.clearAuth();
    showBanner('連携が無効になりました。もう一度連携してください。', 'error');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 描画

function scheduleRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  setTimeout(() => {
    state.renderQueued = false;
    state.renderChain = state.renderChain.then(render).catch((error) => {
      console.error('TubeJelly: 描画に失敗しました', error);
    });
  }, 30);
}

async function render() {
  const [settings, auth, pairing] = await Promise.all([
    storage.getSettings(),
    storage.getAuth(),
    storage.getPairing(),
  ]);

  show('setup-view', !auth && !pairing);
  show('pairing-view', !auth && Boolean(pairing));
  show('main-view', Boolean(auth));

  const chip = $('user-chip');
  chip.hidden = !auth;
  chip.textContent = auth ? `👤 ${auth.userName}` : '';

  if (auth) {
    await renderMain(settings, auth);
  } else if (pairing) {
    renderPairing(pairing);
  } else {
    renderSetup(settings);
  }
}

function renderSetup(settings) {
  if (!state.setupFilled) {
    $('server-url').value = settings.serverUrl || '';
    $('device-name').value = settings.deviceName || defaultDeviceName();
    state.setupFilled = true;
  }
  updateHttpWarning();
}

function updateHttpWarning() {
  const value = $('server-url').value.trim();
  show('http-warning', /^http:\/\//i.test(value));
}

function renderPairing(pairing) {
  $('pairing-code').textContent = pairing.code;
  const remainingMs = Date.parse(pairing.expiresAt) - Date.now();
  const expired = Boolean(pairing.expired);

  if (expired) {
    $('pairing-timer').textContent = '有効期限が切れました。コードを再発行してください。';
  } else if (remainingMs > 0) {
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    $('pairing-timer').textContent = `有効期限: 残り ${minutes}:${String(seconds).padStart(2, '0')}`;
  } else {
    $('pairing-timer').textContent = '有効期限を過ぎました。承認済みか確認しています…';
  }

  show('pairing-status', !expired);
  show('pairing-retry', expired);
}

async function renderMain(settings, auth) {
  $('server-label').textContent = `${settings.serverUrl}（${auth.deviceName ?? ''}）`;

  if (!state.kindInitialized) {
    const radio = document.querySelector(`input[name="kind"][value="${settings.lastKind}"]`);
    if (radio) radio.checked = true;
    state.kindInitialized = true;
  }

  renderTab();
  const jobs = await storage.listJobs();
  renderJobs(jobs);
}

function renderTab() {
  const card = $('tab-card');
  const parsed = state.tab?.parsed;
  const supported = Boolean(parsed && (parsed.videoId || parsed.playlistId));

  card.classList.toggle('unsupported', !supported);
  if (!state.tab) {
    $('tab-title').textContent = 'タブの情報を取得できませんでした。';
    $('tab-url').textContent = '';
  } else if (!supported) {
    $('tab-title').textContent = 'YouTubeの動画ページを開いてください。';
    $('tab-url').textContent = state.tab.url || '';
  } else {
    $('tab-title').textContent = state.tab.title || '(タイトル不明)';
    $('tab-url').textContent = state.tab.url;
  }

  const hasBoth = Boolean(parsed?.videoId && parsed?.playlistId);
  const playlistOnly = Boolean(parsed && !parsed.videoId && parsed.playlistId);
  show('playlist-option', hasBoth);
  show('playlist-only', playlistOnly);

  for (const input of document.querySelectorAll('input[name="kind"]')) {
    input.disabled = !supported;
  }
  $('add-button').disabled = !supported || state.adding;
}

function jobSignature(job, expanded) {
  return JSON.stringify([
    job.status,
    job.title,
    job.error,
    job.logs?.length ?? 0,
    job.logs?.at(-1)?.message,
    expanded,
  ]);
}

function renderJobs(jobs) {
  const list = $('job-list');
  show('job-empty', jobs.length === 0);
  $('clear-history').disabled = !jobs.some((job) => !storage.isActiveJob(job));

  const seen = new Set();
  let previous = null;

  for (const job of jobs) {
    seen.add(job.id);
    const expanded = state.expanded.has(job.id);
    const signature = jobSignature(job, expanded);
    const cached = state.jobEls.get(job.id);

    let node = cached?.el;
    if (!cached || cached.signature !== signature) {
      const oldLog = cached?.el.querySelector('.job-log');
      const wasAtBottom =
        !oldLog || oldLog.scrollTop + oldLog.clientHeight >= oldLog.scrollHeight - 4;
      const oldScrollTop = oldLog?.scrollTop ?? 0;

      node = buildJobElement(job, expanded);
      if (cached) cached.el.replaceWith(node);
      state.jobEls.set(job.id, { el: node, signature });

      const newLog = node.querySelector('.job-log');
      if (newLog && expanded) {
        // 再描画後もスクロール位置を保つ（末尾を見ていた場合は追従する）
        requestAnimationFrame(() => {
          newLog.scrollTop = wasAtBottom ? newLog.scrollHeight : oldScrollTop;
        });
      }
    }

    // 並び順を合わせる
    const expectedNext = previous ? previous.nextSibling : list.firstChild;
    if (node !== expectedNext) list.insertBefore(node, expectedNext);
    previous = node;
  }

  for (const [id, cached] of state.jobEls) {
    if (!seen.has(id)) {
      cached.el.remove();
      state.jobEls.delete(id);
      state.expanded.delete(id);
    }
  }
}

function buildJobElement(job, expanded) {
  const item = el('li', 'job');
  const head = el('div', 'job-head');
  const main = el('div', 'job-main');

  main.append(el('div', 'job-title', job.title || job.url));

  const metaParts = [KIND_LABELS[job.kind] ?? job.kind];
  if (job.mode === 'playlist') metaParts.push('プレイリスト');
  metaParts.push(formatDateTime(job.createdAt));
  if (job.status === 'running' && job.logs?.length) {
    metaParts.push(job.logs[job.logs.length - 1].message);
  }
  main.append(el('div', 'job-meta', metaParts.filter(Boolean).join(' · ')));

  const skipped = job.status === 'succeeded' && job.result?.skipped;
  const badgeText = skipped ? '成功（既存）' : (STATUS_LABELS[job.status] ?? job.status);
  const badge = el('span', `badge ${job.status}`, badgeText);
  if (skipped) badge.title = '既に保存済みのためスキップしました';

  head.append(main, badge);
  item.append(head);

  if (job.error) {
    item.append(el('div', 'job-error', job.error));
  }

  const toggle = el('button', 'link detail-toggle', expanded ? '詳細↑' : '詳細↓');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.addEventListener('click', () => {
    if (state.expanded.has(job.id)) state.expanded.delete(job.id);
    else state.expanded.add(job.id);
    scheduleRender();
  });
  item.append(toggle);

  if (expanded) {
    const log = el('pre', 'job-log');
    const logs = job.logs ?? [];
    if (logs.length === 0) {
      log.append(el('span', 'time', 'ログはまだありません。'));
    }
    logs.forEach((entry, index) => {
      const line = el('span', entry.level === 'error' ? 'error' : '');
      line.append(el('span', 'time', `${formatTime(entry.at)} `), entry.message);
      log.append(line);
      if (index < logs.length - 1) log.append('\n');
    });
    item.append(log);
  }

  return item;
}

// ---------------------------------------------------------------------------
// 操作

async function onSetupSubmit(event) {
  event.preventDefault();
  hideBanner();

  let serverUrl;
  try {
    serverUrl = normalizeServerUrl($('server-url').value);
  } catch (error) {
    showBanner(errorMessage(error), 'error');
    return;
  }
  const deviceName = $('device-name').value.trim() || defaultDeviceName();

  // 権限の要求はユーザー操作の直後に行う必要があるため、待たずに保存を開始してから要求する
  const saving = storage.saveSettings({ serverUrl, deviceName });
  let granted;
  try {
    granted = await chrome.permissions.request({ origins: [originPattern(serverUrl)] });
  } catch (error) {
    showBanner(`権限の要求に失敗しました: ${errorMessage(error)}`, 'error');
    return;
  }
  await saving;

  if (!granted) {
    showBanner('サーバーへのアクセスが許可されませんでした。', 'error');
    return;
  }

  await startPairing(serverUrl, deviceName);
}

async function startPairing(serverUrl, deviceName) {
  const submit = $('setup-submit');
  const retry = $('pairing-retry');
  submit.disabled = true;
  retry.disabled = true;
  submit.textContent = '接続中…';

  try {
    await callBackground('startPairing', { serverUrl, deviceName });
    hideBanner();
  } catch (error) {
    showBanner(errorMessage(error), 'error');
  } finally {
    submit.disabled = false;
    retry.disabled = false;
    submit.textContent = '接続して連携コードを発行';
  }
  scheduleRender();
}

async function onPairingRetry() {
  const settings = await storage.getSettings();
  await storage.clearPairing();
  await startPairing(settings.serverUrl, settings.deviceName || defaultDeviceName());
}

async function onPairingCancel() {
  await storage.clearPairing();
  hideBanner();
  await stopPollingIfIdle();
  scheduleRender();
}

async function onCopyCode() {
  const code = $('pairing-code').textContent;
  const button = $('copy-code');
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = 'コピーしました';
  } catch {
    button.textContent = 'コピー失敗';
  }
  setTimeout(() => {
    button.textContent = 'コピー';
  }, 1500);
}

function selectedKind() {
  return document.querySelector('input[name="kind"]:checked')?.value === 'video' ? 'video' : 'music';
}

async function onAdd() {
  if (state.adding || !state.tab?.parsed) return;
  const parsed = state.tab.parsed;
  if (!parsed.videoId && !parsed.playlistId) return;

  const auth = await storage.getAuth();
  if (!auth) return;

  const button = $('add-button');
  state.adding = true;
  button.disabled = true;
  button.textContent = '送信中…';
  show('add-error', false);

  let succeeded = false;
  try {
    const playlist = !parsed.videoId || (Boolean(parsed.playlistId) && $('playlist-check').checked);
    // ポップアップが閉じても登録・履歴保存が途中で止まらないよう、バックグラウンドで実行する
    await callBackground('addJob', {
      url: state.tab.url,
      kind: selectedKind(),
      playlist,
      title: state.tab.title || undefined,
    });
    succeeded = true;
  } catch (error) {
    if (!(await handleUnauthorized(error))) {
      $('add-error').textContent = `❌ ${errorMessage(error)}`;
      show('add-error', true);
    }
  } finally {
    state.adding = false;
    button.textContent = succeeded ? '✓ 追加しました' : '追加';
    if (succeeded) {
      setTimeout(() => {
        if (!state.adding) button.textContent = '追加';
      }, 1500);
    }
    scheduleRender();
  }
}

async function onClearHistory() {
  await storage.clearFinishedJobs();
  scheduleRender();
}

async function onUnlink() {
  const button = $('unlink');
  if (Date.now() > state.unlinkArmedUntil) {
    // 誤操作防止のため2回押しで解除する
    state.unlinkArmedUntil = Date.now() + 3000;
    button.textContent = 'もう一度押すと解除';
    setTimeout(() => {
      if (Date.now() > state.unlinkArmedUntil) button.textContent = '連携解除';
    }, 3100);
    return;
  }
  state.unlinkArmedUntil = 0;
  button.textContent = '連携解除';

  const [settings, auth] = await Promise.all([storage.getSettings(), storage.getAuth()]);
  if (auth) {
    try {
      await api.revoke(settings.serverUrl, auth.token);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        showBanner(
          `サーバー側の解除に失敗しました（${errorMessage(error)}）。この端末の連携情報のみ削除しました。`,
          'warn'
        );
      }
    }
  }

  await storage.clearAuth();
  await storage.clearAllJobs();
  state.jobEls.forEach(({ el: node }) => node.remove());
  state.jobEls.clear();
  state.expanded.clear();
  state.kindInitialized = false;
  await updateBadge();
  await stopPollingIfIdle();
  scheduleRender();
}

// ---------------------------------------------------------------------------
// ポーリング

async function pollOnce() {
  if (state.polling) return;
  state.polling = true;
  try {
    const [auth, pairing] = await Promise.all([storage.getAuth(), storage.getPairing()]);

    if (!auth && pairing && !pairing.expired) {
      const status = await callBackground('pollPairing');
      if (status === 'error') {
        showBanner('サーバーに接続できません。再試行しています…', 'warn', 'network');
      } else {
        hideBanner('network');
      }
    }

    if (auth) {
      const outcome = await refreshActiveJobs();
      // ポップアップで確認できたものは通知しない
      for (const job of outcome.finished) {
        await storage.updateJob({ ...job, notified: true });
      }
      if (outcome.unauthorized) {
        showBanner('連携が無効になりました。もう一度連携してください。', 'error');
      } else if (outcome.networkError) {
        showBanner(`${outcome.networkError} 再試行しています…`, 'warn', 'network');
      } else {
        hideBanner('network');
      }
      await updateBadge();
    }
  } catch (error) {
    console.error('TubeJelly: 状態の確認に失敗しました', error);
  } finally {
    state.polling = false;
  }
}

async function loadTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    state.tab = {
      url: tab.url ?? '',
      title: cleanTabTitle(tab.title),
      parsed: parseYouTubeUrl(tab.url),
    };
  } catch (error) {
    console.error('TubeJelly: タブ情報の取得に失敗しました', error);
  }
}

function bindEvents() {
  $('setup-form').addEventListener('submit', onSetupSubmit);
  $('server-url').addEventListener('input', updateHttpWarning);
  $('copy-code').addEventListener('click', onCopyCode);
  $('pairing-retry').addEventListener('click', onPairingRetry);
  $('pairing-cancel').addEventListener('click', onPairingCancel);
  $('add-button').addEventListener('click', onAdd);
  $('clear-history').addEventListener('click', onClearHistory);
  $('unlink').addEventListener('click', onUnlink);
  for (const input of document.querySelectorAll('input[name="kind"]')) {
    input.addEventListener('change', () => void storage.saveSettings({ lastKind: selectedKind() }));
  }
}

async function init() {
  bindEvents();
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') scheduleRender();
  });

  await loadTab();
  await render();
  await pollOnce();

  setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  // 連携コードの残り時間表示を更新する
  setInterval(() => {
    if (!$('pairing-view').hidden) scheduleRender();
  }, 1000);
}

void init();
