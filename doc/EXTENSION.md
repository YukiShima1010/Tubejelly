# Chrome拡張機能ガイド

YouTubeを開いた状態で拡張機能のアイコンを押し、「ミュージック」か「動画」を選んで「追加」を押すだけで、TubeJelly経由でJellyfinのライブラリへ保存できます。

設計の詳細は [doc/agent/chrome_extension_design.md](agent/chrome_extension_design.md) を参照してください。

## 1. サーバー側の準備

`.env` に次を設定します。

```dotenv
EXTENSION_API_ENABLED=true
# 省略時は <作業ディレクトリ>/data/extension-tokens.json（Dockerでは /app/data/extension-tokens.json）
# EXTENSION_TOKEN_STORE_PATH=./data/extension-tokens.json
```

拡張機能APIはLINE Webhookと同じHTTPサーバー（`LINE_WEBHOOK_PORT`）の `/ext/v1` で動きます。Cloudflare Tunnelの公開ホスト名（転送先 `http://tubejelly:3330`）をそのまま使えます。

連携情報は名前付きボリューム `tubejelly-data`（コンテナ内 `/app/data`）に保存されます。

```bash
docker compose up --build -d
docker compose logs -f tubejelly   # 「Chrome拡張機能APIを有効化」と出ればOK
curl https://<公開ホスト名>/ext/v1/health   # {"ok":true,"service":"tubejelly"}
```

Discordの `/link` コマンドは起動時に登録されます（反映まで数分かかることがあります）。

## 2. 拡張機能の読み込み

Chrome Web Storeには公開していないため、手元で読み込みます。

1. Chromeで `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」でリポジトリの `extension/` フォルダを選ぶ
4. ツールバーのパズルアイコンから TubeJelly をピン留めする

コードを更新したら `chrome://extensions` で TubeJelly の再読み込みボタンを押してください。

### ZIPで配布する場合

```bash
pnpm package:extension   # release/tubejelly-extension-<version>.zip を作成
```

ChromeはZIPを直接インストールできないため、受け取った側でZIPを展開し、展開したフォルダを上の手順3で読み込んでください。展開したフォルダは削除・移動しないでください（読み込み元として使われ続けます）。

## 3. アカウントの連携

1. 拡張機能のアイコンを押し、サーバーURL（例: `https://tubejelly.example.com`）を入力して「接続して連携コードを発行」
2. サーバーへのアクセス許可を求められたら「許可」
3. 表示された `TJ-XXXX-XXXX` のコードを次のどれかで送信
   - DiscordのBotとのDMにそのまま貼り付け
   - Discordで `/link code:TJ-XXXX-XXXX`（自分にだけ返信が表示されます）
   - LINE公式アカウントとの1対1のトークにそのまま貼り付け（グループでは反応しません）
4. 「連携しました」と返信が来たら、拡張機能を開き直すと利用を開始できます（閉じていても30秒以内に自動で連携が完了し、通知が出ます）

- コードの有効期限は10分です。期限が切れたら「コードを再発行」を押してください。
- `users.json` に登録済みのDiscord/LINEアカウントからのみ連携できます。保存先はそのアカウントの `MUSIC_DL_DIR` / `VIDEO_DL_DIR` です。
- Discordのサーバーチャンネルに貼り付けたコードには反応しません（他の人に見えるため）。サーバー内では `/link` を使ってください。

## 4. 使い方

1. YouTubeで動画（または `/playlist?list=` のページ）を開く
2. 拡張機能のアイコンを押す
3. `🎵 ミュージック`（MP3）か `🎬 動画`（MP4、最大1080p）を選ぶ
4. URLにプレイリストが含まれる場合は、必要に応じて「プレイリスト全体を追加」にチェック
5. 「追加」を押す

履歴に状態が表示されます。

| 表示 | 意味 |
| --- | --- |
| 待機中 | 前のジョブの完了待ち（サーバーは1件ずつ順番に処理します） |
| 実行中 | ダウンロード中 |
| 成功 | 保存完了 |
| 成功（既存） | 既に同じファイルがあったためスキップ |
| 失敗 | エラー。メッセージと詳細ログを確認してください |
| 不明 | サーバーが再起動してジョブの記録が消えた |

「詳細↓」を押すとサーバー側の処理ログが表示されます。ポップアップを閉じても処理は続き、完了・失敗時はデスクトップ通知が届きます。処理中の件数はアイコンのバッジに表示されます。

## 5. 連携解除

- 拡張機能の「連携解除」を2回押すと、サーバー側のトークンも削除されます。
- 端末を紛失した場合は、サーバーの `/app/data/extension-tokens.json` から該当端末（`deviceName`）の行を削除してコンテナを再起動してください。
- `users.json` からユーザーを削除すると、そのユーザーの拡張機能も使えなくなります。

## 6. トラブルシューティング

| 症状 | 確認すること |
| --- | --- |
| 「APIが見つかりません」 | `.env` の `EXTENSION_API_ENABLED=true`、コンテナを再作成したか |
| 「サーバーに接続できません」 | サーバーURL、Cloudflare Tunnelの状態、`/ext/v1/health` がブラウザで開けるか |
| コードを送っても反応がない | 送信したアカウントが `users.json` に登録されているか。Discordでは貼り付けはDMのみ有効（サーバーでは `/link`） |
| 「未承認の連携コードが多すぎます」 | サーバー全体で未使用のコードが50件を超えている。10分待ってから再発行してください |
| 「連携が無効になりました」 | サーバー側でトークンが削除された、または `users.json` から外れた。再連携してください |
| Cloudflareのチャレンジ画面で失敗する | Bot Fight Mode等で `/ext/*` がブロックされていないか |
| 状態が「不明」になる | サーバー再起動でジョブの記録が消えた。ライブラリを確認し、必要なら再度追加してください |
