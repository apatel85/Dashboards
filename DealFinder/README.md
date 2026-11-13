# DealFinder — P2: backend + pipeline

**Status:** P2 code delivered 2026-11-12. Live runs are blocked on Ankit's two
manual steps below (DDL + repo secret) — nothing here runs against Supabase
until then. The live app frontend is P3; this folder is backend only.

## What P2 is

- `supabase/001-dealfinder-schema.sql` — the `dealfinder` schema: `stores`,
  `items`, `flyers`, `prices`, `tracked_items`, `alerts`, with indexes and
  Row Level Security (SELECT open to anon/authenticated — these are public
  prices; NO write policies for anon — writes go through the service-role
  key in the pipeline only).
- `pipeline/fetch-prices.mjs` — the weekly pipeline (Node, built-ins only).
  Fetches real flyer prices from Flipp's public endpoints, filters junk,
  dedupes, normalizes, upserts into Supabase, computes 30-day averages, and
  generates in-app alerts for tracked items.
- `.github/workflows/dealfinder-refresh.yml` — runs the pipeline Fridays
  12:00 UTC (07:00 EST / 08:00 EDT, when new circulars land) + manual runs.

## How the pipeline works

1. For each ZIP (default `08520`, East Windsor NJ): fetch active flyers
   (`GET /flyers`) — store + validity dates. Zero flyers = loud failure.
2. Search the 12-item seed list (milk, eggs, juice, chicken breast, bread,
   butter, cheese, yogurt, apples, bananas, coffee, orange juice) via
   `GET /items/search` — flyer items only; `ecom_items` are online listings,
   not shelf prices, and are excluded.
3. Filter junk (null name/price, absurd prices, headline text as items),
   dedup same name + merchant + price across flyers, normalize into a
   brand/name/size key. Size is parsed from the item name (best effort);
   when it cannot be parsed, `unit_price` stays null — never invented.
4. Upsert stores, flyers, items, and price snapshots into Supabase. The
   `prices` table IS the 30-day history: one row per item + store + flyer
   item + validity window.
5. For each tracked item: today's best price vs the average of daily best
   prices over the last 30 days. Alert fires only when today's best is
   below the average AND there are at least 2 snapshots in the window;
   otherwise the item is "building history" and nothing alerts.
6. Fail loudly: any Flipp non-200/429-after-one-retry, empty flyer list, or
   all-empty searches exits non-zero. Never silently serves stale prices.

## Source honesty (probe 2026-11-12, ZIP 08520)

- Flipp returns **flyer/sale prices only**. An item appears only when on
  sale in a flyer; there is no everyday shelf price in this data.
- **No unit prices** in the payload and no size/quantity field (unit_price
  was null on all 20 probe rows). Per-unit math needs name parsing (done
  here) or clipping-image OCR (P3).
- **ShopRite is missing** — no Flipp flyer for 08520. A second source is a
  P3 task; P2 launches without it.
- Flipp's endpoints are public but unsanctioned (governed by Flipp's Terms
  of Use) and can change or throttle without notice. The pipeline fails
  loudly rather than degrading silently; a sanctioned feed is the long-term
  route if this breaks.

## Manual steps for Ankit (required before the first live run)

1. **Run the DDL.** Supabase Dashboard → SQL Editor → paste
   `DealFinder/supabase/001-dealfinder-schema.sql` → Run. (Idempotent —
   safe to run twice.) Then **Project Settings → Data API → Exposed
   schemas → add `dealfinder`** — without this, PostgREST returns 406.
2. **Add the repo secret.** GitHub repo → Settings → Secrets and variables
   → Actions → New repository secret → name `SUPABASE_SERVICE_ROLE_KEY`,
   value = the Supabase secret key (`sb_secret_...`, from Supabase
   Dashboard → Settings → API Keys; the legacy `service_role` JWT also
   works). Ankit holds the key; it is never in this repo, in chat, or in
   any file.

## Verify

After both manual steps, run the workflow once by hand (Actions →
DealFinder weekly refresh → Run workflow) to load the first live prices.
That manual run is P2's done state. Check it in the Supabase SQL editor:

```sql
-- Row counts (expect flyers ~96 for 08520 — the probe saw 60 only because
-- it capped at --limit 60 — and prices in the low hundreds for the
-- 12-item seed list):
SELECT (SELECT count(*) FROM dealfinder.stores)  AS stores,
       (SELECT count(*) FROM dealfinder.items)   AS items,
       (SELECT count(*) FROM dealfinder.flyers)  AS flyers,
       (SELECT count(*) FROM dealfinder.prices)  AS prices;

-- Latest prices, cheapest first:
SELECT i.name, s.merchant, p.price, p.regular_price, p.valid_to, p.fetched_at
  FROM dealfinder.prices p
  JOIN dealfinder.items i ON i.id = p.item_id
  JOIN dealfinder.stores s ON s.id = p.store_id
 WHERE p.zip = '08520'
 ORDER BY p.fetched_at DESC, p.price ASC
 LIMIT 20;
```

## Run a dry-run locally

```bash
node DealFinder/pipeline/fetch-prices.mjs --dry-run --zip 08520
```

Dry-run hits Flipp live (13 calls: 1 flyer list + 12 searches, ~800 ms
apart) but writes nothing to Supabase — no keys needed. Verified
2026-11-12: 96 flyers; 455 raw rows → 336 kept price rows (97 junk
dropped, 22 dupes); milk/eggs samples match the probe exactly (Horizon
$4.49 Weis, TruMoo $2.99 Giant, Giant eggs $1.87).

## Costs

$0/month at launch scale: GitHub Actions free tier, Supabase free tier,
Flipp route free with no key.
