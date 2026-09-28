# InvestIQ V2 — Real Estate Intelligence (Live Data)

A rebuild of the original `InvestIQ` app. Same dark UI language, but this time
**every number is real and every button works** — verified end-to-end on 2026-09-28.

**Live:** https://apatel85.github.io/Dashboards/InvestIQV2/

## What was wrong with V1 (review summary)

**Critical — the app could not function at all:**
1. The file is truncated mid-HTML (ends at `<d` inside the STR-vs-LTR view). There is
   **zero application JavaScript** — no `<script>` block, no `fetch()`, no Supabase client.
2. All 6 click handlers (`showView`, `triggerFullSync`, `triggerInsightsSync`,
   `loadAllData`, `filterTable`, `setMode`) call functions that don't exist → every
   button throws `ReferenceError`.
3. The "SUPABASE LIVE" / "REAL DATA" badges are false: zero network calls are made,
   and the referenced `property_leads` table was never created in Supabase.
4. The "API Setup" nav item points to `view-apisetup`, which doesn't exist in the
   file — clicking it blanks the page.
5. The STR-vs-LTR and API-setup views were never finished (cut off by the truncation).

**Data-integrity issues:**
6. V1 assumed the Census API works keyless from browsers — it no longer does
   (returns a "Missing Key" wall as of 2026).
7. "HUD FY2026" labeling is stale — FY2027 SAFMRs are published (effective Oct 1, 2026).
8. No loading, error, or empty states were wired up; charts had no code behind them.

**UI/UX fixes applied in V2:**
- Replaced fake "Sync 25 Markets" buttons with honest live loading: data refreshes
  on every visit, with a status pill showing **LIVE** / **CACHED** / **ERROR**.
- Every metric carries its source; the Methodology view documents formulas, weights,
  and limits. Nothing is labeled "real" unless it is.
- STR vs LTR is now an honest **scenario calculator** (you set nightly rate,
  occupancy, costs) instead of fake "STR demand data" — clearly badged as a model.
- Working global search (type a ZIP → jumps to its detail page), sortable columns,
  CSV export, market detail drill-downs, graceful `—` for suppressed Census estimates.
- No inline `onclick` attributes; Chart.js guarded so a CDN failure degrades to a
  message instead of a blank panel.

## Data sources (all free, no keys)

| Data | Source | How |
|---|---|---|
| ZIP rents (0–4 BR) | **HUD FY2027 Small Area FMRs**, eff. 2026-10-01 | Baked into `data/markets.json`, extracted 2026-09-28 from the official 4.4 MB `FY27_safmrs.xlsx` |
| Home values, income, renter %, vacancy | **ACS 2024 5-year** via Census Reporter API | Fetched **live in the browser** on each visit (batched, 7-day localStorage cache) |

Verified 2026-09-28: all 29 ZIPs return complete Census payloads; all 29 present in
the HUD file. Derived: gross yield, price-to-rent, rent burden, composite score (documented weights).

## Why no Supabase / login?

Every number comes from free public sources that need no key and no backend.
A database would add friction without making any number more real. If you later
want watchlists, alerts, or saved comparisons, that's when a Supabase
`invest_iq` schema earns its place.

## Deploy

Static files — any static host works. Currently served via GitHub Pages from
`Dashboards/InvestIQV2/`. No build step.
