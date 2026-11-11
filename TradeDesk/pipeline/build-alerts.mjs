#!/usr/bin/env node
/**
 * build-alerts.mjs → data/daily-alerts.json (TradeDesk DailyBrief "New
 * developments" section).
 *
 * $0, keyless: reads only files the pipeline already produced — congress.json
 * (step 1), executive.json (step 2) and news.json (step 15) — and computes
 * the day's new disclosures + news to watch. No network calls of its own.
 *
 * Window: disclosed/published within the last 2 days (inclusive), newest
 * first. Congress top 10, executive top 5, news top 8. Ordering prioritises
 * cluster buys, then amount, then recency.
 *
 * Honest limits baked in:
 *  - Refreshes with the DAILY pipeline run (~1am ET): the section is "as of
 *    this morning", NOT intraday-live.
 *  - Executive/White House data lags months at the source (latest filing
 *    ~2026-07-09), so that block is usually empty — the file carries
 *    `none_new: true` + `latest_filing_date` and the UI says so plainly
 *    instead of presenting stale trades as new.
 *  - Executive rows often lack a filing date upstream (disclosed_date null);
 *    those rows can never be proven "new", so they are excluded from the
 *    new-disclosures list.
 *
 * Usage: OUT_DIR=/path/to/public/data node build-alerts.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, daysBetween, isoDate, msToIso, writeJsonAtomic } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');

const WINDOW_DAYS = 2;
const MAX_CONGRESS = 10;
const MAX_EXECUTIVE = 5;
const MAX_NEWS = 8;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readJson(name) {
  try {
    return JSON.parse(readFileSync(path.join(OUT_DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

/** "$1.2m" / "$850k" / "$12" — compact USD for the one-line summaries. */
function compactMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}b`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/** "Nov 9" style short date for a YYYY-MM-DD string. */
function shortDate(iso) {
  if (!iso || !DATE_RE.test(iso)) return '—';
  const d = new Date(`${iso}T12:00:00Z`);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Is this disclosed date inside the "new" window ending today? */
function inWindow(disclosed, today) {
  if (!disclosed || !DATE_RE.test(disclosed)) return false;
  const d = daysBetween(disclosed, today);
  return d >= 0 && d <= WINDOW_DAYS;
}

/**
 * Cluster buys first, then largest amount, then most recently disclosed.
 * Amount is the disclosed range midpoint; null amounts sort last.
 */
function tradeSort(a, b) {
  const ca = a.cluster ? 0 : 1;
  const cb = b.cluster ? 0 : 1;
  if (ca !== cb) return ca - cb;
  const ma = a.amount_mid ?? -1;
  const mb = b.amount_mid ?? -1;
  if (mb !== ma) return mb - ma;
  return (b.disclosed_date || '') < (a.disclosed_date || '') ? 1 : -1;
}

function tradeItem(t) {
  return {
    member: t.member,
    chamber: t.chamber,
    role: t.role ?? null,
    agency: t.agency ?? null,
    ticker: t.ticker ?? null,
    asset_name: t.asset_name,
    trade_type: t.trade_type,
    amount_range: t.amount_range,
    amount_mid: t.amount_mid ?? null,
    tx_date: t.tx_date,
    disclosed_date: t.disclosed_date ?? null,
    doc_url: t.doc_url ?? null,
    cluster: !!t.cluster,
  };
}

/** "14 new disclosures · 6 buys, 8 sells · $210k bought, $1.4m sold" */
function tradeSummary(rows, label) {
  if (rows.length === 0) return `No new ${label} disclosures in the last ${WINDOW_DAYS} days`;
  let buys = 0;
  let sells = 0;
  let buyAmt = 0;
  let sellAmt = 0;
  for (const t of rows) {
    if (t.trade_type === 'buy') {
      buys++;
      buyAmt += t.amount_mid ?? 0;
    } else if (t.trade_type === 'sell') {
      sells++;
      sellAmt += t.amount_mid ?? 0;
    }
  }
  const parts = [`${rows.length} new disclosure${rows.length === 1 ? '' : 's'}`];
  const dir = [];
  if (buys) dir.push(`${buys} buy${buys === 1 ? '' : 's'}`);
  if (sells) dir.push(`${sells} sell${sells === 1 ? '' : 's'}`);
  if (dir.length) parts.push(dir.join(', '));
  const money = [];
  if (buyAmt > 0) money.push(`${compactMoney(buyAmt)} bought`);
  if (sellAmt > 0) money.push(`${compactMoney(sellAmt)} sold`);
  if (money.length) parts.push(money.join(', '));
  return parts.join(' · ');
}

function buildTradeGroup(allRows, maxItems, label) {
  const rows = Array.isArray(allRows) ? allRows : [];
  const fresh = rows.filter((t) => inWindow(t.disclosed_date, TODAY));
  const sorted = [...fresh].sort(tradeSort);
  const items = sorted.slice(0, maxItems).map(tradeItem);
  let summary = tradeSummary(fresh, label);
  if (fresh.length > maxItems) summary += ` · showing top ${maxItems}`;
  const latest = rows
    .map((t) => t.disclosed_date)
    .filter((d) => d && DATE_RE.test(d))
    .sort()
    .pop() ?? null;
  return {
    count: fresh.length,
    summary,
    latest_filing_date: latest,
    items,
  };
}

const TODAY = isoDate();

function main() {
  // Congress — House + Senate disclosures.
  const congress = readJson('congress.json');
  const congressGroup = buildTradeGroup(congress, MAX_CONGRESS, 'Congress');

  // Executive / White House — usually nothing new (source lags months).
  const executive = readJson('executive.json');
  const execGroup = buildTradeGroup(executive, MAX_EXECUTIVE, 'White House');
  execGroup.none_new = execGroup.count === 0;
  if (execGroup.none_new) {
    const latest = execGroup.latest_filing_date
      ? `latest filing ${shortDate(execGroup.latest_filing_date)}`
      : 'no filing date on record';
    execGroup.summary = `No new White House disclosures in the last ${WINDOW_DAYS} days · ${latest}`;
  }

  // News to watch — newest first, preferring the day's breakout/lotto tickers.
  const news = readJson('news.json');
  const brief = readJson('daily-brief.json');
  const lotto = readJson('lotto.json');
  const hot = new Set();
  for (const c of brief?.breakout_candidates || []) hot.add(String(c.ticker || '').toUpperCase());
  for (const c of lotto?.candidates || []) hot.add(String(c.ticker || '').toUpperCase());
  const newsItems = [...(news?.items || [])]
    .filter((n) => n.title && n.url)
    .sort((a, b) => {
      const ha = hot.has(String(a.ticker || '').toUpperCase()) ? 0 : 1;
      const hb = hot.has(String(b.ticker || '').toUpperCase()) ? 0 : 1;
      if (ha !== hb) return ha - hb;
      const ta = a.published_at ? Date.parse(a.published_at) : 0;
      const tb = b.published_at ? Date.parse(b.published_at) : 0;
      return tb - ta;
    })
    .slice(0, MAX_NEWS)
    .map((n) => ({
      ticker: n.ticker,
      title: n.title,
      publisher: n.publisher,
      url: n.url,
      published_at: n.published_at ?? null,
    }));
  const newsTickers = new Set(newsItems.map((n) => String(n.ticker || '').toUpperCase()));
  const newsGroup = {
    count: newsItems.length,
    summary: newsItems.length === 0
      ? 'No headlines in this run'
      : `${newsItems.length} headline${newsItems.length === 1 ? '' : 's'} across ${newsTickers.size} ticker${newsTickers.size === 1 ? '' : 's'}`,
    items: newsItems,
  };

  const out = {
    generated_at: msToIso(Date.now()),
    as_of: TODAY,
    window_days: WINDOW_DAYS,
    congress: congressGroup,
    executive: execGroup,
    news: newsGroup,
  };
  writeJsonAtomic(path.join(OUT_DIR, 'daily-alerts.json'), out);
  console.log(
    `[alerts] congress ${congressGroup.count} new (latest ${congressGroup.latest_filing_date || 'n/a'}) · ` +
    `executive ${execGroup.count} new (latest ${execGroup.latest_filing_date || 'n/a'}) · ` +
    `news ${newsGroup.count} → daily-alerts.json`,
  );
}

main();
