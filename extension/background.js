import {
  POLL_ALARM,
  ensurePolling,
  pollPairingOnce,
  refreshActiveJobs,
  stopPollingIfIdle,
  updateBadge,
} from './lib/sync.js';
import { getAuth, getPairing, isActiveJob, listJobs, updateJob } from './lib/storage.js';
import { handleBackgroundMessage } from './lib/actions.js';

const STATUS_TEXT = {
  succeeded: '追加しました',
  failed: '追加に失敗しました',
  unknown: '状態を確認できませんでした',
};

let ticking = false;

/**
 * 連携待ち・未完了ジョブを確認し、通知とバッジを更新する
 */
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const pairingStatus = await pollPairingOnce();
    if (pairingStatus === 'approved') {
      const auth = await getAuth();
      notify('pairing', 'TubeJelly と連携しました', `${auth?.userName ?? ''} さんのアカウントで利用できます。`);
    }

    const { finished } = await refreshActiveJobs();
    for (const job of finished) {
      if (job.notified) continue;
      const skipped = job.status === 'succeeded' && job.result?.skipped;
      const title = skipped ? '既に保存済みです' : (STATUS_TEXT[job.status] ?? '処理が終了しました');
      notify(`job-${job.id}`, `TubeJelly: ${title}`, job.title || job.url);
      await updateJob({ ...job, notified: true });
    }

    await updateBadge();
    await stopPollingIfIdle();
  } catch (error) {
    console.error('TubeJelly: バックグラウンド確認に失敗しました', error);
  } finally {
    ticking = false;
  }
}

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message: message || ' ',
    priority: 0,
  });
}

/**
 * ブラウザ起動・拡張機能更新時に、確認すべきものが残っていれば定期確認を再開する
 */
async function resume() {
  const [pairing, jobs, auth] = await Promise.all([getPairing(), listJobs(), getAuth()]);
  if ((pairing && !pairing.expired) || (auth && jobs.some(isActiveJob))) {
    await ensurePolling();
    await tick();
  }
  await updateBadge();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void tick();
});

chrome.runtime.onStartup.addListener(() => void resume());
chrome.runtime.onInstalled.addListener(() => void resume());

// ポップアップからの追加・連携コード発行（ポップアップが閉じても処理を続ける）
chrome.runtime.onMessage.addListener(handleBackgroundMessage);
