# Backtest — A1 (A1-20190101-20261031-split20241101)

**Verdict: REJECT** — 6 of 6 checks missed.

Triggered candidates: 81 (in-sample 39, OOS 42); 0 OOS cases have a bucket lookup.

## Checks (window 10, tier 1 unless stated)

- **cases**: MISS — 81 triggered candidates (in-sample 39, OOS 42); needs ≥ 300
- **calibration**: MISS — cannot evaluate: only 0 OOS cases have a bucket lookup (needs ≥ 100)
- **lift**: MISS — cannot evaluate: no bucket has ≥ 100 in-sample cases
- **ranking**: MISS — cannot evaluate: A/A+ 0 OOS cases, C 19 OOS cases (each needs ≥ 100)
- **stability**: MISS — A/A+ above the quarter base rate in 0/8 OOS quarters (needs ≥ 6/8)
- **no-leakage**: MISS — cannot evaluate: A/A+ OOS cases baseline 0, ablated 0 (each needs ≥ 100)

## High-probability buckets (in-sample P ≥ 65%, CI low ≥ 50%, lift ≥ 1.3×)

None.

## Fallback distribution (OOS lookups)

`{"full":0,"no-atr":0,"no-adr":0,"merged-grade":0,"none":40}` — full = exact bucket (setup|direction|grade|ADR|ATR); no-atr / no-adr drop one band; merged-grade pools A/A+; none = no level reached 100 in-sample cases.

## Data

Cache files and row counts are in summary.json. SEC facts: SEC facts skipped: SEC_CONTACT_EMAIL is not set (growth = 0 points; see DATA_AUDIT.md). Minute data: minute data unavailable: ALPACA_KEY_ID / ALPACA_SECRET_KEY not set (intraday modules not run).