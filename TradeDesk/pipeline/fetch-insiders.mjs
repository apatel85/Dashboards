#!/usr/bin/env node
/**
 * fetch-insiders.mjs — SEC EDGAR Form 4 → data/insiders.json.
 *
 * Two-step pipeline (verified live 2026-10-14):
 *  A. Discovery: EFTS JSON search for Form 4 filings in the last 14 days.
 *     https://efts.sec.gov/LATEST/search-index?q=%224%22&dateRange=custom
 *       &startdt=…&enddt=…&forms=4
 *     (contact-email UA + Accept: application/json required)
 *  B. Details: fetch each filing's ownershipDocument XML from
 *     https://www.sec.gov/Archives/edgar/data/{cik}/{adsh}/{xmlFile}
 *     and extract transactions with targeted parsing (values nest in <value>).
 *
 * Output: [{ ticker, cik, owner_name, role, transaction_code, shares, price,
 *            transaction_date, filed_date, accession }]
 * sorted by filed_date desc. Capped at 400 most-recent filings per run to
 * bound runtime (~2 min at SEC's fair-access rate).
 *
 * NOTE: only NON-DERIVATIVE transactions are extracted in v1 (open-market
 * buys/sells — the signal the playbook cares about, code P/S). Derivative
 * tables are skipped and this is logged, not silently assumed.
 *
 * Usage: OUT_DIR=/path/to/public/data [SEC_CONTACT_EMAIL=you@x.com] node fetch-insiders.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { eftsForm4Search, form4Xml, parseForm4 } from './lib/sec.mjs';
import { writeJsonAtomic, isoDate, addDays } from './lib/util.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || path.join(__dir, 'data');
const MAX_FILINGS = 400;
const WINDOW_DAYS = 14;

async function main() {
  const today = isoDate();
  const start = addDays(today, -WINDOW_DAYS);
  console.log(`[insiders] Form 4 discovery window: ${start} → ${today}`);

  const { total, hits } = await eftsForm4Search(start, today, { maxHits: MAX_FILINGS });
  console.log(`[insiders] ${total} total hits; processing ${hits.length} most-recent filings`);

  // Dedupe discovery hits: EFTS can return the same filing twice under
  // different search-result ids (same accession + XML file). Fetching it
  // twice yields byte-identical transaction rows downstream.
  const seenFilings = new Set();
  const uniqueHits = [];
  let dupHits = 0;
  for (const h of hits) {
    const k = `${h.adsh}|${h.xmlFile}`;
    if (seenFilings.has(k)) { dupHits++; continue; }
    seenFilings.add(k);
    uniqueHits.push(h);
  }
  if (dupHits > 0) console.log(`[insiders] skipped ${dupHits} duplicate discovery hits (same accession + XML)`);
  const workList = uniqueHits;

  const out = [];
  let ok = 0, failed = 0, noTx = 0;
  for (let i = 0; i < workList.length; i++) {
    const h = workList[i];
    if (!h.adsh || !h.xmlFile) { failed++; continue; }
    const cikNoZeros = String(h.ciks?.[0] ?? '').replace(/^0+/, '') || '0';
    try {
      const xml = await form4Xml(cikNoZeros, h.adsh, h.xmlFile);
      const p = parseForm4(xml);
      if (p.error) {
        console.warn(`[insiders] parse failed for ${h.adsh}/${h.xmlFile}: ${p.error}`);
        failed++;
        continue;
      }
      if (!p.transactions.length) { noTx++; continue; }
      ok++;
      for (const t of p.transactions) {
        out.push({
          ticker: p.ticker,
          cik: String(h.ciks?.[0] ?? '').padStart(10, '0') || null,
          owner_name: p.ownerName,
          role: p.role,
          transaction_code: t.code,
          shares: t.shares,
          price: t.price,
          transaction_date: t.date,
          filed_date: h.file_date || null,
          accession: h.adsh,
        });
      }
    } catch (e) {
      console.error(`[insiders] fetch failed for ${h.adsh}/${h.xmlFile}: ${e.message}`);
      failed++;
    }
    if ((i + 1) % 50 === 0) console.log(`[insiders] progress ${i + 1}/${workList.length} (ok=${ok} failed=${failed} noTx=${noTx})`);
  }

  console.log(`[insiders] done: ${ok} filings parsed, ${failed} failed, ${noTx} with no non-derivative transactions → ${out.length} transaction rows`);

  // Dedupe rows on the natural key. Accession alone is NOT enough — one
  // filing holds several transactions — so the key is the full
  // transaction identity: ticker, owner, code, shares, price, trade date,
  // filed date, accession. A duplicate is the same filing ingested twice
  // (overlapping SEC feed windows) or the same transaction listed twice
  // in one document; either way it must never render twice.
  // Reconciled 2026-11-14: on this key the live file has 3,116 rows with
  // 90 duplicated keys = 106 extra rows → 3,010 unique. (An earlier 141
  // figure used a shorter key without filed_date/accession and swept in
  // rows that share trade details but differ in filing — not duplicates.)
  const seenRows = new Set();
  const deduped = [];
  let dupRows = 0;
  for (const r of out) {
    const k = [r.ticker, r.owner_name, r.transaction_code, r.shares, r.price, r.transaction_date, r.filed_date, r.accession].join('|');
    if (seenRows.has(k)) { dupRows++; continue; }
    seenRows.add(k);
    deduped.push(r);
  }
  if (dupRows > 0) console.log(`[insiders] removed ${dupRows} duplicate transaction rows (natural key)`);
  deduped.sort((a, b) => String(b.filed_date || '').localeCompare(String(a.filed_date || '')));
  writeJsonAtomic(path.join(OUT_DIR, 'insiders.json'), deduped);
}

main().catch((e) => {
  console.error(`[insiders] FATAL: ${e.message}`);
  process.exit(1);
});
