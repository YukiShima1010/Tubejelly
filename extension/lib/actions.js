import { api, ApiError } from './api.js';
import * as storage from './storage.js';
import { ensurePolling, pollPairingOnce, updateBadge } from './sync.js';

/**
 * ポップアップが閉じても途中で止まらないよう、バックグラウンド（Service Worker）で実行する処理。
 * ポップアップからは callBackground() 経由で呼び出す。
 */
export const BACKGROUND_ACTIONS = {
  /**
   * 追加ジョブを登録し、履歴に保存して状態確認を開始する
   * @param {{ url: string, kind: 'music' | 'video', playlist: boolean, title?: string }} payload
   */
  async addJob(payload) {
    const [settings, auth] = await Promise.all([storage.getSettings(), storage.getAuth()]);
    if (!auth || !settings.serverUrl) {
      throw new ApiError(401, 'unauthorized', '連携されていません。');
    }
    try {
      const { job } = await api.createJob(settings.serverUrl, auth.token, payload);
      await storage.addJob(job);
      await ensurePolling();
      await updateBadge();
      return job;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await storage.clearAuth();
      throw error;
    }
  },

  /**
   * 連携コードを発行して保存し、承認の確認を開始する
   * @param {{ serverUrl: string, deviceName: string }} payload
   */
  async startPairing({ serverUrl, deviceName }) {
    await api.health(serverUrl);
    const pairing = await api.pairStart(serverUrl, deviceName);
    await storage.setPairing({
      pairingId: pairing.pairingId,
      code: pairing.code,
      expiresAt: pairing.expiresAt,
      serverUrl,
    });
    await ensurePolling();
    return { code: pairing.code };
  },

  /**
   * 連携の承認を確認する。受け取ったトークンの保存がポップアップを閉じても中断されないよう、ここで行う
   */
  async pollPairing() {
    return await pollPairingOnce();
  },
};

const MESSAGE_PREFIX = 'tubejelly:';

/**
 * バックグラウンドの処理を呼び出す（ポップアップ用）
 * @param {keyof typeof BACKGROUND_ACTIONS} name
 * @param {unknown} payload
 */
export async function callBackground(name, payload) {
  const response = await chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}${name}`, payload });
  if (!response) {
    throw new ApiError(0, 'no_response', '拡張機能の内部処理から応答がありませんでした。');
  }
  if (!response.ok) {
    throw new ApiError(response.error.status, response.error.code, response.error.message);
  }
  return response.result;
}

/**
 * バックグラウンド側のメッセージ受付（background.js で登録する）
 */
export function handleBackgroundMessage(message, _sender, sendResponse) {
  const type = typeof message?.type === 'string' ? message.type : '';
  if (!type.startsWith(MESSAGE_PREFIX)) return false;
  const action = BACKGROUND_ACTIONS[type.slice(MESSAGE_PREFIX.length)];
  if (!action) return false;

  action(message.payload).then(
    (result) => sendResponse({ ok: true, result }),
    (error) =>
      sendResponse({
        ok: false,
        error: {
          status: error instanceof ApiError ? error.status : 0,
          code: error instanceof ApiError ? error.code : 'internal',
          message: error instanceof Error ? error.message : String(error),
        },
      })
  );
  // 非同期で応答する
  return true;
}
