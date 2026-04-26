#!/usr/bin/env bash
set -euo pipefail

# Safe frontend deploy:
# - sync fresh build to a temp directory
# - atomically swap dist directories
# - verify public URLs with curl
# - test and reload nginx
#
# Example:
# SOURCE_DIST=/var/www/chibox/frontend-new/dist \
# TARGET_DIST=/var/www/chibox/frontend/dist \
# SITE_URL=https://chibox-game.ru \
# bash deploy/nginx/deploy-frontend-safe.sh

SOURCE_DIST="${SOURCE_DIST:-/var/www/chibox/frontend-new/dist}"
TARGET_DIST="${TARGET_DIST:-/var/www/chibox/frontend/dist}"
SITE_URL="${SITE_URL:-https://chibox-game.ru}"
API_CHECK_URL="${API_CHECK_URL:-$SITE_URL/api/v1/cases}"
LOCK_FILE="${LOCK_FILE:-/tmp/chibox-frontend-deploy.lock}"

print_step() {
  echo
  echo "==> $1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd rsync
require_cmd curl
require_cmd nginx
require_cmd grep
require_cmd sed
require_cmd mktemp
require_cmd find

if [[ ! -d "$SOURCE_DIST" ]]; then
  echo "SOURCE_DIST not found: $SOURCE_DIST" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_DIST/index.html" ]]; then
  echo "SOURCE_DIST has no index.html: $SOURCE_DIST/index.html" >&2
  exit 1
fi

TARGET_PARENT="$(dirname "$TARGET_DIST")"
if [[ ! -d "$TARGET_PARENT" ]]; then
  echo "TARGET parent directory not found: $TARGET_PARENT" >&2
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy is running (lock: $LOCK_FILE)." >&2
  exit 1
fi

TMP_DIST="$(mktemp -d "$TARGET_PARENT/.dist-tmp-XXXXXX")"
BACKUP_DIST="$TARGET_PARENT/dist.backup.$(date +%Y%m%d-%H%M%S)"
ROLLBACK_READY=0

cleanup() {
  if [[ -d "$TMP_DIST" ]]; then
    rm -rf "$TMP_DIST" || true
  fi
}
trap cleanup EXIT

print_step "Sync build to temp directory"
rsync -a --delete "$SOURCE_DIST"/ "$TMP_DIST"/

print_step "Validate referenced core asset files"
INDEX_JS_PATH="$(grep -oE '/assets/js/index-[^"]+\.js' "$TMP_DIST/index.html" | head -n1 || true)"
if [[ -z "$INDEX_JS_PATH" ]]; then
  echo "Cannot find index-*.js reference in index.html" >&2
  exit 1
fi

INDEX_JS_FILE="$TMP_DIST${INDEX_JS_PATH}"
if [[ ! -f "$INDEX_JS_FILE" ]]; then
  echo "Referenced JS file not found: $INDEX_JS_FILE" >&2
  exit 1
fi

print_step "Atomic swap dist directory"
if [[ -d "$TARGET_DIST" ]]; then
  mv "$TARGET_DIST" "$BACKUP_DIST"
  ROLLBACK_READY=1
fi
mv "$TMP_DIST" "$TARGET_DIST"

check_url() {
  local url="$1"
  local label="$2"
  local out
  out="$(curl -fsS -o /dev/null -w "code=%{http_code} total=%{time_total}s" "$url" || true)"
  echo "$label -> $out"
  [[ "$out" == code=2* || "$out" == code=3* ]]
}

rollback() {
  echo "Deploy verification failed, rolling back..."
  rm -rf "$TARGET_DIST" || true
  if [[ -d "$BACKUP_DIST" ]]; then
    mv "$BACKUP_DIST" "$TARGET_DIST"
  fi
}

print_step "Verify public URLs"
if ! check_url "$SITE_URL/" "GET /"; then
  rollback
  exit 1
fi

if ! check_url "$SITE_URL/manifest.json" "GET /manifest.json"; then
  rollback
  exit 1
fi

if ! check_url "$SITE_URL$INDEX_JS_PATH" "GET ${INDEX_JS_PATH}"; then
  rollback
  exit 1
fi

if ! check_url "$API_CHECK_URL" "GET API check"; then
  rollback
  exit 1
fi

print_step "Validate and reload nginx"
if ! nginx -t; then
  rollback
  exit 1
fi
systemctl reload nginx

print_step "Cleanup old backups (keep last 3)"
find "$TARGET_PARENT" -maxdepth 1 -type d -name 'dist.backup.*' | sort -r | tail -n +4 | xargs -r rm -rf

if [[ $ROLLBACK_READY -eq 1 && -d "$BACKUP_DIST" ]]; then
  rm -rf "$BACKUP_DIST"
fi

echo
echo "Frontend deploy completed successfully."
