# Weft：本机打包（weft/build.sh）和 CI 发布（evie-release.yml）共用的版本号规则。
# 两边各算各的时候，本机包取 package.json 的 0.1.12，CI 取官方 tag 的 0.1.13，
# 结果刚装好的本机包永远显示“有更新”。统一成：
#   <最新官方 nightly tag 的主版本>-nightly.<UTC 日期>.<当天 UTC 第几秒>
# 谁后打包谁的版本号大，本机包和 CI 包可以直接比较新旧。

# 用法：weft_nightly_version [tag]；不传 tag 时取本地最新的 v*-nightly.* tag。
weft_nightly_version() {
  local tag="${1:-}"
  [[ -n "$tag" ]] || tag="$(git tag -l 'v*-nightly.*' --sort=-v:refname | head -1)"
  [[ -n "$tag" ]] || { echo "✗ 找不到 v*-nightly.* tag，无法确定版本号（先 git fetch upstream 的 tag）" >&2; return 1; }
  local core="${tag#v}"
  core="${core%%-*}"
  local h m s
  read -r h m s < <(date -u '+%H %M %S')
  # 秒数不带前导 0：semver 的数字段不允许以 0 开头。
  echo "${core}-nightly.$(date -u +%Y%m%d).$((10#$h * 3600 + 10#$m * 60 + 10#$s))"
}
