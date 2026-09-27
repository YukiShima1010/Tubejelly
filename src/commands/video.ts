import type { ChatInputCommandInteraction } from 'discord.js';
import { downloadAsVideo, getVideoInfo, normalizeYouTubeVideoUrl } from '../utils/download.js';
import { getUserVideoPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, skippedEmbed, successEmbed } from '../utils/discordEmbeds.js';
import { createDiscordDownloadMessage } from '../utils/discordDownloadMessage.js';

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
      embeds: [errorEmbed('MusicVideoの保存先が未設定です。管理者に連絡してください。')],
      ephemeral: true,
    });
    return;
  }

  const inputUrl = interaction.options.getString('url', true);
  const normalizedUrl = normalizeYouTubeVideoUrl(inputUrl);
  if (!normalizedUrl) {
    await interaction.reply({
      embeds: [errorEmbed('無効なYouTube動画URLです。')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const videoInfo = await getVideoInfo(normalizedUrl);
    const mockMessage = createDiscordDownloadMessage((payload) => interaction.followUp(payload));
    const result = await downloadAsVideo(normalizedUrl, videoInfo, mockMessage, videoPath);

    await interaction.editReply({
      embeds: [
        result.skipped
          ? skippedEmbed('ダウンロード済み', `既にダウンロード済みです。\n📁 ${result.filename}`)
          : successEmbed(
              'ダウンロード完了',
              `📁 ${result.filename}\n💾 ${(result.size / 1024 / 1024).toFixed(2)} MB`
            ),
      ],
    });
  } catch (error) {
    logger.error(chalk.red('✗ MusicVideoダウンロードエラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `ダウンロードに失敗しました。\n${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}
