# Quixera QA Capture (Chrome extension)

Records your click trail while you test the Quixera app. Hit the red **🚩 Flag issue**
button the moment you see a bug, fill in the title + what went wrong, and it captures
your click steps, the page URL and a screenshot — then commits it to this repo, which
triggers the dashboard rebuild (~2 min).

## Install (one time)
1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. **Load unpacked** → select this `extension/` folder.
3. Click the extension icon → paste your GitHub personal access token
   (needs `Contents: read & write` on the `Dashboards` repo) → Save settings.

## Use
1. Open the dev app (`facility-dev.quixeraos.com`) — recording starts automatically.
   The floating bar shows your step count; pause with ⏺/⏸ if needed.
2. When you spot an issue, click **🚩 Flag issue**, fill in the form, hit
   **Capture & send to dashboard**.
3. The bug appears at https://apatel85.github.io/Dashboards/QuixeraDev/ in ~2 minutes
   under the **Manual** filter.

## Notes
- Bugs land as `QuixeraDev/bugs/MAN-<timestamp>.json` (+ screenshot in `bugs/shots/`).
- The GitHub Action `.github/workflows/qxr-qa-rebuild.yml` rebuilds `index.html` on every push.
- Your token is stored only in the extension's local storage on your machine.
