FROM node:22-bookworm-slim

# package.jsonで指定したpnpmのバージョンを使用する
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate

# ffmpeg、Python、yt-dlp、Denoのインストール
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip curl unzip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    curl -L https://github.com/denoland/deno/releases/latest/download/deno-aarch64-unknown-linux-gnu.zip \
      -o /tmp/deno.zip && \
    unzip /tmp/deno.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/deno && \
    rm /tmp/deno.zip && \
    rm -rf /var/lib/apt/lists/*

# 作業ディレクトリ
WORKDIR /app

# パッケージファイルのコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 依存関係のインストール
RUN pnpm install --frozen-lockfile --prod

# TypeScript設定とソースコードのコピー
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScriptのビルド
RUN pnpm install --frozen-lockfile && pnpm run build

# 本番環境用の依存関係のみ残す
RUN pnpm prune --prod

# 一時ディレクトリと永続データ（拡張機能トークン）用ディレクトリの作成
RUN mkdir -p /app/downloads /app/data

# 非rootユーザーで実行
RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# 起動
CMD ["node", "dist/index.js"]