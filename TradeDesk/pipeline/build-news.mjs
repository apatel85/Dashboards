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
 * RELEVANCE FILTER (2026-11-11): Yahoo search on single-letter tickers is
 * unusable — query "A" returns Packers/Kings headlines, "EW" returns
 * Price Is Right headlines. So (1) single-letter tickers are excluded from
 * the universe entirely, and (2) every headline must pass a title-relevance
 * guard: the title must contain the ticker symbol in UPPERCASE as a
 * standalone word (case-SENSITIVE — a case-insensitive check would let
 * "be"/"cat"/"Ms."/"Ben"/"cost" through for BE/CAT/MS/BEN/COST) or the
 * company name (full short name or its distinctive first word). Company
 * names come from fundamentals.json (primary), signals.json asset_name,
 * and earnings.json — never hardcoded.
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
    // Single-letter tickers are unsearchable by symbol (query "A" matches
    // everything) and the noise cost far exceeds their news value.
    if (sym.length === 1) return;
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

/** Company names per ticker, from pipeline data already on disk. */
function buildNameMap() {
  const names = new Map();
  // fundamentals.json is the best source: { fundamentals: { SYM: { name } } }.
  const funds = readJson('fundamentals.json');
  const fdict = funds?.fundamentals || {};
  for (const [sym, e] of Object.entries(fdict)) {
    if (e?.name) names.set(String(sym).toUpperCase(), String(e.name));
  }
  // signals.json asset_name: "Apple Inc. - Common Stock (AAPL) [ST]" -> "Apple Inc."
  const signals = readJson('signals.json');
  for (const t of (signals?.tickers || [])) {
    const sym = String(t.ticker || '').toUpperCase();
    if (!sym || names.has(sym)) continue;
    const raw = String(t.asset_name || '');
    const m = raw.split(' - ')[0].replace(/\s*\([^)]*\)\s*/g, '').replace(/\s*\[[^\]]*\]\s*/g, '').trim();
    if (m) names.set(sym, m);
  }
  // earnings.json entries carry a plain name field.
  const earnings = readJson('earnings.json');
  const earnList = Array.isArray(earnings) ? earnings : [];
  for (const e of earnList) {
    const sym = String(e.ticker || '').toUpperCase();
    if (sym && e?.name && !names.has(sym)) names.set(sym, String(e.name));
  }
  return names;
}

/** Strip "The " and trailing legal suffixes: "Agilent Technologies, Inc." -> "Agilent Technologies". */
function shortName(full) {
  let s = String(full || '').trim().replace(/^The\s+/i, '');
  let prev;
  do {
    prev = s;
    s = s
      .replace(/[, ]+(Inc\.?|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|PLC|Group|Holdings|Incorporated|N\.V\.|S\.A\.|L\.P\.|LLC)\.?$/i, '')
      .replace(/,\s*$/, '')
      .trim();
  } while (s !== prev);
  // "Becton, Dickinson and Company" leaves "Becton, Dickinson and" — clean it up.
  s = s.replace(/,+/g, ' ').replace(/\s+and$/i, '').replace(/\s+/g, ' ').trim();
  return s;
}

/** Generic first words that prove nothing on their own ("Automatic" for ADP, "United" for UNH). */
const GENERIC_FIRST_WORDS = new Set([
  'automatic', 'general', 'american', 'united', 'international', 'global',
  'national', 'new', 'first', 'advanced', 'applied', 'standard', 'central',
  'consolidated', 'allied', 'associated', 'digital', 'dynamic', 'evergreen',
  'fidelity', 'universal', 'public', 'federal', 'state', 'continental',
  'corporate', 'common', 'premier', 'select', 'superior', 'total', 'western',
  'southern', 'northern', 'eastern', 'crown', 'eagle', 'liberty', 'pioneer',
  'summit', 'peak', 'prime', 'horizon', 'meridian', 'apex', 'vertex',
  'victory', 'supreme', 'world', 'worldwide', 'city', 'county',
]);

/** Name tokens to match in a title: full short name + distinctive first word (+ punctuation variants). */
function nameTokens(full) {
  const short = shortName(full);
  if (!short) return [];
  const out = new Set();
  const addVariant = (tok) => {
    const t = String(tok || '').trim();
    if (t.length < 3) return;
    out.add(t);
    out.add(t.replace(/'/g, '')); // McDonald's -> McDonalds
    out.add(t.replace(/-/g, ' ')); // Coca-Cola -> Coca Cola
  };
  addVariant(short);
  // Split on whitespace/dots, not hyphens: "Amazon.com" -> "Amazon", but "Coca-Cola" stays whole.
  const first = short.split(/[\s.]+/)[0];
  if (first.length >= 4 && !GENERIC_FIRST_WORDS.has(first.toLowerCase())) addVariant(first);
  return [...out];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize typographic quotes/apostrophes — Yahoo titles use curly ’ (U+2019), not '. */
function normQuotes(s) {
  return String(s || '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/** True if `word` appears in `text` as a standalone token (not part of a larger word). */
function hasStandalone(text, word, caseSensitive) {
  const t = normQuotes(text);
  const w = normQuotes(word);
  const flags = caseSensitive ? '' : 'i';
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(w)}(?![A-Za-z0-9])`, flags);
  return re.test(t);
}

/**
 * Title-relevance guard: keep the headline only if the title mentions the
 * ticker symbol in UPPERCASE as a standalone word, or the company name
 * (full short name or distinctive first word). No name on file -> ticker
 * check only. Case-sensitive on the symbol: a case-insensitive check would
 * pass junk for BE ("be"), CAT ("cat"), MS ("Ms."), BEN ("Ben"), COST ("cost").
 */
function isRelevant(ticker, title, nameMap) {
  if (!title) return false;
  if (hasStandalone(title, ticker, true)) return true;
  const full = nameMap.get(ticker);
  if (!full) return false;
  const lower = title.toLowerCase();
  return nameTokens(full).some((tok) => hasStandalone(lower, tok.toLowerCase(), false));
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
  const nameMap = buildNameMap();
  console.log(`[news] universe: ${universe.length} tickers (names on file: ${nameMap.size})`);
  const items = [];
  const seenUrls = new Set();
  let tickersWithNews = 0;
  let keptTotal = 0;
  let droppedTotal = 0;
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
    // Title-relevance guard (applies to Yahoo and RSS alike).
    const kept = rows.filter((r) => isRelevant(ticker, r.title, nameMap));
    const dropped = rows.length - kept.length;
    keptTotal += kept.length;
    droppedTotal += dropped;
    if (dropped > 0) {
      console.log(`[news] ${ticker}: kept ${kept.length}/${rows.length} (dropped ${dropped} irrelevant)`);
      for (const r of rows) {
        if (!isRelevant(ticker, r.title, nameMap)) console.log(`[news]   dropped: ${r.title}`);
      }
    }
    rows = kept;
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
  console.log(`[news] relevance filter: kept ${keptTotal}, dropped ${droppedTotal} irrelevant`);
}

main().catch((e) => {
  console.error(`[news] FATAL: ${e.message}`);
  process.exit(1);
});
