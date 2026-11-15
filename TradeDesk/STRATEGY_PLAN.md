# TradeDesk Strategy Plan — "Catalyst Momentum Outlier" (CMO)

**Status:** PLAN ONLY. Nothing here has been built, run, or backtested. No performance number in this
file is a result of ours — every figure is a published claim by someone else, labelled with its source.
**Written:** 2026-11-15 · **Owner:** Ankit · **Audience:** any AI agent or person who will execute it.
**Standing rules that bind this plan** (from `AGENTLOG.md` Decisions): research/education only, never
financial advice · backtest-before-adopt · free data sources only (one exception is proposed in §7.3 and
needs Ankit's yes) · he trades ES/NQ futures options and SPX options, 0DTE/1DTE.

---

## 0. How to use this file (executor instructions)

1. Read `AGENTS.md`, then `TradeDesk/AGENTLOG.md`, then this file top to bottom.
2. Execute the phases in §9 in order. Each phase has an output and an acceptance check. Do not start a
   phase until the previous one passes its check.
3. Every rule in §4–§6 is a **hypothesis to test**, not a setting to tune until it looks good. The
   pass/fail gates in §8.6 are fixed before the first backtest run. Do not change them after seeing results.
4. Report back exactly as §10 describes — including when the answer is "it failed".
5. This repo is public: API keys go in environment variables / GitHub secrets, never in a file.

**Ankit's answers (2026-11-15) are recorded in §11 and override anything older in this file.** In short:
options are 0DTE and 1DTE only; long and short are both in scope; account is $10,000 with a 3% loss / 15%
gain rule; data comes from his Schwab API and Yahoo, plus one free intraday source.

---

## 1. The honest starting point

Three facts shape everything below. They are the reason the plan looks the way it does.

1. **Win rate alone is the wrong target.** A strategy makes money when
   `win rate × average win > loss rate × average loss`. The break-even win rate is `1 / (1 + payoff ratio)`:
   at a 3:1 payoff you break even at 25% wins; at a 1:3 payoff you need 75%. The documented top growth and
   swing traders (§2) mostly win 30–55% of trades and make their money on the size of the winners.
   Strategies with 70–90% win rates exist (mean reversion, selling option premium) but they pay for it with
   rare large losses. The plan therefore optimises **expectancy per trade in R** (R = the amount risked) and
   reports win rate next to payoff ratio, never by itself. Two high-win-rate strategies are included as
   challengers (§6.4) so the backtest, not opinion, settles whether they belong.
2. **Most day traders and most retail 0DTE buyers lose.** Brazil day-trader study (Chague, De-Losso,
   Giovannetti): about 97% of people who day traded for 300+ days lost money. Taiwan (Barber, Lee, Liu,
   Odean): fewer than 1% were predictably profitable. Beckmeyer, Branger and Gayda (2023): retail traders
   lost on SPX 0DTE in aggregate, and most of the loss was transaction costs. Any day-trading or 0DTE rule
   in this plan has to clear costs in the backtest or it is dropped.
3. **TradeDesk's current breakout calls have an upside-down risk shape.** The 2026-11-14 log entry records
   a median trigger 1.4% above price and a median stop 13.5% below. A strategy with that shape needs a
   very high win rate just to break even. The strategy below fixes this by construction: stops are
   set from the day's low or one ATR, and targets are measured in multiples of that risk.

---

## 2. Who was studied, and how much their record can be trusted

**Evidence grades.** A = audited or independently verified (competition standings, academic paper with
reproducible method). B = documented by a credible third party (books with interviews, press with
records). C = self-reported; plausible and widely followed, but not independently verified.
**Excluded:** anyone whose record is only screenshots, course marketing, or follower counts.

### 2.1 Growth / swing (the long-standing names)

| Trader | Record | Grade | What their method contributes |
|---|---|---|---|
| William O'Neil (d. 2023) | Founder of IBD; CAN SLIM built from a study of past winning stocks | B | Earnings + sales growth, new highs from sound bases, market direction first, cut losses at 7–8% |
| Mark Minervini | US Investing Championship (USIC) winner 1997 (+155%) and 2021 (+334.8%, $1M+ stock division) | A | Trend Template, volatility contraction pattern (VCP), tight stops, progressive exposure |
| David Ryan | USIC winner three years running, 1985–87; O'Neil protégé | A | Earnings leaders, tight bases, relative strength line |
| Dan Zanger | About $11K to $18M in roughly 18 months, 1998–2000, reported by Fortune from account records | B | Chart-pattern breakouts on high-volume leaders |
| Stan Weinstein | *Secrets for Profiting in Bull and Bear Markets* (1988) | B | Stage analysis — only buy Stage 2 |
| Linda Raschke | *New Market Wizards*; decades of professional short-term trading | B | Short-term pattern playbook, pullbacks in trends |
| Larry Connors | Published, rule-exact backtests (RSI-2 pullbacks) | A− (rules reproducible; results in-sample) | High-win-rate mean reversion in an uptrend |
| Toby Crabel | *Day Trading with Short Term Price Patterns and Opening Range Breakout* (1990) | B | Opening range breakout, narrow-range days before expansion |

### 2.2 Prominent in the last 5–7 years (real people, checkable results)

| Trader | Record | Grade | What their method contributes |
|---|---|---|---|
| Kristjan Kullamägi ("Qullamaggie") | Reports growing a few thousand dollars to roughly $100M; streams and trade logs public, account not audited | C+ | Three setups: breakout from a flag, episodic pivot (EP), parabolic short. Stop at low of day, capped at 1 ATR. Sell part after 3–5 days, trail the rest on the 10/20-day average |
| Pradeep Bonde ("Stockbee") | Long-running public blog; mentor to Kullamägi | C | Episodic pivots, momentum bursts, market breadth monitor |
| Oliver Kell | USIC winner 2020 (+941%) | A | "Cycle of price action", EP-style entries, earnings leaders |
| Leif Soreide | USIC winner 2019 | A | High-tight-flag breakouts |
| Mark Ritchie II | Minervini-circle trader with published performance | B | Risk-first position management |
| Law Wai-Sum ("J Law") | USIC $1M+ stock division winner 2024 (+353.9%) and 2025 (+252.3%) | A | Method to be documented in Phase 0 — not yet researched |
| Tanmay Khandelwal | USIC $1M+ stock division winner 2023 (+129%) | A | Method to be documented in Phase 0 |
| Sam Bhatia | USIC $1M+ stock division winner 2022 (+13.5% in a bear year) | A | Evidence for the regime gate: in 2022 the best verified stock trader made 13.5% |
| Brian Shannon | *Maximum Trading Gains with Anchored VWAP* (2023) | B | Anchored VWAP from earnings/gap day as the line buyers defend |
| Richard Moglen / TraderLion | Interviews and documents USIC traders' rules | B (as a source) | Source material for rule extraction, not a track record |

### 2.3 Day trading

| Trader | Record | Grade | What their method contributes |
|---|---|---|---|
| Carlo Zarattini, Andrea Barbon, Andrew Aziz | Peer-circulated papers with exact rules; independently re-run on QuantConnect | A | 5-minute opening range breakout on "Stocks in Play" (paper: 2016–2023, Sharpe 2.81 claimed; independent re-runs got about 2.2–2.4). Also the SPY intraday-momentum "noise band" strategy |
| Mike Bellafiore / SMB Capital | Working prop firm; *One Good Trade*, *The Playbook* | B | "Stocks in Play", playbook-per-setup discipline |
| Lance Breitstein | Former Trillium trader, reported by the firm as a top performer | B− | Capitulation / "right side of the V" reversals |
| Ross Cameron | Posts broker statements; **but** his firm Warrior Trading settled with the FTC in 2022 ($3M) over misleading earnings claims to students | C | Low-float gap-and-go. Treated as an idea source only, with heavy scepticism |

### 2.4 Options, 0DTE and positioning

| Source | Record | Grade | What it contributes |
|---|---|---|---|
| Cboe research | Exchange data: 0DTE was about 59% of SPX options volume in 2025 | A | Market structure facts; liquidity is not the constraint |
| Beckmeyer, Branger, Gayda (2023) | Academic paper on retail SPX 0DTE | A | Retail loses in aggregate, mostly to costs → trade rarely, defined risk, count costs |
| Gao, Han, Li, Zhou (2018); Baltussen, Da, Lammers, Martens (2021) | Journal papers | A | Intraday momentum exists and is stronger when dealers are short gamma |
| Euan Sinclair | *Volatility Trading*, *Positional Option Trading* | B | Only trade options when you have a view on volatility as well as direction |
| Tom Sosnoff / tastytrade research | Large body of published short-premium studies | B | The high-win-rate premium-selling case (challenger in §6.4) |
| Brent Kochuba (SpotGamma), Cem Karsan | Dealer-positioning frameworks, widely used; not audited P&L | C | Gamma exposure, gamma flip, vanna/charm flows as context — TradeDesk already builds GEX |
| Pan & Poteshman (2006); Johnson & So (2012); Cremers & Weinbaum (2010) | Journal papers | A | Options flow does carry information about the stock's next move, but the strongest signal came from non-public data. Public "unusual activity" is a weak signal to be tested, not trusted |

### 2.5 What was verified while writing this plan, and what was not

- **Checked by web search on 2026-11-15:** USIC winners and returns 2021–2025; the ORB paper's period,
  claimed Sharpe and the lower independent re-runs; the Beckmeyer 0DTE findings; Cboe's 2025 0DTE share.
- **From memory, not re-checked:** every other row above, including all rule details attributed to
  individual traders. Phase 0 (§9) verifies each against a primary source before any rule is coded.

---

## 3. The debate

The "speakers" below are **positions built from each camp's published work**, not quotations. The point is
to make the disagreements explicit and record how each was settled.

**Round 1 — Where does the edge come from?**
- *Growth camp (O'Neil, Minervini, Ryan):* from owning the few true leaders — strong earnings, strong
  price, bought as they leave a tight base in a healthy market.
- *Momentum-burst camp (Kullamägi, Bonde, Kell):* agree on leaders, but the best entries are the days a
  stock is repriced — a gap on a surprise — and the first 3–5 days after.
- *Quant day-trading camp (Zarattini/Aziz, Bellafiore):* the edge is attention. Stocks with abnormal
  opening volume trend intraday; everything else is noise.
- *Options camp (Sinclair, Cboe research):* direction is not enough for options; you also need the option
  to be fairly priced, and costs kill frequent traders.
- **Settled:** all four describe the same event from different distances — **a liquid stock getting
  repriced by a catalyst, visible as abnormal volume and range expansion out of quiet trading.** That is
  the single thesis. The camps differ only in holding period.

**Round 2 — Win rate or payoff?**
- *Connors / tastytrade:* high win rate is achievable and keeps traders in the game.
- *Minervini / Kullamägi:* high win rate strategies hide the tail. Keep losses small, let winners run.
- **Settled:** primary objective is expectancy in R with a hard cap on loss per trade. High-win-rate
  variants are tested as challengers under the same gates. Whichever passes, passes.

**Round 3 — Do fundamentals matter for a trade that lasts days?**
- *O'Neil / Ryan:* yes — earnings growth is what brings institutions in.
- *Kullamägi:* for a breakout, barely; for an episodic pivot, the surprise is the whole trade.
- *Academics:* post-earnings drift (Bernard & Thomas) is one of the most replicated effects in finance.
- **Settled:** fundamentals enter in two places — as the **catalyst** (size of the surprise) and as a
  **quality filter** (growth, acceleration). They are scored, not required, except for the catalyst setup.
  The backtest runs with and without them to show what they add.

**Round 4 — How to "find it before it moves"?**
- *Minervini:* you cannot predict the day; you can list the stocks that are coiled and ready.
- *Flow camp:* unusual short-dated call buying sometimes leads.
- *Academics:* the public flow signal is weak; earnings dates and tightness are observable and honest.
- **Settled:** a **readiness watchlist** (coiled leaders with a dated catalyst ahead) plus a
  **trigger** (the move starting on volume). The watchlist's lead value is itself measured: of names
  flagged, what share moved +2 ATR within 5 days, versus the base rate for the universe.

**Round 5 — 0DTE: buy or sell?**
- *tastytrade camp:* sell premium, win often.
- *Beckmeyer et al.:* retail loses either way, mainly to costs.
- *Intraday-momentum papers:* index trend days are identifiable after the open, more so in negative gamma.
- **Settled:** primary 0DTE/1DTE rule is **directional, defined-risk, few trades** (debit spread or single
  long option sized as the full loss). Premium selling is a challenger with a defined-risk structure only.

**Verdict — one strategy:** trade **catalyst-driven range expansion in liquid leaders, only when the
market regime allows, with risk fixed before entry**; use one scoring system to rank candidates; express
the same signal at three speeds (swing core, intraday trigger, short-dated options overlay).

---

## 4. The strategy — elements to consider

Long and short are both in scope (Decision D3). Each short rule is the mirror of its long rule and is
listed in §6.6. Long and short results are always reported separately.

### 4.1 Element 1 — Market regime gate (applies to every module)

| State | Rule (daily close) | Effect |
|---|---|---|
| Green | SPY > 50-day SMA **and** 21-day EMA > 50-day SMA **and** share of universe above its 50-day SMA ≥ 50% | Full size |
| Yellow | Neither Green nor Red | Half size, A-grade setups only |
| Red | SPY < 200-day SMA **or** breadth < 30% | No new swing longs; swing shorts allowed at full size. Day and index modules still run and are reported separately |

Also recorded daily as context, not as gates: VIX level, VIX1D, QQQ vs its 50-day, the gamma-flip state
from the existing `build-gex.mjs`.

### 4.2 Element 2 — Universe and liquidity

US-listed common stocks and ADRs; price ≥ $10; 20-day average dollar volume ≥ $20M; average daily range
(ADR%, 20-day) ≥ 3%. For options modules: weekly options listed and ATM bid-ask spread ≤ 10% of mid.

### 4.3 Element 3 — Technical analysis inputs

| Input | Definition | Used for |
|---|---|---|
| Trend Template | Close > 50 > 150 > 200-day SMA; 200-day rising ≥ 20 sessions; close ≥ 30% above 52-week low and within 25% of 52-week high | Filter for setup A2 |
| Relative strength (RS) | Weighted return: 40% last 63 sessions + 20% each for the three prior 63-session blocks; percentile rank within universe | Score; A2 needs RS ≥ 80 |
| RS line | Stock ÷ SPY; flag when it makes a 52-week high before price does | Readiness score |
| Prior move | Largest rise over any 21–63 session window in the last 63 sessions ≥ 30% | A2 requirement |
| Contraction | Base length 10–40 sessions; depth ≤ 25%; 5-day ATR ≤ 70% of 20-day ATR; 5-day average volume ≤ 70% of 50-day | A2 requirement |
| Moving-average surf | Lows holding the rising 10- or 20-day EMA | Score; exits |
| Gap % and gap quality | Open vs prior close; close in top 25% of day's range | A1 requirement |
| Relative volume (RVOL) | Day volume ÷ 50-day average; opening 5-minute volume ÷ 14-day average of the same bar | A1, Module B |
| Opening range | High/low of first 5 minutes (15 as a variant) | Entry trigger and stop |
| VWAP / anchored VWAP | Session VWAP; AVWAP anchored to the gap day | Intraday exit; swing support check |
| ATR(14), ADR%(20) | Standard | Stops, sizing, extension checks |
| Sector/theme strength | Median RS of the stock's industry group, ranked | Score |

### 4.4 Element 4 — Fundamental analysis inputs

All must be **point-in-time**: a number may be used only from the date it was filed or announced.

| Input | Definition | Source (free) |
|---|---|---|
| EPS surprise | (Actual − consensus) ÷ abs(consensus) | Nasdaq earnings API (already used by `fetch-earnings.mjs`) |
| Standardised surprise (SUE) fallback | (EPS − EPS four quarters ago) ÷ std dev of that change over 8 quarters | SEC EDGAR companyfacts, keyed by `filed` date |
| Quarterly EPS growth YoY | ≥ 25% scores; ≥ 50% scores higher | SEC companyfacts |
| Quarterly sales growth YoY | ≥ 20% scores; acceleration over 3 quarters scores higher | SEC companyfacts |
| Margin trend | Operating margin vs same quarter last year | SEC companyfacts |
| Guidance / major news | Raised guidance, contract, approval — tagged from headlines | Existing news pipeline; manual tag list in backtest |
| Earnings date ahead | Next report within 10 sessions | Nasdaq calendar |
| Insider cluster buying | ≥ 2 open-market buys (code P) in 30 days | Existing `fetch-insiders.mjs` |
| Short interest ÷ float | Bi-monthly FINRA figure | FINRA |
| Float and market cap | Smaller float moves further; cap ≥ $300M | SEC / Yahoo |

### 4.5 Element 5 — Risk and position management (applies to every module)

- Account: $10,000 (Decision D4). Ankit's rule: **3% loss, 15% gain** — a 5-to-1 payoff, which breaks
  even at a 16.7% win rate. Two readings are both run and reported side by side until he picks one:
  - **Reading 1 (account risk):** each trade risks 3% of the account ($300) and targets 5R ($1,500).
    Position size = $300 ÷ stop distance. This works for stocks and options alike.
  - **Reading 2 (price move):** stock stop 3% below entry, target 15% above. Not usable for options,
    where a 3% move in premium is noise; options fall back to Reading 1.
- The 15% / 5R target replaces "sell half at +2R" as the primary exit. The original staged exit stays in
  the variant list for comparison, because a fixed 5R target will be reached on a minority of trades.
- Every result is also shown at 1% risk per trade. At 3%, ten losses in a row is a 26% drawdown, and
  ten-loss streaks are normal for a strategy that wins 30–40% of the time.
- Small-account constraints to verify in Phase 0 and model in the engine: the pattern-day-trader rule
  for margin accounts under $25,000 (check its current status — changes were proposed in 2025; futures
  options on ES/NQ are outside it), whole-share and whole-contract sizing, and the fact that $300 of risk
  buys one SPX spread at most. Module B is cut from the paper's 20 names a day to the top 3 by score.
- Reject any stock trade whose stop is further than 1.0 × ATR(14) or 8% from entry.
- Max single position 20% of equity; max total open risk 5% of equity; max 2 positions per industry group.
- Day modules: stop trading for the day at −2R; max 3 index option trades per day.
- Options: the premium paid is the risk — at most $300 per trade (3% of the account).
- Progressive exposure: after 3 consecutive losses, halve size until 2 winners in a row.

---

## 5. The rating system

One score per candidate, 0–100, computed the same way for every module. The weights are a **starting
hypothesis**. They are frozen before the backtest and judged afterwards by one test: do higher scores
produce higher expectancy (§8.5, monotonicity)?

| Element | Points | 0 | Half | Full |
|---|---|---|---|---|
| **Regime** | gate | Red → no swing trade | Yellow → size halved | Green |
| **Setup quality** (technical) | 30 | Trigger only | Requirements met | Requirements met + base ≥ 15 sessions + contraction ≤ 50% + surfing 10-day EMA |
| **Catalyst** (fundamental event) | 20 | None | Earnings beat < 10% or soft news | Surprise ≥ 15% with raised guidance, or hard news; gap ≥ 8% |
| **Growth quality** (fundamental trend) | 10 | EPS and sales growth both < 10% | One of EPS ≥ 25% / sales ≥ 20% | Both, and accelerating |
| **Relative strength** | 15 | RS < 70 | RS 70–89 | RS ≥ 90 and RS line at new high |
| **Volume / attention** | 15 | RVOL < 1.5 | RVOL 1.5–3 | RVOL ≥ 3 or opening-bar RVOL ≥ 5 |
| **Group strength** | 5 | Group below median | Top half | Top 20% |
| **Options & positioning** | 5 | Nothing unusual / wide spreads | Call volume ≥ 3× its 20-day average | That, plus volume > open interest in 0–1 DTE options in the trade's direction, plus insider cluster |

**Grades:** A+ ≥ 85 · A 75–84 · B 60–74 · C < 60. Trade A+/A in Green and Yellow, B in Green only, C never.

**Readiness score (the "before it moves" list), 0–100, separate from the trade score:**
contraction tightness 30 · RS and RS-line high 25 · distance to pivot ≤ 3% 15 · dated catalyst within 10
sessions 15 · growth quality 10 · options/insider activity 5. Names ≥ 70 go on the watchlist. A watchlist
name is not a trade until a trigger in §6 fires.

---

## 6. The modules — exact rules to code

### 6.1 Module A — Swing core (2 to 30 sessions)

**A1 · Episodic pivot (catalyst gap)**
- Setup: gap up ≥ 8% at the open on earnings, guidance or hard news; day RVOL ≥ 2 (in live use: opening
  volume on pace for it); stock was **not** already up > 50% in the prior 63 sessions.
- Entry (intraday data): buy stop above the 5-minute opening range high.
  Entry (daily-only fallback, tested separately): buy the next session on a move above the gap-day high.
- Stop: low of the gap day (intraday: opening-range low), subject to the §4.5 caps. If capped out, skip.
- Exit: sell half at +2R or on session 5, whichever first; move stop to break-even; trail the rest on a
  close below the 10-day EMA (variant: 20-day). Hard time stop: session 30.

**A2 · Contraction breakout**
- Setup: Trend Template true; RS ≥ 80; prior move ≥ 30%; contraction rules in §4.3 all true.
- Pivot: highest high of the base. Entry: buy stop 0.1% above pivot, valid only if volume is on pace for
  ≥ 1.5 × the 50-day average and price is not already > 0.7 ATR above the pivot.
- Stop: low of the breakout day, subject to the §4.5 caps.
- Exit: same as A1. Earnings rule: exit before a scheduled report unless open profit ≥ 2R.

### 6.2 Module B — Day trade trigger (same day)

5-minute opening range breakout on Stocks in Play, as specified by Zarattini, Barbon and Aziz. Confirm
every parameter against the paper PDF in Phase 0; the values below are from memory of it.
- Universe each morning: price > $5, 14-day average volume ≥ 1M shares, ATR(14) > $0.50, opening
  5-minute RVOL ≥ 1; take the top 20 by opening RVOL.
- Direction: first 5-minute bar up → long via buy stop at its high; first bar down → short via sell stop
  at its low.
- Stop: 10% of ATR(14) from entry. Exit: stop, the 5R target, or the close. Risk per §4.5.
- TradeDesk variant to test against the paper's rules: restrict to names with trade score ≥ 75.

### 6.3 Module C — Index 0DTE / 1DTE (SPX, ES, NQ)

Signal: intraday momentum "noise band" from Zarattini, Aziz and Barbon's SPY paper (verify in Phase 0).
- For each half-hour mark, noise = the 14-session average of abs(price at that time ÷ that day's open − 1).
  Upper band = max(today's open, prior close) × (1 + noise); lower band mirrors it.
- Long signal when price is above the upper band at a half-hour mark; short when below the lower band.
  Exit when price crosses back through the band or session VWAP, or at 15:55 ET.
- Context filter to test: take signals only when the gamma state from `build-gex.mjs` is negative
  (dealers short gamma), per Baltussen et al.
- Event filter to test: skip or isolate FOMC, CPI and jobs-report days.

Expression — tested three ways and reported side by side:
1. Underlying only (SPY / ES proxy). This is the benchmark: if the signal fails here, stop.
2. 0DTE debit vertical: buy the ~50-delta option, sell the ~25-delta option, same expiry.
3. 0DTE single long option at ~40–50 delta.
1DTE variant: same signal fired in the final 30 minutes, held to the next open, 1DTE debit vertical.

### 6.4 Challengers (tested under the same gates; adopted only if they pass)

- **H1 · Connors RSI-2 pullback (high win rate, swing):** stock or ETF above its 200-day SMA; RSI(2) < 10;
  buy the close; sell on a close above the 5-day SMA. Add a 2 × ATR catastrophic stop as a variant.
- **H2 · 0DTE defined-risk premium sale (high win rate, index):** iron condor, short strikes at ~10 delta,
  wings 25–50 points wide, opened 10:00 ET, closed at 50% of credit, 2× credit loss, or 15:45 ET.

### 6.5 Module D — Single-stock options overlay (0DTE and 1DTE only — Decision D1)

Not a separate signal. When a Module B day-trade trigger or an A1 gap-day trigger scores A+ **and** the
stock has an option expiring that day or the next session **and** it passes the options liquidity rule:
buy a single option at ~50 delta (call for long, put for short), premium ≤ $300, exit at the 5R target,
at a 50% loss of premium, or 15 minutes before the close (0DTE) / at the next open (1DTE).
Most single stocks only have a 0/1DTE option on Thursdays and Fridays; Phase 0 lists which names have
more frequent expiries. No single-stock option is held longer than one session. Swing trades (Module A)
are therefore held in shares, not options.

### 6.6 Short side (Decision D3)

- **A1-S · Negative episodic pivot:** gap down ≥ 8% on a miss or guidance cut, RVOL ≥ 2; sell short below
  the 5-minute opening range low; stop at the gap-day high; same exits mirrored.
- **A2-S · Breakdown:** close < 50 < 150 < 200-day SMA, RS ≤ 20, a 10–40 session bear flag that tightens
  under a falling 10/20-day EMA; sell short below the flag low; stop at the breakdown-day high.
- **A3-S · Parabolic short (Kullamägi's third setup):** up ≥ 50% in 5 sessions (large caps) or ≥ 100%
  (small caps), 3+ consecutive up days; short the first break of the opening range low; stop at the
  day's high; cover at the 10- and 20-day averages.
- **B and C** already trade both directions.
- Short-specific costs and limits in the engine: borrow fee (flat 3% a year placeholder; hard-to-borrow
  names excluded when short interest ÷ float > 20%), no shorting under $10, uptick-rule days excluded.

---

## 7. Data plan

### 7.1 What is needed

| Data | Span | Free source | Known weakness |
|---|---|---|---|
| Daily OHLCV, adjusted, US stocks | 2019-01 → present | Yahoo chart endpoint (already used), Stooq as cross-check | Delisted names missing → survivorship bias |
| Historical index membership | 2019 → present | Wikipedia S&P 500 / Nasdaq-100 change tables; iShares Russell holdings (already used) | Small caps outside indexes not covered |
| 1- and 5-minute bars, stocks and SPY/QQQ | ≥ 2 years (2024-11 → 2026-11 minimum) | **Alpaca free historical bars** (recommended addition — free key, minute history back years). Schwab and Yahoo are not enough here: Schwab's price-history endpoint returns only a limited recent window of minute bars and Yahoo gives about 30 days of 1-minute and 60 days of 5-minute data (confirm both limits in Phase 2) | Rate limits; needs a free API key in an env var |
| $SPX / futures intraday | same | Schwab price history for the recent window; SPY and QQQ from Alpaca as the 2-year proxy | ES/NQ history is proxied, not real futures bars |
| Earnings dates, time of day, actual vs estimate | 2019 → present | Nasdaq API; SEC 8-K timestamps as cross-check | Before/after-market flag must be right or the gap day is wrong |
| Fundamentals, point-in-time | 2018 → present | SEC EDGAR companyfacts (`filed` date) | Tag inconsistencies between companies |
| VIX, VIX1D, put/call | 2019 → present (VIX1D from 2023) | Cboe free downloads | — |
| Insider filings, short interest | 2019 → present | SEC EDGAR, FINRA | Short interest is twice a month |
| Option prices, intraday, SPX + single names | ≥ 2 years | **No free source of history.** Schwab's option-chain endpoint gives live chains only | See 7.3 |
| Option chains going forward | from now | **Schwab option chains**, snapshotted every 5 minutes during the session for SPX, SPY, QQQ and the day's Module B names | Starts empty; becomes the real-price test set over time |

### 7.2 Minimum test window

- Swing (A, H1, readiness list): **2019-01-01 → 2026-10-31**, daily data. Covers the 2020 crash, the 2022
  bear market and the 2023–2025 advance. That is nearly eight years against the two-year minimum.
- Intraday (B, C, intraday entries for A1): **at least 2024-11-01 → 2026-10-31**; extend back as far as
  the free intraday source allows.
- Options (C expressions, D, H2): same two years.

### 7.3 The options-data problem and the one decision it needs

Free historical intraday option quotes of usable quality do not exist. Two tiers:
- **Tier 1 (free, default):** price every option with Black-Scholes from the underlying's minute bars and
  an implied volatility taken from VIX1D (index) or 30-day realised volatility × a fixed markup (stocks),
  then charge a spread cost (§8.3). TradeDesk's lotto grading already works this way. Results are labelled
  **"modelled"** everywhere and are good enough to reject a bad idea, not to approve a good one.
- **Tier 1b (free, real prices, forward only):** start the Schwab chain snapshots in Phase 2. After 60
  trading days there are enough real quotes to check the Tier 1 model: compare modelled and real fills on
  the same signals and report the gap. This is how an options module can move from "Watch" to "Adopt"
  without paid data.
- **Tier 2 (paid, not approved — listed for completeness):** one or two months of a
  historical options data subscription (ThetaData was listed at roughly $40–$80 a month in 2026
  comparisons; check the vendor's own pricing page) to download two years of SPX and single-name quotes
  once, then cancel. Only worth doing for expressions that pass on Tier 1.

### 7.4 Bias controls (each is a required check, not advice)

- **Survivorship:** build the universe per date from historical membership lists. State in the report what
  share of names could not be recovered and re-run the headline result on index members only.
- **Look-ahead:** signals use data available at decision time only; fundamentals keyed to `filed` date;
  daily signals trade the next bar unless the rule is intraday.
- **Adjusted prices:** use split-adjusted, dividend-unadjusted prices for signals; verify 10 random
  split events by hand.
- **Data errors:** drop bars with zero volume or a high-low range > 50%; log every drop.

---

## 8. Backtest plan

### 8.1 Build

Python 3.11, pandas, numpy, pyarrow; no backtesting framework (the logic must be readable in one file per
module). Location: `TradeDesk/research/backtest/`. Layout:

```
research/backtest/
  README.md            how to run, data sources, env vars
  config/params.yaml   every threshold in §4–§6, frozen and committed BEFORE the first run
  data/                fetch scripts + cached parquet (cache git-ignored)
  features/            indicators and score (unit-tested against hand-computed cases)
  modules/             a1_ep.py a2_breakout.py b_orb.py c_index_0dte.py d_overlay.py h1_rsi2.py h2_condor.py
  engine/              fills, costs, sizing, portfolio accounting
  eval/                metrics, bootstrap, walk-forward, report builder
  results/<run_id>/    report.md summary.json trades.csv equity.csv charts/
  tests/
```

### 8.2 Execution model

Event-driven, bar by bar. Stop and entry orders fill at the stop price, or at the bar's open if the bar
gaps through it. When a 5-minute bar touches both stop and target, assume the stop was hit first.
Portfolio limits in §4.5 are enforced; when more signals than slots, take the highest score.

### 8.3 Costs (applied to every run; a zero-cost run is shown only as a comparison)

- Stocks: $0.005 per share commission; slippage per side = max(5 basis points, half of a 5 bp spread);
  stop exits pay double slippage.
- Options, Tier 1: 5% of premium per side for SPX, 10% for single stocks, plus $0.65 per contract and
  exchange fees ($1.20 per contract for SPX as a placeholder to confirm).
- Options, Tier 2: buy at mid + 25% of the quoted spread, sell at mid − 25%.

### 8.4 Validation design

- **In-sample:** start → 2024-10-31. Parameter variants in §6 are compared here only.
- **Out-of-sample:** 2024-11-01 → 2026-10-31, run **once** with the frozen choice. This is the result
  that counts, and it is the two-year window the request asked for.
- **Walk-forward** on the swing modules: 3-year train, 1-year test, rolled yearly.
- **Variant budget:** no more than 12 variants per module, all listed in `params.yaml` in advance. Report
  the number tried next to every result.

### 8.5 What gets measured

Per module, per year, per regime state, per score grade:
trade count · win rate · average win and loss in R · payoff ratio · break-even win rate · expectancy (R) ·
profit factor · total return and CAGR · max drawdown and its length · Sharpe and Sortino · exposure ·
longest losing streak · average hold · best and worst trade · share of profit from the top 5% of trades.

Plus five diagnostic tests:
1. **Random-entry benchmark:** same universe, same dates, same exits, random entries (1,000 runs). The
   strategy must beat the 95th percentile.
2. **Ablation:** remove one element at a time (regime gate, fundamentals, RS, volume, options score) and
   report the change. This answers "what does each element add?".
3. **Score monotonicity:** expectancy by grade must rise C → B → A → A+.
4. **Bootstrap:** 10,000 resamples of the trade list → 90% confidence interval on expectancy and drawdown.
5. **Parameter stability:** move each main threshold ±20%; the result must not flip sign.

Readiness watchlist test: share of flagged names that rise ≥ 2 ATR within 5 sessions, against the base
rate for all universe names on the same dates, with a confidence interval.

### 8.6 Pass / fail gates (fixed now)

A module is **adopted** only if, out-of-sample and after costs, all of these hold:

| Gate | Threshold |
|---|---|
| Trades out-of-sample | ≥ 100 (≥ 60 for index options modules) |
| Expectancy | ≥ +0.20 R, and the lower end of the 90% interval > 0 |
| Profit factor | ≥ 1.3 |
| Max drawdown at 1% risk per trade (also reported at 3%) | ≤ 20% |
| Rolling 6-month windows profitable | ≥ 60% |
| Random-entry benchmark | Beats the 95th percentile |
| Parameter stability | Profit factor stays ≥ 1.1 across ±20% |
| In-sample vs out-of-sample | Out-of-sample expectancy ≥ 50% of in-sample |

Outcomes: **Adopt** (all pass) · **Watch** (one miss; paper-trade it forward) · **Reject** (anything
else). Options results on Tier 1 data can reach "Watch" at best.

---

## 9. Execution phases

| Phase | Work | Output | Acceptance check |
|---|---|---|---|
| 0 · Verify the research | Confirm every rule in §2 and §6 against a primary source (book, paper PDF, USIC release, the trader's own published rules). Fill in J Law and Khandelwal. Correct this file where wrong | `research/backtest/SOURCES.md`: rule → source → quote/page → confirmed or corrected | Every coded rule has a source row; corrections logged |
| 1 · Freeze parameters | Write `params.yaml` from §4–§6 including the variant list | Committed `params.yaml` | Commit exists before any backtest code runs |
| 2 · Data | Build fetchers and the per-date universe; run the §7.4 checks | Cached data + `DATA_AUDIT.md` (coverage, gaps, survivorship share, 10 hand-checked splits, 10 hand-checked earnings timestamps) | Audit shows ≥ 95% bar coverage for the universe; gaps listed |
| 3 · Features and score | Indicators, RS rank, trade score, readiness score | Code + unit tests | Tests pass; 5 tickers spot-checked against a charting site |
| 4 · Engine | Fills, costs, sizing, portfolio | Code + tests | A hand-built 5-trade example reproduces to the cent |
| 5 · Swing backtests | A1, A2, H1, readiness test; in-sample variants → freeze → out-of-sample once | `results/<run_id>/` | Report builder runs; gates table filled |
| 6 · Intraday backtests | Module B and Module C on the underlying | Same | Same |
| 7 · Options backtests | C expressions, D, H2 on Tier 1 | Same, labelled "modelled" | Same |
| 8 · Final report | Combine, verdict per module, combined equity curve of adopted modules | `results/FINAL_REPORT.md` + `summary.json` | Every number in the report traces to a file in `results/` |
| 9 · (Only if asked) | Tier 2 options data re-run; wiring adopted modules into the TradeDesk scanner | — | Separate request from Ankit |

Stop rule: if Phase 2 cannot produce clean data for a module, report that the module is untestable on free
data. Do not substitute a weaker test and present it as the real one.

---

## 10. How the results come back

### 10.1 Check-ins (one short message each, no waiting for a reply unless a decision is listed)

| When | Message contains |
|---|---|
| After Phase 0 | Rules corrected, traders added or dropped, anything in this plan that turned out wrong |
| After Phase 2 | Data coverage, what could not be sourced for free, survivorship share |
| After Phase 5 | Swing verdicts with the gates table |
| After Phase 7 | Intraday and options verdicts |
| After Phase 8 | Final report |

### 10.2 The final report — fixed template

1. **Verdict line per module:** Adopt / Watch / Reject, with the gate that decided it.
2. **Headline table** (out-of-sample, after costs): trades · win rate · payoff · break-even win rate ·
   expectancy R · profit factor · max drawdown · CAGR and dollar P&L on $10,000 at 3% and at 1% risk · 90% interval on expectancy.
3. **Same table in-sample**, side by side, with the number of variants tried.
4. **By year and by regime state.**
5. **By score grade** — whether the rating system ranks trades correctly.
6. **Ablation table** — what each technical and fundamental element added.
7. **Readiness watchlist result** — hit rate versus base rate.
8. **Benchmarks:** SPY buy-and-hold, random entry.
9. **What is not proven:** data gaps, modelled option prices, survivorship share, anything skipped.
10. **Ten sample trades** per adopted module (5 winners, 5 losers) with charts, so the rules can be
    eyeballed against real cases.
11. **Recommended next step.**

### 10.3 Where it lives

- Files: `TradeDesk/research/backtest/results/` on the working branch, pushed.
- Log: an `AGENTLOG.md` entry per phase, with `Verified:` stating exactly what was and was not checked.
- Message to Ankit: the verdict lines and the headline table in the chat, with the path to the full report.
- A results view inside the TradeDesk app is **not** part of this plan; ask before building one.

### 10.4 Reporting rules

- A failed module is reported as plainly as a passed one, with its numbers.
- No result is described as proven unless it is out-of-sample, after costs, and on real (not modelled)
  prices.
- Past performance of a backtest does not predict live results; the report says so once, at the top.

---

## 11. Decisions for Ankit (defaults apply if no answer)

| # | Decision | Default used |
|---|---|---|
Answered by Ankit on 2026-11-15:

| # | Decision | Answer |
|---|---|---|
| D1 | Option expiries | 0DTE and 1DTE only. Nothing out to 10 days |
| D2 | Data for testing | His Schwab API and Yahoo. No paid options data |
| D3 | Direction | Long and short |
| D4 | Account and risk | $10,000; 3% loss, 15% gain |
| D5 | API keys | Schwab free tier available; open to adding others suggested here → Alpaca free tier for intraday history |

Still open:

| # | Question | Until answered |
|---|---|---|
| D6 | Does "3% loss / 15% gain" mean 3% of the **account** risked per trade ($300, target $1,500), or a 3% / 15% move in the **trade's price**? | Both readings are run (§4.5) |
| D7 | Keys: Schwab app key, secret and refresh token, plus an Alpaca free key, stored as GitHub secrets (never in a file). Schwab refresh tokens expire after about 7 days, so the forward snapshot job needs a weekly re-login by Ankit | Swing phases run on Yahoo alone; intraday and options phases wait |

---

## 12. Sources checked for this plan (2026-11-15)

- USIC results: [2021 — Minervini](https://www.streetinsider.com/Press+Releases/STOCK+TRADER+WINS+U.S.+INVESTING+CHAMPIONSHIP+A+SECOND+TIME+-+BREAKS+RECORD/19494329.html) ·
  [2022 final standings](https://businesswire.com/news/home/20230125005300/en/United-States-Investing-Championship-2022-Final-Standings) ·
  [2023](https://www.businesswire.com/news/home/20240126217806/en) ·
  [2025 / J Law](https://www.businesswire.com/news/home/20260202090143/en)
- ORB paper: [Zarattini, Barbon, Aziz — A Profitable Day Trading Strategy for the U.S. Equity Market](https://concretumgroup.com/a-profitable-day-trading-strategy-for-the-u-s-equity-market/) ·
  [RePEc listing](https://ideas.repec.org/p/chf/rpseri/rp2498.html) ·
  [QuantConnect re-run](https://www.quantconnect.com/research/18444/opening-range-breakout-for-stocks-in-play/) ·
  [CXO Advisory summary](https://www.cxoadvisory.com/individual-investing/intraday-trading-of-overactive-stocks-via-opening-range-breakout/)
- 0DTE: [Beckmeyer et al. summary](https://www.cxoadvisory.com/individual-investing/retail-0dte-option-trader-performance) ·
  [Bloomberg coverage](https://www.bnnbloomberg.ca/day-traders-lose-358-000-per-day-gambling-on-zero-day-options-1.1910634) ·
  [Cboe 2025 volume release](https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Trading-Volume-for-December-and-Full-Year-2025/default.aspx) ·
  [Cboe — 0DTEs decoded](https://www.cboe.com/insights/posts/0-dt-es-decoded-positioning-trends-and-market-impact)
- Options data vendors (prices unverified, from comparison articles): [Databento OPRA](https://databento.com/options) ·
  [Alpaca historical option data](https://docs.alpaca.markets/us/docs/historical-option-data) ·
  [vendor comparison](https://flashalpha.com/articles/options-data-pricing-comparison-flashalpha-thetadata-polygon-spotgamma-squeezemetrics)
