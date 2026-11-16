# TradeDesk — Scoring Revamp Build Spec

**Status:** SPEC ONLY. Nothing in this file has been built or run.
**Revision:** 2 (2026-11-16). Revision 1 was built around a 3% stop / 15% target per trade. Ankit has
set that aside. The goal is now **win probability and expected size of move**, not profit and loss.
**Companion to:** `STRATEGY_PLAN.md` (research, debate, setup rules, data sources). Where the two files
disagree, this file wins.
**Audience:** any AI agent picking this up cold.

What gets built:
1. A new **breakout-candidate mechanism**: finds candidates, and for each one states how likely it is to
   move 5%, 10% and 15%.
2. A new **0DTE / 1DTE option play engine** on the same footing: how likely is the move.
3. A **market reference strip** always on screen: SPY, QQQ, ES, NQ, VIX, 10-year yield.
4. A **backtest harness** that produces those probabilities from history and can test any later idea.
5. All new data in **Supabase**.

Nothing is shown as "high probability" unless the backtest earned it (standing decision:
backtest-before-adopt).

---

## 1. Read first, in this order

1. `/AGENTS.md` → `TradeDesk/AGENTLOG.md` (Decisions block + newest entries) → `TradeDesk/DATA_CONTRACTS.md`.
2. `TradeDesk/STRATEGY_PLAN.md` §2 (who was studied), §4.1–4.4 (regime, universe, technical and
   fundamental inputs), §5 (score), §6 (setup rules), §7 (data).
   **Ignore in the plan:** §4.5 sizing and stops, the exit rules inside §6, the challengers in §6.4, and
   the gates in §8.6. They belong to the profit-and-loss framing and are replaced here.
3. This file.

Rules that bind every work order:
- Public repo: no keys, tokens or personal data in any file. Keys live in GitHub secrets or Supabase.
- Pipelines keep the last good data on failure and write `null`, never filler, for anything not computed.
- UI uses Mock B tokens only, and every UI change runs the verification gate recorded in `AGENTLOG.md`
  (build, token diff, renders at 1280 and 390, number proof against the data).
- Each work order ends with an `AGENTLOG.md` entry stating exactly what was and was not verified.
- `TradeDeskV2/` reads TradeDesk's data and must keep working: existing JSON files keep their shape.

---

## 2. What exists today (verified by reading the code on 2026-11-16)

| Piece | Where | How it works now | What this spec changes |
|---|---|---|---|
| Breakout score | `pipeline/build-brief.mjs` (scan loop, ~lines 230–285) | 0–100 = nearness to 52-week high (up to 40) + 3-month return vs SPY (up to 30) + 5-day vs 50-day volume (up to 30). Kept if ≥ 40; top 15 shown | Replaced. Three inputs, no setup detection, no catalyst, no fundamentals, long only, and no statement of how likely or how big the move is |
| Trigger | same | The 52-week high | Replaced by the setup's own pivot |
| Breakout grading | `pipeline/grade-predictions.mjs` → `gradeBreakout` | "Trigger hit" = a day's high touched the trigger within 10 days | Replaced by "did it move 5 / 10 / 15%" |
| 0DTE/1DTE "lotto" score | `pipeline/build-lotto.mjs` | Additive points for volume ÷ open interest, expected move, gap, cheap IV, ignition, gamma, Friday pin. Runs once, hours before the open | Kept until the new engine has a verdict, then demoted (§7.6) |
| Lotto validation | `public/data/lotto-validation.json` | Marks setups S1 and S2 "validated" | **No script in the repo generates this file**, and its methodology line reads "S&P 500 (0 tickers)". Not reproducible; re-tested in WO-03 |
| Schedule | `/.github/workflows/tradedesk-pipeline.yml` | One keyless run on weekdays at 05:00 UTC | Stays. A publish-to-Supabase step is added |
| Live prices | `src/lib/useSchwabLive.ts`, `schwab.ts`, `schwabDeepDive.ts`, `premarketRange.ts` | Browser polls a Schwab proxy every 60 s for signed-in users; the proxy also serves candles and option chains | Reused for live triggers and the reference strip |
| Supabase | `src/lib/supabase`, `supabase/tradedesk-invites-table.sql` | Login and invites only | Becomes the home of all new data |
| Dealer gamma | `pipeline/build-gex.mjs` → `gex.json` | Gamma state and levels for ^SPX, QQQ and signal names | Reused as an input |
| Fundamentals helpers | `pipeline/lib/scoring.mjs`, `lib/sec.mjs` | Health score, Piotroski, Altman Z, EPS streak | Reused; growth and surprise functions added |

Two workflow folders exist (`TradeDesk/WORKFLOW/` and `/.github/workflows/`) and their pipeline files
differ. The live one is `/.github/workflows/`. WO-00 records which is authoritative.

---

## 3. Decisions in force

| Topic | Decision (Ankit) | Effect on the build |
|---|---|---|
| Goal | High win probability; profit and loss set aside for now (2026-11-16) | No stop, target, position size or dollar figure anywhere in the new mechanism. No account-size control |
| Size of move | Tier 1 = 5%, Tier 2 = 10%, Tier 3 = 15% (2026-11-16) | Every candidate carries a probability for each tier. The tier is a selection criterion |
| Options | 0DTE and 1DTE only | No option play runs past the next session |
| Direction | Long and short | Every candidate, probability and grade carries a direction |
| Reference points | SPY, QQQ, ES, NQ, VIX, 10-year — always visible (2026-11-16) | Market strip on every tab (§7.7). Option plays are produced for SPY, QQQ, ES and NQ |
| Data | Schwab API + Yahoo; free additions allowed; **data in Supabase** (2026-11-16) | New tables (§8). No new public JSON files |
| Scope | Plan and instructions only | No code until Ankit says go |

### 3.1 What "win" means — the definition everything else rests on

A candidate **wins a tier** when the price moves that far in the called direction within the window:

| Kind | Measured on | Window | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|---|
| Breakout candidate (stock) | The stock, from the pivot | 10 trading sessions after the trigger | 5% | 10% | 15% |
| 0DTE play on a stock | The stock, from the signal price | Until that day's close | 5% | 10% | 15% |
| 1DTE play on a stock | The stock, from the signal price | Until the next session's close | 5% | 10% | 15% |
| 0DTE / 1DTE play on SPY, QQQ, ES, NQ | The index or future, from the signal price | Same as above | 0.5% | 1.0% | 1.5% |

Longs use the highest price reached in the window; shorts use the lowest.

**Why the index tiers are scaled down (open question O1):** SPY and QQQ move 5% in a day a handful of
times a decade, so a 5 / 10 / 15% tier would read "0%" every day and tell you nothing. One-tenth scale
(0.5 / 1.0 / 1.5%) is a normal, a strong and an outsized index day. Stocks keep 5 / 10 / 15%.

**What is recorded but not judged, because losses are set aside:** the worst move against the call
before the tier was reached, and the time taken. They are stored with every graded record so that
profit-and-loss rules can be added later without re-running anything.

### 3.2 Two honesty rules that follow from this definition

- **Volatile stocks hit 5% by accident.** A stock that swings 6% a day will "win" Tier 1 in either
  direction most weeks. So every probability is shown next to the **base rate** — how often any stock
  with the same daily range made that move in the same window — and the candidate's **lift** over it.
  A candidate only earns "high probability" if it beats its base rate, not just because it is jumpy.
- **A probability is a measured frequency, not a feeling.** "68%" on screen means: of the historical
  candidates that looked like this one, 68% made the move, out of N cases, in a test window the model
  had not seen. Where history is thin, the screen says "not enough history" instead of a number.

---

## 4. Target design

```
                 NIGHTLY (GitHub Actions; fetching stays keyless)
 Yahoo daily bars ─┐
 SEC / Nasdaq ─────┼─► lib/cmo/* ─► build-breakouts.mjs ─┐
 gex.json ─────────┘  (pure code) ─► build-dte-plan.mjs ─┼─► publish-supabase.mjs ─► Supabase tables
                           ▲         build-brief.mjs ◄───┘   (daily-brief.json keeps its old shape)
                same code, no copies
                           │
 research/backtest/run.mjs ┘ ─► results/ + probability tables ─► Supabase

                 LIVE (browser, signed-in user, existing Schwab proxy)
 Supabase (candidates, plan, probability tables) + Schwab quotes / candles / chains
        └─► src/lib/cmo-live.ts ─► "Triggered now" · live 0DTE/1DTE plays · market strip
```

Design rules:
- **One implementation of the score.** `pipeline/lib/cmo/` is pure JavaScript with no file, network or
  clock access. The nightly pipeline, the backtest and the browser import the same functions, so the
  score that was tested is the score that is shown.
- **Node 20, no new runtime.** The backtest is Node for that reason.
- **Nightly finds what is ready; the browser sees it trigger**, using the live Schwab prices it already has.
- **Supabase is the source of truth for everything new.** The only public file touched is
  `daily-brief.json`, which keeps its existing shape and is filled from the new engine.
- **Schwab-sourced numbers never go into the public repo.** They may be stored in Supabase behind the
  login. WO-00 checks Schwab's terms on storing market data before WO-12 does so at volume.
- **Parameters are data.** Every threshold lives in `pipeline/lib/cmo/params.json` with a
  `params_version`, carried on every row written.

---

## 5. The shared library — `pipeline/lib/cmo/`

| File | Exports (all pure functions) |
|---|---|
| `params.json` | Every threshold from the plan §4–§6 and this file, the tier definitions of §3.1, `params_version` |
| `indicators.mjs` | `sma, ema, atr, adrPct, rvol, rsRaw, trendTemplate, priorMove, contraction, gapInfo, closeLocation, avwap, rsLineNewHigh` |
| `regime.mjs` | `regimeState({spy, breadthPct, vix}) → {state, reasons[]}` |
| `fundamentals.mjs` | `epsSurprise, sue, growthYoY, acceleration, marginTrend` — each takes an `asOf` date and ignores anything filed after it |
| `setups.mjs` | `detectA1, detectA2, detectA1S, detectA2S, detectA3S` → `null` or `{setup, direction, pivot, invalidLevel, baseStart, notes[]}` |
| `score.mjs` | `tradeScore(inputs)` and `readinessScore(inputs)` → `{score, grade, components[]}` |
| `rank.mjs` | `percentileRank` across the universe |
| `tiers.mjs` | `tierOutcome(bars, entryIndex, entryPrice, direction, window, tiers)` → which tiers were reached, sessions taken, worst move against · `bucketKey(candidate)` · `lookupProbability(table, key)` with the fallback order of §6.4 |
| `index-signal.mjs` | `noiseProfile`, `bandsAt`, `signalState` (plan §6.3) |
| `orb.mjs` | `openingRange`, `orbSignal`, `openingRvol` |
| `options.mjs` | `bsPrice, bsDelta, bsGamma` (move the copies duplicated in `build-lotto.mjs` and `build-gex.mjs` here), `expectedMove`, `chooseContract` |
| `dte-score.mjs` | `dteScore(inputs) → {score, grade, components[]}` |

`components[]` is the explanation shown to the user, the same shape everywhere:
`{ key, label, points, max, value, note }`, with `note` in plain English.

---

## 6. New mechanism 1 — breakout candidates

### 6.1 Nightly flow

1. Load the universe as `build-brief.mjs` does today; move that loader to `pipeline/lib/universe.mjs`.
2. Two years of daily bars per ticker (existing `yahooChart`, range raised from one year).
3. Liquidity filter (plan §4.2). Market regime, once (plan §4.1).
4. Per ticker: indicators → RS percentile → each setup detector, long and short.
5. Per detected setup: fundamentals as of today, catalyst, group strength, options flags → `tradeScore`.
6. Per ticker with no setup: `readinessScore`; keep ≥ 70.
7. Look up tier probabilities for every candidate (§6.4).
8. Publish to Supabase (§8). Then `build-brief.mjs` fills its `breakout_candidates` from the same result.

### 6.2 Status of a candidate

| Status | Meaning | Set by |
|---|---|---|
| `ready` | Coiled, within 3% of its pivot; nothing has happened yet | Nightly |
| `armed` | Setup complete as of the last close; it triggers on a move through the pivot | Nightly |
| `triggered` | Price crossed the pivot today with volume on pace | Browser, live |
| `extended` | More than 0.7 ATR past the pivot; the move has started without it | Nightly and browser |

### 6.3 The score (0–100)

| Component key | Max | Source |
|---|---|---|
| `setup` | 30 | Setup quality fields from `setups.mjs` |
| `catalyst` | 20 | Earnings surprise, guidance, gap size |
| `growth` | 10 | EPS and sales growth, acceleration |
| `rs` | 15 | RS percentile, RS line |
| `volume` | 15 | RVOL (nightly: last session; live: opening pace) |
| `group` | 5 | Industry group rank |
| `options` | 5 | 0–1 DTE volume vs open interest in the call direction; insider cluster |

Regime is a gate, not points. Shorts mirror every component. Grades: A+ ≥ 85 · A 75–84 · B 60–74 · C < 60.
The score **ranks** candidates. It is not itself a probability; §6.4 turns it into one.

### 6.4 Tier probabilities — how "likely to move 5 / 10 / 15%" is produced

**Step 1 — label history (backtest, WO-03).** Run the detectors over every session of the test period.
For each historical candidate that triggered, `tierOutcome` records which tiers it reached within 10
sessions.

**Step 2 — build the probability table.** Group historical candidates into buckets and count:

`bucket = setup × direction × grade × regime state × daily-range band`
(daily-range bands, ADR%: 3–5, 5–8, over 8)

For each bucket and each tier: `p = hits ÷ cases`, the case count, and a 90% Wilson interval.
Built on the in-sample period only; then frozen.

**Step 3 — thin buckets.** A bucket needs at least 100 cases. Below that, fall back in this fixed order
and record which level was used: drop the daily-range band → drop the regime state → merge A+ with A.
Still under 100 → `null`, shown as "not enough history".

**Step 4 — base rates.** Same counting for *every* liquid stock on every session, by direction and
daily-range band, with no setup required. That is the base rate. `lift = p ÷ base rate`.

**Step 5 — check it on unseen data.** On the out-of-sample period, compare each bucket's stated
probability with what actually happened (§9, WO-03 gates).

**Step 6 — what a candidate carries on screen.**
- `p_t1, p_t2, p_t3`, each with case count, interval, base rate and lift.
- `tier`: the highest tier whose probability is at least 50%. None reach 50% → no tier.
- `high_probability`: true only if that tier's probability is ≥ 65%, the low end of its interval is
  ≥ 50%, lift is ≥ 1.3, and the bucket passed the out-of-sample check.

The 50% and 65% lines are starting values in `params.json`. Whether any bucket clears them is a finding
of the backtest, not an assumption. If none does, the report says so and the screen shows the honest
probabilities without the badge.

**A later refinement, only if it earns it:** a logistic model on the seven components plus daily range
and regime may replace the bucket table if it scores better out-of-sample (lower Brier score) and stays
calibrated. The bucket table is the required version because it can be checked by hand.

### 6.5 Live trigger in the browser — `src/lib/cmo-live.ts`

For signed-in users with a live Schwab session, for the `ready` and `armed` candidates on screen (cap
40 tickers; reuse the existing 60-second poll and the proxy's candle endpoint):
- After 09:35 ET compute the 5-minute opening range and opening RVOL from 1-minute candles.
- Mark `triggered` when price crosses the pivot (or the opening-range high or low for A1 on the gap day)
  and volume is on pace for ≥ 1.5 × the 50-day average. Re-score the `volume` component live and
  re-look-up the probabilities if the grade changed.
- No Schwab session → the list stays as published, with the line: "Live triggers need the Schwab
  connection — showing last night's levels."

Each live trigger is written to Supabase (§8) so it is graded like everything else.

---

## 7. New mechanism 2 — 0DTE / 1DTE option plays

### 7.1 Kinds of play

| Play | Underlying | Signal | Expiry |
|---|---|---|---|
| `index_momentum` | SPY, QQQ, ES, NQ | Price leaves the intraday noise band (plan §6.3) | 0DTE |
| `index_overnight` | SPY, QQQ, ES, NQ | Band signal still on in the last 30 minutes | 1DTE |
| `stock_trigger` | A breakout candidate that triggered, grade A or better, with a 0 or 1 DTE option listed | The breakout trigger | 0DTE if listed today, else 1DTE |
| `stock_orb` | Any liquid stock with opening RVOL in the day's top 20 and a 0 or 1 DTE option listed | 5-minute opening range break (plan §6.2) | same |

### 7.2 Nightly — `build-dte-plan.mjs`

Everything knowable before the open, published as one row per session:
- Noise profile for SPY, QQQ, ES and NQ: for each half-hour mark, the 14-session average absolute move
  from the open. SPY and QQQ from Yahoo 5-minute bars (keyless). ES and NQ from Yahoo `ES=F` / `NQ=F`
  if the 5-minute history proves complete in WO-00; otherwise the SPY and QQQ profiles are reused for
  them and the row says so.
- Dealer gamma state and levels from `gex.json`.
- The session's scheduled events (FOMC, CPI, jobs report, monthly expiry) from a hand-maintained
  `pipeline/data/events.json`.
- Daily regime; prior day's high, low and close.
- Which breakout candidates have a 0 or 1 DTE expiry.

### 7.3 Live — the play itself (browser)

Every 60 seconds during the session, per underlying:
1. Bands at the current half-hour mark; session VWAP from 1-minute candles.
2. Signal: `long` above the upper band, `short` below the lower band, otherwise `none`. The condition
   that ends the signal is shown with it: back through the band or VWAP, or 15:55 ET.
3. Signal on → score it (§7.5), look up tier probabilities (§7.5), fetch the 0DTE or 1DTE chain through
   the proxy and name a contract (§7.4).
4. Write the play to Supabase the first time it appears.

### 7.4 `chooseContract`

Names the contract that expresses the call; it does not size or price a trade.
- Candidates: single options in the signal's direction between 30 and 50 delta, 0DTE (or 1DTE).
- Reject contracts with no bid or with a bid-ask spread wider than 10% of the mid.
- Pick the one nearest 40 delta. Also report the strike nearest each tier level (the price the
  underlying would have to reach for Tier 1, 2, 3).
- Output: `{ symbol, type, strike, expiry, delta, mid, spread_pct, tier_strikes: {t1, t2, t3} }`, or
  `null` with a plain reason ("No contract with a tight enough spread").
- SPY and QQQ use their own options. ES and NQ use their futures options through the proxy; if the
  proxy cannot serve futures option chains (WO-00 finds out), the ES and NQ cards show the signal,
  levels and probabilities with "contract not available from this data source".

### 7.5 Score and probabilities for option plays

Score (0–100), separate from the stock score because the inputs differ:

| Component key | Max | Full marks when |
|---|---|---|
| `signal` | 30 | Price ≥ 0.5 noise-units beyond the band (index) or opening RVOL ≥ 5 (stock) |
| `gamma` | 15 | Dealers short gamma (moves extend); zero when long gamma (pinning) |
| `alignment` | 15 | Signal agrees with the VWAP side and the daily regime |
| `pricing` | 15 | Expected move from the at-the-money straddle ≤ 20-day realised daily move |
| `liquidity` | 10 | Spread ≤ 5% of mid |
| `time` | 10 | Signal before 11:30 ET (0DTE); 15:30–15:55 ET (1DTE) |
| `event` | 5 | No scheduled event later in the session |

Tier probabilities use the same method as §6.4 with the option tiers and windows of §3.1 and
`bucket = play kind × direction × grade × gamma state × time-of-day band` (before 10:30, 10:30–13:00,
after 13:00). Base rate = the same underlying making that move from that time of day on any session.
Same `tier`, `high_probability`, thin-bucket and "not enough history" rules.

Hard gates regardless of score: a scheduled event in the next 30 minutes → the card says "wait for the
release"; data older than 3 minutes → the card greys out.

### 7.6 The existing lotto scanner

Stays as it is until the new engine has a verdict. Then the Options tab leads with the new plays and
lotto moves below as "Older scanner". In WO-03 the harness re-tests S1–S4; `lotto-validation.json` is
either regenerated by a script that is in the repo, or its "validated" flags are set to `false`.

### 7.7 Market reference strip — always visible

A single strip under the page header on **every tab**, never collapsed:

| Shown as | Live symbol (Schwab proxy) | Nightly fallback (Yahoo) | Display |
|---|---|---|---|
| SPY | `SPY` | `SPY` | Price, change, % change |
| QQQ | `QQQ` | `QQQ` | Price, change, % change |
| ES | `/ES` | `ES=F` | Price, change, % change |
| NQ | `/NQ` | `NQ=F` | Price, change, % change |
| VIX | `$VIX` | `^VIX` | Level, change in points |
| 10-year | `$TNX` | `^TNX` | Yield in %, change in basis points |

- Live for signed-in users on the existing 60-second poll (add the six symbols to the quote universe).
  Otherwise the last stored snapshot with its date.
- Each item shows an "as of" time; anything older than 3 minutes in market hours greys out.
- SPY, QQQ, ES and NQ also show their state from §7.3 as a word: "above range", "inside range",
  "below range". Tapping one opens its card on the Options tab.
- Exact Schwab symbols for futures and indexes are confirmed in WO-00; the table above is the
  expected form, not yet checked against the proxy.
- Phone: six items in two rows of three, 44 px tall targets, no horizontal scroll.

---

## 8. Data in Supabase

### 8.1 Tables (SQL goes in `TradeDesk/supabase/`, next to the invites table)

| Table | One row is | Written by | Key columns |
|---|---|---|---|
| `cmo_runs` | One nightly build | Pipeline | `run_id`, `generated_at`, `bars_as_of`, `params_version`, `regime` (json), `counts` (json) |
| `cmo_candidates` | One candidate in one run | Pipeline | `run_id`, `session_date`, `ticker`, `direction`, `setup`, `status`, `score`, `grade`, `components` (json), `readiness`, `pivot`, `invalid_level`, `dist_to_pivot_pct`, `adr_pct`, `rvol`, `rs_rank`, `catalyst` (json), `growth` (json), `next_earnings`, `has_0dte`, `has_1dte`, `p_t1`, `p_t2`, `p_t3`, `prob_detail` (json: cases, interval, base rate, lift, fallback level per tier), `tier`, `high_probability`, `why` (text[]) |
| `cmo_dte_plan` | One session's pre-open plan | Pipeline | `session_date`, `params_version`, `payload` (json, §7.2) |
| `cmo_live_signals` | One live trigger or option play | Browser | `id`, `user_id`, `ts`, `kind`, `ticker`, `direction`, `score`, `grade`, `p_t1..p_t3`, `tier`, `payload` (json: levels, contract) |
| `cmo_predictions` | One logged call and its outcome | Pipeline | `id`, `source` (`nightly`\|`live`), `kind`, `session_date`, `ticker`, `direction`, `setup`, `score`, `grade`, `tier`, `p_t1..p_t3`, `params_version`, `entry_price`, `entry_ts`, `outcome` (json, §8.3), `final` (bool) |
| `cmo_prob_tables` | One bucket × tier | Backtest | `table_version`, `kind`, `bucket_key`, `tier`, `cases`, `hits`, `p`, `ci_low`, `ci_high`, `base_rate`, `lift`, `oos_cases`, `oos_p`, `passed` |
| `cmo_validation` | One module's verdict | Backtest | `module`, `verdict`, `run_id`, `table_version`, `oos_from`, `oos_to`, `summary` (json), `data_quality` (`real`\|`modelled`) |
| `cmo_backtest_runs` | One backtest run | Backtest | `run_id`, `module`, `args` (json), `params_version`, `git_sha`, `started_at`, `summary` (json) |
| `cmo_backtest_cases` | One historical candidate | Backtest | `run_id`, `session_date`, `ticker`, `direction`, `setup`, `score`, `grade`, `bucket_key`, `hit_t1`, `hit_t2`, `hit_t3`, `sessions_to_t1`, `worst_against_pct`, `in_sample` |
| `market_reference` | One snapshot of one reference symbol | Pipeline nightly; browser may refresh | `ts`, `symbol`, `value`, `change`, `change_pct`, `source` |
| `option_chain_snapshots` | One chain at one time | Snapshot job (WO-12) | `ts`, `underlying`, `expiry`, `spot`, `chain` (json, strikes within ±5% of spot only) |

### 8.2 Access

- Row-level security on every table.
- **Read:** signed-in users who are on the invite list (reuse the check behind `tradedesk_invites`).
  `option_chain_snapshots` and `cmo_backtest_cases`: service role only.
- **Write:** service role only (the pipeline and the backtest), except `cmo_live_signals`, where a
  signed-in user may insert rows carrying their own `user_id`.
- The pipeline's Supabase URL and service key are GitHub secrets, used only by the publish step. The
  fetching steps stay keyless as they are today.
- The browser reads through the existing Supabase client; no new key in the bundle.

### 8.3 Logging and grading

- **Nightly:** every published candidate with status `armed` or `ready` is inserted into
  `cmo_predictions`. Live triggers and plays are copied in from `cmo_live_signals`.
- **Grading** (`pipeline/grade-predictions.mjs`, new functions; the existing `breakout` and `lotto`
  grading and their JSON file are left untouched and shown as "previous scoring"):
  - `gradeCandidate`: entry = the first session within 5 where price trades through the pivot. None →
    `never_triggered`. Otherwise `tierOutcome` over the next 10 sessions → `hit_t1, hit_t2, hit_t3`,
    `sessions_to_t1`, `best_move_pct`, `worst_against_pct`. Final once the window has closed.
  - `gradePlay`: same, on the underlying's 5-minute bars (Yahoo, keyless), with the option windows and
    tiers of §3.1.
- **Scorecard** (computed by a Supabase view, `cmo_scorecard`): per kind, setup, direction, grade and
  tier — calls, wins, win rate, **the probability that was stated**, and the base rate. Stated versus
  actual, side by side, is the whole point: it shows whether the percentages can be believed.

### 8.4 Size limits to respect

- The free Supabase tier has a small database (about 500 MB — confirm the current figure in WO-00).
- Bulk price history for the backtest (two years of minute bars for hundreds of tickers) does **not**
  go in Supabase. It stays in the harness's local cache. Only results and probability tables are stored.
- `option_chain_snapshots` is trimmed to strikes within ±5% of spot and four underlyings, with a
  90-session retention; WO-12 measures real size over its first week and adjusts before continuing.
- `cmo_candidates` keeps 180 sessions; older rows are deleted (their predictions stay in `cmo_predictions`).

---

## 9. Work orders

In order. Each is one branch-sized piece with its own log entry. "Accept" must pass before the next starts.

**WO-00 · Ground truth (no code)**
- Record which workflow folder is live and how the two differ.
- From the callers in `src/lib/`, and by asking Ankit where needed, establish what the Schwab proxy
  serves: quotes for `/ES`, `/NQ`, `$VIX`, `$TNX`; minute candles and how far back; option chains for
  equities and for futures.
- Check Yahoo 5-minute history depth for `ES=F` and `NQ=F`.
- Read Schwab's developer terms on storing market data; read Supabase's current free-tier limits.
- Verify every trader rule in the plan against a primary source (plan Phase 0).
- Accept: `research/backtest/SOURCES.md` exists; the log entry lists each fact confirmed, each
  corrected, and each thing the proxy cannot do.

**WO-01 · Shared library**
- Build `pipeline/lib/cmo/` (§5). Freeze and commit `params.json` before WO-03 produces any result.
- Tests with `node --test`: every indicator against hand-computed fixtures; each setup detector against
  three real historical examples and three near-misses (bars stored as fixtures); `tierOutcome` for
  long and short, including a move that reaches the tier on the last session of the window and one
  that reaches it one session too late; `lookupProbability` through every fallback level;
  `chooseContract` including the "nothing fits" path.
- Accept: tests pass; nothing in `lib/cmo` imports `fs` or `http` or reads the clock.

**WO-02 · Supabase schema**
- SQL for the tables, policies and the `cmo_scorecard` view of §8, in `TradeDesk/supabase/`.
  Apply to a Supabase **branch** first, never straight to the live project.
- `pipeline/lib/supabase-admin.mjs`: batched upserts, retry, and a dry-run mode that prints row counts.
- Accept: as an invited user, select works on the read tables and fails on the service-only tables; as
  a signed-in user not on the invite list, every select returns nothing; an insert into
  `cmo_live_signals` with someone else's `user_id` is refused.

**WO-03 · Backtest harness and the probability tables — `research/backtest/` (Node)**
```
research/backtest/
  README.md             how to run; data sources; env vars
  run.mjs               CLI (below)
  data/fetch-*.mjs      Yahoo daily · Alpaca minute · SEC facts · Nasdaq earnings → cache/ (git-ignored)
  data/universe.mjs     per-date index membership (survivorship control, plan §7.4)
  engine/scan.mjs       walks every session, runs the detectors, labels outcomes with tierOutcome
  eval/tables.mjs       probability tables, base rates, intervals, fallbacks (§6.4)
  eval/calibrate.mjs    out-of-sample check, lift, Brier score, ablation
  eval/report.mjs       report.md + summary.json + cases.csv; optional --publish to Supabase
  results/<run_id>/
```
CLI — the interface for **any** backtest, including ideas added later:
```
node research/backtest/run.mjs \
  --module A1|A2|A1S|A2S|A3S|index_momentum|index_overnight|stock_trigger|stock_orb|S1|S2|S3|S4|<new> \
  --from 2019-01-01 --to 2026-10-31 \
  --split 2024-11-01             # from here on is out-of-sample
  --window 10                    # sessions; option modules use the §3.1 windows
  --tiers 5,10,15                # index modules: 0.5,1,1.5
  --variant <name in params.json> \
  --ablate regime|growth|catalyst|rs|volume|group|options \
  --publish                      # write tables and verdict to Supabase
```
To test a new idea: add a detector to `setups.mjs`, add its thresholds and at most 12 variants to
`params.json`, commit, run. The harness refuses to run with uncommitted changes to `params.json`.

Test windows: stock setups on daily data, 2019-01 → 2026-10 (out-of-sample = the last two years).
Intraday and option modules on minute data, at least 2024-11 → 2026-10, split in half.

Verdict per module (these replace the plan's §8.6 gates):

| Check, out-of-sample | Needed for "adopt" |
|---|---|
| Cases | ≥ 300 for the module; ≥ 100 in any bucket whose probability is shown |
| Calibration | In every shown bucket, stated probability and actual frequency differ by ≤ 7 points |
| Lift | Tier 1 probability ≥ 1.3 × the base rate for the same daily-range band |
| Ranking | Actual Tier 1 frequency rises with grade: C < B < A < A+ |
| Stability | Tier 1 frequency for A-grade candidates is above the base rate in at least 6 of the 8 quarters |
| No leakage | Dropping any single component (ablation) changes results smoothly; no component alone explains everything |

`adopt` = all pass · `watch` = one miss · `reject` = otherwise.
Separately reported, and not a pass/fail: which buckets, if any, reach the 65% "high probability" line.

- Accept: `tierOutcome` reproduces ten hand-checked historical cases; the same command run twice gives
  identical output; `DATA_AUDIT.md` written (coverage, gaps, survivorship share, hand-checked splits
  and earnings timestamps); `results/FINAL_REPORT.md` follows §12's template.
- **Stop and report to Ankit.** Later work orders proceed for modules that came back adopt or watch.
  A rejected module is not built into the screen as a recommendation.

**WO-04 · Nightly builds**
- `pipeline/build-breakouts.mjs` (§6.1) and `pipeline/build-dte-plan.mjs` (§7.2), then
  `pipeline/publish-supabase.mjs`. Inserted in `refresh.sh` after `build-gex.mjs` and before
  `build-brief.mjs`; non-fatal like their neighbours. Reference snapshot for the six symbols written to
  `market_reference`.
- Abort guard as in `build-brief.mjs`: more than half the chart fetches failing → publish nothing.
- The workflow gets the Supabase secrets on the publish step only.
- Accept: run in `--quick` mode with `--dry-run`; for five candidates recompute score, pivot and
  probabilities by hand from their bars and the table — all match; then one real publish to the branch
  database and the row counts match the dry run.

**WO-05 · Shadow period (10 sessions, no screen change)**
- Candidates and their probabilities are logged and graded nightly. Old scoring keeps running.
- Accept: 10 sessions with no pipeline failure; a comparison in the log: how many names each system
  flagged, the overlap, and early outcomes as counts (no percentages on fewer than 30 graded calls).

**WO-06 · Daily Brief hand-over**
- `build-brief.mjs` stops scoring breakouts itself. It maps the top 15 candidates into its existing
  `breakout_candidates` shape: `score`, `attributes`, `setup`, `trigger_price` = pivot, `stop_price` =
  `invalid_level`, `thesis` = the `why` sentences plus the tier line.
- Accept: `daily-brief.json` matches its unchanged contract; TradeDesk and TradeDeskV2 render the Brief
  with no code change; the old scoring block is deleted, not commented out.

**WO-07 · Market reference strip**
- §7.7, in `src/App.tsx` under the page header, on every tab. Reads `market_reference` first, then live
  quotes when the Schwab session is up.
- Accept: verification gate; all six items render at 1280 and 390 with no overflow; signed-out,
  off-hours and stale states each rendered; 10-year shows yield and basis points, not dollars.

**WO-08 · Scanner tab — breakout candidates**
- New primary section in `src/tabs/Scanner.tsx`, above the smart-money list, reading Supabase:
  - Header: regime in words, counts, "levels as of <date>".
  - Groups: **Triggered now** (live) · **Armed for tomorrow** · **Getting ready**.
  - Filters: Long / Short · Tier 1 / 2 / 3 · High probability only · grade · setup.
    Sort: Tier 1 probability, score, distance to pivot.
  - Row: ticker · setup in plain words · tier badge ("Tier 2 — 10% move") · the three probabilities as
    a small three-step bar (5% / 10% / 15%) · grade · pivot · distance to pivot.
  - Expanded: for each tier — probability, "X of N similar cases", the range it could plausibly be,
    the base rate for stocks this volatile, and lift in words ("about 1.6 times the usual rate");
    then the seven score bars (reuse `HBar`), the `why` sentences, catalyst and growth facts, next
    earnings date, and the level below which the setup is no longer valid.
  - "Not enough history" wherever a probability is null. "Backtest: watch — treat as unproven" banner
    on anything not adopted.
- Types in `src/types.ts`; styles in a new `src/mockb-breakouts.css`, tokens only.
- Accept: verification gate; five rows proved against Supabase; long and short rows rendered; the
  empty state and the null-probability state rendered.

**WO-09 · Live engine in the browser — `src/lib/cmo-live.ts`**
- Vite imports the pure functions straight from `pipeline/lib/cmo/` (path alias + a `.d.ts`); no
  second copy. Implements §6.5 and §7.3–7.5; writes `cmo_live_signals`.
- Adds at most one candle request per on-screen ticker per 5 minutes and one chain request per active
  signal per minute. Any proxy failure → fall back to published levels silently.
- Accept: replay test — one recorded session of 1-minute candles through the live functions and through
  the backtest scan for the same day gives identical signals and times.

**WO-10 · Options tab — 0DTE / 1DTE plays**
- New top section in `src/tabs/Options.tsx`:
  - Four cards always present — SPY, QQQ, ES, NQ — each with its state in words, band levels, VWAP,
    gamma state and today's events.
  - Signal on → direction, 0DTE or 1DTE, tier badge and the three probabilities (0.5 / 1.0 / 1.5% for
    these four), the named contract with the strikes that match each tier, the condition that ends
    the signal, score bars.
  - Stock plays listed below with their 5 / 10 / 15% probabilities, each linking to its Scanner row.
  - Before 09:35 ET and after the close: "Plays appear after 9:35 ET". No stale play is ever shown.
- Lotto section per §7.6.
- Accept: verification gate; a replayed session renders the expected cards at three chosen times; the
  "no contract" and signed-out states rendered.

**WO-11 · Performance tab**
- New section "New scoring" from the `cmo_scorecard` view: for each tier, calls, wins, win rate,
  **stated probability beside actual**, base rate — by setup, direction and grade. A chart of stated
  versus actual probability per bucket; a grade ladder (Tier 1 frequency by grade).
- Existing sections stay, titled "Previous scoring (retired <date>)", frozen.
- Accept: verification gate; every figure re-derived from `cmo_predictions`.

**WO-12 · Option chain snapshots and re-validation on real quotes**
- Separate workflow with secrets: every 5 minutes in the session, Schwab chains for SPY, QQQ and (if the
  proxy allows) ES and NQ, into `option_chain_snapshots`. Schwab refresh tokens last about 7 days; on
  expiry the job fails loudly and the Admin tab shows "Schwab re-login needed".
- After 60 sessions: re-check the contract-selection rules and the `pricing` score component against
  real quotes; update `cmo_validation.data_quality` to `real` where it applies.
- Accept: five consecutive sessions with ≥ 95% of expected snapshots; database size measured and inside
  the limit; nothing Schwab-sourced in the public repo (grep the diff).

**WO-13 · Documentation**
- `DATA_CONTRACTS.md`: the Supabase tables, the tier definitions, the new prediction kinds.
  Reference tab: a plain-language card, "What the tiers and percentages mean".
- Accept: a new agent can find every table and column named here from `DATA_CONTRACTS.md` alone.

---

## 10. Order and what is needed from Ankit

```
WO-00 → WO-01 → WO-02 → WO-03 ──(verdicts; report)──→ WO-04 → WO-05 → WO-06 → WO-08 → WO-11
                                                       └→ WO-07 (strip; needs no verdict, can ship first)
                                                       └→ WO-09 → WO-10 → WO-11
WO-12 any time after WO-02 once keys exist.   WO-13 alongside each screen work order.
```

- Before WO-02: confirm which Supabase project to use (default: the one the app already logs in with)
  and add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub secrets.
- Before WO-03's minute-data runs: a free Alpaca key as `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`.
- Before WO-09: confirm the Schwab proxy may be called for candles and chains at the WO-09 rates.
- Before WO-12: `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET`, `SCHWAB_REFRESH_TOKEN`.

---

## 11. Checks that apply to the whole build

| Risk | Check |
|---|---|
| Score on screen differs from the score that was tested | `params_version` on `cmo_candidates` equals the one on `cmo_prob_tables`; WO-09 replay test; one library |
| Probabilities that just reflect volatility | Base rate and lift stored and shown with every probability; lift gate in WO-03 |
| Probabilities fitted to the past | Tables built in-sample, frozen, checked once out-of-sample; variant budget of 12 per module, count reported |
| Look-ahead | Every candidate's inputs dated ≤ `bars_as_of`; fundamentals tested with a filing dated after `asOf` and shown to ignore it; outcome windows start the session after the signal for nightly candidates |
| Survivorship | Per-date universe from historical membership; unrecovered share reported; headline result re-run on index members only |
| A percentage with nothing behind it | UI cannot render a probability without its case count; null renders as "not enough history" |
| Stale data shown as live | Every live item carries an "as of" time and greys out past its limit |
| Data leaking out | RLS tests in WO-02; grep for Schwab-sourced values in the repo diff |
| Regression elsewhere | The gate's regression spot-check from the 2026-11-12 log entry; TradeDeskV2 loads |

---

## 12. Reporting back to Ankit

| After | He gets |
|---|---|
| WO-00 | What was corrected in the research; what the Schwab proxy and Supabase tier can and cannot do |
| WO-03 | **The results report** (below) |
| WO-05 | Old scoring versus new over the 10 shadow sessions |
| WO-07, WO-08, WO-10 | The live URL, version string, what to check on phone and tablet |
| WO-12 (+60 sessions) | What changed once real option quotes were available |

**Results report template (`research/backtest/results/FINAL_REPORT.md`, summarised in chat):**
1. One line per module: adopt / watch / reject, and the check that decided it.
2. **The probability table** — for each setup and grade: chance of a 5%, 10% and 15% move, number of
   cases, base rate, lift. In-sample and out-of-sample side by side.
3. Which buckets reach "high probability", if any — stated plainly either way.
4. Stated versus actual, out-of-sample (the calibration chart).
5. By year and by market regime. Long versus short.
6. What each score component added (ablation).
7. Recorded for later: typical worst move against the call, and sessions taken to reach each tier.
8. What is not proven: data gaps, survivorship share, option results based on modelled prices.
9. Ten example cases per adopted setup with charts — five that made the move, five that did not.
10. Recommended next step.

Reporting rules: a failed module is reported as plainly as a passed one; no percentage is quoted
without its case count; past frequencies are not a promise about the future, said once at the top.

---

## 13. Open questions (defaults apply until answered; none blocks WO-00 to WO-03)

| # | Question | Default |
|---|---|---|
| O1 | For SPY, QQQ, ES and NQ plays, are tiers of 0.5 / 1.0 / 1.5% right? (5 / 10 / 15% is kept for stocks; an index almost never moves 5% in a day) | Yes |
| O2 | Is 10 trading sessions the right window for a breakout candidate to make its move? The report will also show 3, 5 and 20 | 10 |
| O3 | Which Supabase project? | The one the app already uses for login |
