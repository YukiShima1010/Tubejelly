# Linux 運用ガイド

Linux端末で、Docker Compose版TubeJellyを運用するための手順です。

## 前提

- 64bit Linuxが動作していること
- Docker EngineとDocker Compose v3がインストール済みであること
- Jellyfinが参照する保存先へ書き込めること
- YouTubeへ接続できること

## ディレクトリを準備

音楽とMusicVideoを別々のディレクトリへ保存します。例:

```bash
sudo mkdir -p /srv/jellyfin/music /srv/jellyfin/video
sudo chown -R 1001:1001 /srv/jellyfin/music /srv/jellyfin/video
```

コンテナはUID/GID `1001`の`nodejs`ユーザーで動作します。環境によっては、既存のJellyfinグループへ適切なアクセス権を設定してください。

`.env`にはホスト側のパスを設定します。

```dotenv
MUSIC_HOST_PATH=/srv/jellyfin/music
VIDEO_HOST_PATH=/srv/jellyfin/video
```

## 起動と停止

```bash
docker compose up -d
docker compose ps
docker compose logs -f tubejelly
docker compose down
```

LINEを利用し、Compose内のCloudflare Tunnelも起動する場合:

```bash
docker compose --profile cloudflare up -d
```

## 更新手順

```bash
git pull
./setup.sh
docker compose up -d --build
docker compose logs --tail=100 tubejelly
```

`setup.sh`は設定検証後にイメージをビルドします。更新前に、`.env`と保存先の場所を確認してください。

## データとバックアップ

TubeJellyは設定をデータベースへ保存しません。重要なデータは次のとおりです。

- `.env`
- 音楽保存先（`MUSIC_HOST_PATH`）
- MusicVideo保存先（`VIDEO_HOST_PATH`）

`.env`は秘密情報を含むため、アクセス権を制限した安全な場所へバックアップしてください。音楽・動画ファイルはJellyfinの運用方針に合わせてバックアップします。

## ログとリソース

```bash
docker compose logs --tail=200 tubejelly
docker stats
```

Raspberry Piなど小型Linux端末では、同時ダウンロード数、保存先の空き容量、CPU温度を定期的に確認してください。長時間の変換ではffmpegがCPUを使用します。

## 自動起動

Dockerの再起動ポリシーは`docker-compose.yml`で`unless-stopped`に設定されています。OS起動時にDockerサービスが起動するよう、Dockerの有効化を確認してください。

```bash
sudo systemctl enable --now docker
```

## Cloudflare Tunnel運用時の注意

Cloudflare Tunnelを使用する場合は、`CLOUDFLARED_TUNNEL_TOKEN`を`.env`へ設定し、Public HostnameのServiceを`http://tubejelly:3330`にします。Webhookの公開URLは`/line/webhook`で終わるようにしてください。
