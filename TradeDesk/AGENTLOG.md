# AGENTLOG — TradeDesk
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Research/education only, never financial advice.
- Backtest-before-adopt: no strategy ships without historical validation.
- Free data sources only. He trades ES/NQ futures options 0DTE/1DTE, SPX 0DTE/1DTE.

## 2026-11-12 — Full Mock B port goes live (all 12 tabs)

- **Request:** Ankit: "I need all the current features in format of Mock B. If new modules need to be created to get all the live features, do that and design it." Replace the whole old-format app with Mock B's command-center layout (last full-data version, 12 tabs), keeping every live feature.
- **Change:** Full port. App shell is now Mock B's numbered tab bar under the header (01 Daily Brief … 12 Admin), dark editorial-ledger tokens, everything collapsed by default, Chart ↗ pills on every ticker. Daily Brief keeps the v2026-11-12a revamp ("Today in 10 seconds", Why / "What could go wrong" on all 15 cards, Movers, 1DTE, New Developments) plus Mock B's mood card with breadth bar and search rail with quick chips, and a new "See all N breakout candidates in Scanner" deep link. New tabs: Scanner (absorbs Signals — breakout table, flow-signals table, method card, plus new 7-block Reversal playbook module and Gamma watchlist module), Insiders (transaction-mix infographic + 3,016-row table, live count), News (69 headlines, ticker filter), Reference (all 33 plain-English definitions + live data-files & counts table). Options keeps the live LottoScanner as card 04 alongside Mock B's 0DTE/1DTE focus + guide. Congress keeps Executive branch, By-stock, Notable, committee chips/filter, min-size filter, deep links, plus a new "Newest filings" card. Earnings is Mock B's flat table (aligned grid, H/P/C bars, implied-move bar, BEAT/MISS chips, date + cap-tier filters, 5 sorts, expandable rows). Research rows expand inside the coverage table. Performance adds a "Why each idea was picked" toggle. Deep Dive keeps the live Schwab implementation (real-time quote, history, options chain, pre-market, reconnect) in Mock B's layout, plus the Screener presets module (Value/Growth/Quality/PEG/Peer upside). Admin is Mock B's UI wired to the real Supabase `tradedesk_invites` backend (unchanged logic). AuthGate/invite gate, Schwab 60s polling, URL-hash tab persistence, per-tab error boundaries all kept. Old Signals and Screener tab files remain in the repo unreferenced (push script adds/updates only — no deletions). All data live from the 12 pipeline JSONs + Schwab; zero hardcoded Nov-12 trigger/stop literals in the bundle. Dividend-yield display guard in Fundamentals (values > 1 treated as percent-points) covers the foreign-bank scaling defect in fundamentals.json; the upstream data fix is still open, as is the polluted asset-name strings in signals.json.
- **Version:** v2026-11-12b (bundle index-CAz_ybsh.js).
- **Verified:** yes — local build clean; live bundle contains v2026-11-12b and the new module strings ("Reversal playbook", "Lotto scanner", "Gamma — futures lens", "Transaction mix", "Newest filings", "Every term, in plain English", "files & counts"); 10 known Nov-12 trigger/stop literals 0 hits. Pending Ankit: on-device phone check of all 12 tabs (final gate).

## 2026-11-12 — Daily Brief revamp goes live (Mock B)
- **Request:** Ankit liked the Mock B revamp — make it live in the TradeDesk app.
- **Change:** Daily Brief only; all other tabs, the pipeline, Schwab polling, auth, and the invite list untouched. New computed "Today in 10 seconds" box (market mood in one plain sentence + #1 candidate's trigger/stop, from live daily-brief.json — nothing hardcoded); every breakout card now shows its rank and, without tapping, a plain-English "Why:" line built from the scan's own attribute checks and a highlighted "What could go wrong:" line with the stop and its $/% distance below the live price; headings de-jargoned ("Stocks to watch today", "Options expiring today — can go to zero today", "Options expiring tomorrow"); phone view keeps only rank + name + price + why + risk; sticky top-call bar on phones above the bottom nav. "Look at these today" top-3 strip removed (superseded by the summary box). Why/risk lines render on all ranked rows, not just the top 5 — the live app has no separate full-list tab, so cutting to 5 would have removed information.
- **Version:** v2026-11-12a (commit cab57cf, bundle index-DqIRv9Vz.js).
- **Verified:** yes — live dist/index.html serves index-DqIRv9Vz.js; live bundle contains "Today in 10 seconds", "What could go wrong", "Stocks to watch today", "Options expiring today" and version string v2026-11-12a; "Look at these today" 0 hits; daily-brief.json untouched (Nov 12 data). Pending Ankit: on-device phone check.

## 2026-11-11 — gate screens leak nothing (privacy fix)
- **Request:** Dipesh's sign-in showed a "Setup needed" screen naming Ankit, the SQL file, and Supabase. Make sure the app gives out no such information to anyone.
- **Change:** AuthGate gate-failure screens are now generic — "Access not granted" and "Couldn't check your access" (with Try again), no admin name, no file path, no backend mention anywhere on screen; the 'setup' state is folded into the generic error state (privacy rule noted in the code). Seed emails scrubbed from the public repo copy of `tradedesk-invites-table.sql` (seed block commented out with placeholders; live table already seeded). Dipesh's "Setup needed" was most likely transient PostgREST schema-cache staleness after the table was created — the retry button now covers it; if he then gets "Access not granted", his sign-in email differs from the seeded one.
- **Version:** v2026-11-10n (commit f61796b, bundle index-CAalimcl.js).
- **Verified:** yes — live bundle contains the version string; "Ankit", the SQL filename, "Supabase SQL editor", "Ask Ankit", "Setup needed" all 0 hits in the live bundle. Pending Ankit: on-device check (Admin tab, Dipesh retry).

## 2026-11-11 — invite list + Admin tab (sharing locked down)
- **Request:** limit sharing; an invite list managed from the app, Admin tab only for Ankit, plus an extra layer of security.
- **Change:** new `public.tradedesk_invites` table (email PK, role admin/member) with RLS + `is_tradedesk_admin()` SECURITY DEFINER helper (`TradeDesk/supabase/tradedesk-invites-table.sql`, seeds apatel85@gmail.com as admin, dipeshp@gmail.com as member); AuthGate now fails closed — no row means "Access not granted" and no app content; new Admin tab (add/remove/role-toggle, last-admin + self-removal guards, hidden entirely for non-admins); `schwab-market-data` Edge Function edited to 403 non-invited JWT callers (needs manual Dashboard redeploy).
- **Version:** v2026-11-10m (commit 80cc680, bundle index-IKYV0fT7.js).
- **Verified:** yes — live bundle contains the version string + gate markers; prior features still present. Pending Ankit: run the SQL first (app shows "Setup needed" until then), redeploy the proxy function, on-device Admin-tab check.

## 2026-10-21 — pipeline commit step still failing
- **Request:** fix the data pipeline so the app shows fresh data.
- **Change:** 10-20 pushed the missing pipeline scripts; "Run data pipeline" now succeeds. Failure moved to "Commit data + dist" (same failure as the 10-18 research run).
- **Version:** dist build (live data stale — insiders stuck 2026-10-14).
- **Verified:** no — awaiting Ankit: SEC_CONTACT_EMAIL confirm + manual dispatch; go-ahead to diagnose the commit step.

## 2026-10-18 — research workflow commit fix
- **Request:** research agent ran but the Research tab stayed empty.
- **Change:** agent step succeeded; "Commit research.json + dist" failed (monorepo race). Added `git add -f` + `git pull --rebase origin main` between commit and push in `.github/workflows/tradedesk-research.yml`.
- **Version:** workflow only.
- **Verified:** partial — agent step confirmed running; tab population unconfirmed.
