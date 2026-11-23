# 運用ガイド（Raspberry Pi / Linux）

セットアップ済みのTubeJellyを日常的に運用するための手順です。初回セットアップは [セットアップガイド](setup/GETTING_STARTED.md) を参照してください。

## 起動・停止

```bash
docker compose up -d                  # 起動（TubeJelly + cloudflared）
docker compose up -d tubejelly        # 本体のみ起動（LINE・拡張機能を使わない場合）
docker compose ps                     # 状態確認
docker compose logs -f tubejelly      # ログ
docker compose restart tubejelly      # 再起動
docker compose down                   # 停止
```

コンテナは `restart: unless-stopped` のため、Dockerが起動していればOS再起動後も自動で起動します。

```bash
sudo systemctl enable --now docker
```

## 更新手順

```bash
git pull
./setup.sh                 # 設定チェック + ビルド
docker compose up -d
docker compose logs --tail=100 tubejelly
```

更新後は [CHANGES.md](../CHANGES.md) で、新しい設定項目（`.env` に追加が必要なもの）がないか確認してください。

## ユーザーの追加・変更

1. `src/config/users.json` を編集（保存先を分ける場合は docker-compose.yml の volumes も追加）
2. `./setup.sh --check` で確認
3. `docker compose up -d --build`（users.json はイメージに含まれるため再ビルドが必要）

## yt-dlp の更新

YouTube側の変更で取得に失敗するようになったら、yt-dlpを最新にします（ビルド時に最新版が入ります）。

```bash
docker compose build --no-cache tubejelly
docker compose up -d
```

## データとバックアップ

| データ | 場所 | 備考 |
| --- | --- | --- |
| 環境変数・秘密情報 | `.env` | 権限を絞って保管 |
| ユーザー設定 | `src/config/users.json` | Git管理外 |
| 拡張機能の連携情報 | Dockerボリューム `tubejelly-data`（`/app/data/extension-tokens.json`） | 消えた場合は拡張機能から再連携すればよい |
| 音楽・MusicVideo | docker-compose.yml の volumes のホスト側 | Jellyfinの運用方針に合わせてバックアップ |

拡張機能の連携情報を確認・バックアップする例:

```bash
docker compose exec tubejelly cat /app/data/extension-tokens.json
```

`docker compose down -v` はボリュームも削除するため、拡張機能の連携がすべて解除されます。

## ログとリソース

```bash
docker compose logs --tail=200 tubejelly
docker stats
vcgencmd measure_temp      # Raspberry Pi のCPU温度
df -h                      # 空き容量
```

Chrome拡張機能からの追加は1件ずつ順番に処理されますが、Discord/LINEからの追加はそれと並行して動きます。大きなプレイリストを複数同時に追加すると、ffmpegの変換でCPU負荷と温度が上がります。

## Cloudflare Tunnel

- Public Hostname の Service は `http://tubejelly:3330`
- LINE Webhook: `https://<公開ホスト名>/line/webhook`
- Chrome拡張機能: `https://<公開ホスト名>`（`/ext/v1` を使用）
- Bot Fight Mode などのセキュリティ設定で `/line/*`・`/ext/*` がブロックされないようにしてください

```bash
docker compose logs --tail=100 cloudflared
curl https://<公開ホスト名>/line/health
curl https://<公開ホスト名>/ext/v1/health
```
