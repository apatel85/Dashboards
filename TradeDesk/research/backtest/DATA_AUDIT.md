# DATA_AUDIT.md — backtest data audit

Universe: 518 tickers (current S&P 500 + Nasdaq-100 constituents, fetched from Wikipedia). Window: 2019-01-02 → 2026-10-30 (1969 trading sessions).

## Coverage

- Daily bars: 518 tickers + SPY + ^VIX, Yahoo chart v8 (split-adjusted, dividend-unadjusted closes).
- Tickers whose first bar is after the window start: 35 (joined the index, listed, or IPO'd later — they enter the sample only from their first bar).
- Tickers covering < 80% of sessions: 26. Tickers covering ≥ 95%: 487.
- Meta (sector / market cap): 0 file(s) missing; 1 ticker(s) with no sector — group component null for those, A3S uses the strict 300% bar.
- Earnings calendars fetched: 182 gap dates, 21846 rows total.
- Detections: pre-filter hits 85264, detector rejects 33853, illiquid pre-filter hits 49654.
- Scan: 1757 detected, 1683 non-tradeable (3% stop cap / $10 short minimum), 753 regime-excluded, 1197 never triggered, 366 graded.

## Gaps (what is missing, and what it costs)

- **SEC facts (growth / SUE / margin)**: unavailable — SEC_CONTACT_EMAIL is not set, so fetch-sec.mjs refuses loudly. Growth scores 0 for every candidate (10 pts unplayed).
- **Guidance / news**: no source — catalyst is earnings surprise + gap % only.
- **Minute bars**: unavailable — ALPACA_KEY_ID / ALPACA_SECRET_KEY not set. Intraday modules (stock_orb) not run; opening RVOL is null.
- **Historical option chains / IV / gamma**: no free source. S1–S4 and stock_trigger not run; options component is 0 for every candidate (5 pts unplayed).
- **Historical index membership**: incomplete — the universe is today's constituents projected backwards. Survivorship bias: stocks that left the index or died are absent (their losers never enter); stocks that joined later appear from their first bar. The plan §7.4 members-only re-run was NOT done for this run: every module already rejects on sample size, and a members-only subset can only shrink the sample further — the check is moot here (it matters when a headline is adopt/watch, not when it is reject on cases).
- **Tradeable (§4.5)**: reported, not applied as a grading filter (see engine/scan.mjs). Under the library's reading (technical stop ≤ 3% of the entry price) every A1/A1S/A2/A2S detection in 2019–2026 is non-tradeable (gap-day ranges run 5–12%, bases 10–25% deep); only A3S (which does not apply the cap) has tradeable candidates. Whether "3% loss" means stop distance or position risk (size down so the stop risks 3% of capital) needs Ankit's call.
- **Grade compression**: no candidate in any module scores A or A+ (max 70 for A1/A3S; A2 median 28, A2S median 15, all C). Setup "met" caps A1/A1S/A3S at 15/30, growth (10) and options (5) are 0 for every candidate, and the RS component (15) is long-biased — a short scores 0 on it by construction (RS ≤ 20). The A/A+ vs C ranking check is unevaluatable by construction in this run.
- **Market cap**: current (2026), not point-in-time — A3S large/small classification can mislabel a stock that grew across the $10B line during the window.
- **Earnings timing**: Nasdaq `time` is usually "time-not-supplied" on past dates, so a gap day matches a report on that date OR the prior session (BMO vs AMC is not distinguished).

## Hand-checked splits

Checked 10 known split events from public records (Yahoo chart v8 returns no split events via the API, so the cache's `splits` arrays are empty). A split-adjusted series must NOT show the split artifact — a large negative jump near −(1 − 1/ratio) on the split date; a positive jump of any size is fine (a stock can genuinely rally on its split day). Failures: 0.
- NVDA 2024-06-10 10:1 — jump 0.75% → OK
- AAPL 2020-08-31 4:1 — jump 3.39% → OK
- TSLA 2020-08-31 5:1 — jump 12.57% → OK
- AMZN 2022-06-06 20:1 — jump 1.99% → OK
- GOOGL 2022-07-18 20:1 — jump -2.46% → OK
- GOOG 2022-07-18 20:1 — jump -2.53% → OK
- SHOP 2022-06-29 10:1 — jump -5.64% → OK
- AVGO 2024-10-07 10:1 — jump -0.88% → OK
- WMT 2024-02-26 3:1 — jump 1.85% → OK
- CMG 2024-06-26 50:1 — jump 0.3% → OK

## Hand-checked earnings timestamps

- NVDA reported 2024-11-20: found, surprise 11.43%, time time-not-supplied
- AAPL reported 2024-10-31: found, surprise 10.07%, time time-not-supplied
- MSFT reported 2024-10-30: found, surprise 7.14%, time time-not-supplied
- AMZN reported 2024-10-31: found, surprise 25.44%, time time-not-supplied
- META reported 2024-10-30: found, surprise 16.18%, time time-not-supplied

## Fallback distribution (OOS lookups, window 10 tier 1)

- A1: `{"full":0,"no-atr":0,"no-adr":0,"merged-grade":0,"none":40}` (0 OOS cases with a lookup of 42 OOS)

## Cached files used

Full list (names + row counts + sha256 for daily files) is in each module's `summary.json` under `cacheFiles`. Totals:
- Universe: 1 file (518 tickers). Daily: 520 files. Earnings: 182 files (21846 rows).