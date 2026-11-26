#!/usr/bin/env bash
# Weft: load public T3 Connect identifiers from .env.example (same values official release builds bake in)
# and fail fast if any required key is missing or absent from the packaged app.asar.

weft_load_connect_env() {
  local repo_root="${1:?repo_root required}"
  local example="$repo_root/.env.example"
  if [[ ! -f "$example" ]]; then
    echo "✗ 缺少 $example，无法加载 T3 Connect 公共配置" >&2
    return 1
  fi
  local key cur val
  for key in \
    T3CODE_CLERK_PUBLISHABLE_KEY \
    T3CODE_CLERK_JWT_TEMPLATE \
    T3CODE_CLERK_CLI_OAUTH_CLIENT_ID \
    T3CODE_RELAY_URL; do
    eval "cur=\${${key}:-}"
    if [[ -z "$cur" ]]; then
      val="$(sed -n "s|^${key}=||p" "$example" | head -1)"
      if [[ -z "$val" ]]; then
        echo "✗ $example 中缺少 $key" >&2
        return 1
      fi
      export "$key=$val"
    fi
  done
}

weft_verify_connect_in_app() {
  local app_path="${1:?app_path required}"
  local asar="$app_path/Contents/Resources/app.asar"
  if [[ ! -f "$asar" ]]; then
    echo "✗ 缺少 $asar" >&2
    return 1
  fi
  python3 - "$asar" \
    "${T3CODE_RELAY_URL:?T3CODE_RELAY_URL not set}" \
    "${T3CODE_CLERK_PUBLISHABLE_KEY:?T3CODE_CLERK_PUBLISHABLE_KEY not set}" \
    "${T3CODE_CLERK_JWT_TEMPLATE:?T3CODE_CLERK_JWT_TEMPLATE not set}" \
    "${T3CODE_CLERK_CLI_OAUTH_CLIENT_ID:?T3CODE_CLERK_CLI_OAUTH_CLIENT_ID not set}" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
missing = [v for v in sys.argv[2:] if v.encode("utf-8") not in data]
if missing:
    print(f"✗ 打包产物缺少 T3 Connect 公共配置: {missing}", file=sys.stderr)
    sys.exit(1)
print("✓ app.asar 已包含完整 T3 Connect 公共配置")
PY
}
