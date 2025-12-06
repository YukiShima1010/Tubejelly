import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  ActivityType,
  Collection,
} from 'discord.js';
import { promises as fs } from 'fs';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const JELLYFIN_MUSIC_PATH = process.env.JELLYFIN_MUSIC_PATH || '/music';

if (!DISCORD_TOKEN) {
  console.error(chalk.red('❌ DISCORD_TOKEN が設定されていません'));
  process.exit(1);
}

// Discordクライアントの初期化
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
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

// Jellyfinディレクトリの確認
async function ensureJellyfinDir(): Promise<void> {
  try {
    await fs.access(JELLYFIN_MUSIC_PATH);
    console.log(chalk.green(`✓ Jellyfinディレクトリにアクセス可能: ${JELLYFIN_MUSIC_PATH}`));
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      try {
        await fs.mkdir(JELLYFIN_MUSIC_PATH, { recursive: true });
        console.log(chalk.green(`✓ Jellyfinディレクトリを作成: ${JELLYFIN_MUSIC_PATH}`));
      } catch {
        console.warn(
          chalk.yellow(`⚠️ Jellyfinディレクトリの作成に失敗しました: ${JELLYFIN_MUSIC_PATH}`)
        );
        console.warn(
          chalk.yellow(
            `   このディレクトリが既に存在し、適切にマウントされていることを確認してください。`
          )
        );
      }
    } else {
      console.warn(
        chalk.yellow(`⚠️ Jellyfinディレクトリへのアクセスに問題があります: ${JELLYFIN_MUSIC_PATH}`)
      );
      console.warn(
        chalk.yellow(
          `   このディレクトリが存在し、コンテナが書き込み権限を持つことを確認してください。`
        )
      );
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
  console.log(chalk.cyan(`🎵 音楽ディレクトリ: ${JELLYFIN_MUSIC_PATH}`));

  // ステータスを設定
  client.user?.setActivity('YouTube Music 🎵', { type: ActivityType.Listening });

  // Jellyfinディレクトリの確認
  await ensureJellyfinDir();

  // コマンドをロード
  await loadCommands();

  // スラッシュコマンドを登録
  await registerCommands();

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
      chalk.blue(`📨 コマンド実行: /${interaction.commandName} (ユーザー: ${interaction.user.tag})`)
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
