-- ─────────────────────────────────────────────────────────────────────────
-- 20260704000001_verify_license.sql
-- Stop the public anon key from reading pl_licensed_users (emails + license
-- keys). Verification goes through a SECURITY DEFINER function that returns
-- only safe fields; the table itself becomes unreadable by anon.
--
-- The app (index.html / pl-dashboard-v8.html) already calls this RPC. Run this
-- migration BEFORE deploying that HTML, or sign-in will fail closed until the
-- function exists.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Verifier: runs as owner, so anon never needs table access. Returns
--    everything the app uses EXCEPT the license key. p_key is optional so the
--    same function serves Google sign-in (email only) and license-key sign-in.
create or replace function public.verify_license(p_email text, p_key text default null)
returns table (email text, name text, plan text, status text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.email, u.name, u.plan, u.status, u.expires_at
  from pl_licensed_users u
  where lower(u.email) = lower(p_email)
    and (p_key is null or u.license_key = p_key)
  limit 1;
$$;

-- 2) Only the app may execute it; nothing else.
revoke all on function public.verify_license(text, text) from public;
grant execute on function public.verify_license(text, text) to anon, authenticated;

-- 3) Lock the table: RLS on + no anon policy => the public key reads nothing
--    directly. The function still works because it runs as its owner.
alter table public.pl_licensed_users enable row level security;
revoke all on table public.pl_licensed_users from anon;

-- ── Verify after running ───────────────────────────────────────────────────
-- Direct read should now return nothing / permission error:
--   curl "$SUPA_URL/rest/v1/pl_licensed_users?select=email,license_key&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
-- The RPC should return the safe row for a real customer:
--   curl -X POST "$SUPA_URL/rest/v1/rpc/verify_license" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H "Content-Type: application/json" \
--     -d '{"p_email":"customer@example.com"}'
