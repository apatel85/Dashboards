#!/usr/bin/env node
/**
 * fetch-congress.mjs — CongressInvests → data/congress.json (TradeDesk contract).
 *
 * Source: https://congressinfor-production.up.railway.app/trades/recent
 * (unofficial, no key; verified live 2026-10-14: fresh same-day data, ~5.5k
 * trades, paginate with limit/offset until an empty batch; ONLY `chamber`
 * filters server-side — ticker/member/type are filtered client-side here.)
 *
 * Output matches the TradeDesk CongressTrade[] contract exactly.
 * party/state/committee are null — the API does not provide them.
 * `cluster=true` when 2+ DISTINCT members BUY the same ticker with trade
 * dates within 7 days of each other.
 *
 * Usage: OUT_DIR=/path/to/public/data node fetch-congress.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJson } from './lib/http.mjs';
import { writeJsonAtomic, daysBetween, r2 } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const API = 'https://congressinfor-production.up.railway.app';
const PAGE = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "$1,001 - $15,000" → 8000.5 ; "$50,000" → 50000 ; garbage → null. */
function amountMid(s) {
  if (!s) return null;
  const nums = [...String(s).matchAll(/[\d,]+(?:\.\d+)?/g)]
    .map((m) => parseFloat(m[0].replace(/,/g, '')))
    .filter(Number.isFinite);
  if (nums.length >= 2) return r2((nums[0] + nums[1]) / 2);
  if (nums.length === 1) return r2(nums[0]);
  return null;
}

function normTradeType(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (t === 'buy' || t === 'purchase' || t === 'acquire') return 'buy';
  if (t === 'sell' || t === 'sale' || t === 'dispose') return 'sell';
  if (t === 'exchange') return 'exchange';
  return null;
}

async function fetchAllTrades() {
  const all = [];
  let offset = 0;
  let total = Infinity;
  for (;;) {
    const j = await fetchJson(`${API}/trades/recent?limit=${PAGE}&offset=${offset}`, {
      label: `congressinvests trades/recent offset=${offset}`,
    });
    const batch = Array.isArray(j?.trades) ? j.trades : [];
    if (typeof j?.total === 'number') total = j.total;
    console.log(`[congress] page offset=${offset}: ${batch.length} rows (total claimed ${total}, last_updated=${j?.last_updated || 'n/a'})`);
    if (!batch.length) break;
    all.push(...batch);
    offset += batch.length;
    if (offset >= 20000) {
      console.warn('[congress] safety cap hit at 20000 rows — stopping pagination');
      break;
    }
  }
  console.log(`[congress] fetched ${all.length} raw trade rows`);
  return all;
}

async function main() {
  const raw = await fetchAllTrades();

  const trades = [];
  let skipped = 0;
  for (const r of raw) {
    const ticker = String(r.ticker || '').trim().toUpperCase();
    const tx = String(r.tx_date || '').slice(0, 10);
    const disclosed = String(r.disclosed || '').slice(0, 10);
    const type = normTradeType(r.trade_type);
    if (!ticker || !DATE_RE.test(tx) || !DATE_RE.test(disclosed) || !type) {
      skipped++;
      continue;
    }
    const chamberRaw = String(r.chamber || '').toLowerCase();
    trades.push({
      member: String(r.member || '').trim() || 'Unknown member',
      chamber: chamberRaw === 'senate' ? 'Senate' : 'House',
      party: null,      // not provided by the API
      state: null,      // not provided by the API
      committee: null,  // not provided by the API
      ticker,
      asset_name: String(r.asset || '').trim() || ticker,
      trade_type: type,
      amount_range: String(r.amount || '').trim(),
      amount_mid: amountMid(r.amount),
      tx_date: tx,
      disclosed_date: disclosed,
      lag_days: daysBetween(tx, disclosed),
      doc_url: String(r.link || '').trim() || null, // official filing PDF — audit trail
      cluster: false, // computed below
    });
  }
  console.log(`[congress] normalized ${trades.length} trades, skipped ${skipped} malformed rows`);

  // Cluster detection: 2+ distinct members buying the same ticker within 7 days.
  const buysByTicker = new Map();
  for (const t of trades) {
    if (t.trade_type !== 'buy') continue;
    if (!buysByTicker.has(t.ticker)) buysByTicker.set(t.ticker, []);
    buysByTicker.get(t.ticker).push(t);
  }
  let clusteredTickers = 0;
  for (const [ticker, buys] of buysByTicker) {
    let hit = false;
    for (let i = 0; i < buys.length && !hit; i++) {
      for (let j = i + 1; j < buys.length; j++) {
        if (buys[i].member !== buys[j].member && Math.abs(daysBetween(buys[i].tx_date, buys[j].tx_date)) <= 7) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      clusteredTickers++;
      for (const b of buys) b.cluster = true;
    }
  }
  console.log(`[congress] ${clusteredTickers} tickers flagged as member-buy clusters`);

  trades.sort((a, b) => (a.disclosed_date < b.disclosed_date ? 1 : -1));
  writeJsonAtomic(path.join(OUT_DIR, 'congress.json'), trades);
}

main().catch((e) => {
  console.error(`[congress] FATAL: ${e.message}`);
  process.exit(1);
});
