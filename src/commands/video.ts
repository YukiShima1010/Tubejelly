import type { ChatInputCommandInteraction } from 'discord.js';
import {
  downloadAsVideo,
  getVideoInfo,
  normalizeYouTubeVideoUrl,
} from '../utils/download.js';
import { getUserVideoPath } from '../utils/userConfig.js';
import chalk from 'chalk';

export const data = {
  name: 'video',
  description: 'YouTube動画をMusicVideoとしてダウンロード',
  dm_permission: true,
  options: [
    {
      name: 'url',
      type: 3,
      description: 'YouTube動画のURL',
      required: true,
    },
  ],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const videoPath = await getUserVideoPath(interaction.user.id);
  if (!videoPath) {
    await interaction.reply({
      content: '❌ MusicVideoの保存先が未設定です。管理者に連絡してください。',
      ephemeral: true,
    });
    return;
  }

  const inputUrl = interaction.options.getString('url', true);
  const normalizedUrl = normalizeYouTubeVideoUrl(inputUrl);
  if (!normalizedUrl) {
    await interaction.reply({ content: '❌ 無効なYouTube動画URLです。', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const videoInfo = await getVideoInfo(normalizedUrl);
    const message = await interaction.fetchReply();
    const mockMessage = {
      channel: {
        send: async (content: string) => {
          await interaction.followUp(content);
          return message;
        },
      },
    } as any;
    const result = await downloadAsVideo(normalizedUrl, videoInfo, mockMessage, videoPath);

    await interaction.editReply(
      result.skipped
        ? `⏭️ **スキップ**\n既にダウンロード済みです。\n📁 ${result.filename}`
        : `✅ **ダウンロード完了**\n📁 ${result.filename}\n💾 ${(result.size / 1024 / 1024).toFixed(2)} MB`
    );
  } catch (error) {
    console.error(chalk.red('✗ MusicVideoダウンロードエラー:'), error);
    await interaction.editReply(
      `❌ **ダウンロード失敗**\nエラー: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}