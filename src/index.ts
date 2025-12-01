import { Client, GatewayIntentBits, Events, Message, ActivityType, Partials } from 'discord.js';
import { execa } from 'execa';
import { promises as fs } from 'fs';
import { Buffer } from 'buffer';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// 環境変数
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const JELLYFIN_MUSIC_PATH = process.env.JELLYFIN_MUSIC_PATH || '/music';

// YouTube URLのパターン
const YOUTUBE_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const YOUTUBE_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:playlist\?list=|watch\?.*&list=)([a-zA-Z0-9_-]+)/;

// 型定義
interface VideoInfo {
  title: string;
  author: string;
  duration: number;
  videoId: string;
}

interface PlaylistInfo {
  title: string;
  videoCount: number;
  videos: VideoInfo[];
}

interface DownloadResult {
  filename: string;
  path: string;
  size: number;
  skipped?: boolean; // 重複によりスキップされたかどうか
}

interface BatchDownloadResult {
  successful: DownloadResult[];
  failed: Array<{ video: VideoInfo; error: string }>;
  skipped: DownloadResult[]; // 重複によりスキップされたファイル
  totalSize: number;
}

// Discordクライアントの初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// yt-dlpがインストールされているかチェック
async function checkYtDlp(): Promise<boolean> {
  try {
    await execa('yt-dlp', ['--version']);
    return true;
  } catch {
    return false;
  }
}

// Jellyfinディレクトリの確認
async function ensureJellyfinDir(): Promise<void> {
  try {
    await fs.access(JELLYFIN_MUSIC_PATH);
  } catch {
    await fs.mkdir(JELLYFIN_MUSIC_PATH, { recursive: true });
  }
}

// YouTube動画情報の取得
async function getVideoInfo(url: string): Promise<VideoInfo> {
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
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(
        'yt-dlpがインストールされていません。\n\n' +
          'インストール方法:\n' +
          '• macOS: brew install yt-dlp\n' +
          '• Linux: pip3 install yt-dlp\n' +
          '• Windows: pip install yt-dlp\n\n' +
          'または、Dockerで実行してください: docker-compose up -d'
      );
    }
    throw new Error(
      `動画情報の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// プレイリスト情報の取得
async function getPlaylistInfo(url: string, maxVideos?: number): Promise<PlaylistInfo> {
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

// ファイル名のサニタイズ
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// ファイルの存在確認
async function checkFileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

// ファイルサイズの取得
async function getFileSize(filepath: string): Promise<number> {
  try {
    const stats = await fs.stat(filepath);
    return stats.size;
  } catch {
    return 0;
  }
}

// MP3としてダウンロード
async function downloadAsMP3(
  url: string,
  videoInfo: VideoInfo,
  message: Message,
  progressPrefix = ''
): Promise<DownloadResult> {
  const sanitizedTitle = sanitizeFilename(videoInfo.title);
  const sanitizedAuthor = sanitizeFilename(videoInfo.author);
  const filename = `${sanitizedAuthor} - ${sanitizedTitle}.mp3`;
  const outputPath = path.join(JELLYFIN_MUSIC_PATH, filename);

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

    console.log(chalk.yellow(`⏭️  スキップ: ${filename} (既に存在)`));

    return {
      filename,
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
    `${progressPrefix}🎵 **${videoInfo.title}**\n` +
      `👤 ${videoInfo.author} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
      `📥 ダウンロード開始...`
  );

  try {
    // yt-dlpでダウンロード（MP3に直接変換）
    const ytDlpProcess = execa('yt-dlp', [
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0', // 最高品質
      '--output',
      outputPath.replace('.mp3', '.%(ext)s'),
      '--no-playlist',
      '--progress',
      '--newline',
      url,
    ]);

    let lastProgress = '';

    // 進捗をリアルタイムで表示
    ytDlpProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);

      if (progressMatch && progressMatch[1] !== lastProgress) {
        lastProgress = progressMatch[1];
        const percent = parseFloat(progressMatch[1]);

        if (percent % 20 < 1) {
          // 20%ごとに更新
          const progressBar =
            '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
          progressMsg
            .edit(
              `${progressPrefix}🎵 **${videoInfo.title}**\n` +
                `👤 ${videoInfo.author} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
                `📥 ダウンロード中: ${Math.floor(percent)}%\n` +
                `[${progressBar}]`
            )
            .catch(() => {});
        }
      }
    });

    await ytDlpProcess;

    await progressMsg.edit(
      `${progressPrefix}✅ **${videoInfo.title}**\n` +
        `👤 ${videoInfo.author} | ⏱️ ${formatDuration(videoInfo.duration)}\n` +
        `✨ ダウンロード完了！`
    );

    console.log(chalk.green(`✓ ダウンロード完了: ${filename}`));

    const stats = await fs.stat(outputPath);

    return {
      filename,
      path: outputPath,
      size: stats.size,
      skipped: false,
    };
  } catch (error) {
    await progressMsg.edit(
      `${progressPrefix}❌ **${videoInfo.title}**\n` +
        `👤 ${videoInfo.author}\n` +
        `⚠️ ダウンロード失敗`
    );
    throw new Error(
      `ダウンロードエラー: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// プレイリストの一括ダウンロード
async function downloadPlaylist(
  playlistInfo: PlaylistInfo,
  message: Message
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
      console.log(chalk.blue(`📥 ${progressPrefix}${video.title} - ${video.author}`));

      const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
      const downloadResult = await downloadAsMP3(videoUrl, video, message, progressPrefix);

      if (downloadResult.skipped) {
        result.skipped.push(downloadResult);
      } else {
        result.successful.push(downloadResult);
      }
      result.totalSize += downloadResult.size;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ ${progressPrefix}エラー: ${errorMessage}`));

      result.failed.push({
        video,
        error: errorMessage,
      });
    }
  }

  return result;
}

// フォーマット関数
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

// メッセージハンドラ
client.on(Events.MessageCreate, async (message: Message) => {
  // Botからのメッセージは無視
  if (message.author.bot) return;

  // DMのみ対応
  if (!message.channel.isDMBased()) return;

  const content = message.content.trim();

  // ヘルプコマンド
  if (content.toLowerCase() === 'help' || content === 'ヘルプ') {
    await message.reply(
      `🎵 **TubeJelly Bot - 使い方**\n\n` +
        `このBotにYouTubeのURLを送信すると、自動的にMP3でダウンロードしてJellyfinの音楽ライブラリに保存します。\n\n` +
        `**対応URL:**\n` +
        `• 単一動画: \`https://www.youtube.com/watch?v=...\`\n` +
        `• 単一動画: \`https://youtu.be/...\`\n` +
        `• プレイリスト: \`https://www.youtube.com/playlist?list=...\`\n` +
        `• プレイリスト（件数指定）: \`{URL} 5\` で最初の5件のみ\n\n` +
        `**使い方:**\n` +
        `1. YouTubeのURLをこのDMに送信\n` +
        `2. 自動的にダウンロードが開始されます\n` +
        `3. 完了したらJellyfinで聴けるようになります！\n\n` +
        `**プレイリスト例:**\n` +
        `\`https://www.youtube.com/playlist?list=PLXXX\` - 全てダウンロード\n` +
        `\`https://www.youtube.com/playlist?list=PLXXX 10\` - 最初の10件のみ\n\n` +
        `**リアクションの意味:**\n` +
        `👀 リクエストを確認しました\n` +
        `⬇️ ダウンロード中\n` +
        `✅ 完了しました\n` +
        `❌ エラーが発生しました`
    );
    return;
  }

  // URLと件数を分離
  const parts = content.split(/\s+/);
  const url = parts[0];
  const limitCount = parts.length > 1 ? parseInt(parts[1], 10) : undefined;

  // プレイリストURLのチェック
  const playlistMatch = url.match(YOUTUBE_PLAYLIST_REGEX);
  const videoMatch = url.match(YOUTUBE_URL_REGEX);

  if (playlistMatch) {
    // プレイリストの処理
    try {
      await message.react('👀');

      console.log(chalk.blue(`📥 新しいプレイリストリクエスト: ${url}`));
      console.log(chalk.gray(`   ユーザー: ${message.author.tag}`));
      if (limitCount) {
        console.log(chalk.gray(`   最大件数: ${limitCount}`));
      }

      // プレイリスト情報取得
      await message.react('📋');
      const fetchingMsg = await message.reply('📋 プレイリスト情報を取得中...');

      const playlistInfo = await getPlaylistInfo(url, limitCount);

      console.log(chalk.cyan(`ℹ️  プレイリスト: ${playlistInfo.title}`));
      console.log(chalk.cyan(`   動画数: ${playlistInfo.videoCount}`));

      if (playlistInfo.videoCount === 0) {
        await fetchingMsg.edit('❌ プレイリストに動画が見つかりませんでした');
        await message.react('❌');
        return;
      }

      const totalDuration = playlistInfo.videos.reduce((sum, v) => sum + v.duration, 0);

      await fetchingMsg.edit(
        `📋 **プレイリスト情報**\n\n` +
          `📝 動画数: **${playlistInfo.videoCount}件**\n` +
          `⏱️ 合計時間: **${formatDuration(totalDuration)}**\n` +
          `📊 推定サイズ: 約${Math.ceil(playlistInfo.videoCount * 8)}〜${Math.ceil(
            playlistInfo.videoCount * 12
          )} MB\n\n` +
          `🚀 ダウンロードを開始します...`
      );

      // ダウンロード開始
      await message.react('⬇️');

      const startTime = Date.now();
      const result = await downloadPlaylist(playlistInfo, message);
      const endTime = Date.now();
      const elapsedSeconds = Math.floor((endTime - startTime) / 1000);

      // 結果メッセージ
      const successCount = result.successful.length;
      const failCount = result.failed.length;
      const skipCount = result.skipped.length;

      let resultText = `✅ **プレイリストダウンロード完了！**\n\n`;
      resultText += `━━━━━━━━━━━━━━━━━━━━\n`;
      resultText += `📊 **処理結果**\n`;
      resultText += `✅ 新規ダウンロード: **${successCount}件**\n`;
      if (skipCount > 0) {
        resultText += `⏭️ スキップ（重複）: **${skipCount}件**\n`;
      }
      if (failCount > 0) {
        resultText += `❌ 失敗: **${failCount}件**\n`;
      }
      resultText += `📦 合計サイズ: **${formatFileSize(result.totalSize)}**\n`;
      resultText += `⏱️ 処理時間: **${formatDuration(elapsedSeconds)}**\n`;
      resultText += `━━━━━━━━━━━━━━━━━━━━\n`;

      if (result.successful.length > 0) {
        resultText += `\n✨ **新規ダウンロードファイル:**\n`;
        const displayLimit = 5;
        const displayFiles = result.successful.slice(0, displayLimit);
        for (const file of displayFiles) {
          resultText += `🎵 \`${file.filename}\`\n   📦 ${formatFileSize(file.size)}\n`;
        }
        if (result.successful.length > displayLimit) {
          resultText += `\n... 他 **${result.successful.length - displayLimit}件**\n`;
        }
      }

      if (result.skipped.length > 0) {
        resultText += `\n⏭️ **スキップされたファイル:**\n`;
        const displayLimit = 3;
        const displayFiles = result.skipped.slice(0, displayLimit);
        for (const file of displayFiles) {
          resultText += `• \`${file.filename}\` (${formatFileSize(file.size)})\n`;
        }
        if (result.skipped.length > displayLimit) {
          resultText += `... 他 **${result.skipped.length - displayLimit}件**\n`;
        }
      }

      if (result.failed.length > 0) {
        resultText += `\n⚠️ **失敗した動画:**\n`;
        for (const fail of result.failed.slice(0, 3)) {
          resultText += `❌ ${fail.video.title}\n`;
        }
        if (result.failed.length > 3) {
          resultText += `... 他 **${result.failed.length - 3}件**\n`;
        }
      }

      resultText += `\n🎉 Jellyfinでお楽しみください！`;

      await message.reply(resultText);
      await message.react('✅');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ エラー: ${errorMessage}`));

      await message.react('❌');
      await message.reply(
        `❌ **プレイリストのダウンロードでエラーが発生しました**\n\n` +
          `\`\`\`\n${errorMessage}\n\`\`\``
      );
    }
  } else if (videoMatch) {
    // 単一動画の処理
    try {
      await message.react('👀');

      console.log(chalk.blue(`📥 新しいリクエスト: ${url}`));
      console.log(chalk.gray(`   ユーザー: ${message.author.tag}`));

      // 動画情報の取得
      const videoInfo = await getVideoInfo(url);

      console.log(chalk.cyan(`ℹ️  タイトル: ${videoInfo.title}`));
      console.log(chalk.cyan(`   投稿者: ${videoInfo.author}`));
      console.log(chalk.cyan(`   再生時間: ${formatDuration(videoInfo.duration)}`));

      // 確認メッセージ
      const confirmMsg = await message.reply(
        `━━━━━━━━━━━━━━━━━━━━\n` +
          `🎬 **${videoInfo.title}**\n` +
          `👤 **投稿者:** ${videoInfo.author}\n` +
          `⏱️ **再生時間:** ${formatDuration(videoInfo.duration)}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📥 MP3でダウンロードします...`
      );

      // ダウンロード
      await message.react('⬇️');
      const result = await downloadAsMP3(url, videoInfo, message);

      // 完了メッセージ
      if (result.skipped) {
        await confirmMsg.edit(
          `━━━━━━━━━━━━━━━━━━━━\n` +
            `⏭️ **スキップしました（既に存在）**\n\n` +
            `🎬 **${videoInfo.title}**\n` +
            `👤 **投稿者:** ${videoInfo.author}\n` +
            `⏱️ **再生時間:** ${formatDuration(videoInfo.duration)}\n` +
            `📦 **ファイルサイズ:** ${formatFileSize(result.size)}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📂 保存先: \`${result.filename}\`\n\n` +
            `💡 このファイルは既にJellyfinライブラリに存在します`
        );
      } else {
        await confirmMsg.edit(
          `━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ **ダウンロード完了！**\n\n` +
            `🎬 **${videoInfo.title}**\n` +
            `👤 **投稿者:** ${videoInfo.author}\n` +
            `⏱️ **再生時間:** ${formatDuration(videoInfo.duration)}\n` +
            `📦 **ファイルサイズ:** ${formatFileSize(result.size)}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📂 保存先: \`${result.filename}\`\n\n` +
            `🎉 Jellyfinでお楽しみください！`
        );
      }
      await message.react('✅');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ エラー: ${errorMessage}`));

      await message.react('❌');
      await message.reply(`❌ **エラーが発生しました**\n\n` + `\`\`\`\n${errorMessage}\n\`\`\``);
    }
  }
});

// Bot起動時
client.on(Events.ClientReady, async () => {
  console.log(chalk.green.bold(`\n🎵 TubeJelly Bot が起動しました！`));
  console.log(chalk.cyan(`   ログイン: ${client.user?.tag}`));
  console.log(chalk.cyan(`   保存先: ${JELLYFIN_MUSIC_PATH}`));

  // yt-dlpのチェック
  const hasYtDlp = await checkYtDlp();
  if (!hasYtDlp) {
    console.log(chalk.yellow('\n⚠️  警告: yt-dlpがインストールされていません'));
    console.log(chalk.yellow('   動画のダウンロードには yt-dlp が必要です\n'));
    console.log(chalk.cyan('   インストール方法:'));
    console.log(chalk.gray('   • macOS: brew install yt-dlp'));
    console.log(chalk.gray('   • Linux: pip3 install yt-dlp'));
    console.log(chalk.gray('   • Windows: pip install yt-dlp'));
    console.log(chalk.gray('   • Docker: docker-compose up -d\n'));
  } else {
    const { stdout } = await execa('yt-dlp', ['--version']);
    console.log(chalk.green(`   yt-dlp: v${stdout.trim()}`));
  }

  console.log(chalk.gray(`\n   YouTube URLをDMで送信してください...\n`));

  // Jellyfinディレクトリの準備
  await ensureJellyfinDir();

  // ステータス設定
  client.user?.setActivity('YouTube → MP3', { type: ActivityType.Watching });
});

process.on('unhandledRejection', (error: Error) => {
  console.error(chalk.red('Unhandled promise rejection:'), error);
});

// Bot起動
if (!DISCORD_TOKEN) {
  console.error(chalk.red('❌ DISCORD_TOKEN が設定されていません'));
  process.exit(1);
}

client.login(DISCORD_TOKEN);
