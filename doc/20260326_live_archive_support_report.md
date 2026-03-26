# TubeJelly YouTube Live（アーカイブ）対応レポート

**日時:** 2026-03-26

## 対応概要

YouTube通常動画に加えて、YouTube Live（アーカイブ）URLも同様にダウンロードできるように改善しました。
また、リンク形式差分（`youtube.com/...` / `youtu.be/...` / スキーム省略）を吸収し、コマンド入力の揺れに強い実装へ変更しました。

## 実装内容

### 1. URL正規化処理の追加

**変更ファイル:** `src/utils/download.ts`

以下の関数を追加しました。

- `extractYouTubeVideoId(input: string): string | null`
- `normalizeYouTubeVideoUrl(input: string): string | null`
- `extractYouTubePlaylistId(input: string): string | null`
- `normalizeYouTubePlaylistUrl(input: string): string | null`

あわせて内部ユーティリティとして以下を追加。

- `ensureUrlProtocol`（`youtube.com/...` のようなスキーム省略入力を補正）
- `isYouTubeHost`（YouTube系ホスト判定）
- `extractVideoIdFromPath`（`/live/{id}` や `/shorts/{id}` などの抽出）

### 2. 対応URLパターンの拡張（動画）

動画ID抽出は以下をサポート。

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/live/VIDEO_ID`（Liveアーカイブ）
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `youtube.com/watch?v=VIDEO_ID`（スキーム省略）

最終的に `https://www.youtube.com/watch?v=VIDEO_ID` へ正規化して処理します。

### 3. 対応URLパターンの拡張（プレイリスト）

プレイリストID（`list=`）を抽出し、以下形式を許容。

- `https://www.youtube.com/playlist?list=PLAYLIST_ID`
- `https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID`
- `youtube.com/playlist?list=PLAYLIST_ID`（スキーム省略）

最終的に `https://www.youtube.com/playlist?list=PLAYLIST_ID` へ正規化して処理します。

### 4. コマンド側のバリデーション・実行処理を更新

**変更ファイル:**

- `src/commands/add.ts`
- `src/commands/addList.ts`

正規表現の直接判定から、正規化関数ベース判定に変更しました。

- `/add` は `normalizeYouTubeVideoUrl` を利用
- `/add_list` は `normalizeYouTubePlaylistUrl` を利用

### 5. ヘルプ文言を更新

**変更ファイル:** `src/commands/help.ts`

`youtu.be` と `youtube.com/live/...` の例を追加し、利用可能URLの説明を明記しました。

## 実行コマンドと結果

### エラーチェック

```bash
pnpm typecheck
```

- 結果: ✅ 成功

```bash
get_errors (target: src)
```

- 結果: ✅ エラーなし

### lint

```bash
pnpm lint
```

- 初回結果: ❌ `URL is not defined`（`src/utils/download.ts`）
- 対応: `import { URL } from 'url';` を追加
- 再実行結果: ✅ 成功

### build

```bash
pnpm build
```

- 結果: ✅ 成功

## 変更ファイル一覧

- `src/utils/download.ts`
- `src/commands/add.ts`
- `src/commands/addList.ts`
- `src/commands/help.ts`
- `doc/20260326_live_archive_support_report.md`（本レポート）

## 補足

- 本対応はURL正規化を入口に置いたため、今後YouTube URL形式が増えても拡張しやすい構造です。
- 実ダウンロード本体は既存どおり `yt-dlp` を使用しており、Liveアーカイブも通常動画と同経路で処理されます。
