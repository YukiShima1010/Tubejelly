import type { ChatInputCommandInteraction } from 'discord.js';
import {
  getPlaylistInfo,
  downloadPlaylist,
  downloadVideoPlaylist,
  normalizeYouTubePlaylistUrl,
} from '../utils/download.js';
import { formatFileSize } from '../utils/fileManager.js';
import { getUserMusicPath, getUserVideoPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, infoEmbed, successEmbed } from '../utils/discordEmbeds.js';
import { createDiscordDownloadMessage } from '../utils/discordDownloadMessage.js';

export const data = {
  name: 'add_list',
  description: 'YouTubeプレイリストを一括ダウンロード',
  dm_permission: true,
  options: [
    {
      name: 'url',
      type: 3, // STRING
      description: 'YouTubeプレイリストのURL',
      required: true,
    },
    {
      name: 'artist',
      type: 3, // STRING
      description: 'アーティスト名（省略可、すべての曲に適用されます）',
      required: false,
    },
    {
      name: 'album',
      type: 3, // STRING
      description: 'アルバム名（省略可、すべての曲に適用されます）',
      required: false,
    },
    {
      name: 'max',
      type: 4, // INTEGER
      description: '最大ダウンロード数（省略可）',
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
  const customArtist = interaction.options.getString('artist') || undefined;
  const customAlbum = interaction.options.getString('album') || undefined;
  const maxVideos = interaction.options.getInteger('max') || undefined;
  const normalizedUrl = normalizeYouTubePlaylistUrl(url);

  // URLバリデーション
  if (!normalizedUrl) {
    await interaction.reply({
      embeds: [errorEmbed('無効なYouTubeプレイリストURLです。')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    logger.info(chalk.blue(`📋 プレイリスト情報取得中: ${normalizedUrl} (ユーザー: ${userId})`));

    // プレイリスト情報を取得
    const playlistInfo = await getPlaylistInfo(normalizedUrl, maxVideos);

    if (playlistInfo.videos.length === 0) {
      await interaction.editReply({
        embeds: [errorEmbed('プレイリストに動画が見つかりませんでした。')],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        infoEmbed(
          `プレイリスト: ${playlistInfo.title}`,
          `🎵 動画数: ${playlistInfo.videos.length}件\n${customArtist ? `👤 アーティスト: ${customArtist}\n` : ''}${customAlbum ? `💿 アルバム: ${customAlbum}\n` : ''}📥 ダウンロードを開始します...`
        ),
      ],
    });

    logger.info(chalk.blue(`📥 一括ダウンロード開始: ${playlistInfo.videos.length}件`));

    // MessageオブジェクトをMock
    const mockMessage = createDiscordDownloadMessage((payload) => interaction.followUp(payload));

    // 一括ダウンロード実行
    const result = downloadVideo
      ? await downloadVideoPlaylist(playlistInfo, mockMessage, downloadPath)
      : await downloadPlaylist(playlistInfo, mockMessage, downloadPath, customAlbum, customArtist);

    // 結果を集計
    const successCount = result.successful.length;
    const skippedCount = result.skipped.length;
    const failedCount = result.failed.length;

    let resultMessage = `📊 **ダウンロード結果**\n\n`;
    resultMessage += `✅ 成功: ${successCount}件\n`;

    if (skippedCount > 0) {
      resultMessage += `⏭️ スキップ: ${skippedCount}件\n`;
    }

    if (failedCount > 0) {
      resultMessage += `❌ 失敗: ${failedCount}件\n`;
    }

    resultMessage += `💾 合計サイズ: ${formatFileSize(result.totalSize)}`;

    if (failedCount > 0) {
      resultMessage += `\n\n**失敗した動画:**\n`;
      result.failed.slice(0, 5).forEach((fail) => {
        resultMessage += `• ${fail.video.title}\n`;
      });
      if (failedCount > 5) {
        resultMessage += `...他 ${failedCount - 5}件\n`;
      }
    }

    await interaction.followUp({ embeds: [successEmbed('プレイリスト処理完了', resultMessage)] });

    logger.info(
      chalk.green(
        `✓ 一括ダウンロード完了: 成功=${successCount}, スキップ=${skippedCount}, 失敗=${failedCount}`
      )
    );
  } catch (error) {
    logger.error(chalk.red('✗ プレイリストダウンロードエラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `ダウンロードに失敗しました。\n${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}