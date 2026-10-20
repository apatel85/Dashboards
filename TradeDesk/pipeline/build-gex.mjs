#!/usr/bin/env node
/**
 * build-gex.mjs — gamma exposure (GEX) from Yahoo option chains.
 *
 * For each watchlist ticker, fetches 3 expiries (0DTE, ~7d, ~14d) and
 * computes per-strike dealer gamma exposure. Yahoo publishes no Greeks,
 * so gamma comes from Black-Scholes using the chain's own implied vol —
 * the standard free-data approach.
 *
 *   GEX ($M per 1% move) = gamma × OI × 100 × S² × 0.01 / 1e6
 *   sign: calls +, puts − (dealer exposure assuming customers long calls)
 *
 * Per expiry the script reports: net/call/put GEX, gamma flip strike,
 * magnet strike (max |net|), call/put walls, top strikes, and plain-English
 * bullets ("if price is near X, watch for ...").
 *
 * Change detection: compares against the previous gex.json in $OUT_DIR and
 * writes gex-changes.json (flips, surges, wall moves) for the alert system.
 *
 * Watchlist = top SIGNAL_WATCHLIST_N signal tickers + SPY + QQQ
 *             + $GEX_EXTRA_TICKERS (comma-separated).
 *
 * $0, keyless (Yahoo crumb flow via pipeline/lib/yahoo.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooOptions, yahooChart } from './lib/yahoo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const RISK_FREE = 0.04;
const SIGNAL_N = parseInt(process.env.GEX_SIGNAL_N || '12', 10) || 12;
// Index proxies for the futures the user trades: SPX gamma ≈ ES gamma
// (ES tracks SPX tick-for-tick), QQQ×40 ≈ NQ (QQQ = Nasdaq-100 / 40).
const ALWAYS = ['^SPX', 'QQQ'];
const PROXY = {
  '^SPX': { futures: 'ES', scale: 1, note: 'SPX index gamma as ES proxy — ES tracks SPX tick-for-tick; CME ES options have no free feed.' },
  'QQQ': { futures: 'NQ', scale: 40, note: 'QQQ gamma ×40 as NQ proxy (QQQ = Nasdaq-100/40); CME NQ options have no free feed.' },
};
const EXTRA = String(process.env.GEX_EXTRA_TICKERS || '')
  .split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{1,5}$/.test(s));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Black-Scholes gamma per $1 move in the underlying. */
function bsGamma(S, K, T, r, sigma) {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0 && sigma < 5)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const phi = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return phi / (S * sigma * sqrtT);
}

function fmtM(x) {
  const a = Math.abs(x);
  const v = a >= 100 ? a.toFixed(0) : a.toFixed(1);
  return `${x < 0 ? '−' : ''}$${v}M`;
}

function pct(from, to) {
  return `${((to - from) / from * 100).toFixed(1)}%`;
}

function isoDay(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Median sane IV among strikes near the money — fallback when Yahoo's IV is a placeholder. */
function atmIv(contracts, S) {
  const vs = [];
  for (const c of contracts) {
    const iv = c.impliedVolatility || 0;
    if (iv > 0.05 && iv < 3 && Math.abs(c.strike - S) / S < 0.03) vs.push(iv);
  }
  if (!vs.length) return 0.25;
  vs.sort((a, b) => a - b);
  return vs[Math.floor(vs.length / 2)];
}

/**
 * Years from now to the closing bell on expiry day. Yahoo's expiry timestamp
 * is midnight UTC at the START of the expiry date; US equity options stop
 * trading at 16:00 ET that day = 20:00 UTC (EDT) / 21:00 UTC (EST).
 * We use EDT (Mar–Nov); the 1h EST difference is immaterial. Floored at 1h.
 */
function yearsToExpiry(expTs, nowSec) {
  const closeSec = expTs + 20 * 3600;
  return Math.max((closeSec - nowSec) / 31536000, 1 / 8760);
}

/**
 * Vol actually used for gamma. Yahoo's IV feed glitches (1e-05 placeholders,
 * stray 3% prints on 0DTE); anything below 8% is treated as a bad print and
 * floored — listed-equity 0DTE IV under 8% is not credible and it makes gamma
 * underflow to zero even at the money.
 */
function saneVol(iv, fallback) {
  const v = iv > 0.05 && iv < 3 ? iv : fallback > 0.05 && fallback < 3 ? fallback : 0.25;
  return Math.max(v, 0.08);
}

const round2 = (x) => Math.round(x * 100) / 100;

/** ET calendar day + hour for "is this bar still forming?" checks. */
function etParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(ms));
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return { day: `${o.year}-${o.month}-${o.day}`, hour: parseInt(o.hour, 10) };
}

/**
 * Support/resistance from daily price action, merged with gamma levels.
 * Confluence of independent methods (price action + gamma) = strong level.
 * Returns [{price, type, strength, sources[]}] sorted by distance from spot.
 */
function computeLevels(chartJson, S, gamma) {
  try {
    const r = chartJson?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    const ts = r?.timestamp;
    if (!q || !ts || ts.length < 20) return [];
    const n = ts.length;
    const H = q.high, L = q.low, C = q.close;
    const cands = [];
    const push = (price, source) => {
      if (price > 0 && Math.abs(price - S) / S < 0.15) cands.push({ price: round2(price), source });
    };
    // swing highs/lows: local extrema over ±3 sessions across last 60 bars
    const W = 3, lookback = Math.min(60, n);
    for (let i = n - lookback + W; i < n - W; i++) {
      if (!(H[i] > 0 && L[i] > 0)) continue;
      let isHi = true, isLo = true;
      for (let j = i - W; j <= i + W; j++) {
        if (j === i || !(H[j] > 0)) continue;
        if (H[j] > H[i]) isHi = false;
        if (L[j] < L[i]) isLo = false;
        if (!isHi && !isLo) break;
      }
      if (isHi) push(H[i], 'swing high');
      if (isLo) push(L[i], 'swing low');
    }
    // 20d / 50d extremes
    const seg = (arr, k) => arr.slice(Math.max(0, n - k)).filter((x) => x > 0);
    push(Math.max(...seg(H, 20)), '20d high');
    push(Math.min(...seg(L, 20)), '20d low');
    if (n >= 50) { push(Math.max(...seg(H, 50)), '50d high'); push(Math.min(...seg(L, 50)), '50d low'); }
    // previous completed session H/L/C
    const nowET = etParts(Date.now()), lastET = etParts(ts[n - 1] * 1000);
    const forming = lastET.day === nowET.day && nowET.hour < 16;
    const pb = forming ? n - 2 : n - 1;
    if (pb >= 0 && H[pb] > 0) {
      push(H[pb], 'prev high'); push(L[pb], 'prev low'); push(C[pb], 'prev close');
    }
    // round numbers near spot
    const mag = Math.pow(10, Math.floor(Math.log10(S)));
    for (const step of [mag / 20, mag / 10]) {
      const base = Math.round(S / step) * step;
      for (const m of [base - step, base, base + step]) push(m, 'round number');
    }
    // gamma levels from the front expiry
    if (gamma) {
      push(gamma.call_wall, 'call wall');
      push(gamma.put_wall, 'put wall');
      if (gamma.flip_strike) push(gamma.flip_strike, 'gamma flip');
      push(gamma.magnet_strike, 'gamma magnet');
    }
    // cluster: highest-priority source anchors the level; window 0.6%, no chaining
    const PRI = {
      'gamma magnet': 0, 'call wall': 1, 'put wall': 1, 'gamma flip': 2,
      'prev high': 3, 'prev low': 3, 'prev close': 3,
      '20d high': 4, '20d low': 4, '50d high': 4, '50d low': 4,
      'swing high': 5, 'swing low': 5, 'round number': 6,
    };
    const sorted = cands.sort((a, b) => (PRI[a.source] ?? 7) - (PRI[b.source] ?? 7) || a.price - b.price);
    const clusters = [];
    for (const c of sorted) {
      const hit = clusters.find((cl) => Math.abs(c.price - cl.price) / cl.price < 0.006);
      if (hit) {
        if (!hit.sources.includes(c.source)) hit.sources.push(c.source);
      } else {
        clusters.push({ price: c.price, sources: [c.source] });
      }
    }
    const GAMMA_SRC = new Set(['call wall', 'put wall', 'gamma flip', 'gamma magnet']);
    return clusters
      .map((cl) => {
        const g = cl.sources.filter((s) => GAMMA_SRC.has(s)).length;
        const pa = cl.sources.length - g;
        const strength = (cl.sources.length >= 3 || (g >= 1 && pa >= 1)) ? 'strong'
          : cl.sources.length >= 2 ? 'moderate' : 'weak';
        const type = cl.price < S * 0.9975 ? 'support' : cl.price > S * 1.0025 ? 'resistance' : 'pivot';
        return { price: cl.price, type, strength, sources: cl.sources };
      })
      .sort((a, b) => {
        const rank = { strong: 0, moderate: 1, weak: 2 };
        return rank[a.strength] - rank[b.strength] || Math.abs(a.price - S) - Math.abs(b.price - S);
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** Day-trading bullets for the nearest key levels: rebound vs continuation. */
function levelBullets(levels, S) {
  const out = [];
  const sup = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);
  const res = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);
  const s0 = sup.find((l) => l.strength === 'strong') || sup[0];
  const r0 = res.find((l) => l.strength === 'strong') || res[0];
  if (s0) {
    const next = sup.find((l) => l.price < s0.price - 0.01);
    const flip = s0.sources.includes('gamma flip');
    out.push(
      `Key support $${s0.price} (${s0.sources.join(' + ')}, ${pct(S, s0.price)} below)${s0.strength === 'strong' ? ' — STRONG' : ''}: ` +
      `expect a rebound attempt while it holds; a clean break below ${flip ? 'flips dealer gamma negative — the selloff can accelerate' : 'opens the next leg down'}` +
      `${next ? ` toward $${next.price}` : ''}.`
    );
  }
  if (r0) {
    const next = res.find((l) => l.price > r0.price + 0.01);
    const flip = r0.sources.includes('gamma flip');
    out.push(
      `Key resistance $${r0.price} (${r0.sources.join(' + ')}, ${pct(S, r0.price)} above)${r0.strength === 'strong' ? ' — STRONG' : ''}: ` +
      `expect sellers / a stall on the first test; a clean break above ${flip ? 'flips dealer gamma positive — the uptrend can accelerate' : 'opens the next leg up'}` +
      `${next ? ` toward $${next.price}` : ''}.`
    );
  }
  return out;
}

/** Pick 3 expiries: nearest (0DTE), nearest ≥7d, nearest ≥14d. */
function pickExpiries(dates, nowSec) {
  const sorted = [...dates].sort((a, b) => a - b).filter((d) => d >= nowSec - 86400);
  if (!sorted.length) return [];
  const out = [sorted[0]];
  for (const target of [7, 14]) {
    const hit = sorted.find((d) => (d - nowSec) / 86400 >= target);
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** Day-trading regime: 0DTE sign leads (it drives today's hedging), back-tenor
 *  agreement sets confidence. 0DTE nets are jumpy — a lone 0DTE against the
 *  term structure is 'contested', not a signal. */
function regimeOf(expiries) {
  if (!expiries.length) return { direction: 'neutral', confidence: 'low', bullet: '' };
  const s0 = Math.abs(expiries[0].net_gex) > 1 ? Math.sign(expiries[0].net_gex) : 0;
  const back = expiries.slice(1)
    .map((e) => (Math.abs(e.net_gex) > 1 ? Math.sign(e.net_gex) : 0))
    .filter((s) => s !== 0);
  if (s0 === 0) {
    return { direction: 'neutral', confidence: 'low', bullet: 'Dealer gamma near zero into today — no strong positioning edge; trade the levels.' };
  }
  const dir = s0 < 0 ? 'short' : 'long';
  const agree = back.filter((s) => s === s0).length;
  const disagree = back.filter((s) => s !== s0).length;
  let confidence = 'leaning';
  if (back.length && disagree === 0) confidence = 'firm';
  else if (disagree > agree) confidence = 'contested';
  const word = dir === 'short' ? 'SHORT' : 'LONG';
  const read = dir === 'short'
    ? 'intraday moves can accelerate in either direction — breakouts/breakdowns extend'
    : 'expect choppy, pinned price action — fades at the walls tend to work';
  const ctx = confidence === 'firm'
    ? `firm — ${dir} across ${expiries.length} expiries`
    : confidence === 'contested'
      ? `contested — today says ${dir} but back tenors disagree; size accordingly`
      : 'leaning — back tenors mixed';
  return {
    direction: dir,
    confidence,
    bullet: `Dealer gamma TODAY: ${word} (${ctx}). ${read[0].toUpperCase()}${read.slice(1)}.`,
  };
}

function buildBullets(S, e) {
  const b = [];
  const expLabel = e.dte === 0 ? 'today' : `the ${e.expiry} expiry`;
  // 1) regime
  if (e.net_gex >= 0) {
    b.push(`Dealers are long gamma into ${expLabel} (${fmtM(e.net_gex)}) — expect choppy, pinned price action; big gamma strikes act as magnets.`);
  } else {
    b.push(`Dealers are short gamma into ${expLabel} (${fmtM(e.net_gex)}) — moves can accelerate in either direction; watch the walls below.`);
  }
  // 2) magnet — skipped when it coincides with a wall (covered below)
  const mOff = Math.abs(S - e.magnet_strike) / S;
  const magnetIsWall = e.magnet_strike === e.call_wall || e.magnet_strike === e.put_wall;
  if (!magnetIsWall) {
    if (mOff < 0.005) {
      b.push(`Price is sitting right on the max-gamma strike $${e.magnet_strike} — pinning is in effect into expiry.`);
    } else {
      b.push(`Heaviest gamma sits at $${e.magnet_strike} (${pct(S, e.magnet_strike)} ${e.magnet_strike > S ? 'above' : 'below'}) — price tends to gravitate there into expiry.`);
    }
  }
  // 3+4) walls — merged when they coincide
  if (e.call_wall === e.put_wall) {
    const w = e.call_wall;
    if (w > S * 1.005) {
      b.push(`Gamma wall at $${w} (${pct(S, w)} above, max call + put gamma) — rallies may stall there; a break above can trigger dealer buying and a fast upside move.`);
    } else if (w < S * 0.995) {
      b.push(`Gamma wall at $${w} (${pct(S, w)} below, max call + put gamma) — dips may find support there; a break below can trigger dealer selling and a fast downside move.`);
    } else {
      b.push(`Price is pinned at the $${w} gamma wall (max call + put gamma) — expect chop; a break either way invites acceleration.`);
    }
  } else {
    // 3) call wall
    if (e.call_wall > S * 1.005) {
      b.push(`Call wall at $${e.call_wall} (${pct(S, e.call_wall)} above) — rallies may stall there; a break above can trigger dealer buying and a fast upside move.`);
    } else if (e.call_wall >= S * 0.995) {
      b.push(`Price is pressed against the $${e.call_wall} call wall — a push through invites upside acceleration.`);
    }
    // 4) put wall
    if (e.put_wall < S * 0.995) {
      b.push(`Put wall at $${e.put_wall} (${pct(S, e.put_wall)} below) — dips may find support there; a break below can trigger dealer selling and a fast downside move.`);
    } else if (e.put_wall <= S * 1.005) {
      b.push(`Price is sitting on the $${e.put_wall} put wall — a slip below invites downside acceleration.`);
    }
  }
  // 5) flip
  if (e.flip_strike && e.flip_strike < S) {
    b.push(`Gamma flips negative below $${e.flip_strike} — a drop through there opens downside air.`);
  }
  return b.slice(0, 5);
}

async function gexForTicker(ticker) {
  const head = await yahooOptions(ticker);
  if (!head || !head.expirationDates?.length) throw new Error('no expirations');
  const quote = head.quote || {};
  const S = quote.regularMarketPrice;
  if (!(S > 0)) throw new Error('no spot price');
  const nowSec = Date.now() / 1000;
  const expiries = pickExpiries(head.expirationDates, nowSec);
  const out = { ticker, spot: Math.round(S * 100) / 100, expiries: [] };
  for (const expTs of expiries) {
    const chain = await yahooOptions(ticker, { date: expTs });
    const node = chain?.options?.[0];
    if (!node) continue;
    const dte = Math.max(0, Math.round((expTs - nowSec) / 86400));
    // T in years to the closing bell; Yahoo IV is a 1e-05 placeholder away
    // from the money, so fall back to the expiry's ATM vol there.
    const T = yearsToExpiry(expTs, nowSec);
    const fallbackIv = atmIv([...(node.calls || []), ...(node.puts || [])], S);
    const byStrike = new Map();
    for (const [contracts, sign] of [[node.calls || [], 1], [node.puts || [], -1]]) {
      for (const c of contracts) {
        const K = c.strike, oi = c.openInterest || 0;
        if (!(K > 0) || oi <= 0) continue;
        const sigma = saneVol(c.impliedVolatility || 0, fallbackIv);
        const g = bsGamma(S, K, T, RISK_FREE, sigma);
        if (!(g > 0)) continue;
        const gex = sign * g * oi * 100 * S * S * 0.01 / 1e6; // $M per 1% move
        let s = byStrike.get(K);
        if (!s) { s = { k: K, call: 0, put: 0 }; byStrike.set(K, s); }
        if (sign > 0) s.call += gex; else s.put += gex;
      }
    }
    if (!byStrike.size) continue;
    const strikes = [...byStrike.values()].map((s) => ({ ...s, net: s.call + s.put }));
    let call_gex = 0, put_gex = 0;
    for (const s of strikes) { call_gex += s.call; put_gex += s.put; }
    const net_gex = call_gex + put_gex;
    const byK = [...strikes].sort((a, b) => a.k - b.k);
    // flip: strike nearest the spot where cumulative net gamma changes sign
    let flip_strike = null;
    {
      let cum = 0, best = Infinity;
      for (const s of byK) {
        const prev = cum;
        cum += s.net;
        if ((prev < 0 && cum >= 0) || (prev > 0 && cum <= 0)) {
          const d = Math.abs(s.k - S);
          if (d < best) { best = d; flip_strike = s.k; }
        }
      }
      // a flip far from the spot is noise, not a tradable level
      if (flip_strike && Math.abs(flip_strike - S) / S > 0.05) flip_strike = null;
    }
    const magnet = strikes.reduce((a, b) => (Math.abs(b.net) > Math.abs(a.net) ? b : a));
    const callWall = strikes.reduce((a, b) => (b.call > a.call ? b : a));
    const putWall = strikes.reduce((a, b) => (b.put < a.put ? b : a)); // put gex is negative
    const top = [...strikes].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 12)
      .map((s) => ({ k: s.k, call: Math.round(s.call * 10) / 10, put: Math.round(s.put * 10) / 10, net: Math.round(s.net * 10) / 10 }));
    const e = {
      expiry: isoDay(expTs), dte,
      net_gex: Math.round(net_gex * 10) / 10,
      call_gex: Math.round(call_gex * 10) / 10,
      put_gex: Math.round(put_gex * 10) / 10,
      flip_strike, magnet_strike: magnet.k,
      call_wall: callWall.k, put_wall: putWall.k,
      strikes: top,
      bullets: [],
    };
    e.bullets = buildBullets(S, e);
    out.expiries.push(e);
  }
  // support/resistance with gamma confluence (front-expiry gamma)
  const front = out.expiries[0] || null;
  try {
    const chart = await yahooChart(ticker, { interval: '1d', range: '3mo' });
    out.levels = computeLevels(chart, S, front);
    out.level_bullets = levelBullets(out.levels, S);
  } catch (e2) {
    console.warn(`[gex] ${ticker} chart/levels failed: ${e2.message}`);
    out.levels = [];
    out.level_bullets = [];
  }
  out.regime = regimeOf(out.expiries);
  return out;
}

function loadPrev() {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, 'gex.json'), 'utf8'));
  } catch { return null; }
}

function detectChanges(prev, curr) {
  const changes = [];
  if (!prev?.tickers) return changes;
  for (const [ticker, c] of Object.entries(curr.tickers)) {
    const p = prev.tickers[ticker];
    const ce = c.expiries[0], pe = p?.expiries?.[0];
    if (!ce) continue;
    if (!pe) {
      changes.push({ ticker, expiry: ce.expiry, type: 'new', detail: `${ticker} entered gamma coverage (net ${fmtM(ce.net_gex)} into ${ce.expiry}).`, rank: 3 });
      continue;
    }
    // regime flip on the day-trading read (0DTE-led, term-structure confirmed)
    const cr = c.regime?.direction, pr = p?.regime?.direction;
    if (cr && pr && cr !== pr && cr !== 'neutral' && pr !== 'neutral') {
      const conf = c.regime.confidence === 'firm' ? ' — firm across expiries' : c.regime.confidence === 'contested' ? ' (contested — back tenors disagree)' : '';
      changes.push({ ticker, expiry: ce.expiry, type: 'flip', detail: `${ticker}: dealer gamma regime flipped ${pr.toUpperCase()} → ${cr.toUpperCase()}${conf} — watch for ${cr === 'short' ? 'accelerated' : 'pinned'} moves.`, rank: 1 });
      continue;
    }
    // wall moves
    for (const side of ['call_wall', 'put_wall']) {
      if (ce[side] && pe[side] && ce[side] !== pe[side]) {
        changes.push({ ticker, expiry: ce.expiry, type: 'wall_move', detail: `${ticker}: ${side === 'call_wall' ? 'call' : 'put'} wall moved $${pe[side]} → $${ce[side]}.`, rank: 3 });
      }
    }
  }
  for (const ticker of Object.keys(prev.tickers)) {
    if (!curr.tickers[ticker]) {
      changes.push({ ticker, expiry: null, type: 'gone', detail: `${ticker} dropped out of gamma coverage.`, rank: 4 });
    }
  }
  const rankOrder = { flip: 1, swing: 2, wall_move: 3, new: 3, gone: 4 };
  return changes.sort((a, b) => (rankOrder[a.type] ?? 5) - (rankOrder[b.type] ?? 5));
}

async function main() {
  const signals = JSON.parse(readFileSync(join(OUT_DIR, 'signals.json'), 'utf8'));
  const sigTickers = (signals.tickers || []).slice(0, SIGNAL_N).map((t) => t.ticker);
  const watchlist = [...new Set([...ALWAYS, ...sigTickers, ...EXTRA])];
  console.log(`[gex] watchlist (${watchlist.length}): ${watchlist.join(', ')}`);

  const prev = loadPrev();
  const tickers = {};
  let ok = 0, fail = 0;
  for (const t of watchlist) {
    try {
      const g = await gexForTicker(t);
      if (!g.expiries.length) throw new Error('no usable expiries');
      if (PROXY[t]) {
        g.proxy_for = PROXY[t].futures;
        g.proxy_scale = PROXY[t].scale;
        g.proxy_note = PROXY[t].note;
      }
      tickers[t] = g;
      ok++;
      const f = g.expiries[0];
      console.log(`[gex] ${t} spot=$${g.spot} 0DTE net=${fmtM(f.net_gex)} regime=${g.regime.direction}/${g.regime.confidence} walls C${f.call_wall}/P${f.put_wall}`);
    } catch (e) {
      fail++;
      console.warn(`[gex] ${t} FAILED: ${e.message}`);
    }
    await sleep(400);
  }
  if (ok === 0) throw new Error('all tickers failed — aborting, keeping previous gex.json');

  const curr = {
    computed_at: new Date().toISOString(),
    risk_free: RISK_FREE,
    formula: 'GEX ($M per 1% move) = BSgamma × OI × 100 × S² × 0.01 / 1e6; calls +, puts −',
    watchlist,
    tickers,
  };
  const changes = detectChanges(prev, curr);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'gex.json'), JSON.stringify(curr));
  writeFileSync(join(OUT_DIR, 'gex-changes.json'), JSON.stringify({
    computed_at: curr.computed_at,
    prev_computed_at: prev?.computed_at ?? null,
    changes,
  }));
  console.log(`[gex] wrote gex.json (${ok} ok, ${fail} failed), ${changes.length} changes detected`);
}

main().catch((e) => {
  console.error('[gex] FATAL', e.message);
  process.exit(1);
});
