# AGENTLOG — TradeDesk
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Research/education only, never financial advice.
- Backtest-before-adopt: no strategy ships without historical validation.
- Free data sources only. He trades ES/NQ futures options 0DTE/1DTE, SPX 0DTE/1DTE.

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
