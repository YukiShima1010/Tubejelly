import { execa } from 'execa';
import { promises as fs } from 'fs';
import { Buffer } from 'buffer';
import path from 'path';
import { URL } from 'url';
import type { Message } from 'discord.js';
import type { VideoInfo, PlaylistInfo, DownloadResult, BatchDownloadResult } from '../types.js';
import { checkFileExists, getFileSize, formatFileSize, formatDuration } from './fileManager.js';
import { updateMetadata } from './metadata.js';

// YouTube URLのパターン
export const YOUTUBE_URL_REGEX = /(?:youtube\.com|youtu\.be)\//i;
export const YOUTUBE_PLAYLIST_REGEX =
  /(?:youtube\.com\/.+\?.*list=|youtube\.com\/playlist\?list=)/i;

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_PLAYLIST_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_DOWNLOAD_TITLE_BYTES = 180;

function ensureUrlProtocol(input: string): string {
  const trimmed = input.trim();
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  if (/^(?:www\.)?(?:m\.)?(?:music\.)?(?:youtube\.com|youtu\.be)\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function isYouTubeHost(hostname: string): boolean {
  return (
    hostname === 'youtu.be' ||
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtube-nocookie.com' ||
    hostname.endsWith('.youtube-nocookie.com')
  );
}

function extractVideoIdFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const [prefix, id] = parts;
  if (['shorts', 'live', 'embed', 'v'].includes(prefix) && YOUTUBE_VIDEO_ID_REGEX.test(id)) {
    return id;
  }

  return null;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';

  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > maxBytes) {
      break;
    }
    result += character;
  }

  return result.trim();
}

export function createDownloadTitle(title: string, artist?: string): string {
  const sanitizedTitle = title
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const artistPrefix = artist
    ? new RegExp(`^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:[-–—|/:：／]\\s*)`, 'i')
    : null;
  const titleWithoutArtist = artistPrefix ? sanitizedTitle.replace(artistPrefix, '') : sanitizedTitle;
  const result = titleWithoutArtist || sanitizedTitle || title.trim() || 'Unknown Title';

  return truncateUtf8(result, MAX_DOWNLOAD_TITLE_BYTES) || 'Unknown Title';
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  const normalizedInput = ensureUrlProtocol(trimmed);

  try {
    const url = new URL(normalizedInput);
    const hostname = url.hostname.toLowerCase();

    if (!isYouTubeHost(hostname)) {
      return null;
    }

    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
    }

    const videoId = url.searchParams.get('v');
    if (videoId && YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
      return videoId;
    }

    return extractVideoIdFromPath(url.pathname);
  } catch {
    const fallback = normalizedInput.match(
      /(?:v=|youtu\.be\/|\/(?:shorts|live|embed|v)\/)([a-zA-Z0-9_-]{11})/i
    );
    return fallback ? fallback[1] : null;
  }
}

export function normalizeYouTubeVideoUrl(input: string): string | null {
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) {
    return null;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function extractYouTubePlaylistId(input: string): string | null {
  const normalizedInput = ensureUrlProtocol(input);

  try {
    const url = new URL(normalizedInput);
    const hostname = url.hostname.toLowerCase();
    if (!isYouTubeHost(hostname)) {
      return null;
    }

    const listId = url.searchParams.get('list');
    if (listId && YOUTUBE_PLAYLIST_ID_REGEX.test(listId)) {
      return listId;
    }
  } catch {
    const fallback = normalizedInput.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    return fallback ? fallback[1] : null;
  }

  return null;
}

export function normalizeYouTubePlaylistUrl(input: string): string | null {
  const listId = extractYouTubePlaylistId(input);
  if (!listId) {
    return null;
  }
  return `https://www.youtube.com/playlist?list=${listId}`;
}

/**
 * YouTube動画情報の取得
 */
export async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const { stdout } = await execa('yt-dlp', ['--dump-json', '--no-playlist', url]);
    const info = JSON.parse(stdout);

    return {
      title: info.title || 'Unknown Title',
      author: info.uploader || info.channel || 'Unknown Author',
      duration: Math.floor(info.duration || 0),
      videoId: info.id || extractYouTubeVideoId(url) || 'unknown',
    };
  } catch (error) {
    throw new Error(
      `動画情報の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * プレイリスト情報の取得
 */
export async function getPlaylistInfo(url: string, maxVideos?: number): Promise<PlaylistInfo> {
  try {
    const args = ['--dump-json', '--flat-playlist', url];
    if (maxVideos) {
      args.push('--playlist-end', maxVideos.toString());
    }

    const { stdout } = await execa('yt-dlp', args);
    const lines = stdout.trim().split('\n');
    const videos: VideoInfo[] = [];

    for (const line of lines) {
      try {
        const info = JSON.parse(line);
        videos.push({
          title: info.title || 'Unknown Title',
          author: info.uploader || info.channel || 'Unknown Author',
          duration: Math.floor(info.duration || 0),
          videoId: info.id || 'unknown',
        });
      } catch {
        // JSON パースエラーは無視
      }
    }

    return {
      title: videos.length > 0 ? 'YouTube Playlist' : 'Unknown Playlist',
      videoCount: videos.length,
      videos: videos,
    };
  } catch (error) {
    throw new Error(
      `プレイリスト情報の取得に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * MP3としてダウンロード
 */
export async function downloadAsMP3(
  url: string,
  videoInfo: VideoInfo,
  message: Message,
  basePath: string,
  customMetadata?: { title?: string; artist?: string; album?: string },
  progressPrefix = ''
): Promise<DownloadResult> {
  const sanitize = (str: string) =>
    str
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

  // メタデータが指定されている場合はそれを使用
  const finalTitle = customMetadata?.title || videoInfo.title;
  const finalArtist = customMetadata?.artist || videoInfo.author;
  const finalAlbum = customMetadata?.album;
  const downloadTitle = createDownloadTitle(finalTitle, finalArtist);

  // ファイル名を構築
  let outputPath: string;
  if (finalAlbum && finalArtist) {
    // アーティスト/アルバム/曲名.mp3 の構造
    const artistDir = path.join(basePath, sanitize(finalArtist));
    const albumDir = path.join(artistDir, sanitize(finalAlbum));

    // ディレクトリを作成
    await fs.mkdir(albumDir, { recursive: true });

    const filename = `${sanitize(downloadTitle)}.mp3`;
    outputPath = path.join(albumDir, filename);
  } else {
    const filename = `${sanitize(downloadTitle)}.mp3`;
    outputPath = path.join(basePath, filename);
  }

  // 重複チェック
  const fileExists = await checkFileExists(outputPath);
  if (fileExists) {
    const existingSize = await getFileSize(outputPath);

    if (!message.channel || !('send' in message.channel)) {
      throw new Error('メッセージの送信ができません');
    }

    await message.channel.send(
      `${progressPrefix}⏭️ スキップ（既に存在します）\n` + `📦 ${formatFileSize(existingSize)}`
    );

    return {
      filename: path.basename(outputPath),
      path: outputPath,
      size: existingSize,
      skipped: true,
    };
  }

  // 進捗メッセージ
  if (!message.channel || !('send' in message.channel)) {
    throw new Error('メッセージの送信ができません');
  }

  const progressMsg = await message.channel.send(
    `${progressPrefix}🎵 **${finalTitle}**\n` +
      `👤 ${finalArtist}${finalAlbum ? ` | 💿 ${finalAlbum}` : ''} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
      `📥 ダウンロード開始...`
  );

  try {
    // yt-dlpでダウンロード（MP3に直接変換）
    const ytDlpProcess = execa('yt-dlp', [
      '--js-runtimes',
      'deno',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--embed-metadata',
      '--add-metadata',
      '--embed-thumbnail',
      '--output',
      outputPath.replace('.mp3', '.%(ext)s'),
      '--no-playlist',
      '--progress',
      '--newline',
      url,
    ]);

    let lastProgress = '';

    ytDlpProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);

      if (progressMatch && progressMatch[1] !== lastProgress) {
        lastProgress = progressMatch[1];
        const percent = parseFloat(progressMatch[1]);

        if (percent % 20 < 1) {
          const progressBar =
            '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
          progressMsg
            .edit(
              `${progressPrefix}🎵 **${finalTitle}**\n` +
                `👤 ${finalArtist}${finalAlbum ? ` | 💿 ${finalAlbum}` : ''} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
                `📥 ダウンロード中: ${Math.floor(percent)}%\n` +
                `[${progressBar}]`
            )
            .catch(() => {});
        }
      }
    });

    await ytDlpProcess;

    // カスタムメタデータがある場合は上書き
    if (customMetadata) {
      await updateMetadata(outputPath, {
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
      });
    }

    await progressMsg.edit(
      `${progressPrefix}✅ **${finalTitle}**\n` +
        `👤 ${finalArtist}${finalAlbum ? ` | 💿 ${finalAlbum}` : ''} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
        `✨ ダウンロード完了！`
    );

    const stats = await fs.stat(outputPath);

    return {
      filename: path.basename(outputPath),
      path: outputPath,
      size: stats.size,
      skipped: false,
    };
  } catch (error) {
    await progressMsg.edit(
      `${progressPrefix}❌ **${finalTitle}**\n` + `👤 ${finalArtist}\n` + `⚠️ ダウンロード失敗`
    );
    throw new Error(
      `ダウンロードエラー: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function downloadAsVideo(
  url: string,
  videoInfo: VideoInfo,
  message: Message,
  basePath: string,
  progressPrefix = ''
): Promise<DownloadResult> {
  const sanitize = (value: string) =>
    value
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  const title = createDownloadTitle(videoInfo.title, videoInfo.author);
  const outputPath = path.join(basePath, `${sanitize(title)}.mp4`);

  if (!message.channel || !('send' in message.channel)) {
    throw new Error('メッセージの送信ができません');
  }

  if (await checkFileExists(outputPath)) {
    const existingSize = await getFileSize(outputPath);
    await message.channel.send(
      `${progressPrefix}⏭️ スキップ（既に存在します）\n` + `📦 ${formatFileSize(existingSize)}`
    );
    return {
      filename: path.basename(outputPath),
      path: outputPath,
      size: existingSize,
      skipped: true,
    };
  }

  const progressMsg = await message.channel.send(
    `${progressPrefix}🎬 **${videoInfo.title}**\n` +
      `👤 ${videoInfo.author} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
      `📥 ダウンロード開始...`
  );

  try {
    const ytDlpProcess = execa('yt-dlp', [
      '--js-runtimes',
      'deno',
      '--format',
      'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      '--merge-output-format',
      'mp4',
      '--output',
      outputPath,
      '--no-playlist',
      '--progress',
      '--newline',
      url,
    ]);

    let lastProgress = '';
    ytDlpProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);

      if (progressMatch && progressMatch[1] !== lastProgress) {
        lastProgress = progressMatch[1];
        const percent = parseFloat(progressMatch[1]);
        if (percent % 20 < 1) {
          const progressBar =
            '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
          progressMsg
            .edit(
              `${progressPrefix}🎬 **${videoInfo.title}**\n` +
                `📥 ダウンロード中: ${Math.floor(percent)}%\n` +
                `[${progressBar}]`
            )
            .catch(() => {});
        }
      }
    });

    await ytDlpProcess;
    await progressMsg.edit(`${progressPrefix}✅ **${videoInfo.title}**\n✨ ダウンロード完了！`);

    const stats = await fs.stat(outputPath);
    return {
      filename: path.basename(outputPath),
      path: outputPath,
      size: stats.size,
      skipped: false,
    };
  } catch (error) {
    await progressMsg.edit(`${progressPrefix}❌ **${videoInfo.title}**\n⚠️ ダウンロード失敗`);
    throw new Error(
      `動画ダウンロードエラー: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * プレイリストの一括ダウンロード
 */
export async function downloadPlaylist(
  playlistInfo: PlaylistInfo,
  message: Message,
  basePath: string,
  customAlbum?: string,
  customArtist?: string
): Promise<BatchDownloadResult> {
  const result: BatchDownloadResult = {
    successful: [],
    failed: [],
    skipped: [],
    totalSize: 0,
  };

  const totalVideos = playlistInfo.videos.length;

  for (let i = 0; i < totalVideos; i++) {
    const video = playlistInfo.videos[i];
    const progressPrefix = `[${i + 1}/${totalVideos}] `;

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

      // プレイリストの場合、カスタムアルバム名・アーティスト名を使用
      const metadata: { album?: string; artist?: string } = {};
      if (customAlbum) metadata.album = customAlbum;
      if (customArtist) metadata.artist = customArtist;
      const hasMetadata = Object.keys(metadata).length > 0;

      const downloadResult = await downloadAsMP3(
        videoUrl,
        video,
        message,
        basePath,
        hasMetadata ? metadata : undefined,
        progressPrefix
      );

      if (downloadResult.skipped) {
        result.skipped.push(downloadResult);
      } else {
        result.successful.push(downloadResult);
      }

      result.totalSize += downloadResult.size;
    } catch (error) {
      result.failed.push({
        video,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export async function downloadVideoPlaylist(
  playlistInfo: PlaylistInfo,
  message: Message,
  basePath: string
): Promise<BatchDownloadResult> {
  const result: BatchDownloadResult = {
    successful: [],
    failed: [],
    skipped: [],
    totalSize: 0,
  };

  for (let i = 0; i < playlistInfo.videos.length; i++) {
    const video = playlistInfo.videos[i];
    try {
      const downloadResult = await downloadAsVideo(
        `https://www.youtube.com/watch?v=${video.videoId}`,
        video,
        message,
        basePath,
        `[${i + 1}/${playlistInfo.videos.length}] `
      );

      if (downloadResult.skipped) {
        result.skipped.push(downloadResult);
      } else {
        result.successful.push(downloadResult);
      }
      result.totalSize += downloadResult.size;
    } catch (error) {
      result.failed.push({
        video,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}