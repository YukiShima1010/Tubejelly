// YouTube動画情報
export interface VideoInfo {
  title: string;
  author: string;
  duration: number;
  videoId: string;
}

export interface UserConfigEntry {
  NAME?: string;
  DISCORD_USER_ID?: string;
  LINE_USER_ID?: string;
  MUSIC_DL_DIR: string;
  VIDEO_DL_DIR: string;
}

// YouTubeプレイリスト情報
export interface PlaylistInfo {
  title: string;
  videoCount: number;
  videos: VideoInfo[];
}

// ダウンロード結果
export interface DownloadResult {
  filename: string;
  path: string;
  size: number;
  skipped?: boolean;
}

// 一括ダウンロード結果
export interface BatchDownloadResult {
  successful: DownloadResult[];
  failed: Array<{ video: VideoInfo; error: string }>;
  skipped: DownloadResult[];
  totalSize: number;
}

// 音楽ファイル情報
export interface MusicFileInfo {
  index: number;
  filename: string;
  path: string;
  size: number;
  title?: string;
  artist?: string;
  album?: string;
}

export interface VideoFileInfo {
  index: number;
  filename: string;
  path: string;
  size: number;
}

// メタデータ
export interface MusicMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  comment?: string;
}
