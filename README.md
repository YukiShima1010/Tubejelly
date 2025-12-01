# 🎵 TubeJelly

Discord の DM で YouTube URL を送信すると、自動的に MP3 でダウンロードして Jellyfin の音楽ライブラリに保存する Discord Bot です。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange)](https://pnpm.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)

---

## ✨ 主な機能

| 機能                    | 説明                                |
| ----------------------- | ----------------------------------- |
| 🤖 **簡単操作**         | DM に YouTube URL を送るだけ        |
| 🎵 **高品質 MP3**       | 320kbps の高品質でダウンロード      |
| 📦 **自動保存**         | Jellyfin の音楽ライブラリに自動保存 |
| 🎼 **プレイリスト対応** | 一括ダウンロード & 件数指定可能     |
| 🔄 **重複検出**         | 既存ファイルを自動検出してスキップ  |
| 🐳 **Docker 対応**      | 簡単にデプロイ可能                  |

### 🎨 リッチな UX

- ✅ リアクションによる進捗表示
- 📊 プログレスバー付きダウンロード進捗
- 📋 詳細な動画情報表示（タイトル、投稿者、再生時間、ファイルサイズ）
- 📈 プレイリスト一括処理の統計情報
- 🎯 視覚的に見やすいフォーマット
- 🌈 カラフルなコンソールログ

### 💻 技術スタック

- 🔷 **TypeScript 5.7** - 型安全で保守性の高いコード
- ⚡ **Node.js 22** - 最新の JavaScript 機能
- 📦 **pnpm 9** - 高速で効率的なパッケージマネージャー

---

---

## 📋 必要なもの

### Docker 使用時（推奨）

- ✅ Docker & Docker Compose
- ✅ Discord Bot Token
- ✅ Jellyfin の音楽ライブラリへのアクセス

### ローカル開発の場合

- ✅ Node.js 22 以上
- ✅ pnpm 9 以上
- ✅ yt-dlp（YouTube 動画ダウンロード）
- ✅ ffmpeg（音声変換）

---

---

## 🚀 クイックスタート

### 1️⃣ Discord Bot の作成

<details>
<summary><b>詳細手順を表示</b></summary>

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「**New Application**」をクリック
3. アプリケーション名を入力（例: `TubeJelly`）
4. 左メニューから「**Bot**」を選択
5. 「**Add Bot**」をクリック
6. 「**MESSAGE CONTENT INTENT**」を有効化 ⚠️ **重要！**
7. 「**Reset Token**」をクリックしてトークンをコピー

</details>

### 2️⃣ Bot を自分のアカウントに招待

<details>
<summary><b>詳細手順を表示</b></summary>

1. 左メニューから「**OAuth2**」→「**URL Generator**」を選択
2. **SCOPES** で「**bot**」を選択
3. **BOT PERMISSIONS** で以下を選択:
   - ✅ Send Messages
   - ✅ Add Reactions
   - ✅ Read Message History
4. 生成された URL をブラウザで開き、Bot を追加

</details>

### 3️⃣ 環境変数と Docker の設定

#### ステップ A: `.env` ファイルを作成

```bash
# .env.example をコピー
cp .env.example .env

# .env を編集
nano .env
```

`.env` ファイルの内容:

```env
DISCORD_TOKEN=your_discord_bot_token_here
# Docker使用時は必ず /music に設定してください
JELLYFIN_MUSIC_PATH=/music
```

#### ステップ B: `docker-compose.yml` でボリュームマウントを設定

`docker-compose.yml` を編集して、ホストマシンの Jellyfin 音楽ディレクトリをマウント:

```yaml
volumes:
  # ⚠️ 重要: 以下の /path/to/jellyfin/music をあなたの実際のパスに変更
  - /path/to/jellyfin/music:/music
```

**例（macOS の場合）:**

```yaml
volumes:
  - /Users/username/Music/Jellyfin:/music
```

### 4️⃣ Docker Compose で起動

```bash
# Dockerイメージのビルドと起動
docker-compose up -d

# ログの確認
docker-compose logs -f
```

**✅ 起動成功の確認:**

```
🎵 TubeJelly Bot が起動しました！
   ログイン: your-bot#1234
   保存先: /music ✅
   yt-dlp: v2025.11.12
```

---

---

## 📖 使い方

### 基本的な使い方

1. **Discord で Bot に DM を送信**
2. **YouTube URL を送信**
3. **自動ダウンロード開始！**
4. **Jellyfin で再生** 🎉

### URL の送信方法

#### 🎬 単一動画

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

または

```
https://youtu.be/dQw4w9WgXcQ
```

#### 📋 プレイリスト（全てダウンロード）

```
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxx
```

#### 📋 プレイリスト（件数指定）

```
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxx 5
```

💡 スペースの後に数字を入れると、その件数だけダウンロードします

### ヘルプコマンド

DM で `help` または `ヘルプ` と送信すると、使い方を表示します。

---

---

## 🎨 UI/UX プレビュー

### リアクションによる進捗表示

| リアクション | 意味                     |
| ------------ | ------------------------ |
| 👀           | リクエストを確認しました |
| 📋           | プレイリスト情報を取得中 |
| ⬇️           | ダウンロード中           |
| ✅           | 完了しました             |
| ❌           | エラーが発生しました     |

### ダウンロード進捗

<details>
<summary><b>単一動画の場合</b></summary>

```
🎵 Song Title
👤 Artist Name | ⏱️ 3:45
📥 ダウンロード中: 60%
[████████████░░░░░░░░]
```

</details>

<details>
<summary><b>プレイリストの場合</b></summary>

```
[1/10] 🎵 Song Title 1
👤 Artist 1 | ⏱️ 4:12
📥 ダウンロード中: 80%
[████████████████░░░░]

[2/10] ⏭️ スキップ（既に存在します）
📦 8.52 MB
```

</details>

### 完了メッセージ

<details>
<summary><b>単一動画 - 成功</b></summary>

```
━━━━━━━━━━━━━━━━━━━━
✅ ダウンロード完了！

🎬 Song Title
👤 投稿者: Artist Name
⏱️ 再生時間: 3:45
📦 ファイルサイズ: 8.52 MB
━━━━━━━━━━━━━━━━━━━━

📂 保存先: `Artist Name - Song Title.mp3`

🎉 Jellyfinでお楽しみください！
```

</details>

<details>
<summary><b>単一動画 - 重複スキップ</b></summary>

```
━━━━━━━━━━━━━━━━━━━━
⏭️ スキップしました（既に存在）

🎬 Song Title
👤 投稿者: Artist Name
⏱️ 再生時間: 3:45
📦 ファイルサイズ: 8.52 MB
━━━━━━━━━━━━━━━━━━━━

📂 保存先: `Artist Name - Song Title.mp3`

💡 このファイルは既にJellyfinライブラリに存在します
```

</details>

<details>
<summary><b>プレイリスト - 完了</b></summary>

```
✅ プレイリストダウンロード完了！

━━━━━━━━━━━━━━━━━━━━
📊 処理結果
✅ 新規ダウンロード: 8件
⏭️ スキップ（重複）: 2件
📦 合計サイズ: 85.42 MB
⏱️ 処理時間: 5:23
━━━━━━━━━━━━━━━━━━━━

✨ 新規ダウンロードファイル:
🎵 `Artist1 - Song1.mp3`
   📦 8.52 MB
🎵 `Artist2 - Song2.mp3`
   📦 7.83 MB
...

⏭️ スキップされたファイル:
• `Artist3 - Song3.mp3` (9.21 MB)
• `Artist4 - Song4.mp3` (8.15 MB)

🎉 Jellyfinでお楽しみください！
```

</details>

---

---

## 🛠️ ローカル開発

Docker を使わずにローカルで開発する場合:

### 依存関係のインストール

```bash
# パッケージのインストール
pnpm install

# yt-dlp のインストール
# macOS
brew install yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt-get install python3-pip ffmpeg
pip3 install yt-dlp

# その他の環境
pip3 install yt-dlp
```

### 開発コマンド

| コマンド         | 説明                       |
| ---------------- | -------------------------- |
| `pnpm dev`       | 開発モード（ファイル監視） |
| `pnpm build`     | TypeScript ビルド          |
| `pnpm start`     | ビルド後の起動             |
| `pnpm typecheck` | 型チェック                 |
| `pnpm lint`      | コード品質チェック         |
| `pnpm lint:fix`  | コード自動修正             |

### VS Code デバッグ

F5 キーでデバッガーを起動できます:

- **Launch Bot (Dev)** - TypeScript を直接実行（tsx 使用）
- **Launch Bot (Built)** - ビルド後の JavaScript を実行

---

---

## 📁 プロジェクト構造

```
tubejelly/
├── src/
│   └── index.ts          # メインの Bot コード（TypeScript）
├── dist/                 # ビルド後の JavaScript
├── .vscode/              # VS Code 設定
│   ├── extensions.json   # 推奨拡張機能
│   ├── launch.json       # デバッグ設定
│   └── settings.json     # エディタ設定
├── .env                  # 環境変数（gitignore）
├── .env.example          # 環境変数のテンプレート
├── .gitignore
├── .dockerignore
├── .npmrc                # pnpm 設定
├── .prettierrc           # Prettier 設定
├── eslint.config.js      # ESLint 設定
├── tsconfig.json         # TypeScript 設定
├── Dockerfile            # Docker イメージ定義
├── docker-compose.yml    # Docker Compose 設定
├── package.json
└── README.md
```

---

## 🔧 技術スタック

### コア技術

| カテゴリ       | 技術           | 説明                       |
| -------------- | -------------- | -------------------------- |
| 言語           | TypeScript 5.7 | 型安全な開発               |
| ランタイム     | Node.js 22     | 最新の JavaScript 機能     |
| パッケージ管理 | pnpm 9         | 高速で効率的な依存関係管理 |

### 主要ライブラリ

| ライブラリ                                     | 用途                     |
| ---------------------------------------------- | ------------------------ |
| [Discord.js 14](https://discord.js.org/)       | Discord Bot 開発         |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp)     | YouTube 動画ダウンロード |
| [chalk](https://github.com/chalk/chalk)        | コンソールカラーリング   |
| [execa](https://github.com/sindresorhus/execa) | プロセス実行             |

### 開発ツール

- **tsx** - TypeScript 直接実行
- **ESLint** - コード品質チェック
- **Prettier** - コードフォーマット

---

## ⚙️ 設定

### 環境変数

| 変数名                | 説明                 | デフォルト |
| --------------------- | -------------------- | ---------- |
| `DISCORD_TOKEN`       | Discord Bot の Token | (必須)     |
| `JELLYFIN_MUSIC_PATH` | 音楽の保存先パス     | `/music`   |

### Docker Compose のカスタマイズ

`docker-compose.yml` でリソース制限などを調整できます:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

---

---

## 🐛 トラブルシューティング

### ダウンロードが失敗する

- ✅ yt-dlp がインストールされているか確認
- ✅ ffmpeg がインストールされているか確認
- ✅ YouTube URL が正しいか確認
- ✅ インターネット接続を確認

### ファイルが保存されない

- ✅ `JELLYFIN_MUSIC_PATH` のパスが正しいか確認
- ✅ Docker 使用時はボリュームマウントが正しいか確認
- ✅ ディレクトリの書き込み権限を確認

### ログの確認

```bash
# Docker ログ
docker-compose logs -f

# コンテナに入る
docker exec -it tubejelly-bot sh
```

---

## 🎯 今後の機能予定

### ✅ 実装済み

- ✅ **プレイリスト対応**
  - プレイリスト全体のダウンロード
  - 件数指定でのダウンロード（例: `{URL} 10` で最初の 10 件）
  - 詳細な進捗表示と統計情報
- ✅ **重複ファイルの検出と回避**
  - ファイル名の完全一致で自動検出
  - 重複ファイルは自動的にスキップ
  - プレイリストでのスキップ統計表示

### 🔜 今後実装予定

- [ ] ダウンロード履歴の記録
- [ ] ユーザー別の設定保存（音質など）
- [ ] ID3 タグの自動編集機能

### 💡 Jellyfin API 連携について

Jellyfin API との連携機能は **不要** と判断しています。

**理由:**

- ✅ Jellyfin の自動スキャン機能が優秀
- ✅ ディレクトリに MP3 を追加するだけで自動検出
- ✅ ID3 タグから自動的にメタデータを抽出
- ✅ より詳細なメタデータは Jellyfin の設定で外部データベース連携可能

**設計思想:**  
TubeJelly は「MP3 ファイルを適切に保存する」ことに集中し、メタデータ管理は Jellyfin に任せる設計としています。

---

## 🙏 使用技術

このプロジェクトは以下のオープンソースプロジェクトを使用しています:

- [Discord.js](https://discord.js.org/) - Discord Bot 開発
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube 動画ダウンロード
- [chalk](https://github.com/chalk/chalk) - コンソールカラーリング
- [execa](https://github.com/sindresorhus/execa) - プロセス実行
- [TypeScript](https://www.typescriptlang.org/) - 型安全な開発
- [pnpm](https://pnpm.io/) - 高速パッケージマネージャー

---

## 📄 ライセンス

MIT License

---

<div align="center">

Made with ❤️ for music lovers

**[⭐ このプロジェクトにスターを付ける](https://github.com/YukiShima1010/tubejelly)**

</div>
