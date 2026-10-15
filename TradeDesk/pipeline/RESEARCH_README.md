# TradeDesk Research Agent — `research-agent.mjs`

A tradingagents-style multi-agent stock research flow, ported to run as a
scheduled GitHub Actions job on a **free Gemini key** with **keyless data**.
No LangGraph, no LangChain, no Python — one sequential Node 20 script.

Full architecture reference: `../tradingagents-study.md`.

## Flow (10 Gemini calls per ticker)

```
prefetch (code, deterministic)
   │  Yahoo 1y bars → SMA50/200, RSI14, MACD, Bollinger %B, ATR14,
   │  52w high/low, volume ratios, RS vs SPY, Weinstein stage,
   │  Minervini trend-template check
   │  SEC companyfacts → Piotroski, Altman Z, earnings quality, health,
   │  revenue YoY, net margin (frame-aware: quarterly vs YTD units)
   │  Yahoo headlines (8) · SEC Form-4 P-clusters · CongressInvests buys ·
   │  Yahoo options unusual-volume flag
   ▼
4 analysts (quick tier, 1 call each, data injected as JSON blocks)
   market_analyst · fundamentals_analyst · news_analyst · sentiment_analyst
   ▼
bull_researcher → bear_researcher (1 round each, alternating)
   ▼
research_manager (DEEP tier judge): 5-tier rating + playbook §12
   score_breakdown[] + quality gate. Anti-fence-sitting instruction.
   ▼
trader (quick): action + ABSOLUTE entry/stop prices + invalidation
   ▼
risk_review (quick, 1 condensed round): top-3 risks + thesis-killer
   ▼
portfolio_manager (DEEP tier final judge): rating + thesis + price target
   ▼
research.json (atomic write, contract-validated in CI)
```

## Prompt design notes (from the tradingagents study)

1. **Verified-data grounding.** Every analyst prompt injects a `## VERIFIED DATA —
   SOURCE OF TRUTH` block with the instruction: flag conflicts, never silently
   reconcile; no historical claims without concrete dates/prices from the block.
2. **Pre-fetch, never tool-call.** The model reports on injected data. This is
   what makes the flow deterministic, cheap, and LangGraph-free.
3. **Anti-fence-sitting judge** (both judges): conflict alone is not a reason to
   Hold; commit to the stronger side; Hold only when evidence is balanced or
   too thin. Copied near-verbatim from upstream.
4. **Absolute price levels** (trader): entry/stop in USD, never percentages.
   Levels outside ±50% of the last close are nulled with a loud log.
5. **Defensive coercion**: `"N/A"`, `"15%"`, `"$1,234"` → null/number. One bad
   field nulls out; a failed analyst degrades to a labeled fallback; a failed
   judge skips the ticker loudly rather than fabricating a score.

## Ticker selection

Up to `--max-tickers` (default 12): top `daily-brief.json` breakout candidates
by score, then `earnings.json` names reporting within the next 7 days, deduped.

## Cost / rate math

- 10 calls/ticker × 12 tickers = **120 calls/run**, 2×/week (Sun+Wed ~11pm ET).
- Pacing: 6s between calls (~10 req/min) → ~12 min of LLM time per full run,
  plus ~10 min of prefetch. Well inside free-tier RPM; on 429 the script backs
  off 60s once, then logs and continues with remaining tickers.
- Model aliases resolve at startup from the API's model list
  (`--verify-models` prints the resolution); per-call 404 falls back to the
  next alias. Quick tier prefers `gemini-2.0-flash-lite`, deep tier prefers
  `gemini-2.0-flash`.

## Running locally

```bash
cd TradeDesk/pipeline
# Needs GEMINI_API_KEY in env (GitHub: repo secret). Without it, exits(2).
GEMINI_API_KEY=xxx SEC_CONTACT_EMAIL=you@example.com \
  node research-agent.mjs --data-dir ../public/data --ticker AAPL

# No-key prefetch test (validates selection + all data math, no LLM calls):
node research-agent.mjs --ticker AAPL --data-dir ./data --prefetch-only

# Full watchlist (default 12):
GEMINI_API_KEY=xxx SEC_CONTACT_EMAIL=you@example.com \
  node research-agent.mjs --data-dir ../public/data --max-tickers 12

# Check which model aliases the key can actually use:
GEMINI_API_KEY=xxx node research-agent.mjs --verify-models
```

## Known limits (stated, not hidden)

- **Sentiment is headlines-only.** No keyless social-sentiment source exists
  (StockTwits API dead; Reddit/GDELT unusable without keys). The sentiment
  analyst says this in its own output.
- **12 tickers/run** keeps the free-tier RPM safe; raise `--max-tickers`
  only if the 429 backoff never fires.
- **Inputs are ~15-min delayed** (Yahoo) and congress data lags up to 45 days
  by law — the Research tab is a swing-research feed, never an intraday signal.
- **`first_time_buyer`** in insider clusters is always false: a 14-day filing
  window cannot establish it, and it is not faked.
- **Earnings `revenue_result`** is null where no keyless historical revenue
  estimates exist (per the data contract).
- Nothing in this output is backtested. Research and education only —
  not financial advice.
