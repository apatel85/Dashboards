# DealFinder — Agent Log

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
