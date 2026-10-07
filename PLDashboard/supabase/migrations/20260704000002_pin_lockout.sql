-- ─────────────────────────────────────────────────────────────────────────
-- 20260704000002_pin_lockout.sql
-- Add brute-force protection to the 4-digit PIN (10,000 combinations).
--
-- This migration is ADDITIVE and schema-agnostic: it does NOT touch your
-- existing set_user_pin / verify_user_pin / check_user_has_pin functions
-- (whose PIN storage schema we don't assume). It creates an attempts table and
-- three tiny helpers; you then add three lines to your verify_user_pin (see the
-- INTEGRATION block at the bottom).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

-- Remembers recent failures per email.
create table if not exists public.pl_pin_attempts (
  email        text primary key,
  fails        int  not null default 0,
  locked_until timestamptz
);
alter table public.pl_pin_attempts enable row level security;  -- no policy: only functions touch it

-- Is this account currently locked?
create or replace function public.pl_pin_is_locked(p_email text)
returns boolean language sql security definer set search_path = public as $$
  select coalesce(locked_until > now(), false)
  from pl_pin_attempts where email = lower(p_email);
$$;

-- Record a failed attempt. Locks for 15 minutes after 5 fails.
-- Returns remaining tries before lockout (0 = now locked).
create or replace function public.pl_pin_register_fail(p_email text)
returns int language plpgsql security definer set search_path = public as $$
declare v_fails int;
begin
  insert into pl_pin_attempts(email, fails) values (lower(p_email), 1)
  on conflict (email) do update set fails = pl_pin_attempts.fails + 1
  returning fails into v_fails;
  if v_fails >= 5 then
    update pl_pin_attempts set locked_until = now() + interval '15 minutes'
    where email = lower(p_email);
    return 0;
  end if;
  return 5 - v_fails;
end; $$;

-- Clear the counter on a correct PIN.
create or replace function public.pl_pin_register_success(p_email text)
returns void language sql security definer set search_path = public as $$
  delete from pl_pin_attempts where email = lower(p_email);
$$;

-- Helpers are called only from your (SECURITY DEFINER) verify_user_pin, so anon
-- needs no direct grant. Lock them down.
revoke all on function public.pl_pin_is_locked(text)         from public;
revoke all on function public.pl_pin_register_fail(text)     from public;
revoke all on function public.pl_pin_register_success(text)  from public;

-- ── INTEGRATION: add these three lines to your existing verify_user_pin ──────
-- The app already shows res.error, so the lockout message appears automatically.
--
--   -- 1) at the very top, before checking the PIN:
--   if public.pl_pin_is_locked(p_email) then
--     return json_build_object('success', false,
--       'error', 'Too many attempts. Try again in a few minutes.');
--   end if;
--
--   -- 2) on a WRONG pin (in the branch where it currently returns "incorrect"):
--   perform public.pl_pin_register_fail(p_email);
--
--   -- 3) on a CORRECT pin (just before returning success):
--   perform public.pl_pin_register_success(p_email);
--
-- Paste your current verify_user_pin definition to the maintainer and they can
-- return the fully-merged version. To read it yourself:
--   select prosrc from pg_proc where proname = 'verify_user_pin';
