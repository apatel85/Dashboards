-- WO-02 · CMO schema — file 1 of 3: schema, tables, helpers
-- TradeDesk scoring revamp, Rev 4 spec §8.1.
--
-- RUN ORDER: 01-cmo-schema.sql, then 02-cmo-rls.sql, then 03-cmo-acceptance-checks.sql.
-- Run in the Supabase SQL editor on the STAGING project first — never straight
-- to the live project. See README-cmo.md for the dashboard steps.
--
-- Schema: the spec §8 names no schema, so the tables live in schema `cmo`
-- (one schema per app, like `dealfinder` / `cricmax`). PostgREST reaches
-- them as /cmo_runs etc. only with `Accept-Profile: cmo` (reads) /
-- `Content-Profile: cmo` (writes) — see README-cmo.md.
--
-- Conventions used here (all §8.1 column names kept verbatim):
--   * `direction` is 'long' | 'short' everywhere.
--   * `grade` is 'A+' | 'A' | 'B' | 'C' (spec §5 grades).
--   * `setup` on candidates is one of A1/A2/A1S/A2S/A3S. On predictions it is
--     the same five for candidates/triggers, and NULL for stock_orb plays
--     (an opening-range play has no breakout setup).
--   * `kind` vocabularies (judgment call — §8 lists the column but not the
--     values): cmo_predictions.kind is 'candidate' (nightly row) | 'trigger'
--     (live trigger of a candidate) | 'stock_trigger' | 'stock_orb';
--     cmo_live_signals.kind is 'trigger' | 'stock_trigger' | 'stock_orb';
--     cmo_prob_tables.kind is 'stock' (§6.4 buckets) | 'option' (§7.5 buckets).
--   * `bucket_key` is the WO-01 library format (lib/cmo/tiers.mjs):
--     setup|direction|grade|adrBand|atrBand, e.g. 'A1|long|A|adr5-8|atr0-1'.
--     ADR bands: adr<3, adr3-5, adr5-8, adr8+. ATR bands: atr0-1, atr1-2, atr2+.
--   * `prob_detail` (cmo_candidates) is {"t1": {"p","cases","ci_low","ci_high",
--     "base_rate","lift","fallback"}, ...} with fallback one of
--     'full' | 'no-atr' | 'no-adr' | 'merged-grade' (§6.4 step 3).
--   * `outcome` (cmo_predictions) is {"triggered": bool, "entry_price",
--     "entry_ts", "hit_t1","hit_t2","hit_t3", "sessions_to_t1",
--     "best_move_pct", "worst_against_pct", "basis": "extremes"|"close",
--     "touch_t1","touch_t2","touch_t3" (option plays only — close-based
--     hit_* is the judged metric, touch is recorded alongside, §3.1)}.
--   * `cmo_runs.regime` is the regimeState() shape {state, reasons[]};
--     `cmo_runs.counts` is {"candidates": n, "armed": n, "ready": n, ...}.
--   * `market_reference.symbol` is one of SPY, QQQ, ES, NQ, VIX, TNX (§3).
--   * No serial columns anywhere (uuid / text keys), so no sequence grants.
--   * Foreign keys only where the writer always writes the parent first:
--     cmo_candidates.run_id → cmo_runs, cmo_backtest_cases.run_id →
--     cmo_backtest_runs. Everything else is deliberately key-free so a
--     late or partial publish never blocks on ordering.

create schema if not exists cmo;

-- Is the caller on the TradeDesk invite list? SECURITY DEFINER so the RLS
-- policies in 02-cmo-rls.sql can call it without recursing through the
-- invites table's own RLS (same pattern as public.is_tradedesk_admin()).
-- The app gate (src/auth/AuthGate.tsx) does the same check from the browser:
-- an invites row whose email matches the signed-in user's email.
create or replace function cmo.is_invited()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tradedesk_invites
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- cmo_runs — one nightly build (pipeline)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_runs (
  run_id         text primary key,
  generated_at   timestamptz not null default now(),
  bars_as_of     date,
  params_version text not null,
  regime         jsonb not null default '{}'::jsonb,
  counts         jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- cmo_candidates — one candidate in one run (pipeline)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_candidates (
  run_id           text not null references cmo.cmo_runs (run_id),
  session_date     date not null,
  ticker           text not null,
  direction        text not null check (direction in ('long', 'short')),
  setup            text not null check (setup in ('A1', 'A2', 'A1S', 'A2S', 'A3S')),
  status           text not null check (status in ('armed', 'ready', 'triggered')),
  score            numeric not null,
  grade            text not null check (grade in ('A+', 'A', 'B', 'C')),
  components       jsonb not null default '[]'::jsonb,
  readiness        numeric,
  pivot            numeric,
  invalid_level    numeric,
  dist_to_pivot_pct numeric,
  adr_pct          numeric,
  rvol             numeric,
  rs_rank          numeric,
  catalyst         jsonb not null default '{}'::jsonb,
  growth           jsonb not null default '{}'::jsonb,
  next_earnings    date,
  has_0dte         boolean not null default false,
  has_1dte         boolean not null default false,
  p_t1             numeric check (p_t1 is null or (p_t1 >= 0 and p_t1 <= 1)),
  p_t2             numeric check (p_t2 is null or (p_t2 >= 0 and p_t2 <= 1)),
  p_t3             numeric check (p_t3 is null or (p_t3 >= 0 and p_t3 <= 1)),
  expected_move    numeric,
  prob_detail      jsonb not null default '{}'::jsonb,
  tier             smallint check (tier is null or tier in (1, 2, 3)),
  high_probability boolean not null default false,
  why              text[],
  primary key (run_id, session_date, ticker, direction, setup)
);

create index if not exists cmo_candidates_session_idx
  on cmo.cmo_candidates (session_date, setup, direction, grade);
create index if not exists cmo_candidates_ticker_idx
  on cmo.cmo_candidates (ticker, session_date);

-- ---------------------------------------------------------------------------
-- cmo_dte_plan — one session's pre-open plan (pipeline, §7.2)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_dte_plan (
  session_date   date primary key,
  params_version text not null,
  payload        jsonb not null default '{}'::jsonb
  -- payload (§7.2): which breakout candidates and liquid stocks have a 0/1
  -- DTE expiry in the coming session, dealer gamma state per stock from
  -- gex.json, scheduled events (FOMC/CPI/jobs/monthly expiry) plus each
  -- watched stock's own earnings date, and the daily regime.
);

-- ---------------------------------------------------------------------------
-- cmo_live_signals — one live trigger or option play (browser, §6.5 / §7.3)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_live_signals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  ts         timestamptz not null default now(),
  kind       text not null check (kind in ('trigger', 'stock_trigger', 'stock_orb')),
  ticker     text not null,
  direction  text not null check (direction in ('long', 'short')),
  score      numeric,
  grade      text check (grade is null or grade in ('A+', 'A', 'B', 'C')),
  p_t1       numeric check (p_t1 is null or (p_t1 >= 0 and p_t1 <= 1)),
  p_t2       numeric check (p_t2 is null or (p_t2 >= 0 and p_t2 <= 1)),
  p_t3       numeric check (p_t3 is null or (p_t3 >= 0 and p_t3 <= 1)),
  tier       smallint check (tier is null or tier in (1, 2, 3)),
  payload    jsonb not null default '{}'::jsonb
  -- payload: levels, contract (§7.4 output: symbol, type, strike, expiry,
  -- delta, mid, spread_pct, tier_strikes {t1, t2, t3}) and the signal inputs.
);

create index if not exists cmo_live_signals_user_idx
  on cmo.cmo_live_signals (user_id, ts desc);
create index if not exists cmo_live_signals_ticker_idx
  on cmo.cmo_live_signals (ticker, ts desc);

-- ---------------------------------------------------------------------------
-- cmo_predictions — one logged call and its outcome (pipeline, §8.3)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_predictions (
  id             uuid primary key default gen_random_uuid(),
  source         text not null check (source in ('nightly', 'live')),
  kind           text not null check (kind in ('candidate', 'trigger', 'stock_trigger', 'stock_orb')),
  session_date   date not null,
  ticker         text not null,
  direction      text not null check (direction in ('long', 'short')),
  setup          text check (setup is null or setup in ('A1', 'A2', 'A1S', 'A2S', 'A3S')),
  score          numeric,
  grade          text check (grade is null or grade in ('A+', 'A', 'B', 'C')),
  tier           smallint check (tier is null or tier in (1, 2, 3)),
  p_t1           numeric check (p_t1 is null or (p_t1 >= 0 and p_t1 <= 1)),
  p_t2           numeric check (p_t2 is null or (p_t2 >= 0 and p_t2 <= 1)),
  p_t3           numeric check (p_t3 is null or (p_t3 >= 0 and p_t3 <= 1)),
  params_version text,
  entry_price    numeric,
  entry_ts       timestamptz,
  outcome        jsonb not null default '{}'::jsonb,
  final          boolean not null default false
);

create index if not exists cmo_predictions_session_idx
  on cmo.cmo_predictions (session_date, ticker);
create index if not exists cmo_predictions_ticker_idx
  on cmo.cmo_predictions (ticker, session_date);
create index if not exists cmo_predictions_final_idx
  on cmo.cmo_predictions (final) where final;

-- ---------------------------------------------------------------------------
-- cmo_prob_tables — one bucket × tier (backtest, §6.4)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_prob_tables (
  table_version text not null,
  kind          text not null check (kind in ('stock', 'option')),
  bucket_key    text not null,
  tier          smallint not null check (tier in (1, 2, 3)),
  cases         integer not null check (cases >= 0),
  hits          integer not null check (hits >= 0),
  p             numeric check (p is null or (p >= 0 and p <= 1)),
  ci_low        numeric check (ci_low is null or (ci_low >= 0 and ci_low <= 1)),
  ci_high       numeric check (ci_high is null or (ci_high >= 0 and ci_high <= 1)),
  base_rate     numeric check (base_rate is null or (base_rate >= 0 and base_rate <= 1)),
  lift          numeric,
  oos_cases     integer check (oos_cases is null or oos_cases >= 0),
  oos_p         numeric check (oos_p is null or (oos_p >= 0 and oos_p <= 1)),
  passed        boolean,
  primary key (table_version, kind, bucket_key, tier)
);

-- ---------------------------------------------------------------------------
-- cmo_validation — one module's verdict (backtest, WO-03)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_validation (
  module       text not null,
  verdict      text not null,
  run_id       text not null,
  table_version text,
  oos_from     date,
  oos_to       date,
  summary      jsonb not null default '{}'::jsonb,
  data_quality text not null check (data_quality in ('real', 'modelled')),
  primary key (module, run_id)
  -- verdict vocabulary is defined by WO-03 (the backtest gates); kept as
  -- free text here so this file does not invent it.
);

-- ---------------------------------------------------------------------------
-- cmo_backtest_runs — one backtest run (backtest, WO-03)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_backtest_runs (
  run_id         text primary key,
  module         text not null,
  args           jsonb not null default '{}'::jsonb,
  params_version text,
  git_sha        text,
  started_at     timestamptz not null default now(),
  summary        jsonb not null default '{}'::jsonb
);

create index if not exists cmo_backtest_runs_module_idx
  on cmo.cmo_backtest_runs (module, started_at desc);

-- ---------------------------------------------------------------------------
-- cmo_backtest_cases — one historical candidate (backtest, WO-03)
-- ---------------------------------------------------------------------------
create table if not exists cmo.cmo_backtest_cases (
  run_id          text not null references cmo.cmo_backtest_runs (run_id),
  session_date    date not null,
  ticker          text not null,
  direction       text not null check (direction in ('long', 'short')),
  setup           text not null check (setup in ('A1', 'A2', 'A1S', 'A2S', 'A3S', 'stock_trigger', 'stock_orb', 'S1', 'S2', 'S3', 'S4')),
  score           numeric,
  grade           text check (grade is null or grade in ('A+', 'A', 'B', 'C')),
  bucket_key      text,
  hit_t1          boolean,
  hit_t2          boolean,
  hit_t3          boolean,
  sessions_to_t1  integer,
  worst_against_pct numeric,
  in_sample       boolean not null,
  primary key (run_id, session_date, ticker, direction, setup)
);

create index if not exists cmo_backtest_cases_ticker_idx
  on cmo.cmo_backtest_cases (ticker, session_date);

-- ---------------------------------------------------------------------------
-- market_reference — one snapshot of one reference symbol (pipeline nightly;
-- browser may refresh, §7.7). Symbols: SPY, QQQ, ES, NQ, VIX, TNX (§3).
-- ---------------------------------------------------------------------------
create table if not exists cmo.market_reference (
  ts         timestamptz not null,
  symbol     text not null,
  value      numeric not null,
  change     numeric,
  change_pct numeric,
  source     text,
  primary key (ts, symbol)
);

create index if not exists cmo_market_reference_symbol_idx
  on cmo.market_reference (symbol, ts desc);

-- ---------------------------------------------------------------------------
-- option_chain_snapshots — one chain at one time (snapshot job, WO-12)
-- chain is jsonb, strikes within ±15% of spot only (§8.4), and by default
-- only the chosen contract plus the three tier strikes are stored.
-- ---------------------------------------------------------------------------
create table if not exists cmo.option_chain_snapshots (
  ts         timestamptz not null,
  underlying text not null,
  expiry     date not null,
  spot       numeric,
  chain      jsonb not null default '{}'::jsonb,
  primary key (ts, underlying, expiry)
);

create index if not exists cmo_option_chain_snapshots_underlying_idx
  on cmo.option_chain_snapshots (underlying, ts desc);

-- ---------------------------------------------------------------------------
-- Retention helper (§8.4): cmo_candidates keeps 180 sessions; option
-- snapshots keep 30 sessions. Older rows are deleted. The pipeline calls
-- this after a publish (service role only — see 02-cmo-rls.sql). It returns
-- how many rows were deleted and the cutoffs used, so the publish log can
-- show it. Predictions are never trimmed (their predictions stay).
-- Session = ET calendar day for snapshots (ts is timestamptz).
-- ---------------------------------------------------------------------------
create or replace function cmo.trim_retention()
returns jsonb
language plpgsql
security definer
set search_path = cmo, public
as $$
declare
  v_cand_cutoff date;
  v_snap_cutoff date;
  v_cand integer := 0;
  v_snap integer := 0;
begin
  select session_date into v_cand_cutoff
  from (select distinct session_date
          from cmo.cmo_candidates
         order by session_date desc
         limit 1 offset 179) s;
  if v_cand_cutoff is not null then
    delete from cmo.cmo_candidates where session_date < v_cand_cutoff;
    get diagnostics v_cand = row_count;
  end if;

  select d into v_snap_cutoff
  from (select distinct ((ts at time zone 'America/New_York')::date) as d
          from cmo.option_chain_snapshots
         order by d desc
         limit 1 offset 29) s;
  if v_snap_cutoff is not null then
    delete from cmo.option_chain_snapshots
     where ((ts at time zone 'America/New_York')::date) < v_snap_cutoff;
    get diagnostics v_snap = row_count;
  end if;

  return jsonb_build_object(
    'candidates_deleted', v_cand,
    'snapshots_deleted', v_snap,
    'candidates_cutoff', v_cand_cutoff,
    'snapshots_cutoff', v_snap_cutoff
  );
end;
$$;
