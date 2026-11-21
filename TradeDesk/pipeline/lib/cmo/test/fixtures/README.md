# Fixtures — real Yahoo bars for the setup-detector tests

Every fixture is real market data from the Yahoo Finance chart API
(`query1.finance.yahoo.com/v8/finance/chart/{TICKER}`, browser UA header,
no crumb). Each file ends on its signal date: `bars` are daily bars ending
at the signal session, and the detector is called at the last index.
Examples must fire; near-misses must return `null` **and** fail exactly one
criterion, verified by `setups.test.mjs` re-computing that criterion from
the bars (see `verifyFailedCheck`).

## Source window

- **Daily bars:** 2 years, 2024-11-21 → 2026-11-20 (501 sessions) for 30
  tickers + SPY. One exception: `A3S-1-example.json` (SMCI 2025-02-10) uses
  5-year bars so the fixture still holds a full 260-bar window (2y and 5y
  SMCI bars verified identical over the overlap).
- **RS basket (30 names)** — `rsPercentile` = `percentileRank` of the
  ticker's `rsRaw` (40% last 63 sessions + 20% each prior three 63-session
  blocks, plan §4.3) within the basket's `rsRaw` values on the signal date:
  NVDA META TSLA PLTR SMCI AVGO MU ARM COIN APP NFLX AMD AMZN MSFT GOOGL
  AAPL GME MSTR DELL NKE INTC LULU CRWD RDDT CVNA DJT UBER SHOP CRM JPM.
  The same `rsMethod` string is recorded in every A2/A2S fixture.
- **Market cap (A3S)** = shares outstanding × close on the signal date
  (estimate only; each fixture's `capNote` states the share count used —
  classification is unambiguous in every case, large by a wide margin).
- **Short windows:** a few fixtures have fewer than 260 bars because the
  signal date is early in the 2y window — A1-3 COIN (117), A1S-3 GME (138),
  A1-1-nm META (171), A1S-3-nm META (235), A2-1-nm MU (257), A3S-2-nm AMD
  (219). All still satisfy their detector's minimum index.

## Setup fixtures (30)

| Setup | Kind | Ticker | Signal date | Bars | Verdict |
|---|---|---|---|---|---|
| A1 | example | META | 2026-01-29 | 260 | Gap +10.27% (≥ 10%), RVOL 3.65× (≥ 2×), prior 63 −10.9% (≤ 50%), closeLoc 0.82 (≥ 0.75) |
| A1 | near-miss | COIN | 2026-02-13 | 260 | Gap only +8.94% vs the 10% bar; rest passes |
| A1 | example | PLTR | 2026-08-04 | 260 | Gap +15.52%, RVOL 4.30×, prior 63 −12.8%, closeLoc 0.91 |
| A1 | near-miss | META | 2025-07-31 | 171 | Close faded to 0.41 of range vs 0.75 bar; rest passes |
| A1 | example | COIN | 2025-05-13 | 117 | Gap +11.82%, RVOL 4.35×, prior 63 −26.1%, closeLoc 0.88 |
| A1 | near-miss | ARM | 2026-05-06 | 260 | Prior 63 +99.8% vs the 50% cap; rest passes |
| A1S | example | SMCI | 2026-03-20 | 260 | Gap −26.86% (≤ −10%), RVOL 7.89×, closeLoc 0.07 (≤ 0.25) |
| A1S | near-miss | NKE | 2025-12-19 | 260 | Gap only −9.8% vs the −10% bar; rest passes |
| A1S | example | RDDT | 2026-10-30 | 260 | Gap −22.65%, RVOL 7.01×, closeLoc 0.19 |
| A1S | near-miss | MU | 2026-06-23 | 260 | RVOL only 1.21× vs the 2× bar; rest passes |
| A1S | example | GME | 2025-06-12 | 138 | Gap −17.44%, RVOL 15.69×, closeLoc 0.22 |
| A1S | near-miss | META | 2025-10-30 | 235 | Close recovered to 0.53 of range vs 0.25 bar; rest passes |
| A2 | example | GOOGL | 2025-12-26 | 260 | Template true, RS 81.7 (≥ 80), prior +32.5%/53 sess, base 21, depth 10.0%, ATR 0.64×, vol 0.69× |
| A2 | near-miss | MU | 2025-12-02 | 257 | Contraction depth 26.1% vs 25% cap; rest passes |
| A2 | example | DELL | 2026-08-27 | 260 | Template true, RS 95, prior +49.0%/63 sess, base 10, depth 17.5%, ATR 0.70×, vol 0.64× |
| A2 | near-miss | DELL | 2026-08-26 | 260 | Contraction base only 9 sessions vs 10 minimum (fires next day) |
| A2 | example | INTC | 2026-02-19 | 260 | Template true, RS 95, prior +32.7%/60 sess, base 19, depth 22.6%, ATR 0.64×, vol 0.69× |
| A2 | near-miss | INTC | 2026-02-18 | 260 | 5-day avg volume 0.75× the 50-day vs 0.70 cap (fires next day) |
| A2S | example | SMCI | 2026-02-23 | 260 | Close < 50 < 150 < 200 SMA, RS 15 (≤ 20), 26-sess flag, tightening 5.59 < 5.89, EMAs falling |
| A2S | near-miss | META | 2026-03-17 | 260 | RS 25 vs the ≤ 20 bar; rest passes |
| A2S | example | COIN | 2026-08-17 | 260 | Close < 50 < 150 < 200 SMA, RS 5, 11-sess flag, tightening 8.10 < 16.29, EMAs falling |
| A2S | near-miss | COIN | 2026-06-23 | 260 | Second-half range $20.17 wider than first-half $17.61 — no tightening; rest passes |
| A2S | example | LULU | 2026-01-20 | 260 | Close < 50 < 150 < 200 SMA, RS 8.3, 40-sess flag, tightening 28.71 < 62.53, EMAs falling |
| A2S | near-miss | SMCI | 2026-04-06 | 260 | Bear flag only 9 sessions vs the 10–40 range; rest passes |
| A3S | example | SMCI | 2025-02-10 | 260 | +58.8% in 5 sessions (≥ 50% large-cap), 5 up days, cap ≈ $25B |
| A3S | near-miss | ARM | 2026-05-26 | 260 | 5-session rise +49.3% vs the 50% bar; 6 up days |
| A3S | example | APP | 2026-11-06 | 260 | +71.2% in 5 sessions, 5 up days, cap ≈ $133B |
| A3S | near-miss | AMD | 2025-10-08 | 219 | 5-session rise +43.6% vs the 50% bar; 3 up days |
| A3S | example | DELL | 2026-05-29 | 260 | +66.5% in 5 sessions, 7 up days, cap ≈ $282B |
| A3S | near-miss | APP | 2026-11-10 | 260 | Rise still +61.1% but up-day streak 0 vs the 3-day minimum |

## Intraday fixtures (3)

- `orb-1m-NVDA-2026-11-20.json` — NVDA regular session 2026-11-20: 391
  one-minute bars 09:30–16:00 ET; opening 5-min range $143.73–$140.55
  (first minute down); day range $124.50–$143.73.
- `orb-1m-APP-2026-11-20.json` — APP regular session 2026-11-20: 391
  one-minute bars 09:30–16:00 ET; opening 5-min range $377.77–$371.00
  (first minute up); day range $346.17–$378.54.
- `noiseband-spy.json` — SPY, 10:00 ET mark, 14 marks 2026-11-03 →
  2026-11-20 (price = 10:00 bar's open, per `noiseBand.mjs`); todayOpen
  $713.56 (2026-11-20), priorClose $715.87 (2026-11-19 daily close);
  implied noise 0.0048.

## Known coverage gaps (not every criterion has a near-miss)

- **A1:** no RVOL-only near-miss exists in the 2y set (189 near-misses:
  161 gap, 27 close-location, 1 prior-63, 0 RVOL — big-gap days always
  print volume).
- **A2:** no RS-, prior-move-, or template-only near-miss in the set
  (41 near-misses, all contraction). When template + prior move pass, RS
  is essentially always ≥ 80.
- **A3S:** no small-cap 300% example anywhere scanned — 0 in the 2y set
  and 0 in a 5y fetch (SMCI/GME/MSTR/PLTR/CVNA/DJT). The closest real
  candidate, GME 2021-01-27 (+788% in 5 sessions, 5 up days), is large-cap
  (≈ $26.4B: $86.88 split-adjusted close × ~304M post-split shares), so
  it fires on the 50% bar, not the 300% bar. The 300% small-cap bar is
  therefore untested on real data; finding one needs a micro-cap universe
  (or the GME Jan 2021 window with a different cap reading).
