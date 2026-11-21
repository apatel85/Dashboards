# Scoring revamp — backtest final report (all-20190101-20261031-split20241101)

Window 2019-01-01 → 2026-10-31; out-of-sample from 2024-11-01; params `cmo-rev4-wo01`.

## 1. Summary — verdicts

| Module | Verdict | Triggered | In-sample | OOS | OOS with lookup |
|---|---|---|---|---|---|
| A1 | **reject** | 81 | 39 | 42 | 0 |
| A2 | **reject** | 25 | 15 | 10 | 0 |
| A1S | **reject** | 115 | 94 | 21 | 0 |
| A2S | **reject** | 129 | 91 | 38 | 0 |
| A3S | **reject** | 16 | 15 | 1 | 0 |

## 2. Setup-by-setup findings

### A1 — REJECT (6 misses)

- **cases**: MISS — 81 triggered candidates (in-sample 39, OOS 42); needs ≥ 300
- **calibration**: MISS — cannot evaluate: only 0 OOS cases have a bucket lookup (needs ≥ 100)
- **lift**: MISS — cannot evaluate: no bucket has ≥ 100 in-sample cases
- **ranking**: MISS — cannot evaluate: A/A+ 0 OOS cases, C 19 OOS cases (each needs ≥ 100)
- **stability**: MISS — A/A+ above the quarter base rate in 0/8 OOS quarters (needs ≥ 6/8)
- **no-leakage**: MISS — cannot evaluate: A/A+ OOS cases baseline 0, ablated 0 (each needs ≥ 100)

### A2 — REJECT (6 misses)

- **cases**: MISS — 25 triggered candidates (in-sample 15, OOS 10); needs ≥ 300
- **calibration**: MISS — cannot evaluate: only 0 OOS cases have a bucket lookup (needs ≥ 100)
- **lift**: MISS — cannot evaluate: no bucket has ≥ 100 in-sample cases
- **ranking**: MISS — cannot evaluate: A/A+ 0 OOS cases, C 10 OOS cases (each needs ≥ 100)
- **stability**: MISS — A/A+ above the quarter base rate in 0/5 OOS quarters (needs ≥ 6/8)
- **no-leakage**: MISS — cannot evaluate: A/A+ OOS cases baseline 0, ablated 0 (each needs ≥ 100)

### A1S — REJECT (6 misses)

- **cases**: MISS — 115 triggered candidates (in-sample 94, OOS 21); needs ≥ 300
- **calibration**: MISS — cannot evaluate: only 0 OOS cases have a bucket lookup (needs ≥ 100)
- **lift**: MISS — cannot evaluate: no bucket has ≥ 100 in-sample cases
- **ranking**: MISS — cannot evaluate: A/A+ 0 OOS cases, C 20 OOS cases (each needs ≥ 100)
- **stability**: MISS — A/A+ above the quarter base rate in 0/6 OOS quarters (needs ≥ 6/8)
- **no-leakage**: MISS — cannot evaluate: A/A+ OOS cases baseline 0, ablated 0 (each needs ≥ 100)

### A2S — REJECT (6 misses)

- **cases**: MISS — 129 triggered candidates (in-sample 91, OOS 38); needs ≥ 300
- **calibration**: MISS — cannot evaluate: only 0 OOS cases have a bucket lookup (needs ≥ 100)
- **lift**: MISS — cannot evaluate: no bucket has ≥ 100 in-sample cases
- **ranking**: MISS — cannot evaluate: A/A+ 0 OOS cases, C 35 OOS cases (each needs ≥ 100)
- **stability**: MISS — A/A+ above the quarter base rate in 0/7 OOS quarters (needs ≥ 6/8)
- **no-leakage**: MISS — cannot evaluate: A/A+ OOS cases baseline 0, ablated 0 (each needs ≥ 100)

### A3S — REJECT (6 misses)

- **cases**: MISS — 16 triggered candidates (in-sample 15, OOS 1); needs ≥ 300
- **calibration**: MISS — cannot evaluate: only 0 OOS cases have a bucket lookup (needs ≥ 100)
- **lift**: MISS — cannot evaluate: no bucket has ≥ 100 in-sample cases
- **ranking**: MISS — cannot evaluate: A/A+ 0 OOS cases, C 1 OOS cases (each needs ≥ 100)
- **stability**: MISS — A/A+ above the quarter base rate in 0/1 OOS quarters (needs ≥ 6/8)
- **no-leakage**: MISS — cannot evaluate: A/A+ OOS cases baseline 0, ablated 0 (each needs ≥ 100)

## 3. P(5% / 10% / 15%) — in-sample vs out-of-sample

Per-bucket tables are in each module's `prob-tables.json` (window 10 is the main view; windows 3/5/20 included). Pooled OOS calibration is check 2 above.

## 4. Expected move

Expected move per candidate = 5%×P(5–10%) + 10%×P(10–15%) + 15%×P(≥15%), tail beyond 15% counted as 15% (spec §3.1). It is a ranking input, not a price target; it is only computed where all three tier lookups succeed.

## 5. High-probability buckets (≥ 65%)

- A1: none.
- A2: none.
- A1S: none.
- A2S: none.
- A3S: none.

## 6. Ablation results

Catalyst ablated first (spec order): each module was re-scored with the catalyst component zeroed; the no-leakage check (check 6) compares the A/A+ OOS T1 frequency before and after. Growth and options contribute 0 points in the baseline (no SEC facts, no option data), so their ablation is vacuous — recorded in DATA_AUDIT.md, not hidden.

## 7. Data quality

See `DATA_AUDIT.md`: coverage, gaps, survivorship share, hand-checked splits and earnings timestamps, cached files used with row counts, fallback distribution.


Cache: 518 tickers, 1969 trading sessions, 182 earnings dates fetched (21846 rows). Full file list with row counts is in each module's summary.json.

## 8. Verdicts

- **A1: reject**
- **A2: reject**
- **A1S: reject**
- **A2S: reject**
- **A3S: reject**

## 9. Recommendation

Adopt only the modules whose verdict is `adopt`. A `watch` module needs one more check to pass (named in its report) before it can be adopted; a `reject` module is not adopted. No module ships into the nightly flow until its verdict is `adopt` and the staging acceptance script (03) passes — the publish step stays dry-run until then.

## 10. Caveats

- Universe is the CURRENT S&P 500 + Nasdaq-100 constituents projected backwards — historical membership is incomplete (see DATA_AUDIT.md survivorship share); the members-only re-run was not done because every module already rejects on sample size (a subset can only shrink the sample further).
- Market caps are CURRENT (2026) from Yahoo quoteSummary, not point-in-time — A3S large/small bars carry that approximation.
- Earnings surprise comes from the Nasdaq calendar; its `time` field is usually "time-not-supplied" on past dates, so a gap day matches a report on that date OR the prior session.
- Growth (10 pts) and options (5 pts) score 0 for every candidate: no SEC facts (no SEC_CONTACT_EMAIL) and no historical option data. Group (5 pts) is null when the sector is unknown.
- Regime is unknown (null) until SPY has a 200-day SMA (~Oct 2019); candidates before then are regime-excluded, not graded.
- Prices are Yahoo split-adjusted, dividend-unadjusted closes (plan §7.4); split continuity is hand-checked in DATA_AUDIT.md.
- Intraday/option modules (stock_trigger, stock_orb, S1–S4) were NOT run: no free historical minute bars or option chains exist (Alpaca keys absent).
- Tradeable (§4.5) is reported, not applied: under the library's reading (technical stop ≤ 3% of price) every A1/A1S/A2/A2S detection is non-tradeable. Whether "3% loss" means stop distance or position risk needs Ankit's call.
- No candidate scores A or A+ in any module (setup "met" caps A1/A1S/A3S, growth and options are 0, the RS component is long-biased) — the ranking check is unevaluatable by construction in this run.