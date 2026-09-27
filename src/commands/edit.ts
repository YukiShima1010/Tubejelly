import type { ChatInputCommandInteraction } from 'discord.js';
import { getMusicFileByIndex } from '../utils/fileManager.js';
import { setMetadataAndOrganize } from '../utils/metadata.js';
import { getUserMusicPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, successEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'edit',
  description: '曲のメタデータを編集',
  dm_permission: true,
  options: [
    {
      name: 'index',
      type: 4, // INTEGER
      description: '曲の番号（/listで確認）',
      required: true,
    },
    {
      name: 'title',
      type: 3, // STRING
      description: '新しい曲名（省略可）',
      required: false,
    },
    {
      name: 'artist',
      type: 3, // STRING
      description: '新しいアーティスト名（省略可）',
      required: false,
    },
    {
      name: 'album',
      type: 3, // STRING
      description: '新しいアルバム名（省略可）',
      required: false,
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
  const newTitle = interaction.options.getString('title') || undefined;
  const newArtist = interaction.options.getString('artist') || undefined;
  const newAlbum = interaction.options.getString('album') || undefined;

  // 少なくとも1つの変更が必要
  if (!newTitle && !newArtist && !newAlbum) {
    await interaction.reply({
      embeds: [errorEmbed('少なくとも1つのメタデータ（曲名、アーティスト、アルバム）を指定してください。')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    logger.info(chalk.blue(`✏️ メタデータ編集開始: インデックス=${index}`));

    // ファイルを取得
    const file = await getMusicFileByIndex(index, musicPath);

    if (!file) {
      await interaction.editReply({ embeds: [errorEmbed(`番号 ${index} の曲が見つかりませんでした。\n\`/list\` コマンドで曲の一覧を確認してください。`)] });
      return;
    }

    // 現在のメタデータと新しいメタデータをマージ
    const metadata = {
      title: newTitle || file.title || file.filename.replace('.mp3', ''),
      artist: newArtist || file.artist || 'Unknown Artist',
      album: newAlbum || file.album,
    };

    // メタデータを更新してファイルを整理
    const result = await setMetadataAndOrganize(file.path, metadata, musicPath);

    if (!result.success) {
      await interaction.editReply({ embeds: [errorEmbed(`メタデータの更新に失敗しました: ${result.error}`)] });
      return;
    }

    const changes = [];
    if (newTitle) changes.push(`🎵 曲名: ${newTitle}`);
    if (newArtist) changes.push(`👤 アーティスト: ${newArtist}`);
    if (newAlbum) changes.push(`💿 アルバム: ${newAlbum}`);

    await interaction.editReply({ embeds: [successEmbed('メタデータを更新しました', `📁 元のファイル: ${file.filename}\n${result.newPath !== file.path ? `📁 新しい場所: ${result.newPath}\n` : ''}\n**変更内容:**\n${changes.join('\n')}`)] });

    logger.info(chalk.green(`✓ メタデータ更新完了: ${file.filename}`));
  } catch (error) {
    logger.error(chalk.red('✗ メタデータ編集エラー:'), error);
    await interaction.editReply({ embeds: [errorEmbed(`メタデータの編集に失敗しました: ${error instanceof Error ? error.message : String(error)}`)] });
  }
}