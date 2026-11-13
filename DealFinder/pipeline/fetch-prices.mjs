#!/usr/bin/env node
/**
 * DealFinder P2 — weekly price pipeline.
 *
 * Fetches real weekly flyer prices from Flipp's public web endpoints
 * (the same endpoints flipp.com's own web client uses — no key, no auth,
 * ZIP-scoped), filters/dedupes/normalizes them, and upserts them into the
 * Supabase `dealfinder` schema. Also computes each tracked item's 30-day
 * average best price and generates in-app alerts when today's best price
 * is below that average.
 *
 * Source honesty (probe 2026-11-12, ZIP 08520):
 *   - Flipp returns FLYER/SALE prices only. An item appears only when it is
 *     on sale in a flyer; there is no everyday shelf price in this data.
 *   - There is NO unit price and NO size/quantity field in the payload.
 *     Size is parsed from the item name (best effort); when it cannot be
 *     parsed, unit_price stays null — never invented.
 *   - ShopRite has no Flipp flyer for 08520. A second source is a P3 task.
 *   - ~10-20% of rows are junk (null name/price, headline text as items)
 *     plus duplicates across flyers; the filter + dedup below handle that.
 *   - Flipp's use is governed by its Terms of Use; these endpoints are
 *     public but unsanctioned and can change or throttle without notice.
 *     This script FAILS LOUDLY on any upstream problem — it never silently
 *     serves stale prices.
 *
 * Usage:
 *   node fetch-prices.mjs [--dry-run] [--zip 08520,08540]
 *
 *   --dry-run   Fetch, filter, dedupe, normalize and print what WOULD be
 *               written, but write nothing to Supabase.
 *   --zip       Comma-separated ZIP list. Default: 08520 (East Windsor, NJ).
 *               This is the launch market; more ZIP clusters can be added
 *               later without code changes.
 *
 * Environment (required unless --dry-run):
 *   SUPABASE_URL               Public project URL, e.g.
 *                              https://iknfvddnevudpjtyxkbh.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  Service-role key. NEVER hardcode it, never
 *                              log it, never put it in the repo. In GitHub
 *                              Actions it comes from the repo secret
 *                              SUPABASE_SERVICE_ROLE_KEY.
 *
 * Exit codes: 0 ok; 1 upstream/data failure (fail loudly); 2 bad usage or
 * missing env. No other exit path writes partial data silently.
 *
 * Built-ins only (global fetch). No dependencies to install.
 */

import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FLIPP_BASE = "https://backflipp.wishabi.com/flipp";
const USER_AGENT =
  "DealFinder-pipeline/1.0 (+https://github.com/apatel85/Dashboards)";
const LOCALE = "en-us";
const DEFAULT_ZIPS = ["08520"];
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_AFTER_429_MS = 5_000;
const PACE_BETWEEN_CALLS_MS = 800;
const MAX_PER_QUERY = 25;
const MIN_SNAPSHOTS_FOR_AVERAGE = 2;
const HISTORY_DAYS = 30;

/**
 * Seed staple list (documented): the 12 household staples the pipeline
 * searches every week. This is the seed list only — tracked items added by
 * households in P3 join the search set then. Broad single-word queries on
 * purpose: the upstream ranker leans on keyword recall, and phrase queries
 * ("whole milk") returned almost nothing in the probe.
 */
export const SEED_STAPLES = [
  { query: "milk", category: "dairy" },
  { query: "eggs", category: "dairy" },
  { query: "juice", category: "beverages" },
  { query: "chicken breast", category: "meat" },
  { query: "bread", category: "bakery" },
  { query: "butter", category: "dairy" },
  { query: "cheese", category: "dairy" },
  { query: "yogurt", category: "dairy" },
  { query: "apples", category: "produce" },
  { query: "bananas", category: "produce" },
  { query: "coffee", category: "beverages" },
  { query: "orange juice", category: "beverages" },
];

/** Best-effort brand list: brand is informational only and never affects
 *  the norm_key. Anything not listed gets brand = null. */
const KNOWN_BRANDS = [
  "Horizon", "Fairlife", "TruMoo", "Lucerne", "Shamrock", "Nellie's",
  "Vital Farms", "Just Egg", "Chobani", "Yoplait", "Folgers",
  "Maxwell House", "Tropicana", "Minute Maid", "Dole", "Wonder",
  "Sara Lee", "Land O'Lakes", "Kraft", "Sargento", "Tillamook",
  "Great Value", "Kirkland", "Market Pantry", "Good & Gather",
  "Simply Nature", "Friendly Farms", "Weis", "Giant", "Acme",
];

// ---------------------------------------------------------------------------
// Logging (never log secrets — env presence is logged as a boolean only)
// ---------------------------------------------------------------------------

function ts() {
  return new Date().toISOString();
}
function logInfo(msg) {
  console.log(`[dealfinder] ${ts()} INFO ${msg}`);
}
function logWarn(msg) {
  console.log(`[dealfinder] ${ts()} WARN ${msg}`);
}
function logError(msg) {
  console.error(`[dealfinder] ${ts()} ERROR ${msg}`);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/** Clean a flyer item name for matching: lowercase, strip ®/™/©, collapse
 *  whitespace and punctuation runs. */
export function cleanName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Drop junk rows. The probe's junk was null name/price and headline text
 * returned as items ("DON'T FORGET THE MILK, EGGS & BUTTER"). Heuristics:
 * name must exist and contain a letter, price must be a sane number,
 * names over 80 chars are headline text, not products.
 */
export function filterJunk(rows) {
  const kept = [];
  const dropped = { nullName: 0, nullPrice: 0, badPrice: 0, headline: 0 };
  for (const r of rows) {
    if (!r || typeof r.name !== "string" || cleanName(r.name) === "") {
      dropped.nullName++;
      continue;
    }
    if (r.current_price === null || r.current_price === undefined) {
      dropped.nullPrice++;
      continue;
    }
    const price = Number(r.current_price);
    if (!Number.isFinite(price) || price <= 0 || price >= 10000) {
      dropped.badPrice++;
      continue;
    }
    if (r.name.length > 80 || !/[a-zA-Z]/.test(r.name)) {
      dropped.headline++;
      continue;
    }
    kept.push(r);
  }
  return { kept, dropped };
}

/** Dedup the same product at the same store at the same price across
 *  flyers (the probe found e.g. Horizon at H Mart twice under different
 *  flyer/item ids). Key: cleaned name + merchant + price. Keeps the first. */
export function dedupRows(rows) {
  const seen = new Set();
  const kept = [];
  let dupes = 0;
  for (const r of rows) {
    const key = `${cleanName(r.name)}|${(r.merchant_name ?? r.merchant ?? "").toLowerCase()}|${Number(r.current_price)}`;
    if (seen.has(key)) {
      dupes++;
      continue;
    }
    seen.add(key);
    kept.push(r);
  }
  return { kept, dupes };
}

// Size patterns, US-first (probe: dairy names carry no size at all, so most
// rows will still return null — that is expected, not a bug). Normalizes to
// kg, L, or per-unit counts. Multipack "12 x 355mL" multiplies out.
const SIZE_PATTERNS = [
  { re: /(\d+(?:\.\d+)?)\s*gal\b/i, to: "L", factor: 3.78541, label: "gal" },
  { re: /(\d+(?:\.\d+)?)\s*qt\b/i, to: "L", factor: 0.946353, label: "qt" },
  { re: /(\d+(?:\.\d+)?)\s*pt\b/i, to: "L", factor: 0.473176, label: "pt" },
  { re: /(\d+(?:\.\d+)?)\s*fl\s*oz\b/i, to: "L", factor: 0.0295735, label: "fl oz" },
  { re: /(\d+(?:\.\d+)?)\s*kg\b/i, to: "kg", factor: 1, label: "kg" },
  { re: /(\d+(?:\.\d+)?)\s*g\b/i, to: "kg", factor: 0.001, label: "g" },
  { re: /(\d+(?:\.\d+)?)\s*lb\b/i, to: "kg", factor: 0.453592, label: "lb" },
  { re: /(\d+(?:\.\d+)?)\s*oz\b/i, to: "kg", factor: 0.0283495, label: "oz" },
  { re: /(\d+(?:\.\d+)?)\s*l\b/i, to: "L", factor: 1, label: "L" },
  { re: /(\d+(?:\.\d+)?)\s*ml\b/i, to: "L", factor: 0.001, label: "mL" },
  { re: /(\d+)\s*(?:count|ct|pack|pk)\b/i, to: "unit", factor: 1, label: "ct" },
];
const MULTIPACK_RE = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(gal|qt|pt|fl\s*oz|kg|g|lb|oz|l|ml)\b/i;
const ALL_SIZES_RE = /(\d+(?:\.\d+)?)\s*(gal|qt|pt|fl\s*oz|kg|g|lb|oz|l|ml|ct|count|pack|pk)\b/gi;
const SEPARATOR_RE = /\b(or|and)\b|\s[&+]\s|\bBUNDLE\b/i;

/**
 * Parse a size from an item name. Returns null when no size token exists
 * (the common case for dairy in the probe). Compound listings ("Milk 4L OR
 * Cheese Slices 22's $6.19") are flagged and get NO unit price — the price
 * belongs to one of two products and normalizing against the wrong one
 * would lie. Ported from the flipp-cli unit-price parser, extended with
 * US units (gal/qt/pt/fl oz).
 */
export function parseSize(name, price) {
  if (!name || price === null || price === undefined || Number(price) <= 0) {
    return null;
  }
  const sizeTokens = name.match(ALL_SIZES_RE) ?? [];
  let compound = false;
  if (/\bBUNDLE\b/i.test(name)) compound = true;
  else if (sizeTokens.length >= 2) {
    const firstIdx = name.search(ALL_SIZES_RE);
    const sepIdx = name.search(SEPARATOR_RE);
    if (sepIdx > firstIdx) compound = true;
  }

  const multi = name.match(MULTIPACK_RE);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    const unitWord = multi[3].toLowerCase().replace(/\s+/g, " ");
    const pat = SIZE_PATTERNS.find((p) => p.label.toLowerCase() === unitWord);
    if (pat && count > 0 && each > 0) {
      const total = count * each * pat.factor;
      if (total > 0 && !compound) {
        return {
          sizeText: `${count} x ${each} ${pat.label}`,
          sizeValue: Math.round(total * 1000) / 1000,
          sizeUnit: pat.to,
          unitPrice: Math.round((Number(price) / total) * 100) / 100,
          compound,
        };
      }
      return { sizeText: `${count} x ${each} ${pat.label}`, sizeValue: null, sizeUnit: null, unitPrice: null, compound };
    }
  }

  for (const p of SIZE_PATTERNS) {
    const m = name.match(p.re);
    if (!m) continue;
    const qty = Number(m[1]);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const normalized = qty * p.factor;
    if (normalized <= 0) continue;
    if (compound) {
      return { sizeText: `${qty} ${p.label}`, sizeValue: null, sizeUnit: null, unitPrice: null, compound };
    }
    return {
      sizeText: `${qty} ${p.label}`,
      sizeValue: Math.round(normalized * 1000) / 1000,
      sizeUnit: p.to,
      unitPrice: Math.round((Number(price) / normalized) * 100) / 100,
      compound,
    };
  }
  return null;
}

/** Best-effort brand: first KNOWN_BRANDS entry the name starts with (or
 *  contains as a leading token). Informational only. */
export function extractBrand(name) {
  const lower = ` ${cleanName(name)} `;
  for (const b of KNOWN_BRANDS) {
    if (lower.includes(` ${b.toLowerCase()} `) || lower.startsWith(` ${b.toLowerCase()} `)) {
      return b;
    }
  }
  return null;
}

/**
 * Normalize one filtered flyer item into the shape the `items` + `prices`
 * tables take. norm_key = cleaned name + size (or "nosize") — the product
 * key across stores. No size in the name means size_* and unit_price are
 * null; the row is still kept, because the price itself is real.
 */
export function normalizeRow(row, category) {
  const price = Number(row.current_price);
  const size = parseSize(row.name, price);
  const cleaned = cleanName(row.name);
  return {
    rawName: row.name,
    cleanName: cleaned,
    brand: extractBrand(row.name),
    name: row.name.trim(),
    sizeText: size?.sizeText ?? null,
    sizeValue: size?.sizeValue ?? null,
    sizeUnit: size?.sizeUnit ?? null,
    unitPrice: size?.unitPrice ?? null,
    compound: size?.compound ?? false,
    normKey: `${cleaned} | ${size?.sizeText ?? "nosize"}`,
    category,
    merchant: row.merchant_name ?? row.merchant ?? null,
    merchantId: row.merchant_id ?? null,
    price,
    regularPrice:
      row.original_price !== null && row.original_price !== undefined
        ? Number(row.original_price)
        : null,
    saleStory: row.sale_story ?? null,
    loyaltyCondition: row.post_price_text ?? null,
    clippingImageUrl: row.clipping_image_url ?? null,
    flyerItemId: row.flyer_item_id ?? null,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
  };
}

// ---------------------------------------------------------------------------
// Flipp client (mirrors flipp-cli src/client.ts: same base, same params,
// same headers — Accept: application/json, identifiable User-Agent, 15s
// timeout. No key, no auth: these are the endpoints flipp.com's own web
// client uses.)
// ---------------------------------------------------------------------------

class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function flippGet(path, params, label) {
  const url = new URL(`${FLIPP_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (res.status === 429 && attempt === 1) {
        const waitMs =
          Number(res.headers.get("retry-after")) * 1000 || RETRY_AFTER_429_MS;
        logWarn(`${label}: 429 rate-limited, backing off ${waitMs}ms and retrying once`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        throw new UpstreamError(
          `Flipp ${res.status} ${res.statusText} for ${path}`,
          res.status,
        );
      }
      return await res.json();
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      if (err?.name === "AbortError") {
        throw new UpstreamError(`${label}: timed out after ${REQUEST_TIMEOUT_MS}ms`, 0);
      }
      throw new UpstreamError(`${label}: ${err?.message ?? String(err)}`, 0);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new UpstreamError(`${label}: rate-limited after one retry`, 429);
}

async function fetchFlyers(zip) {
  const data = await flippGet(
    "/flyers",
    { locale: LOCALE, postal_code: zip },
    `flyers ${zip}`,
  );
  if (!data || !Array.isArray(data.flyers)) {
    throw new UpstreamError(`flyers ${zip}: unexpected response shape (no flyers array)`, 0);
  }
  return data.flyers;
}

async function searchItems(zip, query) {
  const data = await flippGet(
    "/items/search",
    { locale: LOCALE, postal_code: zip, q: query, sort_type: "price-asc" },
    `search "${query}" ${zip}`,
  );
  if (!data || !Array.isArray(data.items)) {
    logWarn(`search "${query}" ${zip}: unexpected response shape (no items array), treating as empty`);
    return [];
  }
  // Flyer items only. ecom_items are online listings, not shelf prices —
  // the probe found 43 of them for "milk" and they are deliberately excluded.
  return data.items;
}

// ---------------------------------------------------------------------------
// Supabase client (PostgREST over fetch; service_role key from env only)
// ---------------------------------------------------------------------------

function sbClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set (unless --dry-run). Key values are never logged.");
    process.exit(2);
  }
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  async function get(table, params) {
    const qs = new URLSearchParams(params);
    const res = await fetch(`${base}/${table}?${qs}`, { headers });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      throw new Error(`Supabase GET ${table} failed: ${res.status} ${body}`);
    }
    return res.json();
  }
  async function upsert(table, rows, onConflict) {
    if (rows.length === 0) return [];
    const res = await fetch(
      `${base}/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(rows),
      },
    );
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      throw new Error(`Supabase upsert ${table} failed: ${res.status} ${body}`);
    }
    return res.json();
  }
  return { get, upsert };
}

// ---------------------------------------------------------------------------
// Alert math (the plan's rule, exactly)
// ---------------------------------------------------------------------------

/**
 * From snapshot rows {price, fetched_at} for one item: group by calendar
 * day (UTC), take the best (lowest) price per day, and average those daily
 * bests over the last HISTORY_DAYS days.
 * Returns { average, snapshotDays } or null when fewer than
 * MIN_SNAPSHOTS_FOR_AVERAGE distinct days exist — then the item is
 * "building history" and no alert may fire.
 */
export function thirtyDayAverage(rows, now = new Date()) {
  const cutoff = new Date(now.getTime() - HISTORY_DAYS * 24 * 3600 * 1000);
  const bestByDay = new Map();
  for (const r of rows) {
    const d = new Date(r.fetched_at);
    if (Number.isNaN(d.getTime()) || d < cutoff) continue;
    const day = d.toISOString().slice(0, 10);
    const price = Number(r.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!bestByDay.has(day) || price < bestByDay.get(day)) bestByDay.set(day, price);
  }
  const days = [...bestByDay.values()];
  if (days.length < MIN_SNAPSHOTS_FOR_AVERAGE) return null;
  const average = days.reduce((a, b) => a + b, 0) / days.length;
  return { average: Math.round(average * 100) / 100, snapshotDays: days.length };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false, zips: [...DEFAULT_ZIPS] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--zip") {
      const v = argv[++i];
      if (!v || !/^\d{5}(,\d{5})*$/.test(v)) {
        logError("--zip takes a comma-separated list of 5-digit ZIP codes, e.g. --zip 08520,08540");
        process.exit(2);
      }
      args.zips = v.split(",");
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: node fetch-prices.mjs [--dry-run] [--zip 08520,08540]");
      process.exit(0);
    } else {
      logError(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

async function runZip(zip, sb, dryRun) {
  const nowIso = new Date().toISOString();
  logInfo(`--- ZIP ${zip} ---`);

  // 1. Flyers — an empty flyer list is a loud failure, never a silent
  //    "no prices this week". (A dead upstream must not look like a quiet week.)
  const flyers = await fetchFlyers(zip);
  await sleep(PACE_BETWEEN_CALLS_MS);
  if (flyers.length === 0) {
    throw new UpstreamError(`flyers ${zip}: Flipp returned zero active flyers — refusing to write an empty week`, 0);
  }
  logInfo(`flyers ${zip}: ${flyers.length} active`);

  const storeRows = [];
  const seenMerchants = new Set();
  for (const f of flyers) {
    if (!f.merchant) continue;
    const key = `${f.merchant}|${zip}`;
    if (seenMerchants.has(key)) continue;
    seenMerchants.add(key);
    storeRows.push({
      merchant: f.merchant,
      merchant_id: f.merchant_id ?? null,
      name: null, // branch-level names need a store-locator source (P3)
      zip,
      distance_miles: null,
      source: "flipp",
      updated_at: nowIso,
    });
  }

  const flyerRows = flyers
    .filter((f) => f.id !== null && f.id !== undefined)
    .map((f) => ({
      flipp_flyer_id: f.id,
      merchant: f.merchant,
      merchant_id: f.merchant_id ?? null,
      name: f.name ?? null,
      valid_from: f.valid_from ?? null,
      valid_to: f.valid_to ?? null,
      zip,
      source: "flipp",
      fetched_at: nowIso,
    }));

  // 2. Staple searches.
  let searched = 0;
  let keptTotal = 0;
  let droppedTotal = 0;
  let dupeTotal = 0;
  const normalized = [];
  for (const staple of SEED_STAPLES) {
    const rows = await searchItems(zip, staple.query);
    await sleep(PACE_BETWEEN_CALLS_MS);
    searched += rows.length;
    const { kept, dropped } = filterJunk(rows);
    droppedTotal +=
      dropped.nullName + dropped.nullPrice + dropped.badPrice + dropped.headline;
    const { kept: deduped, dupes } = dedupRows(kept);
    dupeTotal += dupes;
    for (const r of deduped) normalized.push(normalizeRow(r, staple.category));
    keptTotal += deduped.length;
    logInfo(
      `search "${staple.query}" ${zip}: ${rows.length} raw, ${kept.length} after filter, ${deduped.length} after dedup`,
    );
  }
  if (keptTotal === 0) {
    throw new UpstreamError(
      `zip ${zip}: all ${SEED_STAPLES.length} staple searches came back empty after filtering — refusing to write an empty week`,
      0,
    );
  }

  // 3. Upserts (skipped in dry-run — counts only).
  let storesUpserted = 0;
  let itemsUpserted = 0;
  let pricesUpserted = 0;
  let alertsCreated = 0;
  let buildingHistory = 0;
  const storeIdByMerchant = new Map();
  const itemIdByNormKey = new Map();

  if (dryRun) {
    logInfo(`[dry-run] would upsert ${storeRows.length} stores, ${flyerRows.length} flyers, ${new Set(normalized.map((n) => n.normKey)).size} items, ${normalized.length} price rows`);
    for (const n of normalized.slice(0, 10)) {
      logInfo(`[dry-run] sample: ${n.name} — $${n.price} at ${n.merchant} (valid to ${n.validTo ?? "n/a"}, unit ${n.unitPrice ?? "n/a"})`);
    }
  } else {
    const stores = await sb.upsert("stores", storeRows, "merchant,zip");
    storesUpserted = stores.length;
    for (const s of stores) storeIdByMerchant.set(`${s.merchant}|${zip}`, s.id);

    const flyersUpserted = await sb.upsert("flyers", flyerRows, "flipp_flyer_id,zip");
    logInfo(`flyers upserted: ${flyersUpserted.length}`);

    const itemRows = [];
    const seenItems = new Set();
    for (const n of normalized) {
      if (seenItems.has(n.normKey)) continue;
      seenItems.add(n.normKey);
      itemRows.push({
        norm_key: n.normKey,
        brand: n.brand,
        name: n.name,
        raw_name: n.rawName,
        size_text: n.sizeText,
        size_value: n.sizeValue,
        size_unit: n.sizeUnit,
        category: n.category,
        upc: null,
        updated_at: nowIso,
      });
    }
    const items = await sb.upsert("items", itemRows, "norm_key");
    itemsUpserted = items.length;
    for (const it of items) itemIdByNormKey.set(it.norm_key, it.id);

    const priceRows = [];
    for (const n of normalized) {
      const itemId = itemIdByNormKey.get(n.normKey);
      const storeId = storeIdByMerchant.get(`${n.merchant}|${zip}`);
      if (!itemId || !storeId) continue; // merchant with no flyer row (should not happen)
      priceRows.push({
        item_id: itemId,
        store_id: storeId,
        flyer_item_id: n.flyerItemId,
        price: n.price,
        regular_price: n.regularPrice,
        unit_price: n.unitPrice,
        unit: n.sizeUnit,
        sale_story: n.saleStory,
        loyalty_condition: n.loyaltyCondition,
        clipping_image_url: n.clippingImageUrl,
        valid_from: n.validFrom,
        valid_to: n.validTo,
        zip,
        fetched_at: nowIso,
        source: "flipp",
      });
    }
    const prices = await sb.upsert(
      "prices",
      priceRows,
      "item_id,store_id,flyer_item_id,valid_from,valid_to",
    );
    pricesUpserted = prices.length;

    // 4. Alerts: only for items households actually track.
    const tracked = await sb.get("tracked_items", {
      select: "id,item_id",
      limit: 1000,
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    for (const t of tracked) {
      const itemRowsForItem = normalized.filter(
        (n) => itemIdByNormKey.get(n.normKey) === t.item_id,
      );
      if (itemRowsForItem.length === 0) continue; // tracked item not on sale this week
      const todayBest = Math.min(...itemRowsForItem.map((n) => n.price));
      const bestRow = itemRowsForItem.find((n) => n.price === todayBest);
      const history = await sb.get("prices", {
        select: "price,fetched_at",
        item_id: `eq.${t.item_id}`,
        fetched_at: `gte.${new Date(Date.now() - HISTORY_DAYS * 24 * 3600 * 1000).toISOString()}`,
        order: "fetched_at.desc",
        limit: 1000,
      });
      const avg = thirtyDayAverage(history);
      if (!avg) {
        buildingHistory++;
        logInfo(`tracked item ${t.item_id}: building history (${history.length} snapshots) — no alert`);
        continue;
      }
      if (todayBest >= avg.average) continue; // not below average: no alert
      const existing = await sb.get("alerts", {
        select: "id",
        tracked_item_id: `eq.${t.id}`,
        created_at: `gte.${todayStart.toISOString()}`,
        limit: 1,
      });
      if (existing.length > 0) continue; // one alert per tracked item per day
      const gapPct = Math.round(((avg.average - todayBest) / avg.average) * 10000) / 100;
      const storeId = storeIdByMerchant.get(`${bestRow.merchant}|${zip}`);
      const created = await sb.upsert(
        "alerts",
        [
          {
            tracked_item_id: t.id,
            item_id: t.item_id,
            store_id: storeId ?? null,
            price: todayBest,
            avg_30d: avg.average,
            gap_pct: gapPct,
            snapshot_count: avg.snapshotDays,
            channel: "in_app",
            status: "pending",
          },
        ],
        "id",
      );
      alertsCreated += created.length;
      logInfo(
        `ALERT tracked item ${t.item_id}: best $${todayBest} < 30d avg $${avg.average} (-${gapPct}%, ${avg.snapshotDays} snapshots)`,
      );
    }
  }

  return {
    zip,
    flyers: flyers.length,
    stores: dryRun ? storeRows.length : storesUpserted,
    flyersUpserted: dryRun ? flyerRows.length : undefined,
    searched,
    kept: keptTotal,
    dropped: droppedTotal,
    dupes: dupeTotal,
    items: dryRun ? new Set(normalized.map((n) => n.normKey)).size : itemsUpserted,
    prices: dryRun ? normalized.length : pricesUpserted,
    alerts: alertsCreated,
    buildingHistory,
    dryRun,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun) {
    // Env presence only — never log values.
    logInfo(
      `env: SUPABASE_URL set=${Boolean(process.env.SUPABASE_URL)}, SUPABASE_SERVICE_ROLE_KEY set=${Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}`,
    );
  }
  const sb = args.dryRun ? null : sbClient();
  const summaries = [];
  for (const zip of args.zips) {
    summaries.push(await runZip(zip, sb, args.dryRun));
  }
  console.log(JSON.stringify({ ok: true, dryRun: args.dryRun, runs: summaries }, null, 2));
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    logError(`FATAL: ${err?.message ?? String(err)}`);
    process.exit(1);
  });
}
