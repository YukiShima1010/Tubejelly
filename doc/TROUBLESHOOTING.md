# トラブルシューティング

まずは設定チェックを実行してください。多くの設定ミスはこれで原因と直し方が表示されます。

```bash
./setup.sh --check
docker compose ps
docker compose logs --tail=200 tubejelly
```

## 起動できない

### `❌ DISCORD_TOKEN が設定されていません` で終了する

DiscordのBotトークンは必須です。`.env` の `DISCORD_TOKEN` を設定し、`docker compose up -d` で反映してください。

### `❌ Discordへのログインに失敗` / `TokenInvalid`

トークンが間違っているか、再発行で古くなっています。Developer Portal の「Bot → Reset Token」で発行し直して `.env` を更新してください。

### `Used disallowed intents` で終了する

Developer Portal の「Bot」で **MESSAGE CONTENT INTENT** をオンにしてください。

### `❌ ユーザー設定ファイルの読み込みに失敗` / `ユーザー設定をロード: 0ユーザー`

- `src/config/users.json` が存在し、JSONとして正しいか確認（末尾のカンマ、`"` の閉じ忘れに注意）
- **users.json はイメージに焼き込まれるため、変更後は `docker compose up -d --build` が必要です**

### ビルドに失敗する（`exec format error` など）

Dockerfile は arm64（Raspberry Pi）向けにDenoをダウンロードしています。x86_64 の場合は Dockerfile の `deno-aarch64-unknown-linux-gnu.zip` を `deno-x86_64-unknown-linux-gnu.zip` に変更してください。

### `setup.sh` で `Docker Compose がインストールされていません`

Docker Compose v2 プラグインを入れてください。

```bash
sudo apt install docker-compose-plugin
docker compose version
```

### `cloudflared` コンテナが再起動を繰り返す

`.env` の `CLOUDFLARED_TUNNEL_TOKEN` が未設定か間違っています。LINE・拡張機能を使わない場合は本体のみ起動してください。

```bash
docker compose stop cloudflared
docker compose up -d tubejelly
```

## 保存できない

### `EACCES: permission denied` / ダウンロード後にファイルが無い

コンテナはUID 1001で動きます。ホスト側の保存先を書き込み可能にしてください。

```bash
sudo chown -R 1001:1001 /srv/jellyfin/music /srv/jellyfin/video
```

`./setup.sh --check` は書き込めない可能性のあるディレクトリを警告します。

### `❌ 音楽の保存先が未設定です` / `MusicVideoの保存先が未設定です`

送信したアカウントが users.json に登録されていません。

- Discord: `DISCORD_USER_ID` が正しいか（開発者モード → ユーザーIDをコピー）
- LINE: `LINE_USER_ID` が正しいか（`docker compose logs tubejelly | grep LINEID` で確認）
- 変更後に `docker compose up -d --build` したか

### 保存されたのにJellyfinに表示されない

- users.json の `MUSIC_DL_DIR`（例 `/music`）と docker-compose.yml の volumes のコンテナ側パスが一致しているか
- そのホスト側ディレクトリが Jellyfin のライブラリに追加されているか
- Jellyfinでライブラリのスキャンを実行したか

### 空き容量

```bash
df -h
```

## YouTubeの取得に失敗する

- 動画・プレイリストが公開されているか（非公開・年齢制限・地域制限は取得できません）
- `Sign in to confirm you’re not a bot` が出る場合は、YouTube側の制限です。時間をおくか、yt-dlpを更新してください（下記）
- yt-dlp が古い場合はイメージを作り直します（ビルド時に最新のyt-dlpが入ります）

```bash
docker compose build --no-cache tubejelly && docker compose up -d
docker compose exec tubejelly yt-dlp --version
docker compose exec tubejelly ffmpeg -version
```

## Discordで反応しない

- Botがサーバーに招待されているか（DMするにはBotと同じサーバーにいる必要があります）
- MESSAGE CONTENT INTENT がオンか
- 自分のDiscord IDが users.json に登録されているか
- スラッシュコマンドが出ない場合: 初回は反映まで数分かかります。Discordを再起動してみてください

## LINEから返信されない

- `.env` の `LINE_CHANNEL_ACCESS_TOKEN` と `LINE_CHANNEL_SECRET` が両方設定されているか（ログに `✓ LINE連携を有効化` が出ているか）
- Webhook URL が `https://<公開ホスト名>/line/webhook` で、「Webhookの利用」がオンか
- LINE Developers の Webhook「検証」が成功するか
- Cloudflare Tunnel の Public Hostname の Service が `http://tubejelly:3330` か

```bash
docker compose logs --tail=100 cloudflared
curl https://<公開ホスト名>/line/health   # {"ok":true}
```

### `⚠️ LINE署名検証に失敗しました`

チャネルシークレットが違います。コピーし直し、余分な空白や改行がないか確認してください。

### `LINE月間上限到達` のログが出る

LINEの無料プランの月間メッセージ数（push）上限です。受付の返信（reply）は届きますが、完了通知は届かなくなります。翌月まで待つか、プランを変更してください。

## Chrome拡張機能

[Chrome拡張機能ガイドのトラブルシューティング](EXTENSION.md#6-トラブルシューティング) を参照してください。

## 認証情報を誤って公開した

1. Discord Token、LINE Channel access token / secret、Cloudflare Tunnel token を直ちに再発行（古いものを無効化）
2. `.env` を更新して `docker compose up -d`
3. Git履歴、Issue、ログ、スクリーンショットに秘密情報が残っていないか確認

詳細は [`SECURITY.md`](../SECURITY.md) を参照してください。
