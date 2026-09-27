import type { UserConfigEntry } from '../types.js';
import { runtimeConfig } from '../config/runtime.js';
import { logger } from './logger.js';

let cachedConfig: UserConfigEntry[] | null = null;

export async function loadUserConfig(): Promise<UserConfigEntry[]> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const parsed: unknown = JSON.parse(runtimeConfig.usersConfigJson);
    if (!Array.isArray(parsed)) {
      throw new Error('USERS_CONFIG_JSON は配列で指定してください。');
    }

    cachedConfig = parsed.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error(`USERS_CONFIG_JSON の ${index + 1} 件目がオブジェクトではありません。`);
      }
      const config = entry as Partial<UserConfigEntry>;
      if (!config.MUSIC_DL_DIR || !config.VIDEO_DL_DIR) {
        throw new Error(`USERS_CONFIG_JSON の ${index + 1} 件目に保存先がありません。`);
      }
      if (!config.DISCORD_USER_ID && !config.LINE_USER_ID) {
        throw new Error(`USERS_CONFIG_JSON の ${index + 1} 件目にユーザーIDがありません。`);
      }
      return config as UserConfigEntry;
    });
    logger.info({ userCount: cachedConfig.length }, 'ユーザー設定をロードしました');
    return cachedConfig;
  } catch (error) {
    logger.error({ err: error }, 'ユーザー設定の読み込みに失敗しました');
    throw error;
  }
}

/**
 * ユーザー設定キャッシュをクリア（設定変更時に使用）
 */
export function clearUserConfigCache(): void {
  cachedConfig = null;
}

export async function getUserConfig(userId: string): Promise<UserConfigEntry | null> {
  const config = await loadUserConfig();
  return (
    config.find((entry) => entry.DISCORD_USER_ID === userId || entry.LINE_USER_ID === userId) ??
    null
  );
}

/**
 * ユーザーの音楽ディレクトリパスを取得
 * @returns ディレクトリパス。未登録ユーザーの場合は null
 */
export async function getUserMusicPath(userId: string): Promise<string | null> {
  return (await getUserConfig(userId))?.MUSIC_DL_DIR ?? null;
}

/**
 * LINEユーザーの音楽ディレクトリパスを取得
 * @returns ディレクトリパス。未登録ユーザーの場合は null
 */
export async function getLineUserMusicPath(userId: string): Promise<string | null> {
  return (await getUserConfig(userId))?.MUSIC_DL_DIR ?? null;
}

export async function getUserVideoPath(userId: string): Promise<string | null> {
  return (await getUserConfig(userId))?.VIDEO_DL_DIR ?? null;
}

export async function getLineUserVideoPath(userId: string): Promise<string | null> {
  return (await getUserConfig(userId))?.VIDEO_DL_DIR ?? null;
}

/**
 * 登録済みユーザーかどうかチェック
 */
export async function isRegisteredUser(userId: string): Promise<boolean> {
  return (await getUserConfig(userId)) !== null;
}

/**
 * LINE登録済みユーザーかどうかチェック
 */
export async function isLineRegisteredUser(userId: string): Promise<boolean> {
  return (await getUserConfig(userId)) !== null;
}
