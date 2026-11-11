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
# Extra gamma/quote coverage beyond the top signal names (user watchlist).
export GEX_EXTRA_TICKERS="${GEX_EXTRA_TICKERS:-MU,SNDK}"

echo "=== TradeDesk pipeline refresh → $OUT ==="
echo "--- 1/16 congress ---"
node fetch-congress.mjs
echo "--- 2/16 executive (White House) ---"
node fetch-executive.mjs
echo "--- 3/16 signals (smart-money flow) ---"
node build-signals.mjs
echo "--- 4/16 gamma exposure (non-fatal: keeps previous gex.json on failure) ---"
node build-gex.mjs || echo "[pipeline] WARNING: GEX build failed — keeping previous gex.json"
echo "--- 5/16 lotto scanner 0DTE/1DTE top-25 (non-fatal) ---"
node build-lotto.mjs || echo "[pipeline] WARNING: lotto scan failed — keeping previous lotto.json"
echo "--- 6/16 insiders ---"
node fetch-insiders.mjs
echo "--- 7/16 earnings ---"
node fetch-earnings.mjs
echo "--- 8/16 quotes snapshot (non-fatal) ---"
node build-quotes.mjs || echo "[pipeline] WARNING: quotes snapshot failed"
echo "--- 9/16 daily brief ($*) ---"
node build-brief.mjs "$@"
echo "--- 10/16 recommendation performance tracker (non-fatal) ---"
node build-performance.mjs || echo "[pipeline] WARNING: performance build failed — keeping previous performance.json"
echo "--- 11/16 daily prediction snapshot: record today's breakout + lotto suggestions (non-fatal) ---"
node snapshot-predictions.mjs || echo "[pipeline] WARNING: prediction snapshot failed — history unchanged"
echo "--- 12/16 daily prediction grading: score past suggestions vs actuals (non-fatal) ---"
node grade-predictions.mjs || echo "[pipeline] WARNING: prediction grading failed — keeping previous prediction-performance.json"
echo "--- 13/16 attribution analyzer: what worked & why (non-fatal) ---"
node analyze-attribution.mjs || echo "[pipeline] WARNING: attribution analysis failed"
echo "--- 14/16 fundamentals: name/sector/ratios for every ticker (non-fatal) ---"
node build-fundamentals.mjs || echo "[pipeline] WARNING: fundamentals build failed — keeping previous fundamentals.json"
echo "--- 15/16 news headlines for brief tickers (non-fatal) ---"
node build-news.mjs || echo "[pipeline] WARNING: news build failed — keeping previous news.json"
echo "--- 16/16 new developments: latest Congress / White House disclosures + news to watch (non-fatal) ---"
node build-alerts.mjs || echo "[pipeline] WARNING: alerts build failed — keeping previous daily-alerts.json"
echo "=== refresh complete ==="
ls -la "$OUT"
