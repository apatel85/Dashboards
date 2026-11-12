# AGENTLOG — TradeDesk
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Research/education only, never financial advice.
- Backtest-before-adopt: no strategy ships without historical validation.
- Free data sources only. He trades ES/NQ futures options 0DTE/1DTE, SPX 0DTE/1DTE.

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
