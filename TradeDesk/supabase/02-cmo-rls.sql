-- WO-02 · CMO schema — file 2 of 3: RLS policies, grants, scorecard view
-- TradeDesk scoring revamp, Rev 4 spec §8.2 / §8.3.
--
-- Run AFTER 01-cmo-schema.sql, in the same SQL editor session order.
-- RLS is enabled on every table. The rules, per §8.2:
--   * READ: signed-in users on the invite list (cmo.is_invited(), which
--     reuses the check behind public.tradedesk_invites).
--   * option_chain_snapshots and cmo_backtest_cases: service role ONLY —
--     no policy and no grant for authenticated/anon, so an invited user's
--     select on them fails (that is the WO-02 acceptance check).
--   * WRITE: service role only (the pipeline and the backtest), except
--     cmo_live_signals, where a signed-in user may insert rows carrying
--     their own user_id.
--
-- JUDGMENT CALL (flagged, see README-cmo.md): the live_signals insert
-- policy ALSO requires cmo.is_invited(). §8.2's letter says only "a
-- signed-in user may insert rows carrying their own user_id", but the app
-- is invite-only (AuthGate denies non-invitees outright), so letting a
-- signed-in non-invitee write signals would punch a hole in that boundary.
-- The stricter reading is implemented; the acceptance script tests it.
--
-- GRANTS (workspace lesson — without these PostgREST returns 42501 even
-- when a policy would allow the row): USAGE on the schema for anon,
-- authenticated and service_role (same as the cricmax/dealfinder pattern);
-- table grants per the rules above. Default privileges are set for
-- service_role only, so a future table does NOT silently become readable
-- by authenticated users — its grants must be added deliberately.
--
-- The view cmo_scorecard is created WITH (security_invoker = true): a
-- plain view would run as its owner (postgres) and bypass the RLS on
-- cmo_predictions, leaking every row to any caller with SELECT on the
-- view. With security_invoker, the underlying tables' RLS applies to the
-- caller, so a non-invitee sees nothing through the view either.

-- ---------------------------------------------------------------------------
-- RLS on
-- ---------------------------------------------------------------------------
alter table cmo.cmo_runs enable row level security;
alter table cmo.cmo_candidates enable row level security;
alter table cmo.cmo_dte_plan enable row level security;
alter table cmo.cmo_live_signals enable row level security;
alter table cmo.cmo_predictions enable row level security;
alter table cmo.cmo_prob_tables enable row level security;
alter table cmo.cmo_validation enable row level security;
alter table cmo.cmo_backtest_runs enable row level security;
alter table cmo.cmo_backtest_cases enable row level security;
alter table cmo.market_reference enable row level security;
alter table cmo.option_chain_snapshots enable row level security;

-- ---------------------------------------------------------------------------
-- Read policies: invited users may SELECT the eight read tables.
-- (No INSERT/UPDATE/DELETE policy for authenticated on these: writes are
-- service role only, and service_role bypasses RLS.)
-- ---------------------------------------------------------------------------
drop policy if exists "cmo_runs_select_invited" on cmo.cmo_runs;
create policy "cmo_runs_select_invited"
  on cmo.cmo_runs for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_candidates_select_invited" on cmo.cmo_candidates;
create policy "cmo_candidates_select_invited"
  on cmo.cmo_candidates for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_dte_plan_select_invited" on cmo.cmo_dte_plan;
create policy "cmo_dte_plan_select_invited"
  on cmo.cmo_dte_plan for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_predictions_select_invited" on cmo.cmo_predictions;
create policy "cmo_predictions_select_invited"
  on cmo.cmo_predictions for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_prob_tables_select_invited" on cmo.cmo_prob_tables;
create policy "cmo_prob_tables_select_invited"
  on cmo.cmo_prob_tables for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_validation_select_invited" on cmo.cmo_validation;
create policy "cmo_validation_select_invited"
  on cmo.cmo_validation for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_backtest_runs_select_invited" on cmo.cmo_backtest_runs;
create policy "cmo_backtest_runs_select_invited"
  on cmo.cmo_backtest_runs for select to authenticated
  using (cmo.is_invited());

drop policy if exists "market_reference_select_invited" on cmo.market_reference;
create policy "market_reference_select_invited"
  on cmo.market_reference for select to authenticated
  using (cmo.is_invited());

-- ---------------------------------------------------------------------------
-- cmo_live_signals: invited users may SELECT all signals, and INSERT rows
-- carrying their own user_id (auth.uid() = the sub claim of their JWT).
-- No UPDATE/DELETE policy for authenticated.
-- ---------------------------------------------------------------------------
drop policy if exists "cmo_live_signals_select_invited" on cmo.cmo_live_signals;
create policy "cmo_live_signals_select_invited"
  on cmo.cmo_live_signals for select to authenticated
  using (cmo.is_invited());

drop policy if exists "cmo_live_signals_insert_own" on cmo.cmo_live_signals;
create policy "cmo_live_signals_insert_own"
  on cmo.cmo_live_signals for insert to authenticated
  with check (cmo.is_invited() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Service-only tables: cmo_backtest_cases, option_chain_snapshots.
-- Deliberately NO policy and NO grant for authenticated/anon.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema cmo to anon, authenticated, service_role;

grant select on table
  cmo.cmo_runs, cmo.cmo_candidates, cmo.cmo_dte_plan,
  cmo.cmo_predictions, cmo.cmo_prob_tables, cmo.cmo_validation,
  cmo.cmo_backtest_runs, cmo.market_reference
  to authenticated;

grant select, insert on table cmo.cmo_live_signals to authenticated;

grant all on all tables in schema cmo to service_role;

-- The invite-check helper must be callable by the roles the policies run as.
grant execute on function cmo.is_invited() to anon, authenticated, service_role;

-- trim_retention() is service-role only (the pipeline calls it after publish).
revoke all on function cmo.trim_retention() from public;
grant execute on function cmo.trim_retention() to service_role;

-- Future tables in this schema do NOT auto-inherit authenticated access.
alter default privileges in schema cmo
  grant all on tables to service_role;

-- ---------------------------------------------------------------------------
-- Scorecard view (§8.3) — per kind, setup, direction, grade and tier:
-- calls, wins, win rate, the probability that was stated, and the base rate.
-- Plus the never-triggered rate: the share of nightly (armed/ready)
-- candidates that never crossed the pivot within 5 sessions.
--
-- Only final = true rows are graded (§8.3: final once the 20-session
-- window has closed), so the view only sees final rows.
--   * wins: rows in the group whose outcome hit that group's tier.
--     Tier NULL (no tier assigned) → wins and win rate are NULL.
--   * stated_p: the average of the stated p for that tier (p_t1/p_t2/p_t3).
--   * base_rate: the average base_rate over the prob-table rows for the
--     buckets this group covers (same setup/direction/grade, same tier,
--     kind 'stock' for candidates/triggers and 'option' for plays).
--     It is an average over buckets, not a single bucket's rate — see
--     README-cmo.md. NULL when no prob-table row matches (e.g. before
--     WO-03 publishes its first tables).
--   * never_triggered / never_triggered_rate: over nightly rows only;
--     live triggers and plays always triggered by definition.
--   * basis: outcome carries "extremes" for candidates (judged on the
--     highest/lowest reached, §3.1) and "close" for option plays.
-- ---------------------------------------------------------------------------
create or replace view cmo.cmo_scorecard
with (security_invoker = true)
as
select
  p.kind,
  p.setup,
  p.direction,
  p.grade,
  p.tier,
  count(*)::bigint as calls,
  case
    when p.tier is null then null
    else count(*) filter (
      where (p.outcome ->> ('hit_t' || p.tier))::boolean
    )
  end::bigint as wins,
  case
    when p.tier is null then null
    else (count(*) filter (
      where (p.outcome ->> ('hit_t' || p.tier))::boolean
    ))::numeric / nullif(count(*), 0)
  end as win_rate,
  avg(case p.tier
    when 1 then p.p_t1
    when 2 then p.p_t2
    when 3 then p.p_t3
  end) as stated_p,
  (
    select avg(pt.base_rate)
      from cmo.cmo_prob_tables pt
     where pt.tier = p.tier
       and pt.kind = case
           when p.kind in ('stock_trigger', 'stock_orb') then 'option'
           else 'stock'
         end
       and pt.bucket_key like p.setup || '|' || p.direction || '|' || p.grade || '|%'
  ) as base_rate,
  count(*) filter (
    where p.source = 'nightly'
      and (p.outcome ->> 'triggered')::boolean = false
  )::bigint as never_triggered,
  (count(*) filter (
    where p.source = 'nightly'
      and (p.outcome ->> 'triggered')::boolean = false
  ))::numeric
    / nullif(count(*) filter (where p.source = 'nightly'), 0)
    as never_triggered_rate
from cmo.cmo_predictions p
where p.final = true
group by p.kind, p.setup, p.direction, p.grade, p.tier;

comment on view cmo.cmo_scorecard is
  'WO-02 §8.3: stated vs actual per kind/setup/direction/grade/tier. '
  'base_rate is the average base_rate over the prob-table buckets the group covers. '
  'never_triggered_rate is over nightly rows only. security_invoker = true so the '
  'RLS on cmo_predictions applies to the caller.';

grant select on table cmo.cmo_scorecard to authenticated, service_role;
