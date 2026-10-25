# AGENTLOG — CricMaxConnect

## 2026-10-25 — Ankit x Arpit sheets task tracker (new)
- Request: upload the Gemini-built task tracker dashboard into the CricMaxConnect folder and make it accessible, synced to the Google Sheet.
- Added: `CricMaxConnect/task-tracker.html` — live at https://apatel85.github.io/Dashboards/CricMaxConnect/task-tracker.html
- Source: Google Sheet Master Tracker tab (ID 1JL8nit7_f-Xp_F9Pa0R8te56h8HZvG0IMdQoANd3h2A), fetched as gviz CSV, auto-refresh every 45s + Force Sync button.
- Fix applied before publishing: the uploaded file parsed the CSV with header:true, but the sheet's first row is an aggregate cell block (S-01..C-03 crammed into single cells) and has no Workstream column, so it would have rendered blank rows. Parser changed to positional columns, aggregate row skipped, workstream derived from Task ID prefix (S/Q/C). Verified against live CSV: 7 rows render (C-04..C-10), KPIs 7/1/0/0/6.
- Known limits (not fixed): dashboard is read-only — edits must happen in the sheet; the 23 tasks trapped in the sheet's aggregate row 1 (S-01..S-10, Q-01..Q-10, C-01..C-03) do not display until that row is expanded into one row per task in the sheet.
- Verification: GitHub Pages returned 200 with the fixed parser present (after ~80s publish delay). Existing index.html (Supabase monitor) untouched.
