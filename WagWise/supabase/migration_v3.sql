-- =====================================================================
-- Simba Telemetry — migration v3.10: data versions (snapshots + rollback)
-- ---------------------------------------------------------------------
-- HOW TO USE: run this AFTER schema.sql + migration_v2.sql, once, in the
-- Supabase SQL Editor (project: iknfvddnevudpjtyxkbh). It is idempotent
-- (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE), so
-- re-running is safe.
--
-- Adds (v3.10 feature set):
--   1. data_versions — server-side snapshots of a subject's full event
--      history (label, who, when, event count, snapshot JSONB).
--      The app auto-snapshots before every import (More → Import data).
--   2. restore_data_version(uuid) — SECURITY DEFINER function: the pet
--      owner (admin) can roll a subject's events back to any snapshot.
--      Rollback is GLOBAL: it replaces the subject's entire event history
--      for every household member. A safety snapshot should be taken
--      first (the app does this automatically).
-- =====================================================================

create schema if not exists simba_telemetry;

-- ---------------------------------------------------------------------
-- 1. Data versions
-- ---------------------------------------------------------------------
create table if not exists simba_telemetry.data_versions (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references simba_telemetry.subjects(id) on delete cascade,
  created_by       uuid,                                  -- auth.users.id (who snapshotted)
  created_by_email text,
  label            text not null,                         -- e.g. "Before import · Simba_Log_Master_1.csv"
  event_count      int not null default 0,
  snapshot         jsonb not null,                        -- jsonb_agg(to_jsonb(telemetry_events))
  created_at       timestamptz default now()
);
create index if not exists idx_dv_subject on simba_telemetry.data_versions (subject_id, created_at desc);

alter table simba_telemetry.data_versions enable row level security;

-- Read / snapshot: the subject's owner or any household member.
drop policy if exists dv_select on simba_telemetry.data_versions;
create policy dv_select on simba_telemetry.data_versions
  for select to authenticated
  using (exists (
    select 1 from simba_telemetry.subjects s
    where s.id = subject_id
      and (s.owner_id = auth.uid() or simba_telemetry.is_household(s.id))
  ));

drop policy if exists dv_insert on simba_telemetry.data_versions;
create policy dv_insert on simba_telemetry.data_versions
  for insert to authenticated
  with check (exists (
    select 1 from simba_telemetry.subjects s
    where s.id = subject_id
      and (s.owner_id = auth.uid() or simba_telemetry.is_household(s.id))
  ));

-- Delete (prune old versions): owner only.
drop policy if exists dv_delete on simba_telemetry.data_versions;
create policy dv_delete on simba_telemetry.data_versions
  for delete to authenticated
  using (exists (
    select 1 from simba_telemetry.subjects s
    where s.id = subject_id and s.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------
-- 2. Global rollback function — ADMIN ONLY (pet owner)
--    Deletes the subject's events and re-inserts the snapshot rows
--    (original ids + event codes preserved), then repairs the id sequence.
-- ---------------------------------------------------------------------
create or replace function simba_telemetry.restore_data_version(_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = simba_telemetry, pg_temp
as $$
declare
  _subject_id uuid;
  _snap       jsonb;
  _n          int;
begin
  select subject_id, snapshot into _subject_id, _snap
  from simba_telemetry.data_versions where id = _version_id;
  if _subject_id is null then
    raise exception 'Version not found';
  end if;

  -- Admin check: subject owner, or household member with role = 'owner'.
  if not exists (select 1 from simba_telemetry.subjects s
                 where s.id = _subject_id and s.owner_id = auth.uid())
     and not exists (select 1 from simba_telemetry.household_members m
                     where m.subject_id = _subject_id
                       and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'Only the pet owner can roll back data versions';
  end if;

  delete from simba_telemetry.telemetry_events where subject_id = _subject_id;

  insert into simba_telemetry.telemetry_events
  select * from jsonb_populate_recordset(null::simba_telemetry.telemetry_events, _snap);
  get diagnostics _n = row_count;

  perform setval('simba_telemetry.telemetry_events_id_seq',
                 (select coalesce(max(id), 1) from simba_telemetry.telemetry_events), true);
  return _n;
end $$;

-- ---------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------
grant select, insert, delete on simba_telemetry.data_versions to authenticated;
grant execute on function simba_telemetry.restore_data_version(uuid) to authenticated;
