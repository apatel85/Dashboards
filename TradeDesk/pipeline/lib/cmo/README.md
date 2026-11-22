# pipeline/lib/cmo/ — CMO shared library (WO-01)

Pure JavaScript, spec Rev 4 §5. The nightly pipeline, the backtest
harness (WO-03) and the browser (WO-09) import the same functions, so
the score that was tested is the score that is shown.

## Purity contract

Nothing in this directory imports `fs` or `http` or reads the clock.
All bars, filings, chains and `asOf` dates are passed in as arguments.
`params.json` is loaded by the module system (JSON import attribute),
not by file reads in logic. `util.mjs` re-implements `clamp`/`mean`
locally on purpose: `pipeline/lib/util.mjs` imports `fs`, so the
library cannot import it.

## Bar shape

`{ ts, o, h, l, c, v }` — ts in unix seconds. This is the pipeline's
existing convention (Yahoo chart output; every backtest script uses
it), chosen over long keys so WO-03 needs no adapter.

## Files

| File | What it holds |
|---|---|
| `params.json` | Every threshold (frozen, `params_version: cmo-rev4-wo01`). Each value's source is in the `sources` map (spec section or SOURCES.md §8 decision). |
| `params.mjs` | Loads params.json; exports PARAMS / PARAMS_VERSION. Functions take an optional `params` argument defaulting to PARAMS (variants without editing the frozen file). |
| `indicators.mjs` | sma, ema, atr, adrPct, rvol, rsRaw, trendTemplate, priorMove, contraction, gapInfo, closeLocation, avwap, rsLineNewHigh |
| `regime.mjs` | regimeState, regimeAllows (plan §4.1; longs Green/Yellow, shorts Red/Yellow) |
| `fundamentals.mjs` | epsSurprise, sue, growthYoY, acceleration, marginTrend (all point-in-time via `asOf`) |
| `setups.mjs` | detectA1, detectA2, detectA1S, detectA2S, detectA3S, positionSizing |
| `score.mjs` | tradeScore, readinessScore, gradeFor |
| `rank.mjs` | percentileRank |
| `tiers.mjs` | tierOutcome, bucketKey, lookupProbability, wilsonInterval, adrBand, atrBand |
| `orb.mjs` | openingRange, orbSignal, openingRvol (Module B) |
| `noiseBand.mjs` | noiseValue, noiseBands, noiseSignal (Module C — CHALLENGER, not core; §5 names no file for it, WO-01 adds this one) |
| `options.mjs` | normCDF, bsPrice, bsDelta, bsGamma, expectedMove, chooseContract |
| `dte-score.mjs` | dteScore (spec §7.5) |
| `index.mjs` | Re-exports everything. |

## What WO-01 does NOT build

- H1 (Connors RSI-2) and H2 (0DTE iron condor): challengers in plan
  §6.4, not in the spec §5 file table and not in the WO-01 task list.
  They can be added as challenger detectors later.
- The live engine (`src/lib/cmo-live.ts`, WO-09), the nightly builds
  (WO-04), the backtest harness (WO-03) and the Supabase schema (WO-02).
- Any Rev 5 spec change: the §8 decisions are encoded in params.json
  and the detectors; Rev 5 (2026-11-22, Ankit) re-reads the §4.5 3%
  rule — see "Position sizing" below.

## Judgment calls (spec/plan under-specified — see the code comments)

1. `adrPct` = mean of (high−low)/close × 100. No pipeline precedent.
2. `contraction` base start = the session of the highest high in the
   last 40 sessions; depth measured from there.
3. A3S "up X% in 5 sessions" = close-to-close; pivot = signal day's
   low (daily proxy for the opening-range low); large/small split at
   $10B market cap; unknown cap uses the stricter 300%+ bar.
4. A2-S bear flag: starts at the lowest low of the last 40 sessions,
   10–40 sessions, second-half range narrower than the first half,
   10/20-day EMA falling over 5 sessions.
5. Catalyst scoring keeps the plan's "gap ≥ 8%" full-mark row; the §8
   A1-gap decision (10%) applies to the A1 detector, not this row.
6. Readiness and dteScore partial-credit bands (only the full-mark
   lines are in the plan/spec) — see the file headers.
7. `chooseContract` returns `{ contract, reason }` — null alone cannot
   carry the §7.4 plain reason.
8. `tierOutcome` worst-against is measured up to the session where
   the highest reached tier was first hit (window end if none reached).
9. `tradeScore` takes `setupQuality` as an input label; the plan's
   "full" row ("contraction ≤ 50%") is undefined, so WO-04 must
   define 'full' explicitly.
10. `tierOutcome` gains an optional 7th `opts` argument
    (`{ basis: 'extremes' | 'close' }`) — the spec signature has no
    close-based switch, but §3.1 judges option plays on the close.

## Position sizing — the 3% rule (Rev 5, 2026-11-22)

Ankit's decision (2026-11-22): **the 3% is the max LOSS per trade as a
share of capital, enforced by position sizing** — not a cap on the
technical stop distance. It supersedes the stop-distance cap the WO-01
detectors applied (a setup whose technical stop was more than 3% away
was rejected as not tradeable) and the plan §4.5 lines "the 3% is never
widened" and "reject any stock trade whose technical stop is further
than 3% from entry". The technical stop stays at `invalidLevel`
however far away it is. The plan gives no sizing-down formula — the
formula below is the implementation choice, built from the plan's own
numbers (25% default size, 20% single-position max, 3% loss):

```
positionPct = min(risk.positionPct, risk.maxSinglePct, 100 * risk.lossPct / stopDist)
riskPct     = positionPct * stopDist / 100   (percent of capital lost if the stop is hit)
tierR       = tierPct / stopDist             (R-multiple of a 5/10/15% tier move)
```

All percents are in percent units (20 = 20% of capital). `riskPct` is
≤ 3% by construction. `sizeBinding` names the term that set the size:
`'single-max'` when the 20% single-position cap binds (every stop
≤ 15% away), `'risk'` when the 3% capital-risk cap binds (wider stops).

Every detection carries `stopDist`, `positionPct`, `riskPct`,
`tierR1/2/3`, `sizeBinding` (nulls when no valid size exists, i.e.
stopDist null / non-finite / ≤ 0). `tradeable` now means "a valid
position size exists" (plus the $10 minimum short price for A1S/A2S/
A3S). Worked example (AES A1 2025-07-09, the hand-checked case): stop
6.3% away → position 20.0% of capital (single-max binds), risk 1.26%
of capital at the stop, tiers pay 0.79R / 1.59R / 2.38R.

Portfolio-level caps (`maxTotalOpenRiskPct` 5%, `maxPositions` 4,
`maxPerGroup` 2) are NOT enforced here — a detector sizes one trade;
the nightly build (WO-04) / live engine (WO-09) enforces the
portfolio caps. Whole-share rounding is likewise not modelled here.

## Reuse notes (WO-01 reuse check)

- `sma` / `atr` match `backtest-scoring-v2.mjs`: SMA is the
  sliding-window mean; ATR is the SIMPLE mean of true range (not
  Wilder smoothing). `rvol` matches its `volAvg` (prior sessions
  only, today excluded). `closeLocation` matches its `anatomy().closePos`.
- `bsGamma` is identical in `build-lotto.mjs` and `build-gex.mjs` —
  moved here unchanged. `bsDelta` is from `build-lotto.mjs` only,
  moved unchanged. `bsPrice` is new (neither file has it) and uses
  the same normCDF.
- `epsSurprise` matches `pipeline/lib/scoring.mjs` `buildStreak`
  (fraction here, percent there — the library uses fractions).
- `chooseContract` mid = (bid+ask)/2 else lastPrice, same as
  `scoring.mjs` `contractMid`.
- `build-lotto.mjs` expiry bug (WO-00 §7 item 9: ET formatting shifts
  expiries one day early) is NOT in this library — nothing here
  formats expiry timestamps — but WO-03 must not trust `lotto.json`
  expiry labels until it is fixed.

## Tests

`node --test test/` from this directory. Indicator tests use
hand-computed fixtures with the arithmetic shown in comments.
Detector tests use real historical bars in `test/fixtures/`
(ticker, date range and why each example qualifies are in each
fixture file and in `test/fixtures/README.md`).
