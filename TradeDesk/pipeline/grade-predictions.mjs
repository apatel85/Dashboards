#!/usr/bin/env node
/**
 * grade-predictions.mjs — grade every tracked suggestion against what the
 * market actually did, and publish prediction-performance.json.
 *
 * Reads pipeline/data/prediction-history.jsonl (written by
 * snapshot-predictions.mjs), fetches daily bars per ticker from Yahoo, and
 * grades each open record:
 *
 * BREAKOUTS (long-only, 10-trading-day window from the suggestion date):
 *   - trigger hit first (a day's high >= trigger) vs stop hit first (a day's
 *     low <= stop) vs neither after 10 trading days
 *   - return at +5 / +10 / +30 trading days vs the suggestion price
 *   - max favorable / adverse excursion within 10 days, R at 10 days
 *     (R = (close_10d - price) / (price - stop); -1 if the stop was hit)
 * LOTTO (0DTE/1DTE, graded on the expiry date's close):
 *   - did the underlying close past the trigger in the trade direction
 *   - MODELED ticket value: intrinsic value at the expiry close divided by
 *     the premium paid. This is an estimate from the stock's actual move —
 *     Black-Scholes is NOT used at exit because a 0DTE/1DTE ticket holds
 *     ~no time value at expiry. It is NOT a real fill: no real money, no
 *     bid/ask, no slippage. Labeled MODELED everywhere it appears.
 *
 * A record is final once its 30-day return is known (breakout) or its expiry
 * has passed (lotto); until then it is re-graded each run. Only records from
 * the last 60 days are fetched (older ones are final by definition). Fetches
 * are capped per run (oldest open first) so a slow Yahoo day cannot stall
 * the pipeline — the step is non-fatal and catches up the next day.
 *
 * Writes public/data/prediction-performance.json:
 *   { as_of, source, history_since, summary: { breakout, lotto }, rows }
 * rows = the 300 most recent records (newest first); the summary covers ALL
 * graded records so the win rates stay honest as history grows.
 *
 * $0, keyless (Yahoo chart API, browser UA). Non-fatal by design.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooChart } from './lib/yahoo.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const HIST = join(ROOT, 'data', 'prediction-history.jsonl');
const MAX_TICKERS_PER_RUN = 250;
const ROW_LIMIT = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

function loadHistory() {
  if (!existsSync(HIST)) return [];
  const rows = [];
  for (const line of readFileSync(HIST, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip a bad line */ }
  }
  return rows;
}

/** Yahoo chart → [{date, open, high, low, close}] sorted by date. */
function parseBars(json) {
  const r = json?.chart?.result?.[0];
  if (!r) return [];
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue;
    out.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? c,
      low: q.low?.[i] ?? c,
      close: c,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** First bar on or after `dateStr`. Returns its index or -1. */
function idxOnOrAfter(bars, dateStr) {
  for (let i = 0; i < bars.length; i++) if (bars[i].date >= dateStr) return i;
  return -1;
}

function gradeBreakout(rec, bars) {
  const price = rec.price;
  const trigger = rec.trigger;
  const stop = rec.stop;
  const i0 = idxOnOrAfter(bars, rec.date);
  if (i0 < 0 || price == null || price <= 0) return null;
  // Next-trading-day convention (same as the backtests): the suggestion is
  // published from the suggestion day's close, so the outcome window is the
  // 10 trading days AFTER it. Counting the suggestion day itself would
  // credit breakouts that already happened intraday before publication
  // (common when the pipeline runs late in the evening).
  const window = bars.slice(i0 + 1, i0 + 11);
  const daysAfter = bars.length - 1 - i0; // trading days after the suggestion date with data
  const risk = stop != null && stop < price ? price - stop : null;

  let triggerDay = null, stopDay = null;
  let mfe = null, mae = null;
  for (let k = 0; k < window.length; k++) {
    const b = window[k];
    if (trigger != null && triggerDay == null && b.high >= trigger) triggerDay = k + 1;
    if (stop != null && stopDay == null && b.low <= stop) stopDay = k + 1;
    const up = b.high / price - 1, dn = b.low / price - 1;
    mfe = mfe == null ? up : Math.max(mfe, up);
    mae = mae == null ? dn : Math.min(mae, dn);
  }
  const closeAt = (i) => (bars[i0 + i] ? bars[i0 + i].close : null);
  const retAt = (i) => {
    const c = closeAt(i);
    return c != null ? (c - price) / price : null;
  };
  const ret5 = daysAfter >= 5 ? retAt(5) : null;
  const ret10 = daysAfter >= 10 ? retAt(10) : null;
  const ret30 = daysAfter >= 30 ? retAt(30) : null;

  let status;
  if (triggerDay != null && stopDay != null) {
    if (triggerDay < stopDay) status = 'trigger-hit';
    else if (stopDay < triggerDay) status = 'stop-hit';
    else status = 'trigger-and-stop'; // both on the same day — call it a wash
  } else if (triggerDay != null) status = 'trigger-hit';
  else if (stopDay != null) status = 'stop-hit';
  else if (window.length >= 10) status = 'no-trigger-no-stop';
  else status = 'open';

  let r10 = null;
  if (daysAfter >= 10 && risk != null && risk > 0) {
    r10 = stopDay != null && (triggerDay == null || stopDay < triggerDay)
      ? -1
      : (ret10 != null ? ret10 / (risk / price) : null);
  }
  const lastBar = bars[bars.length - 1];
  const rNow = risk != null && risk > 0 && lastBar
    ? ((lastBar.close - price) / price) / (risk / price)
    : null;

  return {
    status,
    trigger_day: triggerDay,
    stop_day: stopDay,
    ret_5d: r2(ret5),
    ret_10d: r2(ret10),
    ret_30d: r2(ret30),
    mfe: r3(mfe),
    mae: r3(mae),
    r_10d: r2(r10),
    r_now: r2(rNow),
    last_close: lastBar ? r2(lastBar.close) : null,
    last_bar_date: lastBar ? lastBar.date : null,
  };
}

function gradeLotto(rec, bars) {
  const expiry = rec.expiry;
  if (!expiry) return null;
  const lastBar = bars[bars.length - 1];
  if (!lastBar || lastBar.date < expiry) return { status: 'open' };
  // Expiry close: the bar on the expiry date, else the last bar on/before it.
  let expBar = null;
  for (const b of bars) {
    if (b.date <= expiry) expBar = b;
    else break;
  }
  if (!expBar) return { status: 'open' };
  const spot = rec.spot;
  const closeE = expBar.close;
  const movedPct = spot != null && spot > 0 ? ((closeE - spot) / spot) * 100 : null;
  // Degenerate case: the recorded spot IS the expiry close (to the cent).
  // That happens when the scan ran after the market closed — or on a
  // non-trading day, as with the Oct-17 Saturday seed — so the "prediction"
  // never had a trading session to play out in. Grade it as ungradable
  // rather than counting a 0% move as a loss.
  if (spot != null && Math.abs(closeE - spot) < 0.01) {
    return {
      status: 'graded',
      expiry_close: r2(closeE),
      moved_pct: 0,
      triggered: null,
      modeled_return: null,
      modeled_multiple: null,
      win: null,
      ungradable: 'spot equals expiry close — scan ran after the close',
    };
  }
  let triggered = null;
  if (rec.trigger != null) {
    if (rec.direction === 'CALL') triggered = closeE > rec.trigger;
    else if (rec.direction === 'PUT') triggered = closeE < rec.trigger;
  }
  let modeledReturn = null, modeledMultiple = null, win = null;
  if (rec.direction === 'CALL' || rec.direction === 'PUT') {
    if (rec.strike != null && rec.premium != null && rec.premium > 0) {
      const intrinsic = Math.max(
        rec.direction === 'CALL' ? closeE - rec.strike : rec.strike - closeE, 0);
      modeledMultiple = intrinsic / rec.premium;
      modeledReturn = modeledMultiple - 1;
      win = modeledReturn > 0;
    }
  } else if (rec.direction === 'BOTH') {
    // No ticket to price — the play was directionless. Win = the stock moved
    // at least the expected amount in either direction by expiry.
    if (movedPct != null && rec.expected_move_pct != null) {
      win = Math.abs(movedPct) >= rec.expected_move_pct;
    }
  }
  return {
    status: 'graded',
    expiry_close: r2(closeE),
    moved_pct: r2(movedPct),
    triggered,
    modeled_return: r2(modeledReturn),
    modeled_multiple: r2(modeledMultiple),
    win,
  };
}

function isFinal(rec) {
  const o = rec.outcome;
  if (!o) return false;
  if (rec.type === 'lotto') return o.status === 'graded';
  return o.ret_30d != null; // breakout: final once the 30-day return is known
}

function avg(nums) {
  const xs = nums.filter((x) => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;
}

function rate(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

async function main() {
  const rows = loadHistory();
  if (!rows.length) {
    console.log('[predictions] no history yet — writing empty performance file');
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'prediction-performance.json'), JSON.stringify({
      as_of: new Date().toISOString(),
      source: 'Yahoo Finance daily bars (~15-min delayed); lotto values are MODELED, not real fills',
      history_since: null,
      summary: {
        breakout: { tracked: 0, graded: 0, open: 0, trigger_hit: 0, trigger_rate: null, stop_hit: 0, stop_rate: null, win_rate: null, avg_r_10d: null, avg_ret_5d: null, avg_ret_10d: null, avg_ret_30d: null },
        lotto: { tracked: 0, graded: 0, open: 0, ungradable: 0, triggered: 0, trigger_rate: null, win_rate: null, avg_modeled_return: null, avg_modeled_multiple: null },
      },
      rows: [],
    }));
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const needGrade = rows.filter((r) => !isFinal(r) && r.date >= cutoff && r.date <= today);
  // Oldest open first so records finalize; cap the fetch count per run.
  needGrade.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.ticker).localeCompare(String(b.ticker)));
  const tickers = [...new Set(needGrade.map((r) => String(r.ticker).toUpperCase()))]
    .slice(0, MAX_TICKERS_PER_RUN);
  console.log(`[predictions] grading ${needGrade.length} open records across ${tickers.length} tickers (${rows.length} total in history)`);

  const barsByTicker = new Map();
  let n = 0;
  for (const t of tickers) {
    n++;
    try {
      const j = await yahooChart(t, { interval: '1d', range: '6mo' });
      barsByTicker.set(t, parseBars(j));
      if (n % 10 === 0) await sleep(300);
    } catch (e) {
      console.warn(`[predictions] ${t}: bars fetch failed: ${e.message}`);
    }
  }

  const nowIso = new Date().toISOString();
  let graded = 0, failed = 0;
  for (const rec of needGrade) {
    const bars = barsByTicker.get(String(rec.ticker).toUpperCase());
    if (!bars || !bars.length) { failed++; continue; }
    const out = rec.type === 'breakout' ? gradeBreakout(rec, bars) : gradeLotto(rec, bars);
    if (!out) { failed++; continue; }
    rec.outcome = out;
    rec.graded_at = nowIso;
    graded++;
  }

  // Persist the updated history atomically (same file the pipeline commits).
  const tmp = `${HIST}.tmp`;
  writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  renameSync(tmp, HIST);

  // ── summary over ALL records (not just the rows we publish) ──────────
  const bo = rows.filter((r) => r.type === 'breakout');
  const lo = rows.filter((r) => r.type === 'lotto');
  const boDone = bo.filter((r) => r.outcome && r.outcome.status !== 'open');
  const boTrig = boDone.filter((r) => r.outcome.status === 'trigger-hit');
  const boStop = boDone.filter((r) => r.outcome.status === 'stop-hit');
  const loDone = lo.filter((r) => r.outcome && r.outcome.status === 'graded');
  const loTrig = loDone.filter((r) => r.outcome.triggered === true);
  const loWin = loDone.filter((r) => r.outcome.win === true);
  const loUngradable = loDone.filter((r) => r.outcome.ungradable != null);

  const summary = {
    breakout: {
      tracked: bo.length,
      graded: boDone.length,
      open: bo.length - boDone.length,
      trigger_hit: boTrig.length,
      trigger_rate: rate(boTrig.length, boDone.length),
      stop_hit: boStop.length,
      stop_rate: rate(boStop.length, boDone.length),
      win_rate: rate(boTrig.length, boDone.length),
      avg_r_10d: avg(boDone.map((r) => r.outcome.r_10d)),
      avg_ret_5d: avg(boDone.map((r) => r.outcome.ret_5d)),
      avg_ret_10d: avg(boDone.map((r) => r.outcome.ret_10d)),
      avg_ret_30d: avg(boDone.map((r) => r.outcome.ret_30d)),
    },
    lotto: {
      tracked: lo.length,
      graded: loDone.length,
      open: lo.length - loDone.length,
      ungradable: loUngradable.length,
      triggered: loTrig.length,
      trigger_rate: rate(loTrig.length, loDone.filter((r) => r.outcome.triggered != null).length),
      win_rate: rate(loWin.length, loDone.filter((r) => r.outcome.win != null).length),
      avg_modeled_return: avg(loDone.map((r) => r.outcome.modeled_return)),
      avg_modeled_multiple: avg(loDone.map((r) => r.outcome.modeled_multiple)),
    },
  };

  // Publish the 300 most recent rows (newest first) — the summary above is
  // computed over everything, so the rates stay honest as history grows.
  const sorted = [...rows].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) || String(a.ticker).localeCompare(String(b.ticker)));
  const published = sorted.slice(0, ROW_LIMIT).map((r) => ({
    date: r.date,
    ticker: r.ticker,
    name: r.name ?? null,
    type: r.type,
    score: r.score ?? null,
    setup: r.setup ?? null,
    price: r.price ?? null,
    trigger: r.trigger ?? null,
    stop: r.stop ?? null,
    direction: r.direction ?? null,
    spot: r.spot ?? null,
    expiry: r.expiry ?? null,
    expiry_kind: r.expiry_kind ?? null,
    strike: r.strike ?? null,
    premium: r.premium ?? null,
    breakeven: r.breakeven ?? null,
    expected_move_pct: r.expected_move_pct ?? null,
    iv_pct: r.iv_pct ?? null,
    seeded: !!r.seeded,
    outcome: r.outcome ?? null,
  }));

  const historySince = rows.reduce((m, r) => (m == null || r.date < m ? r.date : m), null);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'prediction-performance.json'), JSON.stringify({
    as_of: nowIso,
    source: 'Yahoo Finance daily bars (~15-min delayed); lotto values are MODELED, not real fills',
    history_since: historySince,
    summary,
    rows: published,
  }));
  console.log(`[predictions] graded ${graded} (${failed} without bars); breakout win ${summary.breakout.win_rate ?? '—'}% (${boTrig.length}/${boDone.length}), lotto win ${summary.lotto.win_rate ?? '—'}% (${loWin.length}/${loDone.filter((r) => r.outcome.win != null).length})`);
}

main().catch((e) => { console.error(`[predictions] FATAL: ${e.message}`); process.exit(1); });
