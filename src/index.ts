import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  ActivityType,
  Collection,
  Partials,
  type ButtonInteraction,
} from 'discord.js';
import { promises as fs } from 'fs';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadUserConfig } from './utils/userConfig.js';
import { createLineWebhookHandler } from './line/webhook.js';
import { startHttpServer, type RouteHandler } from './http/server.js';
import { createExtensionApiHandler } from './extension/api.js';
import { getExtensionService, getExtensionTokenStorePath } from './extension/instance.js';
import {
  downloadAsMP3,
  downloadAsVideo,
  downloadPlaylist,
  downloadVideoPlaylist,
  getPlaylistInfo,
  getVideoInfo,
  normalizeYouTubePlaylistUrl,
  normalizeYouTubeVideoUrl,
} from './utils/download.js';
import { getUserMusicPath, getUserVideoPath } from './utils/userConfig.js';
import { getAllMusicFiles } from './utils/fileManager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_WEBHOOK_PORT = Number(process.env.LINE_WEBHOOK_PORT ?? '3000');

if (!DISCORD_TOKEN) {
  console.error(chalk.red('❌ DISCORD_TOKEN が設定されていません'));
  process.exit(1);
}

// Discordクライアントの初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // DMチャンネルのキャッシュを有効化
});

// コマンドコレクション
interface Command {
  data: {
    name: string;
    description: string;
    options?: any[];
  };
  execute: (interaction: any) => Promise<void>;
}

const commands = new Collection<string, Command>();

// ユーザーディレクトリの確認
async function ensureUserDirs(): Promise<void> {
  const config = await loadUserConfig();
  const userEntries = config.flatMap((entry) => [
    { userId: entry.DISCORD_USER_ID ?? entry.NAME ?? 'unknown', path: entry.MUSIC_DL_DIR },
    { userId: entry.DISCORD_USER_ID ?? entry.NAME ?? 'unknown', path: entry.VIDEO_DL_DIR },
  ]);

  for (const { userId, path } of userEntries) {
    try {
      await fs.access(path);
      console.log(chalk.green(`✓ ユーザー ${userId} のディレクトリにアクセス可能: ${path}`));
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        try {
          await fs.mkdir(path, { recursive: true });
          console.log(chalk.green(`✓ ユーザー ${userId} のディレクトリを作成: ${path}`));
        } catch {
          console.warn(
            chalk.yellow(`⚠️ ユーザー ${userId} のディレクトリの作成に失敗しました: ${path}`)
          );
        }
      } else {
        console.warn(
          chalk.yellow(`⚠️ ユーザー ${userId} のディレクトリへのアクセスに問題があります: ${path}`)
        );
      }
    }
  }
}

// コマンドを動的にロード
async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = (await fs.readdir(commandsPath)).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(filePath);

    if ('data' in command && 'execute' in command) {
      commands.set(command.data.name, command);
      console.log(chalk.green(`✓ コマンドをロード: ${command.data.name}`));
    } else {
      console.warn(
        chalk.yellow(`⚠️ ${file} は必要な "data" または "execute" プロパティがありません`)
      );
    }
  }
}

// スラッシュコマンドを登録
async function registerCommands() {
  const commandsData = Array.from(commands.values()).map((cmd) => cmd.data);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);

  try {
    console.log(chalk.blue(`🔄 ${commandsData.length}個のスラッシュコマンドを登録中...`));

    // グローバルコマンドとして登録
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: commandsData,
    });

    console.log(chalk.green(`✓ スラッシュコマンドの登録完了`));
  } catch (error) {
    console.error(chalk.red('❌ スラッシュコマンドの登録に失敗:'), error);
  }
}

// Botの準備完了イベント
client.once(Events.ClientReady, async (c) => {
  console.log(chalk.green.bold(`\n✅ TubeJelly Bot が起動しました！`));
  console.log(chalk.cyan(`👤 ログイン: ${c.user.tag}`));

  // ステータスを設定
  client.user?.setActivity('YouTube Music 🎵', { type: ActivityType.Listening });

  // ユーザーディレクトリの確認
  await ensureUserDirs();

  // コマンドをロード
  await loadCommands();

  // スラッシュコマンドを登録
  await registerCommands();

  console.log(chalk.green.bold(`\n🚀 準備完了！コマンドを受け付けています。\n`));
});

/**
 * LINE Webhook と Chrome拡張機能API を共用HTTPサーバーで起動する
 */
function startHttpServerIfNeeded(): void {
  const routes: RouteHandler[] = [];
  const extensionService = getExtensionService();

  if (LINE_CHANNEL_SECRET && LINE_CHANNEL_ACCESS_TOKEN) {
    routes.push(
      createLineWebhookHandler({
        channelSecret: LINE_CHANNEL_SECRET,
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        extensionService,
      })
    );
    console.log(chalk.green('✓ LINE連携を有効化: /line/webhook'));
  } else {
    console.log(
      chalk.yellow(
        '⚠️ LINE連携は無効です（LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が未設定）'
      )
    );
  }

  if (extensionService) {
    routes.push(createExtensionApiHandler(extensionService));
    console.log(
      chalk.green(`✓ Chrome拡張機能APIを有効化: /ext/v1 (トークン保存先: ${getExtensionTokenStorePath()})`)
    );
  } else {
    console.log(chalk.yellow('⚠️ Chrome拡張機能APIは無効です（EXTENSION_API_ENABLED=true で有効化）'));
  }

  if (routes.length === 0) return;

  if (Number.isNaN(LINE_WEBHOOK_PORT) || LINE_WEBHOOK_PORT < 1 || LINE_WEBHOOK_PORT > 65535) {
    console.warn(
      chalk.yellow(
        `⚠️ LINE_WEBHOOK_PORT が不正です: ${process.env.LINE_WEBHOOK_PORT}（LINE連携・Chrome拡張機能APIとも起動しません）`
      )
    );
    return;
  }

  startHttpServer(LINE_WEBHOOK_PORT, routes).on('error', (error) => {
    console.error(chalk.red('❌ HTTPサーバーの起動に失敗:'), error);
  });
}

// インタラクション（スラッシュコマンド）の処理
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith('artists_all:')) return;
    await handleAllArtistsButton(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) {
    console.warn(chalk.yellow(`⚠️ 不明なコマンド: ${interaction.commandName}`));
    return;
  }

  try {
    console.log(
      chalk.blue(
        `📨 コマンド実行: /${interaction.commandName} (ユーザー: ${interaction.user.tag}, ID: ${interaction.user.id})`
      )
    );
    await command.execute(interaction);
  } catch (error) {
    console.error(chalk.red(`❌ コマンド実行エラー: /${interaction.commandName}`), error);

    const errorMessage = {
      content: `❌ コマンドの実行中にエラーが発生しました。`,
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

async function handleAllArtistsButton(interaction: ButtonInteraction): Promise<void> {
  const [, ownerId] = interaction.customId.split(':');
  if (ownerId !== interaction.user.id) {
    await interaction.reply({ content: '❌ このボタンは実行できません。', ephemeral: true });
    return;
  }

  const musicPath = await getUserMusicPath(interaction.user.id);
  if (!musicPath) {
    await interaction.reply({ content: '❌ 音楽保存先が未設定です。', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  const files = await getAllMusicFiles(musicPath);
  const artistMap = new Map<string, number>();
  for (const file of files) {
    const artist = file.artist || 'Unknown Artist';
    artistMap.set(artist, (artistMap.get(artist) || 0) + 1);
  }

  const sortedArtists = Array.from(artistMap.entries()).sort((a, b) => b[1] - a[1]);
  const header = `🎤 アーティスト一覧 (全 ${sortedArtists.length} アーティスト)\n\n`;
  const chunks: string[] = [];
  let current = header;
  for (let i = 0; i < sortedArtists.length; i++) {
    const line = `${i + 1}. ${sortedArtists[i][0]} (${sortedArtists[i][1]}曲)\n`;
    if (current.length + line.length > 1900) {
      chunks.push(current);
      current = '';
    }
    current += line;
  }
  if (current) chunks.push(current);

  await interaction.editReply({ content: chunks[0] || header, components: [] });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp(chunk);
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Chrome拡張機能の連携コード（コードが他人に見えないよう、DMのみ受け付ける。サーバーでは /link を使う）
  const extensionService = getExtensionService();
  if (extensionService && message.channel.isDMBased()) {
    try {
      const pairingReply = await extensionService.handlePairingMessage(
        message.content,
        message.author.id,
        'discord'
      );
      if (pairingReply) {
        await message.reply(pairingReply);
        return;
      }
    } catch (error) {
      console.error(chalk.red('❌ 連携コード処理エラー:'), error);
      return;
    }
  }

  const url = message.content.match(/https?:\/\/[^\s<>{}"']+/i)?.[0];
  if (!url) return;

  const isVideo = message.content.includes('動画');
  const downloadPath = isVideo
    ? await getUserVideoPath(message.author.id)
    : await getUserMusicPath(message.author.id);
  if (!downloadPath) {
    await message.channel.send(
      isVideo ? '❌ MusicVideoの保存先が未設定です。' : '❌ 音楽の保存先が未設定です。'
    );
    return;
  }

  try {
    const playlistUrl = normalizeYouTubePlaylistUrl(url);
    if (playlistUrl) {
      const playlistInfo = await getPlaylistInfo(playlistUrl);
      if (playlistInfo.videos.length === 0) {
        await message.channel.send('❌ プレイリストに動画が見つかりませんでした。');
        return;
      }
      const result = isVideo
        ? await downloadVideoPlaylist(playlistInfo, message, downloadPath)
        : await downloadPlaylist(playlistInfo, message, downloadPath);
      await message.channel.send(
        `📊 ${isVideo ? 'MusicVideo' : '音楽'}プレイリスト完了\n✅ 成功: ${result.successful.length}件\n` +
          `⏭️ スキップ: ${result.skipped.length}件\n❌ 失敗: ${result.failed.length}件`
      );
      return;
    }

    const videoUrl = normalizeYouTubeVideoUrl(url);
    if (!videoUrl) return;
    const videoInfo = await getVideoInfo(videoUrl);
    const result = isVideo
      ? await downloadAsVideo(videoUrl, videoInfo, message, downloadPath)
      : await downloadAsMP3(videoUrl, videoInfo, message, downloadPath);
    await message.channel.send(
      result.skipped
        ? `⏭️ 既存ファイルのためスキップ: ${result.filename}`
        : `✅ ダウンロード完了: ${result.filename}`
    );
  } catch (error) {
    console.error(chalk.red('❌ URL貼り付けダウンロードエラー:'), error);
    await message.channel.send(
      `❌ ダウンロード失敗: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// エラーハンドリング
client.on(Events.Error, (error) => {
  console.error(chalk.red('❌ Discordクライアントエラー:'), error);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ 未処理のPromise拒否:'), error);
});

// HTTPサーバー（LINE Webhook・Chrome拡張機能API）はDiscordの準備状態に関係なく起動する
startHttpServerIfNeeded();

// Botを起動
client.login(DISCORD_TOKEN).catch((error) => {
  console.error(chalk.red('❌ Discordへのログインに失敗:'), error);
  process.exit(1);
});
