# AGENTLOG — WagWise
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Proposal-before-change: never auto-apply; propose, he approves.
- Exact-scenario verification: a fix isn't done until his exact failing case passes on his phone.
- Missing days never influence trend math.

## 2026-10-17 — v3.27.14 quick-log fix
- **Request:** logged pee/poop events vanish on refresh ("Error on update").
- **Change:** strip `_optimistic` flag before every server write.
- **Version:** v3.27.14.
- **Verified:** no — awaiting his on-phone confirmation that logs/edits survive refresh. Server persistence of new events never confirmed (suspected RLS).

## 2026-10-16 — v3.27.12 cache fix
- **Request:** phone stuck on old version despite new deploys.
- **Change:** versioned asset URLs (cache-busting) + network-first service worker.
- **Version:** v3.27.12.
- **Verified:** partial.

## 2026-10-15 — v3.27.11 offline persistence
- **Request:** events lost on refresh.
- **Change:** events saved to phone localStorage at tap time, re-merged on load.
- **Version:** v3.27.11.
- **Verified:** partial.
