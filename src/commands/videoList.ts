import type { ChatInputCommandInteraction } from 'discord.js';
import { formatFileSize, getAllVideoFiles } from '../utils/fileManager.js';
import { getUserVideoPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, infoEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'video_list',
  description: 'MusicVideoの一覧を表示',
  dm_permission: true,
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const videoPath = await getUserVideoPath(interaction.user.id);
  if (!videoPath) {
    await interaction.reply({
      embeds: [errorEmbed('MusicVideoの保存先が未設定です。')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();
  try {
    const files = await getAllVideoFiles(videoPath);
    if (files.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed('MusicVideoライブラリ', 'MusicVideoライブラリは空です。')],
      });
      return;
    }

    const lines = files.map(
      (file) => `${file.index}. ${file.filename} (${formatFileSize(file.size)})`
    );
    let message = `🎬 **MusicVideoライブラリ** (全 ${files.length} 件)\n\n${lines.join('\n')}`;
    if (message.length > 2000) {
      message = `${message.slice(0, 1980)}\n...残りは省略されました`;
    }
    await interaction.editReply({ embeds: [infoEmbed('MusicVideoライブラリ', message)] });
  } catch (error) {
    logger.error(chalk.red('✗ MusicVideo一覧取得エラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}
