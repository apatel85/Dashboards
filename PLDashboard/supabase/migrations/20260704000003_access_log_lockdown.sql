-- ─────────────────────────────────────────────────────────────────────────
-- 20260704000003_access_log_lockdown.sql
-- Let the app keep writing sign-in attempts to pl_access_log, but stop the
-- public anon key from reading the whole log back.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.pl_access_log enable row level security;

-- Allow inserts (the app logs "checking / granted / denied" events) ...
drop policy if exists "anon can insert access logs" on public.pl_access_log;
create policy "anon can insert access logs" on public.pl_access_log
  for insert to anon with check (true);

-- ... but grant NO select policy, and revoke any direct read grant, so the
-- public key can never dump the log.
revoke select on table public.pl_access_log from anon;

-- ── Verify after running ───────────────────────────────────────────────────
-- Reading the log with the anon key should now return nothing / an error:
--   curl "$SUPA_URL/rest/v1/pl_access_log?select=*&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- Note: this still lets a holder of the anon key write *fake* entries (any
-- email). That's low-risk audit noise. To eliminate it, move the logging call
-- inside verify_license so only genuine checks are recorded.
