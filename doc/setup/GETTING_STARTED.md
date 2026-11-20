# セットアップガイド

TubeJellyをDocker Composeで起動するための手順です。

## 1. 必要なもの

- Docker Engine
- Docker Compose v2（`docker compose`コマンド）
- YouTubeへ接続できるネットワーク
- Jellyfinの音楽用・MusicVideo用ディレクトリ
- Discord Bot Token、LINE Messaging APIの認証情報のいずれか

Node.js上で開発する場合は、Node.js `>=22.0.0`とpnpm `>=12.0.0`も必要です。固定パッケージマネージャーはpnpm `12.4.1`です。

## 2. プロジェクトを取得

```bash
mkdir tubejelly
cd tubejelly
git clone https://github.com/YukiShima1010/tubejelly.git .
```

## 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env`を編集し、少なくともDiscordまたはLINEのどちらかを有効にします。

```dotenv
DISCORD_ENABLED=true
LINE_ENABLED=false
```

### Discordを使う場合

Discord Developer PortalでBotを作成し、`DISCORD_TOKEN`を設定します。Bot設定ではMessage Content Intentを有効にしてください。

```dotenv
DISCORD_ENABLED=true
DISCORD_TOKEN=replace_with_discord_bot_token
```

### LINEを使う場合

LINE Developers ConsoleでMessaging API Channelを作成し、次の値を設定します。

```dotenv
LINE_ENABLED=true
LINE_CHANNEL_ACCESS_TOKEN=replace_with_line_channel_access_token
LINE_CHANNEL_SECRET=replace_with_line_channel_secret
LINE_WEBHOOK_PORT=3330
```

Webhook URLは、公開URLの`/line/webhook`へ設定します。ローカル環境から公開する場合はCloudflare Tunnelなどを利用してください。

### 保存先とユーザー

音楽とMusicVideoのホスト側保存先を設定します。

```dotenv
MUSIC_HOST_PATH=/srv/jellyfin/music
VIDEO_HOST_PATH=/srv/jellyfin/video
```

ユーザー設定はJSON配列を1行で指定します。コンテナ内の保存先は通常`/music`と`/video`です。

```dotenv
USERS_CONFIG_JSON='[{"NAME":"alice","DISCORD_USER_ID":"123456789012345678","LINE_USER_ID":"Uxxxxxxxx","MUSIC_DL_DIR":"/music","VIDEO_DL_DIR":"/video"}]'
```

詳細な設定項目は[`.env.example`](../../.env.example)を参照してください。

## 4. 検証とビルド

```bash
./setup.sh
```

`setup.sh`は`.env`の存在、連携先の設定、Docker Composeの設定を確認してからイメージをビルドします。

## 5. 起動

```bash
docker compose up -d
docker compose logs -f tubejelly
```

LINEでCloudflare Tunnelを使う場合は、次のコマンドで起動します。

```bash
docker compose --profile cloudflare up -d
```

## 6. 動作確認

DiscordではBotへスラッシュコマンドまたはYouTube URLを送信します。LINEでは公式アカウントへYouTube URLを送信します。本文に`動画`を含めるとMusicVideoとして扱われます。

```text
https://www.youtube.com/watch?v=xxxxxxxxxxx
動画 https://www.youtube.com/watch?v=xxxxxxxxxxx
```

## 7. 開発用コマンド

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm start:dev
```

トークンやシークレットを`.env`以外へ保存したり、Gitへコミットしたりしないでください。