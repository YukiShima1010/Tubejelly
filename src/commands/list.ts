import type { ChatInputCommandInteraction } from 'discord.js';
import { getAllMusicFiles, formatFileSize } from '../utils/fileManager.js';
import { getUserMusicPath } from '../utils/userConfig.js';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { errorEmbed, infoEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'list',
  description: '音楽ライブラリ内のすべての曲を表示',
  dm_permission: true,
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

  await interaction.deferReply();

  try {
    logger.info(chalk.blue('📋 音楽ファイル一覧取得中...'));

    const files = await getAllMusicFiles(musicPath);

    if (files.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed('音楽ライブラリ', '音楽ライブラリは空です。')],
      });
      return;
    }

    // ページネーション用に分割（1ページ10件）
    const itemsPerPage = 10;
    const totalPages = Math.ceil(files.length / itemsPerPage);

    // 最初のページを表示
    let message = `📚 **音楽ライブラリ** (全 ${files.length} 曲)\n\n`;

    const startIndex = 0;
    const endIndex = Math.min(itemsPerPage, files.length);

    for (let i = startIndex; i < endIndex; i++) {
      const file = files[i];
      message += `**${file.index}.** ${file.filename}\n`;

      const metadata = [];
      if (file.title) metadata.push(`🎵 ${file.title}`);
      if (file.artist) metadata.push(`👤 ${file.artist}`);
      if (file.album) metadata.push(`💿 ${file.album}`);
      if (metadata.length > 0) {
        message += `   ${metadata.join(' | ')}\n`;
      }

      message += `   💾 ${formatFileSize(file.size)}\n\n`;
    }

    if (totalPages > 1) {
      message += `\n📄 ページ 1/${totalPages}\n`;
      message += `次のページを見るには \`/list\` コマンドを再度実行してください。`;
    }

    // 2000文字制限対策
    if (message.length > 2000) {
      // シンプルなリスト形式に変更
      message = `📚 **音楽ライブラリ** (全 ${files.length} 曲)\n\n`;
      for (let i = 0; i < Math.min(20, files.length); i++) {
        const file = files[i];
        message += `${file.index}. ${file.filename}\n`;
      }
      if (files.length > 20) {
        message += `\n...他 ${files.length - 20} 曲`;
      }
    }

    await interaction.editReply({ embeds: [infoEmbed('音楽ライブラリ', message)] });
    logger.info(chalk.green(`✓ 音楽ファイル一覧表示: ${files.length}件`));
  } catch (error) {
    logger.error(chalk.red('✗ 一覧取得エラー:'), error);
    await interaction.editReply({
      embeds: [
        errorEmbed(
          `一覧の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    });
  }
}
