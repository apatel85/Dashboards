#!/usr/bin/env node
/**
 * pipeline/lib/supabase-admin.mjs — PostgREST writer for the CMO pipeline.
 *
 * WO-02 (Rev 4 spec §8.2): the pipeline and the backtest write to the `cmo`
 * schema with the service key. The browser never uses this file — it reads
 * through the Supabase client with RLS (see TradeDesk/supabase/README-cmo.md).
 *
 * Credentials come from env vars ONLY — never hardcoded, never in a file:
 *   SUPABASE_URL         e.g. https://<ref>.supabase.co (staging or live)
 *   SUPABASE_SERVICE_KEY the service key (GitHub secret in CI; env var locally)
 *   SUPABASE_SCHEMA      default 'cmo'
 *   SUPABASE_BATCH_SIZE  default 500 rows per request
 *   SUPABASE_DRY_RUN     '1' = dry-run mode (print row counts, write nothing)
 *
 * What it does:
 *   - upsert(table, rows, { onConflict }) — batched, Prefer:
 *     resolution=merge-duplicates, so re-running a publish is idempotent.
 *   - insert(table, rows) — plain insert (no merge).
 *   - rpc(fn, args) — call a function in the schema (e.g. trim_retention).
 *   - Every request sends Accept-Profile / Content-Profile: cmo (PostgREST
 *     looks in `public` without them — see the README). Retries 408/425/429
 *     and 5xx with exponential backoff + jitter, honouring Retry-After.
 *   - Dry-run mode never calls fetch: it validates the rows and prints
 *     what WOULD be written, per table, per batch.
 *
 * CLI:
 *   node pipeline/lib/supabase-admin.mjs --dry-run
 *       Runs the built-in sample payload (one row per §8 table) through the
 *       dry-run path. Needs no database and no env vars. This is the
 *       command the WO-02 report quotes.
 *   node pipeline/lib/supabase-admin.mjs --check-env
 *       Prints which env vars are set (names only, never values).
 *   node pipeline/lib/supabase-admin.mjs --live --table cmo_runs \
 *       --file rows.json [--on-conflict run_id]
 *       Really upserts the JSON array in rows.json. Requires the env vars.
 *       Refuses to run without --live, so a publish step cannot write by
 *       accident.
 *
 * No fs/http imports beyond fetch + (CLI only) fs for --file. No clock
 * reads for logic (timestamps come from the rows or the database default).
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_SCHEMA = 'cmo';
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_RETRIES = 5;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

/** Resolve config from overrides, then env vars. Throws naming the var. */
export function resolveConfig(overrides = {}) {
  const dryRun =
    overrides.dryRun !== undefined
      ? overrides.dryRun
      : process.env.SUPABASE_DRY_RUN === '1';
  // Dry-run never touches a database, so it must not demand credentials.
  const url = overrides.url ?? process.env.SUPABASE_URL ?? (dryRun ? 'https://dry-run.invalid' : undefined);
  const serviceKey =
    overrides.serviceKey ?? process.env.SUPABASE_SERVICE_KEY ?? (dryRun ? 'dry-run' : undefined);
  if (!url) {
    throw new Error('supabase-admin: SUPABASE_URL is not set (env var or { url })');
  }
  if (!serviceKey) {
    throw new Error('supabase-admin: SUPABASE_SERVICE_KEY is not set (env var or { serviceKey })');
  }
  return {
    url: url.replace(/\/$/, ''),
    serviceKey,
    schema: overrides.schema ?? process.env.SUPABASE_SCHEMA ?? DEFAULT_SCHEMA,
    dryRun: Boolean(dryRun),
    batchSize:
      overrides.batchSize ?? Number(process.env.SUPABASE_BATCH_SIZE || DEFAULT_BATCH_SIZE),
    maxRetries: overrides.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryBaseMs: overrides.retryBaseMs ?? 500,
  };
}

/** Split rows into batches of `size`. Pure; exported for tests. */
export function chunkRows(rows, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`supabase-admin: batch size must be a positive integer (got ${size})`);
  }
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function assertRows(table, rows, onConflict) {
  if (!Array.isArray(rows)) {
    throw new Error(`supabase-admin: rows for ${table} must be an array`);
  }
  for (const [i, row] of rows.entries()) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`supabase-admin: row ${i} of ${table} is not an object`);
    }
    if (onConflict) {
      for (const col of onConflict.split(',').map((s) => s.trim())) {
        if (row[col] === undefined) {
          throw new Error(
            `supabase-admin: row ${i} of ${table} is missing on-conflict column "${col}"`,
          );
        }
      }
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One PostgREST request with retry. Retries 408/425/429/5xx and transient
 * network errors; anything else (e.g. 400, 401, 403, 404) throws at once
 * with the response body attached. Returns the final Response.
 */
export async function requestWithRetry(fetchImpl, url, init, { maxRetries, retryBaseMs, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      if (!RETRYABLE_CODES.has(err?.code) || attempt >= maxRetries) throw err;
      const delay = Math.min(30000, retryBaseMs * 2 ** attempt + Math.random() * 250);
      onRetry?.({ attempt, delay, error: err });
      await sleep(delay);
      attempt += 1;
      continue;
    }
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
      const retryAfter = Number(res.headers?.get?.('Retry-After'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30000, retryBaseMs * 2 ** attempt + Math.random() * 250);
      onRetry?.({ attempt, delay, status: res.status });
      await sleep(delay);
      attempt += 1;
      continue;
    }
    return res;
  }
}

function restUrl(client, path, query = '') {
  return `${client.config.url}/rest/v1/${path}${query}`;
}

function postgrestHeaders(client, method) {
  const headers = {
    apikey: client.config.serviceKey,
    'Content-Type': 'application/json',
  };
  // apikey only — never Authorization: Bearer with an sb_secret_ key.
  // The new secret keys are not JWTs, so Bearer fails PGRST301 (verified
  // 2026-11-21). The apikey header alone authenticates as service_role.
  // PostgREST looks in `public` without these — see README-cmo.md.
  if (method === 'GET') headers['Accept-Profile'] = client.config.schema;
  else headers['Content-Profile'] = client.config.schema;
  return headers;
}

async function throwIfError(res, method, path) {
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  throw Object.assign(
    new Error(`PostgREST ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`),
    { status: res.status },
  );
}

/** Create a client. `fetchImpl` is injectable for tests; defaults to global fetch. */
export function createAdminClient(overrides = {}) {
  const config = resolveConfig(overrides);
  const fetchImpl = overrides.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('supabase-admin: no fetch implementation available (Node 18+ or pass { fetchImpl })');
  }
  const client = { config, fetchImpl };
  return {
    config,
    upsert: (table, rows, opts) => upsertRows(client, table, rows, opts),
    insert: (table, rows, opts) => insertRows(client, table, rows, opts),
    rpc: (fn, args) => callRpc(client, fn, args),
    trimRetention: () => callRpc(client, 'trim_retention', {}),
  };
}

export async function upsertRows(client, table, rows, { onConflict, batchSize } = {}) {
  assertRows(table, rows, onConflict);
  const size = batchSize ?? client.config.batchSize;
  const batches = chunkRows(rows, size);
  if (client.config.dryRun) {
    for (const b of batches) {
      console.log(
        `[dry-run] would upsert ${b.length} row(s) into ${client.config.schema}.${table}` +
          (onConflict ? ` (on conflict ${onConflict})` : ''),
      );
    }
    return { table, attempted: rows.length, written: 0, batches: batches.length, dryRun: true };
  }
  let written = 0;
  for (const batch of batches) {
    const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const res = await requestWithRetry(
      client.fetchImpl,
      restUrl(client, table, query),
      {
        method: 'POST',
        headers: {
          ...postgrestHeaders(client, 'POST'),
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      },
      client.config,
    );
    await throwIfError(res, 'POST', table);
    written += batch.length;
  }
  return { table, attempted: rows.length, written, batches: batches.length, dryRun: false };
}

export async function insertRows(client, table, rows, { batchSize } = {}) {
  assertRows(table, rows);
  const size = batchSize ?? client.config.batchSize;
  const batches = chunkRows(rows, size);
  if (client.config.dryRun) {
    for (const b of batches) {
      console.log(`[dry-run] would insert ${b.length} row(s) into ${client.config.schema}.${table}`);
    }
    return { table, attempted: rows.length, written: 0, batches: batches.length, dryRun: true };
  }
  let written = 0;
  for (const batch of batches) {
    const res = await requestWithRetry(
      client.fetchImpl,
      restUrl(client, table),
      {
        method: 'POST',
        headers: { ...postgrestHeaders(client, 'POST'), Prefer: 'return=minimal' },
        body: JSON.stringify(batch),
      },
      client.config,
    );
    await throwIfError(res, 'POST', table);
    written += batch.length;
  }
  return { table, attempted: rows.length, written, batches: batches.length, dryRun: false };
}

export async function callRpc(client, fn, args = {}) {
  if (client.config.dryRun) {
    console.log(`[dry-run] would call rpc ${client.config.schema}.${fn} with ${JSON.stringify(args)}`);
    return { fn, args, dryRun: true, result: null };
  }
  const res = await requestWithRetry(
    client.fetchImpl,
    restUrl(client, `rpc/${fn}`),
    {
      method: 'POST',
      headers: postgrestHeaders(client, 'POST'),
      body: JSON.stringify(args),
    },
    client.config,
  );
  await throwIfError(res, 'POST', `rpc/${fn}`);
  return { fn, args, dryRun: false, result: await res.json().catch(() => null) };
}

/**
 * One sample row per §8 table, in the shapes the pipeline/backtest will
 * write. Used by --dry-run and by the tests. Values are fixed literals
 * (the same seed as 03-cmo-acceptance-checks.sql) — no live data.
 */
export function sampleRows() {
  return {
    cmo_runs: [
      {
        run_id: 'wo02-check-2026-11-21',
        bars_as_of: '2026-11-20',
        params_version: 'cmo-rev4-wo01',
        regime: { state: 'Yellow', reasons: ['check'] },
        counts: { candidates: 1 },
      },
    ],
    cmo_candidates: [
      {
        run_id: 'wo02-check-2026-11-21',
        session_date: '2026-11-20',
        ticker: 'AAPL',
        direction: 'long',
        setup: 'A1',
        status: 'armed',
        score: 82,
        grade: 'A',
        components: [],
        readiness: 70,
        pivot: 250.0,
        invalid_level: 240.0,
        dist_to_pivot_pct: 1.5,
        adr_pct: 4.2,
        rvol: 2.5,
        rs_rank: 85,
        catalyst: {},
        growth: {},
        next_earnings: '2026-12-01',
        has_0dte: true,
        has_1dte: true,
        p_t1: 0.55,
        p_t2: 0.3,
        p_t3: 0.12,
        expected_move: 6.5,
        prob_detail: {},
        tier: 1,
        high_probability: false,
        why: ['check row'],
      },
    ],
    cmo_dte_plan: [
      {
        session_date: '2026-11-21',
        params_version: 'cmo-rev4-wo01',
        payload: { regime: { state: 'Yellow' } },
      },
    ],
    cmo_live_signals: [
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        kind: 'trigger',
        ticker: 'AAPL',
        direction: 'long',
        score: 82,
        grade: 'A',
        p_t1: 0.55,
        p_t2: 0.3,
        p_t3: 0.12,
        tier: 1,
        payload: { levels: { pivot: 250 } },
      },
    ],
    cmo_predictions: [
      {
        source: 'nightly',
        kind: 'candidate',
        session_date: '2026-11-20',
        ticker: 'AAPL',
        direction: 'long',
        setup: 'A1',
        score: 82,
        grade: 'A',
        tier: 1,
        p_t1: 0.55,
        p_t2: 0.3,
        p_t3: 0.12,
        params_version: 'cmo-rev4-wo01',
        entry_price: 250.0,
        entry_ts: '2026-11-20T14:30:00Z',
        outcome: { triggered: true, hit_t1: true, hit_t2: false, hit_t3: false, basis: 'extremes' },
        final: true,
      },
    ],
    cmo_prob_tables: [
      {
        table_version: 'cmo-rev4-wo01',
        kind: 'stock',
        bucket_key: 'A1|long|A|adr5-8|atr0-1',
        tier: 1,
        cases: 120,
        hits: 66,
        p: 0.55,
        ci_low: 0.46,
        ci_high: 0.63,
        base_rate: 0.31,
        lift: 1.77,
        oos_cases: 80,
        oos_p: 0.5,
        passed: true,
      },
    ],
    cmo_validation: [
      {
        module: 'A1',
        verdict: 'pass',
        run_id: 'wo02-check-2026-11-21',
        table_version: 'cmo-rev4-wo01',
        oos_from: '2024-11-01',
        oos_to: '2026-10-31',
        summary: { note: 'check row' },
        data_quality: 'real',
      },
    ],
    cmo_backtest_runs: [
      {
        run_id: 'wo02-check-2026-11-21',
        module: 'A1',
        args: {},
        params_version: 'cmo-rev4-wo01',
        git_sha: 'check-sha',
        summary: { cases: 1 },
      },
    ],
    cmo_backtest_cases: [
      {
        run_id: 'wo02-check-2026-11-21',
        session_date: '2026-11-20',
        ticker: 'AAPL',
        direction: 'long',
        setup: 'A1',
        score: 82,
        grade: 'A',
        bucket_key: 'A1|long|A|adr5-8|atr0-1',
        hit_t1: true,
        hit_t2: false,
        hit_t3: false,
        sessions_to_t1: 4,
        worst_against_pct: -1.2,
        in_sample: true,
      },
    ],
    market_reference: [
      { ts: '2026-11-21T14:30:00Z', symbol: 'SPY', value: 7000.0, change: 12.5, change_pct: 0.18, source: 'schwab' },
    ],
    option_chain_snapshots: [
      {
        ts: '2026-11-21T14:30:00Z',
        underlying: 'AAPL',
        expiry: '2026-11-21',
        spot: 250.0,
        chain: { strikes: [] },
      },
    ],
  };
}

/** On-conflict keys for the idempotent nightly publish (table → columns). */
export const ON_CONFLICT = {
  cmo_runs: 'run_id',
  cmo_candidates: 'run_id,session_date,ticker,direction,setup',
  cmo_dte_plan: 'session_date',
  cmo_prob_tables: 'table_version,kind,bucket_key,tier',
  cmo_validation: 'module,run_id',
  cmo_backtest_runs: 'run_id',
  cmo_backtest_cases: 'run_id,session_date,ticker,direction,setup',
  market_reference: 'ts,symbol',
  option_chain_snapshots: 'ts,underlying,expiry',
};

/** Tables that are append-only logs (uuid PKs, no natural conflict key):
 *  re-publishing inserts new rows; the publish step must guard re-runs. */
const APPEND_ONLY = new Set(['cmo_live_signals', 'cmo_predictions']);

async function runDryRun() {
  const client = createAdminClient({ dryRun: true });
  const samples = sampleRows();
  let total = 0;
  for (const [table, rows] of Object.entries(samples)) {
    const res = APPEND_ONLY.has(table)
      ? await client.insert(table, rows)
      : await client.upsert(table, rows, { onConflict: ON_CONFLICT[table] });
    total += res.attempted;
  }
  await client.trimRetention();
  console.log(`[dry-run] total: ${total} row(s) across ${Object.keys(samples).length} tables, 0 written.`);
}

function runCheckEnv() {
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SCHEMA', 'SUPABASE_BATCH_SIZE']) {
    console.log(`${name}: ${process.env[name] ? 'set' : 'NOT SET'}`);
  }
}

async function runLive(argv) {
  const table = argv.get('--table');
  const file = argv.get('--file');
  const onConflict = argv.get('--on-conflict');
  if (!table || !file) {
    throw new Error('usage: --live --table <name> --file rows.json [--on-conflict a,b]');
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const client = createAdminClient({});
  const res = await client.upsert(table, rows, { onConflict });
  console.log(`upserted ${res.written}/${res.attempted} row(s) into ${table} in ${res.batches} batch(es).`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = new Map();
  for (let i = 2; i < process.argv.length; i += 2) {
    argv.set(process.argv[i], process.argv[i + 1]);
  }
  const has = (flag) => process.argv.includes(flag);
  try {
    if (has('--dry-run')) await runDryRun();
    else if (has('--check-env')) runCheckEnv();
    else if (has('--live')) await runLive(argv);
    else {
      console.log(
        'usage:\n' +
          '  node pipeline/lib/supabase-admin.mjs --dry-run\n' +
          '  node pipeline/lib/supabase-admin.mjs --check-env\n' +
          '  node pipeline/lib/supabase-admin.mjs --live --table <name> --file rows.json [--on-conflict a,b]',
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(`supabase-admin: ${err.message}`);
    process.exit(1);
  }
}
