#!/usr/bin/env bash
# Weft：打包 YaYa 并安装到 /Applications/Tide.app（沿用现有更新所需的包名）
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Tide"
OLD_APP_NAME="Weft"
OUT="$REPO/release-weft"
cd "$REPO"
export PATH="$REPO/node_modules/.bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

pnpm install --frozen-lockfile
rm -rf "$OUT"
WEFT_PRODUCT_NAME="$APP_NAME" WEFT_DISPLAY_NAME="YaYa" WEFT_MAC_ICON_PNG="weft/assets/yaya-macos-1024.png" node scripts/build-desktop-artifact.ts \
  --platform mac --target dir --arch "$(uname -m | sed 's/x86_64/x64/')" --output-dir "$OUT"

APP="$(find "$OUT" -maxdepth 3 -name "$APP_NAME.app" -type d | head -1)"
[[ -n "$APP" ]] || { echo "✗ 没找到打包出的 $APP_NAME.app" >&2; exit 1; }

# ps, not pgrep: pgrep can miss the running app from sandboxed shells.
# grep without -q reads all of ps's output, so pipefail never sees a SIGPIPE from ps.
for name in "$APP_NAME" "$OLD_APP_NAME"; do
  if ps -axo comm= | grep -x "/Applications/$name.app/Contents/MacOS/$name" >/dev/null; then
    echo "! $name 正在运行，先退出它再安装。新包在：$APP" >&2
    exit 3
  fi
done
rm -rf "/Applications/$APP_NAME.app"
ditto "$APP" "/Applications/$APP_NAME.app"
xattr -cr "/Applications/$APP_NAME.app"
# The app was called Weft before; the old bundle is a stale copy of the same build.
rm -rf "/Applications/$OLD_APP_NAME.app"
echo "✓ 已安装 /Applications/$APP_NAME.app（基于官方 $(git rev-parse --short upstream/main)）"
