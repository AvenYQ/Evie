#!/usr/bin/env bash
# Weft：打包 YaYa 并安装到 /Applications/Tide.app（沿用现有更新所需的包名）
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Tide"
OLD_APP_NAME="Weft"
OUT="$REPO/release-weft"
cd "$REPO"
export PATH="$REPO/node_modules/.bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# 本地包也要能自己更新：electron-builder 只在有 publish 配置时才往包里写 app-update.yml，而 publish 仓库是从这个环境变量读的（CI 里由 GITHUB_REPOSITORY 提供）。
export T3CODE_DESKTOP_UPDATE_REPOSITORY="AvenYQ/Tide"
# 版本号带 nightly 后缀，更新通道才和已安装的 nightly 版一致（否则会报 track mismatch）。
VERSION="$(node -p "require('./apps/desktop/package.json').version")-nightly.$(date -u +%Y%m%d).$(date -u +%s)"

pnpm install --frozen-lockfile
rm -rf "$OUT"
WEFT_PRODUCT_NAME="$APP_NAME" WEFT_DISPLAY_NAME="YaYa" WEFT_MAC_ICON_PNG="weft/assets/yaya-macos-1024.png" node scripts/build-desktop-artifact.ts \
  --platform mac --target zip --arch "$(uname -m | sed 's/x86_64/x64/')" --build-version "$VERSION" --output-dir "$OUT"

# 打 zip 而不是 dir：electron-builder 只在打 zip 时才把 app-update.yml 写进包里，
# 少了它装上去的 App 会认为“没有配置更新源”，左下角的更新按钮永远不可用。
ZIP="$(find "$OUT" -maxdepth 2 -name '*arm64.zip' | head -1)"
[[ -n "$ZIP" ]] || { echo "✗ 没找到打包出的 zip" >&2; exit 1; }
UNPACKED="$OUT/unpacked"
rm -rf "$UNPACKED"
ditto -x -k "$ZIP" "$UNPACKED"
APP="$(find "$UNPACKED" -maxdepth 1 -name "$APP_NAME.app" -type d | head -1)"
[[ -n "$APP" ]] || { echo "✗ zip 里没找到 $APP_NAME.app" >&2; exit 1; }
[[ -f "$APP/Contents/Resources/app-update.yml" ]] || { echo "✗ 包内没有 app-update.yml，装上也更新不了" >&2; exit 1; }

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
