#!/bin/bash
# Chrome拡張機能を ZIP にまとめる（release/tubejelly-extension-<version>.zip）
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./extension/manifest.json').version")
mkdir -p release
output="release/tubejelly-extension-${version}.zip"

rm -f "$output"
(cd extension && zip -qr -X "../${output}" . -x '.*' -x '*/.*')

echo "✅ ${output} を作成しました"
