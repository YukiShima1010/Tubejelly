import type { ChatInputCommandInteraction } from 'discord.js';
import { getVideoInfo, downloadAsMP3, normalizeYouTubeVideoUrl } from '../utils/download.js';
import { getUserMusicPath } from '../utils/userConfig.js';
import chalk from 'chalk';

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
  ],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const musicPath = await getUserMusicPath(userId);

  if (!musicPath) {
    await interaction.reply({
      content: '❌ あなたはこのBotの使用が許可されていません。管理者に連絡してください。',
      ephemeral: true,
    });
    return;
  }

  const url = interaction.options.getString('url', true);
  const customTitle = interaction.options.getString('title') || undefined;
  const customArtist = interaction.options.getString('artist') || undefined;
  const customAlbum = interaction.options.getString('album') || undefined;
  const normalizedUrl = normalizeYouTubeVideoUrl(url);

  // URLバリデーション
  if (!normalizedUrl) {
    await interaction.reply({
      content: '❌ 無効なYouTube動画URLです。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    console.log(chalk.blue(`📥 ダウンロード開始: ${normalizedUrl} (ユーザー: ${userId})`));

    // 動画情報を取得
    const videoInfo = await getVideoInfo(normalizedUrl);

    // カスタムメタデータを構築
    const customMetadata = {
      title: customTitle,
      artist: customArtist,
      album: customAlbum,
    };

    // ダウンロード実行（Messageオブジェクトの代わりにinteractionを使用）
    const message = await interaction.fetchReply();

    // MessageオブジェクトをMock
    const mockMessage = {
      channel: {
        send: async (content: string) => {
          await interaction.followUp(content);
          return message;
        },
      },
    } as any;

    const result = await downloadAsMP3(
      normalizedUrl,
      videoInfo,
      mockMessage,
      musicPath,
      customMetadata
    );

    if (result.skipped) {
      await interaction.editReply(
        `⏭️ **スキップ**\n` + `この曲は既にダウンロード済みです。\n` + `📁 ${result.filename}`
      );
    } else {
      const metadataInfo = [];
      if (customTitle) metadataInfo.push(`🎵 ${customTitle}`);
      if (customArtist) metadataInfo.push(`👤 ${customArtist}`);
      if (customAlbum) metadataInfo.push(`💿 ${customAlbum}`);

      await interaction.editReply(
        `✅ **ダウンロード完了！**\n` +
          `📁 ${result.filename}\n` +
          (metadataInfo.length > 0 ? metadataInfo.join('\n') + '\n' : '') +
          `💾 サイズ: ${(result.size / 1024 / 1024).toFixed(2)} MB`
      );
    }

    console.log(chalk.green(`✓ ダウンロード完了: ${result.filename}`));
  } catch (error) {
    console.error(chalk.red('✗ ダウンロードエラー:'), error);
    await interaction.editReply(
      `❌ **ダウンロード失敗**\n` +
        `エラー: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
