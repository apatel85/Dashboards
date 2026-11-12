# AGENTLOG — TradeDeskV2
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- V2 is a separate directory. Never edit `../TradeDesk/` from here.
- V2 has no data and no pipeline: it reads `/Dashboards/TradeDesk/dist/data/` (see `src/lib/dataBase.ts`).
- Same Supabase project, invite list and Schwab proxy as V1. AuthGate is unchanged and fails closed.
- Inherited from V1: research/education only; free data sources; ES/NQ + SPX 0DTE/1DTE focus.

## 2026-11-12 — V2 created (clean UI/UX rebuild)
- **Request:** understand TradeDesk deeply, assess gaps, build a cleaner, easier-to-follow version in a new directory without touching the existing app.
- **Change:** new shell (grouped sidebar, ticker search, phone bottom bar with More), 10 tabs → 7 pages with sub-tabs, new Today overview (regime, ES/NQ gamma levels, top setups, next earnings, new developments), Data status view, collapsed "How to read this", pagination on Screener / Signals / Track record, collapsed Research analysis, "Invalid Date" fix, 13 TypeScript errors inherited from V1 fixed. Full list in README.
- **Version:** v2-2026-11-12a.
- **Verified:** partial. Every page rendered on desktop (1440px) and phone (390px) against the current data files with no page errors, no horizontal scroll and no "Invalid Date"; `tsc --noEmit` clean; production build succeeds. **Not verified:** real sign-in (Google / magic link), the invite check, and anything that needs a live Schwab session (Deep Dive results, movers, live quotes) — testing used a local stub in place of AuthGate. Pending Ankit: add the redirect URL in Supabase (README), then an on-device login + Deep Dive check.
