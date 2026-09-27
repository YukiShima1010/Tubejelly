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
import chalk from 'chalk';
import { logger } from './utils/logger.js';
import { errorEmbed, infoEmbed, skippedEmbed, successEmbed } from './utils/discordEmbeds.js';
import { createDiscordDownloadMessage } from './utils/discordDownloadMessage.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadUserConfig } from './utils/userConfig.js';
import { startLineWebhookServer } from './line/webhook.js';
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
import { runtimeConfig } from './config/runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数
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
      logger.info(chalk.green(`✓ ユーザー ${userId} のディレクトリにアクセス可能: ${path}`));
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        try {
          await fs.mkdir(path, { recursive: true });
          logger.info(chalk.green(`✓ ユーザー ${userId} のディレクトリを作成: ${path}`));
        } catch {
          logger.warn(
            chalk.yellow(`⚠️ ユーザー ${userId} のディレクトリの作成に失敗しました: ${path}`)
          );
        }
      } else {
        logger.warn(
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
      logger.info(chalk.green(`✓ コマンドをロード: ${command.data.name}`));
    } else {
      logger.warn(
        chalk.yellow(`⚠️ ${file} は必要な "data" または "execute" プロパティがありません`)
      );
    }
  }
}

// スラッシュコマンドを登録
async function registerCommands() {
  const commandsData = Array.from(commands.values()).map((cmd) => cmd.data);

  const rest = new REST({ version: '10' }).setToken(runtimeConfig.discordToken!);

  try {
    logger.info(chalk.blue(`🔄 ${commandsData.length}個のスラッシュコマンドを登録中...`));

    // グローバルコマンドとして登録
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: commandsData,
    });

    logger.info(chalk.green(`✓ スラッシュコマンドの登録完了`));
  } catch (error) {
    logger.error(chalk.red('❌ スラッシュコマンドの登録に失敗:'), error);
  }
}

// Botの準備完了イベント
client.once(Events.ClientReady, async (c) => {
  logger.info(chalk.green.bold(`\n✅ TubeJelly Bot が起動しました！`));
  logger.info(chalk.cyan(`👤 ログイン: ${c.user.tag}`));

  // ステータスを設定
  client.user?.setActivity('YouTube Music 🎵', { type: ActivityType.Listening });

  // ユーザーディレクトリの確認
  await ensureUserDirs();

  // コマンドをロード
  await loadCommands();

  // スラッシュコマンドを登録
  await registerCommands();

  if (runtimeConfig.lineEnabled) {
    startLineWebhookServer({
      channelSecret: runtimeConfig.lineChannelSecret!,
      channelAccessToken: runtimeConfig.lineChannelAccessToken!,
      port: runtimeConfig.lineWebhookPort,
    });
  } else {
    logger.info(
      chalk.yellow(
        '⚠️ LINE連携は無効です（LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が未設定）'
      )
    );
  }

  logger.info(chalk.green.bold(`\n🚀 準備完了！コマンドを受け付けています。\n`));
});

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
    logger.warn(chalk.yellow(`⚠️ 不明なコマンド: ${interaction.commandName}`));
    return;
  }

  try {
    logger.info(
      chalk.blue(
        `📨 コマンド実行: /${interaction.commandName} (ユーザー: ${interaction.user.tag}, ID: ${interaction.user.id})`
      )
    );
    await command.execute(interaction);
  } catch (error) {
    logger.error(chalk.red(`❌ コマンド実行エラー: /${interaction.commandName}`), error);

    const errorMessage = {
      embeds: [errorEmbed('コマンドの実行中にエラーが発生しました。')],
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
    await interaction.reply({
      embeds: [errorEmbed('このボタンは実行できません。')],
      ephemeral: true,
    });
    return;
  }

  const musicPath = await getUserMusicPath(interaction.user.id);
  if (!musicPath) {
    await interaction.reply({ embeds: [errorEmbed('音楽保存先が未設定です。')], ephemeral: true });
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

  await interaction.editReply({
    embeds: [infoEmbed('アーティスト一覧', chunks[0] || header)],
    components: [],
  });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ embeds: [infoEmbed('アーティスト一覧', chunk)] });
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const url = message.content.match(/https?:\/\/[^\s<>{}"']+/i)?.[0];
  if (!url) return;

  const isVideo = message.content.includes('動画');
  const downloadPath = isVideo
    ? await getUserVideoPath(message.author.id)
    : await getUserMusicPath(message.author.id);
  if (!downloadPath) {
    await message.channel.send({
      embeds: [
        errorEmbed(isVideo ? 'MusicVideoの保存先が未設定です。' : '音楽の保存先が未設定です。'),
      ],
    });
    return;
  }

  try {
    const downloadMessage = createDiscordDownloadMessage((payload) =>
      message.channel.send(payload)
    );
    const playlistUrl = normalizeYouTubePlaylistUrl(url);
    if (playlistUrl) {
      const playlistInfo = await getPlaylistInfo(playlistUrl);
      if (playlistInfo.videos.length === 0) {
        await message.channel.send({
          embeds: [errorEmbed('プレイリストに動画が見つかりませんでした。')],
        });
        return;
      }
      const result = isVideo
        ? await downloadVideoPlaylist(playlistInfo, downloadMessage, downloadPath)
        : await downloadPlaylist(playlistInfo, downloadMessage, downloadPath);
      await message.channel.send({
        embeds: [
          successEmbed(
            `${isVideo ? 'MusicVideo' : '音楽'}プレイリスト完了`,
            `✅ 成功: ${result.successful.length}件\n⏭️ スキップ: ${result.skipped.length}件\n❌ 失敗: ${result.failed.length}件`
          ),
        ],
      });
      return;
    }

    const videoUrl = normalizeYouTubeVideoUrl(url);
    if (!videoUrl) return;
    const videoInfo = await getVideoInfo(videoUrl);
    const result = isVideo
      ? await downloadAsVideo(videoUrl, videoInfo, downloadMessage, downloadPath)
      : await downloadAsMP3(videoUrl, videoInfo, downloadMessage, downloadPath);
    await message.channel.send({
      embeds: [
        result.skipped
          ? skippedEmbed('ダウンロード済み', `既存ファイルのためスキップ: ${result.filename}`)
          : successEmbed('ダウンロード完了', result.filename),
      ],
    });
  } catch (error) {
    logger.error(chalk.red('❌ URL貼り付けダウンロードエラー:'), error);
    await message.channel.send({
      embeds: [
        errorEmbed(`ダウンロード失敗: ${error instanceof Error ? error.message : String(error)}`),
      ],
    });
  }
});

// エラーハンドリング
client.on(Events.Error, (error) => {
  logger.error(chalk.red('❌ Discordクライアントエラー:'), error);
});

process.on('unhandledRejection', (error) => {
  logger.error(chalk.red('❌ 未処理のPromise拒否:'), error);
});

// Botを起動
if (runtimeConfig.discordEnabled) {
  client.login(runtimeConfig.discordToken!).catch((error) => {
    logger.error(chalk.red('❌ Discordへのログインに失敗:'), error);
    process.exit(1);
  });
} else if (runtimeConfig.lineEnabled) {
  ensureUserDirs()
    .then(() => {
      startLineWebhookServer({
        channelSecret: runtimeConfig.lineChannelSecret!,
        channelAccessToken: runtimeConfig.lineChannelAccessToken!,
        port: runtimeConfig.lineWebhookPort,
      });
      logger.info('Discord連携を無効化し、LINE連携のみで起動しました');
    })
    .catch((error) => {
      logger.error({ err: error }, 'LINE専用モードの起動に失敗しました');
      process.exit(1);
    });
} else {
  logger.error('Discord_ENABLEDとLINE_ENABLEDの少なくとも一方をtrueにしてください');
  process.exit(1);
}
