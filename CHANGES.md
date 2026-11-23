# Changelog

## [Unreleased]

### Changed

- `setup.sh` を作り直し、Docker Compose v2 に対応。`.env`・`users.json`・`docker-compose.yml` の volumes（存在・書き込み権限・保存先の一致）をチェックし、直し方を表示。`--check` でチェックのみ実行可能
- `.env.example` を整理（LINE・Cloudflare の値を空に、使われていない `JELLYFIN_MUSIC_PATH` を削除）
- セットアップガイド・README・利用ガイド・運用ガイド・トラブルシューティングを現在の動作に合わせて全面更新

## [3.1.0] - 2026-11-24

### Added

- Chrome拡張機能（`extension/`）。開いているYouTube動画を「ミュージック」「動画」を選んで追加し、待機中・実行中・成功・失敗の状態と詳細ログを表示
- 拡張機能用API（`/ext/v1`）。Discord/LINEに連携コードを送ってアカウントを紐付け
- Discordの`/link`コマンド
- `EXTENSION_API_ENABLED`、`EXTENSION_TOKEN_STORE_PATH`環境変数と名前付きボリューム`tubejelly-data`
- `pnpm test`（node:test）と`pnpm package:extension`（拡張機能のZIP出力）

### Changed

- LINE Webhookと拡張機能APIでHTTPサーバーを共用（LINE未設定でも拡張機能APIのみで起動可能、Discordの準備を待たずに起動）
- `package.json`のバージョンを3.1.0に更新

## [3.0.0] - 2026-09-27

### Added

- DiscordとLINEを`true`/`false`で個別に有効化できる設定
- 音楽用とMusicVideo用の保存先を分離したDocker設定
- Discord返信のEmbed表示
- Pinoによる構造化ログ
- OSS利用者向けのREADME設定ガイド
- セキュリティポリシーの更新

### Changed

- ユーザー設定を`USERS_CONFIG_JSON`へ集約
- Composeの個別環境依存ボリュームを削除
- Dockerをマルチステージビルドへ整理
- `tsconfig.json`から不要な設定を削除
- 旧設計資料をREADMEへ統合

### Removed

- `src/config/users.json`およびサンプル設定
- `doc/`配下の個別ドキュメント
- `ITTU_MUSIC_HOST_PATH`、`MMI_MUSIC_HOST_PATH`、`ITTU_VIDEO_HOST_PATH`