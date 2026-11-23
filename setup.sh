#!/bin/bash
# TubeJelly セットアップ前チェック & Dockerイメージのビルド
#
# 確認する内容:
#   - Docker / Docker Compose v2
#   - .env（DISCORD_TOKEN、LINE、Cloudflare Tunnel、拡張機能）
#   - src/config/users.json（形式と保存先）
#   - docker-compose.yml のボリューム（ホスト側ディレクトリの存在と書き込み権限）
# 問題があればエラー（❌）で終了し、注意点は警告（⚠️）として表示します。
#
# 使い方:
#   ./setup.sh          チェックしてからイメージをビルド
#   ./setup.sh --check  チェックのみ（ビルドしない）

set -u
cd "$(dirname "$0")"

check_only=false
[ "${1:-}" = "--check" ] && check_only=true

errors=0
warnings=0
error() { echo "❌ $*"; errors=$((errors + 1)); }
warn() { echo "⚠️  $*"; warnings=$((warnings + 1)); }
ok() { echo "✅ $*"; }

# プレースホルダーや空値かどうか
is_unset() {
    [ -z "${1:-}" ] || [[ "$1" == your_* ]] || [[ "$1" == replace_with_* ]]
}

echo "🎵 TubeJelly セットアップチェック"
echo "=================================="
echo ""

# --- Docker -------------------------------------------------------------------
if ! command -v docker &> /dev/null; then
    echo "❌ Docker がインストールされていません: https://docs.docker.com/engine/install/"
    exit 1
fi
if docker compose version &> /dev/null; then
    COMPOSE=(docker compose)
elif command -v docker-compose &> /dev/null; then
    COMPOSE=(docker-compose)
    warn "旧版の docker-compose を使用します。Docker Compose v2（docker compose）を推奨します"
else
    echo "❌ Docker Compose がインストールされていません（sudo apt install docker-compose-plugin）"
    exit 1
fi
ok "Docker: $(docker --version | head -1)"

arch=$(uname -m)
if [ "$arch" != "aarch64" ] && [ "$arch" != "arm64" ]; then
    warn "この Dockerfile は arm64（Raspberry Pi 等）向けです（現在: ${arch}）。x86_64 では Dockerfile の Deno ダウンロードURLを x86_64 用に変更してください"
fi

# --- .env ---------------------------------------------------------------------
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "📝 .env がなかったため .env.example から作成しました。"
    echo "   .env を編集して DISCORD_TOKEN などを設定し、もう一度 ./setup.sh を実行してください。"
    echo "   手順: doc/setup/GETTING_STARTED.md"
    exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if is_unset "${DISCORD_TOKEN:-}"; then
    error "DISCORD_TOKEN が未設定です（Discord は必須です）"
else
    ok "DISCORD_TOKEN が設定されています"
fi

line_enabled=false
if ! is_unset "${LINE_CHANNEL_ACCESS_TOKEN:-}" && ! is_unset "${LINE_CHANNEL_SECRET:-}"; then
    line_enabled=true
    ok "LINE連携: 有効"
elif ! is_unset "${LINE_CHANNEL_ACCESS_TOKEN:-}" || ! is_unset "${LINE_CHANNEL_SECRET:-}"; then
    error "LINE_CHANNEL_ACCESS_TOKEN と LINE_CHANNEL_SECRET は両方設定してください（使わない場合は両方空）"
else
    ok "LINE連携: 無効"
fi
if [[ "${LINE_CHANNEL_ACCESS_TOKEN:-}" == your_* ]] || [[ "${LINE_CHANNEL_SECRET:-}" == your_* ]]; then
    error "LINE の値がサンプルのままです。使わない場合は空にしてください"
fi

extension_enabled=false
if [ "$(echo "${EXTENSION_API_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
    extension_enabled=true
    ok "Chrome拡張機能API: 有効"
else
    ok "Chrome拡張機能API: 無効"
fi

port="${LINE_WEBHOOK_PORT:-3330}"
if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    error "LINE_WEBHOOK_PORT が不正です: ${port}"
fi

if is_unset "${CLOUDFLARED_TUNNEL_TOKEN:-}"; then
    if $line_enabled || $extension_enabled; then
        error "CLOUDFLARED_TUNNEL_TOKEN が未設定です（LINE・拡張機能の外部公開に必要）"
    else
        warn "CLOUDFLARED_TUNNEL_TOKEN が未設定のため cloudflared コンテナは起動に失敗し続けます。LINE・拡張機能を使わないなら無視して構いません（docker compose up -d tubejelly で本体のみ起動できます）"
    fi
else
    ok "CLOUDFLARED_TUNNEL_TOKEN が設定されています"
fi

# --- users.json ---------------------------------------------------------------
users_file="src/config/users.json"
user_dirs=""
if [ ! -f "$users_file" ]; then
    error "${users_file} がありません。cp src/config/users.json.sample ${users_file} で作成し、自分のIDを設定してください"
elif command -v python3 &> /dev/null; then
    user_check=$(python3 - "$users_file" <<'PY'
import json, re, sys
path = sys.argv[1]
try:
    data = json.load(open(path, encoding="utf-8"))
except Exception as e:
    print(f"ERROR JSONとして読めません: {e}")
    sys.exit()
if not isinstance(data, list) or not data:
    print("ERROR ユーザーの配列（[ {...} ]）にしてください")
    sys.exit()
dirs = set()
for i, u in enumerate(data, 1):
    name = u.get("NAME") or f"{i}人目"
    if not u.get("MUSIC_DL_DIR") or not u.get("VIDEO_DL_DIR"):
        print(f"ERROR {name}: MUSIC_DL_DIR と VIDEO_DL_DIR は必須です")
    else:
        dirs.update([u["MUSIC_DL_DIR"], u["VIDEO_DL_DIR"]])
    d, l = u.get("DISCORD_USER_ID"), u.get("LINE_USER_ID")
    if not d and not l:
        print(f"ERROR {name}: DISCORD_USER_ID か LINE_USER_ID のどちらかが必要です")
    if d and not re.fullmatch(r"\d{15,21}", str(d)):
        print(f"WARN {name}: DISCORD_USER_ID が数字のIDではありません（サンプルのまま？）: {d}")
    if l and not re.fullmatch(r"U[0-9a-f]{32}", str(l)):
        print(f"WARN {name}: LINE_USER_ID の形式が違います（U + 32桁。サンプルのまま？）: {l}")
print("DIRS " + " ".join(sorted(dirs)))
print(f"OK {len(data)}人のユーザーを確認しました")
PY
)
    while IFS= read -r line; do
        case "$line" in
            ERROR*) error "users.json: ${line#ERROR }" ;;
            WARN*) warn "users.json: ${line#WARN }" ;;
            DIRS*) user_dirs="${line#DIRS }" ;;
            OK*) ok "users.json: ${line#OK }" ;;
        esac
    done <<< "$user_check"
else
    warn "python3 がないため users.json の内容チェックを省略しました"
fi

# --- docker-compose.yml ------------------------------------------------------
compose_json_file=$(mktemp)
compose_err_file=$(mktemp)
if ! "${COMPOSE[@]}" config --format json > "$compose_json_file" 2> "$compose_err_file"; then
    error "docker-compose.yml を読み込めません: $(cat "$compose_err_file")"
elif command -v python3 &> /dev/null; then
    mount_check=$(python3 - "$compose_json_file" "$user_dirs" <<'PY'
import json, os, sys
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
user_dirs = [d for d in sys.argv[2].split() if d]
service = cfg.get("services", {}).get("tubejelly", {})
targets = set()
for v in service.get("volumes", []):
    targets.add(v.get("target"))
    if v.get("type") != "bind":
        continue
    src = v.get("source")
    if not os.path.isdir(src):
        print(f"ERROR ホスト側ディレクトリがありません: {src}（→ {v.get('target')}）。mkdir -p {src} で作成してください")
        continue
    st = os.stat(src)
    writable = (
        (st.st_uid == 1001 and st.st_mode & 0o200)
        or (st.st_gid == 1001 and st.st_mode & 0o020)
        or st.st_mode & 0o002
    )
    if not writable:
        print(f"WARN {src} はコンテナのユーザー（UID 1001）が書き込めない可能性があります: sudo chown -R 1001:1001 {src}")
for d in user_dirs:
    if d not in targets:
        print(f"ERROR users.json の保存先 {d} が docker-compose.yml の volumes（コンテナ側）にありません")
print("OK")
PY
)
    while IFS= read -r line; do
        case "$line" in
            ERROR*) error "docker-compose.yml: ${line#ERROR }" ;;
            WARN*) warn "docker-compose.yml: ${line#WARN }" ;;
            OK*) ok "docker-compose.yml の volumes を確認しました" ;;
        esac
    done <<< "$mount_check"
fi
rm -f "$compose_json_file" "$compose_err_file"

# --- 結果 ---------------------------------------------------------------------
echo ""
if [ "$errors" -gt 0 ]; then
    echo "❌ ${errors}件のエラーがあります。上の内容を修正してから再実行してください。"
    echo "   手順: doc/setup/GETTING_STARTED.md / 困ったら: doc/TROUBLESHOOTING.md"
    exit 1
fi
[ "$warnings" -gt 0 ] && echo "⚠️  ${warnings}件の警告があります（内容を確認してください）" && echo ""

if $check_only; then
    echo "✅ チェック完了（--check のためビルドは省略しました）"
    exit 0
fi

echo "🐳 Docker イメージをビルドしています..."
if ! "${COMPOSE[@]}" build; then
    echo ""
    echo "❌ ビルドに失敗しました（doc/TROUBLESHOOTING.md を参照）"
    exit 1
fi

echo ""
echo "✅ セットアップ完了！"
echo ""
echo "🚀 起動:       ${COMPOSE[*]} up -d"
echo "📋 ログ確認:   ${COMPOSE[*]} logs -f tubejelly"
echo "🛑 停止:       ${COMPOSE[*]} down"
