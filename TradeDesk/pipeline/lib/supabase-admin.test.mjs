#!/usr/bin/env node
/**
 * pipeline/lib/supabase-admin.test.mjs — tests for supabase-admin.mjs.
 *
 * Run: node --test pipeline/lib/supabase-admin.test.mjs
 * No database, no env vars, no network: fetch is stubbed everywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkRows,
  resolveConfig,
  requestWithRetry,
  createAdminClient,
  sampleRows,
  ON_CONFLICT,
} from './supabase-admin.mjs';

const URL = 'https://staging-ref.supabase.co';
const KEY = 'test-service-key';

/** Minimal Response stub: { ok, status, headers.get, text(), json() }. */
function fakeResponse(status, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body || 'null'),
  };
}

test('chunkRows splits into batches of the given size', () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ i }));
  const batches = chunkRows(rows, 500);
  assert.deepEqual(batches.map((b) => b.length), [500, 500, 200]);
  assert.equal(chunkRows([], 500).length, 0);
  assert.throws(() => chunkRows([{ i: 1 }], 0), /batch size/);
});

test('resolveConfig throws naming the missing env var', () => {
  const env = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  try {
    assert.throws(() => resolveConfig({}), /SUPABASE_URL/);
    assert.throws(
      () => resolveConfig({ url: URL }),
      /SUPABASE_SERVICE_KEY/,
    );
  } finally {
    process.env = env;
  }
});

test('resolveConfig in dry-run mode does not demand credentials', () => {
  const env = { ...process.env };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  try {
    const cfg = resolveConfig({ dryRun: true });
    assert.equal(cfg.dryRun, true);
    assert.equal(cfg.schema, 'cmo');
  } finally {
    process.env = env;
  }
});

test('dry-run upsert makes zero fetch calls and returns counts', async () => {
  let calls = 0;
  const client = createAdminClient({
    dryRun: true,
    fetchImpl: async () => {
      calls += 1;
      return fakeResponse(200);
    },
  });
  const res = await client.upsert('cmo_runs', sampleRows().cmo_runs, {
    onConflict: 'run_id',
  });
  assert.equal(calls, 0);
  assert.deepEqual(res, {
    table: 'cmo_runs',
    attempted: 1,
    written: 0,
    batches: 1,
    dryRun: true,
  });
});

test('upsert batches 1200 rows into 3 requests with profile headers', async () => {
  const seen = [];
  const client = createAdminClient({
    url: URL,
    serviceKey: KEY,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return fakeResponse(200);
    },
  });
  const rows = Array.from({ length: 1200 }, (_, i) => ({ run_id: `r${i}`, v: i }));
  const res = await client.upsert('cmo_runs', rows, { onConflict: 'run_id' });
  assert.equal(seen.length, 3);
  assert.equal(res.written, 1200);
  assert.equal(res.batches, 3);
  for (const { url, init } of seen) {
    assert.ok(url.startsWith(`${URL}/rest/v1/cmo_runs?on_conflict=run_id`));
    assert.equal(init.headers['Content-Profile'], 'cmo');
    assert.equal(init.headers.apikey, KEY);
    assert.equal(init.headers.Authorization, undefined);
    assert.match(init.headers.Prefer, /resolution=merge-duplicates/);
  }
  assert.equal(JSON.parse(seen[0].init.body).length, 500);
});

test('retry: 500 then 500 then 200 succeeds after 3 attempts', async () => {
  let calls = 0;
  const client = createAdminClient({
    url: URL,
    serviceKey: KEY,
    retryBaseMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls < 3 ? fakeResponse(500, 'boom') : fakeResponse(200);
    },
  });
  const res = await client.upsert('cmo_runs', [{ run_id: 'r1' }], {
    onConflict: 'run_id',
  });
  assert.equal(calls, 3);
  assert.equal(res.written, 1);
});

test('non-retryable 400 throws at once, one call only', async () => {
  let calls = 0;
  const client = createAdminClient({
    url: URL,
    serviceKey: KEY,
    retryBaseMs: 1,
    fetchImpl: async () => {
      calls += 1;
      return fakeResponse(400, '{"message":"bad row"}');
    },
  });
  await assert.rejects(
    () => client.upsert('cmo_runs', [{ run_id: 'r1' }], { onConflict: 'run_id' }),
    /HTTP 400/,
  );
  assert.equal(calls, 1);
});

test('upsert refuses rows missing an on-conflict column before any fetch', async () => {
  let calls = 0;
  const client = createAdminClient({
    url: URL,
    serviceKey: KEY,
    fetchImpl: async () => {
      calls += 1;
      return fakeResponse(200);
    },
  });
  await assert.rejects(
    () => client.upsert('cmo_candidates', [{ ticker: 'AAPL' }], { onConflict: 'run_id' }),
    /missing on-conflict column "run_id"/,
  );
  assert.equal(calls, 0);
});

test('empty rows write nothing and make no calls', async () => {
  let calls = 0;
  const client = createAdminClient({
    url: URL,
    serviceKey: KEY,
    fetchImpl: async () => {
      calls += 1;
      return fakeResponse(200);
    },
  });
  const res = await client.upsert('cmo_runs', [], { onConflict: 'run_id' });
  assert.equal(calls, 0);
  assert.deepEqual(res, {
    table: 'cmo_runs',
    attempted: 0,
    written: 0,
    batches: 0,
    dryRun: false,
  });
});

test('requestWithRetry honours Retry-After on 429', async () => {
  let calls = 0;
  const res = await requestWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 429, headers: { get: (h) => (h === 'Retry-After' ? '0' : null) } };
      }
      return fakeResponse(200);
    },
    'https://x.invalid/rest/v1/cmo_runs',
    { method: 'POST' },
    { maxRetries: 3, retryBaseMs: 1 },
  );
  assert.equal(calls, 2);
  assert.equal(res.status, 200);
});

test('sampleRows covers all 11 §8 tables with objects', () => {
  const samples = sampleRows();
  const tables = Object.keys(samples);
  assert.equal(tables.length, 11);
  for (const [table, rows] of Object.entries(samples)) {
    assert.ok(rows.length >= 1, `${table} has no sample row`);
    for (const row of rows) assert.equal(typeof row, 'object', `${table} row`);
  }
  // Every table with an on-conflict key has one declared.
  for (const table of ['cmo_runs', 'cmo_candidates', 'cmo_dte_plan', 'cmo_prob_tables',
    'cmo_validation', 'cmo_backtest_runs', 'cmo_backtest_cases',
    'market_reference', 'option_chain_snapshots']) {
    assert.ok(ON_CONFLICT[table], `${table} missing ON_CONFLICT`);
  }
});

test('rpc posts to /rpc/<fn> with the profile header', async () => {
  const seen = [];
  const client = createAdminClient({
    url: URL,
    serviceKey: KEY,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return fakeResponse(200, '{"candidates_deleted": 0}');
    },
  });
  const res = await client.trimRetention();
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.endsWith('/rest/v1/rpc/trim_retention'));
  assert.equal(seen[0].init.headers['Content-Profile'], 'cmo');
  assert.equal(res.result.candidates_deleted, 0);
});
