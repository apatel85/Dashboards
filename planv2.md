# Sales & COGS Dashboard v2 — Implementation Plan

## Context

The existing `Sales_COGS_Dashboard.html` (1,722 lines, 5 tabs) was built for a specific Shopify-format CSV with hardcoded column expectations. The user wants to:

1. Make it work with **any** sales/PM CSV (flexible column mapping)
2. Add a **P&L Analyzer** tab with user-entered expenses and a loan/cashflow calculator
3. **Revamp Sales Trends** — currently too busy/confusing
4. **Improve Summary** — better real estate use, move bar charts next to donuts
5. **Redesign Detail Grid** — Brand / Category / Product as flat explicit columns (no depth dropdown)
6. Make **charts interactive** (click-to-filter)
7. Support `sub_category` from the new Product Master (20260506 version)
8. Apply **appplanning.md** standards: 44px touch targets, debug button, mobile-first

**Output file:** `C:\Users\apate\Claude Cowork Projects\Sales and COGS Analysis\Sales_COGS_Dashboard.html` (full rewrite)
**Also update:** `C:\Users\apate\Claude Cowork Projects\Sales and COGS Analysis\PLAN.md`

---

## Data Files (new versions)

| File | Key change vs prior |
|------|-------------------|
| `OneDrive\01. CSO\00. Total-sales-by-product_Detail_COGS…csv` | Same 20 columns, same format |
| `OneDrive\01. CSO\CSO_InventoryReport\Product_Master_20260506.csv` | **New column:** `sub_category` (between `product_type` and `product_title`) |

**New PM columns:** `brand, product_type, sub_category, product_title, variant_title, Color, Size, RH_LH, Handle_Type, sku_code`

---

## IndexedDB Changes

**DB_NAME:** `SalesCOGS_v3` (version bump to force schema upgrade)
**DB_VER:** 1

| Store | Key | Changed? | New fields |
|-------|-----|----------|------------|
| `product_master` | `sku_code` | ✅ Add field | `sub_category` |
| `sales` | `${sku}\|${isoDate}` | No change | — |
| `meta` | `key` | ✅ Add record | `column_mappings` (per-file schema cache) |
| `custom_mappings` | `sku_code` | No change | — |
| `col_mappings` | `schema_hash` | **NEW store** | `{ schemaHash, salesMap, pmMap, salesExtras, pmExtras }` |

---

## Tab Changes

| # | Tab | Change |
|---|-----|--------|
| 0 | 📊 Summary | Redesign layout: 4-column chart row (donuts + bars together); gradient KPI cards; click-to-filter on all charts |
| 1 | 📈 Sales Trends | **Full revamp** — clean, 3-section layout (see below) |
| 2 | 💹 P&L Analyzer | **NEW TAB** — full P&L statement + waterfall chart + loan calculator |
| 3 | 💰 Margin Analysis | Add Sub Category column; minor improvements |
| 4 | 🗂 Detail Grid | **Redesign** — flat table with Brand/Category/Sub Cat/Product as columns |
| 5 | ⚠️ Data Issues | Keep existing + show column mapping info |

---

## Feature Specifications

### A. Column Mapping System

**Auto-detection** (case-insensitive alias matching):

```
Sales required fields → aliases:
  sku          → ['product variant sku','sku','variant sku','sku code','item sku']
  date         → ['day','date','order date','transaction date','sale date']
  qty          → ['net items sold','qty','quantity','units sold','items sold']
  totalSales   → ['total sales','total revenue','revenue','sales amount']
  cogs         → ['cost of goods sold','cogs','cost of goods','item cost']
  productTitle → ['product title','product name','title','name']
  vendor       → ['product vendor','vendor','brand','supplier']
  channel      → ['sales channel','channel','platform']
  grossSales   → ['gross sales','gross revenue']
  discounts    → ['discounts','discount','discount amount']
  returns      → ['returns','return amount','refunds']
  netSales     → ['net sales','net revenue']
  taxes        → ['taxes','tax']
  grossProfit  → ['gross profit','profit']
  hour         → ['hour of day','hour']

PM required fields → aliases:
  sku_code      → ['sku_code','sku code','sku','product variant sku']
  brand         → ['brand','vendor','manufacturer']
  product_type  → ['product_type','product type','type','category']
  product_title → ['product_title','product title','title','name']
  sub_category  → ['sub_category','subcategory','sub category','sub type']
```

**Mapping Modal** (shown on upload if any required field unmatched OR user opts to review):
- Left column: required field name + description
- Right column: dropdown of CSV headers (auto-selected if matched, blank if not)
- Green ✓ badge on auto-matched rows; Red ✗ on unmatched
- Bottom section: "Extra Columns" — checkbox list of remaining CSV headers not used in required mapping
  - Checked = include in stored rows (available as filters + analytics)
  - Default: core metric columns checked, ID/internal columns unchecked
- "Save for this file format" checkbox → stores mapping in `col_mappings` IDB store keyed by sorted header hash
- Confirm button proceeds with ingest; Cancel aborts upload

**Extra column handling:**
- Included extra PM columns → stored on `product_master` records → appear in filter bar (if text) or KPI options (if numeric)
- Included extra Sales columns → stored on `sales` records
- `sub_category` from PM → always included → shows in filter bar, Detail Grid, Margin table

---

### B. Summary Tab (redesigned layout)

```
┌─────────────────────────────────────────────────────────────────┐
│  KPI Cards (8 cards, gradient backgrounds, YoY delta chips)     │
│  Revenue | Qty | COGS | Gross Profit | Margin% | AOV | SKUs | Brands │
├────────────────┬────────────────┬──────────────┬────────────────┤
│ Brand Revenue  │ Category Rev.  │ Top 10       │ Top 10 SKUs   │
│ (donut)        │ (donut)        │ Products     │ by Margin %   │
│ CLICK→filter   │ CLICK→filter   │ (horiz bar)  │ (horiz bar)   │
│                │                │ CLICK→filter │ color-coded   │
├────────────────┴────────────────┴──────────────┴────────────────┤
│  Monthly Revenue Trend (full width line + dual-axis qty)        │
│  CLICK month → drill-down SKU table appears below              │
└─────────────────────────────────────────────────────────────────┘
```

**KPI card gradients** (8 unique, using CSS linear-gradient on `--bg2` background):
- Revenue: indigo gradient
- Qty: purple gradient
- COGS: pink gradient
- Gross Profit: teal gradient
- Margin%: amber gradient
- AOV: blue gradient
- SKUs: emerald gradient
- Brands: orange gradient

**Chart interactivity:**
- All donut/bar chart clicks call `filterByChartClick(type, label)` which updates `State.filters` and re-renders all tabs
- Active filter shown as removable pill chip in filter bar
- Monthly trend: `onClick` shows drill-down table of SKUs in that period

---

### C. Sales Trends Tab (revamped — clean & simple)

**3-section layout:**

```
Section 1 (full width):
  [Day] [Week] [Month] [Quarter]  ←  granularity buttons  →  [YoY toggle]
  Revenue Over Time — single clean line chart (or bar for Day/Week)
  YoY: shows 2024 and 2025 as separate colored lines, clearly labeled

Section 2 (two cards side by side):
  [Qty Sold Over Time — bar chart]   [Sales by Channel — donut]

Section 3 (collapsible "Advanced"):
  [Hour of Day Distribution — bar]   ← only shown if hour data available
```

**Removed from Trends:** heatmap calendar (moved to "Advanced" or removed entirely — too complex for main view)

---

### D. P&L Analyzer Tab (NEW)

**Layout:** Two-column on desktop (P&L left 58%, chart right 42%), single column on mobile. Loan calculator below (full width).

**Period selector:** All Time / 2024 / 2025 / Custom range

**P&L Statement structure:**
```
REVENUE
  Gross Sales              $x,xxx,xxx    100.0%   [from data, read-only]
  Discounts               -$x,xxx         x.x%
  Returns                 -$x,xxx         x.x%
  ─────────────────────────────────────────────
  Net Sales                $x,xxx,xxx     xx.x%

Cost of Goods Sold        -$x,xxx,xxx     xx.x%
  ═════════════════════════════════════════════
  GROSS PROFIT              $xxx,xxx       xx.x%   [green, bold]

OPERATING EXPENSES
  Rent                      $[____]        x.x%   [🔒 lock] [🗑]
  Salary & Wages            $[____]        x.x%   [🔒 lock] [🗑]
  CC Processing Fees        $[____]        x.x%   [🔒 lock] [🗑]
  Professional Fees         $[____]        x.x%   [🔒 lock] [🗑]
  Platform Fees             $[____]        x.x%   [🔒 lock] [🗑]
  Advertising & Marketing   $[____]        x.x%   [🔒 lock] [🗑]
  Travel & Meals            $[____]        x.x%   [🔒 lock] [🗑]
  Miscellaneous             $[____]        x.x%   [🔒 lock] [🗑]
  [+ Add Custom Expense]
  ─────────────────────────────────────────────
  Total Operating Expenses  $xxx,xxx       xx.x%

  ═════════════════════════════════════════════
  OPERATING INCOME          $xxx,xxx       xx.x%   [amber/green, bold]

OTHER
  Interest Payments         $[____]        x.x%   [🔒 lock] [🗑]
  ─────────────────────────────────────────────
  ═════════════════════════════════════════════
  NET INCOME                $xxx,xxx       xx.x%   [green/red, bold]
```

**Expense row behavior:**
- **Normal mode (🔓 unlocked):** User types dollar amount → % auto-calculated as `amount / grossSales * 100`
- **Locked mode (🔒 locked):** User types % → dollar amount auto-calculated as `pct / 100 * grossSales`. This % "sticks" even when revenue changes (static % of sales)
- Custom rows added via `[+ Add Custom Expense]` button → editable label
- All expense data stored in `localStorage` key `cso_pl_v2` as JSON array

**Waterfall chart (right panel):**
- Horizontal bridge/waterfall using Chart.js stacked bar (transparent base + colored delta)
- Bars: Gross Sales → COGS → Gross Profit → each expense → Net Income
- Colors: revenue bars green, expense bars red/orange, result bars teal/red

**Loan Calculator (below):**
```
Loan Balance: $[________]   Interest Rate: [__]%/yr   Term: [__] years
─────────────────────────────────────────────────────────────────────
Monthly Payment:      $x,xxx.xx
Annual Debt Service:  $xx,xxx.xx
Net Cash Flow:        $xxx,xxx.xx  (Net Income − Annual Debt Service)
Status:               ✅ Positive Cash Flow  /  ❌ Negative Cash Flow
```
Formula: `Monthly = P × r(1+r)^n / ((1+r)^n − 1)` where `r = annualRate/1200`, `n = years×12`

---

### E. Detail Grid Tab (redesigned — flat table)

**No depth dropdown.** Table has explicit columns:

| Brand | Category | Sub Cat | Product | Jan | Feb | … | Dec | Total |
|-------|----------|---------|---------|-----|-----|---|-----|-------|
| [product rows, sorted by brand→category→revenue] |
| [Category subtotal row — highlighted amber] |
| [Brand total row — highlighted indigo, bold] |

**Row types:**
- `row-product` — white/default background, all 4 identifier columns filled
- `row-cat-total` — amber tint background, "↳ {Category} Total" in Category column, Brand shown
- `row-brand-total` — indigo tint background, "▶ {Brand} TOTAL" spanning first 4 columns (colspan)

**Controls (top bar):**
- Year selector (2024 / 2025 / All)
- Toggle: Qty | Amount | Both
- Search input (filters product rows, keeps their parent subtotals)
- Export CSV button

**Sub Category column:** shown only when PM data contains `sub_category` values

---

### F. Interactive Charts

All charts gain `onClick` handler:
```js
onClick: (evt, elements, chart) => {
  if (!elements.length) return;
  const label = chart.data.labels[elements[0].index];
  filterByChartClick(chartType, label); // updates State.filters + re-renders
}
```
- Cursor changes to `pointer` on chart hover
- Active filter displayed as removable pill in filter bar
- Clicking same label again removes the filter (toggle)

---

### G. Appplanning.md Standards Applied

- **44px touch targets:** All `<button>`, `<input>`, `<select>` get `min-height: 44px; min-width: 44px`
- **Debug button:** Floating 🐛 button bottom-right. Click → toggles debug panel showing: State snapshot (JSON), DB row counts, last upload info, Export Debug JSON button
- **Mobile breakpoints:** 1024px → 3-col to 2-col; 768px → 2-col to 1-col; 480px → table to card stack
- **Track A:** Single `.html` file, no build step, works in Android Chrome

---

## Implementation Steps

### Step 1 — Update HTML structure + CSS
- Add P&L tab button (#2, shift Margin to #3, Detail to #4, Issues to #5)
- Add `panel-2` (P&L) HTML skeleton
- Update CSS: gradient KPI cards, 44px touch targets, P&L table styles, debug panel styles
- Bump `DB_NAME` to `SalesCOGS_v3`, add `col_mappings` store

### Step 2 — Column Mapping System
- Add `SALES_FIELD_ALIASES` and `PM_FIELD_ALIASES` constants
- Add `autoDetectMapping(headers, aliases)` function → returns `{ matched, unmatched, extras }`
- Add `schemaHash(headers)` → MD5-lite hash of sorted headers
- Add `saveColMapping()` / `loadColMapping()` functions (uses `col_mappings` IDB store)
- Add column mapping modal HTML
- Add `openMappingModal(fileType, headers, autoMap)` / `confirmMapping()` functions
- Modify `handlePMFile()` and `handleSalesFile()` to call mapping system before ingest

### Step 3 — IndexedDB schema update
- Add `sub_category` field to `product_master` records
- Add `col_mappings` object store
- Update `enrichRow()` to include `subCategory`
- Update `getPM()` cache to include `sub_category`
- Add sub_category to filter bar and `applyStateFilters()`

### Step 4 — Summary Tab redesign
- Change `charts-grid` layout to 4-column row
- Add `filterByChartClick(type, label)` function
- Add `onClick` to `renderBrandDonut()`, `renderCatDonut()`, `renderTopProducts()`, `renderTopMarginSKUs()`
- Add gradient CSS classes to KPI cards
- Add drill-down table below monthly trend on click

### Step 5 — Sales Trends revamp
- Replace current 4-section layout with clean 3-section layout
- Remove heatmap from main view (put in collapsible Advanced section)
- Simplify `renderTrends()` function
- Add collapsible Advanced section with hourly chart

### Step 6 — P&L Analyzer tab
- Add `PL_STATE` object (expenses array + loan inputs)
- Add `loadPLState()` / `savePLState()` (localStorage `cso_pl_v2`)
- Add default expense categories array
- Add `renderPL()` main function
- Add `renderPLStatement()` — builds P&L table HTML
- Add `renderPLChart()` — waterfall chart via Chart.js
- Add `renderLoanCalc()` — loan calculator section
- Add `addExpenseRow()`, `removeExpenseRow()`, `toggleExpenseLock()` functions
- Add `updateExpenseAmount(id, value)` / `updateExpensePct(id, value)` with live recalc
- All input changes call `savePLState()` then `renderPL()`

### Step 7 — Detail Grid redesign
- Remove `depth` dropdown
- Rewrite `renderDetailGrid()` to produce flat table with Brand/Category/Sub Cat/Product columns
- Add row types: `row-product`, `row-cat-total`, `row-brand-total`
- Update `exportDetailCSV()` to match new structure
- Add Sub Category column (conditionally shown)

### Step 8 — Margin tab updates
- Add Sub Category column to table
- Minor sort/filter improvements

### Step 9 — Debug mode button
- Add floating 🐛 button HTML (bottom-right, fixed position)
- Add debug panel HTML (slides up from bottom)
- Add `toggleDebug()`, `exportDebugReport()` functions

### Step 10 — Update PLAN.md
- Rewrite to reflect v2 feature set, new data model, new tabs

---

## Key Functions to Reuse (unchanged)

| Function | Location | Reuse |
|----------|----------|-------|
| `openDB()`, `idbPut()`, `idbBulkPut()`, `idbGetAll()`, `idbGet()`, `idbCount()`, `idbClear()` | current file | Keep as-is |
| `parseCSV()`, `parseDateField()`, `parseNum()` | current file | Keep as-is |
| `groupBy()`, `sumRows()`, `marginPct()` | current file | Keep as-is |
| `fmtCur()`, `fmtNum()`, `fmtPct()`, `fmtDelta()`, `esc()` | current file | Keep as-is |
| `invalidateCache()`, `getPM()`, `getSales()` | current file | Keep, update `getPM()` for sub_category |
| `applyFilters()`, `clearFilters()` | current file | Update for sub_category filter |
| `openModal()`, `closeModal()`, `dragOver()`, `dragLeave()`, `dropFile()` | current file | Keep as-is |
| `openAssignModal()`, `saveAssignment()`, `removeMapping()`, `loadCustomMappings()` | current file | Keep as-is |
| `clearAllData()`, `exportJSONBackup()`, `updateDBStatus()` | current file | Keep as-is |
| `renderIssues()` | current file | Keep, add column mapping section |
| `renderMarginTable()` | current file | Add sub_category column |

---

## Verification Steps

1. Open `Sales_COGS_Dashboard.html` in Chrome
2. Upload `Product_Master_20260506.csv` → mapping modal appears → confirm → banner shows PM loaded, sub_category detected
3. Upload sales CSV → mapping modal → confirm → 15,361 rows merged, reconciliation passes
4. **Summary:** 4-column chart row renders; click Brand donut segment → filter bar updates; click monthly bar → SKU drill-down appears
5. **Sales Trends:** Clean 3-section layout; switch Day/Week/Month/Quarter; YoY shows two clear lines
6. **P&L:** Enter rent = $2,000/mo → shows $ and % columns; lock to % → change year, $ updates; enter loan → cashflow shown
7. **Margin:** Sub Category column visible
8. **Detail Grid:** Flat table with Brand/Category/Product columns; subtotal rows highlighted; Year toggle works; Export CSV
9. **Data Issues:** Shows mapping coverage; custom mapping flow works
10. Resize to 375px → cards stack, 44px touch targets functional
11. Click 🐛 → debug panel shows state snapshot

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `Sales_COGS_Dashboard.html` | **Full rewrite** (~3,500–4,500 lines) |
| `PLAN.md` | **Update** to reflect v2 decisions |