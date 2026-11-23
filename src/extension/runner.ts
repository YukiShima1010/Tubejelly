import type { Message } from 'discord.js';
import {
  downloadAsMP3,
  downloadAsVideo,
  downloadPlaylist,
  downloadVideoPlaylist,
  getPlaylistInfo,
  getVideoInfo,
} from '../utils/download.js';
import { formatFileSize } from '../utils/fileManager.js';
import type { JobContext, JobResult, JobRunner, JobSpec } from './jobs.js';

/** 進捗バー（[████░░░░]）の行 */
const PROGRESS_BAR_LINE = /^\[[█░]+\]$/;

/**
 * Discord/LINE向けの進捗メッセージをログ1行に整形する
 */
export function formatProgressMessage(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !PROGRESS_BAR_LINE.test(line))
    .join(' / ');
}

/**
 * download.ts が送る進捗メッセージ（send / edit）をジョブログに流す Message 互換アダプター
 */
export function createLogMessageAdapter(ctx: JobContext): Message {
  const send = async (text: string) => {
    ctx.log(formatProgressMessage(String(text)));
    return {
      edit: async (edited: string) => {
        ctx.log(formatProgressMessage(String(edited)));
      },
    };
  };

  return { channel: { send } } as unknown as Message;
}

/**
 * 既存のダウンロード処理を使ってジョブを実行する
 */
export const runDownloadJob: JobRunner = async (
  spec: JobSpec,
  ctx: JobContext
): Promise<JobResult> => {
  const message = createLogMessageAdapter(ctx);
  const isVideo = spec.kind === 'video';

  if (spec.mode === 'playlist') {
    ctx.log('🔎 プレイリスト情報を取得しています...');
    const playlistInfo = await getPlaylistInfo(spec.url);
    if (playlistInfo.videos.length === 0) {
      throw new Error('プレイリストに動画が見つかりませんでした。');
    }
    ctx.log(`📃 ${playlistInfo.videos.length}件の動画が見つかりました。`);

    const result = isVideo
      ? await downloadVideoPlaylist(playlistInfo, message, spec.targetPath)
      : await downloadPlaylist(playlistInfo, message, spec.targetPath);

    for (const failure of result.failed) {
      ctx.log(`❌ ${failure.video.title}: ${failure.error}`, 'error');
    }
    ctx.log(
      `📊 成功 ${result.successful.length}件 / スキップ ${result.skipped.length}件 / 失敗 ${result.failed.length}件 / 合計 ${formatFileSize(result.totalSize)}`
    );

    return {
      skipped: result.successful.length === 0 && result.failed.length === 0,
      size: result.totalSize,
      successCount: result.successful.length,
      skippedCount: result.skipped.length,
      failedCount: result.failed.length,
    };
  }

  ctx.log('🔎 動画情報を取得しています...');
  const videoInfo = await getVideoInfo(spec.url);
  ctx.setTitle(videoInfo.title);

  const result = isVideo
    ? await downloadAsVideo(spec.url, videoInfo, message, spec.targetPath)
    : await downloadAsMP3(spec.url, videoInfo, message, spec.targetPath);

  ctx.log(`💾 ${result.filename} (${formatFileSize(result.size)})`);

  return {
    skipped: Boolean(result.skipped),
    filename: result.filename,
    size: result.size,
    successCount: result.skipped ? 0 : 1,
    skippedCount: result.skipped ? 1 : 0,
    failedCount: 0,
  };
};
