-- =====================================================================
-- Simba Telemetry — migration v2.0
-- ---------------------------------------------------------------------
-- HOW TO USE: run this AFTER supabase/schema.sql, once, in the Supabase
-- SQL Editor (project: iknfvddnevudpjtyxkbh). It is idempotent
-- (IF NOT EXISTS / DROP POLICY IF EXISTS), so re-running is safe.
--
-- Adds (v2.0 feature set):
--   1. household_members   — multi-user logging for one pet
--   2. medications + med_logs — medication tracking & dose log
--   3. vaccinations         — vaccination / vet-visit records
--   4. walks                — GPS walk routes (polyline stored as JSON)
--   5. telemetry_events.walk_id — link a Walk event to its route row
--   6. Widened RLS: household members can read/write a subject's rows
--
-- App keys are NEVER stored in the repo — they go in the app's Setup
-- screen and live in the device's localStorage only.
-- =====================================================================

create schema if not exists simba_telemetry;

-- ---------------------------------------------------------------------
-- 1. Household members — invite by email; the invited person claims the
--    row on first sign-in (their auth JWT email must match).
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.household_members (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references simba_telemetry.subjects(id) on delete cascade,
  user_id     uuid,                                   -- auth.users.id; NULL = invited, unclaimed
  email       text not null,                          -- invitee email (lowercased by app)
  role        text not null default 'member',        -- owner | member
  created_at  timestamptz default now(),
  unique (subject_id, email)
);
create index if not exists idx_hm_subject on simba_telemetry.household_members (subject_id);
create index if not exists idx_hm_user on simba_telemetry.household_members (user_id);

-- ---------------------------------------------------------------------
-- 2. Medications — recurring definitions (e.g. "Simparica, 1 chew, monthly")
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.medications (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references simba_telemetry.subjects(id) on delete cascade,
  owner_id    uuid not null,                          -- auth.users.id (creator)
  name        text not null,
  dose        text,                                   -- e.g. "1 chew", "5 mg"
  frequency   text not null default 'daily',         -- once | daily | twice_daily | weekly | monthly | as_needed
  time_of_day text,                                   -- "08:00" local, for reminders
  next_due_at timestamptz,
  active      boolean default true,
  notes       text,
  created_at  timestamptz default now()
);
create index if not exists idx_meds_subject on simba_telemetry.medications (subject_id);

-- ---------------------------------------------------------------------
-- 3. Medication dose log — one row per administered dose
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.med_logs (
  id            uuid primary key default gen_random_uuid(),
  medication_id uuid not null references simba_telemetry.medications(id) on delete cascade,
  subject_id    uuid not null references simba_telemetry.subjects(id) on delete cascade,
  owner_id      uuid not null,
  given_at      timestamptz not null default now(),
  note          text,
  created_at    timestamptz default now()
);
create index if not exists idx_medlogs_med on simba_telemetry.med_logs (medication_id, given_at desc);

-- ---------------------------------------------------------------------
-- 4. Vaccinations / vet visits
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.vaccinations (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references simba_telemetry.subjects(id) on delete cascade,
  owner_id    uuid not null,
  vaccine     text not null,                          -- e.g. "DHPP #3", "Rabies", "Wellness exam"
  given_at    timestamptz not null,
  next_due_at timestamptz,
  vet         text,
  note        text,
  created_at  timestamptz default now()
);
create index if not exists idx_vax_subject on simba_telemetry.vaccinations (subject_id, given_at desc);

-- ---------------------------------------------------------------------
-- 5. Walks — GPS route stored as JSON array [{lat, lon, t}, …]
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.walks (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references simba_telemetry.subjects(id) on delete cascade,
  owner_id      uuid not null,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  distance_m    numeric(8,1) default 0,
  duration_mins numeric(7,1) default 0,
  route         jsonb,                                -- [{lat, lon, t}, …]
  created_at    timestamptz default now()
);
create index if not exists idx_walks_subject on simba_telemetry.walks (subject_id, started_at desc);

-- ---------------------------------------------------------------------
-- 6. Link Walk telemetry events to their route row
-- ---------------------------------------------------------------------
alter table simba_telemetry.telemetry_events
  add column if not exists walk_id uuid references simba_telemetry.walks(id) on delete set null;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
--    Rule everywhere: the subject's OWNER has full access, and any
--    household member (user_id claimed) of that subject does too.
-- ---------------------------------------------------------------------
alter table simba_telemetry.household_members enable row level security;
alter table simba_telemetry.medications      enable row level security;
alter table simba_telemetry.med_logs         enable row level security;
alter table simba_telemetry.vaccinations    enable row level security;
alter table simba_telemetry.walks            enable row level security;

-- Helper predicate, inlined per policy (Postgres has no cross-table RLS vars):
--   simba_telemetry.is_household(_subject_id uuid)
create or replace function simba_telemetry.is_household(_subject_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from simba_telemetry.household_members m
    where m.subject_id = _subject_id and m.user_id = auth.uid()
  );
$$;

-- ---- household_members ----
drop policy if exists hm_select on simba_telemetry.household_members;
drop policy if exists hm_claim  on simba_telemetry.household_members;
drop policy if exists hm_manage on simba_telemetry.household_members;

-- Members see: their own rows, rows inviting their email, rows of subjects they own/are in.
create policy hm_select on simba_telemetry.household_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or lower(email) = lower(auth.jwt() ->> 'email')
    or exists (select 1 from simba_telemetry.subjects s
               where s.id = subject_id and s.owner_id = auth.uid())
    or simba_telemetry.is_household(subject_id)
  );
-- Invited email claims its own row on first sign-in.
create policy hm_claim on simba_telemetry.household_members
  for update to authenticated
  using (user_id is null and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (user_id = auth.uid() and lower(email) = lower(auth.jwt() ->> 'email'));
-- Subject owner manages memberships.
create policy hm_manage on simba_telemetry.household_members
  for all to authenticated
  using (exists (select 1 from simba_telemetry.subjects s
                 where s.id = subject_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from simba_telemetry.subjects s
                     where s.id = subject_id and s.owner_id = auth.uid()));

-- ---- widen subjects + events to household members ----
drop policy if exists subjects_select on simba_telemetry.subjects;
create policy subjects_select on simba_telemetry.subjects
  for select to authenticated
  using (
    owner_id = auth.uid()
    or owner_id is null
    or simba_telemetry.is_household(simba_telemetry.subjects.id)
  );

drop policy if exists events_all on simba_telemetry.telemetry_events;
create policy events_all on simba_telemetry.telemetry_events
  for all to authenticated
  using (owner_id = auth.uid() or simba_telemetry.is_household(subject_id))
  with check (owner_id = auth.uid() or simba_telemetry.is_household(subject_id));

-- ---- care tables: owner or household member of the subject ----
drop policy if exists meds_all on simba_telemetry.medications;
drop policy if exists medlogs_all on simba_telemetry.med_logs;
drop policy if exists vax_all on simba_telemetry.vaccinations;
drop policy if exists walks_all on simba_telemetry.walks;

create policy meds_all on simba_telemetry.medications
  for all to authenticated
  using (owner_id = auth.uid() or simba_telemetry.is_household(subject_id))
  with check (owner_id = auth.uid() or simba_telemetry.is_household(subject_id));
create policy medlogs_all on simba_telemetry.med_logs
  for all to authenticated
  using (owner_id = auth.uid() or simba_telemetry.is_household(subject_id))
  with check (owner_id = auth.uid() or simba_telemetry.is_household(subject_id));
create policy vax_all on simba_telemetry.vaccinations
  for all to authenticated
  using (owner_id = auth.uid() or simba_telemetry.is_household(subject_id))
  with check (owner_id = auth.uid() or simba_telemetry.is_household(subject_id));
create policy walks_all on simba_telemetry.walks
  for all to authenticated
  using (owner_id = auth.uid() or simba_telemetry.is_household(subject_id))
  with check (owner_id = auth.uid() or simba_telemetry.is_household(subject_id));

-- ---- grants ----
grant usage on schema simba_telemetry to authenticated;
grant select, insert, update, delete on simba_telemetry.household_members to authenticated;
grant select, insert, update, delete on simba_telemetry.medications to authenticated;
grant select, insert, update, delete on simba_telemetry.med_logs to authenticated;
grant select, insert, update, delete on simba_telemetry.vaccinations to authenticated;
grant select, insert, update, delete on simba_telemetry.walks to authenticated;
