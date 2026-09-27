import type { ChatInputCommandInteraction } from 'discord.js';
import { getMusicFileByIndex } from '../utils/fileManager.js';
import { getUserMusicPath } from '../utils/userConfig.js';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, successEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'delete',
  description: '曲を削除',
  dm_permission: true,
  options: [
    {
      name: 'index',
      type: 4, // INTEGER
      description: '削除する曲の番号（/listで確認）',
      required: true,
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

  const index = interaction.options.getInteger('index', true);

  await interaction.deferReply();

  try {
    logger.info(chalk.blue(`🗑️ 削除開始: インデックス=${index}`));

    // ファイルを取得
    const file = await getMusicFileByIndex(index, musicPath);

    if (!file) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            `番号 ${index} の曲が見つかりませんでした。\n\`/list\` コマンドで曲の一覧を確認してください。`
          ),
        ],
      });
      return;
    }

    // ファイルを削除
    await fs.unlink(file.path);

    const metadata = [];
    if (file.title) metadata.push(`🎵 ${file.title}`);
    if (file.artist) metadata.push(`👤 ${file.artist}`);
    if (file.album) metadata.push(`💿 ${file.album}`);

    await interaction.editReply({
      embeds: [
        successEmbed(
          '削除完了',
          `📁 ${file.filename}\n${metadata.length > 0 ? metadata.join(' | ') : ''}\n\nこの曲はライブラリから削除されました。`
        ),
      ],
    });

    logger.info(chalk.green(`✓ 削除完了: ${file.filename}`));
  } catch (error) {
    logger.error(chalk.red('✗ 削除エラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(`削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`),
      ],
    });
  }
}