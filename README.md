# _incoming/ — Zip-and-Forget Dashboard Deployment

## How it works

1. Build your dashboard locally (or have it generated) as a self-contained folder,
   e.g. `CapitolPulse/` with `index.html`, `assets/`, `data/`, etc.
2. Zip the **contents** of that folder into a single file named exactly after the
   folder you want created, e.g. `CapitolPulse.zip`.
   - IMPORTANT: zip the *contents*, not the folder itself with an extra nesting level.
     The workflow auto-flattens one level of nesting if your zip tool adds it anyway,
     but flat zips are safest.
3. On GitHub.com, go to this repo -> `_incoming/` folder -> "Add file" -> "Upload files"
   -> drag in `CapitolPulse.zip` -> commit directly to `main`.
4. GitHub Actions automatically detects the new zip, extracts it into a new top-level
   folder `Dashboards/CapitolPulse/`, deletes the zip, and commits the result — no
   local git commands needed.
5. Within a minute or two, your dashboard is live at:
   `https://apatel85.github.io/Dashboards/CapitolPulse/`
6. Add a new card to the root `index.html` pointing to `./CapitolPulse/index.html`
   (see ROOT_INDEX_CARD_SNIPPET.html in this kit for ready-to-paste markup).

## Rules

- One zip = one new dashboard folder. Zip filename (minus `.zip`) becomes the folder name.
- Do not re-upload a zip with the same name as an existing dashboard folder unless you
  intend to overwrite/update it — the workflow will merge/overwrite files in place.
- Very large zips (>25MB) should be uploaded via `git push` locally instead of the
  GitHub web UI, since the web uploader has a per-file size limit.
- Check the "Actions" tab after uploading to confirm the extraction workflow succeeded.
