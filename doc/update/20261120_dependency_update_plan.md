# 依存関係アップデート計画

**日時:** 2026-11-20  
**対象プロジェクト:** tubejelly v2.0.0

---

## 概要

依存パッケージのマイナー以下のアップデートを実施し、TypeScript 7.0.2 (メジャー) のアップグレードについて計画を立てる。

---

## フェーズ1: マイナー/パッチアップデート（完了済み）

以下のパッケージを最新のマイナー/パッチバージョンに更新した。

| パッケージ | 更新前 | 更新後 | 種別 |
|---|---|---|---|
| `dotenv` | 18.0.9 | 18.0.10 | patch |
| `discord.js` | 14.27.0 | 14.28.1 | minor |
| `music-metadata` | 12.3.2 | 12.7.0 | minor |
| `eslint` | 10.13.0 | 10.15.0 | minor |
| `@typescript-eslint/eslint-plugin` | 8.72.1 | 8.73.0 | patch |
| `@typescript-eslint/parser` | 8.72.1 | 8.73.0 | patch |

### チェック結果（フェーズ1）

- ✅ `typecheck` (tsc --noEmit): 通過
- ✅ `lint` (eslint): 通過
- ✅ `build` (tsc + config copy): 通過

**コード変更:** 不要（APIの破壊的変更なし）

---

## フェーズ2: TypeScript 7.0.2 メジャーアップデート

### TypeScript 7.0 の概要

TypeScript 7.0 は **Go言語による完全な再実装** (Project Corsa) であり、単なる機能追加ではなく根本的なアーキテクチャの変更を含む。

**主なメリット:**
- ビルド/型チェック速度: **8〜12倍高速化**
- メモリ使用量の大幅削減
- マルチスレッド対応

### 破壊的変更の影響分析

#### 1. `tsconfig.json` の変更点

| 項目 | 変更内容 | 本プロジェクトへの影響 |
|---|---|---|
| `moduleResolution: "node"` | 削除 | **なし**（既に `"bundler"` を使用） |
| `moduleResolution: "classic"` | 削除 | **なし** |
| `baseUrl` | 削除 | **なし**（使用していない） |
| `target: "es5"` | 削除 | **なし**（`"ES2022"` を使用） |
| `outFile` | 削除 | **なし**（使用していない） |
| `types` のデフォルト | 空配列に変更 | **要対応**（`@types/node` のグローバル型が自動注入されなくなる） |

#### 2. `typescript-eslint` との非互換問題（重大）

TypeScript 7.0 は **Node.js/JavaScript の Compiler API を廃止** しており、`typescript-eslint` がこれに依存しているため：

- `eslint` を `typescript-eslint` と共に使用すると**クラッシュ**する
- `typescript-eslint` v8.x は TypeScript 7.0 の Programmatic API に未対応（TypeScript 7.1+ 待ち）

### 採用戦略: デュアルコンパイラ方式

TypeScript 7.1 リリース（予定）まで、以下の方式を採用する：

```
TypeScript 7.0 (@typescript/native) → tsc/tsgo による高速型チェック・ビルド
TypeScript 6.x (typescript 互換パッケージ) → typescript-eslint が利用する
```

**package.json への変更:**

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@^7.0.2",   // 追加: 型チェック・ビルド用
    "typescript": "npm:@typescript/typescript6@^6.0.2"  // 変更: eslint用互換パッケージ
  }
}
```

**tsconfig.json への変更:**

`types` フィールドを明示的に追加（Node.js グローバル型の自動注入廃止への対応）:

```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

**スクリプトの変更:**

`typecheck` と `build` を `@typescript/native` 経由の `tsgo` コマンドに更新:

```json
{
  "scripts": {
    "typecheck": "tsgo --noEmit",
    "build": "tsgo && cp -r src/config dist/config"
  }
}
```

### リスク評価

| リスク | 重大度 | 対策 |
|---|---|---|
| `typescript-eslint` 非互換 | **高** | デュアルコンパイラで回避 |
| `tsconfig.json` 設定削除 | **低** | 本プロジェクトでは未使用 |
| `@types/node` グローバル型 | **中** | `types: ["node"]` 明示指定で解決 |
| `tsx` (dev実行ツール) の互換性 | **中** | 要調査・テスト |

### 実施手順

1. `@typescript/native` パッケージの追加インストール → `npm:typescript@^7.0.2` alias
2. `typescript` を `@typescript/typescript6` に切り替え → `npm:@typescript/typescript6@^6.0.2`
3. `tsconfig.json` に `"types": ["node"]` を追加
4. `typecheck` / `lint` / `build` の通過確認

> [!NOTE]
> `tsc` スクリプト自体は変更不要。`@typescript/native` の `tsc` が `node_modules/.bin/tsc` として解決され、TS7.0.2 が使用される。
> `typescript-eslint` は `typescript` (TS6互換パッケージ) を参照するため lint も問題なく動作する。

---

## フェーズ2実施後のチェック結果

**実施日:** 2026-11-20

### 最終的なパッケージ構成

| パッケージ | バージョン | 用途 |
|---|---|---|
| `@typescript/native` | `typescript@7.0.2` | `tsc` / typecheck / build (TS7 Go製) |
| `typescript` | `@typescript/typescript6@6.0.2` | `typescript-eslint` 向け API 互換レイヤー |
| `eslint` | 10.15.0 | linter |
| `@typescript-eslint/*` | 8.73.0 | TypeScript向けESLintプラグイン |

### チェック結果

- ✅ `typecheck` (tsc --noEmit → TS 7.0.2): **通過**
- ✅ `lint` (eslint with TS6 compat): **通過**
- ✅ `build` (tsc → TS 7.0.2 + config copy): **通過**

### 注記

- `@typescript-eslint` v8.73.0 は `@typescript/native >= 7.1.0-dev` をpeer依存に要求しているが、TS6互換パッケージを `typescript` として提供することで動作は問題なし
- TypeScript 7.1 リリース後は `@typescript/native` のみに統一可能（デュアルコンパイラ解消）
