# AGENTLOG — CricMaxConnect

## 2026-10-25 — Tracker v2.1: ID width, sorting, Timeline, due-date editing
- Fixed ID column wrapping (C-01 split across lines) with nowrap + fixed width; owner column also no-wrap.
- Sorting control on All Tasks: Due date (soonest first, default), ID, Priority. Due sort = open work first, dated ascending, then relative-due, then no due, Done sinks to bottom; choice persists per browser. Due chips added (in Xd / overdue Xd / due today).
- New Timeline view: tasks grouped Overdue / Due within 7 days / Due within 30 days / Later / No fixed date; tap a task to jump to it in All Tasks.
- Due-date editing: Due column becomes an editable field when the bridge is connected; updateDue bridge action writes column G to the workstream tab + Master Tracker clean row (same pattern as updateStatus). Editing banner on Tasks view explains the bridge requirement while unconnected.
- Verification: Node tests against live sheet CSVs (sort orders, buckets, chips, KPIs) all pass; Pages verified 200 with v2.1 markers.

## 2026-10-25 — Task tracker v2: all tabs, reminders, two-way bridge (replaces v1)
- Rebuilt task-tracker.html from the sheet's real structure: reads all 6 tabs (Cover, Master Tracker, Social Media, Quixera, CricMax Connect, Decisions & Notes) and aggregates into one view — 30 tasks (S-01..S-10, Q-01..Q-10, C-01..C-10), KPIs 30/1/1/0/28, Decisions in 3 sections (8/3/4).
- Workstream tabs are canonical; Master Tracker merged by ID. C-01..C-03 exist only in Master's summary row 1, so they are shown from a verified reconstruction (badge 'Recovered') until that row is expanded in the sheet.
- Refresh: fresh fetch on every visit, auto-refresh every 24h while open, refresh on tab return, Force Refresh button, last-synced stamp. No AI agent involved.
- Reminders: in-page Overdue / Due-soon (7d) / Upcoming alerts from real due dates + optional browser notifications. Daily email digest via Apps Script trigger (code in tracker-apps-script.gs).
- Two-way sync: status dropdowns + add-task form write through an Apps Script web app bridge (updateStatus/addTask; writes workstream tab + Master Tracker). Dashboard ships bridge-ready but read-only until the script URL is pasted in About & Setup (one-time deploy by a sheet editor; see setup steps in the dashboard).
- Verification: dashboard JS unit-tested in Node against live sheet CSVs (19 assertions: counts, KPIs, alerts, decisions, cover); Pages verified 200 with v2 markers. Existing index.html untouched.

## 2026-10-25 — Ankit x Arpit sheets task tracker (new)
- Request: upload the Gemini-built task tracker dashboard into the CricMaxConnect folder and make it accessible, synced to the Google Sheet.
- Added: `CricMaxConnect/task-tracker.html` — live at https://apatel85.github.io/Dashboards/CricMaxConnect/task-tracker.html
- Source: Google Sheet Master Tracker tab (ID 1JL8nit7_f-Xp_F9Pa0R8te56h8HZvG0IMdQoANd3h2A), fetched as gviz CSV, auto-refresh every 45s + Force Sync button.
- Fix applied before publishing: the uploaded file parsed the CSV with header:true, but the sheet's first row is an aggregate cell block (S-01..C-03 crammed into single cells) and has no Workstream column, so it would have rendered blank rows. Parser changed to positional columns, aggregate row skipped, workstream derived from Task ID prefix (S/Q/C). Verified against live CSV: 7 rows render (C-04..C-10), KPIs 7/1/0/0/6.
- Known limits (not fixed): dashboard is read-only — edits must happen in the sheet; the 23 tasks trapped in the sheet's aggregate row 1 (S-01..S-10, Q-01..Q-10, C-01..C-03) do not display until that row is expanded into one row per task in the sheet.
- Verification: GitHub Pages returned 200 with the fixed parser present (after ~80s publish delay). Existing index.html (Supabase monitor) untouched.
