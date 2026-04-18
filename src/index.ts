import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  ActivityType,
  Collection,
  Partials,
} from 'discord.js';
import { promises as fs } from 'fs';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadLineUserConfig, loadUserConfig } from './utils/userConfig.js';
import { startLineWebhookServer } from './line/webhook.js';

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
  const [discordConfig, lineConfig] = await Promise.all([loadUserConfig(), loadLineUserConfig()]);

  const userEntries: Array<{ userId: string; musicPath: string }> = [
    ...Object.entries(discordConfig).map(([userId, musicPath]) => ({ userId, musicPath })),
    ...Object.entries(lineConfig).map(([userId, musicPath]) => ({
      userId: `LINE:${userId}`,
      musicPath,
    })),
  ];

  for (const { userId, musicPath } of userEntries) {
    try {
      await fs.access(musicPath);
      console.log(chalk.green(`✓ ユーザー ${userId} のディレクトリにアクセス可能: ${musicPath}`));
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        try {
          await fs.mkdir(musicPath, { recursive: true });
          console.log(chalk.green(`✓ ユーザー ${userId} のディレクトリを作成: ${musicPath}`));
        } catch {
          console.warn(
            chalk.yellow(`⚠️ ユーザー ${userId} のディレクトリの作成に失敗しました: ${musicPath}`)
          );
        }
      } else {
        console.warn(
          chalk.yellow(
            `⚠️ ユーザー ${userId} のディレクトリへのアクセスに問題があります: ${musicPath}`
          )
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

  if (LINE_CHANNEL_SECRET && LINE_CHANNEL_ACCESS_TOKEN) {
    if (Number.isNaN(LINE_WEBHOOK_PORT) || LINE_WEBHOOK_PORT < 1 || LINE_WEBHOOK_PORT > 65535) {
      console.warn(
        chalk.yellow(`⚠️ LINE_WEBHOOK_PORT が不正です: ${process.env.LINE_WEBHOOK_PORT}`)
      );
    } else {
      startLineWebhookServer({
        channelSecret: LINE_CHANNEL_SECRET,
        channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
        port: LINE_WEBHOOK_PORT,
      });
    }
  } else {
    console.log(
      chalk.yellow(
        '⚠️ LINE連携は無効です（LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が未設定）'
      )
    );
  }

  console.log(chalk.green.bold(`\n🚀 準備完了！コマンドを受け付けています。\n`));
});

// インタラクション（スラッシュコマンド）の処理
client.on(Events.InteractionCreate, async (interaction) => {
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

// エラーハンドリング
client.on(Events.Error, (error) => {
  console.error(chalk.red('❌ Discordクライアントエラー:'), error);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ 未処理のPromise拒否:'), error);
});

// Botを起動
client.login(DISCORD_TOKEN).catch((error) => {
  console.error(chalk.red('❌ Discordへのログインに失敗:'), error);
  process.exit(1);
});
