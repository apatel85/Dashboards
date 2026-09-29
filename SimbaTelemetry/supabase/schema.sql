-- =====================================================================
-- Simba Telemetry — Supabase schema
-- ---------------------------------------------------------------------
-- HOW TO USE: paste this entire file into the Supabase SQL Editor
-- (project: iknfvddnevudpjtyxkbh) and run it once. It is idempotent
-- for the schema/tables (uses IF NOT EXISTS); policies are dropped and
-- re-created so re-running is safe. The Simba seed row inserts only if
-- no unclaimed Simba row exists.
--
-- Convention: one schema per app → `simba_telemetry`.
-- The PWA connects with the anon key + Supabase Auth; Row Level Security
-- guarantees each signed-in user only sees their own rows (owner_id).
-- App keys are NEVER stored in the repo — they go in the app's Setup
-- screen and live in the device's localStorage only.
-- =====================================================================

create schema if not exists simba_telemetry;

-- ---------------------------------------------------------------------
-- 1. Subjects (one row per animal; ships with Simba, unclaimed)
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.subjects (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid,                                  -- auth.users.id; NULL = unclaimed seed
  name                        text not null,
  breed                       text,
  date_of_birth               date,
  sex                         text,
  current_weight_kg           numeric(5,2),
  target_awake_hold_mins      int default 80,
  clean_overnight_streak_days int default 0,
  created_at                  timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. Telemetry events (one row per logged event)
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.telemetry_events (
  id                          bigserial primary key,
  event_code                  text unique,                           -- auto: LOG-0001, LOG-0002, …
  subject_id                  uuid references simba_telemetry.subjects(id) on delete cascade,
  owner_id                    uuid not null,                         -- auth.users.id

  logged_at                   timestamptz not null,
  day_number                  int,                                   -- Day N = date − household Day 1 + 1
  category                    text,                                  -- Food, Water, Elimination, Nap, Crate, Training, Weight, Note
  raw_input                   text,                                  -- verbatim voice/text for audit trail

  -- ingestion metrics
  kibble_offered_tbsp         numeric(5,2) default 0,
  kibble_consumed_tbsp        numeric(5,2) default 0,
  kibble_unconsumed_tbsp      numeric(5,2) default 0,
  kibble_type                 text,                                  -- Chicken | Salmon
  water_offered_tsp           numeric(5,2) default 0,
  water_consumed_tsp          numeric(5,2) default 0,
  toppers_detail              text,
  event_kcal                  numeric(7,2) default 0,

  -- elimination metrics
  elimination_type            text,                                  -- Pee, Poop, Pee_Poop, Micro_Pee, Dry_Check, Accident_Pee, Accident_Poop
  fecal_score                 int check (fecal_score between 1 and 7),
  fecal_morphology            text,
  squat_count                 int default 0,
  stream_duration_seconds     numeric(5,1) default 0,
  latency_to_eliminate_mins   int default 0,
  location_substrate          text,

  -- rest / crate metrics
  crate_action                text,                                  -- Crate_Entry | Crate_Wake
  sleep_duration_mins         int default 0,
  crate_bedding_dry           boolean default true,

  -- behavioral & somatic flags
  door_tell_observed          boolean default false,
  somatic_tell                text,

  -- computed physiological state (snapshotted at log time)
  elapsed_awake_hold_mins     int,
  cumulative_daily_kcal       numeric(7,2),
  cumulative_daily_fluid_ml   numeric(7,2),

  -- clinical feedback (filled by the Ask / audit flow)
  status_outcome              text,
  behavioral_telemetry_notes  text,
  clinical_audit              text,
  next_operational_roadmap    text,

  created_at                  timestamptz default now()
);

create index if not exists idx_events_subject_time
  on simba_telemetry.telemetry_events (subject_id, logged_at desc);
create index if not exists idx_events_owner_time
  on simba_telemetry.telemetry_events (owner_id, logged_at desc);

-- ---------------------------------------------------------------------
-- 3. Auto event_code trigger: LOG-0001, LOG-0002, …
-- ---------------------------------------------------------------------
create or replace function simba_telemetry.assign_event_code()
returns trigger language plpgsql as $$
begin
  if NEW.event_code is null then
    NEW.event_code := 'LOG-' || lpad(NEW.id::text, 4, '0');
  end if;
  return NEW;
end $$;

drop trigger if exists trg_assign_event_code on simba_telemetry.telemetry_events;
create trigger trg_assign_event_code
  before insert on simba_telemetry.telemetry_events
  for each row execute function simba_telemetry.assign_event_code();

-- ---------------------------------------------------------------------
-- 4. Row Level Security — users see ONLY their own rows
-- ---------------------------------------------------------------------
alter table simba_telemetry.subjects enable row level security;
alter table simba_telemetry.telemetry_events enable row level security;

drop policy if exists subjects_select on simba_telemetry.subjects;
drop policy if exists subjects_insert on simba_telemetry.subjects;
drop policy if exists subjects_update on simba_telemetry.subjects;
drop policy if exists subjects_delete on simba_telemetry.subjects;
drop policy if exists events_all on simba_telemetry.telemetry_events;

-- Subjects: read own rows + the unclaimed seed (for one-time claim);
-- write only own rows; claim allowed via UPDATE of NULL-owner rows.
create policy subjects_select on simba_telemetry.subjects
  for select to authenticated
  using (owner_id = auth.uid() or owner_id is null);
create policy subjects_insert on simba_telemetry.subjects
  for insert to authenticated
  with check (owner_id = auth.uid());
create policy subjects_update on simba_telemetry.subjects
  for update to authenticated
  using (owner_id = auth.uid() or owner_id is null)
  with check (owner_id = auth.uid());
create policy subjects_delete on simba_telemetry.subjects
  for delete to authenticated
  using (owner_id = auth.uid());

-- Events: full access, but strictly to your own rows.
create policy events_all on simba_telemetry.telemetry_events
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant usage on schema simba_telemetry to authenticated;
grant select, insert, update, delete on simba_telemetry.subjects to authenticated;
grant select, insert, update, delete on simba_telemetry.telemetry_events to authenticated;
grant usage, select on sequence simba_telemetry.telemetry_events_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- 5. Seed: Simba (owner_id NULL → claimed by first signed-in user
--    via the app's "claim subject" flow)
-- ---------------------------------------------------------------------
insert into simba_telemetry.subjects
  (owner_id, name, breed, date_of_birth, sex, current_weight_kg,
   target_awake_hold_mins, clean_overnight_streak_days)
select null, 'Simba', 'Cavapoo (Cavalier King Charles Spaniel × Poodle)',
       '2026-05-31', 'male', 3.40, 80, 27
where not exists (
  select 1 from simba_telemetry.subjects
  where name = 'Simba' and owner_id is null
);
