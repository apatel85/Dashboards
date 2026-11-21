# WO-03 — Backtest harness (the gate)

Tests the Rev 4 scoring model (spec `TradeDesk/STRATEGY_BUILD_SPEC.md`,
§6.4) against real historical data before anything ships. One module at a
time, or all five daily modules with `--module all`.

## What it does

1. **Fetch** real files into `cache/` first (Yahoo daily bars, Wikipedia
   constituents, Yahoo sector/market-cap, Nasdaq earnings calendars for
   gap dates only). Nothing is tested on half-downloaded data: a failed
   fetch stops the run and names the missing file.
2. **Scan** the cached bars with the frozen `pipeline/lib/cmo/` library
   (detectors, score, `tierOutcome`, Wilson intervals). No network, no
   clock while a test runs.
3. **Evaluate** per module against the spec verdict table (cases ≥ 300,
   pooled calibration ±7pp, median lift ≥ 1.3×, A/A+ vs C ranking,
   stability in ≥ 6/8 OOS quarters, no-leakage ablation). Verdict:
   **adopt** (all pass), **watch** (one miss), **reject** (otherwise).
   The 65% "high probability" buckets are reported separately.
4. **Report** into `results/<run_id>/` (`report.md`, `summary.json`,
   `cases.csv`, `prob-tables.json` per module) plus `FINAL_REPORT.md`
   (§12 template) and `DATA_AUDIT.md` (this folder).

## Run it

```sh
# Full run: fetch the daily cache, then grade all five daily modules.
node run.mjs --module all

# One module, with the catalyst ablation (the default) and a dry-run publish.
node run.mjs --module A1 --split 2024-11-01 --publish --dry-run

# Re-run on the existing cache without re-fetching.
node run.mjs --module all --skip-fetch

# Ablate a different component (catalyst is ablated first, per spec order).
node run.mjs --module A1 --ablate rs
```

Defaults: `--from 2019-01-01 --to 2026-10-31 --split 2024-11-01`
(OOS = the last two years). `--windows` / `--tiers` are fixed at
3,5,10,20 and 5/10/15% (params are frozen — see below).

## Params are frozen

`pipeline/lib/cmo/params.json` is frozen at `cmo-rev4-wo01`. The run
computes its sha256 and refuses to start when it differs from
`frozen-params.json`. To change a parameter: revise the spec, change
`params.json`, commit, and update `frozen-params.json` in the same commit.
`--variant <name>` looks up `params.variants[name]`; no variants are
defined yet, so any `--variant` fails naming that (a new idea adds its
thresholds to `params.json`, at most 12 variants per module, per §6.4).

## Data sources

| Source | What | How |
|---|---|---|
| Yahoo chart v8 | Daily bars (split-adjusted, dividend-unadjusted closes, plan §7.4) | `data/fetch-daily.mjs`, browser UA, no crumb |
| Wikipedia | S&P 500 + Nasdaq-100 constituents (current list) | `data/fetch-universe.mjs` |
| Yahoo quoteSummary | Sector / industry / market cap (current, not point-in-time) | `data/fetch-meta.mjs`, crumb session |
| Nasdaq calendar | Earnings per date: actual, forecast, surprise % | `data/fetch-earnings.mjs`, one request per date |
| SEC EDGAR | Company facts (growth / SUE / margin) | `data/fetch-sec.mjs` — **see below** |
| Alpaca | 1-minute bars (ORB / intraday) | `data/fetch-minute.mjs` — **see below** |

## What is unavailable (and what it costs)

- **SEC facts**: `SEC_CONTACT_EMAIL` is not set, so `fetch-sec.mjs`
  refuses loudly per file and the run proceeds with growth = 0 points
  for every candidate (10 pts unplayed). Set a real contact email, run
  `data/fetch-sec.mjs`, then re-run with `--with-sec`.
- **Minute bars**: `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` are not set, so
  `fetch-minute.mjs` refuses loudly per file and `stock_orb` cannot run.
  Opening RVOL is null for every candidate.
- **Historical option chains / IV / gamma**: no free source exists
  (plan §7.3). `S1–S4` and `stock_trigger` cannot run; the options
  component is 0 for every candidate (5 pts unplayed). They are **not**
  faked — the CLI stops with the missing source named.
- **Guidance / news**: no source — catalyst is earnings surprise + gap %
  only.
- **Historical index membership**: the universe is *today's*
  constituents projected backwards. Survivorship bias is quantified in
  `DATA_AUDIT.md`; the headline is re-run on tickers covering ≥ 95% of
  sessions (index members only, plan §7.4).
- **Market cap**: current (2026), not point-in-time — A3S large/small
  classification can mislabel a stock that crossed the $10B line.
- **Earnings timing**: Nasdaq `time` is usually "time-not-supplied" on
  past dates, so a gap day matches a report on that date **or** the prior
  session (BMO vs AMC is not distinguished).
- **Regime**: unknown until SPY has a 200-day SMA (~Oct 2019);
  candidates before then are regime-excluded, not graded.

## Layout

```
run.mjs                  CLI (fetch → prepare → detect → scan → eval → report → publish)
frozen-params.json       frozen params hash + version
data/
  fetch-universe.mjs     Wikipedia constituents → cache/universe.json
  fetch-daily.mjs        Yahoo daily bars → cache/daily/<TICKER>.json
  fetch-meta.mjs         quoteSummary sector/cap → cache/meta/<TICKER>.json
  fetch-earnings.mjs     Nasdaq calendar → cache/earnings/<YYYY-MM-DD>.json
  fetch-sec.mjs          SEC companyfacts (fails loudly without SEC_CONTACT_EMAIL)
  fetch-minute.mjs       Alpaca 1-min bars (fails loudly without Alpaca keys)
  load.mjs               the only way the scan reads data (missing file = loud fail)
  universe.mjs           per-date membership + survivorship stats
engine/
  prepare.mjs            per-ticker series + cross-sectional RS / breadth / regime
  scan.mjs               detect → trigger → score → tier outcomes (pure)
eval/
  tables.mjs             base rates + in-sample prob tables + lookups
  calibrate.mjs          the six checks + verdict + high-prob buckets
  report.mjs             module outputs + FINAL_REPORT.md + publish rows
test/                    node --test
cache/                   real downloaded data (git-ignored, never committed)
results/<run_id>/        reports, summaries, cases, prob tables
```

## Scoring inputs — what the harness can and cannot see

| Component | Source in this harness |
|---|---|
| Setup (30) | `met` for A1/A1S/A3S; A2/A2S `full` iff base ≥ 15 sessions **and** close above the 10-day EMA (the plan's "contraction ≤ 50%" is undefined, so this is the harness's explicit definition) |
| Catalyst (20) | Nasdaq earnings surprise (gap date or prior session) + gap %; guidance/news unavailable |
| Growth (10) | null (no SEC facts) |
| RS (15) | Universe RS percentile + RS-line new high (SPY aligned to the stock's dates) |
| Volume (15) | 50-day RVOL; opening RVOL null |
| Group (5) | Percentile of the stock's sector median RS across sectors; null when the sector is unknown |
| Options (5) | null (no option data) |

Trigger (§8.3): the first session within 5 after detection where the
price trades through the pivot (high ≥ pivot long, low ≤ pivot short);
entry price = the pivot. No trigger in 5 sessions → `never_triggered`
(recorded, excluded from tier stats). Same setup+direction on the same
ticker is suppressed until the earliest of invalidation, the outcome
window closing (entry + 20 sessions), or 30 sessions passing.
Outcomes use `tierOutcome` with basis `extremes` (intraday high/low);
option plays would use `close` (§3.1) but no option module runs yet.
A candidate counts for a window only when that window is complete in
the data (entry + window ≤ last bar).

## Tradeable is reported, not applied

The library's `tradeable` reads the §4.5 3% rule as "the technical stop
must be ≤ 3% of the entry price". Measured on real data (2019–2026,
518 stocks) that vetoes **every** A1, A1S, A2 and A2S detection — the
gap-day range alone is typically 5–12% and a base is 10–25% deep — so
grading tradeable-only would leave 16 candidates (all A3S, which does
not apply the cap) and answer nothing. The backtest therefore grades
every detection (it judges whether the *setup* predicts the move) and
reports the tradeable share per module as a headline finding. Whether
"3% loss" means stop-distance ≤ 3% of price (the library's reading) or
risk ≤ 3% of capital via position sizing (the stop can be 10–20% away;
you size down) is the single biggest open question from the first run,
and needs Ankit's call before any module ships.

## Publish

`--publish` works **dry-run only**. A live publish is refused by the
CLI (the staging acceptance script `03` has not passed). The dry run
uses `pipeline/lib/supabase-admin.mjs` (`createAdminClient({dryRun:
true})`) and prints the row counts it would write to
`cmo_backtest_runs`, `cmo_backtest_cases`, `cmo_validation`,
`cmo_prob_tables` (10-session view; `kind='stock'`). The admin script
sends the service key as `apikey` only (fixed 2026-11-21 — it previously
also sent `Authorization: Bearer`, which fails PGRST301 with the new
`sb_secret_` keys; dry-run is unaffected).

## Tests

```sh
node --test test/*.test.mjs
```

- `tiers.test.mjs` — `tierOutcome` reproduces ten hand-checked cases.
- `tables.test.mjs` — `lookupProbability` fallback ladder (full →
  no-atr → no-adr → merged-grade), Wilson spot checks, table aggregation.
- `ablate.test.mjs` — ablation zeroes exactly one score component.
- `params.test.mjs` — `params.json` matches the frozen hash.
- `scan.test.mjs` — trigger / invalidation search.
- `determinism.test.mjs` — the same command twice gives identical
  output (synthetic fixture cache, no network).
