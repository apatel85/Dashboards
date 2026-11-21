# CMO schema — README (WO-02)

TradeDesk scoring revamp, Rev 4 spec §8. The SQL in this folder creates the
`cmo` schema: 11 tables, RLS policies, grants, the `cmo_scorecard` view and
a retention helper. The pipeline writer is `pipeline/lib/supabase-admin.mjs`.

## Files

| File | Lines | What |
|---|---|---|
| `01-cmo-schema.sql` | 347 | Schema `cmo`, the 11 §8.1 tables + indexes, `cmo.is_invited()`, `cmo.trim_retention()` |
| `02-cmo-rls.sql` | 220 | RLS on every table, read/write policies, grants, `cmo_scorecard` view |
| `03-cmo-acceptance-checks.sql` | 326 | WO-02 accept checks. Transactional, ends in ROLLBACK, nothing persists. Staging only. |
| `README-cmo.md` | 177 | This file |

## Manual steps — Ankit (in order)

Staging first. The staging project (a second free project) does not exist
yet — create it before anything below. Nothing in this folder has been
applied anywhere; there are no staging credentials, URLs or keys in this
repo, and none are guessed here.

1. **Create the staging project.** Supabase dashboard → New project →
   name it `tradedesk-staging` (free plan, same region as the live
   project). Save the database password in the Secure Vault, not in the
   repo. Note the project URL (`https://<ref>.supabase.co`) and the
   service key — the pipeline's publish step will need them as GitHub
   secrets later (WO-03/WO-04); do not paste them into any file.
2. **Run the invites table in staging.** In the staging SQL editor, run
   `tradedesk-invites-table.sql` (same folder) so `public.tradedesk_invites`
   exists — `cmo.is_invited()` reads it. (No seed emails in the file; the
   acceptance script inserts its own test invite inside its transaction.)
3. **Run `01-cmo-schema.sql` in the staging SQL editor**, then
   **`02-cmo-rls.sql`**. Order matters (02 references objects from 01).
   Both are re-runnable (`if not exists` / `drop policy if exists` /
   `create or replace`); they do not delete data. If you re-run them after
   a schema change, note they do not add new columns — column changes go
   in a new migration file.
4. **Expose the schema to PostgREST.** Staging dashboard → Settings →
   Data API → Exposed schemas → add `cmo`. Until this is done, every
   PostgREST request to a `cmo_*` table returns 406 "Invalid schema" —
   the schema is invisible even though the tables exist. (Same step the
   `dealfinder` / `cricmax` schemas needed.)
5. **Run `03-cmo-acceptance-checks.sql` in the staging SQL editor.**
   Edit only the two emails at the top. Every NOTICE line must say PASS.
   See "Acceptance" below. Nothing persists (ends in ROLLBACK).
6. **Verify over HTTP** (optional, staging): with the staging service key
   as `STAGING_SERVICE_KEY` in your shell (never in a file):
   `curl -s -H "apikey: $STAGING_SERVICE_KEY" -H "Authorization: Bearer $STAGING_SERVICE_KEY" -H "Accept-Profile: cmo" "https://<staging-ref>.supabase.co/rest/v1/cmo_runs?select=run_id&limit=1"`
   → `[]`. Without the `Accept-Profile: cmo` header the same request 404s
   — PostgREST looks in `public` (see "Profile headers" below).
7. **Live project: do nothing yet.** The same three files go to the live
   project only after staging passes AND you say go. The live run is
   steps 2–5 again, against the live project, with the live invite list
   already in place (step 2 is a no-op there — the table exists).

## Acceptance (what 03 checks)

- As an invited user, SELECT works on the eight read tables and FAILS on
  the two service-only tables (`cmo_backtest_cases`,
  `option_chain_snapshots`).
- As a signed-in user NOT on the invite list, every SELECT returns
  nothing — including the `cmo_scorecard` view.
- An insert into `cmo_live_signals` with someone else's `user_id` is
  refused; an insert with the caller's own `user_id` succeeds.
- The scorecard view math on the seed rows: 2 calls, 1 win, win rate 0.5,
  stated_p 0.55, base_rate 0.31, never-triggered 1 of 2.
- The service path (the SQL editor session, which bypasses RLS like the
  service key does) sees everything.

## The two hard lessons (do not skip)

1. **Grants.** A table with the right RLS policy but no GRANT still
   returns 42501 ("permission denied") from PostgREST. That is why
   02 grants USAGE on the schema to anon/authenticated/service_role and
   SELECT on the read tables to authenticated. If a future table 403s,
   check its grant before its policy.
2. **Profile headers.** Tables in a non-`public` schema need
   `Accept-Profile: cmo` on reads and `Content-Profile: cmo` on writes,
   or PostgREST looks in `public` and the table is "not found" (404).
   The pipeline writer (`pipeline/lib/supabase-admin.mjs`) sends both.
   From the browser, supabase-js needs `.schema('cmo')` on the query
   (app wiring is a later work order, not WO-02).

## What the tables store (§8.1, §6.4, §7)

- `cmo_runs` — one nightly build (regime + counts as jsonb).
- `cmo_candidates` — one candidate in one run, with the §6.4
  probabilities (`p_t1..p_t3`, `prob_detail`), `tier`, `high_probability`.
- `cmo_dte_plan` — one session's pre-open plan (§7.2 payload).
- `cmo_live_signals` — one live trigger or option play (browser).
- `cmo_predictions` — one logged call and its outcome (§8.3 grading).
- `cmo_prob_tables` — one bucket × tier (§6.4), with OOS columns.
- `cmo_validation` — one module's verdict (WO-03 defines the verdict
  vocabulary; this file keeps it free text on purpose).
- `cmo_backtest_runs` / `cmo_backtest_cases` — backtest runs and their
  per-candidate outcomes (WO-03).
- `market_reference` — reference symbols (SPY, QQQ, ES, NQ, VIX, TNX).
- `option_chain_snapshots` — chains, strikes within ±15% of spot only,
  chosen contract + three tier strikes (WO-12).

`bucket_key` format (from the WO-01 library, `lib/cmo/tiers.mjs`):
`setup|direction|grade|adrBand|atrBand`, e.g. `A1|long|A|adr5-8|atr0-1`.
ADR bands: `adr<3`, `adr3-5`, `adr5-8`, `adr8+`. ATR bands: `atr0-1`,
`atr1-2`, `atr2+`.

`prob_detail` shape: `{"t1": {"p","cases","ci_low","ci_high","base_rate",
"lift","fallback"}, ...}` with fallback one of `full` | `no-atr` |
`no-adr` | `merged-grade` (§6.4 step 3).

`outcome` shape (`cmo_predictions`): `{"triggered": bool, "entry_price",
"entry_ts", "hit_t1","hit_t2","hit_t3", "sessions_to_t1",
"best_move_pct", "worst_against_pct", "basis": "extremes"|"close",
"touch_t1","touch_t2","touch_t3"}`. Touch fields are option plays only:
close-based `hit_*` is the judged metric (§3.1); touch is recorded
alongside and never judged.

## Retention (§8.4)

- `cmo_candidates` keeps 180 sessions; `option_chain_snapshots` keeps 30
  sessions. `cmo.trim_retention()` deletes the older rows and returns
  `{candidates_deleted, snapshots_deleted, ...}`. The pipeline calls it
  (service role, via RPC) after a publish. `cmo_predictions` is never
  trimmed. The free tier is ~500 MB (WO-00 confirmed); WO-12 measures the
  real snapshot size over its first week and adjusts before continuing.

## Append-only tables

- `cmo_live_signals` and `cmo_predictions` have uuid PKs and no natural
  conflict key, so the writer inserts (never upserts) them. Re-running a
  publish would insert duplicate rows — the publish step must guard
  re-runs (e.g. check for existing rows for the run/session first). Every
  other table upserts on the conflict keys in `ON_CONFLICT`
  (`pipeline/lib/supabase-admin.mjs`), so re-running a publish is
  idempotent for those.

## Judgment calls (spec §8 leaves these open)

1. **Schema name.** §8 names no schema; the tables live in schema `cmo`
   (task instruction; one schema per app, like `dealfinder`/`cricmax`).
2. **Kind vocabularies.** §8 lists the `kind` columns without values.
   Implemented: predictions `candidate|trigger|stock_trigger|stock_orb`;
   live_signals `trigger|stock_trigger|stock_orb`; prob_tables
   `stock|option`. `setup` on predictions is NULL for `stock_orb` plays
   (an opening-range play has no breakout setup).
3. **Live-signal insert policy is invite-gated.** §8.2's letter says "a
   signed-in user may insert rows carrying their own user_id". The
   implemented policy ALSO requires `cmo.is_invited()`, because the app
   is invite-only and a signed-in non-invitee (any Google sign-in) would
   otherwise be able to write signals. The acceptance script tests the
   stricter rule. If Ankit wants the letter of §8.2 instead, delete
   `cmo.is_invited() and` from the `cmo_live_signals_insert_own` policy.
4. **Scorecard base_rate.** §8.3 wants "the base rate" per group, but the
   prob tables store base rates per bucket, not per group. The view uses
   the average base_rate over the prob-table rows for the buckets the
   group covers (same setup/direction/grade, same tier). NULL until WO-03
   publishes its first tables.
5. **Foreign keys.** Only `cmo_candidates.run_id → cmo_runs` and
   `cmo_backtest_cases.run_id → cmo_backtest_runs` (the writer always
   writes the parent first). Everything else is key-free so a late or
   partial publish never blocks on ordering.
6. **`cmo_validation.verdict`** is free text — WO-03 defines the verdict
   vocabulary; this file does not invent it.
7. **`trim_retention()`** treats a snapshot "session" as an ET calendar
   day (snapshots are intraday timestamps).

## Pending the staging project

- Everything in this folder is unapplied. The SQL has not been run
  anywhere (no live writes, no staging writes — the project does not
  exist yet).
- The acceptance script (03) has not been run — it needs the staging
  project.
- The pipeline writer (`supabase-admin.mjs`) has not connected to any
  database — its dry-run output is in the WO-02 report.
- The browser side (supabase-js `.schema('cmo')` reads, live-signal
  inserts from `src/lib/cmo-live.ts`) is a later work order, not WO-02.
