#!/usr/bin/env node
/**
 * build-lotto.mjs — daily Top-25 lotto (0DTE/1DTE) candidate scanner.
 *
 * For each liquid optionable ticker:
 *   - finds the 0DTE and 1DTE expiries, pulls full chains (volume/OI/IV)
 *   - computes expected move (ATM straddle), unusual-activity proxy (vol/OI),
 *     cheap-IV check, gamma regime (from gex.json), Friday pin-break map
 *   - tags each candidate with one of the backtested setups (S1..S4) and only
 *     marks it "validated" if lotto-validation.json says that setup validated
 * Output: public/data/lotto.json  (+ appends to data/lotto-history.jsonl)
 * Runs in refresh.sh after build-gex (non-fatal: keeps prior file on failure).
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooSession, yahooOptions, yahooChart, resetYahooSession } from './lib/yahoo.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');

const CURATED = `SPY QQQ IWM DIA TLT XLF XLE SMH
AAPL MSFT NVDA AMZN META GOOGL TSLA AVGO NFLX AMD PLTR COIN MSTR SMCI MU SNDK INTC QCOM AMAT LRCX MRVL ARM
JPM BAC GS MS V MA PYPL
WMT COST TGT HD NKE SBUX LULU MCD
XOM CVX
LLY UNH PFE MRNA
CRM ORCL ADBE SHOP UBER ABNB DKNG RBLX SNOW DDOG CRWD PANW ZS NET
GME DIS BA CAT DE GE F GM FDX UPS
OPEN SOFI HOOD MARA RIOT CLSK`.split(/\s+/).filter(Boolean);

function etWeekdayShort(ts = Date.now() / 1000) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(ts * 1000));
}
function etDateStr(ts = Date.now() / 1000) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
}
const mid = (c) => (c.bid != null && c.ask != null && c.ask > 0 ? (c.bid + c.ask) / 2 : (c.lastPrice || 0));
const saneIV = (iv) => (iv && iv > 0.08 ? iv : null);

// Black-Scholes gamma per share and N(d1) delta — same math as build-gex.mjs
function bsGamma(S, K, T, r, sigma) {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0 && sigma < 5)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const phi = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return phi / (S * sigma * sqrtT);
}
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function bsDelta(S, K, T, r, sigma, isCall) {
  if (!(T > 0 && sigma > 0 && sigma < 5)) return isCall ? 0.5 : -0.5;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const nd1 = normCDF(d1);
  return isCall ? nd1 : nd1 - 1;
}
const yearsToExpiry = (expTs, nowSec) => Math.max(1 / 365 / 24, (expTs + 20 * 3600 - nowSec) / (365 * 24 * 3600));

// Per-strike dealer gamma for one expiry chain → flip + walls ($M per 1% move)
function gammaByStrike(calls, puts, spot, expTs, nowSec) {
  const T = yearsToExpiry(expTs, nowSec);
  const byStrike = new Map();
  const add = (list, sign) => {
    for (const c of list || []) {
      const sigma = saneIV(c.impliedVolatility);
      if (sigma == null) continue;
      const g = bsGamma(spot, c.strike, T, 0.043, sigma) * (c.openInterest || 0) * 100 * spot * spot * 0.01 / 1e6;
      if (!g) continue;
      byStrike.set(c.strike, (byStrike.get(c.strike) || 0) + sign * g);
    }
  };
  add(calls, 1); add(puts, -1);
  const strikes = [...byStrike.entries()].sort((a, b) => a[0] - b[0]);
  if (!strikes.length) return null;
  // flip: strike nearest spot where cumulative net crosses zero
  let cum = 0, flip = null, bestD = 1e9;
  for (const [k, v] of strikes) { const prev = cum; cum += v; if (prev !== 0 && Math.sign(prev) !== Math.sign(cum)) { const d = Math.abs(k - spot); if (d < bestD) { bestD = d; flip = k; } } }
  if (flip != null && Math.abs(flip - spot) / spot > 0.05) flip = null;
  let callWall = null, callWallG = 0, putWall = null, putWallG = 0, net = 0;
  for (const [k, v] of strikes) {
    net += v;
    if (Math.abs(k - spot) / spot > 0.03) continue;
    if (v > callWallG) { callWallG = v; callWall = k; }
    if (-v > putWallG) { putWallG = -v; putWall = k; }
  }
  return { net: +net.toFixed(1), flip, callWall, putWall,
    flipDistPct: flip != null ? +(((flip - spot) / spot) * 100).toFixed(2) : null };
}

// Pick the lotto strike: ~0.5× expected move OTM, nearest listed strike with a price.
// Returns premium, delta, breakeven, target (gamma wall or expected-move edge),
// intrinsic value at target and the implied multiple.
function suggestStrike(chain, spot, direction, expMovePct, expTs, nowSec, gamma) {
  if (direction !== 'CALL' && direction !== 'PUT') return null;
  if (expMovePct == null || expMovePct <= 0) return null;
  const isCall = direction === 'CALL';
  const list = (isCall ? chain.calls : chain.puts) || [];
  const aim = spot + (isCall ? 1 : -1) * 0.5 * (expMovePct / 100) * spot;
  let pick = null, bestD = 1e18;
  for (const c of list) {
    if (isCall && c.strike < spot) continue;   // keep it OTM
    if (!isCall && c.strike > spot) continue;
    const d = Math.abs(c.strike - aim);
    if (d < bestD) { bestD = d; pick = c; }
  }
  if (!pick) return null;
  const premium = mid(pick);
  if (!(premium > 0)) return null;
  const T = yearsToExpiry(expTs, nowSec);
  const sigma = saneIV(pick.impliedVolatility) || 0.4;
  const delta = bsDelta(spot, pick.strike, T, 0.043, sigma, isCall);
  const breakeven = isCall ? pick.strike + premium : pick.strike - premium;
  const breakevenPct = Math.abs(breakeven - spot) / spot * 100;
  // target: gamma wall in the trade direction if it sits BEYOND the strike and within
  // reach, else the expected-move edge (a wall between spot and strike pays nothing)
  let target = spot + (isCall ? 1 : -1) * (expMovePct / 100) * spot, targetSrc = 'expected-move edge';
  const wall = isCall ? gamma?.callWall : gamma?.putWall;
  const wallBeyond = wall != null && ((isCall && wall > pick.strike) || (!isCall && wall < pick.strike));
  if (wallBeyond && Math.abs(wall - spot) / spot * 100 <= expMovePct * 2) { target = wall; targetSrc = 'gamma wall'; }
  const intrinsic = Math.max(isCall ? target - pick.strike : pick.strike - target, 0);
  const dblMove = isCall ? (pick.strike + 2 * premium - spot) / spot * 100 : (spot - (pick.strike - 2 * premium)) / spot * 100;
  return {
    strike: pick.strike, premium: +premium.toFixed(2), delta: +delta.toFixed(2),
    breakeven: +breakeven.toFixed(2), breakeven_pct: +breakevenPct.toFixed(2),
    target: +target.toFixed(2), target_source: targetSrc,
    value_at_target: +intrinsic.toFixed(2),
    multiple_at_target: premium > 0 ? +(intrinsic / premium).toFixed(1) : null,
    move_for_2x_pct: +dblMove.toFixed(2),
  };
}

function chainStats(calls, puts, spot) {
  let callVol = 0, putVol = 0, oi = 0, atmCall = null, atmPut = null, bestC = 1e9, bestP = 1e9;
  const unusual = [];
  for (const c of calls) {
    callVol += c.volume || 0; oi += c.openInterest || 0;
    const d = Math.abs(c.strike - spot); if (d < bestC) { bestC = d; atmCall = c; }
    if ((c.volume || 0) > 2 * Math.max(c.openInterest || 0, 50) && (c.volume || 0) > 100)
      unusual.push({ strike: c.strike, side: 'call', volume: c.volume, oi: c.openInterest });
  }
  for (const c of puts) {
    putVol += c.volume || 0; oi += c.openInterest || 0;
    const d = Math.abs(c.strike - spot); if (d < bestP) { bestP = d; atmPut = c; }
    if ((c.volume || 0) > 2 * Math.max(c.openInterest || 0, 50) && (c.volume || 0) > 100)
      unusual.push({ strike: c.strike, side: 'put', volume: c.volume, oi: c.openInterest });
  }
  const straddle = atmCall && atmPut ? mid(atmCall) + mid(atmPut) : null;
  // pin: strike with max total OI within ±2% of spot
  const oiByStrike = new Map();
  for (const c of [...calls, ...puts]) {
    if (Math.abs(c.strike - spot) / spot > 0.02) continue;
    oiByStrike.set(c.strike, (oiByStrike.get(c.strike) || 0) + (c.openInterest || 0));
  }
  let pinStrike = null, pinOI = 0;
  for (const [k, v] of oiByStrike) if (v > pinOI) { pinOI = v; pinStrike = k; }
  return { callVol, putVol, oi, straddle, expMovePct: straddle ? (straddle / spot) * 100 : null, unusual: unusual.slice(0, 8), pinStrike, pinOI, atmIV: atmCall ? saneIV(atmCall.impliedVolatility) : null };
}

function loadJsonSafe(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

async function main() {
  const todayStr = etDateStr();
  const isFriday = etWeekdayShort().startsWith('Fri');
  console.log(`[lotto] ${todayStr} (${etWeekdayShort()}) — scanning`);

  const gex = loadJsonSafe(join(OUT_DIR, 'gex.json')) || {};
  const gexByTicker = {};
  for (const [k, t] of Object.entries(gex.tickers || {})) gexByTicker[k.toUpperCase()] = t;
  const validation = loadJsonSafe(join(OUT_DIR, 'lotto-validation.json')) || { setups: {} };
  const signals = loadJsonSafe(join(OUT_DIR, 'signals.json'));
  const sigTickers = (signals?.tickers || []).slice(0, 30).map((s) => s.ticker).filter(Boolean);
  const universe = [...new Set([...CURATED, ...Object.keys(gexByTicker), ...sigTickers])];
  console.log(`[lotto] universe: ${universe.length}`);

  await yahooSession();
  const cands = [];
  let n = 0;
  for (const ticker of universe) {
    n++;
    try {
      const front = await yahooOptions(ticker);
      const quote = front.quote || {};
      const spot = quote.regularMarketPrice;
      if (!spot) continue;
      const exps = (front.expirationDates || []).map(Number).sort((a, b) => a - b);
      const d0 = exps.find((e) => etDateStr(e) === todayStr);
      const d1 = exps.find((e) => etDateStr(e) > todayStr);
      if (d0 == null && d1 == null) continue;
      // reuse front chain when it matches 0DTE/1DTE
      const chains = {};
      const frontExp = Number(front.options?.[0]?.expirationDate);
      const getChain = async (e) => {
        if (e === frontExp && front.options?.[0]) return front.options[0];
        const r = await yahooOptions(ticker, { date: e });
        return r.options?.[0];
      };
      if (d0 != null) chains.d0 = { exp: d0, ...(await getChain(d0)) };
      if (d1 != null) chains.d1 = { exp: d1, ...(await getChain(d1)) };

      const s0 = chains.d0 ? chainStats(chains.d0.calls || [], chains.d0.puts || [], spot) : null;
      const s1 = chains.d1 ? chainStats(chains.d1.calls || [], chains.d1.puts || [], spot) : null;
      const prim = s0 || s1; if (!prim) continue;

      // price context (1y daily)
      let ctx = null;
      try {
        const jc = await yahooChart(ticker, { interval: '1d', range: '1y' });
        const r = jc?.chart?.result?.[0], q = r?.indicators?.quote?.[0];
        const bars = [];
        r.timestamp.forEach((ts, i) => {
          const c = q.close?.[i], h = q.high?.[i], l = q.low?.[i], v = q.volume?.[i];
          if (c != null && h != null && l != null && v != null) bars.push({ c, h, l, v });
        });
        if (bars.length > 60) {
          const last = bars[bars.length - 1], prev = bars[bars.length - 2];
          const w20 = bars.slice(-21, -1);
          const atr = w20.reduce((s, b) => s + (b.h - b.l) / b.c, 0) / 20;
          const lr = []; for (let i = bars.length - 61; i < bars.length - 1; i++) lr.push(Math.log(bars[i + 1].c / bars[i].c));
          const rv20 = Math.sqrt(lr.slice(-20).reduce((s, x, _, a) => s + (x - a.reduce((p, y) => p + y, 0) / a.length) ** 2, 0) / 20) * Math.sqrt(252);
          const rvHist = [];
          for (let k = Math.max(0, bars.length - 272); k < bars.length - 20; k += 10) {
            const seg = []; for (let i = k; i < k + 20; i++) seg.push(Math.log(bars[i + 1].c / bars[i].c));
            const m = seg.reduce((a, b) => a + b, 0) / seg.length;
            rvHist.push(Math.sqrt(seg.reduce((a, b) => a + (b - m) ** 2, 0) / seg.length) * Math.sqrt(252));
          }
          const rvRank = rvHist.length ? rvHist.filter((x) => x <= rv20).length / rvHist.length : 0.5;
          ctx = {
            prevClose: prev.c, gapPct: ((spot - prev.c) / prev.c) * 100,
            atrPct: atr * 100, rv20: +(rv20 * 100).toFixed(1), rvRank: +rvRank.toFixed(2),
            hi20: Math.max(...w20.map((b) => b.h)), lo20: Math.min(...w20.map((b) => b.l)),
            prevHigh: last.h, prevLow: last.l,
            rangeExp: ((last.h - last.l) / last.c) / atr,
            posInRange: (last.c - last.l) / Math.max(last.h - last.l, 1e-9),
            relVol: last.v / (w20.reduce((s, b) => s + b.v, 0) / 20),
          };
        }
      } catch { /* ctx stays null */ }

      const g = gexByTicker[ticker.toUpperCase()];
      const regime = g?.regime ? { label: String(g.regime.direction || '').toUpperCase(), confidence: g.regime.confidence } : null;
      const volOI = prim.oi > 0 ? (prim.callVol + prim.putVol) / prim.oi : 0;
      const expMove = s0?.expMovePct ?? s1?.expMovePct ?? null;

      // ---- per-expiry gamma for the primary chain + strike suggestion ----
      const nowSec = Date.now() / 1000;
      const primChain = s0 ? chains.d0 : chains.d1;
      const primExp = s0 ? d0 : d1;
      const gamma = primChain ? gammaByStrike(primChain.calls, primChain.puts, spot, primExp, nowSec) : null;

      // ---- setup tagging + scoring ----
      let score = 10, setup = 'MOMENTUM-WATCH', direction = 'BOTH';
      const notes = [];
      if (prim.callVol > 1.5 * Math.max(prim.putVol, 1)) { direction = 'CALL'; notes.push('call volume dominates'); }
      else if (prim.putVol > 1.5 * Math.max(prim.callVol, 1)) { direction = 'PUT'; notes.push('put volume dominates'); }
      if (volOI >= 1.0) { score += Math.min(30, volOI * 15); setup = 'UNUSUAL-FLOW'; notes.push(`unusual activity: day vol ${volOI.toFixed(1)}× open interest`); }
      if (prim.unusual.length >= 3) { score += 10; notes.push(`${prim.unusual.length} strikes trading >2× their open interest`); }
      if (expMove != null) { score += Math.min(15, expMove * 3); notes.push(`0DTE expected move ±${expMove.toFixed(2)}%`); }
      if (ctx) {
        if (ctx.gapPct >= 1 || ctx.gapPct <= -1) { score += 8; notes.push(`gap ${ctx.gapPct >= 0 ? '+' : ''}${ctx.gapPct.toFixed(1)}%`); if (Math.abs(ctx.gapPct) >= 1.5) { setup = 'IGNITION-WATCH'; direction = ctx.gapPct > 0 ? 'CALL' : 'PUT'; } }
        if (ctx.rvRank <= 0.30 && prim.atmIV != null && prim.atmIV * 100 < ctx.rv20 * 0.9) { score += 10; setup = 'CHEAP-IV'; notes.push(`cheap premium: IV ${(prim.atmIV * 100).toFixed(0)}% vs 20d realized ${ctx.rv20}%`); }
        if (ctx.relVol >= 2 && ctx.rangeExp >= 1.5) {
          score += 12; setup = 'IGNITION-WATCH';
          direction = ctx.posInRange >= 0.75 ? 'CALL' : ctx.posInRange <= 0.25 ? 'PUT' : direction;
          notes.push('volume ignition: relVol ' + ctx.relVol.toFixed(1) + '×');
        }
        if (spot > ctx.hi20) { score += 8; notes.push('breaking 20-day high'); if (setup === 'MOMENTUM-WATCH') { setup = 'IGNITION-WATCH'; direction = 'CALL'; } }
        if (spot < ctx.lo20) { score += 8; notes.push('breaking 20-day low'); if (setup === 'MOMENTUM-WATCH') { setup = 'IGNITION-WATCH'; direction = 'PUT'; } }
      }
      if (regime?.label === 'SHORT') { score += 10; notes.push('dealer gamma SHORT — moves can extend (favorable for long premium)'); }
      else if (regime?.label === 'LONG') { score -= 8; notes.push('dealer gamma LONG — expect pinning (headwind for long premium)'); }
      // Friday pin-break
      let pin = null;
      if (isFriday && prim.pinStrike != null) {
        const distPin = Math.abs(spot - prim.pinStrike) / spot * 100;
        pin = { strike: prim.pinStrike, distPct: +distPin.toFixed(2) };
        if (distPin <= 0.75 && expMove != null && expMove > distPin * 1.5) {
          score += 15; setup = 'FRIDAY-PIN';
          notes.push(`Friday pin-break watch: pinned near $${prim.pinStrike}, expected move ±${expMove.toFixed(2)}% exceeds pin distance`);
        } else if (distPin <= 0.75) {
          score += 5; notes.push(`pinned near $${prim.pinStrike} — break of pin is the lotto trigger`);
        }
      }

      const setupKey = { 'IGNITION-WATCH': 'S1_IGNITION', 'CHEAP-IV': 'S2_CHEAPIV', 'FRIDAY-PIN': 'S3_FRIDAYPIN', 'UNUSUAL-FLOW': null, 'MOMENTUM-WATCH': null }[setup];
      const v = setupKey ? validation.setups?.[setupKey] : null;
      const validated = v ? !!v.validated : null;

      // Entry trigger: a NEARBY level whose break confirms momentum — never a
      // distant 20-day extreme. For CALLs: yesterday's high if it's within 3%
      // above spot (close resistance); otherwise spot + 0.5% (continuation).
      // For PUTs: mirror with yesterday's low.
      let trigLvl;
      if (direction === 'CALL' && ctx) {
        trigLvl = (ctx.prevHigh > spot && ctx.prevHigh <= spot * 1.03)
          ? ctx.prevHigh : spot * 1.005;
      } else if (direction === 'PUT' && ctx) {
        trigLvl = (ctx.prevLow < spot && ctx.prevLow >= spot * 0.97)
          ? ctx.prevLow : spot * 0.995;
      } else {
        trigLvl = spot;
      }
      const tgtUp = g?.levels?.filter((l) => l.price > spot).slice(0, 2).map((l) => l.price) || [];
      const tgtDn = g?.levels?.filter((l) => l.price < spot).slice(0, 2).map((l) => l.price) || [];

      // gamma read for this expiry + suggested lotto strike
      let gammaNote = null;
      if (gamma) {
        const side = gamma.net >= 0 ? 'LONG' : 'SHORT';
        const flipTxt = gamma.flip != null ? `flip $${gamma.flip} (${gamma.flipDistPct >= 0 ? '+' : ''}${gamma.flipDistPct}%)` : 'no clean flip nearby';
        gammaNote = `0DTE dealer gamma ${side} ${gamma.net >= 0 ? '+' : ''}$${Math.abs(gamma.net).toFixed(0)}M/1%: ${flipTxt}` +
          (side === 'SHORT' ? ' — moves can extend past the flip' : ' — expect pinning near walls') +
          (gamma.callWall != null ? ` | call wall $${gamma.callWall}` : '') +
          (gamma.putWall != null ? ` | put wall $${gamma.putWall}` : '');
      }
      const ticket = primChain ? suggestStrike(primChain, spot, direction, expMove, primExp, nowSec, gamma) : null;

      cands.push({
        ticker, spot: +spot.toFixed(2),
        direction, setup, setup_validated: validated,
        score: Math.round(Math.min(100, Math.max(0, score))),
        entry_trigger: direction === 'BOTH'
          ? `Break of ${isFriday ? 'Friday pin $' + (prim.pinStrike ?? '—') : 'opening range'} with volume decides direction`
          : `Buy ${direction === 'CALL' ? 'call' : 'put'} on break ${direction === 'CALL' ? 'above' : 'below'} $${trigLvl.toFixed(2)} with expanding volume`,
        invalidation: direction === 'CALL' ? `fails back below $${(trigLvl * 0.995).toFixed(2)}` : direction === 'PUT' ? `reclaims above $${(trigLvl * 1.005).toFixed(2)}` : 'no follow-through within 30 min of trigger',
        targets: direction === 'CALL' ? tgtUp : direction === 'PUT' ? tgtDn : [...tgtUp, ...tgtDn],
        expected_move_pct: expMove != null ? +expMove.toFixed(2) : null,
        expiry_0dte: d0 != null ? etDateStr(d0) : null,
        expiry_1dte: d1 != null ? etDateStr(d1) : null,
        unusual: { vol_oi_ratio: +volOI.toFixed(2), hot_strikes: prim.unusual.slice(0, 5), call_vol: prim.callVol, put_vol: prim.putVol },
        iv_pct: prim.atmIV != null ? +(prim.atmIV * 100).toFixed(1) : null,
        rv20_pct: ctx?.rv20 ?? null,
        gamma_regime: regime ? `${regime.label}/${regime.confidence}` : null,
        gamma_0dte: gammaNote,
        suggested_ticket: ticket,
        friday_pin: pin,
        notes: notes.slice(0, 5),
      });
    } catch (e) {
      if (n % 20 === 0) console.log(`[lotto] ${n}/${universe.length} (skip ${ticker}: ${e.message?.slice(0, 60)})`);
    }
    if (n % 25 === 0) console.log(`[lotto] progress ${n}/${universe.length} (kept ${cands.length})`);
  }

  cands.sort((a, b) => b.score - a.score);
  const top25 = cands.slice(0, 25);
  const out = {
    generated_at: new Date().toISOString(), as_of: todayStr, is_friday: isFriday,
    universe_scanned: universe.length, candidates_considered: cands.length,
    validation_summary: Object.fromEntries(Object.entries(validation.setups || {}).map(([k, s]) => [k, { validated: s.validated, n: s.n, win_rate: s.win_rate, expectancy_net: s.expectancy_net }])),
    candidates: top25,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'lotto.json'), JSON.stringify(out, null, 1));
  // forward-tracking log
  const hist = join(ROOT, 'data', 'lotto-history.jsonl');
  try { appendFileSync(hist, JSON.stringify({ date: todayStr, is_friday: isFriday, picks: top25.map((c) => ({ ticker: c.ticker, direction: c.direction, setup: c.setup, score: c.score, spot: c.spot, exp_move: c.expected_move_pct })) }) + '\n'); } catch { }
  console.log(`[lotto] wrote lotto.json: top25 of ${cands.length} (Friday=${isFriday})`);
}
main().catch(async (e) => {
  console.error('[lotto] FATAL', e.message);
  resetYahooSession();
  process.exit(1);
});
