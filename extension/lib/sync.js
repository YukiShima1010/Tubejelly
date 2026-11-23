import { api, ApiError } from './api.js';
import {
  clearAuth,
  clearPairing,
  getAuth,
  getPairing,
  getSettings,
  isActiveJob,
  listJobs,
  setAuth,
  setPairing,
  updateJob,
} from './storage.js';

export const POLL_ALARM = 'tubejelly-poll';

/**
 * サーバーから未完了ジョブの最新状態を取得して保存する。
 * @returns {Promise<{ finished: any[], unauthorized: boolean, networkError: string | null }>}
 *   finished: 今回の確認で終了したジョブ
 */
export async function refreshActiveJobs() {
  const outcome = { finished: [], unauthorized: false, networkError: null };
  const [auth, settings, jobs] = await Promise.all([getAuth(), getSettings(), listJobs()]);
  if (!auth || !settings.serverUrl) return outcome;

  for (const job of jobs.filter(isActiveJob)) {
    try {
      const { job: latest } = await api.getJob(settings.serverUrl, auth.token, job.id);
      const merged = { ...job, ...latest };
      await updateJob(merged);
      if (!isActiveJob(merged)) outcome.finished.push(merged);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearAuth();
        outcome.unauthorized = true;
        break;
      }
      if (error instanceof ApiError && error.status === 404) {
        const lost = {
          ...job,
          status: 'unknown',
          error: 'サーバー上に記録がありません（サーバーが再起動した可能性があります）。',
        };
        await updateJob(lost);
        outcome.finished.push(lost);
        continue;
      }
      outcome.networkError = error instanceof Error ? error.message : String(error);
      break;
    }
  }

  return outcome;
}

/**
 * 連携待ちの状態を確認し、承認されていればトークンを保存する。
 * 有効期限の判定はサーバーに任せる（承認後は受け取り猶予があるため）。
 * @returns {Promise<'none' | 'pending' | 'approved' | 'expired' | 'error'>}
 */
export async function pollPairingOnce() {
  const pairing = await getPairing();
  if (!pairing) return 'none';
  if (pairing.expired) return 'expired';

  try {
    const result = await api.pairPoll(pairing.serverUrl, pairing.pairingId);
    if (result.status === 'approved' && typeof result.token === 'string') {
      await setAuth({
        token: result.token,
        userName: result.userName,
        deviceName: result.deviceName,
      });
      await clearPairing();
      return 'approved';
    }
    if (result.status === 'expired') {
      // ポップアップと背景が同時に確認した場合、もう一方が受け取り済みのことがあるため読み直す
      const current = await getPairing();
      if (current?.pairingId === pairing.pairingId) {
        await setPairing({ ...current, expired: true });
      }
      return (await getAuth()) ? 'approved' : 'expired';
    }
    return 'pending';
  } catch {
    return 'error';
  }
}

/**
 * バックグラウンドでの定期確認を開始する（30秒間隔）
 */
export async function ensurePolling() {
  const existing = await chrome.alarms.get(POLL_ALARM);
  if (!existing) {
    await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  }
}

/**
 * 確認対象が無くなったら定期確認を止める
 */
export async function stopPollingIfIdle() {
  const [pairing, jobs, auth] = await Promise.all([getPairing(), listJobs(), getAuth()]);
  const pairingActive = pairing && !pairing.expired;
  const jobsActive = auth && jobs.some(isActiveJob);
  if (!pairingActive && !jobsActive) {
    await chrome.alarms.clear(POLL_ALARM);
  }
}

/**
 * 未完了ジョブ数をアイコンのバッジに表示する
 */
export async function updateBadge() {
  const [jobs, auth] = await Promise.all([listJobs(), getAuth()]);
  const active = auth ? jobs.filter(isActiveJob).length : 0;
  await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  await chrome.action.setBadgeText({ text: active > 0 ? String(active) : '' });
}
