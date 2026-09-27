import NodeID3 from 'node-id3';
import path from 'path';
import { promises as fs } from 'fs';
import type { MusicMetadata } from '../types.js';
import { ensureDirectory } from './fileManager.js';
import { logger } from './logger.js';

/**
 * MP3ファイルのメタデータを読み取る
 */
export async function readMetadata(filePath: string): Promise<MusicMetadata> {
  try {
    const tags = NodeID3.read(filePath);

    if (!tags) {
      return {};
    }

    return {
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
      year: tags.year ? parseInt(tags.year) : undefined,
      comment: tags.comment?.text,
    };
  } catch (error) {
    logger.error(`メタデータ読み取りエラー: ${filePath}`, error);
    return {};
  }
}

/**
 * MP3ファイルのメタデータを更新する
 */
export async function updateMetadata(filePath: string, metadata: MusicMetadata): Promise<boolean> {
  try {
    const tags: NodeID3.Tags = {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      year: metadata.year?.toString(),
      comment: {
        language: 'jpn',
        text: metadata.comment || '',
      },
    };

    const success = NodeID3.update(tags, filePath);
    return success === true;
  } catch (error) {
    logger.error(`メタデータ更新エラー: ${filePath}`, error);
    return false;
  }
}

/**
 * ファイルを適切なディレクトリ構造に移動する
 * アーティスト/アルバム/曲名.mp3 の形式
 */
export async function organizeFile(
  currentPath: string,
  artist: string,
  album: string,
  title: string,
  baseDir: string
): Promise<string> {
  const sanitize = (str: string) =>
    str
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

  const artistDir = path.join(baseDir, sanitize(artist));
  const albumDir = path.join(artistDir, sanitize(album));

  // ディレクトリを作成
  await ensureDirectory(artistDir);
  await ensureDirectory(albumDir);

  // 新しいファイルパス
  const newFilename = `${sanitize(title)}.mp3`;
  const newPath = path.join(albumDir, newFilename);

  // ファイルを移動
  if (currentPath !== newPath) {
    await fs.rename(currentPath, newPath);
  }

  return newPath;
}

/**
 * メタデータを設定してファイルを整理
 */
export async function setMetadataAndOrganize(
  filePath: string,
  metadata: MusicMetadata,
  baseDir: string
): Promise<{ success: boolean; newPath?: string; error?: string }> {
  try {
    // メタデータを更新
    const updateSuccess = await updateMetadata(filePath, metadata);

    if (!updateSuccess) {
      return { success: false, error: 'メタデータの更新に失敗しました' };
    }

    // ファイルを整理（アーティスト、アルバムが指定されている場合）
    let newPath = filePath;
    if (metadata.artist && metadata.album && metadata.title) {
      newPath = await organizeFile(
        filePath,
        metadata.artist,
        metadata.album,
        metadata.title,
        baseDir
      );
    }

    return { success: true, newPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
