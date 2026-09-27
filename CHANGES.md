# Changelog

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