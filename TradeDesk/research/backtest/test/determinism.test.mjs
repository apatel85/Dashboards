/**
 * test/determinism.test.mjs — the same command twice gives identical output.
 *
 * Builds a small synthetic cache (3 tickers + SPY + ^VIX + meta + one
 * earnings file, one engineered A1 gap day) in a temp dir, runs the full
 * CLI twice into different results dirs, and compares every output file
 * byte-for-byte. No network is used (--skip-fetch).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../run.mjs';

// Seeded PRNG — the fixture is deterministic.
function lcg(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function businessDays(start, n) {
  const out = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function makeBars(dates, startPrice, startVol, rnd, gapAt = null) {
  const bars = [];
  let prevClose = startPrice;
  for (let i = 0; i < dates.length; i++) {
    const ts = Math.floor(Date.parse(`${dates[i]}T14:30:00Z`) / 1000);
    if (gapAt != null && i === gapAt) {
      // Engineered A1 gap day: +12% open, close in the top 10% of the range, 5x volume.
      const open = prevClose * 1.12;
      const high = open * 1.01;
      const low = open * 0.995;
      const close = low + 0.9 * (high - low);
      bars.push({ ts, o: +open.toFixed(2), h: +high.toFixed(2), l: +low.toFixed(2), c: +close.toFixed(2), v: startVol * 5 });
      prevClose = close;
      continue;
    }
    const drift = (rnd() - 0.49) * 0.02;
    const open = prevClose * (1 + (rnd() - 0.5) * 0.004);
    const close = open * (1 + drift);
    const high = Math.max(open, close) * 1.02;
    const low = Math.min(open, close) * 0.98;
    const v = Math.round(startVol * (0.7 + rnd() * 0.6));
    bars.push({ ts, o: +open.toFixed(2), h: +high.toFixed(2), l: +low.toFixed(2), c: +close.toFixed(2), v });
    prevClose = close;
  }
  return bars;
}

function buildFixture(dir) {
  const cache = path.join(dir, 'cache');
  fs.mkdirSync(path.join(cache, 'daily'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'meta'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'earnings'), { recursive: true });
  const dates = businessDays('2024-01-02', 600);
  const rnd = lcg(20261121);
  const gapAt = 300;
  const tickers = { AAA: 100, BBB: 50, CCC: 200 };
  for (const [t, price] of Object.entries(tickers)) {
    const bars = makeBars(dates, price, 1_000_000, rnd, t === 'AAA' ? gapAt : null);
    fs.writeFileSync(path.join(cache, 'daily', `${t}.json`), JSON.stringify({
      ticker: t, source: 'fixture', from: '2024-01-02', to: '2026-05-31', bars, splits: [], dropped: [],
    }));
  }
  const spyBars = makeBars(dates, 500, 100_000_000, rnd);
  fs.writeFileSync(path.join(cache, 'daily', 'SPY.json'), JSON.stringify({
    ticker: 'SPY', source: 'fixture', from: '2024-01-02', to: '2026-05-31', bars: spyBars, splits: [], dropped: [],
  }));
  const vixBars = dates.map((d) => ({
    ts: Math.floor(Date.parse(`${d}T14:30:00Z`) / 1000), o: 20, h: 21, l: 19, c: 20, v: 1000,
  }));
  fs.writeFileSync(path.join(cache, 'daily', 'VIX.json'), JSON.stringify({
    ticker: '^VIX', source: 'fixture', from: '2024-01-02', to: '2026-05-31', bars: vixBars, splits: [], dropped: [],
  }));
  fs.writeFileSync(path.join(cache, 'universe.json'), JSON.stringify({
    fetchedAt: '2026-11-21T00:00:00.000Z', sp500Count: 2, nasdaq100Count: 2,
    sp500: ['AAA', 'BBB'], nasdaq100: ['BBB', 'CCC'], tickers: ['AAA', 'BBB', 'CCC'],
  }));
  const metas = {
    AAA: { ticker: 'AAA', sector: 'Technology', industry: 'Software', marketCap: 50_000_000_000 },
    BBB: { ticker: 'BBB', sector: 'Technology', industry: 'Hardware', marketCap: 5_000_000_000 },
    CCC: { ticker: 'CCC', sector: 'Healthcare', industry: 'Biotech', marketCap: 500_000_000 },
  };
  for (const [t, m] of Object.entries(metas)) {
    fs.writeFileSync(path.join(cache, 'meta', `${t}.json`), JSON.stringify(m));
  }
  const gapDate = dates[gapAt];
  fs.writeFileSync(path.join(cache, 'earnings', `${gapDate}.json`), JSON.stringify({
    date: gapDate, source: 'fixture',
    rows: [{ symbol: 'AAA', name: 'AAA Corp', epsActual: 2.0, epsForecast: 1.8, surprisePct: 11.11, time: 'time-after-hours', marketCap: 50_000_000_000, fiscalQuarterEnding: 'Dec/2025' }],
  }));
  return { cache, gapDate };
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p));
  }
  return out.sort();
}

test('same command twice gives identical output', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wo03-det-'));
  const { cache } = buildFixture(tmp);
  const args = (resultsDir, auditFile) => [
    '--module', 'all', '--from', '2024-01-01', '--to', '2026-05-31', '--split', '2026-01-01',
    '--skip-fetch', '--cache-dir', cache, '--results-dir', resultsDir, '--audit-file', auditFile,
  ];
  const r1 = await main(args(path.join(tmp, 'results1'), path.join(tmp, 'audit1.md')));
  const r2 = await main(args(path.join(tmp, 'results2'), path.join(tmp, 'audit2.md')));
  assert.equal(r1.runId, r2.runId);
  // The engineered A1 must have fired (otherwise the fixture is not exercising the path).
  const a1Cases = fs.readFileSync(path.join(tmp, 'results1', r1.runId, 'A1', 'cases.csv'), 'utf8');
  assert.ok(a1Cases.includes('AAA'), 'fixture A1 gap day should produce an AAA candidate');
  const files1 = listFiles(path.join(tmp, 'results1'));
  const files2 = listFiles(path.join(tmp, 'results2'));
  assert.deepEqual(files1, files2);
  for (const f of files1) {
    const b1 = fs.readFileSync(path.join(tmp, 'results1', f));
    const b2 = fs.readFileSync(path.join(tmp, 'results2', f));
    assert.ok(b1.equals(b2), `output differs between runs: ${f}`);
  }
  assert.ok(fs.readFileSync(path.join(tmp, 'audit1.md')).equals(fs.readFileSync(path.join(tmp, 'audit2.md'))), 'DATA_AUDIT.md differs between runs');
});
