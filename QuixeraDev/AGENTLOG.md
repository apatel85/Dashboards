# AGENTLOG — QuixeraDev (QA Capture dashboard + extension)
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- NEVER modify the original Quixera app/codebase — enhancements live only in the demo replica and this tooling.
- Live-app review strictly read-only. Never invent a bug — report BLOCKED if blocked.
- Filings: per-user identity; delete = filer only; status = anyone; every change in the audit log.

## 2026-10-20 — v3.9.0 extension
- **Request:** roll out to the QA team with per-user identity.
- **Change:** per-user token onboarding, guided GitHub connect card, baked defaults (repo apatel85/Dashboards). Chrome Web Store package approved (Unlisted).
- **Version:** v3.9.0.
- **Verified:** partial — awaiting his on-phone confirmation; popup-open capture failure still open (awaiting his diagnostic answer); dashboard auto-rebuild via Actions offered (PAT lacks Workflows scope).
