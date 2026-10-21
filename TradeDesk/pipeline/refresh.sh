#!/usr/bin/env bash
# refresh.sh — run the full TradeDesk keyless data pipeline in dependency order.
#
# Order matters: fetch-earnings.mjs and build-brief.mjs read the fresh
# insiders.json / congress.json sidecars for signal computation.
#
# Writes into ../public/data/ (override with OUT_DIR).
# Repo layout: Dashboards/TradeDesk/{pipeline,public,src,...}
# Pass --quick through to build-brief.mjs for a faster breakout scan.
set -euo pipefail
cd "$(dirname "$0")"

OUT="${OUT_DIR:-$PWD/../public/data}"
mkdir -p "$OUT" data
export OUT_DIR="$OUT"

echo "=== TradeDesk pipeline refresh → $OUT ==="
echo "--- 1/5 congress ---"
node fetch-congress.mjs
echo "--- 2/6 executive (White House) ---"
node fetch-executive.mjs
echo "--- 3/6 signals (smart-money flow) ---"
node build-signals.mjs
echo "--- 4/6 insiders ---"
node fetch-insiders.mjs
echo "--- 5/6 earnings ---"
node fetch-earnings.mjs
echo "--- 6/6 daily brief ($*) ---"
node build-brief.mjs "$@"
echo "=== refresh complete ==="
ls -la "$OUT"
