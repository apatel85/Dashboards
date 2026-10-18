# QA Capture v2

Flag issues on **any site you test**. Records your click trail + screenshot and files the bug to the QA dashboard **you choose** — or create a new dashboard right from Settings.

## Install

**Desktop (Chrome / Edge / Brave):**
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this folder.
3. Click the extension icon → **⚙️ Settings** → paste your GitHub token (Contents read & write on your Dashboards repo) → Save.

**Android tablet (Chrome for Android does NOT support extensions):**
1. Install **Quetta**, **Mises**, or **Edge Canary** from the Play Store.
2. Open its Extensions page, enable Developer mode, load this folder (`+(from .zip)` — use the zip below) or install from the Chrome Web Store if published.
3. Same Settings step as desktop. The flag button and form are touch-sized; taps are recorded as clicks.

**iPad:** not supported — Apple doesn't allow Chrome extensions on iOS. (A Safari Web Extension port would be a separate build.)

> If v1 was installed, remove it first — v1 and v2 would both inject the flag button on Quixera domains.

## Use

1. Browse the site you're testing. The 🚩 button appears bottom-right on watched sites.
2. When you find an issue, hit 🚩, pick the **dashboard project** (auto-selected for the current site), fill title / severity / expected / actual.
3. **Capture & send** — screenshot + click trail + description are committed to the repo. The bug appears on that project's dashboard within ~10 minutes (auto-rebuild watcher).

## Projects & dashboards

Settings → **Projects**: each project = name + watched hosts (one per line; `quixeraos.com` matches all its subdomains) + dashboard folder.

**＋ New project / dashboard**: name it, add hosts, Save — the dashboard folder (`bugs/`, `data/base.json`) is created in the repo automatically and a dashboard page is generated for it on the next watcher run:
`https://<user>.github.io/Dashboards/<Folder>/`

Pre-seeded: **Quixera Dev** (`facility-dev.quixeraos.com` → `QuixeraDev`) and **Quixera UAT** (`facility.quixeraos.com` → `QuixeraUAT`).

## Files

- `manifest.json` — MV3, matches all URLs (activates only on watched hosts)
- `background.js` — project matching, GitHub API, screenshots, filing, scaffolding
- `content.js` — click-trail recording, flag button, issue form
- `popup.html/js` — toolbar popup: current project, quick flag, settings link
- `options.html/js` — settings: token, repo, project CRUD, dashboard creation
