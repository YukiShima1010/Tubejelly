import { execa } from 'execa';
import { promises as fs } from 'fs';
import { Buffer } from 'buffer';
import path from 'path';
import type { Message } from 'discord.js';
import type { VideoInfo, PlaylistInfo, DownloadResult, BatchDownloadResult } from '../types.js';
import { checkFileExists, getFileSize, formatFileSize, formatDuration } from './fileManager.js';
import { updateMetadata } from './metadata.js';

// YouTube URLのパターン
export const YOUTUBE_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
export const YOUTUBE_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:playlist\?list=|watch\?.*&list=)([a-zA-Z0-9_-]+)/;

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
      videoId: info.id || url.split('v=')[1]?.substring(0, 11) || 'unknown',
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

  // ファイル名を構築
  let outputPath: string;
  if (finalAlbum && finalArtist) {
    // アーティスト/アルバム/曲名.mp3 の構造
    const artistDir = path.join(basePath, sanitize(finalArtist));
    const albumDir = path.join(artistDir, sanitize(finalAlbum));

    // ディレクトリを作成
    await fs.mkdir(albumDir, { recursive: true });

    const filename = `${sanitize(finalTitle)}.mp3`;
    outputPath = path.join(albumDir, filename);
  } else {
    // 従来の形式: アーティスト - 曲名.mp3
    const filename = `${sanitize(finalArtist)} - ${sanitize(finalTitle)}.mp3`;
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