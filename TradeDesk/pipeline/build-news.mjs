#!/usr/bin/env node
/**
 * build-news.mjs → data/news.json (TradeDesk DailyBrief news section).
 *
 * $0, keyless: Yahoo Finance search endpoint (query1) returns per-ticker
 * headlines with title, publisher, link, and publish time — no crumb or
 * cookie needed for v1/search with a browser User-Agent. Undocumented
 * endpoint, no SLA: per-ticker failures are tolerated (skip and continue),
 * and the whole step is NON-FATAL in refresh.sh — a news failure must never
 * fail the pipeline.
 *
 * Fallback: GitHub's runner IPs get HTTP 429 from Yahoo search on every
 * ticker (2026-11-10 run: 0/25 headlines), so on any Yahoo failure the
 * ticker falls back to Google News RSS (news.google.com/rss/search — also
 * keyless, no auth), parsed with plain regexes. Yahoo stays primary because
 * it carries direct publisher links; RSS links are Google redirect URLs.
 *
 * Universe: top daily-brief breakout candidates by score, topped up with
 * top signal tickers, deduped, max 25 tickers. 3 headlines per ticker max.
 *
 * Usage: OUT_DIR=/path/to/public/data node build-news.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickUA, sleep } from './lib/http.mjs';
import { msToIso, writeJsonAtomic } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');

const MAX_TICKERS = 25;
const NEWS_PER_TICKER = 3;
const PACE_MS = 1000;
const TIMEOUT_MS = 10000;
const UA = pickUA();

function readJson(name) {
  try {
    return JSON.parse(readFileSync(path.join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

function buildUniverse() {
  const tickers = [];
  const seen = new Set();
  const add = (t) => {
    const sym = String(t || '').toUpperCase().trim();
    if (!/^[A-Z][A-Z0-9.]{0,7}$/.test(sym)) return;
    if (seen.has(sym)) return;
    seen.add(sym);
    tickers.push(sym);
  };
  // Daily-brief breakout candidates first, highest score first.
  const brief = readJson('daily-brief.json');
  const candidates = [...(brief?.breakout_candidates || [])]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const c of candidates) add(c.ticker);
  // Top signal tickers fill the remaining slots.
  const signals = readJson('signals.json');
  for (const t of (signals?.tickers || [])) add(t.ticker);
  return tickers.slice(0, MAX_TICKERS);
}

async function newsFor(ticker) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=${NEWS_PER_TICKER}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const news = Array.isArray(json?.news) ? json.news : [];
    const items = [];
    for (const n of news) {
      const title = typeof n.title === 'string' ? n.title.trim() : '';
      const link = typeof n.link === 'string' ? n.link : (typeof n.url === 'string' ? n.url : '');
      if (!title || !link) continue;
      const ts = typeof n.providerPublishTime === 'number' ? n.providerPublishTime * 1000 : null;
      items.push({
        ticker,
        title,
        publisher: typeof n.publisher === 'string' ? n.publisher : 'Yahoo Finance',
        url: link,
        published_at: ts ? msToIso(ts) : null,
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

/** Decode the few HTML entities RSS titles carry (&amp; &lt; &gt; &quot; &#39; + numeric). */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function tagText(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
  return m ? decodeEntities(m[1]).trim() : '';
}

/** Google News RSS fallback — keyless, no auth. Returns ≤ NEWS_PER_TICKER items. */
async function newsForRss(ticker) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(ticker)}&hl=en-US&gl=US&ceid=US:en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = [];
    const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const block of blocks.slice(0, NEWS_PER_TICKER)) {
      const rawTitle = tagText(block, 'title');
      const link = tagText(block, 'link');
      if (!rawTitle || !link) continue;
      const source = tagText(block, 'source');
      // RSS titles often end with " - Publisher"; strip it when it matches <source>.
      const title = source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(3 + source.length))
        : rawTitle;
      const pub = tagText(block, 'pubDate');
      const ts = pub ? Date.parse(pub) : NaN;
      items.push({
        ticker,
        title,
        publisher: source || 'Google News',
        url: link,
        published_at: Number.isFinite(ts) ? msToIso(ts) : null,
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const universe = buildUniverse();
  console.log(`[news] universe: ${universe.length} tickers`);
  const items = [];
  const seenUrls = new Set();
  let tickersWithNews = 0;
  for (let i = 0; i < universe.length; i++) {
    const ticker = universe[i];
    if (i > 0) await sleep(PACE_MS);
    let rows = [];
    try {
      rows = await newsFor(ticker);
    } catch (e) {
      console.warn(`[news] ${ticker}: Yahoo failed (${e.message}) — trying Google News RSS`);
      try {
        rows = await newsForRss(ticker);
      } catch (e2) {
        console.warn(`[news] ${ticker}: skipped (RSS: ${e2.message})`);
        continue;
      }
    }
    if (rows.length > 0) tickersWithNews++;
    for (const r of rows) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      items.push(r);
    }
  }
  // Most recent first (null timestamps sort last).
  items.sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : 0;
    const tb = b.published_at ? Date.parse(b.published_at) : 0;
    return tb - ta;
  });
  const out = {
    as_of: msToIso(Date.now()),
    count: items.length,
    items,
  };
  writeJsonAtomic(path.join(OUT_DIR, 'news.json'), out);
  console.log(`[news] wrote ${items.length} headlines across ${tickersWithNews}/${universe.length} tickers → news.json`);
}

main().catch((e) => {
  console.error(`[news] FATAL: ${e.message}`);
  process.exit(1);
});
