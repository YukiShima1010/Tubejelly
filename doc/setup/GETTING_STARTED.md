# セットアップガイド

TubeJellyをRaspberry Pi（arm64）上のDocker Composeで動かすまでの手順です。上から順に進めれば動くように書いています。

所要時間の目安: Discordのみ 約20分 / LINE・Chrome拡張機能も使う場合 約40分

## 全体の流れ

| # | 作業 | 必須 |
| --- | --- | --- |
| 1 | [必要なものを用意](#1-必要なもの) | ✅ |
| 2 | [リポジトリを取得](#2-リポジトリを取得) | ✅ |
| 3 | [Discord Botを作成](#3-discord-botを作成) | ✅ |
| 4 | [保存先ディレクトリと docker-compose.yml](#4-保存先ディレクトリと-docker-composeyml) | ✅ |
| 5 | [ユーザー登録（users.json）](#5-ユーザー登録usersjson) | ✅ |
| 6 | [.env を設定](#6-env-を設定) | ✅ |
| 7 | [Cloudflare Tunnel（LINE・拡張機能を使う場合）](#7-cloudflare-tunnelline拡張機能を使う場合) | 任意 |
| 8 | [LINE公式アカウント](#8-line公式アカウント) | 任意 |
| 9 | [チェックして起動](#9-チェックして起動) | ✅ |
| 10 | [Chrome拡張機能](#10-chrome拡張機能) | 任意 |

> [!IMPORTANT]
> つまずきやすい点
> - **Discordは必須**です（LINEだけでは起動しません）。
> - **`src/config/users.json` はDockerイメージに焼き込まれます。** 変更したら `docker compose up -d --build` で再ビルドが必要です。
> - **users.json の保存先（`/music` など）は、docker-compose.yml の volumes のコンテナ側パスと一致**させてください。
> - 保存先ディレクトリはコンテナのユーザー（**UID 1001**）が書き込める必要があります。
> - Dockerfileは **arm64（Raspberry Pi）向け**です。

---

## 1. 必要なもの

- 64bit OSのRaspberry Pi（`uname -m` が `aarch64`）などのarm64 Linux
- Docker Engine と Docker Compose v2（`docker compose version` が動くこと）
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER   # 実行後に一度ログアウト・ログイン
  ```
- Jellyfin（音楽・MusicVideoのライブラリとして使うディレクトリ）
- Discordアカウント
- （任意）LINE Developersアカウント、Cloudflareアカウントとドメイン

yt-dlp・ffmpeg・Node.js はDockerイメージに含まれるため、ホストへのインストールは不要です。

## 2. リポジトリを取得

```bash
git clone https://github.com/YukiShima1010/Tubejelly.git tubejelly
cd tubejelly
```

## 3. Discord Botを作成

1. [Discord Developer Portal](https://discord.com/developers/applications) で「New Application」を作成
2. 左メニュー「Bot」で次を設定
   - 「Reset Token」でトークンを発行してコピー（後で `.env` の `DISCORD_TOKEN` に使います。他人に見せないこと）
   - **Privileged Gateway Intents の「MESSAGE CONTENT INTENT」をオン**（URL貼り付けや連携コードの受信に必要）
3. 左メニュー「OAuth2」→「URL Generator」で招待URLを作成
   - SCOPES: `bot`、`applications.commands`
   - BOT PERMISSIONS: `View Channels`、`Send Messages`、`Read Message History`
4. 生成されたURLを開き、自分のサーバーにBotを招待

BotとDMするには、Botと同じサーバーに参加している必要があります。

## 4. 保存先ディレクトリと docker-compose.yml

`docker-compose.yml` の `volumes` には、ホスト側のパスが直接書かれています。**自分の環境に合わせて書き換えてください。**

```yaml
    volumes:
      # ホスト側のパス:コンテナ側のパス
      - /srv/jellyfin/music:/music
      - /srv/jellyfin/video:/video
      # Chrome拡張機能の連携情報（そのまま残す）
      - tubejelly-data:/app/data
```

- 左（ホスト側）: Jellyfinのライブラリが参照しているディレクトリ
- 右（コンテナ側）: 次の手順の users.json で `MUSIC_DL_DIR` / `VIDEO_DL_DIR` に指定するパス
- ユーザーごとに保存先を分ける場合は、行を増やします（例: `- /srv/jellyfin/alice-music:/alice-music`）

ディレクトリを作成し、コンテナのユーザー（UID 1001）が書き込めるようにします。

```bash
sudo mkdir -p /srv/jellyfin/music /srv/jellyfin/video
sudo chown -R 1001:1001 /srv/jellyfin/music /srv/jellyfin/video
```

Jellyfin側でもこれらのディレクトリを読めるようにしてください（Jellyfinのライブラリにこのパスを追加）。

## 5. ユーザー登録（users.json）

登録されたユーザーだけがTubeJellyを使えます。

```bash
cp src/config/users.json.sample src/config/users.json
```

```json
[
  {
    "NAME": "alice",
    "DISCORD_USER_ID": "123456789012345678",
    "LINE_USER_ID": "U0123456789abcdef0123456789abcdef",
    "MUSIC_DL_DIR": "/music",
    "VIDEO_DL_DIR": "/video"
  }
]
```

| 項目 | 内容 |
| --- | --- |
| `NAME` | 表示名（ログや拡張機能の連携メッセージに表示） |
| `DISCORD_USER_ID` | DiscordのユーザーID（数字18桁前後） |
| `LINE_USER_ID` | LINEのユーザーID（`U` + 32桁）。LINEを使わない場合は行ごと削除 |
| `MUSIC_DL_DIR` | 音楽の保存先（**コンテナ側**のパス） |
| `VIDEO_DL_DIR` | MusicVideoの保存先（**コンテナ側**のパス） |

**DiscordのユーザーIDの調べ方**: Discordの「設定 → 詳細設定 → 開発者モード」をオンにし、自分のアイコンを右クリック →「ユーザーIDをコピー」

**LINEのユーザーIDの調べ方**: 手順8でLINEを設定して起動した後、公式アカウントに何かメッセージを送り、ログに出るIDを確認します（未登録でもログには出ます）。

```bash
docker compose logs tubejelly | grep LINEID
# 📨 チャットを受信しました（LINEID：Uxxxxxxxx..., type: text） ...
```

確認したIDを users.json に追加し、`docker compose up -d --build` で反映してください。

## 6. .env を設定

```bash
cp .env.example .env
nano .env
```

最低限、`DISCORD_TOKEN` を設定します。

```dotenv
DISCORD_TOKEN=手順3でコピーしたトークン
```

| 変数 | 必須 | 内容 |
| --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | Discord Botのトークン |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | | LINEを使う場合のみ。**使わない場合は空のまま** |
| `LINE_WEBHOOK_PORT` | | LINE・拡張機能用HTTPポート（既定 `3330`） |
| `EXTENSION_API_ENABLED` | | `true` でChrome拡張機能を有効化 |
| `CLOUDFLARED_TUNNEL_TOKEN` | LINE・拡張機能を使う場合 | Cloudflare Tunnelのトークン |

## 7. Cloudflare Tunnel（LINE・拡張機能を使う場合）

LINEのWebhookとChrome拡張機能は、インターネットからTubeJellyに届く必要があります。`docker-compose.yml` に含まれる `cloudflared` コンテナを使います。

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) →「Networks」→「Tunnels」→「Create a tunnel」（Cloudflared）
2. 表示されたインストールコマンドの `--token` 以降の文字列を `.env` の `CLOUDFLARED_TUNNEL_TOKEN` に設定
3. 「Public Hostname」を追加
   - Subdomain / Domain: 例 `tubejelly.example.com`
   - Service: **Type `HTTP`、URL `tubejelly:3330`**（`localhost` ではなくComposeのサービス名）

この公開URL（`https://tubejelly.example.com`）を、LINEのWebhookと拡張機能のサーバーURLに使います。

LINE・拡張機能を使わない場合は、`cloudflared` を起動せず本体のみ起動できます（`docker compose up -d tubejelly`）。

## 8. LINE公式アカウント

1. [LINE Developers](https://developers.line.biz/console/) でプロバイダーと「Messaging API」チャネルを作成
2. 「チャネル基本設定」の **チャネルシークレット** を `.env` の `LINE_CHANNEL_SECRET` に設定
3. 「Messaging API設定」で **チャネルアクセストークン（長期）** を発行し、`LINE_CHANNEL_ACCESS_TOKEN` に設定
4. 同じ画面で
   - Webhook URL: `https://tubejelly.example.com/line/webhook`
   - 「Webhookの利用」: オン
   - 「応答メッセージ」: オフ（LINE Official Account Managerで設定。オンだと自動応答が二重に返ります）
5. QRコードから公式アカウントを友だち追加

起動後に Webhook URL の「検証」ボタンで成功すれば接続できています。

## 9. チェックして起動

```bash
./setup.sh --check   # 設定のチェックのみ
./setup.sh           # チェック後にイメージをビルド
docker compose up -d
docker compose logs -f tubejelly
```

`setup.sh` は次を確認し、問題があれば直し方を表示します。

- Docker / Docker Compose v2
- `.env`（Discordトークン、LINEの設定漏れ、Cloudflare Tunnel）
- `users.json`（形式、IDがサンプルのままでないか）
- `docker-compose.yml` の volumes（ディレクトリの有無、書き込み権限、users.json の保存先と一致しているか）

ログに次が出れば起動成功です。

```text
✓ ユーザー設定をロード: 1ユーザー
✅ TubeJelly Bot が起動しました！
✓ スラッシュコマンドの登録完了
🚀 準備完了！コマンドを受け付けています。
```

動作確認: BotとのDMに YouTube のURLを送信します。本文に `動画` を含めるとMusicVideoとして保存されます。

```text
https://www.youtube.com/watch?v=xxxxxxxxxxx
動画 https://www.youtube.com/watch?v=xxxxxxxxxxx
```

スラッシュコマンド（`/add` など）は、初回登録後にDiscord側へ反映されるまで数分かかることがあります。

## 10. Chrome拡張機能

`.env` で `EXTENSION_API_ENABLED=true` にして再起動した後、[Chrome拡張機能ガイド](../EXTENSION.md) に従って導入してください。

## 設定を変更したとき

| 変更したもの | 反映方法 |
| --- | --- |
| `.env` | `docker compose up -d`（コンテナが作り直されます） |
| `src/config/users.json` | `docker compose up -d --build`（**再ビルドが必要**） |
| `docker-compose.yml` | `docker compose up -d` |
| ソースコード（`git pull` 後など） | `./setup.sh && docker compose up -d` |

## 開発用（Dockerを使わずに動かす場合）

Node.js `>=22` と pnpm `>=12`、ホストに yt-dlp・ffmpeg・Deno が必要です。

```bash
pnpm install
pnpm dev          # .env と src/config/users.json を使って起動
pnpm typecheck && pnpm lint && pnpm test
```

トークンやシークレットを `.env` 以外へ保存したり、Gitへコミットしたりしないでください。
