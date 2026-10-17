#!/usr/bin/env node
/**
 * build-brief.mjs → data/daily-brief.json (TradeDesk DailyBrief contract).
 *
 * Keyless sources only (all verified live 2026-10-14):
 *  - Universe: S&P 500 + Nasdaq-100 constituents parsed from Wikipedia
 *    tables; Russell 2000 via the iShares IWM holdings CSV (best-effort —
 *    iShares often blocks bots; if it fails we log loudly and proceed
 *    without RUSSELL2000 tags rather than faking membership).
 *  - Breakout scan: Yahoo v8 daily bars (1y) per ticker — within 5% of the
 *    52-week high, 3-month relative strength vs SPY, 5d vs 50d volume
 *    expansion. Score 0–100 from documented cutoffs; top 15 kept.
 *    Stale quotes (>4 calendar days) are DROPPED, never scored.
 *  - 0DTE/1DTE: Yahoo v7 options chains for SPY/QQQ/IWM + ~20 liquid names.
 *    Expected move from the 0DTE/1DTE ATM straddle; bias from put/call
 *    volume; unusual-volume strikes flagged in the thesis.
 *    iv_rank: null — no free keyless historical-IV source (documented).
 *  - Sectors: 11 SPDR sector ETFs — 1d/5d/1m performance, RS rank, trend;
 *    rotation notes from 5d-rank vs 1m-rank changes.
 *  - Regime: SPY vs 50/200-day, % of scanned universe above 50-day, VIX.
 *
 * "Setup" names are DESCRIPTIVE of the measured conditions (e.g.
 * "near 52-week high on expanding volume"), not classified chart patterns —
 * the pipeline does not pretend to do pattern recognition.
 *
 * Runtime: ~600 chart requests in --quick mode (~12 min at 1 req/s);
 * full mode adds ~2000 Russell 2000 names (~45 min). Both fine for a
 * pre-market cron (cron: 30 12 * * 1-5 = 8:30am ET).
 *
 * Usage: OUT_DIR=/path/to/public/data node build-brief.mjs [--quick]
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJson, fetchText } from './lib/http.mjs';
import { yahooChart, yahooOptions, yahooQuoteSummary } from './lib/yahoo.mjs';
import {
  isoDate, addDays, unixToDate, msToIso, writeJsonAtomic, r2, clamp,
} from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const QUICK = process.argv.includes('--quick');

const SECTORS = [
  { sector: 'Technology', etf: 'XLK' },
  { sector: 'Financials', etf: 'XLF' },
  { sector: 'Energy', etf: 'XLE' },
  { sector: 'Health Care', etf: 'XLV' },
  { sector: 'Industrials', etf: 'XLI' },
  { sector: 'Communication Services', etf: 'XLC' },
  { sector: 'Consumer Discretionary', etf: 'XLY' },
  { sector: 'Consumer Staples', etf: 'XLP' },
  { sector: 'Utilities', etf: 'XLU' },
  { sector: 'Materials', etf: 'XLB' },
  { sector: 'Real Estate', etf: 'XLRE' },
];

// Industry / subsector ETFs for the subsector-momentum read (liquid, single-industry).
const SUBSECTORS = [
  { sector: 'Semiconductors', etf: 'SMH' },
  { sector: 'Software', etf: 'IGV' },
  { sector: 'Cybersecurity', etf: 'CIBR' },
  { sector: 'Biotech', etf: 'XBI' },
  { sector: 'Pharma', etf: 'XPH' },
  { sector: 'Health Providers', etf: 'IHF' },
  { sector: 'Oil & Gas E&P', etf: 'XOP' },
  { sector: 'Metals & Mining', etf: 'XME' },
  { sector: 'Gold Miners', etf: 'GDX' },
  { sector: 'Aerospace & Defense', etf: 'ITA' },
  { sector: 'Transportation', etf: 'IYT' },
  { sector: 'Regional Banks', etf: 'KRE' },
  { sector: 'Insurance', etf: 'KIE' },
  { sector: 'Homebuilders', etf: 'XHB' },
  { sector: 'Retail', etf: 'XRT' },
];

// Fixed watchlist of the most liquid option underlyings (documented; not data).
const LIQUID_OPTIONS = ['SPY', 'QQQ', 'IWM', 'AAPL', 'NVDA', 'TSLA', 'AMD', 'META',
  'AMZN', 'MSFT', 'GOOGL', 'NFLX', 'JPM', 'XLF', 'DIA', 'SMH', 'COIN', 'PLTR',
  'MSTR', 'EEM', 'TLT', 'USO'];

const STALE_MS = 4 * 86400000;

/* ── Universe ─────────────────────────────────────────────────────────── */

function parseWikiSymbols(html, minExpected, label) {
  const tables = [...html.matchAll(/<table class="wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g)];
  if (!tables.length) {
    console.error(`[brief] ${label}: no wikitable found in Wikipedia HTML`);
    return [];
  }
  // The constituents table is the one whose header mentions Symbol/Ticker.
  // NOTE: <tr> tags carry attributes on Wikipedia — match <tr[^>]*>, not <tr>.
  let body = tables[0][1];
  for (const t of tables) {
    if (/<th[^>]*>\s*(Symbol|Ticker)/i.test(t[1])) { body = t[1]; break; }
  }
  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const syms = [];
  for (const r of rows.slice(1)) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)];
    if (!cells.length) continue;
    let s = cells[0][1].replace(/<[^>]+>/g, '').replace(/\[.*?\]/g, '').trim().toUpperCase();
    s = s.replace(/\./g, '-'); // BRK.B → BRK-B (Yahoo format)
    if (/^[A-Z0-9-]{1,7}$/.test(s)) syms.push(s);
  }
  const uniq = [...new Set(syms)];
  console.log(`[brief] ${label}: parsed ${uniq.length} symbols`);
  if (uniq.length < minExpected) {
    console.error(`[brief] ${label}: only ${uniq.length} symbols (expected ≥${minExpected}) — page format may have changed`);
  }
  return uniq;
}

async function loadUniverse() {
  const membership = new Map(); // ticker → Set(SP500, NASDAQ100, RUSSELL2000)
  const add = (t, seg) => {
    if (!membership.has(t)) membership.set(t, new Set());
    membership.get(t).add(seg);
  };

  try {
    const sp = await fetchText('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', { label: 'wikipedia SP500' });
    parseWikiSymbols(sp, 400, 'S&P 500').forEach((t) => add(t, 'SP500'));
  } catch (e) {
    console.error(`[brief] S&P 500 universe FAILED: ${e.message}`);
  }
  try {
    // NOTE: the generic "Nasdaq-100" article has no constituents table;
    // the dedicated list article does.
    const ndx = await fetchText('https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies', { label: 'wikipedia Nasdaq-100 list' });
    parseWikiSymbols(ndx, 80, 'Nasdaq-100').forEach((t) => add(t, 'NASDAQ100'));
  } catch (e) {
    console.error(`[brief] Nasdaq-100 universe FAILED: ${e.message}`);
  }

  let r2kCount = 0;
  if (!QUICK) {
    try {
      const csv = await fetchText(
        'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/1467271812596.ajax?fileType=csv&fileName=iShares-Russell-2000-ETF_holdings&dataType=fund',
        { label: 'iShares IWM holdings CSV' }
      );
      const lines = csv.split('\n');
      const hi = lines.findIndex((l) => /^"?Ticker"?/i.test(l.trim()));
      if (hi === -1) throw new Error('no Ticker header row found in CSV');
      for (const l of lines.slice(hi + 1)) {
        const m = l.match(/^"?([A-Z0-9.\-/]+)"?/);
        if (!m) continue;
        const t = m[1].replace(/\./g, '-').toUpperCase();
        if (/^[A-Z0-9-]{1,7}$/.test(t)) { add(t, 'RUSSELL2000'); r2kCount++; }
      }
      console.log(`[brief] Russell 2000: ${r2kCount} holdings parsed`);
    } catch (e) {
      console.error(`[brief] Russell 2000 holdings FAILED (${e.message}) — proceeding WITHOUT RUSSELL2000 tags (no fake membership)`);
    }
  } else {
    console.log('[brief] --quick: skipping Russell 2000 universe');
  }

  const tickers = [...membership.keys()];
  console.log(`[brief] universe: ${tickers.length} unique tickers${QUICK ? ' (--quick)' : ` (incl. ${r2kCount} R2000)`}`);
  if (!tickers.length) throw new Error('universe is empty — cannot build brief');
  return { tickers, membership, r2kCount };
}

/* ── Chart helpers ────────────────────────────────────────────────────── */

async function dailyBars(ticker) {
  const j = await yahooChart(ticker, { interval: '1d', range: '1y' });
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const closes = q.close || [], highs = q.high || [], lows = q.low || [], vols = q.volume || [];
  // last bar with a real close
  let last = closes.length - 1;
  while (last >= 0 && closes[last] == null) last--;
  if (last < 60) return null; // not enough history
  const ageMs = Date.now() - ts[last] * 1000;
  if (ageMs > STALE_MS) return null; // stale — dropped, never scored
  const price = closes[last];
  const clean = (arr) => arr.slice(0, last + 1).filter((v) => v != null);
  return {
    ticker,
    price: r2(price),
    priceTs: msToIso(ts[last] * 1000),
    closes: clean(closes), highs: clean(highs), lows: clean(lows), vols: clean(vols),
    high52: r2(Math.max(...clean(highs))),
    low52: r2(Math.min(...clean(lows))),
  };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pctChg = (a, b) => (a != null && b ? ((a - b) / Math.abs(b)) * 100 : null);

/* ── Main ─────────────────────────────────────────────────────────────── */

function lastWeekday(todayIso) {
  let d = todayIso;
  while (true) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, -1);
  }
}

async function main() {
  const today = isoDate();
  const briefDate = lastWeekday(today);
  console.log(`[brief] brief_date=${briefDate} (today=${today}) quick=${QUICK}`);

  const { tickers, membership } = await loadUniverse();

  // Benchmarks
  const spy = await dailyBars('SPY');
  if (!spy) throw new Error('SPY chart failed — cannot compute relative strength or regime');
  let vixLast = null;
  try {
    const v = await yahooChart('^VIX', { interval: '1d', range: '1mo' });
    const vc = v?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    vixLast = r2([...vc].reverse().find((x) => x != null));
  } catch (e) {
    console.error(`[brief] ^VIX fetch failed: ${e.message} — regime will note VIX unavailable`);
  }
  const spyRet63 = pctChg(spy.price, spy.closes[spy.closes.length - 64]);
  const spyMa50 = mean(spy.closes.slice(-50));
  const spyMa200 = mean(spy.closes.slice(-200));

  // ── Breakout scan ────────────────────────────────────────────────────
  const scored = [];
  let dropped = 0, failed = 0, above50Count = 0, scanned = 0;
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    let b;
    try {
      b = await dailyBars(t);
    } catch (e) {
      failed++;
      console.error(`[brief] chart failed for ${t}: ${e.message}`);
      continue;
    }
    if (!b) { dropped++; continue; }
    scanned++;
    const ma50 = mean(b.closes.slice(-50));
    const above50 = ma50 != null && b.price > ma50;
    if (above50) above50Count++;

    const proximity = b.price / b.high52;
    const ret63 = pctChg(b.price, b.closes[b.closes.length - 64]);
    const rs = ret63 != null && spyRet63 != null ? r2(ret63 - spyRet63) : null;
    const vol5 = mean(b.vols.slice(-5)), vol50 = mean(b.vols.slice(-50));
    const volExp = vol5 && vol50 ? r2(vol5 / vol50) : null;

    let score = 0;
    const attrs = [];
    if (proximity >= 0.98) { score += 40; attrs.push('near_52w_high'); }
    else if (proximity >= 0.95) { score += 30; attrs.push('near_52w_high'); }
    else if (proximity >= 0.92) { score += 15; }
    if (rs != null) {
      if (rs > 10) { score += 30; attrs.push('relative_strength'); }
      else if (rs > 5) { score += 20; attrs.push('relative_strength'); }
      else if (rs > 2) { score += 10; }
    }
    if (volExp != null) {
      if (volExp > 2) { score += 30; attrs.push('volume_expansion'); }
      else if (volExp > 1.5) { score += 20; attrs.push('volume_expansion'); }
      else if (volExp > 1.2) { score += 10; }
    }
    if (above50) attrs.push('above_50d');
    if (score < 40) continue;

    const nearHigh = proximity >= 0.95, strongVol = volExp != null && volExp > 1.5, strongRs = rs != null && rs > 5;
    const setup = nearHigh && strongVol ? 'near 52-week high on expanding volume'
      : nearHigh && strongRs ? 'relative-strength 52-week-high approach'
      : nearHigh ? '52-week-high approach'
      : strongRs && strongVol ? 'relative-strength momentum'
      : 'momentum watch';
    const stop = r2(Math.min(...b.lows.slice(-20)));
    scored.push({
      ticker: t, price: b.price, priceTs: b.priceTs, high52: b.high52,
      proximity: r2(proximity * 100, 1), rs, volExp, score,
      attributes: attrs, setup,
      trigger_price: b.high52, stop_price: stop,
      index_membership: [...(membership.get(t) || [])],
    });
    if ((i + 1) % 200 === 0) console.log(`[brief] scan progress ${i + 1}/${tickers.length} (kept ${scored.length})`);
  }
  console.log(`[brief] scanned=${scored.length + dropped} kept=${scored.length} dropped(stale/thin)=${dropped} failed(chart errors)=${failed}`);
  // Guard: a brief built on a crippled scan is worse than no brief — abort loudly
  // rather than shipping partial breadth/candidate data (e.g. transient Yahoo 429s).
  const attempted = scanned + dropped + failed;
  if (attempted > 50 && failed / attempted > 0.5) {
    throw new Error(
      `[brief] ABORT: chart fetch failed for ${failed}/${attempted} tickers — refusing to ship a partial brief`
    );
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 15);

  // Earnings catalyst cross-ref (fresh earnings.json only)
  let earningsCal = null;
  try {
    const p = path.join(OUT_DIR, 'earnings.json');
    const st = (await import('fs')).statSync(p);
    if (Date.now() - st.mtimeMs < 7 * 86400000) {
      earningsCal = JSON.parse((await import('fs')).readFileSync(p, 'utf8'));
    }
  } catch { /* no fresh calendar — catalysts stay null */ }

  const candidates = [];
  for (const c of top) {
    let name = c.ticker, sector = 'Unknown', subsector = 'Unknown';
    try {
      const qs = await yahooQuoteSummary(c.ticker, ['assetProfile']);
      name = qs?.assetProfile?.longName || c.ticker;
      sector = qs?.assetProfile?.sector || 'Unknown';
      subsector = qs?.assetProfile?.industry || 'Unknown';
    } catch (e) {
      console.error(`[brief] assetProfile failed for ${c.ticker}: ${e.message}`);
    }
    let catalyst = null, catalyst_date = null;
    if (earningsCal) {
      const hit = earningsCal.find((e) => e.ticker === c.ticker && e.reporting_date >= briefDate && e.reporting_date <= addDays(briefDate, 14));
      if (hit) { catalyst = 'earnings'; catalyst_date = hit.reporting_date; }
    }
    candidates.push({
      ticker: c.ticker,
      name,
      price: c.price,
      price_ts: c.priceTs,
      index_membership: c.index_membership,
      sector,
      subsector,
      setup: c.setup,
      trigger_price: c.trigger_price,
      stop_price: c.stop_price,
      score: c.score,
      attributes: c.attributes,
      catalyst,
      catalyst_date,
      thesis: `${c.ticker} is ${r2(100 - c.proximity, 1)}% below its 52-week high of $${c.high52}, ` +
        `with 3-month relative strength of ${c.rs != null ? c.rs + '%' : 'n/a'} vs SPY and volume running ` +
        `${c.volExp != null ? c.volExp + 'x' : 'n/a'} its 50-day average. Trigger on a high-volume break of ` +
        `$${c.trigger_price}; invalidation on a close below $${c.stop_price}.` +
        (catalyst ? ` Earnings report due ${catalyst_date} — decide hold/size-down before the print.` : ''),
    });
  }

  // ── 0DTE / 1DTE focus ────────────────────────────────────────────────
  const nextTradingDay = (() => {
    let d = addDays(briefDate, 1);
    while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = addDays(d, 1);
    return d;
  })();
  console.log(`[brief] 0DTE=${briefDate} 1DTE=${nextTradingDay}`);

  async function dtePick(ticker, targetDate, label) {
    let root;
    try { root = await yahooOptions(ticker); }
    catch (e) { if (e.status !== 404) console.error(`[brief] options root failed for ${ticker}: ${e.message}`); return null; }
    if (!root) return null;
    const u = parseFloat(root?.quote?.regularMarketPrice);
    const expTs = (root?.expirationDates || []).map(Number)
      .find((x) => unixToDate(x) === targetDate);
    if (!expTs || !u) return null;
    let chain;
    try { chain = await yahooOptions(ticker, { date: expTs }); }
    catch (e) { console.error(`[brief] chain failed for ${ticker} ${targetDate}: ${e.message}`); return null; }
    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];
    if (!calls.length || !puts.length) return null;
    const atmC = calls.reduce((a, b) => (Math.abs(b.strike - u) < Math.abs(a.strike - u) ? b : a));
    const atmP = puts.reduce((a, b) => (Math.abs(b.strike - u) < Math.abs(a.strike - u) ? b : a));
    const mid = (c) => {
      const b = parseFloat(c.bid), a = parseFloat(c.ask);
      return b > 0 && a > 0 ? (b + a) / 2 : parseFloat(c.lastPrice) || 0;
    };
    const expMove = r2(((mid(atmC) + mid(atmP)) / u) * 100);
    if (expMove == null || expMove <= 0) return null; // bad chain data — skip, don't publish a 0% move
    let callVol = 0, putVol = 0;
    const unusual = [];
    for (const c of calls) {
      const v = parseFloat(c.volume) || 0, oi = parseFloat(c.openInterest) || 0;
      callVol += v;
      if (v > 1.5 * oi && v >= 1000) unusual.push(`${c.contractSymbol} vol ${v} vs OI ${oi}`);
    }
    for (const c of puts) {
      const v = parseFloat(c.volume) || 0, oi = parseFloat(c.openInterest) || 0;
      putVol += v;
      if (v > 1.5 * oi && v >= 1000) unusual.push(`${c.contractSymbol} vol ${v} vs OI ${oi}`);
    }
    const totalVol = callVol + putVol;
    if (totalVol < 500) return null; // too thin to matter
    const pcr = callVol > 0 ? putVol / callVol : 99;
    const bias = pcr < 0.7 ? 'long' : pcr > 1.4 ? 'short' : 'neutral';
    const move = (u * expMove) / 100;
    return {
      ticker,
      underlying_price: r2(u),
      bias,
      thesis: `${label} chain: expected move ±${expMove}% ($${r2(move)}) from $${r2(u)}; ` +
        `put/call volume ${r2(pcr)} (${bias} lean); ${totalVol.toLocaleString()} contracts traded.` +
        (unusual.length ? ` Unusual: ${unusual.slice(0, 3).join('; ')}.` : ''),
      key_levels: [r2(u - move), r2(atmC.strike), r2(u + move)],
      iv_rank: null, // no free keyless historical-IV source (documented)
      expected_move_pct: expMove,
      _vol: totalVol,
    };
  }

  const zeroDte = [], oneDte = [];
  for (const t of LIQUID_OPTIONS) {
    for (const [target, arr, label] of [[briefDate, zeroDte, '0DTE'], [nextTradingDay, oneDte, '1DTE']]) {
      try {
        const p = await dtePick(t, target, label);
        if (p) { const { _vol, ...rest } = p; arr.push({ ...rest, _vol }); }
      } catch (e) {
        console.error(`[brief] DTE pick failed for ${t} ${label}: ${e.message}`);
      }
    }
  }
  zeroDte.sort((a, b) => b._vol - a._vol);
  oneDte.sort((a, b) => b._vol - a._vol);
  const stripVol = (arr) => arr.slice(0, 5).map(({ _vol, ...rest }) => rest);
  console.log(`[brief] 0DTE picks: ${zeroDte.length}, 1DTE picks: ${oneDte.length}`);

  // ── Sectors ──────────────────────────────────────────────────────────
  async function etfPerfRows(list, label) {
    const rows = [];
    for (const s of list) {
      try {
        const b = await dailyBars(s.etf);
        if (!b) { console.error(`[brief] ${label} ${s.etf}: no bars`); continue; }
        const c = b.closes;
        const p1d = r2(pctChg(c[c.length - 1], c[c.length - 2]));
        const p5d = r2(pctChg(c[c.length - 1], c[c.length - 6]));
        const p1m = r2(pctChg(c[c.length - 1], c[c.length - 22]));
        const ma20 = mean(c.slice(-20));
        const trend = b.price > ma20 * 1.01 ? 'up' : b.price < ma20 * 0.99 ? 'down' : 'flat';
        rows.push({ sector: s.sector, etf: s.etf, perf_1d_pct: p1d, perf_5d_pct: p5d, perf_1m_pct: p1m, trend });
      } catch (e) {
        console.error(`[brief] ${label} ${s.etf} failed: ${e.message}`);
      }
    }
    return rows;
  }
  const sectorRows = await etfPerfRows(SECTORS, 'sector');
  const by1m = [...sectorRows].sort((a, b) => (b.perf_1m_pct ?? -999) - (a.perf_1m_pct ?? -999));
  by1m.forEach((r, i) => (r.rel_strength_rank = i + 1));
  const hot = by1m.slice(0, 4), weak = by1m.slice(-4).reverse();
  const by5d = [...sectorRows].sort((a, b) => (b.perf_5d_pct ?? -999) - (a.perf_5d_pct ?? -999));
  const rank5d = new Map(by5d.map((r, i) => [r.etf, i + 1]));
  // Rank delta = (5d rank) − (1m rank). A *climber* improved its short-term
  // standing, so its 5d rank number is SMALLER → delta negative.
  const movers = sectorRows
    .map((r) => ({ ...r, delta: (rank5d.get(r.etf) ?? 99) - (r.rel_strength_rank ?? 99) }))
    .sort((a, b) => a.delta - b.delta); // most-improved first
  const climbers = movers.filter((m) => m.delta <= -2).slice(0, 2);
  const fallers = movers.filter((m) => m.delta >= 2).slice(-2).reverse();
  const rotation_notes =
    (climbers.length ? `Rotating in: ${climbers.map((m) => `${m.sector} (5d rank #${rank5d.get(m.etf)} vs 1m rank #${m.rel_strength_rank})`).join(', ')}. ` : '') +
    (fallers.length ? `Rotating out: ${fallers.map((m) => `${m.sector} (5d rank #${rank5d.get(m.etf)} vs 1m rank #${m.rel_strength_rank})`).join(', ')}.` : '') ||
    'No major rank changes between the 5-day and 1-month sector leaderboards.';

  // ── Subsectors (industry momentum via liquid industry ETFs) ─────────
  const subRows = await etfPerfRows(SUBSECTORS, 'subsector');
  const subBy1m = [...subRows].sort((a, b) => (b.perf_1m_pct ?? -999) - (a.perf_1m_pct ?? -999));
  subBy1m.forEach((r, i) => (r.rel_strength_rank = i + 1));
  const subHot = subBy1m.slice(0, 5), subWeak = subBy1m.slice(-5).reverse();
  console.log(`[brief] subsectors: ${subRows.length} ETFs scored`);

  // ── Regime ─────────────────────────────────────────────────────────────
  const breadth = scanned ? r2((above50Count / scanned) * 100, 1) : null;
  let market_regime = 'unknown', regime_notes = 'Insufficient data for a regime read.';
  if (spyMa50 != null && spyMa200 != null && breadth != null) {
    const up = spy.price > spyMa50 && spyMa50 > spyMa200 && breadth >= 55;
    const down = spy.price < spyMa50 && spy.price < spyMa200 && breadth <= 45;
    market_regime = up ? 'uptrend' : down ? 'downtrend' : 'choppy';
    regime_notes = `SPY $${spy.price} vs 50-day $${r2(spyMa50)} / 200-day $${r2(spyMa200)}; ` +
      `${breadth}% of ${scanned} scanned stocks above their 50-day; ` +
      `VIX ${vixLast != null ? vixLast : 'unavailable'}.`;
  }

  const brief = {
    brief_date: briefDate,
    generated_at: new Date().toISOString(),
    universe: `liquid US equities — S&P 500 + Nasdaq-100${QUICK ? '' : ' + Russell 2000'} (${scanned} scanned)`,
    market_regime,
    regime_notes,
    breakout_candidates: candidates,
    dte_focus: { zero_dte: stripVol(zeroDte), one_dte: stripVol(oneDte) },
    sectors: {
      hot: hot.map(({ delta, ...r }) => r),
      weak: weak.map(({ delta, ...r }) => r),
    },
    subsectors: {
      hot: subHot,
      weak: subWeak,
    },
    rotation_notes,
  };

  writeJsonAtomic(path.join(OUT_DIR, 'daily-brief.json'), brief);
  console.log(`[brief] done: ${candidates.length} breakout candidates, regime=${market_regime}`);
}

main().catch((e) => {
  console.error(`[brief] FATAL: ${e.message}`);
  process.exit(1);
});
