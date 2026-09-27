import { createHmac, timingSafeEqual } from 'crypto';
import { createServer, type IncomingMessage, type Server } from 'http';
import { request as httpsRequest } from 'https';
import { Buffer } from 'buffer';
import { URL } from 'url';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import type { Message } from 'discord.js';
import {
  downloadAsMP3,
  downloadAsVideo,
  downloadPlaylist,
  downloadVideoPlaylist,
  getPlaylistInfo,
  getVideoInfo,
  normalizeYouTubePlaylistUrl,
  normalizeYouTubeVideoUrl,
} from '../utils/download.js';
import { formatFileSize, getAllMusicFiles, getMusicFileByIndex } from '../utils/fileManager.js';
import { getLineUserMusicPath, getLineUserVideoPath } from '../utils/userConfig.js';
import { organizeFile, setMetadataAndOrganize, updateMetadata } from '../utils/metadata.js';

const LINE_REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

interface LineWebhookConfig {
  channelSecret: string;
  channelAccessToken: string;
  port: number;
}

interface LineWebhookBody {
  events?: LineWebhookEvent[];
}

interface LineWebhookEvent {
  type?: string;
  replyToken?: string;
  source?: {
    userId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
}

interface LineDownloadOptions {
  customTitle?: string;
  customArtist?: string;
  customAlbum?: string;
  maxVideos?: number;
}

interface ParsedLineCommand {
  name: string;
  args: string[];
  options: Record<string, string>;
}

class LineApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseText: string
  ) {
    super(`LINE APIエラー (${statusCode}): ${responseText}`);
    this.name = 'LineApiError';
  }

  get isRateLimit(): boolean {
    return this.statusCode === 429;
  }
}

class LineMessenger {
  constructor(private readonly channelAccessToken: string) {}

  async replyText(replyToken: string, text: string): Promise<void> {
    await this.request(LINE_REPLY_ENDPOINT, {
      replyToken,
      messages: [
        {
          type: 'text',
          text: normalizeLineText(text),
        },
      ],
    });
  }

  async pushText(userId: string, text: string): Promise<void> {
    await this.request(LINE_PUSH_ENDPOINT, {
      to: userId,
      messages: [
        {
          type: 'text',
          text: normalizeLineText(text),
        },
      ],
    });
  }

  private async request(endpoint: string, body: Record<string, unknown>): Promise<void> {
    const payload = JSON.stringify(body);

    await new Promise<void>((resolve, reject) => {
      const endpointUrl = new URL(endpoint);

      const req = httpsRequest(
        {
          protocol: endpointUrl.protocol,
          hostname: endpointUrl.hostname,
          port: endpointUrl.port ? Number(endpointUrl.port) : 443,
          path: `${endpointUrl.pathname}${endpointUrl.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Authorization: `Bearer ${this.channelAccessToken}`,
          },
        },
        (res) => {
          let responseText = '';
          res.setEncoding('utf-8');
          res.on('data', (chunk) => {
            responseText += chunk;
          });
          res.on('end', () => {
            const statusCode = res.statusCode ?? 500;
            if (statusCode >= 200 && statusCode < 300) {
              resolve();
              return;
            }
            reject(new LineApiError(statusCode, responseText));
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

function isLineApiError(error: unknown): error is LineApiError {
  return error instanceof LineApiError;
}

async function safePushText(
  messenger: LineMessenger,
  userId: string,
  text: string,
  context: string
): Promise<boolean> {
  try {
    await messenger.pushText(userId, text);
    return true;
  } catch (error) {
    if (isLineApiError(error) && error.isRateLimit) {
      logger.warn(
        chalk.yellow(`⚠️ LINE月間上限到達のため${context}通知をスキップしました: ${error.message}`)
      );
      return false;
    }

    logger.error(chalk.red(`❌ LINE push送信失敗 (${context}):`), error);
    return false;
  }
}

function normalizeLineText(text: string): string {
  const plain = text.replace(/\*\*/g, '').replace(/`/g, '').replace(/\r/g, '').trim();
  const maxLength = 4500;
  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength)}...`;
}

function verifySignature(
  rawBody: string,
  signature: string | undefined,
  channelSecret: string
): boolean {
  if (!signature) {
    return false;
  }

  const expected = createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function extractYouTubeCandidates(text: string): string[] {
  const candidates = new Set<string>();

  const urlMatches = text.match(/https?:\/\/[^\s<>{}"']+/gi) ?? [];
  for (const match of urlMatches) {
    candidates.add(match.trim());
  }

  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim().replace(/[),.!?]+$/, ''))
    .filter(Boolean);

  for (const token of tokens) {
    if (/(?:youtu\.be\/|youtube\.com\/)/i.test(token)) {
      candidates.add(token);
    }
  }

  return Array.from(candidates);
}

function createLineDownloadMessageAdapter(): Message {
  const channel = {
    send: async () => {
      return {
        edit: async () => {},
      };
    },
  };

  return { channel } as unknown as Message;
}

async function processLineDownload(
  userId: string,
  text: string,
  musicPath: string,
  videoPath: string,
  messenger: LineMessenger,
  options?: LineDownloadOptions
): Promise<void> {
  const candidates = extractYouTubeCandidates(text);
  const isVideo = text.includes('動画');
  const targetPath = isVideo ? videoPath : musicPath;

  const playlistUrl = candidates
    .map((candidate) => normalizeYouTubePlaylistUrl(candidate))
    .find((url): url is string => Boolean(url));

  if (playlistUrl) {
    const playlistInfo = await getPlaylistInfo(playlistUrl, options?.maxVideos);
    if (playlistInfo.videos.length === 0) {
      throw new Error('プレイリストに動画が見つかりませんでした。');
    }

    const messageAdapter = createLineDownloadMessageAdapter();
    const result = isVideo
      ? await downloadVideoPlaylist(playlistInfo, messageAdapter, targetPath)
      : await downloadPlaylist(
          playlistInfo,
          messageAdapter,
          targetPath,
          options?.customAlbum,
          options?.customArtist
        );

    const successCount = result.successful.length;
    const skippedCount = result.skipped.length;
    const failedCount = result.failed.length;

    let summary = `${isVideo ? '🎬' : '🎵'} プレイリストのダウンロード${failedCount > 0 ? 'に失敗しました' : 'が完了しました'}\n`;
    summary += `✅ 成功: ${successCount}件\n`;
    summary += `⏭️ スキップ: ${skippedCount}件\n`;
    summary += `❌ 失敗: ${failedCount}件\n`;
    summary += `💾 合計サイズ: ${formatFileSize(result.totalSize)}`;

    if (failedCount > 0) {
      summary += '\n\n失敗内容:\n';
      for (const failure of result.failed.slice(0, 5)) {
        summary += `・${failure.video.title}: ${failure.error}\n`;
      }
    }

    await safePushText(messenger, userId, summary, 'ダウンロード完了');
    return;
  }

  const videoUrl = candidates
    .map((candidate) => normalizeYouTubeVideoUrl(candidate))
    .find((url): url is string => Boolean(url));

  if (!videoUrl) {
    await messenger.pushText(userId, '❌ YouTube動画またはプレイリストURLが見つかりませんでした。');
    return;
  }

  const videoInfo = await getVideoInfo(videoUrl);
  const messageAdapter = createLineDownloadMessageAdapter();
  const result = isVideo
    ? await downloadAsVideo(videoUrl, videoInfo, messageAdapter, targetPath)
    : await downloadAsMP3(videoUrl, videoInfo, messageAdapter, targetPath, {
        title: options?.customTitle,
        artist: options?.customArtist,
        album: options?.customAlbum,
      });

  if (result.skipped) {
    await safePushText(
      messenger,
      userId,
      `⏭️ ダウンロードが完了しました（既存ファイルをスキップ）\n${result.filename}`,
      'ダウンロード完了'
    );
  } else {
    await safePushText(
      messenger,
      userId,
      `✅ ダウンロードが完了しました\n${result.filename}\n💾 ${(result.size / 1024 / 1024).toFixed(2)} MB`,
      'ダウンロード完了'
    );
  }
}

function parseKeyValueOptions(text: string): {
  options: Record<string, string>;
  withoutOptions: string;
} {
  const options: Record<string, string> = {};
  const optionRegex = /([a-zA-Z_]+)=((?:"[^"]+")|(?:'[^']+')|(?:[^\s]+))/g;

  let match: RegExpExecArray | null;
  while ((match = optionRegex.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const rawValue = match[2].trim();
    options[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }

  const withoutOptions = text.replace(optionRegex, ' ').replace(/\s+/g, ' ').trim();
  return { options, withoutOptions };
}

function parseLineCommand(text: string): ParsedLineCommand | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const { options, withoutOptions } = parseKeyValueOptions(normalized);
  const args = withoutOptions.split(/\s+/).filter(Boolean);

  if (args.length === 0) {
    return null;
  }

  const name = args[0].toLowerCase();
  const supported = ['help', 'list', 'delete', 'edit', 'artists', 'add', 'add_list', 'id'];
  if (!supported.includes(name)) {
    return null;
  }

  return {
    name,
    args,
    options,
  };
}

async function handleLineHelp(userId: string, messenger: LineMessenger): Promise<void> {
  const message = [
    '🎵 TubeJelly LINEコマンド',
    '',
    '・URLだけ送信: 音楽をダウンロード',
    '・動画 URL: MusicVideoをMP4でダウンロード（最大1080p）',
    '・add URL [title=] [artist=] [album=]',
    '・add_list URL [artist=] [album=] [max=10]',
    '・list [page=1]',
    '・delete index=3',
    '・edit index=3 title=新題名 artist=新アーティスト album=新アルバム',
    '・artists list',
    '・artists rename old=旧名 new=新名',
    '・id (自分のLINE ID確認)',
  ].join('\n');

  await messenger.pushText(userId, message);
}

async function handleLineList(
  userId: string,
  messenger: LineMessenger,
  musicPath: string,
  args: string[],
  options: Record<string, string>
): Promise<void> {
  const pageFromArgs = args[1] ? Number(args[1]) : Number.NaN;
  const pageFromOption = options.page ? Number(options.page) : Number.NaN;
  const page = Number.isFinite(pageFromOption)
    ? pageFromOption
    : Number.isFinite(pageFromArgs)
      ? pageFromArgs
      : 1;

  const files = await getAllMusicFiles(musicPath);
  if (files.length === 0) {
    await messenger.pushText(userId, '📂 音楽ライブラリは空です。');
    return;
  }

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(files.length / itemsPerPage));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(page)));
  const startIndex = (safePage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, files.length);

  let message = `📚 音楽ライブラリ (${files.length}曲)\nページ ${safePage}/${totalPages}\n\n`;
  for (let i = startIndex; i < endIndex; i++) {
    const file = files[i];
    message += `${file.index}. ${file.filename}\n`;
    const metadata = [];
    if (file.title) metadata.push(`🎵 ${file.title}`);
    if (file.artist) metadata.push(`👤 ${file.artist}`);
    if (file.album) metadata.push(`💿 ${file.album}`);
    if (metadata.length > 0) {
      message += `   ${metadata.join(' | ')}\n`;
    }
    message += `   💾 ${formatFileSize(file.size)}\n\n`;
  }

  if (safePage < totalPages) {
    message += `次のページ: list page=${safePage + 1}`;
  }

  await messenger.pushText(userId, message);
}

async function handleLineDelete(
  userId: string,
  messenger: LineMessenger,
  musicPath: string,
  args: string[],
  options: Record<string, string>
): Promise<void> {
  const indexFromArgs = args[1] ? Number(args[1]) : Number.NaN;
  const indexFromOption = options.index ? Number(options.index) : Number.NaN;
  const index = Number.isFinite(indexFromOption)
    ? indexFromOption
    : Number.isFinite(indexFromArgs)
      ? indexFromArgs
      : Number.NaN;

  if (!Number.isFinite(index) || index <= 0) {
    await messenger.pushText(userId, '❌ 削除する曲番号を指定してください。例: delete index=3');
    return;
  }

  const file = await getMusicFileByIndex(Math.floor(index), musicPath);
  if (!file) {
    await messenger.pushText(userId, `❌ 番号 ${Math.floor(index)} の曲が見つかりません。`);
    return;
  }

  await fs.unlink(file.path);
  await messenger.pushText(userId, `✅ 削除完了\n${file.filename}`);
}

async function handleLineEdit(
  userId: string,
  messenger: LineMessenger,
  musicPath: string,
  args: string[],
  options: Record<string, string>
): Promise<void> {
  const indexFromArgs = args[1] ? Number(args[1]) : Number.NaN;
  const indexFromOption = options.index ? Number(options.index) : Number.NaN;
  const index = Number.isFinite(indexFromOption)
    ? indexFromOption
    : Number.isFinite(indexFromArgs)
      ? indexFromArgs
      : Number.NaN;

  if (!Number.isFinite(index) || index <= 0) {
    await messenger.pushText(
      userId,
      '❌ 編集する曲番号を指定してください。例: edit index=3 title=新題名'
    );
    return;
  }

  const newTitle = options.title;
  const newArtist = options.artist;
  const newAlbum = options.album;

  if (!newTitle && !newArtist && !newAlbum) {
    await messenger.pushText(
      userId,
      '❌ title / artist / album のいずれかを指定してください。例: edit index=3 artist=新名'
    );
    return;
  }

  const file = await getMusicFileByIndex(Math.floor(index), musicPath);
  if (!file) {
    await messenger.pushText(userId, `❌ 番号 ${Math.floor(index)} の曲が見つかりません。`);
    return;
  }

  const metadata = {
    title: newTitle || file.title || file.filename.replace('.mp3', ''),
    artist: newArtist || file.artist || 'Unknown Artist',
    album: newAlbum || file.album,
  };

  const result = await setMetadataAndOrganize(file.path, metadata, musicPath);
  if (!result.success) {
    await messenger.pushText(userId, `❌ メタデータ更新に失敗: ${result.error}`);
    return;
  }

  await messenger.pushText(
    userId,
    `✅ メタデータ更新完了\n${file.filename}\n${result.newPath ? `移動先: ${result.newPath}` : ''}`
  );
}

async function handleLineArtists(
  userId: string,
  messenger: LineMessenger,
  musicPath: string,
  args: string[],
  options: Record<string, string>
): Promise<void> {
  const subCommand = (args[1] || 'list').toLowerCase();

  if (subCommand === 'list') {
    const files = await getAllMusicFiles(musicPath);
    if (files.length === 0) {
      await messenger.pushText(userId, '📂 音楽ライブラリは空です。');
      return;
    }

    const artistMap = new Map<string, number>();
    for (const file of files) {
      const artist = file.artist || 'Unknown Artist';
      artistMap.set(artist, (artistMap.get(artist) || 0) + 1);
    }

    const sorted = Array.from(artistMap.entries()).sort((a, b) => b[1] - a[1]);
    let message = `🎤 アーティスト一覧 (${sorted.length}件)\n\n`;
    for (let i = 0; i < Math.min(sorted.length, 30); i++) {
      const [artist, count] = sorted[i];
      message += `${i + 1}. ${artist} (${count}曲)\n`;
    }
    if (sorted.length > 30) {
      message += `\n...他 ${sorted.length - 30} 件`;
    }
    await messenger.pushText(userId, message);
    return;
  }

  if (subCommand !== 'rename') {
    await messenger.pushText(
      userId,
      '❌ artists list または artists rename old=旧名 new=新名 を使用してください。'
    );
    return;
  }

  const oldName = options.old;
  const newName = options.new;

  if (!oldName || !newName) {
    await messenger.pushText(
      userId,
      '❌ old と new を指定してください。例: artists rename old=旧名 new=新名'
    );
    return;
  }

  const files = await getAllMusicFiles(musicPath);
  const targetFiles = files.filter(
    (file) => file.artist === oldName || (!file.artist && oldName === 'Unknown Artist')
  );

  if (targetFiles.length === 0) {
    await messenger.pushText(userId, `❌ アーティスト「${oldName}」の曲が見つかりません。`);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const file of targetFiles) {
    try {
      const metadata = {
        title: file.title || file.filename.replace('.mp3', ''),
        artist: newName,
        album: file.album,
      };

      const updateSuccess = await updateMetadata(file.path, metadata);
      if (!updateSuccess) {
        failCount++;
        continue;
      }

      if (file.album && file.title) {
        try {
          await organizeFile(file.path, newName, file.album, file.title, musicPath);
        } catch {
          // ファイル移動失敗はメタデータ更新成功扱い
        }
      }

      successCount++;
    } catch {
      failCount++;
    }
  }

  await messenger.pushText(
    userId,
    `✅ アーティスト名変更完了\n${oldName} → ${newName}\n成功: ${successCount}件\n失敗: ${failCount}件`
  );
}

async function handleLineCommand(
  parsed: ParsedLineCommand,
  userId: string,
  replyToken: string,
  musicPath: string,
  videoPath: string,
  messenger: LineMessenger,
  rawText: string
): Promise<boolean> {
  if (parsed.name === 'help') {
    await messenger.replyText(replyToken, '📘 ヘルプを表示します。');
    await handleLineHelp(userId, messenger);
    return true;
  }

  if (parsed.name === 'id') {
    await messenger.replyText(replyToken, '🪪 あなたのLINE IDを返します。');
    await messenger.pushText(userId, `LINE ID: ${userId}`);
    return true;
  }

  const runWithAck = async (ackText: string, runner: () => Promise<void>) => {
    await messenger.replyText(replyToken, ackText);
    void runner().catch(async (error) => {
      logger.error(chalk.red('❌ LINEコマンド処理エラー:'), error);
      await safePushText(
        messenger,
        userId,
        `❌ コマンド処理に失敗しました。\n${error instanceof Error ? error.message : String(error)}`,
        'コマンド失敗'
      );
    });
  };

  if (parsed.name === 'list') {
    await runWithAck('📚 一覧を取得します。', async () => {
      await handleLineList(userId, messenger, musicPath, parsed.args, parsed.options);
    });
    return true;
  }

  if (parsed.name === 'delete') {
    await runWithAck('🗑️ 削除を実行します。', async () => {
      await handleLineDelete(userId, messenger, musicPath, parsed.args, parsed.options);
    });
    return true;
  }

  if (parsed.name === 'edit') {
    await runWithAck('✏️ メタデータ編集を実行します。', async () => {
      await handleLineEdit(userId, messenger, musicPath, parsed.args, parsed.options);
    });
    return true;
  }

  if (parsed.name === 'artists') {
    await runWithAck('🎤 アーティスト処理を実行します。', async () => {
      await handleLineArtists(userId, messenger, musicPath, parsed.args, parsed.options);
    });
    return true;
  }

  if (parsed.name === 'add' || parsed.name === 'add_list') {
    const maxVideos = parsed.options.max ? Number(parsed.options.max) : undefined;
    const downloadOptions: LineDownloadOptions = {
      customTitle: parsed.options.title,
      customArtist: parsed.options.artist,
      customAlbum: parsed.options.album,
      maxVideos: Number.isFinite(maxVideos) ? Math.max(1, Math.floor(maxVideos!)) : undefined,
    };

    await runWithAck('📨 受け付けました。', async () => {
      const textForDownload = parsed.name === 'add_list' ? rawText : rawText;
      await processLineDownload(
        userId,
        textForDownload,
        musicPath,
        videoPath,
        messenger,
        downloadOptions
      );
    });
    return true;
  }

  return false;
}

async function handleLineEvent(event: LineWebhookEvent, messenger: LineMessenger): Promise<void> {
  if (event.type !== 'message' || !event.replyToken) {
    return;
  }

  const lineIdForLog = event.source?.userId ?? 'unknown';
  const messageTypeForLog = event.message?.type ?? 'unknown';
  const textPreview =
    typeof event.message?.text === 'string'
      ? event.message.text.replace(/\s+/g, ' ').trim().slice(0, 120)
      : '(text以外)';

  logger.info(
    chalk.cyan(
      `📨 チャットを受信しました（LINEID：${lineIdForLog}, type: ${messageTypeForLog}） ${textPreview}`
    )
  );

  const userId = event.source?.userId;
  if (!userId) {
    await messenger.replyText(
      event.replyToken,
      '❌ ユーザーIDを取得できませんでした。1対1のトークで送信してください。'
    );
    return;
  }

  if (event.message?.type !== 'text' || typeof event.message.text !== 'string') {
    await messenger.replyText(
      event.replyToken,
      'YouTubeの動画URL・ライブURL・プレイリストURLをテキストで送信してください。'
    );
    return;
  }

  const musicPath = await getLineUserMusicPath(userId);
  const videoPath = await getLineUserVideoPath(userId);
  if (!musicPath || !videoPath) {
    await messenger.replyText(
      event.replyToken,
      '❌ このLINEアカウントは未登録です。管理者にLINE User IDの登録を依頼してください。'
    );
    return;
  }

  const parsedCommand = parseLineCommand(event.message.text);
  if (parsedCommand) {
    const handled = await handleLineCommand(
      parsedCommand,
      userId,
      event.replyToken,
      musicPath,
      videoPath,
      messenger,
      event.message.text
    );

    if (handled) {
      return;
    }
  }

  const candidates = extractYouTubeCandidates(event.message.text);
  if (candidates.length === 0) {
    await messenger.replyText(
      event.replyToken,
      '❌ URLが見つかりませんでした。YouTube URLをそのまま貼り付けて送信してください。'
    );
    return;
  }

  await messenger.replyText(event.replyToken, '📨 受け付けました。');

  void processLineDownload(userId, event.message.text, musicPath, videoPath, messenger).catch(
    async (error) => {
      logger.error(chalk.red('❌ LINEダウンロード処理エラー:'), error);
      await safePushText(
        messenger,
        userId,
        `❌ ダウンロード処理に失敗しました。\n${
          error instanceof Error ? error.message : String(error)
        }`,
        'ダウンロード失敗'
      );
    }
  );
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > 1024 * 1024) {
        reject(new Error('Webhook payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', reject);
  });
}

export function startLineWebhookServer(config: LineWebhookConfig): Server {
  const messenger = new LineMessenger(config.channelAccessToken);

  const server = createServer(async (req, res) => {
    const requestPath = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && requestPath === '/line/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== 'POST' || requestPath !== '/line/webhook') {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    try {
      const rawBody = await readRawBody(req);
      const signatureHeader = req.headers['x-line-signature'];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

      if (!verifySignature(rawBody, signature, config.channelSecret)) {
        logger.warn(chalk.yellow('⚠️ LINE署名検証に失敗しました'));
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }

      const body = JSON.parse(rawBody) as LineWebhookBody;
      const events = body.events ?? [];

      for (const event of events) {
        try {
          await handleLineEvent(event, messenger);
        } catch (error) {
          if (isLineApiError(error) && error.isRateLimit) {
            logger.warn(
              chalk.yellow(`⚠️ LINE API上限到達のためイベント処理通知をスキップ: ${error.message}`)
            );
            continue;
          }

          logger.error(chalk.red('❌ LINEイベント処理エラー:'), error);
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      logger.error(chalk.red('❌ LINE Webhook処理エラー:'), error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.listen(config.port, () => {
    logger.info(
      chalk.green(`✓ LINE Webhook サーバー起動: http://0.0.0.0:${config.port}/line/webhook`)
    );
  });

  return server;
}
