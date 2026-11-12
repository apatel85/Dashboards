-- TradeDesk invite list (allow-list) — run ONCE in the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- What this does:
--   * Table `public.tradedesk_invites` — one row per person allowed to use
--     TradeDesk. `email` is stored lowercase; `role` is 'admin' or 'member'.
--   * Row Level Security ON. The app reads/writes this table through the
--     Supabase client, so these policies are the enforcement:
--       - anyone signed in can read ONLY their own row;
--       - admins can read / add / change / remove any row;
--       - nobody else can write.
--   * `public.is_tradedesk_admin()` is a SECURITY DEFINER helper so the
--     admin policy never has to read the same table through RLS (which
--     would recurse). It only answers "is the caller an admin?".
--
-- FAIL-CLOSED: until this file has been run, the app's login gate shows
-- "Setup needed" to everyone (including Ankit) and renders no app content.
-- Run this file BEFORE deploying the app version that enforces the list.
--
-- SEED: the first admin is Ankit's TradeDesk sign-in email
-- (apatel85@gmail.com) — the only person who sees the Admin tab until
-- more admins are added there. If the email ever needs changing:
--   update public.tradedesk_invites set email = 'correct@example.com'
--   where role = 'admin';

create table if not exists public.tradedesk_invites (
  email text primary key,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  invited_by text,
  created_at timestamptz not null default now()
);

-- Keep emails lowercase + trimmed no matter who writes them.
create or replace function public.tradedesk_invites_normalize()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists tradedesk_invites_normalize on public.tradedesk_invites;
create trigger tradedesk_invites_normalize
  before insert or update on public.tradedesk_invites
  for each row execute function public.tradedesk_invites_normalize();

alter table public.tradedesk_invites enable row level security;

-- Is the caller an admin? SECURITY DEFINER so the check bypasses RLS
-- (the policies below call this function; a plain RLS read here would
-- recurse). The function only reads this one table and only answers yes/no.
create or replace function public.is_tradedesk_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tradedesk_invites
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'admin'
  );
$$;

-- Anyone signed in can read their own row (so the login gate can check it).
drop policy if exists "invites_select_own" on public.tradedesk_invites;
create policy "invites_select_own"
  on public.tradedesk_invites
  for select
  to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- Admins can read, add, change and remove any row.
drop policy if exists "invites_admin_all" on public.tradedesk_invites;
create policy "invites_admin_all"
  on public.tradedesk_invites
  for all
  to authenticated
  using (public.is_tradedesk_admin())
  with check (public.is_tradedesk_admin());

-- The app talks to this table as the signed-in user, never as anon.
grant select, insert, update, delete
  on table public.tradedesk_invites to authenticated;
revoke all on table public.tradedesk_invites from anon;

-- SEED: the first admin (Ankit's TradeDesk sign-in email) and the first
-- invitee, who can sign in as soon as the gate goes live.
insert into public.tradedesk_invites (email, role, invited_by)
values
  ('apatel85@gmail.com', 'admin', 'setup'),
  ('dipeshp@gmail.com', 'member', 'apatel85@gmail.com')
on conflict (email) do nothing;
