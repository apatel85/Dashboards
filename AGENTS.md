# AGENTS.md — AI agents read this first

This repo (`apatel85/Dashboards`) hosts Ankit's live web apps, one directory per app.
It is **PUBLIC** — never put secrets, API keys, or personal data in any file here.

## Pickup protocol
1. Read that app's `AGENTLOG.md` **FIRST** (newest entry at top). It logs every update:
   date, what was requested, what changed, version, verification status.
2. `Verified: no` or `awaiting on-phone confirmation` means the fix is **NOT proven** —
   do not build on it as if it works. Re-verify against the user's actual failing case.
3. Standing decisions live in each log's Decisions section — don't re-litigate them.

## Apps
| Dir | App |
|---|---|
| TradeDesk/ | stock research hub |
| WagWise/ | dog-care PWA |
| QuixeraDev/ | QA Capture dashboard + extension |
| QuixeraDemo/ | Quixera UX demo replica (live app is read-only, never touch) |
| PLDashboard/ | P&L Dashboard v9 |
| KineticMusic/ | KINETIC // Studio music app |
| VoiceInsight/ | meeting summarizer |
