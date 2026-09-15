import type { ChatInputCommandInteraction } from 'discord.js';
import { getVideoFileByIndex } from '../utils/fileManager.js';
import { getUserVideoPath } from '../utils/userConfig.js';
import { promises as fs } from 'fs';
import chalk from 'chalk';

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
    await interaction.reply({ content: '❌ MusicVideoの保存先が未設定です。', ephemeral: true });
    return;
  }

  const index = interaction.options.getInteger('index', true);
  await interaction.deferReply();

  try {
    const file = await getVideoFileByIndex(index, videoPath);
    if (!file) {
      await interaction.editReply(`❌ 番号 ${index} のMusicVideoが見つかりません。`);
      return;
    }

    await fs.unlink(file.path);
    await interaction.editReply(`✅ 削除完了\n📁 ${file.filename}`);
  } catch (error) {
    console.error(chalk.red('✗ MusicVideo削除エラー:'), error);
    await interaction.editReply(
      `❌ 削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}