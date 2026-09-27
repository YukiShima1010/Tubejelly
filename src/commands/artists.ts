import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getAllMusicFiles } from '../utils/fileManager.js';
import { updateMetadata } from '../utils/metadata.js';
import { organizeFile } from '../utils/metadata.js';
import { getUserMusicPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, infoEmbed, successEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'artists',
  description: 'アーティスト一覧の表示・アーティスト名の一括変更',
  dm_permission: true,
  options: [
    {
      name: 'list',
      type: 1, // SUB_COMMAND
      description: 'アーティスト一覧を表示',
    },
    {
      name: 'rename',
      type: 1, // SUB_COMMAND
      description: 'アーティスト名を一括変更',
      options: [
        {
          name: 'old',
          type: 3, // STRING
          description: '現在のアーティスト名',
          required: true,
        },
        {
          name: 'new',
          type: 3, // STRING
          description: '新しいアーティスト名',
          required: true,
        },
      ],
    },
  ],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const musicPath = await getUserMusicPath(userId);

  if (!musicPath) {
    await interaction.reply({
      embeds: [errorEmbed('あなたはこのBotの使用が許可されていません。管理者に連絡してください。')],
      ephemeral: true,
    });
    return;
  }

  const subCommand = interaction.options.getSubcommand();

  if (subCommand === 'list') {
    await handleList(interaction, musicPath);
  } else if (subCommand === 'rename') {
    await handleRename(interaction, musicPath);
  }
}

/**
 * アーティスト一覧を表示
 */
async function handleList(
  interaction: ChatInputCommandInteraction,
  musicPath: string
): Promise<void> {
  await interaction.deferReply();

  try {
    logger.info(chalk.blue('🎤 アーティスト一覧取得中...'));

    const files = await getAllMusicFiles(musicPath);

    if (files.length === 0) {
      await interaction.editReply('📂 音楽ライブラリは空です。');
      return;
    }

    // アーティストごとに曲数を集計
    const artistMap = new Map<string, number>();

    for (const file of files) {
      const artist = file.artist || 'Unknown Artist';
      artistMap.set(artist, (artistMap.get(artist) || 0) + 1);
    }

    // 曲数の降順でソート
    const sortedArtists = Array.from(artistMap.entries()).sort((a, b) => b[1] - a[1]);

    let message = `🎤 **アーティスト一覧** (全 ${sortedArtists.length} アーティスト)\n\n`;

    for (let i = 0; i < Math.min(sortedArtists.length, 30); i++) {
      const [artist, count] = sortedArtists[i];
      message += `**${i + 1}.** ${artist} — ${count}曲\n`;
    }

    if (sortedArtists.length > 30) {
      message += `\n...他 ${sortedArtists.length - 30} アーティスト`;
    }

    message += `\n\n💡 アーティスト名を変更するには:\n`;
    message += `\`/artists rename old:旧名 new:新名\``;

    // 2000文字制限対策
    if (message.length > 2000) {
      message = `🎤 **アーティスト一覧** (全 ${sortedArtists.length} アーティスト)\n\n`;
      for (let i = 0; i < Math.min(sortedArtists.length, 40); i++) {
        const [artist, count] = sortedArtists[i];
        message += `${i + 1}. ${artist} (${count}曲)\n`;
      }
      if (sortedArtists.length > 40) {
        message += `...他 ${sortedArtists.length - 40} アーティスト`;
      }
    }

    const components =
      sortedArtists.length > 30
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`artists_all:${interaction.user.id}`)
                .setLabel('全て表示')
                .setStyle(ButtonStyle.Secondary)
            ),
          ]
        : [];

    await interaction.editReply({ embeds: [infoEmbed('アーティスト一覧', message)], components });
    logger.info(chalk.green(`✓ アーティスト一覧表示: ${sortedArtists.length}件`));
  } catch (error) {
    logger.error(chalk.red('✗ アーティスト一覧取得エラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `アーティスト一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}

/**
 * アーティスト名を一括変更
 */
async function handleRename(
  interaction: ChatInputCommandInteraction,
  musicPath: string
): Promise<void> {
  const oldName = interaction.options.getString('old', true);
  const newName = interaction.options.getString('new', true);

  await interaction.deferReply();

  try {
    logger.info(chalk.blue(`✏️ アーティスト名変更: "${oldName}" → "${newName}"`));

    const files = await getAllMusicFiles(musicPath);

    // 対象ファイルを検索
    const targetFiles = files.filter(
      (file) => file.artist === oldName || (!file.artist && oldName === 'Unknown Artist')
    );

    if (targetFiles.length === 0) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            `アーティスト「${oldName}」の曲が見つかりませんでした。\n\`/artists list\` コマンドでアーティスト一覧を確認してください。`
          ),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          'アーティスト名変更中',
          `「${oldName}」→「${newName}」\n対象: ${targetFiles.length}曲`
        ),
      ],
    });

    let successCount = 0;
    let failCount = 0;

    for (const file of targetFiles) {
      try {
        // メタデータを更新
        const metadata = {
          title: file.title || file.filename.replace('.mp3', ''),
          artist: newName,
          album: file.album,
        };

        const updateSuccess = await updateMetadata(file.path, metadata);

        if (!updateSuccess) {
          failCount++;
          continue;
        }

        // アルバムが設定されている場合、ファイルを移動
        if (file.album && file.title) {
          try {
            await organizeFile(file.path, newName, file.album, file.title, musicPath);
          } catch {
            // ファイル移動が失敗してもメタデータは更新済みなので成功扱い
          }
        }

        successCount++;
      } catch {
        failCount++;
      }
    }

    let resultMessage = `✅ **アーティスト名変更完了**\n\n`;
    resultMessage += `🎤 「${oldName}」→「${newName}」\n`;
    resultMessage += `✅ 成功: ${successCount}曲\n`;

    if (failCount > 0) {
      resultMessage += `❌ 失敗: ${failCount}曲\n`;
    }

    await interaction.editReply({
      embeds: [successEmbed('アーティスト名変更完了', resultMessage)],
    });

    logger.info(
      chalk.green(
        `✓ アーティスト名変更完了: "${oldName}" → "${newName}" (成功=${successCount}, 失敗=${failCount})`
      )
    );
  } catch (error) {
    logger.error(chalk.red('✗ アーティスト名変更エラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `アーティスト名の変更に失敗しました: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}