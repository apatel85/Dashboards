# v9 tests

Unit + integration tests for the P&L Dashboard v9 rebuild. Each suite
**extracts the current code from `../index.html` at runtime** (top-level
functions + consts by name), so the tests always exercise the real build —
no stale copies.

Run everything: `bash tests/run.sh` (or `node tests/<suite>.test.js`).

| Suite | What it covers | Cases |
|---|---|---|
| `v9_auth.test.js` | Phase 1d: magic-link auth, server-validated sessions, tier checks, offline grace, key redemption | 36 |
| `v9_sheetdb.test.js` | Phase 2: v9 row serialization, sheet fetch/parse (v9 + legacy v8), soft-delete, row-map | 21 |
| `v9_merge.test.js` | Phase 2: pull-merge last-write-wins, soft-delete propagation, duplicate conflicts | 10 |
| `v9_sync_integration.test.js` | Phase 2: write-through queue → flusher → Sheets API; offline replay; full-push coalescing; dead-token retention; boot heal | 26 |

**129 cases total.** The integration suite uses an in-memory IndexedDB
stand-in and a fake Sheets API grid — no network, no credentials.
