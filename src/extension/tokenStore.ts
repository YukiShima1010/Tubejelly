import { createHash, randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { PairingVia } from './pairing.js';

export interface TokenRecord {
  id: string;
  tokenHash: string;
  userKey: string;
  via: PairingVia;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface TokenFile {
  version: 1;
  tokens: TokenRecord[];
}

/** lastUsedAt をファイルに書き戻す最小間隔 */
const LAST_USED_PERSIST_INTERVAL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 拡張機能のアクセストークンをJSONファイルに保存する。
 * 平文のトークンは保存せず、SHA-256ハッシュのみを保持する。
 */
export class TokenStore {
  private records: TokenRecord[] | null = null;
  private loading: Promise<TokenRecord[]> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now
  ) {}

  async issue(params: {
    userKey: string;
    via: PairingVia;
    deviceName: string;
  }): Promise<{ token: string; record: TokenRecord }> {
    const records = await this.load();
    const token = randomBytes(32).toString('base64url');
    const record: TokenRecord = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      userKey: params.userKey,
      via: params.via,
      deviceName: params.deviceName,
      createdAt: new Date(this.now()).toISOString(),
      lastUsedAt: null,
    };
    records.push(record);
    try {
      await this.persist();
    } catch (error) {
      // 保存できなかったトークンはメモリ上でも無効にする
      const index = records.indexOf(record);
      if (index !== -1) records.splice(index, 1);
      throw error;
    }
    return { token, record };
  }

  async find(token: string): Promise<TokenRecord | null> {
    if (!token) return null;
    const records = await this.load();
    const tokenHash = hashToken(token);
    return records.find((record) => record.tokenHash === tokenHash) ?? null;
  }

  /**
   * 利用日時を更新する。書き込み頻度を抑えるため、前回から一定時間経過した場合のみ保存する。
   */
  async touch(record: TokenRecord): Promise<void> {
    const now = this.now();
    const last = record.lastUsedAt ? Date.parse(record.lastUsedAt) : 0;
    record.lastUsedAt = new Date(now).toISOString();
    if (now - last >= LAST_USED_PERSIST_INTERVAL_MS) {
      await this.persist();
    }
  }

  async revoke(id: string): Promise<boolean> {
    const records = await this.load();
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) return false;
    records.splice(index, 1);
    await this.persist();
    return true;
  }

  /**
   * ファイルを読み込む。同時に呼ばれても読み込みは1回だけにする。
   */
  private load(): Promise<TokenRecord[]> {
    if (this.records) return Promise.resolve(this.records);
    if (!this.loading) {
      this.loading = this.readFromFile().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async readFromFile(): Promise<TokenRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TokenFile>;
      this.records = Array.isArray(parsed.tokens) ? parsed.tokens : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.records = [];
      } else {
        // 壊れたファイルを空で上書きして全端末の連携を消さないよう、空扱いにせずエラーにする
        throw new Error(
          `拡張機能トークンファイルの読み込みに失敗しました (${this.filePath}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return this.records;
  }

  /**
   * 一時ファイルに書いてからリネームする（書き込み途中で壊れないように）。
   * 同時書き込みを避けるため直列化する。
   */
  private persist(): Promise<void> {
    const run = async () => {
      const body: TokenFile = { version: 1, tokens: this.records ?? [] };
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmpPath = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmpPath, `${JSON.stringify(body, null, 2)}\n`, {
        encoding: 'utf-8',
        mode: 0o600,
      });
      await fs.rename(tmpPath, this.filePath);
    };

    const next = this.writeChain.then(run, run);
    this.writeChain = next.catch(() => {});
    return next;
  }
}
