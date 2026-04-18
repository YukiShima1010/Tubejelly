import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ユーザー設定の型
type UserConfig = Record<string, string>;

// キャッシュ
let cachedConfig: UserConfig | null = null;
let cachedLineConfig: UserConfig | null = null;

/**
 * ユーザー設定ファイルのパス
 */
function getUserConfigPath(): string {
  return join(__dirname, '..', 'config', 'users.json');
}

/**
 * LINEユーザー設定ファイルのパス
 */
function getLineUserConfigPath(): string {
  return join(__dirname, '..', 'config', 'lineUsers.json');
}

/**
 * ユーザー設定を読み込む
 */
export async function loadUserConfig(): Promise<UserConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = getUserConfigPath();
    const raw = await fs.readFile(configPath, 'utf-8');
    cachedConfig = JSON.parse(raw) as UserConfig;
    console.log(chalk.green(`✓ ユーザー設定をロード: ${Object.keys(cachedConfig).length}ユーザー`));
    return cachedConfig;
  } catch (error) {
    console.error(chalk.red('❌ ユーザー設定ファイルの読み込みに失敗:'), error);
    cachedConfig = {};
    return cachedConfig;
  }
}

/**
 * LINEユーザー設定を読み込む
 */
export async function loadLineUserConfig(): Promise<UserConfig> {
  if (cachedLineConfig) {
    return cachedLineConfig;
  }

  try {
    const configPath = getLineUserConfigPath();
    const raw = await fs.readFile(configPath, 'utf-8');
    cachedLineConfig = JSON.parse(raw) as UserConfig;
    console.log(
      chalk.green(`✓ LINEユーザー設定をロード: ${Object.keys(cachedLineConfig).length}ユーザー`)
    );
    return cachedLineConfig;
  } catch (error) {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined;

    if (errorCode === 'ENOENT') {
      console.warn(
        chalk.yellow('⚠️ LINEユーザー設定ファイルが見つかりません: src/config/lineUsers.json')
      );
    } else {
      console.error(chalk.red('❌ LINEユーザー設定ファイルの読み込みに失敗:'), error);
    }
    cachedLineConfig = {};
    return cachedLineConfig;
  }
}

/**
 * ユーザー設定キャッシュをクリア（設定変更時に使用）
 */
export function clearUserConfigCache(): void {
  cachedConfig = null;
  cachedLineConfig = null;
}

/**
 * ユーザーの音楽ディレクトリパスを取得
 * @returns ディレクトリパス。未登録ユーザーの場合は null
 */
export async function getUserMusicPath(userId: string): Promise<string | null> {
  const config = await loadUserConfig();
  return config[userId] ?? null;
}

/**
 * LINEユーザーの音楽ディレクトリパスを取得
 * @returns ディレクトリパス。未登録ユーザーの場合は null
 */
export async function getLineUserMusicPath(userId: string): Promise<string | null> {
  const config = await loadLineUserConfig();
  return config[userId] ?? null;
}

/**
 * 登録済みユーザーかどうかチェック
 */
export async function isRegisteredUser(userId: string): Promise<boolean> {
  const config = await loadUserConfig();
  return userId in config;
}

/**
 * LINE登録済みユーザーかどうかチェック
 */
export async function isLineRegisteredUser(userId: string): Promise<boolean> {
  const config = await loadLineUserConfig();
  return userId in config;
}
