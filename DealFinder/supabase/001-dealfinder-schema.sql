-- ============================================================================
-- DealFinder P2 — Supabase schema migration (001)
-- Project: iknfvddnevudpjtyxkbh (shared Supabase project)
-- Date: 2026-11-12
--
-- HOW TO APPLY (manual step for Ankit — there is no working Supabase CLI here):
--   1. Supabase Dashboard → SQL Editor → paste this file → Run.
--   2. Project Settings → Data API → Exposed schemas → add `dealfinder`.
--      (Without step 2, PostgREST returns 406 "Invalid schema" for this schema.)
--
-- IDEMPOTENT: safe to run twice. Every object uses IF NOT EXISTS / OR REPLACE /
-- ON CONFLICT-safe patterns, and policies are dropped before re-creation.
--
-- SECURITY: Row Level Security is ON for every table. SELECT is open to anon
-- and authenticated (these are public prices — the app shows them to anyone,
-- no sign-in). There are NO write policies for anon/authenticated: only the
-- service_role key (held in the GitHub repo secret, never in this repo) can
-- write, via the weekly pipeline. service_role bypasses RLS by design.
--
-- NOTE (P3 follow-up): tracked_items.anon_id is designed to hold the
-- Supabase anonymous-auth uid() once anonymous auth lands in P3. At that
-- point the open SELECT policies on tracked_items and alerts should be
-- tightened to anon_id = auth.uid() so one household cannot read another's
-- tracked list. Until then, P2 keeps them open-read like the price tables.
--
-- DATA NOTES (from the 2026-11-12 probe, ZIP 08520):
--   - Flipp returns flyer/sale prices only; there is no everyday shelf price.
--   - No unit price and no size/quantity field in the payload; the pipeline
--     parses size from the item name (best effort) or leaves it null.
--   - flyer_item_id is stable while a flyer is active; it is the history key.
--   - ShopRite has no Flipp flyer for 08520 — a second source is a P3 task.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS dealfinder;

-- --------------------------------------------------------------------------
-- stores: one row per retailer + ZIP (branch-level names need a store-locator
-- source; until then name is null and merchant is the display name).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealfinder.stores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant      text NOT NULL,
  merchant_id   integer,
  name          text,
  zip           text NOT NULL,
  distance_miles numeric(6,2),
  source        text NOT NULL DEFAULT 'flipp',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_merchant_zip_key UNIQUE (merchant, zip)
);

-- --------------------------------------------------------------------------
-- items: one row per normalized product. norm_key is the pipeline's
-- brand + cleaned name + size key (best effort; same product has a different
-- name at every chain, so this key improves over time — it is not perfect).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealfinder.items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  norm_key    text NOT NULL,
  brand       text,
  name        text NOT NULL,
  raw_name    text,
  size_text   text,
  size_value  numeric(10,3),
  size_unit   text,
  category    text,
  upc         text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_norm_key_key UNIQUE (norm_key)
);

-- --------------------------------------------------------------------------
-- flyers: one row per retailer flyer per ZIP, with its validity window.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealfinder.flyers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flipp_flyer_id bigint,
  merchant       text NOT NULL,
  merchant_id    integer,
  name           text,
  valid_from     timestamptz,
  valid_to       timestamptz,
  zip            text NOT NULL,
  source         text NOT NULL DEFAULT 'flipp',
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flyers_flipp_flyer_zip_key UNIQUE (flipp_flyer_id, zip)
);

-- --------------------------------------------------------------------------
-- prices: one row per weekly snapshot. THIS TABLE IS THE 30-DAY HISTORY.
-- A snapshot is one row per item + store + flyer item + validity window;
-- re-running the pipeline upserts the same row (latest fetch wins).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealfinder.prices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            uuid NOT NULL REFERENCES dealfinder.items (id),
  store_id           uuid NOT NULL REFERENCES dealfinder.stores (id),
  flyer_item_id      bigint,
  price              numeric(10,2) NOT NULL CHECK (price > 0),
  regular_price      numeric(10,2) CHECK (regular_price IS NULL OR regular_price > 0),
  unit_price         numeric(10,4),
  unit               text,
  sale_story         text,
  loyalty_condition  text,
  clipping_image_url text,
  valid_from         timestamptz,
  valid_to           timestamptz,
  zip                text NOT NULL,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  source             text NOT NULL DEFAULT 'flipp',
  CONSTRAINT prices_snapshot_key
    UNIQUE (item_id, store_id, flyer_item_id, valid_from, valid_to)
);

-- --------------------------------------------------------------------------
-- tracked_items: a household's watched items. anon_id is a client-generated
-- anonymous id in P2 (auth.uid() once anonymous auth lands in P3).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealfinder.tracked_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id    uuid NOT NULL,
  item_id    uuid NOT NULL REFERENCES dealfinder.items (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracked_items_anon_item_key UNIQUE (anon_id, item_id)
);

-- --------------------------------------------------------------------------
-- alerts: one row per fired alert. The pipeline creates at most one alert
-- per tracked item per day (unique index below). status 'pending' until the
-- app surfaces it; sent_at is set when a delivery channel sends it (P4).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dealfinder.alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_item_id  uuid REFERENCES dealfinder.tracked_items (id) ON DELETE CASCADE,
  item_id          uuid NOT NULL REFERENCES dealfinder.items (id),
  store_id         uuid REFERENCES dealfinder.stores (id),
  price            numeric(10,2) NOT NULL,
  avg_30d          numeric(10,2) NOT NULL,
  gap_pct          numeric(6,2),
  snapshot_count   integer NOT NULL DEFAULT 0,
  channel          text NOT NULL DEFAULT 'in_app',
  status           text NOT NULL DEFAULT 'pending',
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS alerts_one_per_day
  ON dealfinder.alerts (tracked_item_id, (created_at::date));

-- --------------------------------------------------------------------------
-- Indexes (query paths the app and pipeline use).
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS prices_item_store_time_idx
  ON dealfinder.prices (item_id, store_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS prices_flyer_item_idx
  ON dealfinder.prices (flyer_item_id);
CREATE INDEX IF NOT EXISTS prices_zip_time_idx
  ON dealfinder.prices (zip, fetched_at DESC);
CREATE INDEX IF NOT EXISTS flyers_merchant_valid_idx
  ON dealfinder.flyers (merchant, valid_to);
CREATE INDEX IF NOT EXISTS flyers_zip_valid_idx
  ON dealfinder.flyers (zip, valid_to);
CREATE INDEX IF NOT EXISTS tracked_items_anon_idx
  ON dealfinder.tracked_items (anon_id);
CREATE INDEX IF NOT EXISTS alerts_tracked_time_idx
  ON dealfinder.alerts (tracked_item_id, created_at DESC);

-- --------------------------------------------------------------------------
-- Row Level Security: ON everywhere. SELECT open to anon + authenticated
-- (public prices). NO write policies for anon/authenticated — writes go
-- through the service_role key in the weekly pipeline only.
-- --------------------------------------------------------------------------
ALTER TABLE dealfinder.stores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealfinder.items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealfinder.flyers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealfinder.prices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealfinder.tracked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealfinder.alerts        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DealFinder public read" ON dealfinder.stores;
CREATE POLICY "DealFinder public read" ON dealfinder.stores
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "DealFinder public read" ON dealfinder.items;
CREATE POLICY "DealFinder public read" ON dealfinder.items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "DealFinder public read" ON dealfinder.flyers;
CREATE POLICY "DealFinder public read" ON dealfinder.flyers
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "DealFinder public read" ON dealfinder.prices;
CREATE POLICY "DealFinder public read" ON dealfinder.prices
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "DealFinder public read" ON dealfinder.tracked_items;
CREATE POLICY "DealFinder public read" ON dealfinder.tracked_items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "DealFinder public read" ON dealfinder.alerts;
CREATE POLICY "DealFinder public read" ON dealfinder.alerts
  FOR SELECT TO anon, authenticated USING (true);

-- --------------------------------------------------------------------------
-- Grants: schema usage + SELECT for every role the app/pipeline uses.
-- (service_role bypasses RLS; the grants keep the anon/authenticated read
-- path working once the schema is exposed to PostgREST.)
-- --------------------------------------------------------------------------
GRANT USAGE ON SCHEMA dealfinder TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA dealfinder TO anon, authenticated, service_role;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA dealfinder TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dealfinder
  GRANT SELECT ON TABLES TO anon, authenticated, service_role;

-- ============================================================================
-- VERIFICATION QUERIES (run after applying; keep them commented in the file).
-- ----------------------------------------------------------------------------
-- -- 1. Tables exist:
-- -- SELECT table_name FROM information_schema.tables
-- --  WHERE table_schema = 'dealfinder' ORDER BY table_name;
-- --
-- -- 2. RLS is on and the public-read policy exists on every table:
-- -- SELECT tablename, rowsecurity FROM pg_tables
-- --  WHERE schemaname = 'dealfinder' ORDER BY tablename;
-- -- SELECT schemaname, tablename, policyname, roles, cmd
-- --   FROM pg_policies WHERE schemaname = 'dealfinder' ORDER BY tablename;
-- --
-- -- 3. Row counts after the first pipeline run (expect flyers ~96 for 08520
-- --    — the probe saw 60 only because it capped at --limit 60 — and
-- --    prices in the low hundreds for the 12-item seed list):
-- -- SELECT (SELECT count(*) FROM dealfinder.stores)  AS stores,
-- --        (SELECT count(*) FROM dealfinder.items)   AS items,
-- --        (SELECT count(*) FROM dealfinder.flyers)  AS flyers,
-- --        (SELECT count(*) FROM dealfinder.prices)  AS prices;
-- --
-- -- 4. Latest prices for East Windsor, cheapest first:
-- -- SELECT i.name, s.merchant, p.price, p.regular_price, p.valid_to, p.fetched_at
-- --   FROM dealfinder.prices p
-- --   JOIN dealfinder.items i ON i.id = p.item_id
-- --   JOIN dealfinder.stores s ON s.id = p.store_id
-- --  WHERE p.zip = '08520'
-- --  ORDER BY p.fetched_at DESC, p.price ASC
-- --  LIMIT 20;
-- --
-- -- 5. 30-day average of daily best prices for one item (the alert rule's
-- --    average — compare with what the pipeline computed):
-- -- SELECT date_trunc('day', fetched_at)::date AS day, min(price) AS best
-- --   FROM dealfinder.prices
-- --  WHERE item_id = '<item uuid>' AND fetched_at >= now() - interval '30 days'
-- --  GROUP BY day ORDER BY day;
-- --
-- -- 6. If a PostgREST read returns 406 "Invalid schema": the `dealfinder`
-- --    schema is not under Project Settings → Data API → Exposed schemas.
-- ============================================================================
