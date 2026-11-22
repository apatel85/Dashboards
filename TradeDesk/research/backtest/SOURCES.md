# WO-00 Ground Truth — SOURCES.md

**Spec:** TradeDesk scoring revamp, Revision 4 (`TradeDesk/STRATEGY_BUILD_SPEC.md`, main commit `8677464`, 2026-11-20).
**Plan:** `TradeDesk/STRATEGY_PLAN.md` (main, blob `5627b65`, 595 lines).
**Date of this file:** 2026-11-20. **Status:** WO-00 acceptance record. No code was written or changed for WO-00; this file is the only WO-00 output.

## How to read this file

- **CONFIRMED** — checked against the primary source (code on disk, a live file, the regulator's own notice, the vendor's own docs page). The spec's assumption holds.
- **CORRECTED** — the spec or plan said X; reality is Y. Both are stated so Rev 5 can fold the fix in.
- **CANNOT DO** — the proxy, the system, or the terms do not allow it. Anything that needs this must be re-designed, not assumed.
- **OPEN** — could not be settled from here; needs Ankit, a live test, or a login-gated page.
- **UNVERIFIED** — no findable primary source. Secondary summaries may agree, but that does not count as verified. Never build on an unverified rule as if it were checked.

## Method

Four parallel checks, 2026-11-20, all read-only. Coordinator spot-checks (same day, marked **[spot-checked]**): live `.github/workflows/tradedesk-pipeline.yml` read via gh-api (two crons + Quantgress key confirmed); AAPL expiries re-fetched via Yahoo v7 with the crumb flow (Mon/Wed/Fri pattern, 21 expiries confirmed); FINRA Regulatory Notice 26-10 read at finra.org (PDT elimination confirmed); Supabase branching Pro-only corroborated by search (pricing FAQ verbatim quote is check C's).

---

## 1. Workflow folder authority

### CONFIRMED

- **The live folder is `.github/workflows/` in `apatel85/Dashboards`** — 5 files: `dealfinder-refresh.yml`, `etl_refresh.yml`, `tradedesk-pipeline.yml`, `tradedesk-research.yml`, `update-earnings.yml`. Both local copies are stale staging/docs copies, not what runs.
- **Repo `TradeDesk/WORKFLOW/` mirrors local `TradeDesk/WORKFLOW/` exactly** (same sizes/SHAs) — it is a pushed copy of the local staging folder, not the live workflows.
- **`~/workspace/build-tradedesk/workflows/` is the oldest and effectively dead**: only `tradedesk-pipeline.yml` (Oct 15). Nothing references it except `commit.py:76`, which copies it into `TradeDesk/WORKFLOW/` — but the two copies have since diverged, so that copy step has not run (or was bypassed) since the WORKFLOW copy was edited Oct 21.
- **The token constraint holds as written in code**: `push-update.py:5-7` and `commit.py:71-76` both state the token lacks the `workflows` scope (GitHub 403s tree creation otherwise), so workflow files stay under `TradeDesk/WORKFLOW/` for Ankit to install via the web UI. `push-update.py` only ever collects `TradeDesk/` and `commit.py` explicitly excludes `.github/workflows/*.yml` from the tree. The 403 was NOT re-tested (that would require an attempted write, out of scope for a read-only check) — the claim is consistent with the code and with the observed fact that all live workflow edits were committed directly, never via these scripts.

### CORRECTED — local copies vs live (all three files differ)

| File | `workflows/` (Oct 15) | `TradeDesk/WORKFLOW/` (Oct 21) | **Live `.github/workflows/`** |
|---|---|---|---|
| `tradedesk-pipeline.yml` | cron `30 12 * * 1-5` only; narrow `git add TradeDesk/public/data/` + `dist/` | cron `0 5 * * 1-5` only; `git add -A TradeDesk/` + `-f dist/` + `git pull --rebase` | **Two crons: `0 5` and `0 17 * * 1-5`**; env adds `QUANTGRESS_API_KEY`; commit step adds `git add -A TradeDesk/public/data/` + `-f dist/` + `-A TradeDesk/`. Last commit 2026-11-11 `1db247a` "Refactor TradeDesk pipeline workflow configuration" **[spot-checked]** |
| `tradedesk-research.yml` | — (absent) | `max_tickers` default `'12'`; commit does `git add -A TradeDesk/` | Schedule same (`0 3 * * 0,3`); **`max_tickers` default `'4'`**; commit stages only `research.json` + `-f dist/`. Last commit 2026-10-21 `091b047` "Change default max_tickers from 12 to 4" |
| `update-earnings.yml` | — (absent) | Header claims "Repaired 2026-10-15: keyless" — `fetch-earnings-keyless.mjs`, no secrets | **Still FMP-based**: env `FMP_API_KEY`, runs `scripts/fetch-earnings.mjs`, has `force_rebuild` dispatch input, checkout with token, npm cache. Last commit 2026-10-21 `e06981e` "Add git pull command before pushing changes" |

- **Spec correction:** the Rev 4 spec's "one keyless run weekdays 05:00 UTC" is wrong on both counts — live is **two runs (05:00 + 17:00 UTC)** and is **no longer keyless-only** (Quantgress key). Any Rev 4 work that assumes the pipeline is keyless or single-run must be re-based on the live files.
- **Earnings correction:** the "earnings repaired to keyless" story never reached live. The repaired file sits only in `TradeDesk/WORKFLOW/`; the live job still depends on the FMP key that previously went stale.

### OPEN

- **Earnings workflow:** live `update-earnings.yml` still uses the FMP key — Ankit's call whether to install the keyless `TradeDesk/WORKFLOW/update-earnings.yml` via the web UI (per `commit.py:120-124`) or keep FMP.
- **Pipeline double-run + Quantgress:** live runs 05:00 + 17:00 UTC with a Quantgress key — Rev 4 spec must be updated to match; no action needed from Ankit unless he wants the 17:00 run or the key removed.

---

## 2. Schwab proxy capabilities (from callers in code, not memory)

**Location correction:** the Edge Functions are **not** under `TradeDesk/supabase/` (that dir holds only `tradedesk-invites-table.sql`). They live at `~/workspace/build-tradedesk/schwab/functions/` (`schwab-auth-start`, `schwab-oauth-callback`, `schwab-market-data`), with the shared token helper at `schwab/shared/schwab-tokens.ts`.

### CONFIRMED — what the proxy serves

- **Base + auth** (`TradeDesk/src/lib/schwab.ts:11-14`; `schwab-market-data/index.ts` header): `https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/schwab-market-data`. Dual auth — either `x-schwab-proxy-key` (pipeline/verify script only, never from browser) **or** signed-in Supabase user JWT verified via `auth.getUser()`, **plus** the email must have a row in `public.tradedesk_invites` or it is 403. Fails closed 401/403. `verify_jwt` is stated ON for market-data in the header comment.
- **Routes (exactly one selector per call, params pass through)**: `?symbols=` → `/quotes` (1–50 symbols, `MAX_SYMBOLS = 50`); `?chain=` → `/chains`; `?expirations=` → `/expirationchain`; `?history=` → `/pricehistory`; `?movers=` → `/movers/{id}` (defaults `direction=up`, `change=percent`; one bounded retry swapping `$SPX` ↔ `$SPX.X` on HTTP 400); `?markets=` → `/markets`. Chain params passed through: `contractType, strategy, range, strikeCount, interval, strike, fromDate, toDate, volatility, underlyingPrice, interestRate, daysToExpiration, expMonth, includeUnderlyingQuote`. History params: `periodType, period, frequencyType, frequency, startDate, endDate, needExtendedHoursData, needPreviousClose`.
- **Index symbol normalization** (`INDEX_SYMBOL_MAP`): bare `SPX/NDX/RUT/VIX`, `.X` forms, and Yahoo `^SPX/^NDX/^RUT/^VIX` all normalize to `$SPX/$NDX/$RUT/$VIX`. Class shares: `BRK-B` → `BRK/B`, `BF-B` → `BF/B`.
- **Quotes / polling** (`useSchwabLive.ts:64-67`): 60 s poll (`POLL_MS = 60_000`), batches of 50 (`MAX_PER_CALL = 50`), Mon–Fri in any session (pre 04:00–09:30, regular 09:30–16:00, after 16:00–20:00 ET); session from proxy `?markets=equity` (refreshed every 30 min) with local ET-clock fallback. Extended hours uses Schwab `mark` (fallback `lastPrice`); regular uses `lastPrice`; `closePrice` rides along for the gap %. Universe = `quotes.json` keys + Daily Brief breakout candidates, capped at 150 (`quotes.ts: setQuoteUniverse`). Any failure falls back silently to the `quotes.json` pipeline snapshot + CNBC extended-hours batch (`quotes.ts`).
- **Minute candles**: `premarketRange.ts:130-137` — 1-minute, **today only**: explicit epoch-ms `startDate` (00:00 ET) → `endDate` (now), `needExtendedHoursData=true`. Verified 2026-11-11: 149 candles 07:00–09:28 ET for SPY; pre-market prints start ~07:00 ET, not 04:00. A plain `period=1` request returns completed days only (yesterday at 8am). Ranges refresh every 5 min in pre-market, max 20 tickers, 5 at a time.
- **Daily history**: `schwabDeepDive.ts` (`fetchDeepDive`) — 2-year daily (`periodType: 'year', period: '2', frequencyType: 'daily', frequency: '1'`) for the ticker and for SPY (relative strength).
- **Option chains**: `schwabDeepDive.ts` (`fetchDeepDive`) — `?chain=<ticker>` with **only** `strikeCount: '10'` and `includeUnderlyingQuote: 'true'`; no expiry, contract-type, or range filter in code. All expiries are parsed; analysis uses the nearest expiry with DTE ≥ 1 (ATM IV, max pain, call/put walls) and the nearest two expiries for put/call OI and volume ratios. The `?expirations=` route exists in the proxy but **no app code calls it**.
- **Movers**: one caller, `tabs/DailyBrief.tsx:550` — `movers: '$SPX'` (exact string), `direction` up/down, `change: 'percent'`.
- **Auth / refresh** (`schwab-oauth-callback/index.ts`, `schwab-market-data/index.ts`): access tokens live 30 min (`ACCESS_TOKEN_TTL_MS`), refreshed 60 s early; **refresh token dies on a hard 7-day clock** (`REFRESH_TOKEN_TTL_MS = 7d`), expiry stamped at callback time (Schwab returns no refresh expiry). State is single-use, 10-min expiry (`schwab-auth-start/index.ts: STATE_TTL_MS`). Dead refresh (`invalid_client`/`invalid_grant`, or refresh older than 7 days) → HTTP 503 with exactly `{"status":"reauth_needed"}`; one bounded 401 retry with forced refresh. Callback redirects to the live app with `?schwab=connected` or `?schwab=error&reason=<short-code>`; tokens are never returned to the caller.
- **Rate limits in code**: "120 non-order req/min per app" (proxy header comment); 50 symbols max per quotes call; no per-user throttle in code.
- **Futures constraint CONFIRMED**: proxy header comment — "equity/index options only — futures quotes via marketdata return 404." No futures endpoint exists in the proxy.

### CORRECTED — /ES, /NQ, $VIX, $TNX

- **`/ES` and `/NQ`: not requested anywhere in app code.** Zero occurrences in `src/`. The "futures lens" is done with proxies, not futures: `components/Gamma.tsx:138-139,185-186` — "ES via SPX · NQ via QQQ×40", with the note "CME ES/NQ options have no free feed — SPX tracks ES tick-for-tick". The proxy's symbol validator (`/^[A-Z0-9.$^/]+$/`) would *forward* `/ES` (slash allowed), but per the header comment Schwab answers 404 — so even a manual call is expected to fail, not serve data.
- **`$VIX`: quotable in principle, never requested.** Bare `VIX` normalizes to `$VIX` in the proxy, so `?symbols=$VIX` should work — but no caller asks for it. The only `$VIX`/`VIX` references in the app are a glossary definition (`lib/definitions.ts:58`) and a TradingView mapping (`'^VIX': 'CBOE:VIX'`, `components/ui.tsx:101`), neither of which touches Schwab. So: **live-capable, fallback/unused — there is no live VIX feed in the app today.**
- **`$TNX`: not in the proxy's symbol map and never requested.** `TNX`/`$TNX` appears nowhere in `src/`. The proxy would pass `$TNX` through unmodified (valid symbol chars), but whether Schwab's quotes endpoint returns a 10-year-yield quote for it is unverified in code — needs a live test (see OPEN below).
- **`$SPX` is the only index symbol actually used live** (movers + index normalization); `$NDX`/`$RUT` are mappable but have no caller found.

### CANNOT DO (from code alone)

- **Futures and futures-options**: no route, no caller; Schwab market-data returns 404 for futures quotes. Any Rev 4 scoring input needing /ES or /NQ levels must use the SPX/QQQ proxies (as Gamma does) or a non-Schwab source.
- **Deployed `verify_jwt` settings**: no `config.toml` exists under `schwab/`; the ON/OFF states (market-data ON; auth-start/callback OFF per memory) cannot be verified from the local tree — needs a Supabase dashboard check.

### OPEN — needs a live test or Ankit

1. **`$TNX` via proxy**: Ankit (signed in to TradeDesk) opens the app and the parent agent runs a browser check of `https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/schwab-market-data?symbols=$TNX` with his session JWT — expect either a quote or a Schwab error; that settles whether the 10Y yield is available.
2. **`$VIX` live**: same check with `?symbols=$VIX` — code says it should work, but no caller has ever exercised it.
3. **`/ES` 404 confirmation**: same check with `?symbols=/ES` — code comment predicts 404; worth one live confirmation before Rev 4 rules it out definitively.
4. **Housekeeping (not opened)**: `~/workspace/build-tradedesk/schwab/proxy-key.txt` exists by name; its content was not read. Confirm it holds no live key and is not tracked in git.

---

## 3. Non-Friday option expiries in the TradeDesk universe

**Verdict in one line: only 11 of 518 universe stocks have non-Friday expiries, all Mon/Wed/Fri weeklies; the other 507 are Friday-only.**

### Universe — size and source

- **518 unique tickers**, reconstructed with the loader's own logic (`build-brief.mjs` `loadUniverse` / `parseWikiSymbols`): S&P 500 list = 503, Nasdaq-100 list = 101, overlap leaves 518. No static universe file exists in the pipeline; the loader fetches Wikipedia on every run. The Nov 14 live brief recorded 517 scanned — one-ticker drift since, from index changes.
- 15 names are Nasdaq-100-only (not in S&P 500): ALNY, ARM, ASML, ALAB, CCEP, CRWV, FER, MELI, MSTR, NBIS, PDD, RKLB, SHOP, SPCX, TRI.
- No index underlyings (SPY, QQQ, ^SPX) are in the 518 — they appear only in `gex.json` / `lotto.json` watchlists, not the universe.

### Method

1. **Existing data first:** `gex.json` (Oct 16, 16 watchlist names) already showed Mon expiries for GOOGL, AAPL, MSFT, AMZN, MU and Friday-only for WMB, HD, INTC, BE, HON, FDX, PG, MCD, SNDK — but only 3 expiries per ticker and 16 names. `lotto.json` (Nov 17) records only 0DTE/1DTE per candidate (25 names, pre-selected for having an expiry that day). Neither file lists expiries per ticker for the universe, so the API sweep was required.
2. **Yahoo v7 options API** with the documented crumb flow (GET `fc.yahoo.com` → `getcrumb` → `query1.../v7/finance/options/{TICKER}`, browser UA, one request per ticker, 0.4 s delay, 401-refresh + 429 backoff coded in). **Classification:** expiries in the next 35 days (Nov 20–Dec 25, 2026), dates taken as **UTC**. Thu Dec 24 / Dec 31 (Friday holidays: Christmas, New Year's Day) counted as Friday-equivalent, not as Thursday weeklies.

### Coverage

- **518 / 518 checked, Fri Nov 20, 2026, 17:43–17:48 ET** (22:43–22:48 UTC), ~5 min run. **0 errors, 0 rate-limits, 0 tickers without listed options** — every universe name returned an expiry list.

### CONFIRMED — tickers WITH non-Friday expiries (11)

All 11 share the identical pattern: **Mon/Wed/Fri weeklies for the front two weeks, then Fridays only** (nearest expiries Fri Nov 20, Mon Nov 23, Wed Nov 25, Fri Nov 27, Fri Dec 4, Fri Dec 11, Fri Dec 18, Thu Dec 24 holiday-shifted). **[Spot-checked: AAPL re-fetched 2026-11-20 via Yahoo v7 — Fri Nov 20, Mon Nov 23, Wed Nov 25, Fri Nov 27, Fri Dec 4, Fri Dec 11, Fri Dec 18, Thu Dec 24; 21 expiries listed.]**

| Ticker | Weekday pattern | Total expiries listed |
|---|---|---|
| AAPL | Mon / Wed / Fri | 21 |
| AMD | Mon / Wed / Fri | 20 |
| AMZN | Mon / Wed / Fri | 21 |
| AVGO | Mon / Wed / Fri | 21 |
| GOOGL | Mon / Wed / Fri | 21 |
| META | Mon / Wed / Fri | 21 |
| MSFT | Mon / Wed / Fri | 20 |
| MU | Mon / Wed / Fri | 23 |
| NVDA | Mon / Wed / Fri | 22 |
| TSLA | Mon / Wed / Fri | 20 |
| SPCX | Mon / Wed / Fri | 23 |

No ticker showed Tue or Thu weeklies. No name has daily (Mon–Fri) expiries among stocks — that pattern exists only for index underlyings (verified in probe: SPY has Mon/Tue/Wed/Fri expiries; SPY is not in the universe).

### CONFIRMED — Friday-only (507)

All remaining 507 names, including GOOG, NFLX, PLTR, MSTR, COIN, JPM, CRM, ORCL, SHOP, ARM, ASML, MELI, CRWV, NBIS, and every other universe name not in the table above.

### CORRECTED — `build-lotto.mjs` expiry dates are one day early (material)

Yahoo's expiry timestamp is midnight UTC at the *start* of the expiry date (documented in `build-gex.mjs` lines 82–84, and `build-gex.mjs` correctly uses UTC `toISOString()`). `build-lotto.mjs` formats the same timestamp with `etDateStr` (America/New_York), shifting every expiry back one day. Proof: `lotto.json` Nov 17 labels "Tue Nov 17" 0DTE / "Thu Nov 19" 1DTE; the true expiries were Wed Nov 18 / Fri Nov 20 (confirmed against raw Yahoo timestamps: AAPL's front expiry `1795132800` = UTC Fri Nov 20, ET Thu Nov 19). **So the lotto scanner's "0DTE" is actually the next day's expiry. Fix before Rev 4 relies on it.**

### Other findings

- **GOOG vs GOOGL asymmetry:** GOOGL (Class A) has Mon/Wed weeklies; GOOG (Class C) is Friday-only. Same for other dual-class names — both classes Friday-only (FOXA/FOX, NWSA/NWS, BRK-B, BF-B). Only GOOGL is split.
- **SPCX** is the least obvious name on the non-Friday list — Nasdaq-100-only, not S&P 500. Its Mon/Wed/Fri pattern is confirmed from Yahoo data; what the underlying is beyond its NDX membership was not verified.

### OPEN / caveat

- Weekly listings are exchange decisions and change over time — this is a Nov 20, 2026 snapshot; a name can gain or lose Mon/Wed weeklies, so the engine should re-check periodically rather than hard-coding the 11.

---

## 4. Terms and limits (primary sources, accessed 2026-11-20)

### 4.1 Schwab developer terms — storing market data

#### What could and could not be read

- **Read in full (primary):** Schwab Online Services Agreement (SOSA), https://www.schwab.com/legal/terms
- **NOT readable — do not guess:** the Developer Portal's own legal/terms page, https://developer.schwab.com/legal — fetch failed with "Page not found … no extractable content." This matches an independent Nov 5, 2026 check (fincodelabs) that found the portal's Trader API documentation and terms not readable without login. The SOSA is the general website agreement, **not** the API-specific developer terms; the API-specific terms that govern the Trader/Market Data API were therefore **not verified**. Any conclusion below is SOSA-based only, plus secondary paraphrases clearly labelled as such.

#### Verbatim clauses that decide the question (SOSA)

**Redistribution — the binding clause:**
> "You will not redistribute or facilitate the redistribution of Market Information, nor will you provide access to Market Information to anyone who is not authorized by Schwab to receive Market Information."

**Licence scope:**
> "Schwab grants you a single, non-exclusive, non-transferable and limited personal license to access and use the Schwab Services."

**Copying / personal use only:**
> "Except as otherwise permitted by Schwab, no materials from the Schwab Services … may be copied, reproduced, republished, uploaded, posted, transmitted, or distributed in any way. You may download material displayed on the Schwab Services for non-commercial, personal use. … You may not use, distribute, modify, transmit, or post the content of the Schwab Services for public or commercial purposes … without Schwab's written permission."

**Commercial use:**
> "You will not use any Schwab Service for any commercial purpose not expressly approved by Schwab in writing."

**What "Market Information" covers** (so quotes/candles/chains are in scope): *"financial market data, quotes, news, analyst opinions, and research reports"* obtained from third-party providers.

#### Answer to the question as asked

**Storage in Supabase per se is not expressly banned; showing that stored data to other people is the problem.**

- **Personal-only storage (your own use, your own login):** defensible under the SOSA — "download … for non-commercial, personal use," with no storage-duration or caching clause found.
- **Storing it behind a login for a small invite-only group: NOT clearly permitted — AMBIGUOUS leaning NO.** Serving Schwab-sourced quotes/chains to invitees is "provid[ing] access to Market Information to anyone who is not authorized by Schwab to receive Market Information" and "facilitat[ing] redistribution," unless each invitee is themselves Schwab-authorized for that data. "Invite-only" and "behind a login" do not cure this — the SOSA's test is authorization by Schwab, not whether the audience is small or gated. The Individual-vs-Commercial distinction reinforces this (secondary sources only — Schwab portal paraphrases via quantvps/traderspost, Oct 2026): Trader API **Individual** is "for your own personal use application for your own self-directed Brokerage account"; **Commercial** is "for apps you distribute to other Schwab clients" and requires separate Schwab review plus exchange-data agreements. A multi-user TradeDesk is, on that paraphrase, a Commercial use case, not an Individual one.
- **Silent / not found in the SOSA:** no clause on caching, storage duration/retention, or display/attribution requirements for market data. No "you may cache for X days" and no "you must display source/delay" rule appears in the SOSA text read. **Do not treat silence as permission** — the redistribution ban above is the operative restriction.

#### Verdict

- **CONFIRMED:** Schwab market data is non-redistributable; access may not be provided to persons not authorized by Schwab.
- **AMBIGUOUS (material):** whether storing-then-displaying to a small invite-only group counts as redistribution — the SOSA wording points to yes, but the API-specific developer terms (login-gated, unread) are the governing document and were not verifiable from here. **Open item: Ankit (or an agent with portal login) must read developer.schwab.com/legal and the Trader API Individual product terms, and/or seek Schwab Commercial approval, before WO-12 ships multi-user Schwab-data display.**

### 4.2 Supabase current free-tier limits (as of 2026-11-20)

Primary sources: https://supabase.com/pricing (FAQ section, crawled 2026-11-20) and https://supabase.com/docs/guides/platform/billing-on-supabase (doc updated 2026-09-17). Figures below are from those two pages unless marked [secondary].

| Item | Free | Pro (for reference) | Source |
|---|---|---|---|
| Database size | **500 MB per project — CONFIRMED** (spec's "~500 MB" is correct) | 8 GB/project incl., then $0.125/GB | billing docs table |
| File storage | 1 GB | 100 GB incl., then $0.021/GB | billing docs table |
| Egress (bandwidth) | 5 GB/mo | 250 GB incl., then $0.09/GB | billing docs table |
| Cached egress | 5 GB [secondary — pricing-page transcriptions, e.g. fastero checked 2026-11-12; not in billing-docs table] | 250 GB | [secondary] |
| Auth users (MAU) | 50,000 | 100,000 incl., then $0.00325/MAU | billing docs table |
| API requests | Unlimited | Unlimited | pricing page [secondary transcription] |
| Edge Function invocations | **500,000/mo** | 2M incl., then $2 per 1M | billing docs table |
| Edge Function count | 25 [secondary — billing doc in GitHub mirror] | 500 | [secondary] |
| Realtime | 2M messages/mo, 200 peak connections | 5M messages, 500 connections | billing docs table |
| Active projects | 2 | n/a (org-level) | billing docs |
| Auto-pause | After 1 week of inactivity | Never | pricing FAQ |
| Backups | None on Free [secondary] | Daily, 7-day retention [secondary] | [secondary] |
| Log retention | 1 day [secondary] | 7 days [secondary] | [secondary] |
| Pro price | — | $25/mo per org + usage, incl. $10/mo compute credit | pricing FAQ / billing docs |
| **Row limit** | **None found — limits are size-based (500 MB), not row-count-based.** No row cap appears in pricing or billing docs. | — | primary docs searched |

**CORRECTED (outlier rejected):** one secondary source (dev.to, Nov 2026) claimed the free tier "was improved from 500 MB to 1 GB database size." This contradicts the primary billing docs (updated 2026-09-17) and the pricing page as crawled today, both 500 MB. Treat 500 MB as current; the 1 GB claim is not corroborated.

**Branching — CONFIRMED Pro-only (primary):** Supabase pricing FAQ, verbatim: *"You can also use Branching, available on the Pro Plan and above, to run a separate development environment off your production project."* (https://supabase.com/pricing). Branching docs (https://supabase.com/docs/guides/platform/branching, updated 2026-11-18) describe preview/persistent branches but do not restate the plan gate in the extracted text. Hourly branch cost ($0.01344/branch/hour, ~$9.70/mo always-on) is **secondary only** (multiple independent transcriptions agree) — not verified on a primary page in this pass. **[Spot-checked 2026-11-20: search corroborates — branching not included on Free; Pro/Team only, $0.01344/branch/hour.]** Per instruction, no guess is made about which plan the user's project is on — open item for Ankit (§6).

#### What bites the WO-12 snapshot plan (15-min option-chain snapshots, ~40 stocks, 30-session retention, chosen contract + 3 tier strikes)

Volume math (6.5-hour session = 26 × 15-min intervals):
- 26 intervals × 30 sessions × 40 stocks = **31,200 stock-snapshots** per retention window.
- × 4 contracts (chosen + 3 tier strikes) = **124,800 contract-rows** if one side only; **249,600 rows** if calls + puts both.
- At a rough ~200–400 bytes/row plus indexes, that is on the order of **~25–100 MB per 30-session window** (estimate, not measured — row width depends on the final schema). In isolation it fits inside 500 MB, but it is a material fraction (roughly 5–20%+), and it shares the 500 MB with everything else already in the project (fundamentals, quotes, history). **The binding constraint is database size, not invocations or bandwidth.**
- **Invocations — non-binding:** one Edge Function run per 15-min interval ≈ 26 × ~22 weekdays ≈ **~570/mo**; even one invocation per stock per interval ≈ **~22,900/mo** — both far under 500,000/mo.
- **Egress — non-binding** for a small invite-only group at this volume.
- **Other Free-tier risks if the project is on Free:** auto-pause after 1 week of inactivity (daily pipeline runs should keep it active, but any pipeline outage >1 week pauses the project); no automatic backups, so a snapshot-table corruption has no restore path.
- **Open item (not verifiable from public sources):** the project's *current* database size — WO-12's headroom cannot be confirmed until that number is read from the Supabase dashboard. If the project is already near 500 MB, WO-12 needs Pro (8 GB) or a shorter retention, regardless of the snapshot math above.

#### Could not verify (check C)

1. Schwab Developer Portal legal terms (https://developer.schwab.com/legal) — login/JS-gated, fetch failed; the API-specific storage/redistribution terms are therefore unverified.
2. Supabase pricing-page plan-comparison table itself (JS-rendered; fetch returned only the FAQ) — plan figures above are instead taken from the primary billing docs, cross-checked against multiple secondary pricing transcriptions dated Nov 2026, which agree.
3. Branch hourly rate ($0.01344/branch/hour) on a primary page — secondary consensus only.
4. The user's Supabase plan and current DB size — requires dashboard access; not guessed.

---

## 5. Trader-rule verification (plan Phase 0)

**Source checked:** `TradeDesk/STRATEGY_PLAN.md` from GitHub main (sha `5627b65c`, 595 lines, 42,808 bytes). The local copy at `~/workspace/build-tradedesk/TradeDesk/STRATEGY_PLAN.md` does **not** exist — fetched read-only via gh-api.

**Verdict key:** VERIFIED = the primary text itself was seen (paper, exchange/regulator release, organizer release). CORRECTED = plan and source disagree (both stated). UNVERIFIED = no findable primary text; where book/secondary summaries unanimously agree that is said in notes, but per the brief that does not count as verified.

| Rule | Plan § | Verdict | Primary source | Notes |
|---|---|---|---|---|
| O'Neil CAN SLIM: C ≥25% EPS, A ≥25%/yr, new highs from sound bases, market direction first, cut losses 7–8% | §2.1, §4.4 | VERIFIED | [Nasdaq/IBD guide](https://www.nasdaq.com/articles/learn-invest-stocks-quick-start-guide-beginners-2017-12-29) (O'Neil's own publication) | 7–8% cut confirmed verbatim. Plan's §4.4 EPS ≥25%/sales ≥20% tiering is a looser composite, not CAN SLIM verbatim (CAN SLIM also wants ROE ≥17%, 20–25% profit-taking). |
| Minervini Trend Template: Close > 50 > 150 > 200 SMA; 200-day rising ≥20 sessions; ≥30% above 52-wk low; within 25% of 52-wk high | §4.3, §6.1 A2 | UNVERIFIED | Book *Trade Like a Stock Market Wizard* (not accessible here); summaries unanimous, e.g. [investingpaths](https://investingpaths.com/minervini-trend-template-screener) | Two gaps: book says 200-day rising "at least 1 month, preferably 4–5 months" (plan's ≥20 sessions ≈ 1 mo, consistent at the low end); book's criterion 8 is RS rating ≥70 — plan's §4.3 template omits RS (RS ≥80 appears separately in A2). |
| Minervini VCP contraction: base 10–40 sessions, depth ≤25%, 5-day ATR ≤70% of 20-day ATR, 5-day vol ≤70% of 50-day | §4.3 | UNVERIFIED | Book only; no primary numbers found | Concept (successively shallower pullbacks, volume drying up, pivot = base high) is real; the exact numbers are the plan's operationalization, not Minervini's published numbers. |
| Minervini USIC 1997 +155%, 2021 +334.8% | §2.1 | VERIFIED (2021) / UNVERIFIED (1997) | [2021 release](https://www.streetinsider.com/Press+Releases/STOCK+TRADER+WINS+U.S.+INVESTING+CHAMPIONSHIP+A+SECOND+TIME+-+BREAKS+RECORD/19494329.html) (plan §12 link) | 2021 +334.8% confirmed; 1997 figure not re-checked this pass. |
| David Ryan USIC winner 1985–87 | §2.1 | UNVERIFIED | — | Not checked; no codable rule depends on it. |
| Dan Zanger $11K→$18M in ~18 mo (1998–2000) | §2.1 | UNVERIFIED | Fortune press only (secondary) | Not opened; no codable rule depends on it. |
| Weinstein: only buy Stage 2 | §2.1 | UNVERIFIED | Book *Secrets for Profiting…* (1988), not accessible here; summaries unanimous | Summaries agree: weekly charts, 30-week MA, Stage 2 = price above rising 30-wk MA, only stage to buy. No primary text seen. |
| Raschke: short-term patterns, pullbacks in trends | §2.1 | UNVERIFIED | — | No codable rule in the plan; nothing to verify against. |
| Connors RSI-2 (H1): >200 SMA, RSI(2) <10, buy close, sell on close above 5-day SMA | §6.4 | UNVERIFIED | Book *Short Term Trading Strategies That Work* (2008), not accessible; summaries unanimous | Summaries agree on the rule; book's flagship threshold is RSI(2) <5, <10 is the looser published variant (plan uses <10). Original has **no stop** — plan's 2×ATR catastrophic stop is correctly labelled a variant, i.e. a plan addition. |
| Crabel ORB / narrow-range days | §2.1 | UNVERIFIED | Book (1990), not accessible | No codable rule in the plan. |
| Kullamägi EP (A1): gap ≥8%, RVOL ≥2, not up >50% in prior 63 sessions | §6.1 | CORRECTED | His own published guide/video, via unanimous independent transcriptions, e.g. [snappchart](https://www.snappchart.app/blog/beginner-playbook/qullamaggie-trading-strategy), [Deepvue](https://deepvue.com/screener/stock-screener-by-trader/qullamaggie-episodic-pivot-screener/) | Plan says gap ≥8%; he says **gap ≥10%** (hard requirement). Plan says RVOL ≥2; he says massive volume — stock trades its average daily volume in the first 15–30 min (often 3–5×). Plan's "not up >50% in 63 sessions" is a quantification of his "sideways/down 3–6 months, neglected" — spirit matches, number is the plan's. Evidence basis: multiple independent transcriptions of his guide; his original video/guide text was not opened directly. |
| Kullamägi EP entry/stop/exit: buy above 5-min OR high; stop at low of day capped at 1 ATR (skip if wider); sell part days 3–5, BE stop, trail 10/20 MA | §2.2, §6.1 | VERIFIED in substance / see note | Same transcriptions of his guide as above; [CTE research sheet](https://completetradersedge.com/wp-content/uploads/2026/09/CTE-Research-Sheet-Kristjan-Kullamagi-market-wizards-next-generation-1.pdf) (companion to Schwager & Coyle 2026 chapter) | All elements match his published rules. Strictly, his original video/guide text was not opened directly — only multiple independent transcriptions. Plan's A1 exit variant ("sell half at +2R or session 5", hard stop session 30) is a plan addition: he says sell ⅓–½ after 3–5 days, no +2R trigger, no 30-session hard stop. |
| Kullamägi parabolic short (A3-S): up ≥50% in 5 sessions (large) or ≥100% (small), 3+ up days; short first OR-low break; stop day's high; cover at 10/20 MA | §6.6 | CORRECTED | Same transcriptions as above | Plan says small caps ≥100%; he says **small caps 300–1000%+** (large caps 50–100%+). Plan says "in 5 sessions"; he says "in a few days or weeks". Entry (OR-low break), stop (day's high), cover (10/20 MA), 3–5+ up days all match. |
| Bonde/Stockbee as EP origin | §2.2 | UNVERIFIED | — | Kullamägi himself credits Bonde per the CTE sheet (secondary); no Bonde primary source checked. |
| Oliver Kell USIC 2020 +941%; "cycle of price action", EP-style entries | §2.2 | VERIFIED (record) / UNVERIFIED (method) | Organizer's official standings, financial-competitions.com (Dec 2020: Kell +941.1% in $20k+ stock division) | Record confirmed (plan's +941% ✓). No codable method source found. |
| Leif Soreide USIC winner 2019; high-tight-flag breakouts | §2.2 | VERIFIED (record) / UNVERIFIED (method) | Organizer's official standings (2019: Soreide +60.9%, $20k+ stock division) | Method: no codable source found. |
| Mark Ritchie II — risk-first management | §2.2 | UNVERIFIED | — | No record or codable rule checked. |
| J Law USIC 2024 +353.9%, 2025 +252.3% ($1M+ stock div.) | §2.2 | VERIFIED (record) | [Business Wire 2025 final standings](https://www.businesswire.com/news/home/20260202090143/en/Multiple-World-Records-Set-in-International-Investing-Competition) | Record confirmed exactly. |
| J Law method ("to be documented in Phase 0") | §2.2 | UNVERIFIED — not locatable as codable rules | — | Only public method description found is a Chart Fanatics interview (Oct 2026, Cantonese, dubbed), summarized second-hand as a "multi-edge" system ([tradepiko profile](https://www.tradepiko.com/blog/j-law-trading-strategy)). No written rules, no book, no guide. Phase 0 cannot code this from a primary source as things stand. |
| Khandelwal USIC 2023 +129% ($1M+ stock div.) | §2.2 | VERIFIED (record) | [Business Wire 2023 final results](https://www.businesswire.com/news/home/20240126217806/en/) | Record confirmed exactly (23 y/o, TwoX Capital). |
| Khandelwal method ("to be documented in Phase 0") | §2.2 | UNVERIFIED — nothing found | — | No method source of any kind located. Same status as J Law. |
| Sam Bhatia USIC 2022 +13.5% (bear year) | §2.2 | VERIFIED | [Business Wire 2022 final standings](https://www.businesswire.com/news/home/20230125005300/en/5377281/United-States-Investing-Championship-2022-Final-Standings) | Confirmed exactly; S&P −19.4% that year per the same release. |
| Brian Shannon: AVWAP anchored to earnings/gap day as defended line | §2.2, §4.3 | UNVERIFIED | Book *Maximum Trading Gains with Anchored VWAP* (2023), not accessible; summaries unanimous | Summaries agree: anchor to earnings/gap/swing events; Shannon credits the original idea to Paul Levine. No primary text seen. |
| Zarattini/Barbon/Aziz ORB, Module B: price >$5, 14-day vol ≥1M, ATR(14) >$0.50, opening 5-min RVOL ≥1, top 20; long/short on OR break in direction of first bar; stop 10% of ATR(14); exit at close | §6.2 | VERIFIED | Authors' own summary: [concretumgroup](https://concretumgroup.com/a-profitable-day-trading-strategy-for-the-u-s-equity-market/) (7,000+ stocks, 2016–2023, 5-min ORB, top-20 Stocks in Play, Sharpe 2.81, >1,600% net); parameter detail per [CXO summary of the paper](https://www.cxoadvisory.com/individual-investing/intraday-trading-of-overactive-stocks-via-opening-range-breakout/) and [QuantConnect faithful recreation](https://www.quantconnect.com/research/18444/opening-range-breakout-for-stocks-in-play/) — all agree | Strongest verification in the plan. Two cautions: (1) the paper's exit is stop-or-close only — the plan's **5R target is a plan addition, not in the paper**; (2) QuantConnect's recreation uses a 1.0×ATR stop, which differs from the paper's 10% ATR — the plan correctly follows the paper, not QC. |
| Zarattini/Aziz/Barbon noise band, Module C: noise = 14-session mean of \|price at time ÷ open − 1\|; upper = max(open, prior close)×(1+noise); signals at half-hour marks; exit on cross back through band/VWAP or 15:55 ET | §6.3 | VERIFIED in substance | Paper itself, SFI 24-97 / [SSRN 4824172](https://ssrn.com/abstract=4824172), full text via authors' site: [Beat the Market PDF](https://concretumgroup.com/wp-content/uploads/2026/02/Beat-the-Market.pdf) | Construction matches (14-day lookback, half-hour decision times, max/min vs prior close, VM=1 as the paper's chosen setting). Plan's exit is a simplification of the paper's dynamic VWAP trailing stop. Gamma filter and FOMC/CPI/jobs filter are plan additions to test, not in the paper. **Material caveat:** independent OOS replication (Paz Serpa, June 2026) found the edge decayed sharply post-publication — Sharpe 0.39, +9.4% vs +29.5% buy-and-hold, May 2024–Mar 2026: [replication](https://github.com/pazsheimy/intraday-trading-lab/blob/HEAD/results/zarattini_oos_paper.md). |
| Bellafiore/SMB "Stocks in Play", playbook-per-setup | §2.3 | UNVERIFIED | Books, not accessible | No codable rule in the plan. |
| Breitstein capitulation / "right side of the V" | §2.3 | UNVERIFIED | — | No codable rule in the plan. |
| Ross Cameron low-float gap-and-go; Warrior Trading FTC $3M settlement 2022 | §2.3 | VERIFIED (settlement) / UNVERIFIED (method) | [FTC primary](https://www.ftc.gov/news-events/news/press-releases/2022/04/federal-trade-commission-cracks-down-warrior-trading-misleading-consumers-false-investment-promises) | $3M settlement, April 2022, misleading earnings claims — confirmed exactly. Method is idea-only, as the plan already says. |
| Cboe: 0DTE ≈59% of SPX options volume in 2025 | §2.4 | VERIFIED | [Cboe primary](https://www.cboe.com/insights/posts/the-state-of-the-options-industry-2025/) | Confirmed: 2.3M contracts ADV, 59% of SPX volume, full-year 2025. |
| Beckmeyer et al.: retail loses on SPX 0DTE in aggregate, mostly costs | §2.4, §1 | VERIFIED | [SSRN 4404704 abstract + full text](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4404704) | Retail lost $241k/day avg (Feb 2021–Sep 2023), $358k/day after daily expiries (May 2022); >75% of retail SPX trades were 0DTE; transaction costs a large share (~60% per contemporaneous summary). |
| Gao et al. (2018) / Baltussen et al. (2021): intraday momentum exists, stronger when dealers short gamma | §2.4, §6.3 | UNVERIFIED (existence only) | Papers exist (cited in peer literature incl. the Paz Serpa replication) | The gamma-conditional claim as stated was not confirmed against primary text. Note: an independent 2026 backtest found Gao's first-half-hour rule lost money on ES/NQ 2020–2026 — the "intraday momentum exists" claim is sample-dependent. |
| Sinclair: only trade options with a view on vol as well as direction | §2.4 | UNVERIFIED | Books, not accessible | No codable rule in the plan. |
| Sosnoff/tastytrade short premium; H2 iron condor: ~10 delta, wings 25–50 pts, opened 10:00 ET, close at 50% credit / 2× credit loss / 15:45 ET | §2.4, §6.4 | CORRECTED | [tastytrade support](https://support.tastytrade.com/support/s/solutions/articles/43000435423?nocache=https%3A%2F%2Fsupport.tastytrade.com%2Fsupport%2Fs%2Fsolutions%2Farticles%2F43000435423) (50% close mechanics) | Tastytrade's published framework is **~45 DTE, ~16 delta (1 SD), close at 50% max profit or 21 DTE**. The 50% profit and 2× credit-loss closes match tastytrade practice; but a **0DTE** iron condor at 10 delta opened 10:00 ET is the plan's own adaptation with no primary source. |
| Kochuba/Karsan: GEX, gamma flip, vanna/charm as context | §2.4 | UNVERIFIED | — | Frameworks, not audited; no codable rule in the plan. |
| Pan & Poteshman et al.: options flow carries information, strongest signal from non-public data | §2.4 | UNVERIFIED | — | Papers not opened this pass; claim matches their widely-cited framing. |
| Brazil day-trader study: ~97% of 300+ day traders lost money | §1 | VERIFIED | [SSRN 3423101 abstract](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101) | Confirmed exactly: 97% of those persisting >300 days lost money. |
| Taiwan study: <1% predictably profitable | §1 | UNVERIFIED | — | Not checked this pass (Barber, Lee, Liu & Odean paper exists; not opened). |
| Post-earnings drift (Bernard & Thomas) | §3 | UNVERIFIED | — | Debate background only, not a coded rule; not checked. |
| Regime gate §4.1: Green = SPY >50 SMA + 21 EMA >50 SMA + ≥50% of universe above 50 SMA; Red = SPY <200 SMA or breadth <30%; Yellow = neither; full/half/no-new-longs | §4.1 | UNVERIFIED | — | Plan's own composite. No trader attributes these exact thresholds; no primary source exists for them. Design choice, not a trader rule. |
| Universe §4.2: price ≥$10, 20-day avg dollar vol ≥$20M, ADR% ≥3%; options: weekly listed, ATM spread ≤10% of mid | §4.2 | UNVERIFIED | — | Plan's own thresholds. (For contrast, Kullamägi's own liquidity bars are price ≥$10 and ADV ≥500k shares — different from the plan's $20M.) |
| Technical inputs §4.3: RS weighted 40/20/20/20 over 63-session blocks, RS line, prior move ≥30%, gap quality, RVOL bands, sector median RS | §4.3 | UNVERIFIED | — | Plan's operationalization. IBD's RS rating (which Minervini's criterion 8 uses) is proprietary and not reproducible from the stated formula. |
| Fundamental inputs §4.4: EPS ≥25%/≥50%, sales ≥20%, SUE fallback, insider cluster ≥2 buys in 30 days, etc. | §4.4 | UNVERIFIED | — | Plan's scoring tiers. EPS ≥25% echoes O'Neil's C and Kullamägi's EP earnings bar in spirit, but the tiering is the plan's. |
| Risk §4.5: $10k account, 3% loss / 15% gain per trade, 25% position size, max 4 positions, max 20% single / 5% total open risk / 2 per group, −2R day stop, max 3 index-option trades/day, halve size after 3 losses | §4.5 | UNVERIFIED | Ankit's decisions D4/D6 + plan choices | No trader source — and it **conflicts** with the named traders' own risk rules: Kullamägi risks 0.25–1%/trade and caps single positions at 30% overnight; O'Neil cuts at 7–8%; Minervini uses tight technical stops. The 3%/25% shape is Ankit's by decision, not theirs. |
| PDT rule for <$25k margin accounts (§4.5: "check its current status — changes were proposed in 2025") | §4.5 | CORRECTED | [FINRA Regulatory Notice 26-10](https://www.finra.org/sites/default/files/2026-04/Regulatory-Notice-26-10.pdf) | **The PDT rule is gone.** SEC approved Apr 14, 2026; effective **June 4, 2026**: PDT designation, day-trade counts and the $25,000 minimum were eliminated in their entirety, replaced by an intraday-margin standard. Phase-in for brokers runs to Oct 20, 2027 (Schwab implemented June 8, 2026), so a given broker may still apply old rules during transition. Futures options on ES/NQ were always outside PDT, as the plan notes. **[Spot-checked 2026-11-20 against finra.org: notice 26-10, effective June 4, 2026, phase-in ends Oct 20, 2027 — confirmed.]** |
| Score §5: weights Setup 30 / Catalyst 20 / Growth 10 / RS 15 / Volume 15 / Group 5 / Options 5; grades A+ ≥85, A 75–84, B 60–74, C <60 | §5 | UNVERIFIED | — | Plan's own construction. No trader source. |
| Readiness score §5: contraction 30 / RS 25 / distance-to-pivot ≤3% 15 / dated catalyst ≤10 sessions 15 / growth 10 / options-insider 5; ≥70 = watchlist | §5 | UNVERIFIED | — | Plan's own construction. No trader source. |
| A2 entry/exit: buy stop 0.1% above pivot, volume on pace ≥1.5×, not >0.7 ATR above pivot; exit before scheduled earnings unless open profit ≥2R | §6.1 | UNVERIFIED | — | Plan's own numbers. Minervini buys pivot breakouts on volume — qualitative match only. |
| A1-S negative EP (mirror of A1) | §6.6 | CORRECTED (same as A1) | Same Kullamägi sources as A1 | Gap ≥8% vs his ≥10% (short side: his EP logic is long-only in his own writing; the short mirror is the plan's construction). |
| A2-S breakdown: close <50 <150 <200 SMA, RS ≤20, 10–40 session bear flag under falling 10/20 EMA | §6.6 | UNVERIFIED | — | Plan's mirror construction; no trader source for these exact numbers. |
| Module D single-stock overlay: ~50 delta, premium ≤$300, exit 5R / 50% premium loss / 15 min before close (0DTE) or next open (1DTE) | §6.5 | UNVERIFIED | — | Plan/Ankit construction per D1/D4. No trader source. |
| Module C expressions: 0DTE debit vertical ~50/25 delta; single long ~40–50 delta; 1DTE variant | §6.3 | UNVERIFIED | — | Plan's own expressions; the noise-band paper trades the underlying only. |
| Short costs: borrow fee 3%/yr placeholder, HTB excluded if SI/float >20%, no short under $10, uptick-rule days excluded | §6.6 | UNVERIFIED | — | Plan placeholders (labelled as such in the plan). |
| §1 breakeven math: 1/(1+payoff); 3:1 → 25%, 5:1 → 16.7% | §1 | VERIFIED | Arithmetic | Checks out. |
| §1 "top growth/swing traders mostly win 30–55%" | §1 | UNVERIFIED | — | Broad claim, no source. Note: Kullamägi self-reports a ~25–30% win rate (per CTE sheet), below that range. |

### Bottom line (check D)

The plan's §2.5 admission holds up — the two academic modules (ORB, noise band) check out well against their papers, the USIC records and the 0DTE/Brazil/FTC facts are accurate, but three plan numbers are wrong against their sources (A1 gap, A3-S small-cap bar, PDT status), and everything that is genuinely the plan's own design (regime gate, score weights, readiness, 3%/15% risk) has no trader source at all and can only be settled by Ankit.

### Rules most needing Ankit's input

1. **3% loss / 15% gain (D4/D6) vs the traders' own risk rules.** His rule overrides Kullamägi (0.25–1%/trade), O'Neil (7–8% cut) and Minervini (tight technical stops). Confirm he wants the 3% cap to keep vetoing A1/A2 setups whose technical stop is wider — that will skip many textbook EP/breakout trades by design.
2. **Score weights, regime thresholds, readiness score (§4.1, §5).** All plan inventions with no trader source. Only he can bless them as design choices (or change the numbers) — no external source can settle them.
3. **A1 gap: 8% (plan) vs 10% (Kullamägi).** Pick one to code.
4. **A3-S small-cap bar: 100% (plan) vs 300%+ (Kullamägi).** Pick one to code; the 100% version will fire far more often on ordinary small-cap runs.
5. **J Law and Khandelwal methods.** No codable public rules exist for either — J Law's only method description is a dubbed interview ("multi-edge"); Khandelwal has nothing at all. Decide: drop them from Phase 0, or keep them as record-only names with no rules.
6. **PDT is dead.** FINRA eliminated it June 4, 2026. Confirm Module B no longer needs $25k workarounds (with the caveat that his broker may still apply old rules until Oct 2027 phase-in ends).
7. **Module C noise band: edge decayed post-publication.** Independent OOS replication (June 2026) found Sharpe 0.39 and underperformance vs buy-and-hold after the paper. Still want it as a core module, or demote to challenger?
8. **Module B 5R target and H2 0DTE iron condor.** Neither is in its cited source (ORB paper exits at close/stop only; tastytrade's condor is 30–45 DTE, ~16 delta). Keep both as labelled plan variants, or drop them to stay faithful to the sources?
9. **Minervini template RS criterion.** The book's criterion 8 (RS rating ≥70) is missing from the plan's §4.3 template — confirm whether RS belongs in the template or only in A2/score as currently placed.

---

## 6. Open items needing Ankit

1. **Supabase plan + branching availability.** Confirm whether the project (`iknfvddnevudpjtyxkbh`) is Free or Pro, and whether database branching is available. Branching is Pro-only per the pricing FAQ; if Free, WO-02 uses a second free project as staging (Free allows 2 active projects). Do NOT guess — dashboard check.
2. **Current Supabase database size.** WO-12's headroom cannot be confirmed until this number is read from the dashboard. If already near 500 MB, WO-12 needs Pro (8 GB) or shorter retention.
3. **Schwab developer terms (API-specific).** Read developer.schwab.com/legal and the Trader API Individual product terms (login-gated; unread in WO-00), and/or seek Schwab Commercial approval, before WO-12 ships multi-user Schwab-data display. The general SOSA leans against serving Schwab data to invitees; the API-specific terms govern.
4. **Live proxy tests ($TNX / $VIX / /ES).** With Ankit signed in to TradeDesk: `schwab-market-data?symbols=$TNX`, `?symbols=$VIX`, `?symbols=/ES` — each settles in one call whether the symbol is served, and whether the /ES 404 prediction holds.
5. **Deployed `verify_jwt` settings.** No `config.toml` exists under `schwab/`; the ON/OFF states (market-data ON; auth-start/callback OFF per memory) need a Supabase dashboard check.
6. **Earnings workflow.** Install the keyless `TradeDesk/WORKFLOW/update-earnings.yml` via the web UI, or keep the live FMP-based job (FMP key previously went stale).
7. **Schwab re-login if the token is stale.** The refresh token dies on a 7-day clock; if it is dead when WO-01+ tests run, Ankit must hit the one-click re-login in the app.
8. **Trader-rule decisions (§5, items 1–9).** A1 gap 8% vs 10%; A3-S small-cap bar 100% vs 300%+; 3%/15% risk vs the traders' own risk rules; score/regime/readiness numbers as design choices; J Law / Khandelwal drop-or-keep; PDT removal; Module C demotion-or-keep; Module B 5R target and H2 condor as labelled variants or dropped; Minervini RS criterion placement.
9. **Housekeeping:** `~/workspace/build-tradedesk/schwab/proxy-key.txt` exists by name (content not read). Confirm it holds no live key and is not tracked in git.

---

## 7. What WO-00 changes in the spec (Rev 5 candidates — not yet applied)

These corrections should be folded into the spec at the next revision; WO-00 only records them.

1. **Pipeline is two runs (05:00 + 17:00 UTC), not one, and not keyless-only** (Quantgress key). §4 design diagram + any "keyless" assumption.
2. **/ES and /NQ are not available from the proxy** (Schwab 404; no route, no caller). The market strip (§7.7) must use SPX/QQQ proxies or Yahoo fallbacks for those two, labelled delayed — never shown as live Schwab quotes.
3. **$VIX is quotable in principle but has no live caller**; **$TNX is untested**. §7.7 must not claim live VIX/TNX until the live tests (§6.4) pass.
4. **A1 gap 8% → 10%** (or Ankit picks 8% as a deliberate deviation from Kullamägi).
5. **A3-S small-cap bar 100% → 300%+** (or Ankit picks 100% as a deliberate deviation).
6. **PDT rule removed** — FINRA eliminated it June 4, 2026; Module B no longer needs $25k workarounds (broker phase-in until Oct 20, 2027 noted).
7. **Module B 5R target and H2 0DTE iron condor are plan variants, not source rules** — label them as such or drop them.
8. **Module C noise band: note the post-publication edge decay** (OOS replication Sharpe 0.39, underperformed buy-and-hold May 2024–Mar 2026) and decide core vs challenger.
9. **Lotto expiry bug: `build-lotto.mjs` formats Yahoo expiry timestamps in ET, shifting every expiry one day early** — fix before Rev 4 relies on lotto data; `build-gex.mjs` already does it correctly in UTC.
10. **Staging database: second free project unless the project is Pro** (branching is Pro-only) — WO-02.
11. **Schwab-data storage: flag the SOSA redistribution ambiguity** — multi-user display of Schwab-sourced data is AMBIGUOUS leaning NO until the API-specific terms are read or Commercial approval is sought. WO-12 must not assume storage-then-display to invitees is permitted.
12. **Non-Friday expiries: exactly 11 universe stocks** (AAPL, AMD, AMZN, AVGO, GOOGL, META, MSFT, MU, NVDA, TSLA, SPCX), all Mon/Wed/Fri weeklies for the front two weeks; the other 507 are Friday-only. The 0DTE engine therefore only has Mon/Wed plays on those 11 names (plus Thu/Fri on the Friday-only set). Re-check periodically; do not hard-code.
13. **Edge Functions live at `~/workspace/build-tradedesk/schwab/functions/`, not under `TradeDesk/supabase/`** — correct any spec/plan path reference.

---

*End of WO-00 ground truth. Next: WO-01 (not started; needs Ankit's go-ahead after the §6 decisions).*

## 8. Decisions recorded 2026-11-20 (after WO-00)

Ankit's answers (2026-11-20 18:35 ET):

- **Supabase: stick with the Free plan.** No database branching (Pro-only) → WO-02 staging is a second free project (Free allows 2 active projects).
- **Schwab key is active and working in TradeDesk.** No re-login needed now; the live proxy tests (§6.4) can proceed.
- **Earnings workflow: install the keyless version, keep FMP as backup.** The live FMP workflow is saved as `TradeDesk/WORKFLOW/update-earnings-fmp-backup.yml` (live sha 4c4c1bb, 2026-11-20); the FMP_API_KEY secret stays in the repo. Install = replace `.github/workflows/update-earnings.yml` with the keyless file via the web UI (the token cannot write that folder).

Item 7 — trader-rule decisions, decided by Arlo as "best route" (Ankit's call to veto; these feed WO-01's `params.json`):

1. **3% loss / 15% gain (his D4/D6): KEEP.** His risk rule, not a trader quote — the traders' rules inform it, they don't override it. Rev 5 records the trade-off plainly: the 3% cap vetoes A1/A2 setups whose technical stop is wider, skipping many textbook trades by design.

   Reinterpreted 2026-11-22 (Ankit's words, via options tap: "Risk ≤3% of capital via sizing — rework the rule"): the 3% is the max LOSS per trade as a share of CAPITAL, enforced by position sizing — NOT a cap on the technical stop distance. The technical stop stays at invalidLevel however far away it is; the position is sized as min(25% default, 20% single-position max, 100 × 3% / stopDist). The WO-03 finding that 0 of 1,683 detections were tradeable under the stop-distance reading is therefore retired as a veto — the harness re-runs with sizing (spec Rev 5, library `positionSizing`). The 15% gain target is unchanged. (Original decision above left intact; this paragraph records the reinterpretation.)
2. **Score weights / regime thresholds / readiness: KEEP as labelled design choices.** No source can settle them; WO-03 ablation judges them (catalyst first).
3. **A1 gap: 10%.** Kullamägi's published hard requirement; the plan's 8% has no source. A1-S mirror uses 10% too, labelled plan construction (his EP is long-only). RVOL ≥2 stays as the plan's operationalization; his "ADV in 15–30 min" is stricter — WO-03 tests 2× vs 3× sensitivity.
4. **A3-S small-cap bar: 300%+.** Source's number (300–1000%+); the plan's 100% would fire far more often on ordinary runs.
5. **J Law / Khandelwal: DROP as rule sources.** No codable public rules exist for either. Keep their verified USIC records as background only.
6. **PDT: REMOVE workarounds.** FINRA Notice 26-10, effective June 4, 2026; Schwab implemented June 8, 2026. Note broker phase-in to Oct 20, 2027.
7. **Module C noise band: DEMOTE to challenger.** Edge decayed post-publication (OOS Sharpe 0.39, underperformed buy-and-hold). Core must hold up out-of-sample; it can earn its way back as a challenger.
8. **Module B 5R target + H2 0DTE iron condor: KEEP as labelled plan variants.** Testable in WO-03; the error was mislabelling, not the ideas. Same for the A1 exit variant ("sell half at +2R or session 5", 30-session hard stop) — labelled plan variant.
9. **Minervini RS: ADD RS ≥70 to the §4.3 template.** Book criterion 8; the plan presents §4.3 as his template, so it should carry all 8 criteria. RS ≥80 stays as the stricter A2 bar.

Check done 2026-11-20 (§6.9 partial): `schwab/proxy-key.txt` is NOT tracked in the public repo (404 on both `schwab/proxy-key.txt` and `schwab/` at the repo root). Content not read. The file is 65 bytes — exactly the length of an `openssl rand -hex 32` output plus newline, which is how the README says SCHWAB_PROXY_KEY is generated — treat it as the live shared secret until Ankit confirms otherwise. Confirm the key is set as the Edge Function secret (and wherever the pipeline reads it), then delete the local file.
