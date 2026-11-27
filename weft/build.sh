#!/usr/bin/env bash
# Weft：打包 Evie 并安装到 /Applications/Evie.app（带 AvenYQ/Evie 自动更新源）
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Evie"
OLD_APP_NAMES=("YaYa" "KiKi" "Tide" "Weft")
OUT="$REPO/release-weft"
cd "$REPO"
export PATH="$REPO/node_modules/.bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# 本地包也要能自己更新：electron-builder 只在有 publish 配置时才往包里写 app-update.yml，而 publish 仓库是从这个环境变量读的（CI 里由 GITHUB_REPOSITORY 提供）。
export T3CODE_DESKTOP_UPDATE_REPOSITORY="AvenYQ/Evie"
source "$REPO/weft/connect-env.sh"
weft_load_connect_env "$REPO"
# 版本号带 nightly 后缀，更新通道才和已安装的 nightly 版一致（否则会报 track mismatch）；规则见 weft/version.sh。
source "$REPO/weft/version.sh"
# 先拉最新的 tag，版本号的主版本才和 CI 发布的一致；离线时用本地已有的 tag。
git fetch -q --tags origin 2>/dev/null || true
git fetch -q --no-tags upstream 'refs/tags/v*-nightly.*:refs/tags/v*-nightly.*' 2>/dev/null || true
VERSION="$(weft_nightly_version)"

pnpm install --frozen-lockfile
rm -rf "$OUT"
WEFT_PRODUCT_NAME="$APP_NAME" WEFT_DISPLAY_NAME="$APP_NAME" WEFT_MAC_ICON_PNG="weft/assets/evie-macos-1024.png" WEFT_MAC_ICON_COMPOSER="weft/assets/Evie.icon" node scripts/build-desktop-artifact.ts \
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
# 新格式图标（Assets.car + CFBundleIconName）缺了，macOS 会把扁平图自动玻璃化，边缘出白点。
[[ -f "$APP/Contents/Resources/Assets.car" ]] && /usr/libexec/PlistBuddy -c "Print :CFBundleIconName" "$APP/Contents/Info.plist" >/dev/null \
  || { echo "✗ 包内没有 Icon Composer 图标（Assets.car / CFBundleIconName）" >&2; exit 1; }
weft_verify_connect_in_app "$APP"

# ps, not pgrep: pgrep can miss the running app from sandboxed shells.
# grep without -q reads all of ps's output, so pipefail never sees a SIGPIPE from ps.
for name in "$APP_NAME" "${OLD_APP_NAMES[@]}"; do
  if ps -axo comm= | grep -x "/Applications/$name.app/Contents/MacOS/$name" >/dev/null; then
    echo "! $name 正在运行，先退出它再安装。新包在：$APP" >&2
    exit 3
  fi
done
rm -rf "/Applications/$APP_NAME.app"
ditto "$APP" "/Applications/$APP_NAME.app"
xattr -cr "/Applications/$APP_NAME.app"
touch "/Applications/$APP_NAME.app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/$APP_NAME.app" 2>/dev/null || true
# Clean up previous bundle names from earlier iterations (Weft / Tide / KiKi / YaYa).
for old in "${OLD_APP_NAMES[@]}"; do
  rm -rf "/Applications/$old.app"
done
echo "✓ 已安装 /Applications/$APP_NAME.app（基于官方 $(git rev-parse --short upstream/main 2>/dev/null || git rev-parse --short HEAD)）"
