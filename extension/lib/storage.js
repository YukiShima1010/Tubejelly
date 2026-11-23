/**
 * chrome.storage.local のラッパー
 *
 * - settings: { serverUrl, deviceName, lastKind }
 * - auth:     { token, userName, deviceName }
 * - pairing:  { pairingId, code, expiresAt, serverUrl }
 * - jobIds:   新しい順のジョブID
 * - job:<id>: ジョブのスナップショット
 */

export const MAX_STORED_JOBS = 30;
export const ACTIVE_STATUSES = ['queued', 'running'];

const store = chrome.storage.local;

const DEFAULT_SETTINGS = {
  serverUrl: '',
  deviceName: '',
  lastKind: 'music',
};

const jobKey = (id) => `job:${id}`;

export async function getSettings() {
  const { settings } = await store.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

/** @param {Partial<typeof DEFAULT_SETTINGS>} patch */
export async function saveSettings(patch) {
  const current = await getSettings();
  await store.set({ settings: { ...current, ...patch } });
}

export async function getAuth() {
  const { auth } = await store.get('auth');
  return auth?.token ? auth : null;
}

export async function setAuth(auth) {
  await store.set({ auth });
}

export async function clearAuth() {
  await store.remove('auth');
}

export async function getPairing() {
  const { pairing } = await store.get('pairing');
  return pairing?.pairingId ? pairing : null;
}

export async function setPairing(pairing) {
  await store.set({ pairing });
}

export async function clearPairing() {
  await store.remove('pairing');
}

async function getJobIds() {
  const { jobIds } = await store.get('jobIds');
  return Array.isArray(jobIds) ? jobIds : [];
}

/**
 * 保存されているジョブを新しい順に返す
 */
export async function listJobs() {
  const ids = await getJobIds();
  if (ids.length === 0) return [];
  const data = await store.get(ids.map(jobKey));
  return ids.map((id) => data[jobKey(id)]).filter(Boolean);
}

/**
 * 新しく登録したジョブを履歴の先頭に追加する
 */
export async function addJob(job) {
  const ids = (await getJobIds()).filter((id) => id !== job.id);
  ids.unshift(job.id);
  const removed = ids.splice(MAX_STORED_JOBS);
  await store.set({ jobIds: ids, [jobKey(job.id)]: job });
  if (removed.length > 0) await store.remove(removed.map(jobKey));
}

/**
 * 既存ジョブのスナップショットを更新する（履歴から消されたジョブは復活させない）
 */
export async function updateJob(job) {
  const ids = await getJobIds();
  if (!ids.includes(job.id)) return;
  await store.set({ [jobKey(job.id)]: job });
}

/**
 * 終了したジョブを履歴から削除する（未完了のジョブは残す）
 */
export async function clearFinishedJobs() {
  const jobs = await listJobs();
  const keep = jobs.filter((job) => ACTIVE_STATUSES.includes(job.status)).map((job) => job.id);
  const remove = jobs.filter((job) => !keep.includes(job.id)).map((job) => jobKey(job.id));
  await store.set({ jobIds: keep });
  if (remove.length > 0) await store.remove(remove);
}

export async function clearAllJobs() {
  const ids = await getJobIds();
  await store.remove(['jobIds', ...ids.map(jobKey)]);
}

export function isActiveJob(job) {
  return ACTIVE_STATUSES.includes(job.status);
}
