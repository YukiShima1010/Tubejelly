# TubeJelly Chrome拡張機能 設計書

- 作成日: 2026-11-24
- 対象バージョン: TubeJelly 3.x / 拡張機能 1.0.0
- 利用範囲: 個人利用のみ（Chrome Web Storeには公開しない。「パッケージ化されていない拡張機能」として読み込む）

---

## 1. 目的

YouTubeを開いている状態で拡張機能のポップアップを開き、

1. 「ミュージック」か「動画」を選択
2. 「追加」ボタンを押す

だけで、表示中の動画をJellyfinのライブラリへ追加できるようにする。

追加処理の状態（待機中・実行中・成功・失敗）をポップアップに表示し、「詳細↓」ボタンでサーバー側の処理ログを確認できるようにする。

## 2. 全体構成

```
┌──────────────────────┐        HTTPS (Cloudflare Tunnel)       ┌──────────────────────────────┐
│ Chrome拡張機能        │ ───────────────────────────────────▶ │ TubeJelly (Node.js)           │
│  popup / background  │   /ext/v1/*  Bearer トークン認証        │  HTTPサーバー (既存LINE用と共用) │
└──────────────────────┘                                        │   ├ /line/*   LINE Webhook    │
          ▲ 連携コード表示                                        │   └ /ext/v1/* 拡張機能API      │
          │                                                      │  拡張機能サービス               │
          │ ユーザーがコードを貼り付け                              │   ├ 連携コード管理 (メモリ)      │
          ▼                                                      │   ├ トークン保存 (JSONファイル)  │
┌──────────────────────┐   メッセージ                             │   └ ジョブキュー (メモリ)       │
│ Discord / LINE        │ ───────────────────────────────────▶ │  Discord Bot / LINE Webhook    │
└──────────────────────┘                                        └──────────────────────────────┘
```

### 2.1 通信方式の選定

| 案 | 内容 | 採否 |
| --- | --- | --- |
| A. 既存HTTPサーバーに拡張機能用REST APIを追加 | LINE Webhook用のHTTPサーバーとCloudflare Tunnelをそのまま流用 | **採用** |
| B. 拡張機能からDiscord/LINEにメッセージを送る | Botアカウントの権限やLINEの送信上限（月間メッセージ数）に縛られる | 不採用 |
| C. WebSocket | 常時接続が必要。MV3のService Workerは短命で相性が悪い | 不採用 |

案Aを採用する。既にCloudflare Tunnelで`http://tubejelly:3330`が公開されているため、同じホスト名の`/ext/v1/*`パスで拡張機能APIを受け付けられる。状態の取得はポーリング（ポップアップ表示中は2秒間隔、閉じている間はバックグラウンドで30秒間隔）とする。

## 3. アカウント連携（ペアリング）

### 3.1 フロー

```
拡張機能                         TubeJellyサーバー                    Discord / LINE
   │ POST /ext/v1/pair/start          │                                    │
   │ { deviceName }                   │                                    │
   │─────────────────────────────────▶│ 連携コード(TJ-XXXX-XXXX)と           │
   │◀─────────────────────────────────│ pairingId(秘密値)を発行。有効期限10分  │
   │ { pairingId, code, expiresAt }   │                                    │
   │                                  │                                    │
   │ 画面にコードを表示                 │      ユーザーがコードを貼り付けて送信  │
   │                                  │◀───────────────────────────────────│
   │                                  │ 送信者が users.json の登録ユーザーか確認│
   │                                  │ → 連携を承認し、返信                 │
   │                                  │───────────────────────────────────▶│ ✅ 連携しました
   │ POST /ext/v1/pair/poll           │                                    │
   │ { pairingId }                    │                                    │
   │─────────────────────────────────▶│ 承認済みならアクセストークンを発行      │
   │◀─────────────────────────────────│ （1回だけ返し、連携コードは破棄）       │
   │ { status: "approved", token }    │                                    │
```

### 3.2 連携コード

- 形式: `TJ-XXXX-XXXX`（`X`は紛らわしい文字`0 O 1 I L`を除いた英大文字・数字31種）。約39.6bit。
- 有効期限: 10分。1回承認されたら再利用不可。承認後は、拡張機能が受け取るまで最低5分の猶予を確保する（期限直前に承認された場合の取りこぼし防止）。
- 同時に保持する未受け取りコードは接続元ごとに3件、全体で50件まで。接続元ごとの上限に達した場合は、その接続元の未承認コードを古い順に破棄して新しいコードを発行する（再発行を繰り返しても締め出されない。他の接続元のコードは破棄しない）。全体の上限、または接続元のコードが全て承認済みの場合は`429`で拒否する。接続元は`cf-connecting-ip`ヘッダー、無ければソケットのアドレスで識別する。
- コードの受付は、`users.json`に登録済みのDiscord/LINEユーザーからのメッセージのみ。
- 照合時は大文字小文字・ハイフンの有無を無視する（`tj-abcd-efgh`や`TJABCDEFGH`も可）。

### 3.3 Discord / LINEでの入力方法

| チャネル | 入力方法 |
| --- | --- |
| Discord | BotとのDMにコードをそのまま貼り付け、または`/link code:TJ-XXXX-XXXX`（エフェメラル返信）。サーバーチャンネルへの貼り付けには反応しない |
| LINE | 公式アカウントとの1対1のトークにコードをそのまま貼り付け（グループ・複数人トークでは反応しない） |

- Discordのサーバーチャンネルではコードが他人に見え、別の登録ユーザーに先に使われる恐れがあるため、貼り付けはDMのみ受け付ける。
- LINEの返信はreplyトークンを使う（月間メッセージ数を消費しない）。

### 3.4 アクセストークン

- 32バイトの乱数をbase64url化した値。拡張機能の`chrome.storage.local`に保存する。
- サーバー側はトークンのSHA-256ハッシュのみを保存する（平文は保持しない）。
- 保存先: `EXTENSION_TOKEN_STORE_PATH`（既定値: `<作業ディレクトリ>/data/extension-tokens.json`）。Dockerでは名前付きボリューム`tubejelly-data`を`/app/data`にマウントして永続化する。
- 保存内容: `id`, `tokenHash`, `userKey`(Discord IDまたはLINE ID), `via`(`discord`/`line`), `deviceName`, `createdAt`, `lastUsedAt`。
- 毎リクエストで`userKey`から`users.json`を引き直すため、`users.json`からユーザーを削除すればトークンも無効になる。
- 拡張機能の「連携解除」で`DELETE /ext/v1/token`を呼び、サーバー側からも削除する。
- 端末紛失時はサーバーの`extension-tokens.json`から該当行を削除し、コンテナを再起動する。

## 4. 拡張機能API仕様

すべてJSON。ベースパス`/ext/v1`。リクエストボディ上限16KB。
認証が必要なAPIは`Authorization: Bearer <token>`ヘッダーを付ける。

| メソッド | パス | 認証 | 内容 |
| --- | --- | --- | --- |
| GET | `/ext/v1/health` | 不要 | 疎通確認。`{ ok: true, service: "tubejelly" }` |
| POST | `/ext/v1/pair/start` | 不要 | 連携コード発行 |
| POST | `/ext/v1/pair/poll` | 不要（pairingIdが秘密値） | 連携状態の確認とトークン受け取り |
| GET | `/ext/v1/me` | 必要 | 連携中のユーザー名・端末名 |
| DELETE | `/ext/v1/token` | 必要 | 連携解除（トークン失効） |
| POST | `/ext/v1/jobs` | 必要 | 追加ジョブの登録 |
| GET | `/ext/v1/jobs/:id` | 必要 | ジョブの状態とログ |

### 4.1 POST /ext/v1/pair/start

```jsonc
// request
{ "deviceName": "Chrome (Linux)" }   // 任意。最大40文字
// response 201
{ "pairingId": "…43文字…", "code": "TJ-ABCD-2345", "expiresAt": "2026-11-24T10:10:00.000Z" }
```

### 4.2 POST /ext/v1/pair/poll

```jsonc
// request
{ "pairingId": "…" }
// response 200
{ "status": "pending", "expiresAt": "…" }
{ "status": "approved", "token": "…", "userName": "hoge", "deviceName": "Chrome (Linux)" }
// 期限切れ・存在しない場合
{ "status": "expired" }
```

`approved`はトークンを含むため1回しか返さない。承認済みの記録を「受け取り中」として確保してからトークンを保存し、保存に成功したら破棄、失敗したら確保を戻して次回の確認で再試行できるようにする（同時の確認には`pending`を返し、二重発行しない）。

### 4.3 POST /ext/v1/jobs

```jsonc
// request
{
  "url": "https://www.youtube.com/watch?v=xxxxxxxxxxx&list=PLxxxx",
  "kind": "music",          // "music" | "video"
  "playlist": false,        // true: URL内のプレイリスト全体を追加
  "title": "タブのタイトル"   // 任意。表示用
}
// response 202
{ "job": Job }
```

- `playlist: false`の場合は動画IDを抽出して1本だけ追加する。動画IDが無くプレイリストIDのみのURL（`/playlist?list=`）は自動でプレイリストとして扱う。
- YouTube以外のURL、または動画ID・プレイリストIDのどちらも取れないURLは`400`。

### 4.4 Job

```jsonc
{
  "id": "…",
  "kind": "music",
  "mode": "single",                       // "single" | "playlist"
  "url": "https://www.youtube.com/watch?v=xxxxxxxxxxx",
  "title": "曲名",
  "status": "running",                    // "queued" | "running" | "succeeded" | "failed"
  "createdAt": "…", "startedAt": "…", "finishedAt": null,
  "result": {                             // 終了時のみ
    "skipped": false,                     // 既存ファイルのためスキップした
    "filename": "曲名.mp3",
    "size": 1234567,
    "successCount": 1, "skippedCount": 0, "failedCount": 0
  },
  "error": null,                          // 失敗時のメッセージ
  "logs": [ { "at": "…", "level": "info", "message": "📥 ダウンロード中: 40%" } ]
}
```

- ジョブはサーバー全体で1本ずつ順番に処理する（Raspberry Piの負荷対策）。登録APIは必ず`queued`の状態で応答し、処理は次のイベントループで始める。
- ユーザーあたりの未完了ジョブは20件まで。
- プレイリストで1件でも失敗した場合は`failed`とし、`error`に成功・スキップ・失敗件数を入れる。既存ファイルのスキップは`succeeded`かつ`result.skipped: true`。
- ログは既存のダウンロード処理（`download.ts`）が出す進捗メッセージを、メッセージアダプター経由で取り込む。1ジョブ最大500行。
- ジョブはメモリ上に保持し、終了から24時間経過、またはユーザーごとに50件を超えた古いものから破棄する。サーバー再起動時は消える（拡張機能側は`404`を「サーバー上に記録がありません」と表示）。
- 他ユーザーのジョブIDを指定した場合も`404`。

### 4.5 エラー応答

```json
{ "error": { "code": "unauthorized", "message": "連携が無効です。再連携してください。" } }
```

| HTTP | code | 状況 |
| --- | --- | --- |
| 400 | `bad_request` | JSON不正・必須項目なし・URL不正 |
| 401 | `unauthorized` | トークンなし・無効・ユーザー登録解除済み |
| 404 | `not_found` | パス・ジョブが存在しない |
| 405 | `method_not_allowed` | パスに対してメソッドが不正 |
| 413 | `payload_too_large` | ボディが16KB超 |
| 429 | `too_many_requests` | 未受け取りの連携コードが上限、または未完了ジョブがユーザーあたり20件 |
| 500 | `internal` | その他 |

### 4.6 CORS

CORSヘッダーは返さない。拡張機能はサーバーのオリジンに対するホスト権限（`optional_host_permissions`）を取得して通信するため、CORSの制約を受けない。これにより一般のWebページからはレスポンスを読めない。

## 5. サーバー側の実装構成

```
src/
├─ http/
│  └─ server.ts            # HTTPサーバー起動。ルートハンドラーを順に試す
├─ line/
│  └─ webhook.ts           # createLineWebhookHandler() に変更。連携コード受付を追加
├─ extension/
│  ├─ pairing.ts           # 連携コードの発行・承認・受け取り（メモリ）
│  ├─ tokenStore.ts        # トークンの永続化（JSON、原子的書き込み）
│  ├─ jobs.ts              # ジョブキューとログ
│  ├─ runner.ts            # 既存download.tsを呼び出す実行処理
│  ├─ service.ts           # 上記をまとめるサービス（シングルトン）
│  ├─ api.ts               # /ext/v1/* のルーティング
│  └─ *.test.ts            # node:test によるテスト
├─ commands/
│  └─ link.ts              # Discord /link コマンド
└─ index.ts                # 連携コード受付（DM）とHTTPサーバー起動を追加
```

### 5.1 環境変数（追加）

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `EXTENSION_API_ENABLED` | `false` | `true`で拡張機能APIを有効化 |
| `EXTENSION_TOKEN_STORE_PATH` | `./data/extension-tokens.json` | トークン保存先 |

HTTPサーバーのポートは既存の`LINE_WEBHOOK_PORT`を共用する。LINE連携が無効でも`EXTENSION_API_ENABLED=true`ならHTTPサーバーを起動する。HTTPサーバーはDiscordの準備完了を待たずに起動する。

### 5.2 Docker

- `Dockerfile`: `/app/data`を作成し`nodejs`ユーザーの所有にする。
- `docker-compose.yml`: 名前付きボリューム`tubejelly-data:/app/data`を追加（初回作成時にイメージ内の所有者が引き継がれるため、ホストのUID差異の影響を受けない）。

## 6. 拡張機能の構成

Manifest V3、ビルド不要の素のJavaScript（ESモジュール）。

```
extension/
├─ manifest.json
├─ icons/                  # 16/32/48/128px（doc/icons/Tubejelly-logo.png から生成）
├─ popup.html / popup.css / popup.js
├─ background.js           # Service Worker: バックグラウンドのポーリング・バッジ・通知
└─ lib/
   ├─ actions.js           # 背景で実行する処理（追加・連携コード発行・連携確認）とメッセージ受付
   ├─ api.js               # サーバーAPIクライアント（タイムアウト付きfetch）
   ├─ storage.js           # chrome.storage.local のラッパー
   ├─ sync.js              # ジョブ・連携状態の確認、アラーム、バッジ（popupとbackgroundで共用）
   └─ youtube.js           # タブURLの解析（動画ID・プレイリストID）
```

### 6.1 権限

| 権限 | 用途 |
| --- | --- |
| `activeTab` | ポップアップを開いたときに表示中タブのURL・タイトルを読む |
| `storage` | 設定・トークン・ジョブ履歴の保存 |
| `alarms` | ポップアップを閉じている間のポーリング |
| `notifications` | 追加完了・失敗の通知 |
| `optional_host_permissions: https://*/*, http://*/*` | 設定したサーバーのオリジンだけを実行時に許可する |

### 6.2 画面

**初期設定（未連携）**

1. サーバーURL（例: `https://tubejelly.example.com`）と端末名を入力し「接続して連携コードを発行」
2. ホスト権限の許可ダイアログ → `/ext/v1/health`で疎通確認 → 連携コードを大きく表示（コピーボタン、残り時間）
3. 「DiscordのDM（または`/link`）かLINEにこのコードを送信してください」と案内
4. 承認されると自動でメイン画面へ。ポップアップを閉じてもコードは保存されており、再度開くと続きから確認する

**メイン画面（連携済み）**

- 表示中タブのタイトルとURL。YouTubeの動画/プレイリストでなければ「YouTubeの動画ページを開いてください」と表示し、追加ボタンを無効化
- 種別: `🎵 ミュージック` / `🎬 動画`（前回の選択を記憶）
- URLにプレイリストが含まれる場合のみ「プレイリスト全体を追加」チェックボックス
- 「追加」ボタン
- 履歴（最新30件、スクロール）: タイトル、種別、ステータスバッジ（待機中 / 実行中 / 成功 / 成功（既存） / 失敗 / 不明）、失敗時はエラーメッセージ、「詳細↓」ボタンでログを展開（「詳細↑」で閉じる）。実行中は最新のログを1行表示
- ヘッダーに連携中のユーザー名、履歴の「完了分をクリア」、フッターにサーバーURLと「連携解除」（誤操作防止のため2回押し）

### 6.3 状態管理

- `chrome.storage.local`のキー
  - `settings`: `{ serverUrl, deviceName, lastKind }`
  - `auth`: `{ token, userName, deviceName }`
  - `pairing`: `{ pairingId, code, expiresAt }`（連携中のみ）
  - `jobIds`: 新しい順のジョブID配列（最大30件）
  - `job:<id>`: サーバーから取得したJobのスナップショット
- ポップアップと背景の同時更新で競合しないよう、ジョブは1件ずつ別キーに保存する。
- ポップアップはフォーカスが外れると即座に破棄されるため、サーバーに副作用がある処理（ジョブ登録と履歴保存、連携コード発行、連携確認とトークン保存）は`chrome.runtime.sendMessage`で背景（Service Worker）に依頼して実行する。ポップアップは`chrome.storage`の変更を監視して表示を更新する。ジョブ状態の取得（読み取りのみ）はポップアップ表示中に直接行う。
- 背景（Service Worker）は30秒ごとのアラームで未完了ジョブと連携待ちを確認し、未完了ジョブ数をアイコンのバッジに表示、完了・失敗時に通知を出す。未完了ジョブも連携待ちも無くなったらアラームを止める。
- `401`を受けたら`auth`を削除し、初期設定画面に戻す。
- ジョブ取得で`404`の場合は、ローカルの状態を`unknown`（不明）にして確認を終える。
- 通知は背景のみが出す。ポップアップ表示中に完了を確認したジョブは`notified`を立て、通知しない。
- ホスト権限は`<scheme>://<hostname>/*`で要求する（Chromeのパターンはポートを指定しないと全ポートに一致する）。

## 7. セキュリティ

- トークン・pairingIdは32バイトの暗号学的乱数。サーバーはトークンをハッシュで保存。
- 連携コードの承認は登録済みユーザーのメッセージからのみ。コードだけではトークンを受け取れない（pairingIdが必要）。
- ジョブは所有者のみ参照可能。
- 受け付けるURLはYouTubeのみ（既存の正規化関数で`https://www.youtube.com/watch?v=<ID>`/`playlist?list=<ID>`に正規化してからyt-dlpへ渡す）。
- ログにトークンを出力しない。
- HTTPのサーバーURLも設定可能だが、Cloudflare Tunnel経由のHTTPSを前提とする（HTTPの場合は画面で警告）。

## 8. テスト

- `pnpm test`（`node --import tsx --test`）で以下を検証する。
  - 連携コード: 形式、正規化、期限切れ、二重承認不可、上限
  - トークン保存: ハッシュ保存、再読み込み、失効
  - ジョブ: 順次実行、ログ記録、上限、所有者チェック
  - API: 認証、入力検証、ペアリング〜ジョブ登録までの一連の流れ（実際にHTTPサーバーを立てて検証。ダウンロード処理は差し替え）
- 拡張機能は手動確認（`chrome://extensions`で読み込み）。

## 9. 今後の拡張候補（今回は対象外）

- Discord/LINEから連携中の端末一覧を見て失効させるコマンド
- 追加時にタイトル・アーティスト・アルバムを編集する入力欄
- プレイリストの最大件数指定
- YouTubeページ上に直接「TubeJellyに追加」ボタンを差し込むコンテンツスクリプト
