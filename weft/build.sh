#!/usr/bin/env bash
# Weft：打包 macOS 应用并安装到 /Applications/Weft.app
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Weft"
OUT="$REPO/release-weft"
cd "$REPO"
export PATH="$REPO/node_modules/.bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

pnpm install --frozen-lockfile
rm -rf "$OUT"
WEFT_PRODUCT_NAME="$APP_NAME" node scripts/build-desktop-artifact.ts \
  --platform mac --target dir --arch "$(uname -m | sed 's/x86_64/x64/')" --output-dir "$OUT"

APP="$(find "$OUT" -maxdepth 3 -name "$APP_NAME.app" -type d | head -1)"
[[ -n "$APP" ]] || { echo "✗ 没找到打包出的 $APP_NAME.app" >&2; exit 1; }

if pgrep -xq "$APP_NAME"; then
  echo "! $APP_NAME 正在运行，先退出它再安装。新包在：$APP" >&2
  exit 3
fi
rm -rf "/Applications/$APP_NAME.app"
ditto "$APP" "/Applications/$APP_NAME.app"
xattr -cr "/Applications/$APP_NAME.app"
echo "✓ 已安装 /Applications/$APP_NAME.app（基于官方 $(git rev-parse --short upstream/main)）"
