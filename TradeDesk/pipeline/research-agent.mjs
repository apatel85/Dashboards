#!/usr/bin/env node
/**
 * research-agent.mjs — TradeDesk agentic stock-research flow (tradingagents-style).
 *
 * Sequential, no-LangGraph port of the tauricresearch/tradingagents debate flow:
 *   4 analysts (market / fundamentals / news / sentiment) — 1 Gemini call each,
 *   ALL data PRE-FETCHED in code and injected as delimited JSON blocks.
 *   The model never tool-calls, never browses.
 *   → bull vs bear researcher (1 round each, alternating)
 *   → Research Manager (deep tier judge): 5-tier rating + playbook §12 score_breakdown
 *   → Trader: concrete proposal with ABSOLUTE price levels
 *   → Risk review: 1 condensed round (top-3 risks + thesis-killer)
 *   → Portfolio Manager (deep tier final judge)
 *
 * 10 Gemini calls per ticker. Free-tier pacing: ~6s between calls (~10 req/min).
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node research-agent.mjs [--data-dir ../public/data]
 *       [--ticker AAPL] [--max-tickers 12] [--out <path>] [--verify-models]
 *       [--quick-model m] [--deep-model m]
 *
 * Without GEMINI_API_KEY (or with --verify-models and no key) it exits loudly —
 * there is no offline fallback; fabricated research is worse than no research.
 *
 * Cost/rate math: 10 calls/ticker × 12 tickers = 120 calls/run, 2×/week.
 * Well inside Gemini free-tier RPM when paced; each call is a few KB.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sleep } from './lib/http.mjs';
import { yahooChart, yahooNews, yahooOptions, yahooQuoteSummary } from './lib/yahoo.mjs';
import {
  tickerToCikMap, companyFacts, latestQuarterlyValue, yearAgoQuarterlyValue,
} from './lib/sec.mjs';
import {
  piotroskiFromFacts, altmanZFromFacts, earningsQualityFromFacts, healthFromFacts,
} from './lib/scoring.mjs';
import { writeJsonAtomic, isoDate, daysBetween, clamp, r2 } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name, def = null) {
  const i = args.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i < 0) return def;
  const a = args[i];
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
}
const DATA_DIR = path.resolve(__dir, arg('--data-dir', '../public/data'));
const SINGLE_TICKER = (arg('--ticker', null) || '').toUpperCase() || null;
const MAX_TICKERS = parseInt(arg('--max-tickers', '12'), 10) || 12;
const OUT_PATH = arg('--out', path.join(DATA_DIR, 'research.json'));
const VERIFY_MODELS = args.includes('--verify-models');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PREFETCH_ONLY = args.includes('--prefetch-only');
if (!GEMINI_API_KEY && !VERIFY_MODELS && !PREFETCH_ONLY) {
  console.error('[research] FATAL: GEMINI_API_KEY is not set. Refusing to fabricate research.');
  console.error('[research] Set the env var (GitHub Actions: ${{ secrets.GEMINI_API_KEY }}) and re-run.');
  process.exit(2);
}
if (!GEMINI_API_KEY && VERIFY_MODELS) {
  console.error('[research] FATAL: --verify-models needs GEMINI_API_KEY to query the models list.');
  process.exit(2);
}

// ── Playbook §12 scoring weights (hardcoded from the Trading Playbook) ───────
// Earnings acceleration 20, Trend+RS 20, Base quality+volume 15,
// Estimate revisions 10, Catalyst 10, Smart-money 10, Sector+market 10,
// Float/short interest 5. Weights sum to 1.00.
const PLAYBOOK_WEIGHTS = [
  ['earnings_acceleration', 0.20],
  ['trend_relative_strength', 0.20],
  ['base_quality_volume', 0.15],
  ['estimate_revisions', 0.10],
  ['catalyst_in_window', 0.10],
  ['smart_money', 0.10],
  ['sector_market', 0.10],
  ['float_short_interest', 0.05],
];

// ── Model tiers ──────────────────────────────────────────────────────────────
// Aliases are NOT all live-verified (no key in the build env to test with);
// resolveModels() picks the first alias the API actually lists, so a renamed
// alias degrades loudly-but-gracefully instead of killing the run.
const QUICK_CANDIDATES = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
const DEEP_CANDIDATES = ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
let QUICK_MODEL = arg('--quick-model', null);
let DEEP_MODEL = arg('--deep-model', null);

async function listGeminiModels() {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(GEMINI_API_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`models list HTTP ${res.status}`);
  const j = await res.json();
  return (j.models || []).map((m) => String(m.name || '').replace(/^models\//, ''));
}

async function resolveModels() {
  if (QUICK_MODEL && DEEP_MODEL) {
    console.log(`[research] models pinned: quick=${QUICK_MODEL} deep=${DEEP_MODEL}`);
    return;
  }
  const available = await listGeminiModels();
  console.log(`[research] ${available.length} models listed by API`);
  const pick = (cands, tier) => {
    for (const c of cands) {
      if (available.includes(c)) { console.log(`[research] ${tier} → ${c}`); return c; }
    }
    throw new Error(`no usable ${tier} model alias found among: ${cands.join(', ')}`);
  };
  if (!QUICK_MODEL) QUICK_MODEL = pick(QUICK_CANDIDATES, 'quick');
  if (!DEEP_MODEL) DEEP_MODEL = pick(DEEP_CANDIDATES, 'deep');
}

// ── Defensive JSON extraction / coercion ─────────────────────────────────────
// Mirrors tradingagents' _coerce_optional_float spirit: "N/A", "15%",
// "$1,234.50" → null/number. One bad field nulls out; never throws.
function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Balanced-brace scan for the first complete JSON object.
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { t = t.slice(start, i + 1); break; } }
  }
  try { return JSON.parse(t); } catch { return null; }
}

function coerceNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'n/a' || s === 'na' || s === 'none' || s === 'null' || s === '-') return null;
  const pct = s.endsWith('%');
  const n = parseFloat(s.replace(/[$,\s]/g, '').replace(/%$/, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

function coerceStr(v, maxLen = 600) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, maxLen) : null;
}

function coerceStrArr(v, maxLen = 200, maxItems = 12) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems);
}

// ── Gemini REST client ───────────────────────────────────────────────────────
const CALL_DELAY_MS = 6000; // ~10 req/min, inside free-tier RPM

async function geminiOnce(model, prompt, { temperature = 0.2, maxTokens = 2048 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
    }),
  });
  if (res.status === 404) {
    const e = new Error(`model alias not found: ${model}`);
    e.code = 'MODEL_404';
    throw e;
  }
  if (res.status === 429) {
    const e = new Error('Gemini 429 rate limit');
    e.code = 'RATE_429';
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  if (j.promptFeedback?.blockReason) {
    throw new Error(`prompt blocked: ${j.promptFeedback.blockReason}`);
  }
  const parts = j.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('');
  if (!text) throw new Error('empty model response (no candidates)');
  return text;
}

/**
 * Call Gemini with model-alias fallback (quick tier, then deep tier lists).
 * On 429: one long backoff then rethrow (caller logs + continues).
 */
async function callGemini(tier, prompt, opts = {}) {
  const cands = tier === 'deep' ? DEEP_CANDIDATES : QUICK_CANDIDATES;
  const primary = tier === 'deep' ? DEEP_MODEL : QUICK_MODEL;
  const order = [primary, ...cands.filter((c) => c !== primary)];
  let lastErr = null;
  for (const model of order) {
    try {
      const text = await geminiOnce(model, prompt, opts);
      await sleep(CALL_DELAY_MS);
      return { text, model, tier };
    } catch (e) {
      if (e.code === 'RATE_429') {
        console.warn('[research] 429 — backing off 60s once, then continuing');
        await sleep(60000);
        try {
          const text = await geminiOnce(model, prompt, opts);
          await sleep(CALL_DELAY_MS);
          return { text, model, tier };
        } catch (e2) { lastErr = e2; throw e2; }
      }
      if (e.code === 'MODEL_404') {
        console.warn(`[research] model alias 404 (${model}) — trying next alias`);
        lastErr = e;
        continue;
      }
      lastErr = e;
      throw e;
    }
  }
  throw lastErr || new Error('no model alias worked');
}

// ── Indicator math (deterministic, in-code — the VERIFIED DATA block) ────────
function sma(arr, n) {
  if (arr.length < n) return null;
  const s = arr.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}
function emaSeries(arr, n) {
  if (arr.length < n) return [];
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const out = [e];
  for (let i = n; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out.push(e); }
  return out;
}
function rsi14(closes) {
  if (closes.length < 15) return null;
  let g = 0, l = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  const rs = g / l;
  return 100 - 100 / (1 + rs);
}

/** Parse Yahoo v8 chart → { closes, highs, lows, volumes, lastClose, meta }. */
function parseChart(j) {
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const closes = [], highs = [], lows = [], volumes = [], dates = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue;
    closes.push(c);
    highs.push(q.high?.[i] ?? c);
    lows.push(q.low?.[i] ?? c);
    volumes.push(q.volume?.[i] ?? 0);
    dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
  }
  if (closes.length < 60) return null;
  return { closes, highs, lows, volumes, dates, meta: r.meta || {} };
}

function computeTechnicals(parsed, spyCloses) {
  const { closes, highs, lows, volumes, dates } = parsed;
  const last = closes[closes.length - 1];
  const high52 = Math.max(...highs.slice(-252));
  const low52 = Math.min(...lows.slice(-252));
  const s50 = sma(closes, 50), s200 = sma(closes, 200);
  const s200ago = closes.length >= 220 ? sma(closes.slice(0, -20), 200) : null;
  const ema12 = emaSeries(closes, 12), ema26 = emaSeries(closes, 26);
  let macdHist = null;
  if (ema12.length && ema26.length) {
    const macdLine = ema12.slice(-ema26.length).map((v, i) => v - ema26[i]);
    const signal = emaSeries(macdLine, 9);
    if (signal.length) macdHist = macdLine[macdLine.length - 1] - signal[signal.length - 1];
  }
  const basis = sma(closes, 20);
  const sd = (() => {
    if (closes.length < 20 || basis == null) return null;
    const w = closes.slice(-20);
    return Math.sqrt(w.reduce((a, c) => a + (c - basis) ** 2, 0) / 20);
  })();
  const bbPctB = basis != null && sd ? (last - (basis - 2 * sd)) / (4 * sd) : null;
  // ATR(14)
  let atr = null;
  if (closes.length >= 15) {
    let sum = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    }
    atr = sum / 14;
  }
  const avgVol50 = volumes.length >= 50 ? volumes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  const avgVol5 = volumes.length >= 5 ? volumes.slice(-5).reduce((a, b) => a + b, 0) / 5 : null;
  // RS vs SPY, 63 trading days (~3mo)
  let rsVsSpy3mo = null;
  if (spyCloses && spyCloses.length >= 63 && closes.length >= 63) {
    const rS = (closes[closes.length - 1] / closes[closes.length - 63] - 1) * 100;
    const rM = (spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - 63] - 1) * 100;
    rsVsSpy3mo = rS - rM;
  }
  const rsRank = rsVsSpy3mo == null ? null : Math.round(clamp(50 + rsVsSpy3mo * 2, 1, 99));
  // Weinstein stage (documented heuristic)
  const s200rising = s200 != null && s200ago != null ? s200 > s200ago : null;
  let stage = 'Stage 1';
  if (s50 != null && s200 != null) {
    if (last > s50 && s50 > s200 && s200rising) stage = 'Stage 2';
    else if (last < s50 && s50 < s200 && s200rising === false) stage = 'Stage 4';
    else if (s200 != null && Math.abs(last - s200) / s200 < 0.05) stage = 'Stage 1';
    else stage = 'Stage 3';
  }
  const dist52wHigh = high52 ? ((high52 - last) / high52) * 100 : null;
  const trendTemplatePass =
    stage === 'Stage 2' && dist52wHigh != null && dist52wHigh <= 25 && (rsRank == null || rsRank >= 70);
  return {
    lastClose: r2(last), asOf: dates[dates.length - 1],
    high52: r2(high52), low52: r2(low52),
    dist52wHighPct: r2(dist52wHigh, 1),
    sma50: r2(s50), sma200: r2(s200), sma200Rising: s200rising,
    rsi14: r2(rsi14(closes), 1), macdHist: r2(macdHist, 3), bollingerPctB: r2(bbPctB, 2),
    atr14: r2(atr),
    avgVol50: avgVol50 != null ? Math.round(avgVol50) : null,
    volRatio5dVs50d: avgVol50 && avgVol5 ? r2(avgVol5 / avgVol50, 2) : null,
    rsVsSpy3moPct: r2(rsVsSpy3mo, 1), rsRank,
    stage, trendTemplatePass,
  };
}

// ── Input loading ────────────────────────────────────────────────────────────
function loadJson(file, { required = false } = {}) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    const msg = `[research] input ${file} MISSING at ${p}`;
    if (required) { console.error(msg + ' — FATAL'); process.exit(3); }
    console.warn(msg + ' — continuing with empty');
    return file.endsWith('.json') && !file.includes('brief') ? [] : null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[research] input ${file} is not valid JSON: ${e.message} — FATAL`);
    process.exit(3);
  }
}

// ── Ticker selection ─────────────────────────────────────────────────────────
function selectTickers(brief, earnings, signals) {
  if (SINGLE_TICKER) return [{ ticker: SINGLE_TICKER }];
  const out = [];
  const seen = new Set();
  // 1) smart-money flow signals first — the user's priority: disclosed
  //    buying/selling pressure, ranked by flow_score.
  const sigs = (signals?.tickers || []).slice().sort((a, b) => (b.flow_score || 0) - (a.flow_score || 0));
  for (const s of sigs) {
    const t = String(s.ticker || '').toUpperCase();
    if (t && !seen.has(t)) { seen.add(t); out.push({ ticker: t, from: 'signal', signalEntry: s }); }
    if (out.length >= MAX_TICKERS) break;
  }
  const cands = (brief?.breakout_candidates || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const c of cands) {
    const t = String(c.ticker || '').toUpperCase();
    if (t && !seen.has(t)) { seen.add(t); out.push({ ticker: t, from: 'breakout', briefEntry: c }); }
    if (out.length >= MAX_TICKERS) break;
  }
  const today = isoDate();
  const upcoming = (earnings || [])
    .filter((e) => e.reporting_date && daysBetween(today, e.reporting_date) >= 0 && daysBetween(today, e.reporting_date) <= 7
      && /^[A-Z]{1,5}$/.test(String(e.ticker || '')))
    .sort((a, b) => (b.conviction || 0) - (a.conviction || 0));
  for (const e of upcoming) {
    const t = String(e.ticker).toUpperCase();
    if (!seen.has(t)) { seen.add(t); out.push({ ticker: t, from: 'earnings', earningsEntry: e }); }
    if (out.length >= MAX_TICKERS) break;
  }
  console.log(`[research] selected ${out.length} tickers: ${out.map((o) => o.ticker).join(', ')}`);
  return out;
}

// ── Per-ticker prefetch ──────────────────────────────────────────────────────
async function prefetchMarket(ticker, spyCloses) {
  try {
    const j = await yahooChart(ticker, { interval: '1d', range: '1y' });
    const parsed = parseChart(j);
    if (!parsed) { console.warn(`[research] ${ticker}: chart parse failed (<60 bars)`); return null; }
    return computeTechnicals(parsed, spyCloses);
  } catch (e) {
    console.warn(`[research] ${ticker}: market prefetch failed: ${e.message}`);
    return null;
  }
}

async function prefetchFundamentals(ticker, cikMap, earningsEntry) {
  const out = { piotroski: null, altmanZ: null, earningsQuality: null, healthScore: null, revYoY: null, netMargin: null, revTag: null, marketCap: null, cik: null };
  try {
    const qs = await yahooQuoteSummary(ticker, ['price']).catch(() => null);
    const mc = qs?.price?.marketCap?.raw ?? null;
    if (mc) out.marketCap = mc;
  } catch (e) { console.warn(`[research] ${ticker}: marketCap lookup failed: ${e.message}`); }
  const cik = cikMap?.[ticker] || null;
  out.cik = cik;
  if (!cik) { console.warn(`[research] ${ticker}: no CIK — SEC fundamentals skipped`); return out; }
  let facts;
  try { facts = await companyFacts(cik); }
  catch (e) { console.warn(`[research] ${ticker}: companyfacts failed: ${e.message}`); return out; }
  try {
    out.piotroski = piotroskiFromFacts(facts);
    out.altmanZ = altmanZFromFacts(facts, out.marketCap);
    out.earningsQuality = earningsQualityFromFacts(facts);
    out.healthScore = healthFromFacts(facts);
    const rev = latestQuarterlyValue(facts, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet']);
    if (rev) {
      out.revTag = rev.tag;
      const ago = yearAgoQuarterlyValue(facts, rev.tag, rev.end);
      if (ago && ago.value) out.revYoY = r2(((rev.value - ago.value) / Math.abs(ago.value)) * 100, 1);
      const ni = latestQuarterlyValue(facts, ['NetIncomeLoss']);
      if (ni && rev.value) out.netMargin = r2((ni.value / Math.abs(rev.value)) * 100, 1);
    }
  } catch (e) { console.warn(`[research] ${ticker}: fundamental scoring failed: ${e.message}`); }
  // Earnings context from our own pipeline output (no extra calls)
  out.earnings = earningsEntry ? {
    reporting_date: earningsEntry.reporting_date, report_time: earningsEntry.report_time,
    eps_est: earningsEntry.eps_est, rev_est_b: earningsEntry.rev_est_b,
    implied_move_pct: earningsEntry.implied_move_pct, iv_rank: earningsEntry.iv_rank,
    streak: earningsEntry.streak, health_score: earningsEntry.health_score,
    prob_up_pct: earningsEntry.prob_up_pct,
  } : null;
  return out;
}

function buildInsiderContext(ticker, insiders) {
  const rows = (insiders || []).filter((r) =>
    String(r.ticker || '').toUpperCase() === ticker &&
    String(r.transaction_code || '').toUpperCase() === 'P');
  const today = isoDate();
  const recent = rows.filter((r) => r.transaction_date && daysBetween(r.transaction_date, today) >= 0 && daysBetween(r.transaction_date, today) <= 7);
  const byRole = {};
  for (const r of recent) {
    const role = r.role || 'Insider';
    byRole[role] = byRole[role] || { buys: 0, usd: 0, usdKnown: true };
    byRole[role].buys++;
    if (r.shares != null && r.price != null) byRole[role].usd += r.shares * r.price;
    else byRole[role].usdKnown = false;
  }
  const clusters = Object.entries(byRole).map(([role, v]) => ({
    insider_role: role,
    buys_7d: v.buys,
    total_usd: v.usdKnown ? Math.round(v.usd) : null,
    first_time_buyer: false, // cannot be determined from a 14-day window; not faked
  }));
  const notable = rows.slice(0, 5).map((r) => ({
    owner: r.owner_name, role: r.role, shares: r.shares, price: r.price,
    date: r.transaction_date, code: r.transaction_code,
  }));
  return { clusters, recentBuys: recent.length, notable };
}

/** Disclosure flow signal for a ticker (from signals.json, if selected via flow). */
function buildFlowContext(ticker, sel, signals) {
  const s = sel.signalEntry
    || (signals?.tickers || []).find((x) => String(x.ticker || '').toUpperCase() === ticker)
    || null;
  if (!s) return null;
  return {
    direction: s.direction || 'mixed',
    flow_score: s.flow_score ?? null,
    net_flow: s.net_flow ?? null,
    buy_amount: s.buy_amount ?? null,
    sell_amount: s.sell_amount ?? null,
    officials: s.officials ?? null,
    buy_trades: s.buy_trades ?? null,
    sell_trades: s.sell_trades ?? null,
    cluster: !!s.cluster,
    latest_ref_date: s.latest_ref_date || null,
  };
}

/** One-line disclosure-flow summary for prompts; '' when no flow signal. */
function flowLine(ctx) {
  const f = ctx.flow;
  if (!f) return '';
  const dir = f.direction === 'accumulation' ? 'NET BUYING'
    : f.direction === 'distribution' ? 'NET SELLING' : 'mixed flow';
  const net = f.net_flow != null ? ` net $${Math.round(Math.abs(f.net_flow) / 1000)}k` : '';
  return ` Disclosure flow (90d): ${dir}${net} by ${f.officials ?? '?'} officials (flow score ${f.flow_score ?? '?'}/100${f.cluster ? ', CLUSTERED' : ''}).`;
}

function buildCongressContext(ticker, congress) {  const today = isoDate();
  const rows = (congress || []).filter((r) =>
    String(r.ticker || '').toUpperCase() === ticker &&
    String(r.trade_type || '').toLowerCase() === 'buy' &&
    r.disclosed_date && daysBetween(r.disclosed_date, today) >= 0 && daysBetween(r.disclosed_date, today) <= 90);
  return {
    buys90d: rows.length,
    clustered: rows.some((r) => r.cluster),
    recent: rows.slice(0, 5).map((r) => ({
      member: r.member, chamber: r.chamber, amount_range: r.amount_range,
      tx_date: r.tx_date, disclosed_date: r.disclosed_date, lag_days: r.lag_days,
      doc_url: r.doc_url, cluster: r.cluster,
    })),
  };
}

async function buildOptionsContext(ticker) {
  const out = { unusual: null, callPutVolRatio: null, maxVolOiRatio: null, note: null };
  try {
    const chain = await yahooOptions(ticker);
    if (!chain) { out.note = 'no listed options'; return out; }
    const calls = chain.options?.[0]?.calls || [];
    let cv = 0, pv = 0, maxRatio = 0;
    for (const c of calls) {
      const v = c.volume || 0, oi = c.openInterest || 0;
      cv += v;
      if (v >= 500 && oi > 0) maxRatio = Math.max(maxRatio, v / oi);
    }
    for (const p of chain.options?.[0]?.puts || []) pv += p.volume || 0;
    out.callPutVolRatio = pv > 0 ? r2(cv / pv, 2) : null;
    out.maxVolOiRatio = r2(maxRatio, 1);
    out.unusual = maxRatio >= 3;
  } catch (e) {
    out.note = `options fetch failed: ${e.message}`;
    console.warn(`[research] ${ticker}: options context failed: ${e.message}`);
  }
  return out;
}

async function prefetchNews(ticker) {
  try {
    const items = await yahooNews(ticker, 8);
    return items.map((n) => ({
      date: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString().slice(0, 10) : null,
      headline: n.title, source: n.publisher,
    }));
  } catch (e) {
    console.warn(`[research] ${ticker}: news prefetch failed: ${e.message}`);
    return [];
  }
}

// ── Prompts ──────────────────────────────────────────────────────────────────
// Every analyst gets: instrument anchoring + a VERIFIED DATA block (the
// anti-hallucination device from tradingagents §4.1) + a strict JSON schema.
// Models never tool-call; they report on injected data.

const VERIFIED_PREAMBLE = `## VERIFIED DATA — SOURCE OF TRUTH
The JSON block below was computed deterministically from market data feeds.
Treat it as the source of truth. If anything else you believe conflicts with
it, FLAG the discrepancy explicitly — never invent a reconciled number.
Do not claim historical validation, support/resistance bounces, or exact
percentage moves unless they are directly supported by the data block with
concrete dates and prices.`;

const ANTI_FENCE = `The debate always contains conflicting arguments; deciding which side is stronger is the job, so conflict alone is not a reason to Hold. Commit to the side with the stronger case, sized by how decisively it wins. Choose Hold only when the evidence is still balanced after that weighing, or too thin to support a call; do not manufacture a direction to appear decisive. Weigh the cases on their merits, independent of which side spoke first or last.`;

const JSON_ONLY = `Respond with a single JSON object only — no markdown fences, no prose outside the JSON. Use null (never "N/A" or 0) for anything the data does not support.`;

function pMarket(ctx) {
  return `You are the MARKET/TECHNICAL analyst in a stock research team. You do NOT decide trades; you report technical facts.
Instrument: ${ctx.ticker} — ${ctx.name}. Analyze ONLY this company.

${VERIFIED_PREAMBLE}
${JSON.stringify(ctx.tech, null, 1)}

Market context: regime=${ctx.regime} (${ctx.regimeNotes || 'n/a'})

Write a technical assessment: trend structure, where price sits vs SMA50/200 and the 52-week high, momentum (RSI/MACD/Bollinger), volume behavior, and the most relevant support/resistance levels implied by the 52-week high/low and moving averages.
${JSON_ONLY}
Schema: {"summary": string (3-5 sentences), "stance": "bullish"|"bearish"|"neutral", "key_levels": number[] (up to 4, nearest support/resistance), "stage_read": string (1 sentence on the Weinstein stage), "volume_read": string (1 sentence)}`;
}

function pFundamentals(ctx) {
  return `You are the FUNDAMENTALS analyst in a stock research team. You do NOT decide trades; you report fundamental facts.
Instrument: ${ctx.ticker} — ${ctx.name}. Analyze ONLY this company.

${VERIFIED_PREAMBLE}
${JSON.stringify(ctx.fund, null, 1)}

Quality-gate red flags to check explicitly: receivables growing faster than revenue, inventory growing faster than COGS, operating cash flow below net income, recurring "one-time" charges. (Only flag what the data supports; if a check needs data not present, say so.)
${JSON_ONLY}
Schema: {"summary": string (3-5 sentences), "stance": "bullish"|"bearish"|"neutral", "quality_flags": string[] (each a concrete red flag or empty), "earnings_read": string (1-2 sentences on the streak + upcoming report), "moat_note": string (1 sentence, only if data supports it)}`;
}

function pNews(ctx) {
  return `You are the NEWS analyst in a stock research team. You do NOT decide trades; you report what the news says.
Instrument: ${ctx.ticker} — ${ctx.name}. Analyze ONLY this company.

${VERIFIED_PREAMBLE}
Headlines (last ~7 days, Yahoo Finance):
${JSON.stringify(ctx.news, null, 1)}
Smart-money context (pre-computed from filings):
${JSON.stringify({ insider_clusters: ctx.insider.clusters, congress_buys_90d: ctx.congress.buys90d, congress_clustered: ctx.congress.clustered }, null, 1)}

Separate EVENT news (earnings, guidance, product, regulatory) from OPINION (analyst ratings, punditry). Note any catalyst with a date inside the next 2 weeks.
${JSON_ONLY}
Schema: {"summary": string (3-5 sentences), "stance": "bullish"|"bearish"|"neutral", "key_themes": string[] (up to 4), "catalyst": string|null (dated catalyst or null)}`;
}

function pSentiment(ctx) {
  return `You are the SENTIMENT analyst in a stock research team. You do NOT decide trades; you score sentiment.
Instrument: ${ctx.ticker} — ${ctx.name}. Analyze ONLY this company.

LIMITATION (state this in your output): no keyless social-sentiment source exists (StockTwits API is dead, Reddit/GDELT are unusable without keys), so this read is HEADLINES-ONLY. Score what the headlines imply about positioning and attention; do not invent social chatter.

${VERIFIED_PREAMBLE}
Headlines:
${JSON.stringify(ctx.news, null, 1)}
Price context: ${ctx.tech ? `last ${ctx.tech.lastClose}, ${ctx.tech.dist52wHighPct}% below 52w high, 5d/50d volume ratio ${ctx.tech.volRatio5dVs50d}` : 'unavailable'}

Read: headline tone distribution, attention vs price action (a spike in attention AFTER a big run is a caution flag, not a buy signal — per the Journal of Financial Economics attention/return finding), and whether sentiment is confirming or diverging from the technical position.
${JSON_ONLY}
Schema: {"overall_band": "very bearish"|"bearish"|"mildly bearish"|"mildly bullish"|"bullish"|"very bullish", "overall_score": number (0-10), "confidence": "low"|"medium"|"high", "narrative": string (2-3 sentences), "stance": "bullish"|"bearish"|"neutral"|"mixed", "limitation_note": string (the headlines-only limitation, 1 sentence)}`;
}

function pBull(ctx, reports) {
  return `You are the BULL researcher. Argue the bullish case for ${ctx.ticker} — ${ctx.name} using ONLY the analyst reports below. Growth potential, competitive advantages, positive indicators; rebut the bearish points where the evidence allows. Evidence-based, conversational, no invented facts.

Analyst reports:
${reports}

Smart-money context: ${ctx.insider.recentBuys} insider open-market buys in 7d; ${ctx.congress.buys90d} congressional buys in 90d${ctx.congress.clustered ? ' (CLUSTERED — multiple members)' : ''}.${flowLine(ctx)}

Respond with a single JSON object only: {"argument": string (4-7 sentences), "strongest_point": string (1 sentence), "stance": "bullish"}`;
}

function pBear(ctx, reports, bullArg) {
  return `You are the BEAR researcher. Argue the bearish case for ${ctx.ticker} — ${ctx.name} using ONLY the analyst reports below. Risks, overvaluation, negative indicators; directly rebut the bull's argument where the evidence allows. Evidence-based, conversational, no invented facts.

Analyst reports:
${reports}

Bull's argument to rebut: ${bullArg}

Smart-money context: ${ctx.insider.recentBuys} insider open-market buys in 7d; ${ctx.congress.buys90d} congressional buys in 90d. (Insider SALES are weak evidence — mostly tax/diversification — do not overweight them.)${flowLine(ctx)}

Respond with a single JSON object only: {"argument": string (4-7 sentences), "strongest_point": string (1 sentence), "stance": "bearish"}`;
}

function pResearchManager(ctx, reports, bullArg, bearArg) {
  const weightLines = PLAYBOOK_WEIGHTS.map(([a, w]) => `- ${a} (weight ${(w * 100).toFixed(0)}%)`).join('\n');
  return `You are the RESEARCH MANAGER — the judge of the bull-vs-bear debate for ${ctx.ticker} — ${ctx.name}. Your rating drives the trade decision.

${ANTI_FENCE}

Debate:
BULL: ${bullArg}
BEAR: ${bearArg}

Analyst reports (reference):
${reports}

Score EACH attribute 0-100 with a one-line note, using these EXACT playbook weights:
${weightLines}
Quality gate (pass/fail, list concrete flags): no earnings-quality red flags, margins/ROIC stable or rising, valuation sanity.

Respond with a single JSON object only:
{"recommendation": "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell", "rationale": string (3-5 sentences), "strategic_actions": string[] (up to 3), "score_breakdown": [{"attribute": string (exact attribute name from the list above), "score": number, "note": string}], "quality_gate_pass": boolean, "quality_flags": string[]}`;
}

function pTrader(ctx, rm) {
  return `You are the TRADER. Convert the research manager's plan for ${ctx.ticker} — ${ctx.name} into a concrete trade proposal.
Recommendation: ${rm.recommendation}. Rationale: ${rm.rationale}
Current price: ${ctx.tech?.lastClose ?? 'unknown'} (as of ${ctx.tech?.asOf ?? 'unknown'}). ATR(14): ${ctx.tech?.atr14 ?? 'unknown'}.

RULE: entry_price and stop_price MUST be absolute price levels in USD (e.g. 189.5) — never percentages, never ranges. If the recommendation is Hold/Underweight/Sell on a long-only book, say so plainly in reasoning and still give the levels that would change the call.
Position sizing: reference the playbook rule (swing stock: stop 7-8% max, ~2% account risk) — do not invent account sizes.

Respond with a single JSON object only:
{"action": "Buy"|"Hold"|"Sell", "reasoning": string (2-4 sentences), "entry_price": number|null, "stop_price": number|null, "position_sizing": string (1-2 sentences), "invalidation": string (1-2 sentences: what kills the thesis)}`;
}

function pRisk(ctx, reports, rm, trader) {
  return `You are the RISK reviewer (one condensed round standing in for aggressive/conservative/neutral debaters). For ${ctx.ticker} — ${ctx.name}:
Plan: ${rm.recommendation} — ${rm.rationale}
Trade: ${trader.action}, entry ${trader.entry_price}, stop ${trader.stop_price}. ${trader.reasoning}
Key facts: ${JSON.stringify({ tech: ctx.tech ? { lastClose: ctx.tech.lastClose, dist52wHighPct: ctx.tech.dist52wHighPct, rsi14: ctx.tech.rsi14, stage: ctx.tech.stage } : null, earnings: ctx.fund.earnings ? { reporting_date: ctx.fund.earnings.reporting_date, implied_move_pct: ctx.fund.earnings.implied_move_pct } : null, sentiment: reports.sentiment.overall_band })}

List the top 3 risks to this trade and the single development that would kill the thesis outright.
Respond with a single JSON object only:
{"top_risks": string[] (exactly 3, each 1-2 sentences), "kill_thesis": string (1-2 sentences), "stance": "bullish"|"bearish"|"neutral"}`;
}

function pPortfolioManager(ctx, reports, rm, trader, risk) {
  return `You are the PORTFOLIO MANAGER — the final judge for ${ctx.ticker} — ${ctx.name}.

${ANTI_FENCE}

Research manager: ${rm.recommendation} — ${rm.rationale}
Trader: ${trader.action} @ ${trader.entry_price}, stop ${trader.stop_price}. ${trader.reasoning}
Risk review: ${risk.top_risks.join(' | ')} KILLER: ${risk.kill_thesis}
Sentiment: ${reports.sentiment.overall_band || 'unknown'} (confidence ${reports.sentiment.confidence || 'low'}). Technical stage: ${ctx.tech?.stage ?? 'unknown'}.

Deliver the final decision.
Respond with a single JSON object only:
{"rating": "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell", "executive_summary": string (2-3 sentences), "investment_thesis": string (3-5 sentences, the one-paragraph bull/bear case), "price_target": number|null (absolute USD, 1-2 week horizon, null if not supportable), "time_horizon": string (e.g. "1-2 weeks"), "p_up": number (0-100 — YOUR estimated probability, as a whole number, that the stock closes HIGHER 30 days from now; 50 = coin flip; be honest about uncertainty, never 0 or 100)}`;
}

// ── Orchestration ────────────────────────────────────────────────────────────
const RATING_SCORE = { Buy: 85, Overweight: 70, Hold: 50, Underweight: 35, Sell: 20 };
function stanceOfRating(r) {
  return r === 'Buy' || r === 'Overweight' ? 'bullish' : r === 'Sell' || r === 'Underweight' ? 'bearish' : 'neutral';
}
function sentimentOfBand(band) {
  const b = String(band || '').toLowerCase();
  if (b.includes('very bullish') || b === 'bullish') return 'bullish';
  if (b.includes('very bearish') || b === 'bearish') return 'bearish';
  return 'mixed';
}
function validLevel(v, ref) {
  const n = coerceNum(v);
  if (n == null || n <= 0) return null;
  if (ref && (n < ref * 0.5 || n > ref * 1.5)) {
    console.warn(`[research] level ${n} rejected (>${ref} ±50%)`);
    return null;
  }
  return r2(n);
}

async function runAnalyst(tier, agentName, promptFn, ctx, fallbackStance = 'neutral') {
  try {
    const { text, model } = await callGemini(tier, promptFn(ctx), { temperature: 0.2 });
    const j = extractJson(text);
    if (!j) throw new Error('no JSON in response');
    return { ...j, _model: model, _tier: tier, _ok: true };
  } catch (e) {
    console.error(`[research] ${ctx.ticker}: ${agentName} FAILED: ${e.message} — continuing with fallback`);
    return { summary: `${agentName} failed (${e.message}); no analyst view available.`, stance: fallbackStance, _ok: false, _tier: tier, _model: null };
  }
}

function note(agent, out, stance) {
  const tier = out._tier ? `[${out._tier}${out._model ? ':' + out._model : ''}] ` : '';
  return { agent, summary: tier + (coerceStr(out.summary || out.argument || out.executive_summary, 500) || 'no summary'), stance: stance || 'neutral' };
}

async function prefetchTicker(sel, inputs, spyCloses, cikMap) {
  const ticker = sel.ticker;
  const earningsEntry = (inputs.earnings || []).find((e) => String(e.ticker).toUpperCase() === ticker) || sel.earningsEntry || null;
  const briefEntry = sel.briefEntry || (inputs.brief?.breakout_candidates || []).find((c) => String(c.ticker).toUpperCase() === ticker) || null;

  const ctx = {
    ticker,
    name: earningsEntry?.name || briefEntry?.name || ticker,
    regime: inputs.brief?.market_regime || 'unknown',
    regimeNotes: inputs.brief?.regime_notes || null,
    earningsEntry,
    briefEntry,
  };
  // Prefetch everything (deterministic; the models never fetch)
  ctx.tech = await prefetchMarket(ticker, spyCloses);
  ctx.fund = await prefetchFundamentals(ticker, cikMap, earningsEntry);
  ctx.news = await prefetchNews(ticker);
  ctx.insider = buildInsiderContext(ticker, inputs.insiders);
  ctx.congress = buildCongressContext(ticker, inputs.congress);
  ctx.flow = buildFlowContext(ticker, sel, inputs.signals);
  ctx.options = await buildOptionsContext(ticker);

  if (!ctx.tech && !ctx.fund.cik) {
    console.error(`[research] ${ticker}: no market data AND no SEC identity — skipping ticker`);
    return null;
  }
  return ctx;
}

async function runTicker(sel, inputs, spyCloses, cikMap) {
  const ticker = sel.ticker;
  console.log(`\n[research] ═══ ${ticker} ═══`);
  const ctx = await prefetchTicker(sel, inputs, spyCloses, cikMap);
  if (!ctx) return null;

  // 1-4: analysts
  const mkt = await runAnalyst('quick', 'market_analyst', pMarket, ctx);
  const fun = await runAnalyst('quick', 'fundamentals_analyst', pFundamentals, ctx);
  const nws = await runAnalyst('quick', 'news_analyst', pNews, ctx);
  const sen = await runAnalyst('quick', 'sentiment_analyst', pSentiment, ctx);
  const reports = { market: mkt, fundamentals: fun, news: nws, sentiment: sen };
  const reportsText = ['market', 'fundamentals', 'news', 'sentiment']
    .map((k) => `### ${k}\n${reports[k].summary}`).join('\n\n');

  // 5-6: debate
  const bull = await runAnalyst('quick', 'bull_researcher', (c) => pBull(c, reportsText), ctx, 'bullish');
  const bear = await runAnalyst('quick', 'bear_researcher', (c) => pBear(c, reportsText, bull.argument || bull.summary), ctx, 'bearish');

  // 7: research manager (judge) — REQUIRED; without it there is no score
  let rm;
  try {
    const { text, model, tier } = await callGemini('deep', pResearchManager(ctx, reportsText, bull.argument || bull.summary, bear.argument || bear.summary), { temperature: 0.2, maxTokens: 3000 });
    rm = extractJson(text);
    if (!rm || !RATING_SCORE[rm.recommendation]) throw new Error('judge returned no usable recommendation');
    rm._model = model; rm._tier = tier; rm._ok = true;
  } catch (e) {
    console.error(`[research] ${ticker}: RESEARCH MANAGER failed (${e.message}) — ticker skipped, no score fabricated`);
    return null;
  }

  // 8: trader
  let trader;
  try {
    const { text, model, tier } = await callGemini('quick', pTrader(ctx, rm), { temperature: 0.2 });
    trader = extractJson(text) || {};
    trader._model = model; trader._tier = tier; trader._ok = true;
  } catch (e) {
    console.error(`[research] ${ticker}: trader failed (${e.message}) — levels null`);
    trader = { action: 'Hold', reasoning: 'trader call failed', entry_price: null, stop_price: null, invalidation: null, _ok: false, _tier: 'quick', _model: null };
  }

  // 9: condensed risk review
  const risk = await runAnalyst('quick', 'risk_review', (c) => pRisk(c, reports, rm, trader), ctx);
  if (!Array.isArray(risk.top_risks)) risk.top_risks = [];

  // 10: portfolio manager (final judge)
  let pm;
  try {
    const { text, model, tier } = await callGemini('deep', pPortfolioManager(ctx, reports, rm, trader, risk), { temperature: 0.2, maxTokens: 2500 });
    pm = extractJson(text);
    if (!pm || !RATING_SCORE[pm.rating]) throw new Error('PM returned no usable rating');
    pm._model = model; pm._tier = tier; pm._ok = true;
  } catch (e) {
    console.error(`[research] ${ticker}: portfolio manager failed (${e.message}) — falling back to research-manager rating`);
    pm = { rating: rm.recommendation, executive_summary: rm.rationale, investment_thesis: rm.rationale, price_target: null, time_horizon: '1-2 weeks', _ok: false, _tier: 'deep', _model: null };
  }

  // ── Assemble ResearchIdea (contract-exact) ──
  const breakdown = (Array.isArray(rm.score_breakdown) ? rm.score_breakdown : [])
    .map((s) => {
      const w = PLAYBOOK_WEIGHTS.find(([a]) => a === s.attribute);
      return { attribute: s.attribute, weight: w ? w[1] : 0, score: clamp(Math.round(coerceNum(s.score) ?? 50), 0, 100), note: coerceStr(s.note, 200) || '' };
    })
    .filter((s) => PLAYBOOK_WEIGHTS.some(([a]) => a === s.attribute));
  for (const [a, w] of PLAYBOOK_WEIGHTS) {
    if (!breakdown.some((s) => s.attribute === a)) breakdown.push({ attribute: a, weight: w, score: 50, note: 'judge did not score this attribute; neutral placeholder' });
  }
  const attrAvg = breakdown.reduce((acc, s) => acc + s.score * s.weight, 0);
  const base = RATING_SCORE[pm.rating] ?? 50;
  const score = Math.round(clamp(base + (attrAvg - 50) * 0.1, 5, 98));

  const ref = ctx.tech?.lastClose || null;
  const idea = {
    ticker,
    name: ctx.name,
    sector: ctx.earningsEntry?.sector || 'Unknown',
    subsector: ctx.earningsEntry?.industry || 'Unknown',
    index_membership: ctx.briefEntry?.index_membership || [],
    thesis: coerceStr(pm.investment_thesis, 900) || coerceStr(rm.rationale, 900) || '',
    score,
    /** Agent-estimated probability (0-100) the stock closes higher 30d out. Model judgment, NOT calibrated. */
    p_up: clamp(Math.round(coerceNum(pm.p_up) ?? 50), 1, 99),
    /** Disclosure flow signal that selected this ticker (null when not flow-selected). */
    flow: ctx.flow,
    score_breakdown: breakdown,
    trend_template_pass: ctx.tech ? !!ctx.tech.trendTemplatePass : false,
    stage: ctx.tech?.stage || 'Stage 1',
    rs_rank: ctx.tech?.rsRank ?? null,
    distance_from_52w_high_pct: ctx.tech?.dist52wHighPct ?? null,
    insider_clusters: ctx.insider.clusters,
    congress_buys: ctx.congress.buys90d,
    unusual_options: ctx.options.unusual === true,
    sentiment: sentimentOfBand(sen.overall_band),
    quality_gate_pass: rm.quality_gate_pass === true,
    quality_flags: coerceStrArr(rm.quality_flags),
    trigger_price: validLevel(trader.entry_price, ref),
    stop_price: validLevel(trader.stop_price, ref),
    invalidation: coerceStr(trader.invalidation || risk.kill_thesis, 400) || '',
    analyst_notes: [
      note('market_analyst', mkt, mkt.stance),
      note('fundamentals_analyst', fun, fun.stance),
      note('news_analyst', nws, nws.stance),
      note('sentiment_analyst', sen, sen.stance),
      note('bull_researcher', bull, 'bullish'),
      note('bear_researcher', bear, 'bearish'),
      note('research_manager', { ...rm, summary: rm.rationale }, stanceOfRating(rm.recommendation)),
      note('trader', { ...trader, summary: trader.reasoning }, trader.action === 'Buy' ? 'bullish' : trader.action === 'Sell' ? 'bearish' : 'neutral'),
      note('risk_review', { ...risk, summary: (risk.top_risks || []).join(' | ') }, risk.stance),
      note('portfolio_manager', { ...pm, summary: pm.executive_summary }, stanceOfRating(pm.rating)),
    ],
    updated_at: new Date().toISOString(),
  };
  console.log(`[research] ${ticker}: ${pm.rating} → score ${score} (gate ${idea.quality_gate_pass ? 'PASS' : 'FAIL'})`);
  return idea;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[research] data dir: ${DATA_DIR}`);
  if (!PREFETCH_ONLY) await resolveModels();
  if (VERIFY_MODELS) {
    console.log(`[research] verified: quick=${QUICK_MODEL} deep=${DEEP_MODEL}`);
    return;
  }

  const brief = loadJson('daily-brief.json');
  const earnings = loadJson('earnings.json');
  const insiders = loadJson('insiders.json');
  const congress = loadJson('congress.json');
  const signals = loadJson('signals.json');

  let cikMap = {};
  try { cikMap = await tickerToCikMap(); } catch (e) { console.warn(`[research] CIK map failed: ${e.message} — fundamentals will be thin`); }

  let spyCloses = null;
  try {
    const sj = await yahooChart('SPY', { interval: '1d', range: '1y' });
    spyCloses = parseChart(sj)?.closes || null;
  } catch (e) { console.warn(`[research] SPY benchmark fetch failed: ${e.message} — RS rank null`); }

  const tickers = selectTickers(brief, earnings, signals);
  if (!tickers.length) {
    console.error('[research] no tickers selected — writing empty research.json');
    writeJsonAtomic(OUT_PATH, []);
    return;
  }

  if (PREFETCH_ONLY) {
    // No-key test mode: validate selection + all prefetch math, print VERIFIED blocks.
    for (const sel of tickers) {
      const ctx = await prefetchTicker(sel, { brief, earnings, insiders, congress }, spyCloses, cikMap);
      console.log(`\n── PREFETCH ${sel.ticker} ──`);
      console.log(JSON.stringify(ctx, null, 1));
    }
    return;
  }

  const ideas = [];
  const failed = [];
  for (const sel of tickers) {
    try {
      const idea = await runTicker(sel, { brief, earnings, insiders, congress, signals }, spyCloses, cikMap);
      if (idea) ideas.push(idea);
      else failed.push(sel.ticker);
    } catch (e) {
      console.error(`[research] ${sel.ticker}: UNEXPECTED failure: ${e.stack || e.message}`);
      failed.push(sel.ticker);
    }
  }

  writeJsonAtomic(OUT_PATH, ideas);
  console.log(`\n[research] DONE: ${ideas.length} ideas, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}`);
  console.log(`[research] wrote ${OUT_PATH}`);
}

main().catch((e) => { console.error(`[research] FATAL: ${e.stack || e.message}`); process.exit(1); });
