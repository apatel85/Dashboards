# TrainAPuppy V2 — Simba's Training Dashboard

A rebuilt, mobile-friendly training tracker based on the 8-week evidence-based puppy curriculum
(AVSAB / Dunbar Academy standards, cross-checked against the Tom Davis "No Bad Dogs" Kickstart course).
V2 keeps everything V1 did and fixes ten issues found in a full code review of the original.

## What's new in V2
- **Conflict-safe cloud sync** — every exercise carries an `updatedAt` timestamp; pulls *merge*
  per-exercise (newer wins) instead of overwriting. Logging on your phone and laptop can no longer
  wipe each other out.
- **Auto-sync** — with a token saved, the app pulls on load and auto-pushes ~4 seconds after each
  change. The manual Push/Pull buttons remain for control.
- **Correct dates** — V1 used UTC dates, so "today" rolled over at 8pm Eastern (mid-evening-session).
  V2 uses your local timezone for streaks and practice dates.
- **True training-day streak** — the streak card now counts consecutive days you actually trained,
  not the best single-exercise streak.
- **Weighted progress** — "practicing" skills count half credit, so the bar moves as you work.
- **Undo** — every log action gets an Undo button; accidental taps no longer corrupt stats.
- **Session timer** — 5/10/15-minute countdown with a completion nudge to end on a success.
- **Actually installable PWA** — real 192/512px PNG icons (plus maskable variants); V1's SVG data-URI
  icon fails Chrome's installability check, so the install prompt never appeared.
- **XSS-safe notes** — notes are HTML-escaped before rendering.
- **Curriculum-proof** — adding/removing exercises in `curriculum.json` no longer crashes the app;
  missing progress entries are created automatically on load.
- **Least-privilege token** — setup now calls for a *fine-grained* token scoped to this repo only
  (Contents: read & write), not a classic token with full `repo` scope.
- **Cleaner service worker** — old caches are purged on activation; icons are cached for offline use.

## Features (kept from V1)
- **Today's Recommended Session** — highlights the current or next ideal training window and the
  exercises to focus on.
- **8 weeks of curriculum**, each exercise with Goal, Steps, Reward Timing, and Common Mistake.
- **Progress tracking** per exercise: Not Started / Practicing / Consistent, success-rate logging,
  day streaks, and notes.
- **Overall progress bar** and stat cards.
- **Cloud sync across devices** via the GitHub Contents API — no separate backend needed.
- **Installable PWA** — add to your phone's home screen; works offline for viewing.

## Ideal Training Time Windows (built from Simba's daily schedule)
| Window | Time | Best for |
|---|---|---|
| Morning Active & Social Block | 7:55–8:45 AM | New commands, name recognition, impulse control |
| Midday Active Block | 12:10–1:15 PM | Repetition of known commands, place duration |
| Afternoon Exposure & Walk | 4:00–5:15 PM | Leash skills, socialization, sound desensitization |
| Stationed Settle & Chew | 7:25–8:15 PM | Settle, calm place work, guest greeting rehearsal |

## Setting Up Cross-Device Cloud Sync
1. On GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Set **Resource owner** to your account, **Repository access** to "Only select repositories" → choose `Dashboards`.
3. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**. Nothing else is needed.
4. Open the dashboard, click the ⚙️ gear icon top-right, paste the token (starts with `github_pat_`), click **Save & Connect**.
5. The app pulls on load and auto-pushes after each change. Use Push/Pull manually any time.

The token is stored only in each browser's local storage and is sent directly to GitHub's API —
never anywhere else. Revoke it on GitHub any time from the same Developer Settings page.

> **Privacy note:** this repo is public, so `progress.json` (your training notes) is publicly
> readable. If that bothers you, move the app to a private repo — sync works identically.

## Deploying with GitHub Pages
Repo **Settings → Pages → Build and deployment → Deploy from a branch**, select `main`, `/ (root)`.
The app will be reachable at:

`https://apatel85.github.io/Dashboards/TrainAPuppyV2/`

## Files
- `index.html` — app shell and layout
- `style.css` — styling
- `app.js` — all interactivity, progress logic, merge-safe GitHub sync
- `curriculum.json` — the full 8-week curriculum data (edit freely; the app reconciles)
- `progress.json` — the cloud-synced progress snapshot (auto-managed; don't hand-edit while syncing)
- `manifest.json` / `service-worker.js` / `icons/` — PWA install + offline app-shell caching
