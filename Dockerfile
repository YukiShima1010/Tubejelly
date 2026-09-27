FROM node:22-bookworm-slim AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 python3-pip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# 作業ディレクトリ
WORKDIR /app

# パッケージファイルのコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 依存関係のインストール
RUN corepack enable && pnpm install --frozen-lockfile

# TypeScript設定とソースコードのコピー
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScriptのビルド
RUN pnpm run build

# 本番環境用の依存関係のみ残す
RUN pnpm prune --prod

# 一時ディレクトリの作成
RUN mkdir -p /app/downloads

# 非rootユーザーで実行
FROM node:22-bookworm-slim AS runtime

COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 python3-pip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" nodejs && \
    mkdir -p /music /video && \
    chown -R nodejs:nodejs /app /music /video

USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"

# 起動
CMD ["node", "dist/index.js"]