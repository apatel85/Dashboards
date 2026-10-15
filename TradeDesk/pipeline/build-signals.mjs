#!/usr/bin/env node
/**
 * build-signals.mjs — smart-money flow signals from disclosure data.
 *
 * Reads congress.json + executive.json (recent filings window) and ranks
 * tickers by disclosed buying/selling pressure:
 *
 *   flow_score (0-100, mechanical and explainable):
 *     magnitude  0-70: log10(|net flow $|) scaled — $1k→0, $10M→70
 *     breadth    0-20: distinct officials involved (5+ = full marks)
 *     recency    0-10: average exp(-days/14) weight of the trades
 *     cluster     +8 : 2+ officials bought the same ticker in ~7d
 *
 *   direction: accumulation | distribution | mixed
 *     accumulation: buys ≥ 1.5× sells and net ≥ $25k
 *     distribution: sells ≥ 1.5× buys and net ≤ −$25k
 *
 * Only rows with real tradeable tickers are considered (filings that name
 * no ticker can't be quoted or researched — they stay in the Congress tab's
 * By-stock view, grouped by asset name).
 *
 * Noise filter: a ticker needs ≥2 trades or |net flow| ≥ $50k to qualify.
 *
 * Writes signals.json into $OUT_DIR (default ../public/data):
 *   { generated_at, window_days, tickers: [...] } sorted by flow_score desc.
 *
 * The research agent reads this file and prioritizes top signal tickers for
 * its deep-dives, so flow and fundamentals meet in the Signals tab.
 *
 * $0, keyless, fully offline (reads the two JSON sidecars).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const WINDOW_DAYS = parseInt(process.env.SIGNAL_WINDOW_DAYS || '90', 10) || 30;

const TICKER_RE = /^[A-Z]{1,5}$/;
const DAY = 86400000;

function load(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    console.warn(`[signals] ${name} missing/unreadable — skipping`);
    return [];
  }
}

function refDate(t) {
  return t.disclosed_date || t.tx_date;
}

function daysAgo(dateStr, now) {
  const ms = Date.parse(`${dateStr}T12:00:00Z`);
  if (!isFinite(ms)) return null;
  return (now - ms) / DAY;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function main() {
  const now = Date.now();
  const congress = load('congress.json');
  const executive = load('executive.json');
  console.log(`[signals] congress=${congress.length} executive=${executive.length} window=${WINDOW_DAYS}d`);

  const per = new Map(); // ticker -> accumulators
  let rowsSeen = 0;

  for (const [rows, branch] of [[congress, 'congress'], [executive, 'executive']]) {
    for (const t of rows) {
      const ticker = String(t.ticker || '').toUpperCase();
      if (!TICKER_RE.test(ticker)) continue;
      const rd = refDate(t);
      const da = daysAgo(rd, now);
      if (da == null || da < 0 || da > WINDOW_DAYS) continue;
      rowsSeen++;
      let a = per.get(ticker);
      if (!a) {
        a = {
          ticker, asset_name: t.asset_name || ticker,
          buy_amount: 0, sell_amount: 0, buy_trades: 0, sell_trades: 0,
          officials: new Set(), congress_trades: 0, exec_trades: 0,
          wsum: 0, wbuy: 0, wsell: 0, cluster: false, latest_ref: '',
          names: new Map(),
        };
        per.set(ticker, a);
      }
      const mid = t.amount_mid != null && isFinite(t.amount_mid) ? t.amount_mid : 0;
      const w = Math.exp(-da / 14);
      a.wsum += w;
      if (t.trade_type === 'buy') { a.buy_amount += mid; a.buy_trades++; a.wbuy += w * mid; }
      else if (t.trade_type === 'sell') { a.sell_amount += mid; a.sell_trades++; a.wsell += w * mid; }
      if (t.member) a.officials.add(t.member);
      if (branch === 'congress') a.congress_trades++; else a.exec_trades++;
      if (t.cluster) a.cluster = true;
      if (rd > a.latest_ref) a.latest_ref = rd;
      const nm = String(t.asset_name || '').trim();
      if (nm) a.names.set(nm, (a.names.get(nm) || 0) + 1);
    }
  }
  console.log(`[signals] ${rowsSeen} in-window trades across ${per.size} tickers`);

  const tickers = [];
  for (const a of per.values()) {
    const trades = a.buy_trades + a.sell_trades;
    const net = a.buy_amount - a.sell_amount;
    // Noise filter: needs ≥2 trades or meaningful money.
    if (trades < 2 && Math.abs(net) < 50000) continue;

    const mag = clamp(((Math.log10(Math.abs(net) + 1) - 3) / 4) * 70, 0, 70);
    const breadth = Math.min(20, a.officials.size * 5);
    const rec = 10 * (a.wsum / Math.max(1, trades));
    const flow_score = Math.round(clamp(mag + breadth + rec + (a.cluster ? 8 : 0), 0, 100));

    let direction = 'mixed';
    if (a.buy_amount >= a.sell_amount * 1.5 && net >= 25000) direction = 'accumulation';
    else if (a.sell_amount >= a.buy_amount * 1.5 && net <= -25000) direction = 'distribution';

    let asset_name = a.asset_name;
    let best = 0;
    for (const [nm, c] of a.names) if (c > best) { best = c; asset_name = nm; }

    tickers.push({
      ticker: a.ticker,
      asset_name,
      direction,
      flow_score,
      buy_amount: Math.round(a.buy_amount),
      sell_amount: Math.round(a.sell_amount),
      net_flow: Math.round(net),
      recency_weighted_net: Math.round(a.wbuy - a.wsell),
      buy_trades: a.buy_trades,
      sell_trades: a.sell_trades,
      officials: a.officials.size,
      congress_trades: a.congress_trades,
      exec_trades: a.exec_trades,
      cluster: a.cluster,
      latest_ref_date: a.latest_ref,
    });
  }

  tickers.sort((x, y) => y.flow_score - x.flow_score || Math.abs(y.net_flow) - Math.abs(x.net_flow));

  const out = {
    generated_at: new Date(now).toISOString(),
    window_days: WINDOW_DAYS,
    tickers,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, 'signals.json');
  writeFileSync(path, JSON.stringify(out));
  console.log(`[signals] wrote ${path} — ${tickers.length} qualified tickers`);
  const acc = tickers.filter((t) => t.direction === 'accumulation').length;
  const dist = tickers.filter((t) => t.direction === 'distribution').length;
  console.log(`[signals] accumulation=${acc} distribution=${dist} mixed=${tickers.length - acc - dist}`);
  for (const t of tickers.slice(0, 8)) {
    console.log(`[signals]   ${t.ticker} ${t.direction} score=${t.flow_score} net=$${(t.net_flow / 1000).toFixed(0)}k officials=${t.officials}`);
  }
}

main();
