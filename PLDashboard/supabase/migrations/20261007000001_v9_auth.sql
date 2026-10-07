-- ─────────────────────────────────────────────────────────────────────────
-- 20261007000001_v9_auth.sql
-- P&L Dashboard v9 auth hardening.
--
-- WHAT THIS DOES
--   1. Adds v9 columns to pl_licensed_users (tier, redeemed_at, pin_hash;
--      license_key gets a uniqueness guard if not already constrained).
--   2. Rewrites the user-PIN functions to use pgcrypto bcrypt hashes
--      (crypt()/gen_salt('bf')) — PINs are never stored or compared plaintext.
--      Any legacy plaintext `pin` column, if present, is cleared on set/reset.
--   3. Adds a license-key inventory (pl_license_keys) + redeem_license_key()
--      so keys can be minted and redeemed against an email.
--   4. Adds an admin credential store (pl_admins, bcrypt-hashed PIN) +
--      short-lived admin_sessions tokens. admin_login() verifies the PIN hash
--      and returns a token; admin_require_token() is the single choke point
--      the admin_* functions must call instead of re-checking a raw PIN.
--   5. Extends verify_license() to also return the v9 `tier`.
--   6. Wires the existing 5-fails-per-15-min lockout into admin_login() and
--      verify_user_pin() (migration 20260704000002 must be applied first).
--   7. RLS: anon/authenticated can EXECUTE the RPCs but can never SELECT the
--      tables directly.
--
-- RUN ORDER: 20260704000001, 20260704000002, 20260704000003, THEN this file.
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

-- pgcrypto (bcrypt + uuid helpers). Supabase installs extensions into the
-- `extensions` schema, so every SECURITY DEFINER function below pins
-- `set search_path = public, extensions`.
create extension if not exists pgcrypto with schema extensions;

-- ── 1) v9 columns on pl_licensed_users ────────────────────────────────────
alter table public.pl_licensed_users
  add column if not exists tier        text        not null default 'free',
  add column if not exists license_key text,
  add column if not exists redeemed_at timestamptz,
  add column if not exists pin_hash   text;

-- Uniqueness guard for license_key (verify_license compares it; duplicates
-- would let one key match many rows). Skipped if a constraint already exists
-- or if duplicate keys are present (fix data first in that case).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pl_licensed_users_license_key_key'
  ) and not exists (
    select license_key from public.pl_licensed_users
    where license_key is not null
    group by license_key having count(*) > 1
  ) then
    alter table public.pl_licensed_users
      add constraint pl_licensed_users_license_key_key unique (license_key);
  else
    raise notice 'Skipping UNIQUE on pl_licensed_users.license_key (exists or duplicates present).';
  end if;
end $$;

alter table public.pl_licensed_users enable row level security;
revoke all on table public.pl_licensed_users from anon;

-- ── 2) License-key inventory ──────────────────────────────────────────────
create table if not exists public.pl_license_keys (
  key         text primary key,                       -- e.g. PL9-A3F9-11C2-90BD
  tier        text not null default 'paid',
  note        text,
  redeemed_by text,
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.pl_license_keys enable row level security;
revoke all on table public.pl_license_keys from anon, authenticated;

-- ── 3) Admin credential store + sessions ──────────────────────────────────
create table if not exists public.pl_admins (
  email      text primary key,
  pin_hash   text not null,                            -- bcrypt via crypt()
  created_at timestamptz not null default now()
);
alter table public.pl_admins enable row level security;
revoke all on table public.pl_admins from anon, authenticated;

create table if not exists public.pl_admin_sessions (
  token        uuid primary key default gen_random_uuid(),
  admin_email  text not null references public.pl_admins(email) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '12 hours',
  last_used_at timestamptz not null default now()
);
alter table public.pl_admin_sessions enable row level security;
revoke all on table public.pl_admin_sessions from anon, authenticated;
create index if not exists pl_admin_sessions_expires_idx
  on public.pl_admin_sessions (expires_at);

-- ── 4) PIN-reset tokens (single-use, 1h expiry) ───────────────────────────
create table if not exists public.pl_pin_reset_tokens (
  token      uuid primary key default gen_random_uuid(),
  email      text not null,
  expires_at timestamptz not null default now() + interval '1 hour',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.pl_pin_reset_tokens enable row level security;
revoke all on table public.pl_pin_reset_tokens from anon, authenticated;

-- ── 5) verify_license: same contract as before + v9 tier ──────────────────
-- Return type changes, so DROP then CREATE (CREATE OR REPLACE cannot change
-- the return type). Grants are re-applied below.
drop function if exists public.verify_license(text, text);

create function public.verify_license(p_email text, p_key text default null)
returns table (email text, name text, plan text, status text, expires_at timestamptz, tier text)
language sql
security definer
set search_path = public, extensions
as $$
  select u.email, u.name, u.plan, u.status, u.expires_at, u.tier
  from pl_licensed_users u
  where lower(u.email) = lower(p_email)
    and (p_key is null or u.license_key = p_key)
  limit 1;
$$;
revoke all on function public.verify_license(text, text) from public;
grant execute on function public.verify_license(text, text) to anon, authenticated;

-- ── 6) User-PIN functions (bcrypt; never plaintext) ───────────────────────

-- Set (or change) a user's 4-digit PIN. Fails closed if the license row
-- does not exist — the sign-in flow must create it first.
create or replace function public.set_user_pin(p_email text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_has_legacy boolean;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return json_build_object('success', false, 'error', 'PIN must be 4 digits.');
  end if;

  update public.pl_licensed_users
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where lower(email) = lower(p_email);
  if not found then
    raise exception 'No license record for this email.';
  end if;

  -- If a legacy plaintext `pin` column exists from the old build, wipe it.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pl_licensed_users'
      and column_name = 'pin'
  ) into v_has_legacy;
  if v_has_legacy then
    execute 'update public.pl_licensed_users set pin = null where lower(email) = lower($1)'
      using p_email;
  end if;

  perform public.pl_pin_register_success(p_email);
  return json_build_object('success', true);
end $$;
revoke all on function public.set_user_pin(text, text) from public;
grant execute on function public.set_user_pin(text, text) to anon, authenticated;

-- Verify a user's PIN. Integrates the 5-fails/15-min lockout from 0002.
create or replace function public.verify_user_pin(p_email text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_hash text;
begin
  if public.pl_pin_is_locked(p_email) then
    return json_build_object('success', false,
      'error', 'Too many attempts. Try again in a few minutes.');
  end if;

  select pin_hash into v_hash
    from public.pl_licensed_users where lower(email) = lower(p_email);

  if v_hash is null then
    -- Unknown email or no PIN set: burn comparable time so the response does
    -- not reveal which case it is, then record the failure.
    perform crypt(coalesce(p_pin, '0000'), gen_salt('bf'));
    perform public.pl_pin_register_fail(p_email);
    return json_build_object('success', false, 'error', 'Incorrect PIN.');
  end if;

  if v_hash = crypt(p_pin, v_hash) then
    perform public.pl_pin_register_success(p_email);
    return json_build_object('success', true);
  else
    perform public.pl_pin_register_fail(p_email);
    return json_build_object('success', false, 'error', 'Incorrect PIN.');
  end if;
end $$;
revoke all on function public.verify_user_pin(text, text) from public;
grant execute on function public.verify_user_pin(text, text) to anon, authenticated;

create or replace function public.check_user_has_pin(p_email text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.pl_licensed_users
    where lower(email) = lower(p_email) and pin_hash is not null
  );
$$;
revoke all on function public.check_user_has_pin(text) from public;
grant execute on function public.check_user_has_pin(text) to anon, authenticated;

-- Consume a single-use reset token and set a new PIN.
create or replace function public.complete_pin_reset(p_token uuid, p_new_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_email text;
begin
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    return json_build_object('success', false, 'error', 'PIN must be 4 digits.');
  end if;
  if p_token is null then
    return json_build_object('success', false, 'error', 'Invalid reset link.');
  end if;

  update public.pl_pin_reset_tokens
     set used_at = now()
   where token = p_token and used_at is null and expires_at > now()
  returning email into v_email;

  if v_email is null then
    return json_build_object('success', false,
      'error', 'This reset link is invalid or has expired.');
  end if;

  update public.pl_licensed_users
     set pin_hash = crypt(p_new_pin, gen_salt('bf'))
   where lower(email) = lower(v_email);
  perform public.pl_pin_register_success(v_email);
  return json_build_object('success', true);
end $$;
revoke all on function public.complete_pin_reset(uuid, text) from public;
grant execute on function public.complete_pin_reset(uuid, text) to anon, authenticated;

-- ── 7) License-key redemption ─────────────────────────────────────────────
-- The buyer signs in first (magic link creates their pl_licensed_users row),
-- then redeems a minted key. The key is copied onto the user row so
-- verify_license(email, key) keeps working after redemption.
create or replace function public.redeem_license_key(p_email text, p_key text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_row public.pl_license_keys%rowtype;
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('success', false, 'error', 'Enter a valid email address.');
  end if;
  if p_key is null or btrim(p_key) = '' then
    return json_build_object('success', false, 'error', 'Enter a license key.');
  end if;

  select * into v_row
    from public.pl_license_keys
   where key = upper(btrim(p_key));
  if not found then
    return json_build_object('success', false, 'error', 'This license key was not recognized.');
  end if;
  if v_row.redeemed_at is not null then
    return json_build_object('success', false, 'error', 'This license key has already been redeemed.');
  end if;

  if not exists (select 1 from public.pl_licensed_users where lower(email) = lower(p_email)) then
    return json_build_object('success', false,
      'error', 'Sign in first, then redeem your key.');
  end if;

  update public.pl_license_keys
     set redeemed_by = lower(p_email), redeemed_at = now()
   where key = v_row.key;

  update public.pl_licensed_users
     set license_key = v_row.key,
         tier        = v_row.tier,
         status      = 'active',
         redeemed_at = now()
   where lower(email) = lower(p_email);

  return json_build_object('success', true, 'tier', v_row.tier, 'email', lower(p_email));
end $$;
revoke all on function public.redeem_license_key(text, text) from public;
grant execute on function public.redeem_license_key(text, text) to anon, authenticated;

-- ── 8) Admin auth: login → token; token → verified email ──────────────────

-- Verify the admin's bcrypt-hashed PIN and mint a 12-hour session token.
-- Lockout attempts are namespaced under 'admin:' so they never collide with
-- end-user PIN lockouts on the same email address.
create or replace function public.admin_login(p_email text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_hash text; v_token uuid; v_ns text;
begin
  v_ns := 'admin:' || lower(coalesce(p_email, ''));

  if public.pl_pin_is_locked(v_ns) then
    return json_build_object('success', false,
      'error', 'Too many attempts. Try again in a few minutes.');
  end if;

  select pin_hash into v_hash
    from public.pl_admins where email = lower(p_email);

  if v_hash is null or v_hash <> crypt(p_pin, v_hash) then
    -- Burn comparable time on unknown email so the response does not reveal
    -- whether the admin account exists.
    if v_hash is null then
      perform crypt(coalesce(p_pin, '0000'), gen_salt('bf'));
    end if;
    perform public.pl_pin_register_fail(v_ns);
    return json_build_object('success', false, 'error', 'Invalid email or PIN.');
  end if;

  perform public.pl_pin_register_success(v_ns);

  -- Housekeeping: drop expired sessions.
  delete from public.pl_admin_sessions where expires_at < now();

  insert into public.pl_admin_sessions(admin_email, expires_at)
  values (lower(p_email), now() + interval '12 hours')
  returning token into v_token;

  return json_build_object('success', true, 'token', v_token);
end $$;
revoke all on function public.admin_login(text, text) from public;
grant execute on function public.admin_login(text, text) to anon, authenticated;

-- Single choke point for every admin_* function: validates the session token
-- (exists + not expired) and returns the admin email. Raises on failure so a
-- forgotten check fails closed, never open.
create or replace function public.admin_require_token(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_email text;
begin
  if p_token is null then
    raise exception 'Missing admin token.';
  end if;
  update public.pl_admin_sessions
     set last_used_at = now()
   where token = p_token and expires_at > now()
  returning admin_email into v_email;
  if v_email is null then
    raise exception 'Invalid or expired admin token.';
  end if;
  return v_email;
end $$;
-- Deliberately NOT granted to anon/authenticated: server-side use only.
revoke all on function public.admin_require_token(uuid) from public;

create or replace function public.admin_logout(p_token uuid)
returns json
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.pl_admin_sessions where token = p_token;
  select json_build_object('success', true);
$$;
revoke all on function public.admin_logout(uuid) from public;
grant execute on function public.admin_logout(uuid) to anon, authenticated;

-- Mint a license key (admin only). Returns the new key, e.g. PL9-A3F9-11C2-90BD.
create or replace function public.admin_mint_license_key(
  p_token uuid, p_tier text default 'paid', p_note text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_key text;
begin
  perform public.admin_require_token(p_token);
  loop
    v_key := 'PL9-' || upper(
      substr(md5(gen_random_uuid()::text), 1, 4) || '-' ||
      substr(md5(gen_random_uuid()::text), 1, 4) || '-' ||
      substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from public.pl_license_keys where key = v_key);
  end loop;
  insert into public.pl_license_keys(key, tier, note)
  values (v_key, coalesce(nullif(btrim(p_tier), ''), 'paid'), p_note);
  return v_key;
end $$;
revoke all on function public.admin_mint_license_key(uuid, text, text) from public;
grant execute on function public.admin_mint_license_key(uuid, text, text) to anon, authenticated;

-- v9 rewrite of admin_reset_user_pin: clears the user's PIN hash (and any
-- legacy plaintext PIN) so they set a fresh PIN at next sign-in.
-- NOTE: this replaces the live admin_reset_user_pin — do NOT also convert it
-- with the generic admin_* snippet in APPLY_NOTES.md.
create or replace function public.admin_reset_user_pin(p_token uuid, p_user_email text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_has_legacy boolean;
begin
  perform public.admin_require_token(p_token);

  update public.pl_licensed_users
     set pin_hash = null
   where lower(email) = lower(p_user_email);
  if not found then
    return json_build_object('success', false, 'error', 'No user with that email.');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pl_licensed_users'
      and column_name = 'pin'
  ) into v_has_legacy;
  if v_has_legacy then
    execute 'update public.pl_licensed_users set pin = null where lower(email) = lower($1)'
      using p_user_email;
  end if;

  perform public.pl_pin_register_success(p_user_email);
  return json_build_object('success', true);
end $$;
revoke all on function public.admin_reset_user_pin(uuid, text) from public;
grant execute on function public.admin_reset_user_pin(uuid, text) to anon, authenticated;

-- ── Verify after running (also see supabase/APPLY_NOTES.md) ───────────────
-- select public.admin_login('you@example.com', '0000');  -- after seeding pl_admins
-- select * from public.pl_admin_sessions;               -- postgres only
