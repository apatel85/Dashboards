-- WO-02 · CMO schema — file 3 of 3: acceptance checks (WO-02 accept criteria)
-- TradeDesk scoring revamp, Rev 4 spec §8.2 + WO-02 accept list.
--
-- HOW TO RUN: Supabase SQL editor on the STAGING project, AFTER 01 and 02.
--   1. EDIT THE TWO EMAILS BELOW (the only lines you must change):
--        invited_email = an email on the STAGING invite list;
--        outsider_email = any email NOT on the list.
--      The script inserts the invited row itself (inside the transaction),
--      so you do not need to seed the invite list by hand.
--   2. Paste the whole file and Run. Read the NOTICEs: every line must say
--      PASS. Any FAIL names the check that broke.
--   3. NOTHING persists: the whole script runs inside one transaction that
--      ends in ROLLBACK. The seed rows, the invite row and the test
--      live-signal rows all vanish. Do NOT run this on the live project.
--
-- WHAT IT CHECKS (the WO-02 accept list, verbatim):
--   A. As an invited user, select works on the read tables and FAILS on the
--      service-only tables (cmo_backtest_cases, option_chain_snapshots).
--   B. As a signed-in user NOT on the invite list, every select returns
--      nothing (including the cmo_scorecard view).
--   C. An insert into cmo_live_signals with someone else's user_id is
--      refused; an insert with the caller's own user_id succeeds.
--   D. (Extra) the scorecard view math on the seed rows: 2 calls, 1 win,
--      win rate 0.5, stated_p 0.55, base_rate 0.31, never-triggered 1 of 2.
--   E. (Extra) the service path (this session, postgres) sees everything.
--
-- MECHANISM: `set local role authenticated` plus
-- `set_config('request.jwt.claims', ...)` makes auth.jwt() / auth.uid()
-- return the test user's claims for the rest of the transaction — the same
-- functions the RLS policies call. No real sign-in is needed. The fixed
-- UUIDs below are test identities only; they need not exist in auth.users,
-- because RLS only reads the JWT claims, never the users table.
--
-- EDIT THESE TWO LINES:
--   invited_email:  'invited@example.com'   (must match the invite row below)
--   outsider_email: 'outsider@example.com'  (must NOT be on the invite list)

begin;

-- ---------------------------------------------------------------------------
-- Seed (runs as postgres: bypasses RLS, so the seed always lands).
-- The invite row is inserted here too, inside the transaction, so the
-- invited-user checks see it and the ROLLBACK removes it afterwards.
-- ---------------------------------------------------------------------------
insert into public.tradedesk_invites (email, role)
values ('invited@example.com', 'member')
on conflict (email) do nothing;

insert into cmo.cmo_runs (run_id, bars_as_of, params_version, regime, counts)
values ('wo02-check-2026-11-21', '2026-11-20', 'cmo-rev4-wo01',
        '{"state": "Yellow", "reasons": ["check"]}'::jsonb,
        '{"candidates": 1}'::jsonb);

insert into cmo.cmo_candidates
  (run_id, session_date, ticker, direction, setup, status, score, grade,
   components, readiness, pivot, invalid_level, dist_to_pivot_pct, adr_pct,
   rvol, rs_rank, catalyst, growth, next_earnings, has_0dte, has_1dte,
   p_t1, p_t2, p_t3, expected_move, prob_detail, tier, high_probability, why)
values
  ('wo02-check-2026-11-21', '2026-11-20', 'AAPL', 'long', 'A1', 'armed',
   82, 'A', '[]'::jsonb, 70, 250.00, 240.00, 1.5, 4.2, 2.5, 85,
   '{}'::jsonb, '{}'::jsonb, '2026-12-01', true, true,
   0.55, 0.30, 0.12, 6.5, '{}'::jsonb, 1, false, '{"check row"}');

insert into cmo.cmo_dte_plan (session_date, params_version, payload)
values ('2026-11-21', 'cmo-rev4-wo01', '{"regime": {"state": "Yellow"}}'::jsonb);

insert into cmo.cmo_live_signals
  (user_id, kind, ticker, direction, score, grade, p_t1, p_t2, p_t3, tier, payload)
values
  ('11111111-1111-1111-1111-111111111111', 'trigger', 'AAPL', 'long',
   82, 'A', 0.55, 0.30, 0.12, 1, '{"levels": {"pivot": 250}}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'stock_orb', 'MSFT', 'short',
   78, 'A', 0.50, 0.25, 0.10, 1, '{"test": true}'::jsonb);

insert into cmo.cmo_predictions
  (source, kind, session_date, ticker, direction, setup, score, grade, tier,
   p_t1, p_t2, p_t3, params_version, entry_price, entry_ts, outcome, final)
values
  ('nightly', 'candidate', '2026-11-20', 'AAPL', 'long', 'A1', 82, 'A', 1,
   0.55, 0.30, 0.12, 'cmo-rev4-wo01', 250.00, '2026-11-20 14:30:00+00',
   '{"triggered": true, "entry_price": 250, "hit_t1": true, "hit_t2": false, "hit_t3": false, "sessions_to_t1": 4, "best_move_pct": 6.1, "worst_against_pct": -1.2, "basis": "extremes"}'::jsonb,
   true),
  ('nightly', 'candidate', '2026-11-20', 'AAPL', 'long', 'A1', 82, 'A', 1,
   0.55, 0.30, 0.12, 'cmo-rev4-wo01', null, null,
   '{"triggered": false, "hit_t1": false, "hit_t2": false, "hit_t3": false, "basis": "extremes"}'::jsonb,
   true);

insert into cmo.cmo_prob_tables
  (table_version, kind, bucket_key, tier, cases, hits, p, ci_low, ci_high,
   base_rate, lift, oos_cases, oos_p, passed)
values
  ('cmo-rev4-wo01', 'stock', 'A1|long|A|adr5-8|atr0-1', 1,
   120, 66, 0.55, 0.46, 0.63, 0.31, 1.77, 80, 0.50, true);

insert into cmo.cmo_validation
  (module, verdict, run_id, table_version, oos_from, oos_to, summary, data_quality)
values
  ('A1', 'pass', 'wo02-check-2026-11-21', 'cmo-rev4-wo01',
   '2024-11-01', '2026-10-31', '{"note": "check row"}'::jsonb, 'real');

insert into cmo.cmo_backtest_runs
  (run_id, module, args, params_version, git_sha, summary)
values
  ('wo02-check-2026-11-21', 'A1', '{}'::jsonb, 'cmo-rev4-wo01',
   'check-sha', '{"cases": 1}'::jsonb);

insert into cmo.cmo_backtest_cases
  (run_id, session_date, ticker, direction, setup, score, grade, bucket_key,
   hit_t1, hit_t2, hit_t3, sessions_to_t1, worst_against_pct, in_sample)
values
  ('wo02-check-2026-11-21', '2026-11-20', 'AAPL', 'long', 'A1', 82, 'A',
   'A1|long|A|adr5-8|atr0-1', true, false, false, 4, -1.2, true);

insert into cmo.market_reference (ts, symbol, value, change, change_pct, source)
values (now(), 'SPY', 7000.00, 12.50, 0.18, 'schwab');

insert into cmo.option_chain_snapshots (ts, underlying, expiry, spot, chain)
values (now(), 'AAPL', '2026-11-21', 250.00, '{"strikes": []}'::jsonb);

-- ---------------------------------------------------------------------------
-- TEST A — invited user (sub 11111111-..., email invited@example.com).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "email": "invited@example.com", "role": "authenticated", "aud": "authenticated"}',
  true);

do $$
declare v_n bigint;
begin
  select count(*) into v_n from cmo.cmo_runs;
  if v_n = 1 then raise notice 'PASS: A1 runs visible to invited user';
  else raise notice 'FAIL: A1 runs visible to invited user (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_candidates;
  if v_n = 1 then raise notice 'PASS: A1 candidates visible to invited user';
  else raise notice 'FAIL: A1 candidates visible to invited user (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_dte_plan;
  if v_n = 1 then raise notice 'PASS: A1 dte_plan visible to invited user';
  else raise notice 'FAIL: A1 dte_plan visible to invited user (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_live_signals;
  if v_n = 2 then raise notice 'PASS: A1 live_signals visible to invited user';
  else raise notice 'FAIL: A1 live_signals visible to invited user (got %, want 2)', v_n; end if;

  select count(*) into v_n from cmo.cmo_predictions;
  if v_n = 2 then raise notice 'PASS: A1 predictions visible to invited user';
  else raise notice 'FAIL: A1 predictions visible to invited user (got %, want 2)', v_n; end if;

  select count(*) into v_n from cmo.cmo_prob_tables;
  if v_n = 1 then raise notice 'PASS: A1 prob_tables visible to invited user';
  else raise notice 'FAIL: A1 prob_tables visible to invited user (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_validation;
  if v_n = 1 then raise notice 'PASS: A1 validation visible to invited user';
  else raise notice 'FAIL: A1 validation visible to invited user (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_backtest_runs;
  if v_n = 1 then raise notice 'PASS: A1 backtest_runs visible to invited user';
  else raise notice 'FAIL: A1 backtest_runs visible to invited user (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.market_reference;
  if v_n = 1 then raise notice 'PASS: A1 market_reference visible to invited user';
  else raise notice 'FAIL: A1 market_reference visible to invited user (got %, want 1)', v_n; end if;
end $$;

-- Service-only tables must FAIL for the invited user (no policy, no grant).
do $$
begin
  perform * from cmo.cmo_backtest_cases limit 1;
  raise notice 'FAIL: A2 backtest_cases select succeeded for invited user (want refused)';
exception when insufficient_privilege then
  raise notice 'PASS: A2 backtest_cases select refused for invited user (42501)';
end $$;

do $$
begin
  perform * from cmo.option_chain_snapshots limit 1;
  raise notice 'FAIL: A2 option_chain_snapshots select succeeded for invited user (want refused)';
exception when insufficient_privilege then
  raise notice 'PASS: A2 option_chain_snapshots select refused for invited user (42501)';
end $$;

-- Own-user_id insert must succeed; someone else's must be refused.
do $$
begin
  insert into cmo.cmo_live_signals
    (user_id, kind, ticker, direction, score, grade, p_t1, p_t2, p_t3, tier, payload)
  values
    ('11111111-1111-1111-1111-111111111111', 'trigger', 'MSFT', 'short',
     78, 'A', 0.50, 0.25, 0.10, 1, '{"test": true}'::jsonb);
  raise notice 'PASS: A3 own-user_id insert allowed for invited user';
exception when insufficient_privilege then
  raise notice 'FAIL: A3 own-user_id insert refused for invited user (42501)';
end $$;

do $$
begin
  insert into cmo.cmo_live_signals
    (user_id, kind, ticker, direction, score, grade, p_t1, p_t2, p_t3, tier, payload)
  values
    ('22222222-2222-2222-2222-222222222222', 'trigger', 'MSFT', 'short',
     78, 'A', 0.50, 0.25, 0.10, 1, '{"test": true}'::jsonb);
  raise notice 'FAIL: A4 other-user_id insert succeeded for invited user (want refused)';
exception when insufficient_privilege then
  raise notice 'PASS: A4 other-user_id insert refused for invited user (42501)';
end $$;

-- Scorecard view math on the seed rows (invited user, security_invoker).
do $$
declare r record;
begin
  select * into r from cmo.cmo_scorecard
   where kind = 'candidate' and setup = 'A1' and direction = 'long'
     and grade = 'A' and tier = 1;
  if not found then
    raise notice 'FAIL: D scorecard returned no row for the seed group';
  elsif r.calls = 2 and r.wins = 1 and r.win_rate = 0.5
     and r.stated_p = 0.55 and r.base_rate = 0.31
     and r.never_triggered = 1 and r.never_triggered_rate = 0.5 then
    raise notice 'PASS: D scorecard math (calls 2, wins 1, win_rate 0.5, stated_p 0.55, base_rate 0.31, never_triggered 1/2)';
  else
    raise notice 'FAIL: D scorecard math (calls %, wins %, win_rate %, stated_p %, base_rate %, never_triggered %, rate %)',
      r.calls, r.wins, r.win_rate, r.stated_p, r.base_rate, r.never_triggered, r.never_triggered_rate;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- TEST B — signed-in user NOT on the invite list (sub 22222222-...).
-- Every select must return nothing, including the view.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "email": "outsider@example.com", "role": "authenticated", "aud": "authenticated"}',
  true);

do $$
declare v_n bigint;
begin
  select count(*) into v_n from cmo.cmo_runs;
  if v_n = 0 then raise notice 'PASS: B runs hidden from non-invitee';
  else raise notice 'FAIL: B runs hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_candidates;
  if v_n = 0 then raise notice 'PASS: B candidates hidden from non-invitee';
  else raise notice 'FAIL: B candidates hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_dte_plan;
  if v_n = 0 then raise notice 'PASS: B dte_plan hidden from non-invitee';
  else raise notice 'FAIL: B dte_plan hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_live_signals;
  if v_n = 0 then raise notice 'PASS: B live_signals hidden from non-invitee';
  else raise notice 'FAIL: B live_signals hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_predictions;
  if v_n = 0 then raise notice 'PASS: B predictions hidden from non-invitee';
  else raise notice 'FAIL: B predictions hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_prob_tables;
  if v_n = 0 then raise notice 'PASS: B prob_tables hidden from non-invitee';
  else raise notice 'FAIL: B prob_tables hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_validation;
  if v_n = 0 then raise notice 'PASS: B validation hidden from non-invitee';
  else raise notice 'FAIL: B validation hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_backtest_runs;
  if v_n = 0 then raise notice 'PASS: B backtest_runs hidden from non-invitee';
  else raise notice 'FAIL: B backtest_runs hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.market_reference;
  if v_n = 0 then raise notice 'PASS: B market_reference hidden from non-invitee';
  else raise notice 'FAIL: B market_reference hidden from non-invitee (got %, want 0)', v_n; end if;

  select count(*) into v_n from cmo.cmo_scorecard;
  if v_n = 0 then raise notice 'PASS: B scorecard hidden from non-invitee';
  else raise notice 'FAIL: B scorecard hidden from non-invitee (got %, want 0)', v_n; end if;
end $$;

-- A non-invitee may not insert even with their own user_id (insert policy
-- requires cmo.is_invited() — see 02-cmo-rls.sql judgment call).
do $$
begin
  insert into cmo.cmo_live_signals
    (user_id, kind, ticker, direction, score, grade, p_t1, p_t2, p_t3, tier, payload)
  values
    ('22222222-2222-2222-2222-222222222222', 'trigger', 'MSFT', 'short',
     78, 'A', 0.50, 0.25, 0.10, 1, '{"test": true}'::jsonb);
  raise notice 'FAIL: B non-invitee insert succeeded (want refused)';
exception when insufficient_privilege then
  raise notice 'PASS: B non-invitee insert refused (42501)';
end $$;

-- ---------------------------------------------------------------------------
-- TEST E — service path: back as postgres, everything is visible.
-- (The SQL editor runs as postgres, which bypasses RLS — the same path
-- the service key takes.)
-- ---------------------------------------------------------------------------
reset role;

do $$
declare v_n bigint;
begin
  select count(*) into v_n from cmo.cmo_runs;
  if v_n = 1 then raise notice 'PASS: E service path sees runs';
  else raise notice 'FAIL: E service path sees runs (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_backtest_cases;
  if v_n = 1 then raise notice 'PASS: E service path sees backtest_cases';
  else raise notice 'FAIL: E service path sees backtest_cases (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.option_chain_snapshots;
  if v_n = 1 then raise notice 'PASS: E service path sees option_chain_snapshots';
  else raise notice 'FAIL: E service path sees option_chain_snapshots (got %, want 1)', v_n; end if;

  select count(*) into v_n from cmo.cmo_scorecard;
  if v_n = 1 then raise notice 'PASS: E service path sees scorecard';
  else raise notice 'FAIL: E service path sees scorecard (got %, want 1)', v_n; end if;
end $$;

-- Nothing persists: seed rows, invite row and test inserts all roll back.
rollback;

-- Expected output: every line says PASS (A1 x9, A2 x2, A3, A4, D, B x10 + B insert, E x4).
