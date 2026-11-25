#!/usr/bin/env bash
# Weft：拉取官方 T3 Code 最新代码，把 weft/main 上的改动重新叠上去，然后打包安装。
#   ./weft/sync.sh            同步 + 打包 + 安装
#   ./weft/sync.sh --no-build 只同步代码
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="weft/main"
APP_NAME="Weft"
cd "$REPO"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ 有未提交的改动，先提交或 stash 再同步。" >&2
  git status --short >&2
  exit 1
fi
git switch -q "$BRANCH"

BEFORE="$(git rev-parse upstream/main)"
git fetch -q upstream main
AFTER="$(git rev-parse upstream/main)"
git branch -q -f main upstream/main
echo "官方：${BEFORE:0:10} → ${AFTER:0:10}（$(git rev-list --count "$BEFORE..$AFTER") 个新提交）"

git tag -f weft/backup-before-sync >/dev/null   # 出问题时可 git reset --hard weft/backup-before-sync
if ! git rebase upstream/main; then
  echo
  echo "✗ 你的改动和官方更新冲突了。冲突文件："
  git diff --name-only --diff-filter=U
  echo "解决后运行 git rebase --continue，再重跑本脚本；放弃则 git rebase --abort。"
  exit 2
fi
echo "✓ 你的 $(git rev-list --count upstream/main..HEAD) 个改动已叠到最新官方代码上"

# 检查上游是否改动了 Weft 替换或深度依赖的关键官方文件，避免语义漂移无声发生。
WATCHED_FILES=(
  apps/web/src/components/Sidebar.motion.ts
  apps/web/src/components/chat/ThreadDetailsUsage.tsx
  apps/web/src/components/chat/ComposerBannerStack.tsx
  apps/web/src/components/chat/UsageLimitRecoveryBanner.tsx
)
DRIFT="$(git diff --name-only "$BEFORE..$AFTER" -- "${WATCHED_FILES[@]}" || true)"
if [[ -n "$DRIFT" ]]; then
  echo
  echo "⚠ 上游更新了以下 Weft 替换/依赖的官方文件，建议检查是否需要同步逻辑："
  printf '  - %s\n' $DRIFT
fi

[[ "${1:-}" == "--no-build" ]] && exit 0
exec "$REPO/weft/build.sh"
