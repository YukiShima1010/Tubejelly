import type { ChatInputCommandInteraction } from 'discord.js';
import {
  getVideoInfo,
  downloadAsMP3,
  downloadAsVideo,
  normalizeYouTubeVideoUrl,
} from '../utils/download.js';
import { getUserMusicPath, getUserVideoPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, skippedEmbed, successEmbed } from '../utils/discordEmbeds.js';
import { createDiscordDownloadMessage } from '../utils/discordDownloadMessage.js';

export const data = {
  name: 'add',
  description: 'YouTube動画をMP3としてダウンロード',
  dm_permission: true,
  options: [
    {
      name: 'url',
      type: 3, // STRING
      description: 'YouTubeのURL',
      required: true,
    },
    {
      name: 'title',
      type: 3, // STRING
      description: '曲名（省略可）',
      required: false,
    },
    {
      name: 'artist',
      type: 3, // STRING
      description: 'アーティスト名（省略可）',
      required: false,
    },
    {
      name: 'album',
      type: 3, // STRING
      description: 'アルバム名（省略可）',
      required: false,
    },
    {
      name: 'video',
      type: 5, // BOOLEAN
      description: 'ミュージックビデオとして保存する（初期値: いいえ）',
      required: false,
    },
  ],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const url = interaction.options.getString('url', true);
  const downloadVideo = interaction.options.getBoolean('video') ?? false;
  const downloadPath = downloadVideo
    ? await getUserVideoPath(userId)
    : await getUserMusicPath(userId);

  if (!downloadPath) {
    await interaction.reply({
      embeds: [errorEmbed('この種類のダウンロードが許可されていないか、保存先が未設定です。')],
      ephemeral: true,
    });
    return;
  }
  const customTitle = interaction.options.getString('title') || undefined;
  const customArtist = interaction.options.getString('artist') || undefined;
  const customAlbum = interaction.options.getString('album') || undefined;
  const normalizedUrl = normalizeYouTubeVideoUrl(url);

  // URLバリデーション
  if (!normalizedUrl) {
    await interaction.reply({
      embeds: [errorEmbed('無効なYouTube動画URLです。')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    logger.info(chalk.blue(`📥 ダウンロード開始: ${normalizedUrl} (ユーザー: ${userId})`));

    // 動画情報を取得
    const videoInfo = await getVideoInfo(normalizedUrl);

    // カスタムメタデータを構築
    const customMetadata = {
      title: customTitle,
      artist: customArtist,
      album: customAlbum,
    };

    // ダウンロード実行（Messageオブジェクトの代わりにinteractionを使用）
    const mockMessage = createDiscordDownloadMessage((payload) => interaction.followUp(payload));

    const result = downloadVideo
      ? await downloadAsVideo(normalizedUrl, videoInfo, mockMessage, downloadPath)
      : await downloadAsMP3(normalizedUrl, videoInfo, mockMessage, downloadPath, customMetadata);

    if (result.skipped) {
      await interaction.editReply({
        embeds: [
          skippedEmbed(
            'ダウンロード済み',
            `この曲は既にダウンロード済みです。\n📁 ${result.filename}`
          ),
        ],
      });
    } else {
      const metadataInfo = [];
      if (customTitle) metadataInfo.push(`🎵 ${customTitle}`);
      if (customArtist) metadataInfo.push(`👤 ${customArtist}`);
      if (customAlbum) metadataInfo.push(`💿 ${customAlbum}`);

      await interaction.editReply({
        embeds: [
          successEmbed(
            'ダウンロード完了',
            `📁 ${result.filename}\n${metadataInfo.length > 0 ? `${metadataInfo.join('\n')}\n` : ''}💾 サイズ: ${(result.size / 1024 / 1024).toFixed(2)} MB`
          ),
        ],
      });
    }

    logger.info(chalk.green(`✓ ダウンロード完了: ${result.filename}`));
  } catch (error) {
    logger.error(chalk.red('✗ ダウンロードエラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `ダウンロードに失敗しました。\n${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}