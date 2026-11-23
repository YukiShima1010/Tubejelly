# TubeJelly 開発ガイド（Claude向け）

YouTubeの音楽・MusicVideoを、Discord Bot / LINE公式アカウント / Chrome拡張機能からJellyfinのライブラリへ保存するシステム。
Raspberry Pi（arm64）上のDocker Composeで運用している。個人利用。

## コマンド

```bash
pnpm install          # 依存関係
pnpm typecheck        # 型チェック（src とテスト）
pnpm lint             # ESLint（src と extension）
pnpm test             # node:test + tsx によるテスト（src/**/*.test.ts）
pnpm build            # dist/ へビルド
pnpm dev              # 開発起動（.env と src/config/users.json が必要）
pnpm package:extension # 拡張機能を release/tubejelly-extension-<version>.zip に出力
```

変更後は `pnpm typecheck && pnpm lint && pnpm test` がすべて通ることを確認する。

## 構成

- `src/index.ts` — Discordクライアント起動、URL貼り付けダウンロード、HTTPサーバー起動
- `src/commands/*.ts` — Discordスラッシュコマンド（`data` と `execute` をexportすると自動ロード）
- `src/line/webhook.ts` — LINE Webhookのルートハンドラー
- `src/http/server.ts` — LINEと拡張機能APIが共用するHTTPサーバー（ポートは `LINE_WEBHOOK_PORT`）
- `src/extension/` — Chrome拡張機能用API（連携コード・トークン・ジョブキュー）
- `src/utils/download.ts` — yt-dlpによるダウンロード。進捗はDiscordの `Message` 互換アダプターへ送られる
- `src/utils/userConfig.ts` — `src/config/users.json`（Git管理外）からユーザーと保存先を引く
- `extension/` — Chrome拡張機能（Manifest V3、ビルド不要の素のJS）
- `doc/agent/` — 設計書（Claude作成）

## 規約

- コメント・ログ・ユーザー向けメッセージは日本語。
- ESM（`"type": "module"`）。相対importは `.js` 拡張子付きで書く。
- ユーザーごとの保存先は必ず `users.json` から解決し、未登録ユーザーは処理しない。
- 秘密情報（`.env`、`users.json`、`data/extension-tokens.json`）はコミットしない。トークンはハッシュで保存し、ログに出さない。
- 拡張機能のAPIを変更したら `doc/agent/chrome_extension_design.md` も更新する。
- コミットメッセージは既存の形式（`Add:` / `Fix:` / `Doc:` / `Chore:` などの接頭辞 + 日本語）に合わせる。
- リポジトリは分けず、このリポジトリで作業する。

## 注意

- `doc/` の一部（USAGE.md など）は `USERS_CONFIG_JSON` 環境変数に言及しているが、現行コードは `src/config/users.json` を読む。
- Dockerコンテナは UID 1001 の `nodejs` ユーザーで動く。永続データは名前付きボリューム `tubejelly-data`（`/app/data`）。
