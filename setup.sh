#!/bin/bash

echo "🎵 TubeJelly セットアップスクリプト"
echo "=================================="
echo ""

# pnpmの確認
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm がインストールされていません"
    echo "📥 pnpm をインストールしています..."
    npm install -g pnpm
    if [ $? -ne 0 ]; then
        echo "❌ pnpm のインストールに失敗しました"
        echo "手動でインストールしてください: npm install -g pnpm"
        exit 1
    fi
    echo "✅ pnpm のインストール完了"
    echo ""
fi

# .envファイルの確認
if [ ! -f .env ]; then
    echo "⚠️  .env ファイルが見つかりません"
    echo "📝 .env.example から .env を作成します..."
    cp .env.example .env
    echo "✅ .env ファイルを作成しました"
    echo ""
    echo "📌 次のステップ:"
    echo "1. .env ファイルを編集してください"
    echo "   - DISCORD_TOKEN: Discord Bot のトークン"
    echo ""
    echo "2. docker-compose.yml を編集してください"
    echo "   - volumes の /path/to/jellyfin/music を実際のパスに変更"
    echo "   例: - /Users/username/Music/Jellyfin:/music"
    echo ""
    echo "3. 編集後、再度このスクリプトを実行してください"
    exit 1
fi

# 環境変数の読み込み
source .env

# Discord Tokenの確認
if [ "$DISCORD_TOKEN" = "your_discord_bot_token_here" ]; then
    echo "❌ DISCORD_TOKEN が設定されていません"
    echo "📝 .env ファイルを編集して Discord Bot Token を設定してください"
    exit 1
fi

# Jellyfin Pathの確認（.env では /music で固定）
if [ "$JELLYFIN_MUSIC_PATH" != "/music" ]; then
    echo "⚠️  警告: JELLYFIN_MUSIC_PATH が /music ではありません"
    echo "Docker使用時は JELLYFIN_MUSIC_PATH=/music である必要があります"
    echo "📝 .env ファイルを編集してください"
    exit 1
fi

echo "✅ 環境変数の確認完了"
echo ""

# docker-compose.yml のパスチェック
if grep -q "/path/to/jellyfin/music" docker-compose.yml; then
    echo "❌ docker-compose.yml がセットアップされていません"
    echo "📝 docker-compose.yml を編集して、ボリュームマウントパスを設定してください"
    echo ""
    echo "例:"
    echo "  volumes:"
    echo "    - /Users/username/Music/Jellyfin:/music"
    echo "    - ./downloads:/app/downloads"
    exit 1
fi

echo "✅ docker-compose.yml の確認完了"
echo ""

# Dockerの確認
if ! command -v docker &> /dev/null; then
    echo "❌ Docker がインストールされていません"
    echo "📥 Docker をインストールしてください: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose がインストールされていません"
    echo "📥 Docker Compose をインストールしてください"
    exit 1
fi

echo "✅ Docker の確認完了"
echo ""

# downloadsディレクトリの作成
if [ ! -d "downloads" ]; then
    mkdir -p downloads
    echo "✅ downloads ディレクトリを作成しました"
fi

echo "🐳 Docker イメージをビルドしています..."
docker-compose build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ セットアップ完了！"
    echo ""
    echo "🚀 起動方法:"
    echo "   docker-compose up -d"
    echo ""
    echo "📋 ログ確認:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 停止方法:"
    echo "   docker-compose down"
    echo ""
    echo "💻 ローカル開発:"
    echo "   pnpm install    # 依存関係のインストール"
    echo "   pnpm dev        # 開発モードで起動"
else
    echo ""
    echo "❌ ビルドに失敗しました"
    exit 1
fi