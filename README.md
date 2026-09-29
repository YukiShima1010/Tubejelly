# 🎶 TubeJelly

<div align="center">

<img width="2240" height="1260" alt="Tubejelly-header" src="https://github.com/user-attachments/assets/f7690e0b-617d-49ee-aae0-49a1b65da611" />

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC.svg?logo=typescript&style=flat&logoColor=white">
  <img src="https://img.shields.io/badge/Discord.js-5865F2.svg?logo=discord&style=flat&logoColor=white">
  <img src="https://img.shields.io/badge/Node.js-339933.svg?logo=node.js&style=flat&logoColor=white">
  <img src="https://img.shields.io/badge/Docker-2496ED.svg?logo=docker&style=flat&logoColor=white">
</p>

**好きな音楽を好きなだけ**

_簡単に音楽をJellyfinのライブラリに追加_

[セットアップガイド](./doc/setup/GETTING_STARTED.md) • [利用ガイド](./doc/USAGE.md) • [運用ガイド](./doc/RASPBERRY_PI_OPERATIONS.md) • [トラブルシューティング](./doc/TROUBLESHOOTING.md)

</div>

TubeJellyは、YouTube上に投稿されている音楽及びMusicVideoをDiscordまたはLINEで送信するだけで、Jellyfinのライブラリへ保存することのできるBot及びその機能を提供するシステムです。

なお、初期OSS公開バージョンは`3.0.0`です。

---

## 機能

- DiscordBotを介してYouTubeの音楽やMusicVideoをJellyfinのライブラリに保存
- LINE Messaging API(LINE公式アカウント)を介してYouTubeの音楽やMusicVideoをJellyfinのライブラリに保存
- YouTubeのライブラリの一括保存、個数制限での保存
- ミュージックビデオのダウンロード（最大画質は容量の都合で1080p）
- 音楽とMusicVideoを別々のホストディレクトリへ保存
- ダウンロード済みの音楽の重複保存を防止
- ダウンロード済みの音楽のタイトル・アーティスト名の変更及び削除
- 複数ユーザーに対応（ユーザーごとに保存先と利用権限を分離）
- DiscordとLINEの両方を同時に利用可能
- Docker Composeでの運用が可能

---

## セットアップ

### 1. 必須環境

- Node.js 22以上
- pnpm 12以上
- Jellyfin
- ffmpeg
- yt-dlp
- Docker Compose v3
- Discord Bot Token もしくは LINE Messaging APIのアクセストークン
- 書き込み可能な音楽用・MusicVideo用ディレクトリ

### 2. クイックスタート

```bash
# 1. プロジェクト用のディレクトリを作成し、移動
mkdir tubejelly && cd tubejelly

# 2. リポジトリをクローン
git clone https://github.com/YukiShima1010/tubejelly.git .

# 3. .env.exampleをコピーして.envを作成
cp .env.example .env
```

### 3. .env設定

```bash
cp .env.example .env
```

envファイルを編集して、使う連携先と保存先を設定してください。

その際、必ずDiscordとLINEのどちらか一方、もしくは両方を有効化してください。少なくとも一方は`true`にしてください。

```dotenv
DISCORD_ENABLED=true
LINE_ENABLED=false
```

アクセストークンの取得方法については、[セットアップガイド](./doc/setup/GETTING_STARTED.md)を参照してください。

### 4. 初期セットアップ＆起動

```bash
./setup.sh
docker compose up --build -d
```

実行後、`docker compose logs -f tubejelly`でログを確認できます。

エラーが発生した場合は、[トラブルシューティング](./doc/TROUBLESHOOTING.md)を参照してください。

---

## ドキュメント

- **[セットアップガイド](./doc/setup/GETTING_STARTED.md)** - セットアップに関する詳細な手順を記載しています。
- **[利用ガイド](./doc/USAGE.md)** - DiscordとLINEのコマンド一覧、基本的な使い方を記載しています。
- **[運用ガイド](./doc/RASPBERRY_PI_OPERATIONS.md)** - 本番環境の運用方法を記載しています。
- **[トラブルシューティング](./doc/TROUBLESHOOTING.md)** - トラブルの原因と解決方法を記載しています。

---

## プロジェクト構成

```
tubejelly/
├─ .dockerignore                 # Dockerイメージへコピーしないファイルを定義
├─ .env.example                  # 環境変数の設定例。実際の秘密情報は含めない
├─ .gitignore                    # Git管理から除外するファイルを定義
├─ .prettierrc                   # Prettierの書式設定
├─ .github/
│  └─ FUNDING.yml                # GitHub Sponsors等の支援設定
├─ .vscode/
│  ├─ extensions.json             # 推奨VS Code拡張機能
│  ├─ launch.json                 # デバッグ起動設定
│  └─ settings.json               # ワークスペース固有のエディター設定
├─ CHANGES.md                    # バージョンごとの変更履歴
├─ Dockerfile                    # 本番用コンテナイメージのビルド定義
├─ doc/
│  ├─ RASPBERRY_PI_OPERATIONS.md # Raspberry Piでの運用手順
│  ├─ TROUBLESHOOTING.md          # よくある問題の確認手順
│  ├─ USAGE.md                    # DiscordとLINEの利用方法・コマンド一覧
│  └─ setup/
│     └─ GETTING_STARTED.md       # 初回セットアップガイド
├─ LICENSE.md                    # MITライセンス
├─ README.md                     # プロジェクト概要と利用手順
├─ SECURITY.md                   # 脆弱性報告に関する案内
├─ docker-compose.yml             # TubeJellyとCloudflare Tunnelのサービス定義
├─ eslint.config.js              # ESLint 10の設定
├─ package.json                  # npmパッケージ情報と開発用スクリプト
├─ pnpm-lock.yaml                # pnpmの依存関係ロックファイル
├─ pnpm-workspace.yaml           # pnpmワークスペース設定
├─ setup.sh                      # 環境変数・Docker Composeの事前検証とビルド
├─ tsconfig.json                 # TypeScriptコンパイラー設定
├─ tubejelly.code-workspace      # VS Codeワークスペース定義
└─ src/
  ├─ index.ts                   # Discord BotとLINE Webhookの起動、イベント登録
  ├─ types.ts                   # ダウンロードやユーザー設定で共有する型定義
  ├─ commands/                  # Discordのスラッシュコマンド
  │  ├─ add.ts                  # YouTube動画を音楽として追加
  │  ├─ addList.ts              # YouTubeプレイリストを一括追加
  │  ├─ artists.ts              # アーティスト別の音楽一覧を表示
  │  ├─ delete.ts               # 音楽ファイルを削除
  │  ├─ edit.ts                 # 音楽のタイトルやアーティスト情報を編集
  │  ├─ help.ts                 # 利用可能なコマンドを表示
  │  ├─ list.ts                 # 音楽ファイルの一覧を表示
  │  ├─ video.ts                # YouTube動画をMusicVideoとして追加
  │  ├─ videoDelete.ts          # MusicVideoファイルを削除
  │  └─ videoList.ts            # MusicVideoの一覧を表示
  ├─ config/
  │  └─ runtime.ts              # 実行時の環境変数と連携機能の設定を読み込み
  ├─ line/
  │  └─ webhook.ts              # LINE Messaging APIのWebhook処理
  └─ utils/                     # Discord・ダウンロード・ファイル操作の共通処理
    ├─ discordDownloadMessage.ts # ダウンロード進捗をDiscordメッセージで通知
    ├─ discordEmbeds.ts        # Discord Embedの生成
    ├─ download.ts             # yt-dlpによるURL解析・音楽と動画のダウンロード
    ├─ fileManager.ts          # ファイル一覧、存在確認、サイズや再生時間の取得
    ├─ logger.ts               # pinoロガーの設定
    ├─ metadata.ts             # 音楽ファイルのメタデータ読み書き
    └─ userConfig.ts           # ユーザー別の保存先と権限設定の管理
```

---

## 技術スタック

### コア技術

| カテゴリ                   | 技術               | バージョン                                    |
| -------------------------- | ------------------ | --------------------------------------------- |
| **ランタイム**             | Node.js            | `>=22.0.0`（Docker: `node:22-bookworm-slim`） |
| **言語**                   | TypeScript         | `5.9.3`                                       |
| **Discord連携**            | discord.js         | `^14.27.0`                                    |
| **LINE連携**               | LINE Messaging API | 外部API（SDKなし）                            |
| **モジュール形式**         | Node.js ESM        | `"type": "module"`                            |
| **パッケージマネージャー** | pnpm               | `>=12.0.0`（固定: `12.4.1`）                  |

### ユーティリティ

| 用途                   | ライブラリ     | バージョン |
| ---------------------- | -------------- | ---------- |
| **ロガー**             | pino           | `^10.3.1`  |
| **ターミナル表示**     | chalk          | `^6.0.1`   |
| **外部コマンド実行**   | execa          | `^10.0.1`  |
| **音楽メタデータ解析** | music-metadata | `^11.16.1` |
| **ID3タグ編集**        | node-id3       | `^0.2.9`   |
| **環境変数**           | dotenv         | `^18.0.4`  |

### インフラ

| 技術                  | 用途                                                       |
| --------------------- | ---------------------------------------------------------- |
| **Docker**            | Node.js、ffmpeg、Python、yt-dlpを含むコンテナ化            |
| **Docker Compose**    | TubeJelly本体とCloudflare Tunnelのマルチコンテナ管理       |
| **Cloudflare Tunnel** | LINE Webhookを外部公開する任意のトンネル                   |
| **ffmpeg**            | 音声・動画の変換。Dockerイメージに導入                     |
| **yt-dlp**            | YouTubeの動画情報取得とダウンロード。Dockerイメージに導入  |
| **Jellyfin**          | ダウンロードした音楽・MusicVideoの保存先およびメディア管理 |

### 開発ツール

| 用途                  | ツール                                    | バージョン |
| --------------------- | ----------------------------------------- | ---------- |
| **静的解析**          | ESLint                                    | `^10.11.0` |
| **TypeScript ESLint** | @typescript-eslint/parser / eslint-plugin | `^8.70.1`  |
| **型定義**            | @types/node                               | `^26.6.3`  |
| **開発実行**          | tsx                                       | `^4.23.15` |
| **ビルド**            | TypeScript Compiler（`tsc`）              | `5.9.3`    |

---

## 免責事項

このプロジェクトは、YouTubeの音楽及びMusicVideoをJellyfinのライブラリに保存するためのツールです。YouTubeの利用規約に従って使用してください。TubeJellyの使用によって生じた損害について、作者は一切責任を負いません。

---

## 開発者

**YukiShima1010**

- GitHub: [@YukiShima1010](https://github.com/YukiShima1010)
- Repository: [TubeJelly](https://github.com/YukiShima1010/TubeJelly)

<div align="center">

**Let`s Enjoy Music!** 🌟

_好きな音楽を好きなだけ_

</div>

---

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE.md](./LICENSE.md)を参照してください。

---

## コピーライト

`Copyright © 2026 YukiShima1010. All rights reserved.`