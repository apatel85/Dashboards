#!/usr/bin/env node
/**
 * build-fundamentals.mjs — company name, sector, sub-sector + key fundamental
 * metrics for every ticker the pipeline tracks.
 *
 * Collects tickers from research.json, signals.json, daily-brief.json
 * (breakout candidates), lotto.json, earnings.json, and congress.json,
 * then pulls Yahoo quoteSummary [price, summaryDetail, defaultKeyStatistics,
 * financialData, assetProfile] for each.
 *
 * Writes public/data/fundamentals.json:
 *   { as_of, source, count, fundamentals: { TICKER: {
 *       name, sector, subsector, market_cap,
 *       pe_trailing, pe_forward, peg, pb, ps,
 *       profit_margin, roe, debt_equity, beta, div_yield,
 *       eps_trailing, eps_forward } } }
 *
 * $0, keyless (Yahoo quoteSummary, crumb session). Non-fatal by design.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yahooQuoteSummary } from './lib/yahoo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.OUT_DIR || join(ROOT, 'public', 'data');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

const raw = (v) => (v && typeof v === 'object' && 'raw' in v ? v.raw : v ?? null);
const r2 = (v) => {
  const n = raw(v);
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** Gather every ticker the app displays, from all data files. */
function collectTickers() {
  const set = new Set();
  const add = (t) => {
    t = String(t || '').toUpperCase().trim();
    if (t && !t.startsWith('^')) set.add(t);
  };

  const research = readJson('research.json');
  if (Array.isArray(research)) for (const i of research) add(i.ticker);

  const signals = readJson('signals.json');
  const sigList = Array.isArray(signals) ? signals : signals?.signals || signals?.items || [];
  if (Array.isArray(sigList)) for (const s of sigList) add(s.ticker);

  const brief = readJson('daily-brief.json');
  const cands = brief?.breakout_candidates || brief?.candidates || [];
  if (Array.isArray(cands)) for (const c of cands) add(c.ticker || c.symbol);

  const lotto = readJson('lotto.json');
  const lcands = lotto?.candidates || lotto?.top25 || [];
  if (Array.isArray(lcands)) for (const c of lcands) add(c.ticker);

  const earnings = readJson('earnings.json');
  const elist = Array.isArray(earnings) ? earnings : earnings?.entries || earnings?.items || [];
  if (Array.isArray(elist)) for (const e of elist) add(e.ticker);

  const congress = readJson('congress.json');
  const clist = Array.isArray(congress) ? congress : congress?.trades || congress?.items || [];
  if (Array.isArray(clist)) {
    const counts = new Map();
    for (const t of clist) {
      const k = String(t.ticker || t.symbol || '').toUpperCase().trim();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    // Congress file is huge — take the top 100 by trade count. The tickers
    // the user actually browses (signals/brief/lotto/earnings/research)
    // are already collected above.
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
    for (const [k] of top) add(k);
  }

  return [...set];
}

const MODULES = ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile'];

function extract(ticker, qs) {
  if (!qs) return null;
  const price = qs.price || {};
  const sd = qs.summaryDetail || {};
  const ks = qs.defaultKeyStatistics || {};
  const fd = qs.financialData || {};
  const ap = qs.assetProfile || {};
  return {
    name: price.longName || price.shortName || ticker,
    sector: ap.sector || null,
    subsector: ap.industry || null,
    market_cap: raw(price.marketCap),
    pe_trailing: r2(sd.trailingPE),
    pe_forward: r2(sd.forwardPE),
    peg: r2(ks.pegRatio),
    pb: r2(ks.priceToBook),
    ps: r2(sd.priceToSalesTrailing12Months),
    profit_margin: r2(ks.profitMargins ?? fd.profitMargins),
    roe: r2(fd.returnOnEquity),
    debt_equity: r2(fd.debtToEquity),
    beta: r2(ks.beta),
    div_yield: r2(sd.trailingAnnualDividendYield ?? sd.dividendYield),
    eps_trailing: r2(ks.trailingEps),
    eps_forward: r2(ks.forwardEps),
  };
}

async function main() {
  const tickers = collectTickers();
  console.log(`[fundamentals] ${tickers.length} unique tickers to enrich`);
  const fundamentals = {};
  let ok = 0, fail = 0;
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    try {
      const qs = await yahooQuoteSummary(t, MODULES);
      const f = extract(t, qs);
      if (f) { fundamentals[t] = f; ok++; }
      else fail++;
    } catch (e) {
      fail++;
      console.warn(`[fundamentals] ${t}: ${e.message}`);
    }
    if ((i + 1) % 10 === 0) {
      console.log(`[fundamentals] ${i + 1}/${tickers.length} (ok=${ok} fail=${fail})`);
      await sleep(500);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'fundamentals.json'), JSON.stringify({
    as_of: new Date().toISOString(),
    source: 'Yahoo Finance quoteSummary (delayed)',
    count: ok,
    fundamentals,
  }));
  console.log(`[fundamentals] wrote ${ok} enriched, ${fail} failed`);
}

main().catch((e) => { console.error(`[fundamentals] FATAL: ${e.message}`); process.exit(1); });
