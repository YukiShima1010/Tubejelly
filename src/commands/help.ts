import type { ChatInputCommandInteraction } from 'discord.js';

export const data = {
  name: 'help',
  description: 'TubeJelly Botの使い方を表示',
  dm_permission: true,
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const helpMessage = `
🎵 **TubeJelly Bot - ヘルプ**

YouTube動画をMP3としてダウンロードし、Jellyfinの音楽ライブラリに保存します。

**📥 ダウンロードコマンド**

\`/add\` - YouTube動画を1曲ダウンロード
  • \`url\`: YouTubeのURL（必須）
  • \`title\`: 曲名（省略可）
  • \`artist\`: アーティスト名（省略可）
  • \`album\`: アルバム名（省略可）

  **例:**
  \`/add url:https://youtube.com/watch?v=xxx\`
  \`/add url:https://youtube.com/watch?v=xxx title:素晴らしい曲 artist:歌手A album:アルバムB\`

\`/add_list\` - YouTubeプレイリストを一括ダウンロード
  • \`url\`: プレイリストのURL（必須）
  • \`album\`: アルバム名（省略可、全曲に適用）
  • \`max\`: 最大ダウンロード数（省略可）

  **例:**
  \`/add_list url:https://youtube.com/playlist?list=xxx\`
  \`/add_list url:https://youtube.com/playlist?list=xxx album:ベストアルバム\`

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

**ℹ️ その他**

\`/help\` - このヘルプを表示

**💡 Tips**
• アーティスト名とアルバム名を指定すると、Jellyfinで整理されやすくなります
• ダウンロード済みの曲は自動的にスキップされます
• メタデータを編集すると、ファイルが適切なフォルダ構造に移動します
  （アーティスト/アルバム/曲名.mp3）

**🔗 リンク**
Jellyfin Web UI: http://localhost:8096
`;

  await interaction.reply(helpMessage);
}
