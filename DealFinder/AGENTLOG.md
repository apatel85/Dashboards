# DealFinder — Agent Log

## 2026-11-13 — P3.1: scored search, per-unit best deal, flyer clipping (v1.1.0)

- **Request:** Ankit (on his phone): "Search terms are not working properly" + every product must show count, pound weight where applicable, and per-pound pricing, with the best deal judged on that (12ct vs 24ct eggs: cheaper per-egg wins); add a direct link to show the product if one exists; hide the availability/flyer-validity line from the top or move it to another tab.
- **Changed:** `DealFinder/app.js` + `index.html` —
  - Search is now scored relevance (full phrase > all terms > any term, plural-insensitive: "egg" matches "Eggs", "whole milk" ranks the two whole-milk items first), ties break by best unit value on a shared basis, then shelf price. (Was: AND-substring, so "whole milk" returned nothing and "egg" missed "Eggs".)
  - Per-unit on every card where computable: pack size from the item ("10 ct", "3 lb") + per-unit price derived from stored data — per-egg/per-count for packs, per-lb for weights (converted from the stored kg basis), per-oz where the pack was sold in ounces. Never invented: 224 of 237 items carry no size in their names, so those cards show no size line.
  - Best deal is now crowned by unit price when an item's rows share a comparable basis (same per-egg/per-lb/per-oz), with a "Best per egg/lb/oz" tag and a like-for-like "Save $X per egg" line; falls back to shelf price otherwise. Limit deals still never win.
  - Expanded card now shows the flyer clipping ("See it in the flyer", from `clipping_image_url` — all 254 price rows carry one). No retailer product link exists in the Flipp data (`details_url` is empty), so none was invented.
  - Card top no longer shows the store or flyer validity: it leads with name, pack size, per-unit price, best-deal tag. Store + "ends {date}" stay only in the expanded compare table and the Stores tab; the page-level "checked" line moved to the More tab ("Prices checked …"). List rows and basket totals still name stores (they are store-pricing views by design).
  - No pipeline change: no live item name contains "dozen" (checked all 237 names), and every name carrying a size token is already parsed — the parser has nothing to gain this week. Full count/lb coverage needs clipping-image OCR (follow-up, not built).
- **Verification:** `node --check` clean; crown logic unit-tested in Node (11/11: 12ct-vs-24ct per-egg crown, per-lb crown, single-unit-row fallback, limit exclusion, per-oz/per-lb display math). Local render gate PASS at 390/768/1280px, and live URL gate PASS at 390/768/1280px (Playwright, published URL): zero console errors, no overflow; search tests — milk 26, eggs 13, egg 13 (same set), whole milk first two are the two whole-milk items, chicken breast 7; Galbani card shows "$12.50 per lb" + "3 lb"; clipping image loads in the expanded card (352px natural width); history "building history"; More tab shows the checked line. Screenshots in `~/workspace/dealfinder-p31/verify/shots/`.
- **Egg acceptance test — honest outcome:** no two comparable egg sizes exist this week. All 13 egg items have exactly one price row each and none carries a size or unit price, so no per-egg crown can fire; every egg card reads "Best price" (shelf). The per-egg crowning code is live and unit-tested — it will fire the week the data has two comparable egg packs.
- **Tracker:** DealFinder entry updated in place (v1.1.0).

## 2026-11-13 — P3: live app v1.0.0

- **Request:** Ankit: "Yes, build the live app" (P3 go-ahead after P2 went green with 254 live prices).
- **Changed:** new live frontend in `DealFinder/` — `index.html` (mockup design system ported: bright supermarket tokens, Archivo/Libre Franklin/IBM Plex Mono, 348px rail ≥920px, bottom tab bar ≤919px, compact mobile), `app.js` (live data layer), `config.js` (public anon key only — never the service-role key). Reads real prices via PostgREST (anon key + `Accept-Profile: dealfinder`); search by name, UPC lookup + camera scan (BarcodeDetector), Deals from real was-prices, My list with basket totals + split-the-list saving, Track with 30-day-average alerts (history building — one snapshot so far, no alert can fire yet), ZIP-driven with localStorage. Price rules: every price shows store + flyer end date; limit-style conditions never crowned best; ShopRite absent (no flyer data) and never faked.
- **Verification:** local render gate PASS at 390/768/1280px (Playwright): zero console errors, no horizontal overflow, 237 items / 18 stores / checked Nov 13; milk search 26 real rows ($0.79 ALDI first); Deals 9 real was-price deals; expanded card shows compare table + "building history" (no invented history). Two fixes from the render check: section-head wrap at phone width, date-only history date off-by-one (UTC-midnight vs ET). Live URL check PASSED Nov 13 (Playwright, published URL, 390/768/1280px): HTTP 200 on index.html/app.js/config.js; zero console errors, no horizontal overflow; 237 items / 18 stores / checked Nov 13; milk search 26 real rows ($0.79 ALDI first); Lucerne eggs $0.99 at Acme present as best price for its item and correctly absent from Deals (no was-price); Deals 9 real was-price deals. Tracker entry verified live on the tracker page.
- **Tracker:** App Repo Tracker entry added (Live Apps, top).

## 2026-11-13 — P2 fix: dedup upsert batches by conflict key (v0.2.4)

- **Request:** Ankit pasted the re-run log: `Supabase upsert prices failed: 500 21000 ON CONFLICT DO UPDATE command cannot affect row a second time` (run after the grants fix).
- **Progress confirmed:** the grants fix worked — stores + 90 flyers wrote before the failure. The run is not atomic, so partial data persists and the re-run merges idempotently.
- **Cause:** the prices batch contained two rows with the same conflict key (item_id, store_id, flyer_item_id, valid_from, valid_to). Dedup ran per search only, but the seed searches overlap — the same flyer item is found by both "juice" and "orange juice" — so the same price row appeared twice in one batch and Postgres rejected the whole command.
- **Changed:** `DealFinder/pipeline/fetch-prices.mjs` — new exported `dedupeByKey(rows, keyFn)` helper, applied to all four upsert batches keyed on each batch's conflict target; prices logs how many duplicates were dropped. Lesson: dry-run cannot catch this (it skips writes) — the first live write is the real test for upsert conflicts.
- **Ankit's step:** just re-run the workflow — no SQL needed this time. Expected: green run, ~264 prices.
- **Verification:** fix pushed + node --check clean; live file re-verified via API; workflow re-run + row counts still pending.

## 2026-11-13 — P2 fix: grant pipeline writes to service_role (v0.2.3)

- **Request:** Ankit pasted the failed run log: `Supabase upsert stores failed: 403 42501 permission denied for table stores` (run 43487146422).
- **Cause:** the DDL granted only SELECT to `service_role`. RLS bypass does not help without the underlying table grant — PostgREST returns 42501 on the first upsert. (Same lesson as CricMax: new schemas need explicit grants.)
- **Changed:** `DealFinder/supabase/001-dealfinder-schema.sql` — added `GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dealfinder TO service_role` + matching `ALTER DEFAULT PRIVILEGES` for future tables. The Flipp side of the failed run was healthy (90 flyers, 264 kept rows across 12 searches; bananas 0 kept — no flyer price this week).
- **Ankit's step:** run just the GRANT block in the SQL Editor, then re-run the workflow. File is idempotent — a full re-run also works.
- **Verification:** fix pushed; live file to be re-verified by raw-URL read; workflow re-run + row counts still pending.

## 2026-11-13 — P2 fix: Supabase auth for new secret keys + profile headers (v0.2.2)

- **Request:** Ankit: "not finding step 3.1" (the service-role key) + pipeline auth review while answering.
- **Changed:** `DealFinder/pipeline/fetch-prices.mjs` — two bugs that would have failed the first live run: (1) the client sent `Authorization: Bearer <key>` unconditionally, which fails JWT verification for new-format secret keys (`sb_secret_...`, not JWTs) — Bearer now goes out only for legacy JWT keys (`eyJ...`); the `apikey` header carries auth for both formats. (2) No `Accept-Profile`/`Content-Profile` headers — PostgREST looks in `public` without them, so the `dealfinder` tables would not be found; both now set to `dealfinder`. Env doc updated to name the secret key (`sb_secret_...`) from Settings → API Keys. `DealFinder/README.md` — repo-secret step now names the secret key and its location.
- **Verification:** fix pushed; live file re-verified by raw-URL read. No live run yet — still blocked on Ankit's manual steps (DDL + secret + workflow run).

## 2026-11-13 — P2 fix: alerts_one_per_day index 42P17 (v0.2.1)

- **Request:** Ankit: SQL error `42P17: functions in index expression must be marked IMMUTABLE` running the migration in the Supabase SQL Editor.
- **Changed:** `DealFinder/supabase/001-dealfinder-schema.sql` — the `alerts_one_per_day` unique index used `(created_at::date)`; casting `timestamptz` to date depends on the session timezone (STABLE, not IMMUTABLE), so Postgres refuses it in an index. Fixed to `((created_at AT TIME ZONE 'UTC')::date)` — pinning UTC makes the expression immutable.
- **Verification:** fix confirmed against PostgreSQL docs (AT TIME ZONE 'UTC' returns timestamp; timestamp-to-date cast is immutable); fixed file verified live on GitHub (raw URL returns 200, new index lines present). Ankit to re-run the fixed file in the SQL Editor (idempotent, safe to re-run).

## 2026-11-12 — P2: backend + pipeline (v0.2.0)

- **Request:** Ankit: "Start P2 — backend + pipeline" (live-app plan, 2026-11-12; probe verdict: partial yes — Flipp returns real sale prices for 4 of the big 5 for ZIP 08520, ShopRite missing).
- **Changed:**
  - `DealFinder/supabase/001-dealfinder-schema.sql` (new) — `dealfinder` schema: `stores`, `items`, `flyers`, `prices` (the 30-day history), `tracked_items`, `alerts`; indexes incl. prices on item+store+fetched_at and flyer_item_id; RLS on all tables with SELECT open to anon/authenticated and no write policies for anon; grants + commented verification queries. Idempotent.
  - `DealFinder/pipeline/fetch-prices.mjs` (new) — Node, built-ins only. Direct Flipp calls (`/flyers`, `/items/search`, locale=en-us, ZIP param, same headers as flipp-cli); 12-item seed staple list; junk filter + dedup + name/size normalization (US units, compound-listing guard); Supabase PostgREST upserts from env keys only; 30-day average of daily best prices; alert rule exactly per plan (below average AND ≥2 snapshots, else "building history"); fails loudly on non-200/429/empty flyers, one 429 retry with backoff.
  - `.github/workflows/dealfinder-refresh.yml` (new) — Fridays 12:00 UTC + workflow_dispatch (ZIP + dry-run inputs); Node 20; SUPABASE_URL from public project URL, SUPABASE_SERVICE_ROLE_KEY from repo secret.
  - `DealFinder/README.md` (new) — what P2 is, pipeline, Ankit's two manual steps, verification queries, dry-run instructions.
- **Version:** v0.2.0 (P2). P0/P1 (Receipt, mockup, probe) were unversioned.
- **Verification:** `node --check` clean; pure-function unit checks pass (size parse incl. compound-listing guard, junk filter, dedup, 30-day average); dry-run for 08520: 96 flyers, 455 raw rows → 336 kept price rows (97 junk dropped, 22 dupes), 296 distinct items, 53 stores; milk/eggs samples match the probe exactly; workflow YAML parses; pushed files return HTTP 200 from raw GitHub URLs.
- **Status:** P2 code delivered, except one file. **BLOCKER: `.github/workflows/dealfinder-refresh.yml` could NOT be pushed** — the stored PAT lacks workflow write scope (403 on that path; the git-trees API also 403s for this PAT). The file is ready at `~/workspace/dealfinder-p2/out/.github/workflows/dealfinder-refresh.yml` — Ankit must add it by hand in the GitHub web UI (`.github/workflows` → Add file → `dealfinder-refresh.yml`, paste the contents) or grant the PAT workflow write access and the file can be pushed. Until the workflow lands, the Friday schedule does not exist; the pipeline can still be run by hand locally (`node fetch-prices.mjs --zip 08520` with the env keys). Live run also blocked on Ankit's two manual steps (run the DDL in the Supabase SQL editor + expose the `dealfinder` schema; add the `SUPABASE_SERVICE_ROLE_KEY` repo secret). After all three, a manual workflow_dispatch run loads the first live prices — that is P2's done state. Live app frontend is P3 (not built).
