#!/usr/bin/env bash
set -euo pipefail

echo "TubeJelly 3.0.0 セットアップ"
echo "=========================="

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ".env を作成しました。値を設定してから再実行してください。"
  exit 1
fi

required_vars=(DISCORD_ENABLED LINE_ENABLED MUSIC_HOST_PATH VIDEO_HOST_PATH USERS_CONFIG_JSON)
set -a
# shellcheck disable=SC1091
source .env
set +a

for variable in "${required_vars[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "エラー: ${variable} が設定されていません。"
    exit 1
  fi
done

if [[ "${DISCORD_ENABLED}" != "true" && "${DISCORD_ENABLED}" != "false" ]]; then
  echo "エラー: DISCORD_ENABLED はtrueまたはfalseで指定してください。"
  exit 1
fi

if [[ "${LINE_ENABLED}" != "true" && "${LINE_ENABLED}" != "false" ]]; then
  echo "エラー: LINE_ENABLED はtrueまたはfalseで指定してください。"
  exit 1
fi

if [[ "${DISCORD_ENABLED}" == "false" && "${LINE_ENABLED}" == "false" ]]; then
  echo "エラー: DiscordまたはLINEの少なくとも一方を有効にしてください。"
  exit 1
fi

if [[ "${DISCORD_ENABLED}" == "true" && ( -z "${DISCORD_TOKEN:-}" || "${DISCORD_TOKEN}" == replace_with_* ) ]]; then
  echo "エラー: DISCORD_TOKEN を実際の値へ変更してください。"
  exit 1
fi

if [[ "${LINE_ENABLED}" == "true" && ( -z "${LINE_CHANNEL_ACCESS_TOKEN:-}" || -z "${LINE_CHANNEL_SECRET:-}" ) ]]; then
  echo "エラー: LINE_ENABLED=true にはLINEのトークンとシークレットが必要です。"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "エラー: Dockerがインストールされていません。"
  exit 1
fi

compose=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    compose=(docker-compose)
  else
    echo "エラー: Docker Composeが利用できません。"
    exit 1
  fi
fi

"${compose[@]}" config >/dev/null
echo "設定ファイルの検証に成功しました。"
"${compose[@]}" build

echo
echo "セットアップが完了しました。"
echo "起動:   ${compose[*]} up -d"
echo "ログ:   ${compose[*]} logs -f tubejelly"
echo "停止:   ${compose[*]} down"
echo "Cloudflare Tunnel: ${compose[*]} --profile cloudflare up -d"