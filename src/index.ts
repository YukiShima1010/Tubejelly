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

// 型定義
interface VideoInfo {
  title: string;
  author: string;
  duration: number;
  videoId: string;
}

interface DownloadResult {
  filename: string;
  path: string;
  size: number;
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

// ファイル名のサニタイズ
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// MP3としてダウンロード
async function downloadAsMP3(
  url: string,
  videoInfo: VideoInfo,
  message: Message
): Promise<DownloadResult> {
  const sanitizedTitle = sanitizeFilename(videoInfo.title);
  const sanitizedAuthor = sanitizeFilename(videoInfo.author);
  const filename = `${sanitizedAuthor} - ${sanitizedTitle}.mp3`;
  const outputPath = path.join(JELLYFIN_MUSIC_PATH, filename);

  // 進捗メッセージ
  await message.react('⬇️');
  const progressMsg = await message.reply('🎵 ダウンロード中...');

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

        if (percent % 10 < 1) {
          // 10%ごとに更新
          progressMsg.edit(`🎵 ダウンロード中... ${Math.floor(percent)}%`).catch(() => {});
        }
      }
    });

    await ytDlpProcess;

    await progressMsg.edit('✅ 完了しました！');
    await message.react('✅');

    console.log(chalk.green(`✓ ダウンロード完了: ${filename}`));

    const stats = await fs.stat(outputPath);

    return {
      filename,
      path: outputPath,
      size: stats.size,
    };
  } catch (error) {
    await progressMsg.edit('❌ ダウンロード失敗');
    throw new Error(
      `ダウンロードエラー: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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

  // YouTube URLのチェック
  const match = content.match(YOUTUBE_URL_REGEX);

  if (match) {
    const url = content;

    try {
      // 処理開始のリアクション
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
        `🎬 **${videoInfo.title}**\n` +
          `👤 ${videoInfo.author}\n` +
          `⏱️ ${formatDuration(videoInfo.duration)}\n\n` +
          `この動画をMP3でダウンロードします...`
      );

      // ダウンロード
      const result = await downloadAsMP3(url, videoInfo, message);

      // 完了メッセージ
      await confirmMsg.edit(
        `✅ **ダウンロード完了！**\n\n` +
          `🎬 **${videoInfo.title}**\n` +
          `👤 ${videoInfo.author}\n` +
          `⏱️ ${formatDuration(videoInfo.duration)}\n` +
          `📦 ${formatFileSize(result.size)}\n\n` +
          `📂 保存先: \`${result.filename}\``
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ エラー: ${errorMessage}`));

      await message.react('❌');
      await message.reply(`❌ **エラーが発生しました**\n\n` + `\`\`\`\n${errorMessage}\n\`\`\``);
    }
  } else if (content.toLowerCase() === 'help' || content === 'ヘルプ') {
    await message.reply(
      `🎵 **TubeJelly Bot - 使い方**\n\n` +
        `このBotにYouTubeのURLを送信すると、自動的にMP3でダウンロードしてJellyfinの音楽ライブラリに保存します。\n\n` +
        `**対応URL:**\n` +
        `• \`https://www.youtube.com/watch?v=...\`\n` +
        `• \`https://youtu.be/...\`\n\n` +
        `**使い方:**\n` +
        `1. YouTubeのURLをこのDMに送信\n` +
        `2. 自動的にダウンロードが開始されます\n` +
        `3. 完了したらJellyfinで聴けるようになります！\n\n` +
        `**リアクションの意味:**\n` +
        `👀 リクエストを確認しました\n` +
        `⬇️ ダウンロード中\n` +
        `✅ 完了しました\n` +
        `❌ エラーが発生しました`
    );
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