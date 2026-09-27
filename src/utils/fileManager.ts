import { promises as fs } from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';
import type { MusicFileInfo, MusicMetadata, VideoFileInfo } from '../types.js';
import { logger } from './logger.js';

/**
 * ファイル名のサニタイズ
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ファイルの存在確認
 */
export async function checkFileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ファイルサイズの取得
 */
export async function getFileSize(filepath: string): Promise<number> {
  try {
    const stats = await fs.stat(filepath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * ファイルサイズのフォーマット
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 時間のフォーマット
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * 音楽ディレクトリ内のすべてのMP3ファイルを取得
 */
export async function getAllMusicFiles(basePath: string): Promise<MusicFileInfo[]> {
  const files: MusicFileInfo[] = [];

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
          const size = await getFileSize(fullPath);

          // メタデータを読み取り
          let metadata: MusicMetadata = {};
          try {
            const tags = NodeID3.read(fullPath);
            if (tags) {
              metadata = {
                title: tags.title,
                artist: tags.artist,
                album: tags.album,
              };
            }
          } catch {
            // メタデータ読み取り失敗は無視
          }

          files.push({
            index: 0, // 後で設定
            filename: entry.name,
            path: fullPath,
            size,
            ...metadata,
          });
        }
      }
    } catch (error) {
      logger.error(`ディレクトリスキャンエラー: ${dirPath}`, error);
    }
  }

  await scanDirectory(basePath);

  // ファイル名でソートしてインデックスを設定
  files.sort((a, b) => a.filename.localeCompare(b.filename));
  files.forEach((file, index) => {
    file.index = index + 1;
  });

  return files;
}

/**
 * インデックスから音楽ファイルを取得
 */
export async function getMusicFileByIndex(
  index: number,
  basePath: string
): Promise<MusicFileInfo | null> {
  const files = await getAllMusicFiles(basePath);
  return files.find((f) => f.index === index) || null;
}

export async function getAllVideoFiles(basePath: string): Promise<VideoFileInfo[]> {
  const files: VideoFileInfo[] = [];

  async function scanDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
          files.push({
            index: 0,
            filename: entry.name,
            path: fullPath,
            size: await getFileSize(fullPath),
          });
        }
      }
    } catch (error) {
      logger.error(`動画ディレクトリスキャンエラー: ${dirPath}`, error);
    }
  }

  await scanDirectory(basePath);
  files.sort((a, b) => a.filename.localeCompare(b.filename));
  files.forEach((file, index) => {
    file.index = index + 1;
  });
  return files;
}

export async function getVideoFileByIndex(
  index: number,
  basePath: string
): Promise<VideoFileInfo | null> {
  const files = await getAllVideoFiles(basePath);
  return files.find((file) => file.index === index) || null;
}

/**
 * ディレクトリの確認と作成
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}
