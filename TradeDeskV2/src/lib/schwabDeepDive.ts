import { supabase } from './supabase';
import { SCHWAB_PROXY_URL, SCHWAB_AUTH_START_URL } from './useSchwabLive';

export { SCHWAB_AUTH_START_URL };

/**
 * On-demand Deep Dive — live Schwab data for one ticker, analysed in the
 * browser. Separate from the scheduled agentic research: this is real-time
 * market + options data (quotes, 2y daily history, full option chain) plus
 * the app's own pipeline data, with deterministic plain-English takeaways
 * computed from the numbers. No LLM prose — the verdicts are rules over
 * verified data, so they can never hallucinate a price or a level.
 *
 * Auth is the signed-in Supabase session JWT, same as live polling. The
 * Schwab proxy key is NEVER sent from the browser.
 */

export interface DeepDiveQuote {
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  avgVolume10d: number | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  divYield: number | null;
}

export interface Candle {
  date: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChainContract {
  strike: number;
  expiry: string; // YYYY-MM-DD
  dte: number;
  type: 'CALL' | 'PUT';
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark: number | null;
  iv: number | null; // decimal, e.g. 0.45 = 45%
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
}

export interface DeepDiveOptions {
  underlying: number | null;
  nearestExpiry: string | null;
  nearestDte: number | null;
  atmIv: number | null; // decimal
  putCallOi: number | null;
  putCallVol: number | null;
  maxPain: number | null;
  callWall: number | null;
  putWall: number | null;
  contracts: number;
}

export interface DeepDiveTechnicals {
  sma50: number | null;
  sma200: number | null;
  trend: 'uptrend' | 'downtrend' | 'mixed' | 'unknown';
  atr14: number | null;
  atrPct: number | null;
  rs3m: number | null; // ticker 3-mo return minus SPY 3-mo return, in pp
  rs6m: number | null;
  rangePct: number | null; // where price sits in its 52-wk range, 0-100
  volVsAvg: number | null; // today's volume / 3-mo avg volume
  hv30: number | null; // 30-day realised vol, annualised decimal
}

export interface DeepDiveData {
  ticker: string;
  quote: DeepDiveQuote;
  history: Candle[];
  spyHistory: Candle[];
  chain: ChainContract[];
  options: DeepDiveOptions;
  technicals: DeepDiveTechnicals;
  fetchedAt: string;
}

export type DeepDiveErrorCode = 'no-session' | 'reauth' | 'not-found' | 'fetch';
export class DeepDiveError extends Error {
  code: DeepDiveErrorCode;
  constructor(code: DeepDiveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const s = values.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}

function atr(candles: Candle[], n = 14): number | null {
  if (candles.length < n + 1) return null;
  let sum = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  return sum / n;
}

/** Annualised realised vol from daily closes (decimal, e.g. 0.35 = 35%). */
function realisedVol(closes: number[], days = 30): number | null {
  if (closes.length < days + 1) return null;
  const rets: number[] = [];
  const slice = closes.slice(-(days + 1));
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function periodReturn(closes: number[], days: number): number | null {
  if (closes.length < days + 1) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - days];
  if (!then) return null;
  return (now - then) / then;
}

function parseQuote(json: unknown, ticker: string): DeepDiveQuote {
  const root = (json as Record<string, unknown>) ?? {};
  // Proxy aliases quotes back under the caller's form; fall back to any key.
  const entry = (root[ticker] ?? root[ticker.replace('-', '/')] ?? Object.values(root)[0] ?? {}) as Record<string, unknown>;
  const q = (entry.quote ?? {}) as Record<string, unknown>;
  const f = (entry.fundamental ?? {}) as Record<string, unknown>;
  const price = num(q.lastPrice);
  const shares = num(f.sharesOutstanding);
  return {
    price,
    prevClose: num(q.closePrice),
    changePct: num(q.netPercentChange),
    dayHigh: num(q.highPrice),
    dayLow: num(q.lowPrice),
    // Schwab's keys are 52WeekHigh/52WeekLow (not the 52Wk form).
    week52High: num(q['52WeekHigh']),
    week52Low: num(q['52WeekLow']),
    bid: num(q.bidPrice),
    ask: num(q.askPrice),
    volume: num(q.totalVolume),
    avgVolume10d: num(f.avg10DaysVolume),
    // No marketCap field — price × shares outstanding.
    marketCap: price != null && shares != null ? price * shares : null,
    peRatio: num(f.peRatio),
    eps: num(f.eps),
    divYield: num(f.dividendYield),
  };
}

function parseHistory(json: unknown): Candle[] {
  const candles = ((json as { candles?: unknown[] })?.candles ?? []) as Record<string, unknown>[];
  return candles
    .map((c) => ({
      date: typeof c.datetime === 'number' ? c.datetime : 0,
      open: num(c.open) ?? 0,
      high: num(c.high) ?? 0,
      low: num(c.low) ?? 0,
      close: num(c.close) ?? 0,
      volume: num(c.volume) ?? 0,
    }))
    .filter((c) => c.date > 0 && c.close > 0)
    .sort((a, b) => a.date - b.date);
}

function parseChain(json: unknown): ChainContract[] {
  const out: ChainContract[] = [];
  const root = (json as Record<string, unknown>) ?? {};
  for (const mapKey of ['callExpDateMap', 'putExpDateMap']) {
    const expMap = (root[mapKey] ?? {}) as Record<string, Record<string, Record<string, unknown>[]>>;
    for (const [expKey, strikes] of Object.entries(expMap)) {
      const expiry = expKey.split(':')[0];
      for (const contracts of Object.values(strikes)) {
        for (const c of contracts) {
          const dte = num(c.daysToExpiration);
          out.push({
            strike: num(c.strikePrice) ?? 0,
            expiry,
            dte: dte ?? 0,
            type: c.putCall === 'PUT' ? 'PUT' : 'CALL',
            bid: num(c.bid),
            ask: num(c.ask),
            last: num(c.last),
            mark: num(c.mark),
            // Schwab reports IV as a percent (96.758 = 96.758%) — to decimal.
            iv: num(c.volatility) != null ? (num(c.volatility) as number) / 100 : null,
            delta: num(c.delta),
            gamma: num(c.gamma),
            theta: num(c.theta),
            vega: num(c.vega),
            openInterest: num(c.openInterest) ?? 0,
            volume: num(c.volume) ?? 0,
            inTheMoney: c.inTheMoney === true,
          });
        }
      }
    }
  }
  return out;
}

function analyseOptions(contracts: ChainContract[], underlying: number | null): DeepDiveOptions {
  const base: DeepDiveOptions = {
    underlying, nearestExpiry: null, nearestDte: null, atmIv: null,
    putCallOi: null, putCallVol: null, maxPain: null, callWall: null, putWall: null,
    contracts: contracts.length,
  };
  if (!contracts.length || underlying == null) return base;
  const expiries = [...new Set(contracts.map((c) => c.expiry))].sort();
  // Nearest expiry with at least 1 day to go (today's expiry is noise for IV).
  const nearest = contracts.filter((c) => c.dte >= 1);
  const nearList = nearest.length ? nearest : contracts;
  const nearestExpiry = [...new Set(nearList.map((c) => c.expiry))].sort()[0];
  const near = contracts.filter((c) => c.expiry === nearestExpiry);
  base.nearestExpiry = nearestExpiry;
  base.nearestDte = near[0]?.dte ?? null;
  // ATM IV: average call+put IV at the strike nearest the underlying.
  const strikes = [...new Set(near.map((c) => c.strike))].sort((a, b) => a - b);
  const atm = strikes.reduce((best, s) => (Math.abs(s - underlying) < Math.abs(best - underlying) ? s : best), strikes[0]);
  const atmContracts = near.filter((c) => c.strike === atm && c.iv != null);
  if (atmContracts.length) {
    base.atmIv = atmContracts.reduce((a, c) => a + (c.iv ?? 0), 0) / atmContracts.length;
  }
  // Put/call ratios over the nearest two expiries (more contracts = stabler).
  const nearTwo = expiries.slice(0, 2);
  const two = contracts.filter((c) => nearTwo.includes(c.expiry));
  const callOi = two.filter((c) => c.type === 'CALL').reduce((a, c) => a + c.openInterest, 0);
  const putOi = two.filter((c) => c.type === 'PUT').reduce((a, c) => a + c.openInterest, 0);
  const callVol = two.filter((c) => c.type === 'CALL').reduce((a, c) => a + c.volume, 0);
  const putVol = two.filter((c) => c.type === 'PUT').reduce((a, c) => a + c.volume, 0);
  if (callOi > 0) base.putCallOi = putOi / callOi;
  if (callVol > 0) base.putCallVol = putVol / callVol;
  // Max pain for the nearest expiry: strike minimising total intrinsic payout.
  let bestStrike: number | null = null;
  let bestPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const c of near) {
      if (c.type === 'CALL') pain += c.openInterest * Math.max(underlying - s, 0);
      else pain += c.openInterest * Math.max(s - underlying, 0);
    }
    if (pain < bestPain) { bestPain = pain; bestStrike = s; }
  }
  base.maxPain = bestStrike;
  // Walls: strikes with the most open interest per side (nearest expiry).
  const maxOi = (type: 'CALL' | 'PUT') => {
    let best: { strike: number; oi: number } | null = null;
    for (const c of near) {
      if (c.type !== type) continue;
      if (!best || c.openInterest > best.oi) best = { strike: c.strike, oi: c.openInterest };
    }
    return best?.strike ?? null;
  };
  base.callWall = maxOi('CALL');
  base.putWall = maxOi('PUT');
  return base;
}

function analyseTechnicals(
  quote: DeepDiveQuote,
  history: Candle[],
  spyHistory: Candle[],
): DeepDiveTechnicals {
  const closes = history.map((c) => c.close);
  const spyCloses = spyHistory.map((c) => c.close);
  const price = quote.price ?? closes[closes.length - 1] ?? null;
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  let trend: DeepDiveTechnicals['trend'] = 'unknown';
  if (price != null && s50 != null && s200 != null) {
    if (price > s50 && s50 > s200) trend = 'uptrend';
    else if (price < s50 && s50 < s200) trend = 'downtrend';
    else trend = 'mixed';
  }
  const a14 = atr(history, 14);
  const rs3 = periodReturn(closes, 63);
  const spyRs3 = periodReturn(spyCloses, 63);
  const rs6 = periodReturn(closes, 126);
  const spyRs6 = periodReturn(spyCloses, 126);
  return {
    sma50: s50,
    sma200: s200,
    trend,
    atr14: a14,
    atrPct: price != null && a14 != null ? (a14 / price) * 100 : null,
    rs3m: rs3 != null && spyRs3 != null ? (rs3 - spyRs3) * 100 : null,
    rs6m: rs6 != null && spyRs6 != null ? (rs6 - spyRs6) * 100 : null,
    rangePct:
      price != null && quote.week52High != null && quote.week52Low != null && quote.week52High > quote.week52Low
        ? ((price - quote.week52Low) / (quote.week52High - quote.week52Low)) * 100
        : null,
    volVsAvg:
      quote.volume != null && quote.avgVolume10d != null && quote.avgVolume10d > 0
        ? quote.volume / quote.avgVolume10d
        : null,
    hv30: realisedVol(closes, 30),
  };
}

async function proxyFetch(jwt: string, params: URLSearchParams): Promise<unknown> {
  const res = await fetch(`${SCHWAB_PROXY_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: 'no-cache',
  });
  if (res.status === 503) {
    const body = await res.json().catch(() => null);
    if ((body as { status?: string } | null)?.status === 'reauth_needed') {
      throw new DeepDiveError('reauth', 'Schwab login expired — reconnect to refresh it.');
    }
  }
  if (res.status === 400) throw new DeepDiveError('not-found', 'Schwab has no data for that ticker.');
  if (!res.ok) throw new DeepDiveError('fetch', `Schwab proxy HTTP ${res.status}`);
  return res.json();
}

/** One-shot Deep Dive fetch: quote + 2y daily history (+SPY) + option chain. */
export async function fetchDeepDive(rawTicker: string): Promise<DeepDiveData> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.^$-]+$/.test(ticker)) {
    throw new DeepDiveError('not-found', 'Enter a valid ticker, e.g. NVDA.');
  }
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token ?? null;
  if (!jwt) throw new DeepDiveError('no-session', 'Sign in to TradeDesk first.');
  // Quote + own history are essential. SPY history (for relative strength)
  // and the option chain are best-effort — a ticker with no options, or a
  // failed SPY fetch, still gets a full dive on the other sections.
  const [quoteJson, histJson] = await Promise.all([
    proxyFetch(jwt, new URLSearchParams({ symbols: ticker })),
    proxyFetch(jwt, new URLSearchParams({ history: ticker, periodType: 'year', period: '2', frequencyType: 'daily', frequency: '1' })),
  ]);
  const [spyJson, chainJson] = await Promise.all([
    proxyFetch(jwt, new URLSearchParams({ history: 'SPY', periodType: 'year', period: '2', frequencyType: 'daily', frequency: '1' })).catch(() => null),
    proxyFetch(jwt, new URLSearchParams({ chain: ticker, strikeCount: '10', includeUnderlyingQuote: 'true' })).catch(() => null),
  ]);
  const quote = parseQuote(quoteJson, ticker);
  if (quote.price == null) throw new DeepDiveError('not-found', `Schwab returned no quote for ${ticker}.`);
  const history = parseHistory(histJson);
  const spyHistory = parseHistory(spyJson);
  const chain = parseChain(chainJson);
  const options = analyseOptions(chain, quote.price);
  const technicals = analyseTechnicals(quote, history, spyHistory);
  return { ticker, quote, history, spyHistory, chain, options, technicals, fetchedAt: new Date().toISOString() };
}
