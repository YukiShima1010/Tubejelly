# 🎵 TubeJelly

Discord の DM で YouTube URL を送信すると、自動的に MP3 でダウンロードして Jellyfin の音楽ライブラリに保存する Discord Bot です。

## ✨ 特徴

- 🤖 **簡単操作**: DM に YouTube URL を送るだけ
- 🎵 **高品質 MP3**: 320kbps の高品質でダウンロード
- 📦 **自動保存**: Jellyfin の音楽ライブラリに自動保存
- 🐳 **Docker 対応**: 簡単にデプロイ可能
- 🎨 **リッチな UX**:
  - リアクションによる進捗表示
  - ダウンロード進捗のパーセンテージ表示
  - 動画情報の詳細表示（タイトル、投稿者、再生時間、ファイルサイズ）
  - カラフルなコンソールログ
- 🔷 **TypeScript**: 型安全で保守性の高いコード
- ⚡ **Node.js 22**: 最新の Node.js 環境
- 📦 **pnpm**: 高速で効率的なパッケージマネージャー

## 📋 必要なもの

- Docker & Docker Compose
- Discord Bot Token
- Jellyfin の音楽ライブラリへのアクセス

### ローカル開発の場合

- Node.js 22 以上
- pnpm 9 以上
- yt-dlp (YouTube 動画ダウンロード)
- ffmpeg (音声変換)

## 🚀 セットアップ

### 1. Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「New Application」をクリック
3. アプリケーション名を入力（例: TubeJelly）
4. 左メニューから「Bot」を選択
5. 「Add Bot」をクリック
6. 「MESSAGE CONTENT INTENT」を有効化（重要！）
7. 「Reset Token」をクリックしてトークンをコピー

### 2. Bot を自分のアカウントに招待

1. 左メニューから「OAuth2」→「URL Generator」を選択
2. **SCOPES**で「bot」を選択
3. **BOT PERMISSIONS**で以下を選択:
   - Send Messages
   - Add Reactions
   - Read Message History
4. 生成された URL をブラウザで開き、Bot を追加

### 3. 環境変数と Docker の設定

#### ステップ 1: `.env` ファイルを作成

```bash
# .env.example をコピー
cp .env.example .env

# .env を編集
nano .env
```

`.env` ファイルに以下を設定:

```env
DISCORD_TOKEN=your_discord_bot_token_here
# Docker使用時は必ず /music に設定してください（重要！）
JELLYFIN_MUSIC_PATH=/music
```

#### ステップ 2: `docker-compose.yml` でボリュームマウントを設定

`docker-compose.yml` を編集して、ホストマシンの Jellyfin 音楽ディレクトリをマウントします：

```yaml
volumes:
  # ホストのパスをコンテナの/musicにマウント
  # 【重要】以下の /path/to/jellyfin/music をあなたの実際のパスに変更してください
  - /path/to/jellyfin/music:/music
  - ./downloads:/app/downloads
```

例（macOS の場合）:
```yaml
volumes:
  - /Users/username/Music/Jellyfin:/music
  - ./downloads:/app/downloads
```

### 4. Docker Compose で起動

```bash
# Dockerイメージのビルドと起動
docker-compose up -d

# ログの確認
docker-compose logs -f
```

起動時に以下のように表示されればOK:
```
🎵 TubeJelly Bot が起動しました！
   ログイン: your-bot#1234
   保存先: /music ✅
   yt-dlp: v2025.11.12
```

## 📖 使い方

1. **Bot に DM を送信**
   Discord 上で Bot にダイレクトメッセージを送信

2. **YouTube URL を送信**

   ```
   https://www.youtube.com/watch?v=dQw4w9WgXcQ
   ```

   または

   ```
   https://youtu.be/dQw4w9WgXcQ
   ```

3. **自動ダウンロード開始**

   - 👀 リクエスト確認
   - ⬇️ ダウンロード中
   - 🔄 MP3 変換中
   - ✅ 完了！

4. **Jellyfin で再生**
   ダウンロードされた音楽は Jellyfin のライブラリに自動的に追加されます

### ヘルプコマンド

DM で `help` または `ヘルプ` と送信すると、使い方を表示します。

## 🎨 UX 機能

### リアクション

- 👀 リクエストを確認しました
- ⬇️ ダウンロード中
- ✅ 完了しました
- ❌ エラーが発生しました

### 進捗表示

ダウンロード中はパーセンテージで進捗を表示:

```
🎵 ダウンロード中... 45%
```

### 完了メッセージ

```
✅ ダウンロード完了！

🎬 Song Title
👤 Artist Name
⏱️ 3:45
📦 8.52 MB

📂 保存先: `Artist Name - Song Title.mp3`
```

## 🛠️ ローカル開発

Docker を使わずにローカルで開発する場合:

```bash
# 依存関係のインストール
pnpm install

# yt-dlpのインストール（macOS）
brew install yt-dlp ffmpeg

# yt-dlpのインストール（Ubuntu/Debian）
sudo apt-get install python3-pip ffmpeg
pip3 install yt-dlp

# yt-dlpのインストール（その他）
pip3 install yt-dlp

# 開発モード（ファイル監視、型チェックなし）
pnpm dev

# TypeScriptビルド
pnpm build

# ビルド後の起動
## 📁 プロジェクト構造

```

tubejelly/
├── src/
│ └── index.ts # メインの Bot コード（TypeScript）
├── dist/ # ビルド後の JavaScript
├── downloads/ # 一時ダウンロードディレクトリ
├── .vscode/ # VS Code 設定
│ ├── extensions.json # 推奨拡張機能
│ ├── launch.json # デバッグ設定
│ └── settings.json # エディタ設定
├── .env # 環境変数（gitignore）
├── .env.example # 環境変数のテンプレート
├── .gitignore
├── .dockerignore
├── .npmrc # pnpm 設定
├── .prettierrc # Prettier 設定
├── eslint.config.js # ESLint 設定
├── tsconfig.json # TypeScript 設定
├── Dockerfile # Docker イメージ定義
├── docker-compose.yml # Docker Compose 設定
├── package.json
└── README.md

```

## 🔧 技術スタック

### 言語・ランタイム
- **TypeScript 5.7**: 型安全な開発
- **Node.js 22**: 最新のJavaScript機能

### パッケージマネージャー
- **pnpm 9**: 高速で効率的な依存関係管理

### 主要ライブラリ
- **Discord.js 14**: Discord Bot開発
- **yt-dlp**: YouTube動画ダウンロード（Pythonツール）
- **chalk**: コンソールカラーリング
- **execa**: プロセス実行

### 開発ツール
- **tsx**: TypeScript直接実行
- **ESLint**: コード品質チェック
- **Prettier**: コードフォーマット VS Code デバッグ

F5キーでデバッガーを起動できます。以下の2つの設定があります:
- **Launch Bot (Dev)**: TypeScriptを直接実行（tsx使用）
- **Launch Bot (Built)**: ビルド後のJavaScriptを実行

## 📁 プロジェクト構造

```

tubejelly/
├── src/
│ └── index.js # メインの Bot コード
├── downloads/ # 一時ダウンロードディレクトリ
├── .env # 環境変数（gitignore）
├── .env.example # 環境変数のテンプレート
├── .gitignore
├── .dockerignore
├── Dockerfile # Docker イメージ定義
├── docker-compose.yml # Docker Compose 設定
├── package.json
└── README.md

````

## 🔧 設定

### 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `DISCORD_TOKEN` | Discord BotのToken | (必須) |
| `JELLYFIN_MUSIC_PATH` | 音楽の保存先パス | `/music` |

### Docker Composeのカスタマイズ

`docker-compose.yml` でリソース制限などを調整できます:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
````

## 🐛 トラブルシューティング

## 🙏 使用技術

- [Discord.js](https://discord.js.org/) - Discord Bot 開発
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube 動画ダウンロード
- [chalk](https://github.com/chalk/chalk) - コンソールカラーリング
- [execa](https://github.com/sindresorhus/execa) - プロセス実行
- [TypeScript](https://www.typescriptlang.org/) - 型安全な開発
- [pnpm](https://pnpm.io/) - 高速パッケージマネージャー
- ffmpeg がインストールされているか確認
- YouTube URL が正しいか確認
- インターネット接続を確認

### ファイルが保存されない

- `JELLYFIN_MUSIC_PATH`のパスが正しいか確認
- Docker 使用時はボリュームマウントが正しいか確認
- ディレクトリの書き込み権限を確認

### ログの確認

```bash
# Dockerログ
docker-compose logs -f

# コンテナに入る
docker exec -it tubejelly-bot sh
```

## 🙏 使用技術

- [Discord.js](https://discord.js.org/) - Discord Bot 開発
- [@distube/ytdl-core](https://github.com/distubejs/ytdl-core) - YouTube 動画ダウンロード
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - 音声変換
- [chalk](https://github.com/chalk/chalk) - コンソールカラーリング

## 🎯 今後の機能予定

- [ ] プレイリスト対応（URL+件数などで）
- [ ] アーティスト/アルバム情報の自動取得
- [ ] Jellyfin API との連携

---

Made with ❤️ for music lovers
