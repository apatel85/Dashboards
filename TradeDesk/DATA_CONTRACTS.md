# TradeDesk — Data Contracts

Each tab reads one static JSON file from `public/data/` (served relative to the
Vite base path, i.e. `/Dashboards/TradeDesk/data/<file>` on GitHub Pages).
The scheduled data pipelines overwrite these files; the UI only reads them.
TypeScript interfaces for every shape live in `src/types.ts` — that file is the
single source of truth. This document is the human-readable companion.

Conventions used by all files:

- Dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC strings.
- Money is in USD; prices are numbers, `null` when unavailable (never `0` as a
  stand-in — `0` is a valid price only if the quote really is zero).
- Percentages are plain numbers (`5.2` means 5.2%).
- Scores are 0–100 integers unless noted.

---

## `daily-brief.json` → Daily Brief tab (`DailyBrief`)

Top-level object (not an array):

| Field | Type | Notes |
|---|---|---|
| `brief_date` | string | Trading day the brief covers, `YYYY-MM-DD` |
| `generated_at` | string | ISO timestamp when the pipeline ran |
| `universe` | string | Scan universe label, e.g. `"liquid US equities"` |
| `market_regime` | `"uptrend" \| "downtrend" \| "choppy" \| "unknown"` | Broad-market read |
| `regime_notes` | string | Breadth / VIX context behind the regime call |
| `breakout_candidates` | `BreakoutCandidate[]` | Stocks with 1–2 week breakout potential |
| `dte_focus.zero_dte` | `DtePick[]` | 0DTE focus list |
| `dte_focus.one_dte` | `DtePick[]` | 1DTE focus list |
| `sectors.hot` / `sectors.weak` | `SectorPerf[]` | Hot vs. weak sectors & sub-sectors |
| `rotation_notes` | string | Where capital is flowing in/out |

`BreakoutCandidate`: `ticker`, `name`, `price` (+ `price_ts`), `index_membership`
(`SP500` / `NASDAQ100` / `RUSSELL2000` — a stock may carry several),
`sector`, `subsector`, `setup` (chart pattern name), `trigger_price`,
`stop_price`, `score` (0–100 confluence), `attributes` (which scoring attributes
fired, e.g. `"earnings_acceleration"`), `catalyst` + `catalyst_date`, `thesis`.

`DtePick`: `ticker`, `underlying_price`, `bias` (`long`/`short`/`neutral`),
`thesis`, `key_levels[]`, `iv_rank` (0–100), `expected_move_pct`.

`SectorPerf`: `sector`, `etf` (representative ETF, e.g. `XLK`), `perf_1d_pct`,
`perf_5d_pct`, `perf_1m_pct`, `rel_strength_rank`, `trend` (`up`/`down`/`flat`).

---

## `earnings.json` → Earnings tab (`EarningsEntry[]`)

Rolling earnings calendar, one object per reporting company:

| Field | Type | Notes |
|---|---|---|
| `ticker`, `name` | string | |
| `sector`, `industry` | string | |
| `cap_tier` | `Mega\|Large\|Mid\|Small\|Micro` | By market cap |
| `reporting_date` | string | `YYYY-MM-DD` |
| `report_time` | `BMO\|AMC\|UNKNOWN` | Before-market-open / after-market-close |
| `eps_est` / `eps_actual` | number \| null | |
| `rev_est_b` / `rev_actual_b` | number \| null | Revenue in billions USD |
| `current_price` / `price_ts` | number \| null / string \| null | Latest quote + its timestamp |
| `implied_move_pct` | number \| null | From the options chain, not a sector table |
| `iv_rank` | number \| null | 0–100 |
| `health_score` | number \| null | 0–100 fundamental health |
| `prob_up_pct` | number \| null | Model estimate 0–100 |
| `conviction` | number \| null | 0–100 |
| `streak` | `EarningsQuarter[]` | Last 4 reported quarters, most recent first: `quarter` (e.g. `"Q2 2026"`), `eps_result` / `revenue_result` (`beat\|in-line\|miss`), `surprise_pct` |
| `insider_signal` / `political_signal` | `bullish\|bearish\|neutral` | Insider cluster read / congressional read |
| `news` | `NewsItem[]` | `date`, `headline`, `source`, `sentiment` |

---

## `congress.json` → Congress & Gov tab (`CongressTrade[]`)

Disclosed trades by members of Congress (House/Senate). Disclosures may legally
lag the trade by up to 45 days — this is a slow research feed, never an
intraday signal.

| Field | Type | Notes |
|---|---|---|
| `member` | string | Full name |
| `chamber` | `House\|Senate` | |
| `party`, `state` | string \| null | |
| `committee` | string \| null | Relevant committee, if any |
| `ticker`, `asset_name` | string | |
| `trade_type` | `buy\|sell\|exchange` | |
| `amount_range` | string | Disclosure range, e.g. `"$1,001 - $15,000"` (exact sizes are not disclosed) |
| `amount_mid` | number \| null | Range midpoint in USD, for sorting |
| `tx_date` | string | Actual trade date |
| `disclosed_date` | string | Filing date |
| `lag_days` | number | `disclosed_date − tx_date` |
| `doc_url` | string \| null | Official filing PDF (House Clerk / Senate eFD) |
| `cluster` | boolean | True when 2+ members bought the same ticker in a ~7-day window |

---

## `research.json` → Research tab (`ResearchIdea[]`)

Ranked output of the agentic research flow (technical / fundamental / news /
sentiment analysts → bull-vs-bear debate → scored idea):

| Field | Type | Notes |
|---|---|---|
| `ticker`, `name`, `sector`, `subsector` | string | |
| `index_membership` | `IndexSegment[]` | `SP500` / `NASDAQ100` / `RUSSELL2000` |
| `thesis` | string | One-paragraph bull/bear case |
| `score` | number | 0–100 unified confluence score |
| `score_breakdown` | `ScoreComponent[]` | Per attribute: `attribute`, `weight` (0–1), `score` (0–100), `note` |
| `trend_template_pass` | boolean | Minervini Trend Template |
| `stage` | `Stage 1–4` | Weinstein stage |
| `rs_rank` | number \| null | Relative strength 0–100 |
| `distance_from_52w_high_pct` | number \| null | |
| `insider_clusters` | `InsiderCluster[]` | `insider_role`, `buys_7d`, `total_usd`, `first_time_buyer` |
| `congress_buys` | number | Count of recent member purchases |
| `unusual_options` | boolean | Unusual call volume flag |
| `sentiment` | `bullish\|bearish\|neutral\|mixed` | |
| `quality_gate_pass` | boolean | Pass/fail fundamental quality gate |
| `quality_flags` | string[] | Red flags, e.g. `"receivables growing faster than revenue"` |
| `trigger_price` / `stop_price` | number \| null | |
| `invalidation` | string | What would kill the thesis |
| `analyst_notes` | `AnalystNote[]` | `agent` (e.g. `"bull_researcher"`), `summary`, `stance` |
| `updated_at` | string | ISO timestamp |

---

## Pipeline notes

- Pipelines must write **atomically** (write temp file, then rename) so the UI
  never reads a half-written file.
- On any fetch failure, the pipeline must keep the previous good file and log
  the error — never write placeholder-shaped data with real-looking values.
  Fields that could not be computed stay `null`; hardcoded filler values
  (e.g. `"neutral"`, `0`, `75`) are forbidden in output files.
- `null` prices/dates must surface in the UI as "—", never as `0` or a stale date.
