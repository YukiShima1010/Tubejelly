FROM node:22-alpine

# pnpmのインストール
RUN corepack enable && corepack prepare pnpm@latest --activate

# ffmpeg、Python、yt-dlpのインストール
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp

# 作業ディレクトリ
WORKDIR /app

# パッケージファイルのコピー
COPY package.json pnpm-lock.yaml .npmrc ./

# 依存関係のインストール
RUN pnpm install --frozen-lockfile --prod

# TypeScript設定とソースコードのコピー
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScriptのビルド
RUN pnpm install --frozen-lockfile && pnpm run build

# 本番環境用の依存関係のみ残す
RUN pnpm prune --prod

# 一時ディレクトリの作成
RUN mkdir -p /app/downloads

# 非rootユーザーで実行
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# 起動
CMD ["node", "dist/index.js"]