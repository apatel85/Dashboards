-- =====================================================================
-- Simba Telemetry — migration v4: snack logging (v3.11)
-- ---------------------------------------------------------------------
-- HOW TO USE: run this AFTER schema.sql + migration_v2.sql (+ v3 if you
-- use data versions), once, in the Supabase SQL Editor
-- (project: iknfvddnevudpjtyxkbh). Idempotent (IF NOT EXISTS).
--
-- Adds snack columns to telemetry_events for the new 'Snack' category:
--   snack_name   — e.g. 'Pumpkin puree'
--   snack_amount — numeric amount in snack_unit
--   snack_unit   — 'tsp' | 'tbsp' | 'piece' | 'cube'
-- (event_kcal already exists and carries the snack's calories.)
-- No RLS change: the existing table policies already cover new columns.
-- =====================================================================

alter table simba_telemetry.telemetry_events
  add column if not exists snack_name   text,
  add column if not exists snack_amount numeric(6,2),
  add column if not exists snack_unit   text;
