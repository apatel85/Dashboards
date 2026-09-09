# TrainAPuppy — Simba's Training Dashboard

An interactive, mobile-friendly training tracker built from an 8-week evidence-based puppy curriculum
(AVSAB / Dunbar Academy standards, cross-checked against the Tom Davis "No Bad Dogs" Kickstart course).

## Features
- **Today's Recommended Session** — automatically highlights the current or next ideal training window based on Simba's daily schedule, and the exercises to focus on.
- **8 weeks of curriculum**, each exercise with Goal, Steps, Reward Timing, and Common Mistake to avoid.
- **Progress tracking** per exercise: Not Started / Practicing / Consistent status, success-rate logging, day streaks, and notes.
- **Overall progress bar** and stat cards (streak, consistent skills, practicing, not started).
- **Cloud sync across devices** via the GitHub Contents API — no separate backend needed.
- **Installable PWA** — add to your phone's home screen for app-like access, works offline for viewing (sync requires internet).

## Ideal Training Time Windows (built from Simba's daily schedule)
| Window | Time | Best for |
|---|---|---|
| Morning Active & Social Block | 7:55–8:45 AM | New commands, name recognition, impulse control |
| Midday Active Block | 12:10–1:15 PM | Repetition of known commands, place duration |
| Afternoon Exposure & Walk | 4:00–5:15 PM | Leash skills, socialization, sound desensitization |
| Stationed Settle & Chew | 7:25–8:15 PM | Settle, calm place work, guest greeting rehearsal |

## Setting Up Cross-Device Cloud Sync
Progress auto-saves to this browser's local storage on every device by default. To make it sync across
**all** your devices (phone, tablet, laptop) via the internet, connect it to this GitHub repo:

1. On GitHub, go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. Generate a new token with the **`repo`** scope only (needed to read/write `progress.json` in this repo).
3. Open the dashboard, click the ⚙️ gear icon top-right.
4. Confirm Owner = `apatel85`, Repo = `Dashboards`, Path = `TrainAPuppy/progress.json`, Branch = `main`.
5. Paste your token, click **Save & Connect**, then **Push To Cloud** once to upload your current progress.
6. On any other device, open this same dashboard URL, open Settings, paste the **same token**, and click **Pull From Cloud** to load the latest progress.

The token is stored only in each browser's local storage and is sent directly to GitHub's API — it is
never transmitted anywhere else. Treat it like a password; revoke it on GitHub any time from the same
Developer Settings page.

## Deploying with GitHub Pages
If this repo has GitHub Pages enabled (check the existing `render.yaml` / `auto-deploy-zip.yml` workflows
already in this repo), this dashboard will be reachable at:

`https://apatel85.github.io/Dashboards/TrainAPuppy/`

If Pages isn't enabled yet, go to **Repo Settings → Pages → Build and deployment → Deploy from a branch**
and select `main` with the `/ (root)` folder.

## Files
- `index.html` — app shell and layout
- `style.css` — styling
- `app.js` — all interactivity, progress logic, and GitHub sync
- `curriculum.json` — the full 8-week curriculum data (edit this to adjust exercises)
- `progress.json` — the cloud-synced progress snapshot (auto-managed by the app; don't hand-edit while syncing)
- `manifest.json` / `service-worker.js` — PWA install + offline app-shell caching
