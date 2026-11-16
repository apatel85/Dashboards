# TradeDesk — Scoring Revamp Build Spec

**Status:** SPEC ONLY. Nothing in this file has been built or run.
**Companion to:** `STRATEGY_PLAN.md` (the *what and why*: research, debate, strategy rules, backtest design).
This file is the *how*: what to build inside the existing TradeDesk app, in what order, and how to prove
each piece works. Where the two files disagree, this one wins for build details and the plan wins for
strategy rules.
**Written:** 2026-11-16 · **Audience:** any AI agent picking this up cold.

Two things get built:
1. A new **breakout-candidate scoring mechanism** that replaces the current one.
2. A new **0DTE / 1DTE option play engine** that sits beside, then replaces, the current "lotto" scanner.

Both are backed by one reusable backtest harness, and nothing reaches the screen as a recommendation
until that harness has passed it (standing decision: backtest-before-adopt).

---

## 1. Read first, in this order

1. `/AGENTS.md` → `TradeDesk/AGENTLOG.md` (Decisions block + newest entries) → `TradeDesk/DATA_CONTRACTS.md`.
2. `TradeDesk/STRATEGY_PLAN.md` §4–§8 and §11.
3. This file.

Rules that bind every work order below:
- Public repo: no keys, tokens or personal data in any file. Keys live in GitHub secrets / the Supabase proxy.
- Pipelines write atomically, keep the last good file on failure, and write `null` (never filler) for
  anything not computed. (`DATA_CONTRACTS.md` → Pipeline notes.)
- UI uses Mock B tokens only. Every UI change runs the verification gate recorded in `AGENTLOG.md`
  (build, token diff, renders at 1280 and 390, number proof against the live data file).
- Each work order ends with an `AGENTLOG.md` entry stating exactly what was and was not verified.
- `TradeDeskV2/` reads TradeDesk's data and must keep working: existing JSON files keep their shape.

---

## 2. What exists today (verified by reading the code on 2026-11-16)

| Piece | Where | How it works now | Problem this spec fixes |
|---|---|---|---|
| Breakout score | `pipeline/build-brief.mjs` (scan loop, ~lines 230–285) | 0–100 = nearness to 52-week high (up to 40) + 3-month return vs SPY (up to 30) + 5-day vs 50-day volume (up to 30). Kept if ≥ 40; top 15 shown | Three inputs, no setup detection, no catalyst, no fundamentals, no regime gate in the score, long only |
| Trigger and stop | same | Trigger = the 52-week high. Stop = lowest low of the last 20 days | Log entry 2026-11-14: median trigger 1.4% above price, median stop 13.5% below. Risk is about ten times the first reward |
| Breakout grading | `pipeline/grade-predictions.mjs` → `gradeBreakout` | "Trigger hit" = any day's high touched the trigger within 10 days | A touch is not a profit. Already relabelled in the UI; the grading itself is unchanged |
| 0DTE/1DTE "lotto" score | `pipeline/build-lotto.mjs` | Starts at 10, adds points for volume ÷ open interest, unusual strikes, expected move, gap, cheap IV, volume ignition, 20-day break, dealer gamma, Friday pin. Tags setups S1–S4 | Additive points with no tested weights. Runs once, hours before the open, on the previous session's chain |
| Lotto validation | `public/data/lotto-validation.json` | Says S1 and S2 are "validated" (modelled prices, win rates 20–24%) | **The script that produced this file is not in the repo**, and its methodology line reads "S&P 500 (0 tickers)". It cannot be reproduced, so it cannot be trusted as validation |
| Schedule | `.github/workflows/tradedesk-pipeline.yml` | One run on weekdays at 05:00 UTC (about midnight ET). Keyless | Everything on screen is from the prior close. Nothing reacts to the open |
| Live prices | `src/lib/useSchwabLive.ts`, `schwab.ts`, `schwabDeepDive.ts`, `premarketRange.ts` | The browser polls a Schwab proxy every 60 seconds for signed-in users; the proxy also serves candles and option chains | Already there, and unused by scoring. This is what makes live triggers possible without new infrastructure |
| Dealer gamma | `pipeline/build-gex.mjs` → `gex.json` | Gamma regime and levels for ^SPX, QQQ and signal names | Reused as an input |
| Fundamentals helpers | `pipeline/lib/scoring.mjs`, `lib/sec.mjs` | Health score, Piotroski, Altman Z, EPS streak from SEC and Yahoo | Reused; growth and surprise functions get added |

Two near-identical workflow folders exist (`TradeDesk/WORKFLOW/` and `/.github/workflows/`) and their
pipeline files differ. The live one is `/.github/workflows/`. WO-00 records which is authoritative.

---

## 3. Decisions in force (Ankit, 2026-11-15 and 2026-11-16)

| Topic | Decision | Effect on the build |
|---|---|---|
| Stop and target | **Per trade: 3% loss, 15% gain** | Stock trades: stop 3% from entry, target 15% from entry, both directions. A 1-to-5 shape; breaks even at a 16.7% win rate |
| Options | 0DTE and 1DTE only | No option is held past the next session. Swing trades are shown as share trades |
| Direction | Long and short | Every list, score and grade carries a direction |
| Account | $10,000 | Sizing and dollar figures on screen use it. Adjustable in the UI, stored in the browser only |
| Data | Schwab API + Yahoo; free additions allowed | Alpaca free tier added for 2-year minute history in the backtest |
| Scope of this document | Plan and instructions only | No code is written until Ankit says go |

**Consequences of 3% / 15% that the builder must implement, not work around:**
- **The stop decides whether a trade exists.** Each setup has a *technical* stop (the day's low, the base
  low, the opening-range low). If the technical stop is more than 3% from the entry, the candidate is
  shown as "stop doesn't fit" and is not a trade. Never widen the 3%, never move the entry to make it fit.
- **Options cannot use a 3% stop on the premium** — the bid-ask spread alone is usually wider. For
  options the same 1-to-5 shape is applied to money: premium at risk ≤ 3% of the account ($300), profit
  target = 5 × the premium paid. The literal reading (exit at −3% / +15% of premium) is still run in the
  backtest as a labelled variant so the difference is on record. **Open question O1 in §13.**
- **Position size for shares** is not fixed by a 3% / 15% rule. Default: 25% of the account per position
  ($2,500), four positions at most, so one stopped trade costs $75 (0.75% of the account) and one target
  hit makes $375. **Open question O2 in §13.**
- **$300 does not buy an at-the-money SPX or ES 0DTE option.** The ticket chooser (§7.4) must pick from
  contracts that fit: SPY and QQQ options, XSP (mini-SPX), micro futures options (MES / MNQ), or a
  narrow debit spread on SPX. It must never display a ticket that costs more than the cap.
- A fixed +15% target will be reached on a minority of trades. The backtest also runs the staged exit
  from `STRATEGY_PLAN.md` §6.1 as a comparison and reports both.

---

## 4. Target design

```
                     NIGHTLY (GitHub Actions, keyless, as today)
 Yahoo daily bars ─┐
 SEC / Nasdaq ─────┼─► lib/cmo/*  ─► build-breakouts.mjs ─► public/data/breakouts.json
 gex.json ─────────┘   (pure code)  ─► build-dte-plan.mjs ─► public/data/dte-plan.json
                            ▲         ─► build-brief.mjs (reads breakouts.json, keeps its old shape)
                            │
            same code, no copies
                            │
 research/backtest/run.mjs ─┘  ─► research/backtest/results/…  ─► public/data/strategy-validation.json

                     LIVE (browser, signed-in user, existing Schwab proxy)
 breakouts.json + dte-plan.json + Schwab quotes/candles/chains
        └─► src/lib/cmo-live.ts ─► "Triggered now" on Scanner · live 0DTE/1DTE play on Options
```

Design rules:
- **One implementation of the score.** `pipeline/lib/cmo/` is pure JavaScript with no file or network
  access. The nightly pipeline, the backtest and (through a small build step, WO-09) the browser all
  import the same functions. A score that is tested is then, by construction, the score that is shown.
- **Node 20, no new runtime.** The backtest is written in Node, not Python, for the reason above. This
  replaces the Python layout in `STRATEGY_PLAN.md` §8.1.
- **Nightly finds what is ready. The browser sees it trigger.** The pipeline cannot know tomorrow's
  open; it publishes the levels. The browser, which already has live Schwab prices, checks them.
- **Schwab data stays behind the login.** Nothing fetched from Schwab is written into the public repo.
  Published files are built from keyless sources plus backtest verdicts. (Check Schwab's API terms on
  redistribution in WO-00 before changing this.)
- **Parameters are data.** Every threshold lives in `pipeline/lib/cmo/params.json` with a
  `params_version`. Every output file and every logged prediction carries that version.

---

## 5. The shared library — `pipeline/lib/cmo/`

| File | Exports (all pure functions) |
|---|---|
| `params.json` | Every threshold in `STRATEGY_PLAN.md` §4–§6 and this file's §6–§7, plus `params_version` |
| `indicators.mjs` | `sma, ema, atr, adrPct, rvol, rsRaw, trendTemplate, priorMove, contraction, gapInfo, closeLocation, avwap, rsLineNewHigh` |
| `regime.mjs` | `regimeState({spy, breadthPct, vix}) → {state: 'green'\|'yellow'\|'red', reasons[]}` |
| `fundamentals.mjs` | `epsSurprise, sue, growthYoY, acceleration, marginTrend` — every function takes an `asOf` date and ignores anything filed after it |
| `setups.mjs` | `detectA1, detectA2, detectA1S, detectA2S, detectA3S` → `null` or `{setup, direction, pivot, technicalStop, baseStart, notes[]}` |
| `risk.mjs` | `tradePlan({entry, direction, technicalStop, account, params})` → `{entry, stop, target, stopFits, shares, dollars, riskDollars}` |
| `score.mjs` | `tradeScore(inputs) → {score, grade, components[]}` and `readinessScore(inputs)` — same shape |
| `rank.mjs` | `percentileRank` across the universe for RS and group strength |
| `index-signal.mjs` | `noiseProfile(minuteBarsByDay)`, `bandsAt(time, open, prevClose, profile)`, `signalState(price, bands, vwap)` |
| `orb.mjs` | `openingRange(bars, minutes)`, `orbSignal(...)`, `openingRvol(...)` |
| `options.mjs` | `bsPrice, bsDelta, bsGamma` (move the copies now duplicated in `build-lotto.mjs` and `build-gex.mjs` here), `expectedMove`, `chooseTicket` |
| `dte-score.mjs` | `dteScore(inputs) → {score, grade, components[]}` |

`components[]` is the explanation shown to the user and is identical everywhere:
`{ key, label, points, max, value, note }` — e.g. `{key:'rs', label:'Relative strength', points:15, max:15,
value:94, note:'Top 6% of the market; RS line at a new high'}`. `note` is plain English, no jargon.

---

## 6. New mechanism 1 — breakout candidates

### 6.1 Flow (nightly)

1. Load the universe exactly as `build-brief.mjs` does today (S&P 500 + Nasdaq-100, plus Russell 2000 in
   full mode). Move that loader into `pipeline/lib/universe.mjs` so both scripts share it.
2. Fetch one year of daily bars per ticker (existing `yahooChart`; raise the range to 2 years so the
   200-day average and four quarters of RS are always available).
3. Apply the liquidity filter (`STRATEGY_PLAN.md` §4.2).
4. Compute the regime once (§4.1 of the plan).
5. For every ticker: indicators → RS percentile → each setup detector, long and short.
6. For every detected setup: fundamentals as of today, catalyst, group strength, options flags
   → `tradeScore` → `tradePlan`.
7. For every ticker with no setup yet: `readinessScore`. Keep those ≥ 70.
8. Write `breakouts.json`. Then `build-brief.mjs` runs and fills its existing `breakout_candidates`
   array from `breakouts.json` instead of its own scan (§9, WO-06).

### 6.2 Status of a candidate

| Status | Meaning | Set by |
|---|---|---|
| `ready` | Coiled and within 3% of its pivot; nothing has happened yet | Nightly |
| `armed` | Setup complete as of the last close; the trade is "buy above / sell below the pivot tomorrow" | Nightly |
| `triggered` | Price crossed the pivot today with volume on pace | Browser, live |
| `extended` | Price is more than 0.7 ATR past the pivot — too late | Nightly and browser |
| `no_fit` | Setup is valid but the technical stop is more than 3% from the entry | Nightly and browser |

### 6.3 The score (0–100), unchanged from the plan, stated here as the build contract

| Component key | Max | Source |
|---|---|---|
| `setup` | 30 | `setups.mjs` quality fields |
| `catalyst` | 20 | Earnings surprise, guidance, gap size |
| `growth` | 10 | EPS and sales growth, acceleration |
| `rs` | 15 | RS percentile, RS line |
| `volume` | 15 | RVOL (nightly: last session; live: opening pace) |
| `group` | 5 | Industry group rank |
| `options` | 5 | 0–1 DTE volume vs open interest in the trade's direction; insider cluster |

Regime is a gate, not points. For shorts every component is mirrored (RS ≤ 20 scores full, a miss is the
catalyst, and so on). Grades: A+ ≥ 85 · A 75–84 · B 60–74 · C < 60.
What is shown: A+ and A in green or yellow regimes; B in green only; C never. Longs are hidden in a red
regime and shorts are hidden in a green one — hidden from the candidate list, still written to the file
with `gated: true` so the grading can show what the gate cost or saved.

### 6.4 `public/data/breakouts.json` (new contract — add to `DATA_CONTRACTS.md`)

```
{
  generated_at, bars_as_of, params_version,
  account_default: 10000,
  regime: { state, spy_vs_50d_pct, spy_vs_200d_pct, breadth_pct, vix, reasons[] },
  validation: { A1: Verdict, A2: Verdict, A1S: Verdict, A2S: Verdict, A3S: Verdict },
  counts: { scanned, passed_liquidity, setups, ready },
  candidates: [ Candidate ]
}
Verdict   = { verdict: 'adopt'|'watch'|'reject'|'untested', run_id, oos_from, oos_to,
              trades, win_rate, payoff, expectancy_r, profit_factor, max_dd_pct }
Candidate = {
  ticker, name, sector, group, index_membership[],
  direction: 'long'|'short', setup: 'A1'|'A2'|'A1S'|'A2S'|'A3S'|null,
  status, gated, score, grade, components[], readiness, readiness_components[],
  price, price_ts, pivot, dist_to_pivot_pct,
  plan: { entry, stop, target, technical_stop, stop_fits, shares, dollars, risk_dollars, reward_dollars },
  adr_pct, atr, rvol, rs_rank,
  catalyst: { type, date, surprise_pct, gap_pct } | null,
  growth: { eps_yoy_pct, sales_yoy_pct, accelerating } | null,
  next_earnings: date | null,
  has_0dte: bool, has_1dte: bool,
  why: [ "plain sentence", … ],        // 2–4 sentences
  risk_note: "plain sentence"
}
```

### 6.5 Live trigger in the browser — `src/lib/cmo-live.ts`

For signed-in users with a live Schwab session, for the `ready` and `armed` candidates on screen (cap 40
tickers, reuse the existing 60-second poll and the proxy's candle endpoint):
- After 09:35 ET compute the 5-minute opening range and opening RVOL from 1-minute candles.
- Mark `triggered` when price crosses the pivot (or the opening-range high/low for A1 on the gap day)
  **and** volume is on pace for ≥ 1.5 × the 50-day average.
- Recompute `plan` from the live entry and today's low/high as the technical stop; set `stop_fits`.
- Without a Schwab session the list stays as published and a line says so: "Live triggers need the
  Schwab connection — showing last night's levels."

Live triggers are also logged (§8) so they are graded like everything else.

---

## 7. New mechanism 2 — 0DTE / 1DTE option plays

### 7.1 Three kinds of play, one card format

| Play | Underlying | Signal | Expiry |
|---|---|---|---|
| `index_momentum` | SPX (via SPY / XSP), NDX (via QQQ), ES / NQ (via their micros) | Price leaves the intraday noise band (plan §6.3) | 0DTE |
| `index_overnight` | same | Band signal still on in the final 30 minutes | 1DTE |
| `stock_trigger` | A breakout candidate with status `triggered`, grade A+, and a 0 or 1 DTE option | The breakout trigger itself | 0DTE if listed today, else 1DTE |

### 7.2 Nightly — `build-dte-plan.mjs` → `public/data/dte-plan.json`

Everything that can be known before the open:
- Noise profile for SPY and QQQ: for each half-hour mark, the 14-session average absolute move from the
  open. Source: Yahoo 5-minute bars (keyless, about 60 days available — enough for 14 sessions).
- Dealer gamma state and levels from `gex.json`.
- Event calendar for the session: FOMC, CPI, jobs report, monthly options expiry. Static table in
  `pipeline/data/events.json`, maintained by hand each quarter from the official calendars.
- Daily regime and the prior day's range, close and VWAP-style reference levels.
- Which breakout candidates have a 0 or 1 DTE expiry.
- The current validation verdict for each play type.

```
{ generated_at, session_date, params_version,
  regime, events: [ { time_et, name } ],
  validation: { index_momentum: Verdict, index_overnight: Verdict, stock_trigger: Verdict },
  underlyings: [ { symbol, proxy_for, prev_close, gamma: { state, flip, call_wall, put_wall },
                   noise_profile: [ { time_et, avg_abs_move_pct } ] } ],
  stock_watch: [ { ticker, direction, pivot, has_0dte, has_1dte } ] }
```

### 7.3 Live — the play itself (browser)

Every 60 seconds during the session, per underlying:
1. Bands at the current half-hour mark from the noise profile, today's open and the prior close.
2. Session VWAP from the proxy's 1-minute candles.
3. Signal: `long` above the upper band, `short` below the lower band, otherwise `none`. Exit condition
   shown with it: back through the band or VWAP, or 15:55 ET.
4. If a signal is on: fetch the 0DTE (or 1DTE) chain through the proxy, run `chooseTicket`, compute the
   score, render the card.
5. Log the play the first time it appears (§8).

### 7.4 `chooseTicket` — rules

Inputs: chain, direction, account, params. Output: one ticket or `null` with a reason.
- Candidates: single long options between 20 and 50 delta in the signal's direction.
- Reject any contract whose bid-ask spread is more than 10% of the mid, or with no bid.
- Reject any contract whose cost for one contract exceeds 3% of the account.
- Prefer the highest delta that passes. Contracts = floor(cap ÷ cost), minimum 1.
- Output: `{ symbol, type, strike, expiry, delta, mid, spread_pct, contracts, cost, max_loss,
  target_value, underlying_stop, underlying_target }`. `max_loss` = cost. `target_value` = 6 × cost
  (a profit of 5 × the premium).
- If nothing passes: `null`, with the reason shown on the card ("No contract under $300 with a tight
  enough spread"). Never loosen the rules to produce a ticket.

### 7.5 0DTE/1DTE score (0–100) — separate from the stock score because the inputs differ

| Component key | Max | Full marks when |
|---|---|---|
| `signal` | 30 | Price ≥ 0.5 noise-units beyond the band (index) or opening RVOL ≥ 5 (stock) |
| `gamma` | 15 | Dealers short gamma (moves extend). Zero when long gamma (pinning) |
| `alignment` | 15 | Signal agrees with session VWAP side and the daily regime |
| `pricing` | 15 | Expected move from the ATM straddle ≤ 20-day realised daily move (premium not expensive) |
| `liquidity` | 10 | Spread ≤ 5% of mid |
| `time` | 10 | Signal before 11:30 ET (0DTE); 15:30–15:55 ET (1DTE) |
| `event` | 5 | No scheduled event later in the session |

Same grades as §6.3. Hard gates regardless of score: no ticket → no play; a scheduled event within the
next 30 minutes → card shows "wait for the release"; third play of the day → not shown (plan §4.5).

### 7.6 What happens to the existing lotto scanner

It stays exactly as it is until the new engine has a verdict. Then one of:
- New engine **adopt** or **watch** → the Options tab leads with the new plays; lotto moves below under
  "Older scanner (not validated)".
- New engine **reject** → the Options tab says so plainly and lotto stays, relabelled "not validated".

Either way, in WO-02 the backtest harness re-tests S1–S4 reproducibly and `lotto-validation.json` is
regenerated by a script that is in the repo — or its "validated" flags are set to `false`.

---

## 8. Logging and grading (so the app keeps score on itself)

### 8.1 `pipeline/snapshot-predictions.mjs`

Add record type `cmo` (stock) and `dte` (option play), written to the existing
`pipeline/data/prediction-history.jsonl`. Keep `breakout` and `lotto` records untouched; they become
"legacy" in the UI. Each new record stores everything needed to grade it without recomputing:
`{ type, date, ticker, direction, setup, status, score, grade, components, params_version, regime,
entry, stop, target, technical_stop, stop_fits, gated }`.

Live triggers and live option plays happen in the browser, which cannot write to the repo. They are
written to a Supabase table (`tradedesk_live_signals`: user id, timestamp, payload) through the existing
Supabase client; the nightly pipeline reads that table with a service key held in GitHub secrets and
appends the rows to the history file **without** any Schwab price fields (only ticker, time, direction,
levels, score). Row-level security: users insert their own rows; only the service role reads all.

### 8.2 `pipeline/grade-predictions.mjs`

`gradeCmo(rec, bars)`:
- Entry: first session within 5 where price trades through `entry` (longs: high ≥ entry; shorts:
  low ≤ entry). None → outcome `never_triggered`.
- After entry, first of: stop touched → `loss`, R = −1 · target touched → `win`, R = +5 · session 30
  reached → `time_exit`, R = (close − entry) ÷ (3% of entry), signed by direction.
- Stop and target both inside one daily bar → count the stop.
- Gap through the stop → fill at the open (R below −1 is recorded as it is).

`gradeDte(rec)`: uses the underlying's 5-minute bars for the session (Yahoo, keyless) to find whether
the exit rule or the underlying target came first, and prices the option with `options.mjs`. Result is
labelled `modelled`. When a real fill price exists in the live-signals table, grade on that and label
it `real`.

Summary block per type, per setup, per grade, per direction, per regime state: trades, win rate, payoff
ratio, break-even win rate, expectancy in R, total R, longest losing streak. **Win rate is never shown
without the payoff ratio beside it.**

---

## 9. Work orders

Do them in order. Each is one branch-sized piece of work with its own log entry. "Accept" is the check
that must pass before the next one starts.

**WO-00 · Ground truth (no code)**
- Record which workflow folder is live; diff the two and note differences in the log.
- Confirm what the Schwab proxy exposes (quotes, candles with minute granularity, option chains) by
  reading the callers in `src/lib/`. The proxy's own source is not in this repo.
- Read Schwab's developer terms on storing and redistributing market data; record the conclusion.
- Do `STRATEGY_PLAN.md` Phase 0 (verify every trader rule against a primary source).
- Accept: `research/backtest/SOURCES.md` exists; log entry lists each fact confirmed and each corrected.

**WO-01 · Shared library**
- Build `pipeline/lib/cmo/` (§5) and `params.json` from the plan. Freeze and commit `params.json`
  **before** WO-02 produces any result.
- Tests in `pipeline/lib/cmo/tests/` using `node --test`: every indicator against hand-computed
  fixtures; each setup detector against at least three real historical examples and three near-misses
  (store the bars as fixtures); `tradePlan` for long and short including the `stop_fits` boundary at
  exactly 3%; `chooseTicket` including the "nothing fits" path.
- Accept: `node --test` passes; no function in `lib/cmo` imports `fs`, `http` or reads the clock.

**WO-02 · Backtest harness — `research/backtest/` (Node)**
```
research/backtest/
  README.md             how to run; data sources; env vars
  run.mjs               CLI (below)
  data/fetch-*.mjs      Yahoo daily · Alpaca minute · SEC facts · Nasdaq earnings → cache/ (git-ignored)
  data/universe.mjs     per-date index membership (plan §7.4 survivorship control)
  engine/sim.mjs        bar-by-bar fills, costs, sizing, portfolio limits (plan §8.2–8.3)
  engine/options.mjs    modelled option fills (Tier 1) and real-quote fills when snapshots exist
  eval/metrics.mjs      plan §8.5 metrics, bootstrap, random-entry benchmark, ablation
  eval/report.mjs       builds report.md + summary.json + trades.csv
  results/<run_id>/
```
CLI — this is the interface for **any** backtest, including ideas added later:
```
node research/backtest/run.mjs \
  --module A1|A2|A1S|A2S|A3S|B|C|D|H1|H2|S1|S2|S3|S4|<new> \
  --from 2019-01-01 --to 2026-10-31 \
  --split 2024-11-01            # everything from here on is out-of-sample
  --exit fixed_3_15|staged|literal_premium \
  --account 10000 --position-pct 25 \
  --costs default|zero --variant <name from params.json> \
  --ablate regime|growth|catalyst|rs|volume|group|options \
  --seed 1
```
To test a new idea: add a detector to `setups.mjs` (or a module file under `research/backtest/modules/`),
add its thresholds and at most 12 variants to `params.json`, commit, then run the CLI. The harness
refuses to run a module whose parameters are not committed (it checks `git status` for `params.json`).
- Accept: a hand-built five-trade example reproduces to the cent; running the same command twice gives
  identical output; `DATA_AUDIT.md` written (plan Phase 2).

**WO-03 · Run the backtests and publish verdicts**
- Run order: A1, A2 and the short setups (daily data, 2019 → Oct 2026) → B and C on the underlying
  (minute data, last 2 years) → option expressions and S1–S4 (modelled).
- In-sample first, pick variants, freeze, then out-of-sample once (plan §8.4). Gates: plan §8.6, with
  the drawdown gate measured at the §3 default sizing.
- Write `public/data/strategy-validation.json`: one `Verdict` per module plus `data_quality:
  'real'|'modelled'` and the report path. This file is what the app's validation badges read.
- Accept: `results/FINAL_REPORT.md` follows the plan's §10.2 template; every number in it traces to a
  file under `results/`; a failed module is reported with its numbers.
- **Stop here and report to Ankit** (plan §10). WO-04 onward proceeds for the pieces that came back
  adopt or watch. A rejected piece is not built into the UI as a recommendation.

**WO-04 · Nightly breakout build — `pipeline/build-breakouts.mjs`**
- Implements §6.1; writes `breakouts.json` (§6.4). Reads `strategy-validation.json` for the verdicts.
- Insert into `refresh.sh` after "fundamentals" data is available and before `build-brief.mjs`. Non-fatal
  like its neighbours: on failure keep the previous file.
- Abort guard copied from `build-brief.mjs`: more than half the chart fetches failing → write nothing.
- Accept: run locally in `--quick` mode; pick five candidates and recompute score, pivot, stop and
  target by hand from their bars; all match. No candidate has `stop_fits: true` with a technical stop
  beyond 3%.

**WO-05 · Shadow period (10 sessions, no UI change)**
- `snapshot-predictions.mjs` logs `cmo` records nightly; `grade-predictions.mjs` grades them (§8).
- Old and new run side by side. Nothing new is displayed.
- Accept: 10 sessions logged with no pipeline failure; a short comparison written to the log: how many
  names each system flagged, overlap, and early graded outcomes with counts (no percentages on fewer
  than 30 graded trades).

**WO-06 · Daily Brief hand-over**
- `build-brief.mjs` stops scoring breakouts itself and maps the top 15 shown candidates from
  `breakouts.json` into its existing `breakout_candidates` shape (`score`, `attributes`, `setup`,
  `trigger_price` = entry, `stop_price` = stop, `thesis` = the `why` sentences). Breadth and regime in
  the brief come from the same regime object.
- Accept: `daily-brief.json` validates against the unchanged contract; TradeDesk and TradeDeskV2 both
  render the Brief with no code change; the old scoring block is deleted, not commented out.

**WO-07 · Scanner tab — breakout candidates**
- New primary section in `src/tabs/Scanner.tsx`, above the existing smart-money list:
  - Header strip: regime state in words ("Market: green — full size"), counts, "levels as of <date>".
  - Three groups: **Triggered now** (live only) · **Armed for tomorrow** · **Getting ready**.
  - Filters: Long / Short · grade · setup. Sort: score, distance to pivot, RVOL.
  - Row: ticker, setup in plain words, grade and score, entry / stop / target, size and dollars at risk,
    distance to pivot. Expand: the seven component bars (reuse `HBar` from `Infographics.tsx`), the
    `why` sentences, the risk note, catalyst and growth facts, next earnings date.
  - Validation badge per setup from the verdict: "Backtest: adopted", "Backtest: watch — paper only",
    or "Not yet tested". Tapping it shows trades, win rate **with** payoff, expectancy, test window.
  - `no_fit` rows are shown greyed with "Stop doesn't fit the 3% rule" — not hidden, so the rule is visible.
  - Account size control (default $10,000) stored in `localStorage`; sizes recompute in the browser.
- Types in `src/types.ts`. Styles in a new `src/mockb-breakouts.css`, tokens only.
- Accept: the full verification gate, plus number proof for five rows against `breakouts.json`, plus
  both long and short rows rendered, plus the empty state ("No candidates pass today — market is red").

**WO-08 · Nightly option plan — `pipeline/build-dte-plan.mjs`**
- Implements §7.2. Runs in `refresh.sh` after `build-gex.mjs` and `build-breakouts.mjs`. Non-fatal.
- Accept: noise profile for SPY recomputed by hand for two half-hour marks from the raw bars; matches.

**WO-09 · Live engine in the browser — `src/lib/cmo-live.ts`**
- Vite imports the pure functions straight from `pipeline/lib/cmo/` (add the path alias and a `.d.ts`);
  no second copy of the logic.
- Implements §6.5 and §7.3–7.5; logs to Supabase (§8.1; SQL for the table and its policies goes in
  `supabase/` next to the existing invites table).
- Reuses the existing poll; adds at most one candle request per on-screen ticker per 5 minutes and one
  chain request per active signal per minute. Any proxy failure → fall back to published levels silently,
  as `useSchwabLive` does today.
- Accept: replay test — feed a recorded session of 1-minute candles through the live functions and
  through the backtest engine for the same day; the signals and times are identical.

**WO-10 · Options tab — 0DTE / 1DTE plays**
- New top section in `src/tabs/Options.tsx`:
  - One card per underlying, always visible: state in words ("SPY: no signal — inside the normal range",
    "QQQ: long signal since 10:30"), band levels, VWAP, gamma state, today's events.
  - When a signal is on: the ticket (contract, cost, contracts, most you can lose, target value, exit
    rule), score and component bars, validation badge, and a `modelled` or `real` tag on any
    performance number.
  - Stock plays listed under the index cards, each linking to its Scanner row.
  - Pre-market and after the close: "Plays appear after 9:35 ET"; no stale ticket is ever shown.
    Every card carries its "as of" time and greys out if the last update is older than 3 minutes.
- Lotto section handled per §7.6.
- Accept: verification gate; replay of a recorded session renders the expected cards at three chosen
  times; "no ticket fits" state rendered; signed-out state rendered.

**WO-11 · Performance tab**
- New section "New scoring" reading the `cmo` and `dte` summaries: trades, win rate beside payoff and
  break-even win rate, expectancy in R, by grade, by setup, long vs short, `modelled` vs `real`.
  A grade ladder chart (expectancy by grade) — the visible test of whether the score ranks correctly.
- Existing breakout and lotto sections stay, titled "Previous scoring (retired <date>)", frozen.
- Accept: verification gate; every figure re-derived from `prediction-performance.json`.

**WO-12 · Forward options data (private) and re-validation**
- Separate workflow file with secrets (the main pipeline stays keyless): snapshots Schwab chains for
  SPY, QQQ, XSP and the day's armed names every 5 minutes during the session, into a private store
  (Supabase table or private repo — never this repo). Schwab refresh tokens last about 7 days; the
  workflow fails loudly and the Admin tab shows "Schwab re-login needed" when it expires.
- After 60 sessions: re-run the option modules on real quotes; update `strategy-validation.json`;
  options verdicts may then move from watch to adopt or to reject.
- Accept: 5 consecutive sessions captured with ≥ 95% of expected snapshots; nothing Schwab-sourced in
  the public repo (grep the diff).

**WO-13 · Documentation**
- `DATA_CONTRACTS.md`: add `breakouts.json`, `dte-plan.json`, `strategy-validation.json`, the new
  prediction record types. Reference tab: a plain-language "How the score works" card.
- Accept: a new agent can find every file and field named in this spec from `DATA_CONTRACTS.md` alone.

---

## 10. Dependencies between work orders

```
WO-00 → WO-01 → WO-02 → WO-03 ──(verdicts; report to Ankit)──┬→ WO-04 → WO-05 → WO-06 → WO-07 → WO-11
                                                             └→ WO-08 → WO-09 → WO-10 → WO-11
WO-12 can start any time after WO-00 once the keys exist.   WO-13 runs alongside each UI work order.
```

Needs from Ankit before the marked step:
- Before WO-02's minute-data runs: a free Alpaca key as GitHub secrets `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`.
- Before WO-09: confirm the Schwab proxy may be called for candles and chains at the rates in WO-09.
- Before WO-12: `SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET`, `SCHWAB_REFRESH_TOKEN`, and a private store.

---

## 11. Verification that applies to the whole build

| Risk | Check |
|---|---|
| The score on screen differs from the score that was tested | `params_version` in `breakouts.json` equals the one in `strategy-validation.json`; WO-09 replay test; single library |
| Look-ahead in the nightly build | Every candidate's inputs dated ≤ `bars_as_of`; fundamentals functions tested with a filing dated after `asOf` and shown to ignore it |
| A recommendation with no validation | UI cannot render a candidate without a verdict object; `untested` and `reject` render as "not a recommendation" |
| Stale data shown as live | Every live card has an "as of" time and a staleness rule; signed-out and off-hours states designed, not accidental |
| Win rate shown in isolation | Component-level rule: the win-rate tile takes payoff as a required prop |
| Filler values | Grep outputs for hardcoded defaults; nulls render as "—" |
| Regression in the rest of the app | The gate's regression spot-check from the 2026-11-12 log entry, plus TradeDeskV2 loads |

---

## 12. Reporting back to Ankit

Unchanged from `STRATEGY_PLAN.md` §10, with these fixed checkpoints for this build:

| After | He gets |
|---|---|
| WO-00 | What was corrected in the research; what the Schwab proxy can and cannot do |
| WO-03 | **The backtest verdicts** — one line per setup (adopt / watch / reject), the headline table, and what is being built as a result. This is the main "results" report |
| WO-05 | Old scoring vs new scoring over the 10 shadow sessions |
| WO-07 and WO-10 | The live URL, the version string, what to check on phone and tablet |
| WO-12 (+60 sessions) | Options re-tested on real prices; any verdict that changed |

---

## 13. Open questions (defaults are used until answered; none blocks WO-00 to WO-03)

| # | Question | Default |
|---|---|---|
| O1 | For 0DTE/1DTE options, is "3% loss / 15% gain" meant as **$300 at risk, $1,500 target** (3% and 15% of the account)? A 3% stop on the option's own price is not workable | Yes; the literal version is back-tested as a comparison |
| O2 | How much of the $10,000 goes into one share position? | 25% ($2,500), at most four positions |
| O3 | Which contracts do you actually want tickets for — SPY / QQQ, XSP, micro futures options (MES / MNQ), or SPX / ES spreads? | SPY, QQQ and XSP; ES / NQ levels shown for reference |
| O4 | Where should private Schwab snapshots live? | A Supabase table in the project the app already uses |
