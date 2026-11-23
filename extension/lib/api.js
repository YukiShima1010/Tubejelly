const DEFAULT_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  /**
   * @param {number} status HTTPステータス（通信失敗時は 0）
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 入力されたサーバーURLを正規化する（末尾スラッシュ除去）
 * @param {string} input
 * @returns {string} 例: https://tubejelly.example.com
 */
export function normalizeServerUrl(input) {
  const trimmed = (input ?? '').trim();
  if (!trimmed) throw new Error('サーバーURLを入力してください。');

  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('サーバーURLの形式が正しくありません。');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('サーバーURLは https:// で始めてください。');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('サーバーURLにはホスト名（とパス）のみを指定してください。');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * ホスト権限の取得に使うパターン（ポートはChromeのパターンで指定できないため省略）
 * @param {string} serverUrl
 */
export function originPattern(serverUrl) {
  const url = new URL(serverUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

/**
 * @param {string} serverUrl
 * @param {string} path
 * @param {{ method?: string, body?: unknown, token?: string, timeoutMs?: number }} [options]
 */
async function request(serverUrl, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res;
  try {
    res = await fetch(`${serverUrl}/ext/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      0,
      'network',
      timedOut ? 'サーバーの応答がタイムアウトしました。' : 'サーバーに接続できません。'
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  const text = await res.text().catch(() => '');
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const code = data?.error?.code ?? 'http_error';
    const message =
      data?.error?.message ??
      (res.status === 404
        ? 'APIが見つかりません。サーバーURLとサーバーの設定（EXTENSION_API_ENABLED）を確認してください。'
        : `サーバーエラー (${res.status})`);
    throw new ApiError(res.status, code, message);
  }

  if (data === null) {
    throw new ApiError(res.status, 'invalid_response', 'サーバーの応答を読み取れませんでした。');
  }
  return data;
}

export const api = {
  /** @param {string} serverUrl */
  health: (serverUrl) => request(serverUrl, '/health'),

  /** @param {string} serverUrl @param {string} deviceName */
  pairStart: (serverUrl, deviceName) =>
    request(serverUrl, '/pair/start', { method: 'POST', body: { deviceName } }),

  /** @param {string} serverUrl @param {string} pairingId */
  pairPoll: (serverUrl, pairingId) =>
    request(serverUrl, '/pair/poll', { method: 'POST', body: { pairingId } }),

  /** @param {string} serverUrl @param {string} token */
  me: (serverUrl, token) => request(serverUrl, '/me', { token }),

  /** @param {string} serverUrl @param {string} token */
  revoke: (serverUrl, token) => request(serverUrl, '/token', { method: 'DELETE', token }),

  /**
   * @param {string} serverUrl
   * @param {string} token
   * @param {{ url: string, kind: 'music' | 'video', playlist: boolean, title?: string }} body
   */
  createJob: (serverUrl, token, body) =>
    request(serverUrl, '/jobs', { method: 'POST', token, body, timeoutMs: 20000 }),

  /** @param {string} serverUrl @param {string} token @param {string} id */
  getJob: (serverUrl, token, id) =>
    request(serverUrl, `/jobs/${encodeURIComponent(id)}`, { token }),
};
