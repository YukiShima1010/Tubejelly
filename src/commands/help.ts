import type { ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed } from '../utils/discordEmbeds.js';

export const data = {
  name: 'help',
  description: 'TubeJelly Botの使い方を表示',
  dm_permission: true,
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const helpMessage = `
🎵 **TubeJelly Bot - ヘルプ**

YouTubeの音楽をMP3、MusicVideoをMP4として保存します。

**📥 ダウンロードコマンド**

\`/add\` - YouTube動画を1曲ダウンロード
  • \`url\`: YouTubeのURL（必須）
  • \`title\`: 曲名（省略可）
  • \`artist\`: アーティスト名（省略可）
  • \`album\`: アルバム名（省略可）
  • \`video\`: MusicVideoとして保存（省略時はいいえ）

  **例:**
  \`/add url:https://youtube.com/watch?v=xxx\`
  \`/add url:https://youtu.be/xxx\`
  \`/add url:https://www.youtube.com/live/xxx\`
  \`/add url:https://youtube.com/watch?v=xxx title:素晴らしい曲 artist:歌手A album:アルバムB\`
  \`/add url:https://youtube.com/watch?v=xxx video:True\`

  💡 \`youtube.com/...\` と \`youtu.be/...\` のどちらも利用できます。
  LiveアーカイブURL（\`/live/\`）にも対応しています。

\`/add_list\` - YouTubeプレイリストを一括ダウンロード
  • \`url\`: プレイリストのURL（必須）
  • \`artist\`: アーティスト名（省略可、全曲に適用）
  • \`album\`: アルバム名（省略可、全曲に適用）
  • \`max\`: 最大ダウンロード数（省略可）
  • \`video\`: MusicVideoとして保存（省略時はいいえ）

  **例:**
  \`/add_list url:https://youtube.com/playlist?list=xxx\`
  \`/add_list url:https://youtube.com/playlist?list=xxx artist:歌手A album:ベストアルバム\`

\`/video\` - MusicVideoを単体ダウンロード（最大1080p、MP4）
\`/video_list\` - 保存済みMusicVideoを表示
\`/video_delete index:3\` - 保存済みMusicVideoを削除

**📚 管理コマンド**

\`/list\` - ライブラリ内のすべての曲を表示
  曲番号、ファイル名、メタデータを確認できます。

\`/edit\` - 曲のメタデータを編集
  • \`index\`: 曲の番号（必須、/listで確認）
  • \`title\`: 新しい曲名（省略可）
  • \`artist\`: 新しいアーティスト名（省略可）
  • \`album\`: 新しいアルバム名（省略可）

  **例:**
  \`/edit index:5 title:新しいタイトル artist:新アーティスト\`

\`/delete\` - 曲を削除
  • \`index\`: 削除する曲の番号（必須、/listで確認）

  **例:**
  \`/delete index:3\`

**🎤 アーティスト管理コマンド**

\`/artists list\` - アーティスト一覧を表示
  各アーティストの曲数を確認できます。

\`/artists rename\` - アーティスト名を一括変更
  • \`old\`: 現在のアーティスト名（必須）
  • \`new\`: 新しいアーティスト名（必須）

  **例:**
  \`/artists rename old:チャンネル名 new:正しいアーティスト名\`

  💡 YouTubeのチャンネル名がアーティスト名になっている場合に便利です。

**ℹ️ その他**

\`/help\` - このヘルプを表示

**💡 Tips**
• アーティスト名とアルバム名を指定すると、Jellyfinで整理されやすくなります
• ダウンロード済みの曲は自動的にスキップされます
• メタデータを編集すると、ファイルが適切なフォルダ構造に移動します
  （アーティスト/アルバム/曲名.mp3）
• このBotは登録済みユーザーのみ使用できます

**🔗 リンク**
Jellyfin Web UI: http://localhost:8096
`;

  await interaction.reply({ embeds: [infoEmbed('TubeJelly Bot ヘルプ', helpMessage)] });
}
