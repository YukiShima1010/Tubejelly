import type { ChatInputCommandInteraction } from 'discord.js';
import { getVideoFileByIndex } from '../utils/fileManager.js';
import { getUserVideoPath } from '../utils/userConfig.js';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, successEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'video_delete',
  description: 'MusicVideoを削除',
  dm_permission: true,
  options: [
    {
      name: 'index',
      type: 4,
      description: '削除する動画の番号（/video_listで確認）',
      required: true,
    },
  ],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const videoPath = await getUserVideoPath(interaction.user.id);
  if (!videoPath) {
    await interaction.reply({
      embeds: [errorEmbed('MusicVideoの保存先が未設定です.')],
      ephemeral: true,
    });
    return;
  }

  const index = interaction.options.getInteger('index', true);
  await interaction.deferReply();

  try {
    const file = await getVideoFileByIndex(index, videoPath);
    if (!file) {
      await interaction.editReply({
        embeds: [errorEmbed(`番号 ${index} のMusicVideoが見つかりません。`)],
      });
      return;
    }

    await fs.unlink(file.path);
    await interaction.editReply({ embeds: [successEmbed('削除完了', `📁 ${file.filename}`)] });
  } catch (error) {
    logger.error(chalk.red('✗ MusicVideo削除エラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(`削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`),
      ],
    });
  }
}
