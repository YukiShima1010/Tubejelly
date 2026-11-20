# トラブルシューティング

## 起動できない

### `.env`が見つからない

```bash
cp .env.example .env
```

`.env`に必要な値を設定してから、もう一度`./setup.sh`を実行してください。

### 連携設定のエラー

次を確認します。

- `DISCORD_ENABLED`と`LINE_ENABLED`が`true`または`false`である
- DiscordとLINEの少なくとも一方が`true`である
- Discordを有効にした場合、`DISCORD_TOKEN`が設定されている
- LINEを有効にした場合、`LINE_CHANNEL_ACCESS_TOKEN`と`LINE_CHANNEL_SECRET`が設定されている
- `USERS_CONFIG_JSON`が1行の有効なJSON配列である

```bash
docker compose config
```

### コンテナのログを確認する

```bash
docker compose ps
docker compose logs --tail=200 tubejelly
```

## 保存できない

### ホスト側のディレクトリを確認する

```bash
ls -ld "$MUSIC_HOST_PATH" "$VIDEO_HOST_PATH"
```

ディレクトリが存在し、コンテナの実行ユーザーが書き込める必要があります。Docker Composeでは、ホスト側の`MUSIC_HOST_PATH`がコンテナ内の`/music`へ、`VIDEO_HOST_PATH`が`/video`へマウントされます。

`USERS_CONFIG_JSON`の保存先も確認します。

```dotenv
MUSIC_DL_DIR=/music
VIDEO_DL_DIR=/video
```

### 空き容量を確認する

```bash
df -h
```

音楽やMusicVideoの保存先に十分な空き容量があるか確認してください。

## YouTubeの取得に失敗する

- URLが公開動画または公開プレイリストである
- Raspberry PiからYouTubeへ接続できる
- コンテナ内のyt-dlpとffmpegが起動できる
- 対象動画が地域制限・年齢制限・非公開状態ではない

コンテナ内の実行ファイルを確認する例:

```bash
docker compose exec tubejelly yt-dlp --version
docker compose exec tubejelly ffmpeg -version
```

## Discordで反応しない

- BotがサーバーまたはDMへ招待されている
- Discord Bot Tokenが正しい
- Message Content Intentが有効である
- `DISCORD_ENABLED=true`になっている
- 送信ユーザーのDiscord IDが`USERS_CONFIG_JSON`に登録されている

トークンを公開してしまった場合は、Discord Developer Portalで直ちに再発行してください。

## LINEから返信されない

- `LINE_ENABLED=true`になっている
- Channel secretとChannel access tokenが正しい
- Webhook URLが`/line/webhook`で終わっている
- LINE側でWebhookが有効になっている
- LINEのユーザーIDが`USERS_CONFIG_JSON`に登録されている
- `LINE_WEBHOOK_PORT`がCloudflare Tunnelの転送先と一致している

Cloudflare Tunnelを使う場合:

```bash
docker compose --profile cloudflare ps
docker compose logs --tail=200 cloudflared
```

Composeネットワーク内の転送先は`http://tubejelly:3330`です。

## Webhookの署名エラー

LINE WebhookはChannel secretを使って署名を検証します。Channel secretをコピーし直し、余分な空白や改行がないことを確認してください。

## 認証情報を誤って公開した

1. Discord Token、LINE Channel access token、Cloudflare Tunnel tokenを直ちに失効させる
2. 各サービスで新しいトークンを発行する
3. `.env`を更新する
4. Git履歴、Issue、ログ、スクリーンショットに秘密情報が残っていないか確認する
5. 必要に応じてプロバイダーへ報告する

詳細は[`SECURITY.md`](../SECURITY.md)を参照してください。
