#!/usr/bin/env bash
set -euo pipefail

# Quick Nginx health check:
# - service state + config test
# - top 499/5xx URLs from access log
# - slow requests from access log
# - curl probes for main site and Yandex Metrika tag

ACCESS_LOG="${ACCESS_LOG:-/var/log/nginx/access.log}"
ERROR_LOG="${ERROR_LOG:-/var/log/nginx/error.log}"
DOMAIN="${DOMAIN:-https://chibox-game.ru}"
TAG_URL="${TAG_URL:-https://mc.yandex.ru/metrika/tag.js}"
LINES="${LINES:-20000}"
SLOW_MS="${SLOW_MS:-1500}"
TOP_N="${TOP_N:-15}"

print_header() {
  echo
  echo "=================================================="
  echo "$1"
  echo "=================================================="
}

print_header "Nginx service status"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then
    echo "nginx: active"
  else
    echo "nginx: NOT active"
    systemctl status nginx --no-pager -l || true
  fi
else
  echo "systemctl not found, skipping service status check"
fi

print_header "Nginx config test"
if nginx -t; then
  echo "nginx -t: OK"
else
  echo "nginx -t: FAILED"
fi

print_header "HTTP probe (your domain)"
curl -sS -o /dev/null -w "GET / -> code=%{http_code} total=%{time_total}s connect=%{time_connect}s starttransfer=%{time_starttransfer}s\n" "${DOMAIN}" || true
curl -sS -o /dev/null -w "GET / (HEAD) -> code=%{http_code} total=%{time_total}s\n" -I "${DOMAIN}" || true

print_header "HTTP probe (Yandex tag.js)"
curl -sS -o /dev/null -w "GET tag.js -> code=%{http_code} total=%{time_total}s connect=%{time_connect}s starttransfer=%{time_starttransfer}s\n" "${TAG_URL}" || true

if [[ ! -f "${ACCESS_LOG}" ]]; then
  print_header "Access log not found"
  echo "No file: ${ACCESS_LOG}"
  echo "Set ACCESS_LOG env var, for example:"
  echo "ACCESS_LOG=/var/log/nginx/chibox.access.log bash deploy/nginx/check-nginx-health.sh"
  exit 0
fi

print_header "Top statuses (last ${LINES} lines)"
tail -n "${LINES}" "${ACCESS_LOG}" \
  | awk '{
      c[$9]++
    }
    END {
      for (k in c) print c[k], k
    }' \
  | sort -rn \
  | head -n 20

print_header "Top 499 URLs (last ${LINES} lines)"
tail -n "${LINES}" "${ACCESS_LOG}" \
  | awk '$9=="499" {
      key=$7
      c[key]++
    }
    END {
      for (k in c) print c[k], k
    }' \
  | sort -rn \
  | head -n "${TOP_N}"

print_header "Top 5xx URLs (last ${LINES} lines)"
tail -n "${LINES}" "${ACCESS_LOG}" \
  | awk '$9 ~ /^5[0-9][0-9]$/ {
      key=$9 " " $7
      c[key]++
    }
    END {
      for (k in c) print c[k], k
    }' \
  | sort -rn \
  | head -n "${TOP_N}"

print_header "Slow requests >= ${SLOW_MS}ms (requires request_time in log format)"
tail -n "${LINES}" "${ACCESS_LOG}" \
  | awk -v slow_ms="${SLOW_MS}" '
    {
      status=$9
      req=$7
      rt=$(NF)
      if (rt ~ /^[0-9.]+$/) {
        ms=rt*1000
        if (ms >= slow_ms) {
          print ms "ms", status, req
        }
      }
    }' \
  | sort -rn \
  | head -n "${TOP_N}"

if [[ -f "${ERROR_LOG}" ]]; then
  print_header "Recent nginx error.log lines"
  tail -n 80 "${ERROR_LOG}" || true
fi

print_header "Quick interpretation"
echo "- If only Yandex tag has issues but your bundles/API are mostly 2xx/3xx, root cause is likely not tag.js."
echo "- If /assets/*.js or /api/* show many 499/5xx or very high request_time, investigate backend/db/network bottlenecks."
echo "- For periodic incidents run this script every minute via cron and archive outputs."
