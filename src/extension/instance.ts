import path from 'path';
import { getUserConfig } from '../utils/userConfig.js';
import { runDownloadJob } from './runner.js';
import { ExtensionService } from './service.js';
import { TokenStore } from './tokenStore.js';

let instance: ExtensionService | null = null;

export function isExtensionApiEnabled(): boolean {
  return process.env.EXTENSION_API_ENABLED?.trim().toLowerCase() === 'true';
}

export function getExtensionTokenStorePath(): string {
  return (
    process.env.EXTENSION_TOKEN_STORE_PATH?.trim() ||
    path.join(process.cwd(), 'data', 'extension-tokens.json')
  );
}

/**
 * 拡張機能サービスのシングルトン。無効化されている場合は null。
 */
export function getExtensionService(): ExtensionService | null {
  if (!isExtensionApiEnabled()) return null;
  if (!instance) {
    instance = new ExtensionService(
      new TokenStore(getExtensionTokenStorePath()),
      getUserConfig,
      runDownloadJob
    );
  }
  return instance;
}
