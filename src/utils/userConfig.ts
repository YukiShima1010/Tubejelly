import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import type { UserConfigEntry } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ユーザー設定の型
// キャッシュ
let cachedConfig: UserConfigEntry[] | null = null;

/**
 * ユーザー設定ファイルのパス
 */
function getUserConfigPath(): string {
  return join(__dirname, '..', 'config', 'users.json');
}

/**
 * LINEユーザー設定ファイルのパス
 */
/**
 * ユーザー設定を読み込む
 */
export async function loadUserConfig(): Promise<UserConfigEntry[]> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = getUserConfigPath();
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as UserConfigEntry[];
    cachedConfig = Array.isArray(parsed) ? parsed : [];
    console.log(chalk.green(`✓ ユーザー設定をロード: ${cachedConfig.length}ユーザー`));
    return cachedConfig;
  } catch (error) {
    console.error(chalk.red('❌ ユーザー設定ファイルの読み込みに失敗:'), error);
    cachedConfig = [];
    return cachedConfig;
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