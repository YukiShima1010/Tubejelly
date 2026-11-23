import chalk from 'chalk';
import type { UserConfigEntry } from '../types.js';
import { normalizeYouTubePlaylistUrl, normalizeYouTubeVideoUrl } from '../utils/download.js';
import { JobManager, type JobKind, type JobRunner, type PublicJob } from './jobs.js';
import { findPairingCode, PairingManager, type PairingVia } from './pairing.js';
import { TokenStore, type TokenRecord } from './tokenStore.js';

export type UserResolver = (userKey: string) => Promise<UserConfigEntry | null>;

export interface ExtensionAuth {
  record: TokenRecord;
  user: UserConfigEntry;
  userName: string;
}

export interface CreateJobInput {
  url: unknown;
  kind: unknown;
  playlist?: unknown;
  title?: unknown;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type PairingPollResponse =
  | { status: 'pending'; expiresAt: string }
  | { status: 'approved'; token: string; userName: string; deviceName: string }
  | { status: 'expired' };

const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 200;
const MAX_DEVICE_NAME_LENGTH = 40;
const DEFAULT_DEVICE_NAME = 'Chrome';

export function displayUserName(user: UserConfigEntry): string {
  return user.NAME?.trim() || 'ユーザー';
}

export function sanitizeDeviceName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_DEVICE_NAME;
  // 制御文字を除去し、Discord/LINEのメンションや装飾に使われにくい形にする
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f@`*_~|<>]/g, '').trim();
  return cleaned.slice(0, MAX_DEVICE_NAME_LENGTH) || DEFAULT_DEVICE_NAME;
}

/**
 * Chrome拡張機能の連携・認証・ジョブ登録をまとめるサービス
 */
export class ExtensionService {
  readonly pairing: PairingManager;
  readonly jobs: JobManager;

  constructor(
    private readonly tokenStore: TokenStore,
    private readonly resolveUser: UserResolver,
    runner: JobRunner,
    options: { now?: () => number; pairing?: PairingManager } = {}
  ) {
    this.pairing = options.pairing ?? new PairingManager(options.now);
    this.jobs = new JobManager(runner, options.now);
  }

  startPairing(
    deviceName: unknown,
    clientKey?: string
  ): { pairingId: string; code: string; expiresAt: string } {
    const result = this.pairing.start(sanitizeDeviceName(deviceName), clientKey);
    return { ...result, expiresAt: new Date(result.expiresAt).toISOString() };
  }

  /**
   * Discord/LINEのメッセージに連携コードが含まれていれば承認する。
   * @returns 返信テキスト。連携コードを含まないメッセージの場合は null
   */
  async handlePairingMessage(
    text: string,
    userId: string,
    via: PairingVia
  ): Promise<string | null> {
    const code = findPairingCode(text);
    if (!code) return null;
    return await this.approvePairingCode(code, userId, via);
  }

  /**
   * 連携コードを承認し、返信テキストを返す
   */
  async approvePairingCode(code: string, userId: string, via: PairingVia): Promise<string> {
    const user = await this.resolveUser(userId);
    if (!user) {
      return '❌ このアカウントは未登録のため、Chrome拡張機能と連携できません。';
    }

    const userName = displayUserName(user);
    const result = this.pairing.approve(code, { userKey: userId, userName, via });
    if (!result.ok) {
      return result.reason === 'already_used'
        ? '❌ この連携コードは既に使用されています。拡張機能で新しいコードを発行してください。'
        : '❌ 連携コードが無効か、有効期限（10分）が切れています。拡張機能で新しいコードを発行してください。';
    }

    console.log(
      chalk.green(`✓ Chrome拡張機能の連携を承認しました (${via}, ${userName}, 端末: ${result.deviceName})`)
    );
    return `✅ Chrome拡張機能「${result.deviceName}」を ${userName} さんのアカウントに連携しました。\n拡張機能の画面に戻ると利用を開始できます。`;
  }

  async pollPairing(pairingId: unknown): Promise<PairingPollResponse> {
    if (typeof pairingId !== 'string' || !pairingId) {
      throw new ValidationError('pairingId を指定してください。');
    }

    const result = this.pairing.poll(pairingId);
    if (result.status === 'pending') {
      return { status: 'pending', expiresAt: new Date(result.expiresAt).toISOString() };
    }
    if (result.status === 'expired') {
      return result;
    }

    let token: string;
    try {
      ({ token } = await this.tokenStore.issue({
        userKey: result.approval.userKey,
        via: result.approval.via,
        deviceName: result.deviceName,
      }));
    } catch (error) {
      // 保存に失敗しても承認は失わず、次回の確認で再試行できるようにする
      this.pairing.release(pairingId);
      throw error;
    }
    this.pairing.consume(pairingId);
    return {
      status: 'approved',
      token,
      userName: result.approval.userName,
      deviceName: result.deviceName,
    };
  }

  /**
   * アクセストークンを検証する。ユーザーが users.json から削除されている場合も無効。
   */
  async authenticate(token: string): Promise<ExtensionAuth | null> {
    const record = await this.tokenStore.find(token);
    if (!record) return null;

    const user = await this.resolveUser(record.userKey);
    if (!user) return null;

    await this.tokenStore.touch(record);
    return { record, user, userName: displayUserName(user) };
  }

  async revoke(auth: ExtensionAuth): Promise<void> {
    await this.tokenStore.revoke(auth.record.id);
    console.log(
      chalk.yellow(`⚠️ Chrome拡張機能の連携を解除しました (${auth.userName}, 端末: ${auth.record.deviceName})`)
    );
  }

  createJob(auth: ExtensionAuth, input: CreateJobInput): PublicJob {
    if (input.kind !== 'music' && input.kind !== 'video') {
      throw new ValidationError('kind には "music" か "video" を指定してください。');
    }
    const kind: JobKind = input.kind;

    if (typeof input.url !== 'string' || !input.url.trim() || input.url.length > MAX_URL_LENGTH) {
      throw new ValidationError('url を指定してください。');
    }

    const videoUrl = normalizeYouTubeVideoUrl(input.url);
    const playlistUrl = normalizeYouTubePlaylistUrl(input.url);
    const wantsPlaylist = input.playlist === true;

    let mode: 'single' | 'playlist';
    let url: string;
    if (wantsPlaylist) {
      if (!playlistUrl) {
        throw new ValidationError('URLにプレイリストが含まれていません。');
      }
      mode = 'playlist';
      url = playlistUrl;
    } else if (videoUrl) {
      mode = 'single';
      url = videoUrl;
    } else if (playlistUrl) {
      mode = 'playlist';
      url = playlistUrl;
    } else {
      throw new ValidationError('YouTubeの動画またはプレイリストのURLではありません。');
    }

    const targetPath = kind === 'video' ? auth.user.VIDEO_DL_DIR : auth.user.MUSIC_DL_DIR;
    if (!targetPath) {
      throw new ValidationError(
        kind === 'video' ? 'MusicVideoの保存先が未設定です。' : '音楽の保存先が未設定です。'
      );
    }

    const title =
      typeof input.title === 'string' ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : undefined;

    const job = this.jobs.enqueue(auth.record.userKey, { kind, mode, url, title, targetPath });
    console.log(
      chalk.blue(
        `📨 Chrome拡張機能から追加 (${auth.userName}, ${kind}/${mode}): ${url}`
      )
    );
    return job;
  }

  getJob(auth: ExtensionAuth, id: string): PublicJob | null {
    return this.jobs.get(id, auth.record.userKey);
  }
}
