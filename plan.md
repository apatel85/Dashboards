# Sales & COGS Analysis Dashboard — Plan

## Context

You have 2024–2025 Shopify-style sales export (`00. Total sales by product_Detail_COGS - 2024-01-01 - 2025-12-31.csv`, ~10K rows, daily grain with COGS) and a Product Master (`Product_Master_20260427.csv`, ~19K SKU variants with brand/category). Existing `Cricket_Sales_Dashboard_2025_v2.html` is a vanilla-JS single-file viewer with hardcoded data, no charts, and no persistence — we are rebuilding fresh.

Goal: a portable, single-file HTML dashboard you can open in any browser (mobile or desktop). It stores the Product Master and sales history in browser IndexedDB so future sales CSVs can be uploaded to **append/replace by (SKU, Date)**. The Product Master can be re-uploaded to overwrite the stored mapping. Sales rows are enriched with Brand + Category by SKU lookup; unmapped SKUs are flagged in a Data Issues panel and bucketed as "Unknown" until you decide how to resolve them.

## Decisions confirmed

- **Stack:** single self-contained `.html` file, vanilla JS + Chart.js (CDN with offline fallback), IndexedDB for persistence.
- **Sales upload merge key:** `(SKU, full Date)` — new file overwrites matching rows, preserves the rest.
- **Product Master upload:** wholesale overwrite of stored PM, then re-map all sales.
- **Unmapped SKUs:** flagged in Data Issues tab; counted under Brand/Category = "Unknown" so totals reconcile to the source CSV.
- **Time grain:** daily (Day column in new file). Tab 2 supports day / week / month views with YoY overlay.

## Deliverable

Single file: `Sales_COGS_Dashboard.html`

## Data model (IndexedDB)

- `product_master` store — keyed by `sku_code`. Fields: `brand, product_type (category), product_title, variant_title, color, size`.
- `sales` store — keyed by `${sku}|${isoDate}`. Fields: `date (ISO), year, month, day, sku, productTitle, vendor, productTypeRaw, channel, qty, grossSales, discounts, returns, netSales, totalSales, cogs, grossProfit`.
- `meta` store — last-upload timestamps, source filenames, row counts for validation.
- Enrichment (`brand`, `category`) is computed at read time via PM join; nothing stale stored on sales rows.

## Tabs (in order)

1. **Summary (Overview)** — landing page, infographics:
   - KPI cards: Total Revenue, Total Qty, Total COGS, Total Gross Profit, Gross Margin %, Avg Order Value, # Active SKUs, # Brands.
   - Charts: Revenue by Brand (donut), Revenue by Category (donut), Brand × Category heatmap, Monthly trend (line), Top 10 Products (bar), Top 10 SKUs by Margin %.
   - YoY toggle: side-by-side 2024 vs 2025 with delta % per metric.
   - Filter bar (Brand / Category / Product / Year) shared with all tabs.

2. **Sales Trends (Day / Month)** — time-series tab:
   - Granularity switch: Day / Week / Month / Quarter.
   - Dual-axis line: Qty (left) + Amount (right).
   - YoY overlay (2024 vs 2025 on same axis).
   - Heatmap calendar (day-of-week × week-of-year) for daily volume.
   - Hour-of-day distribution (uses `Hour of day` column).
   - Drill-down: click a month → table of SKUs in that month.

3. **Margin Analysis (Product level)** — uses COGS:
   - Product-level table: SKU, Title, Brand, Category, Qty, Revenue, COGS, Gross Profit, Margin %.
   - Roll-up summary cards at top: Margin % by Brand, by Category, by Brand+Category.
   - Sortable on every column; filter pill bar.
   - Highlight rows: margin < 20% (red), margin > 50% (green), negative margin (flag).
   - YoY margin shift column (2025 margin% − 2024 margin%).

4. **Detail Grid (Brand → Category → Product)** — original ask:
   - Hierarchical table: Brand / Category / Product / SKU rows.
   - Columns: Jan…Dec (current selected year) + Year Total. Toggle Qty ↔ Amount ↔ Both (split cell).
   - Sort on any column; expand/collapse groups.
   - YoY toggle adds a second row per group with prior-year values + delta %.
   - Export current view to CSV.

5. **Data Issues** — validation center:
   - Row count: sales CSV vs imported (must match).
   - Sum check: source `Total sales` total vs imported total (within $0.01).
   - Unmapped SKUs list — for each: SKU, sales qty, $, suggested brand/category from `Product vendor` + `Product type` columns. Actions: **Assign to existing brand/cat**, **Add new mapping to PM**, **Mark as Unknown**.
   - Brand mismatch: where sales `Product vendor` ≠ PM `brand` for the same SKU.
   - Duplicate detection: same `(SKU, Date)` appearing twice in the upload.
   - Negative/zero rows: returns-only rows surfaced for review.
   - Each issue has a "How to resolve" suggestion + an action button. Resolutions are stored and re-applied on future uploads.

## Global features

- **Filter bar** (sticky, shared across tabs): Brand multi-select, Category multi-select, Product search, Year(s).
- **YoY toggle** present on every tab.
- **Sort** on every table column.
- **Upload panel** (gear/upload icon in header):
  - Upload Sales CSV → merge by (SKU, Date).
  - Upload Product Master CSV → overwrite + re-map.
  - Clear all data (with confirm).
  - Export current state as JSON backup.
- **Mobile responsive:** CSS grid with breakpoints at 768px and 480px; tables become card stacks on narrow screens; charts use Chart.js responsive mode; sticky filter bar collapses to a drawer on mobile.

## Validation & testing levels

1. **Parser unit checks** (in-page, run on upload): row count, header schema match, numeric coercion, date parse success rate.
2. **Reconciliation:** sum of imported `Total sales` and `Net items sold` must equal sums computed from source CSV (display diff, block save if > $0.01 or > 1 unit).
3. **Mapping coverage:** % of sales rows with successful PM join — shown as a banner.
4. **Cross-tab consistency:** total Qty on Summary == sum of Qty in Detail Grid == sum of Qty in Margin tab. Auto-asserted, surfaced if mismatch.
5. **Upload idempotency:** uploading the same file twice produces zero net change (test via row counts before/after).
6. **Manual smoke tests** documented at bottom of file: 6 scenarios covering re-upload, PM overwrite, filtering, YoY, mobile layout, export.

## Critical files

- **Read-only inputs:**
  - `00. Total sales by product_Detail_COGS - 2024-01-01 - 2025-12-31.csv` — sales source.
  - `Product_Master_20260427.csv` — PM source.
  - `Cricket_Sales_Dashboard_2025_v2.html` — reference only for SKU edge cases (Type C SKUs, brand mismatch heuristics) — do not import code.
- **To create:** `Sales_COGS_Dashboard.html` (single file, all CSS + JS inline; CDN for Chart.js + PapaParse with offline fallback embedded).

## Implementation order

1. Scaffold HTML shell, IndexedDB wrapper, CSV parser (PapaParse), upload UI.
2. Product Master ingest + storage; Sales ingest + (SKU, Date) merge.
3. Validation engine + Data Issues tab.
4. Detail Grid tab (Tab 4) — most direct mapping from existing data shape.
5. Summary tab (Tab 1) with Chart.js infographics.
6. Sales Trends tab (Tab 2) with day/week/month granularity + YoY.
7. Margin tab (Tab 3).
8. Mobile responsive pass.
9. Test pass: run all 6 validation levels with the real CSVs.

## Verification (end-to-end)

1. Open `Sales_COGS_Dashboard.html` in Chrome.
2. Upload `Product_Master_20260427.csv` → confirm row count 19K, banner shows "PM loaded".
3. Upload `00. Total sales by product_Detail_COGS …csv` → confirm 10,172 rows, reconciliation banner shows 100% match on Total sales sum.
4. Data Issues tab: review unmapped SKU list; pick one, test "Add new mapping" flow; confirm it updates Detail Grid.
5. Summary tab: confirm KPI cards and charts render; toggle YoY; confirm 2024 vs 2025 deltas.
6. Tab 2: switch Day/Month; confirm YoY overlay; confirm Hour-of-day chart populated.
7. Tab 3: sort by Margin % asc; confirm negative margins flagged.
8. Tab 4: filter Brand=SG, expand category; toggle Qty/Amount/Both.
9. Re-upload the same sales CSV; confirm row count unchanged (idempotency).
10. Resize to 375px width; confirm tables collapse to cards and filter bar drawers.
11. Export CSV from Tab 4; open in Excel and spot-check.
