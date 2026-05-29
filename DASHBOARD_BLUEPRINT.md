# Dashboard Blueprint — AI Build Guide
> **For AI tools:** Work through Phases 1–4 interactively with the user. After each phase, pause for input before proceeding. Jump to referenced sections by number. Skip sections not selected by user.

---

## HOW TO USE THIS BLUEPRINT

1. Present each Phase as a **numbered menu** — user picks options or types custom input
2. Collect all selections before writing any code
3. Use the **Catalog** sections to populate analysis/tab content
4. Apply **Phase 5 rules** throughout implementation — these are non-negotiable
5. Confirm final spec with user before building

**Token strategy:** Read only the catalog rows matching user selections. Skip unselected industry/tab/feature rows entirely.

---

## PHASE 1 — DISCOVERY DIALOG

### 1.1 Opening Prompt (present to user verbatim)
```
What kind of dashboard would you like to build?

STEP 1 of 4 — Select your industry:
  1. Retail / E-Commerce
  2. SaaS / Software / Tech
  3. Finance / Accounting
  4. Marketing / Agency
  5. Healthcare / Clinical
  6. Manufacturing / Operations
  7. Real Estate
  8. Restaurant / Hospitality
  9. HR / People Analytics
 10. Supply Chain / Logistics
  0. Other — I'll describe my own

Type a number (or multiple numbers separated by commas):
```

### 1.2 Dashboard Type Catalog (read only rows matching user's industry)

| # | Industry | Suggested Dashboard Types |
|---|----------|--------------------------|
| 1 | Retail/E-Com | Sales & COGS · Inventory · Customer LTV · Returns Analysis · Channel Performance |
| 2 | SaaS/Tech | MRR/ARR · Churn · Product Usage · Funnel Conversion · Support Tickets |
| 3 | Finance | P&L · Cash Flow · Budget vs Actual · AR/AP Aging · Expense Breakdown |
| 4 | Marketing | Campaign ROI · Attribution · SEO/Traffic · Email Performance · Ad Spend |
| 5 | Healthcare | Patient Flow · Outcomes · Billing/Revenue Cycle · Staff Utilization · Readmission |
| 6 | Manufacturing | OEE · Yield/Defect · Production Schedule · Cost per Unit · Downtime |
| 7 | Real Estate | Portfolio Performance · Occupancy · Lease Expiry · Cap Rate · Deal Pipeline |
| 8 | Restaurant | Revenue per Cover · Food Cost % · Labour % · Table Turn · Wastage |
| 9 | HR/People | Headcount · Attrition · Hiring Funnel · Compensation Band · Engagement |
| 10 | Supply Chain | Inventory Turns · Lead Time · Supplier Scorecard · Demand vs Supply · Fill Rate |
| 0 | Custom | → go to 1.3 |

### 1.3 Follow-up Prompt
```
STEP 1b — Which dashboard type? (based on your industry above)
  Present the matching list from 1.2 as numbered options.
  Add option: "N+1. Describe my own"

If user selects "describe my own":
  Ask: "Describe the dashboard in 2–3 sentences. What decisions will it help make?"
  Store as: DASHBOARD_GOAL (use this to infer analysis in Phase 3)
```

---

## PHASE 2 — DATA ARCHITECTURE

### 2.1 File Type Prompt
```
STEP 2 of 4 — Data files

  What format is your data in? (select all that apply)
    A. CSV / Excel (.csv, .xlsx)
    B. Google Sheets (share link)
    C. Database export (SQL dump / JSON)
    D. API / live feed
    E. I'll enter data manually

  How many separate files/tables will you provide?
    1   2   3   4   5+
```

### 2.2 Per-File Schema Capture
For **each file**, ask:
```
File [N] — give it a short name (e.g. "Sales", "Products", "Customers"):
  → What is the grain of one row? (one order line / one product / one customer / other)
  → Approximately how many rows? (< 1K / 1K–100K / 100K+)
  → Any date columns? List them.
  → Any numeric measure columns? List them.
  → Any ID/key columns you use to join to other files?
```

### 2.3 Multi-File Mapping Rules

| Scenario | Auto-mapping strategy | Fallback prompt |
|----------|-----------------------|-----------------|
| 2 files, one has `sku`/`product_id`, other has same | Join on that key | "We detected `sku` in both files — confirm this is the join key?" |
| Date in one, no date in other | No join needed on date | — |
| 3+ files | Suggest star schema: one fact + dimension tables | "Which file has your transactional rows (most rows)?" |
| Ambiguous key (multiple candidates) | List top 3 candidates with match % | "Which column links [File A] to [File B]?" |
| No common column found | Alert user | "No matching columns found. Should we add a lookup manually?" |

**Auto-detect rules (apply in order):**
1. Exact column name match → auto-join, confirm with user
2. Fuzzy name match (e.g. `prod_id` vs `product_id`) → suggest, require confirm
3. Same value distribution (sample 100 rows, check overlap %) → flag as candidate
4. No match → ask user

### 2.4 Field Role Detection

Auto-assign roles from column names. Prompt user to confirm/override.

| Role | Common column names | Used for |
|------|--------------------|----|
| `date` | date, order_date, created_at, sale_date, period | Time axis, YoY, trends |
| `revenue` | sales, revenue, amount, gross_sales, net_sales, total | KPI, margin calc |
| `cost` | cogs, cost, cost_of_goods, purchase_cost, unit_cost | Margin, GP |
| `quantity` | qty, quantity, units, items_sold | Volume metrics |
| `id_customer` | customer_id, client_id, user_id, account_id | LTV, retention |
| `id_product` | sku, product_id, item_id, asin | Product analysis |
| `category` | category, department, segment, product_type, class | Group-by |
| `brand` | brand, vendor, supplier, manufacturer | Group-by |
| `channel` | channel, source, platform, marketplace | Segmentation |
| `discount` | discount, markdown, promo_amount | Net calc |
| `returns` | returns, refunds, credits | Net calc |

**Derived fields (compute at parse time):**
- `net_sales = revenue − discount − returns` (if discount/returns present)
- `gross_profit = net_sales − cost`
- `gross_margin_pct = gross_profit / net_sales * 100`
- `aov = revenue / order_count` (if order_id present)

---

## PHASE 3 — ANALYSIS CATALOG

### 3.1 Universal Analyses (always offer regardless of industry)

| Code | Analysis | What it shows | Requires |
|------|----------|---------------|----------|
| U1 | Period-over-Period | % change vs prior period (WoW/MoM/YoY) | date, any metric |
| U2 | Top-N Ranking | Top 10 items by any metric, sortable | any metric + group-by |
| U3 | Trend Line | Metric over time, moving average overlay | date, metric |
| U4 | Composition | How parts make up the whole (% breakdown) | group-by, metric |
| U5 | KPI Scorecard | Summary tiles: current, prior, delta, trend arrow | any metric |
| U6 | Distribution | Histogram / box plot of a metric | numeric column |
| U7 | Correlation | Scatter of two metrics to find relationship | 2 numeric columns |

### 3.2 Industry-Specific Analyses (read only selected industry rows)

| Industry | Code | Analysis | Formula / Logic |
|----------|------|----------|-----------------|
| Retail | R1 | Gross Margin % | `(net_sales − cogs) / net_sales × 100` |
| Retail | R2 | Sell-through Rate | `units_sold / (units_sold + units_remaining) × 100` |
| Retail | R3 | Return Rate | `returns / gross_sales × 100` |
| Retail | R4 | Scenario / What-if | Adjust margin % or COGS % and see projected GP |
| Retail | R5 | Brand/Category Mix | Revenue and margin by brand × category |
| SaaS | S1 | MRR/ARR | Sum of recurring revenue, with expansion/contraction/churn split |
| SaaS | S2 | Churn Rate | `churned_customers / start_customers × 100` |
| SaaS | S3 | LTV:CAC | `avg_ltv / avg_cac` — flag if < 3× |
| SaaS | S4 | Cohort Retention | % of cohort still active by month N |
| SaaS | S5 | Funnel Conversion | Lead → Trial → Paid conversion rates |
| Finance | F1 | Budget vs Actual | Variance $ and % by category |
| Finance | F2 | Rolling Forecast | Actuals YTD + projected remainder |
| Finance | F3 | AR Aging | Buckets: 0–30 / 31–60 / 61–90 / 90+ days |
| Finance | F4 | Cash Burn / Runway | Monthly net burn, months of runway |
| Marketing | M1 | ROAS | `revenue_attributed / ad_spend` |
| Marketing | M2 | CPL / CPA | `spend / leads` and `spend / conversions` |
| Marketing | M3 | Email Metrics | Open rate, CTR, unsubscribe rate by campaign |
| Marketing | M4 | Attribution | Revenue by channel, first-touch vs last-touch |
| Healthcare | H1 | Patient Volume | Visits by period, provider, department |
| Healthcare | H2 | LOS | Average length of stay, outlier flagging |
| Healthcare | H3 | Revenue per Patient | Net collected / encounters |
| Mfg | P1 | OEE | `Availability × Performance × Quality` |
| Mfg | P2 | Cost per Unit | `total_cost / units_produced` |
| Mfg | P3 | Defect Rate | `defects / total_produced × 100` |
| Real Estate | RE1 | Occupancy Rate | `occupied_units / total_units × 100` |
| Real Estate | RE2 | NOI | `gross_income − operating_expenses` |
| Restaurant | RS1 | Food Cost % | `food_cost / food_revenue × 100` — target < 30% |
| Restaurant | RS2 | RevPASH | `revenue / (seats × hours_open)` |
| HR | HR1 | Attrition Rate | `departures / avg_headcount × 100` |
| HR | HR2 | Time-to-Fill | Avg days from open req to offer accepted |
| Supply Chain | SC1 | Inventory Turns | `cogs / avg_inventory` |
| Supply Chain | SC2 | OTIF | `on_time_in_full_deliveries / total_deliveries × 100` |

### 3.3 Custom Analysis Prompt
```
STEP 3 of 4 — Analysis

  Suggested analyses for your dashboard (from the catalog above):
  [List matching rows — show Code, name, one-line description]

  Which would you like to include? (select all that apply, or "all")
  
  Any additional analysis not on this list? Describe it:
  → Store as CUSTOM_ANALYSES[]
```

---

## PHASE 4 — TABS & FEATURES SELECTION

### 4.1 Tab Catalog

| Tab Code | Tab Name | Description | Requires |
|----------|----------|-------------|----------|
| T-OV | Overview | KPI scorecards, trend sparklines, top-level donut charts. First tab user sees. | U1, U5 |
| T-TR | Trends | Time-series charts with period selector (WoW/MoM/YoY), moving average, annotations | U3, date |
| T-RK | Rankings | Sortable top-N tables, bar charts. Switch between metrics. | U2 |
| T-MX | Mix / Breakdown | Composition — stacked bars, treemaps, donut charts. Who contributes what % | U4 |
| T-MG | Margin Analysis | Margin % by group, brand cards, GP waterfall | R1, cost |
| T-SC | Scenario Planner | What-if: adjust inputs, see projected outcomes. Save/load named scenarios. | cost, revenue |
| T-CO | Cohort / Retention | User/customer retention grid by join cohort | S4, id_customer |
| T-FN | Funnel | Stage-by-stage conversion rates and drop-off | S5 |
| T-BV | Budget vs Actual | Variance table and chart by period and category | F1 |
| T-UP | Data Upload | File upload, field mapping editor, data status panel | always |
| T-MT | Methodology | Explains every calculation in plain language. Links to sources. | always |

### 4.2 Feature Catalog

| Feature Code | Feature | Description | Tab |
|-------------|---------|-------------|-----|
| F-FI | Date / Dimension Filters | Year, month, category, brand filter chips. Cascade across all tabs. | global |
| F-EX | Export / Import Backup | Download full dataset + scenarios as JSON. Upload to restore state elsewhere. | T-UP |
| F-SV | Save Named Scenarios | Name and save what-if configurations. Toggle chips to switch between them. | T-SC |
| F-PL | Pin / Lock Adjustments | Lock a % adjustment per group so it persists across filter changes. | T-SC |
| F-MP | Field Mapping Editor | Show detected field roles. Let user reassign via dropdowns. Explicit Save button. | T-UP |
| F-DD | Deduplication | Detect and collapse duplicate rows on upload using user-defined key. | T-UP |
| F-TH | Dark/Light Theme | Toggle button in header. | global |
| F-RS | Responsive Layout | CSS grid auto-fit — works on mobile and desktop without changes. | global |
| F-PE | Persistence | IndexedDB — data survives page refresh. No server required. | global |
| F-AN | Annotations | Click a chart point to add a text note (stored in IndexedDB). | T-TR |

### 4.3 Tab & Feature Selection Prompt
```
STEP 4 of 4 — Tabs and Features

  Recommended tabs for your dashboard:
  [List relevant tabs with one-line descriptions from 4.1]

  Which tabs do you want? (select all, or list numbers to exclude)

  Available features:
  [List all features from 4.2 with descriptions]

  Which features do you want to include?

  Any custom tabs or features? Describe:
```

---

## PHASE 5 — IMPLEMENTATION RULES

> These rules apply to every build. Do not skip any rule. Reference by code (e.g. IR-3) in comments when a rule directly shaped a decision.

### 5.1 Architecture

| Rule | Requirement |
|------|-------------|
| IR-1 | **Single HTML file.** All CSS, JS, and HTML inline. No build step, no CDN dependencies beyond 3–4 pinned library URLs. |
| IR-2 | **Libraries (pinned versions):** Chart.js 4.4.0 · chartjs-plugin-datalabels 2.2.0 · PapaParse 5.4.1. Add others only if user explicitly requests. |
| IR-3 | **Persistence:** IndexedDB only. DB name = `[DashboardName]_v1`. Stores: `data_[tablename]`, `meta`, `custom_mappings`, `scenarios`. Bump version + add migration on schema change. |
| IR-4 | **State object:** Single `const State = {}` for all UI state (active tab, filters, group-by). Never scatter state in DOM. |
| IR-5 | **No inline event handlers for complex logic.** Use `onclick="fnName(args)"` only for simple dispatch. Keep all logic in named functions. |
| IR-6 | **Escape all user-facing strings** with an `esc()` helper (`textContent` or `innerHTML` with escaping). Never interpolate raw data into HTML strings. |

### 5.2 Data Pipeline

| Rule | Requirement |
|------|-------------|
| IR-7 | **Parse once, derive always.** Store raw/normalized rows in IndexedDB. Compute all derived fields (`net_sales`, `gp`, `margin_pct`) at render time, not at parse time — except for persistent deduplication keys. |
| IR-8 | **Deduplication key:** Compose from the most specific available IDs (e.g. `sku|iso_date|order_id`). On collision: sum numeric fields, keep first non-numeric value. |
| IR-9 | **Date normalization:** Parse all dates to ISO 8601 (`YYYY-MM-DD`) at import. Support: `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, Unix timestamps. Warn user if < 80% of date column parses. |
| IR-10 | **Null safety:** Every numeric aggregation must guard against `NaN` and `null`. Use `sumField(rows, 'field')` helper: `rows.reduce((a,r)=>a+(+r[f]||0),0)`. |
| IR-11 | **Large datasets (> 50K rows):** Paginate table renders (max 500 rows visible). Pre-aggregate for charts (group before passing to Chart.js). |

### 5.3 Layout & CSS

| Rule | Requirement |
|------|-------------|
| IR-12 | **CSS variables for all colors and spacing.** Define in `:root`. Never hardcode `#hex` or `px` values outside the variable block. |
| IR-13 | **Responsive cards:** `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`. Never fixed column counts. |
| IR-14 | **Tab panels:** One `<div id="panel-N">` per tab. Show/hide via `display:none` toggle. Do not re-render a tab if it is already active and data has not changed. |
| IR-15 | **KPI tiles:** Fixed height, consistent padding. Show: label · value · delta vs prior period (↑ green / ↓ red / – grey) · sparkline (optional). |
| IR-16 | **Tables:** Zebra stripe, hover highlight, sortable headers (click to sort asc/desc). Sticky header when > 10 rows. Total row pinned at bottom with `position:sticky`. |

### 5.4 Charts

| Rule | Requirement |
|------|-------------|
| IR-17 | **Global datalabels off by default:** `Chart.defaults.plugins.datalabels = {display:false}`. Enable per-chart only where needed. |
| IR-18 | **Donut label rule:** Enable labels only when segment ≥ 3% of total: `display: ctx => (value/total*100) >= 3`. Show `$X · Y%` format. |
| IR-19 | **Chart destroy before recreate:** Always call `existingChart.destroy()` before calling `new Chart()` on the same canvas. Store chart instances in a module-level object keyed by canvas ID. |
| IR-20 | **Color palette:** Define 10-color array in one place. Reuse across all charts for consistency. Support dark mode by referencing CSS variables where possible. |
| IR-21 | **Empty state:** If data array is empty, render a placeholder message (not a blank canvas). `function emptyState(msg){ return '<div class="empty-state">...</div>'; }` |

### 5.5 Upload & Mapping

| Rule | Requirement |
|------|-------------|
| IR-22 | **Two-step upload:** Step 1 = parse file and show mapping editor. Step 2 = user confirms mapping and clicks explicit Save. Never auto-save on file drop. |
| IR-23 | **Mapping editor:** One row per detected column. Dropdowns for "Field Role" (use Field Role table from §2.4) plus "Ignore". Show sample values next to each column. |
| IR-24 | **Custom mappings persist:** Store confirmed mapping in `custom_mappings` store keyed by filename hash. Pre-populate on re-upload of same file structure. |
| IR-25 | **Progress feedback:** Show row count, parse time, and any warnings (unmapped columns, date parse failures, duplicate rows collapsed) after save. |

### 5.6 Scenario / What-If

| Rule | Requirement |
|------|-------------|
| IR-26 | **No false delta on load:** `adjValue` must equal `curValue` exactly (no float rounding) at initial render. Only show delta when user has explicitly changed a value. |
| IR-27 | **Lock tracking:** When pinning an adjustment, store `curValueAtLock` alongside `adjValue`. On re-render, if `|adjValue − curValueAtLock| < 0.001`, treat as "not explicitly changed" and reset to new `curValue`. |
| IR-28 | **Save/load scenarios:** Store full scenario in IndexedDB `scenarios` store with: `{id, name, savedAt, group, data:[{key, adjValue, curValueAtSave}]}`. Apply backward-compat check: missing `curValueAtSave` → treat as explicit. |
| IR-29 | **Total row updates live:** Give each total cell an ID. `updateRow(idx)` must also recalculate and update total cells. Never require full table rebuild for a single cell change. |

### 5.7 Export / Import

| Rule | Requirement |
|------|-------------|
| IR-30 | **Backup format:** JSON with schema: `{exportedAt, version, stores:{[storeName]: rows[]}}`. |
| IR-31 | **Import validation:** Check `version` compatibility. Warn if importing into a non-empty DB (offer merge vs replace). |
| IR-32 | **Import progress:** Show store-by-store row counts as they load. Show success/error summary. |

### 5.8 Methodology Tab

| Rule | Requirement |
|------|-------------|
| IR-33 | **One card per formula.** Each card: formula name · formula string · plain-language explanation · data sources used · any caveats. |
| IR-34 | **Auto-populate:** Include only formulas for analyses the user selected. Add cards for deduplication logic, field mapping, and backup/restore. |

---

## PHASE 6 — BUILD SEQUENCE

Execute in this order. Do not skip steps.

```
1. Confirm final spec with user (list: industry, dashboard type, files, analyses, tabs, features)
2. Write HTML skeleton: head → CSS variables → tab nav → panel divs → script block
3. Implement: DB helpers → parse/upload flow → mapping editor → save pipeline
4. Implement: core aggregation functions (sumField, groupBy, marginPct, etc.)
5. Implement: tab renders in order — Overview first, then remaining tabs
6. Implement: filters (wired to State, trigger re-render on change)
7. Implement: scenario planner (if selected) — follow IR-26–29
8. Implement: export/import (if selected)
9. Implement: methodology tab (auto-populate from selected analyses)
10. Final pass: apply IR-6 (escaping), IR-10 (null safety), IR-17–21 (charts), IR-26 (false delta)
11. Test checklist before delivering:
    □ Upload file → mapping editor appears, Save required
    □ Refresh page → data persists
    □ All charts render, no blank canvases
    □ Filters cascade across all tabs
    □ Total rows match sum of detail rows
    □ Export → re-import → data identical
    □ Mobile viewport: layout reflows cleanly
```

---

## APPENDIX A — COMMON HELPER FUNCTIONS

Include these verbatim. Do not reinvent.

```js
// Safe field sum
function sumField(rows, f){ return rows.reduce((a,r)=>a+(+r[f]||0),0); }

// Group array by field
function groupBy(arr, key){ return arr.reduce((m,r)=>{(m[r[key]]??=[]).push(r);return m;},{}); }

// Margin %
function marginPct(rev, cost){ return rev>0?(rev-cost)/rev*100:0; }

// Format currency
function fmt$(n){ return '$'+Math.round(n).toLocaleString(); }

// Format % (1 decimal)
function fmtPct(n){ return n.toFixed(1)+'%'; }

// Escape HTML
function esc(s){ const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML; }

// Empty state placeholder
function emptyState(msg='No data uploaded yet'){
  return `<div class="empty-state"><div style="font-size:48px">📊</div><p>${esc(msg)}</p></div>`;
}

// Period-over-period delta
function delta(cur, prior){
  if(!prior) return null;
  return (cur-prior)/Math.abs(prior)*100;
}

// Delta badge HTML
function deltaBadge(pct){
  if(pct===null) return '<span class="delta-neutral">–</span>';
  const cls=pct>=0?'delta-up':'delta-down';
  return `<span class="${cls}">${pct>=0?'↑':'↓'}${Math.abs(pct).toFixed(1)}%</span>`;
}
```

---

## APPENDIX B — CSS VARIABLE TEMPLATE

```css
:root {
  --primary: #2563eb;   --primary-light: #eff6ff;
  --success: #16a34a;   --danger: #dc2626;  --warning: #d97706;
  --bg: #f8fafc;        --card: #ffffff;
  --border: #e2e8f0;    --text1: #0f172a;  --text2: #475569;  --text3: #94a3b8;
  --radius: 10px;       --shadow: 0 1px 4px rgba(0,0,0,.08);
  --font: 'Inter', system-ui, sans-serif;
}
/* Dark mode */
[data-theme="dark"]:root {
  --bg:#0f172a; --card:#1e293b; --border:#334155;
  --text1:#f1f5f9; --text2:#94a3b8; --text3:#475569;
}
```

---

## APPENDIX C — QUICK DECISION TREE

```
User selects industry
  └─ Retail/E-com → offer T-OV, T-TR, T-MG, T-SC, T-MT + F-PE, F-FI, F-EX, F-SV, F-PL
  └─ SaaS        → offer T-OV, T-TR, T-CO, T-FN, T-MT + F-PE, F-FI, F-EX
  └─ Finance     → offer T-OV, T-TR, T-BV, T-MT + F-PE, F-FI, F-EX
  └─ Marketing   → offer T-OV, T-TR, T-RK, T-MT + F-PE, F-FI, F-EX
  └─ Other       → offer T-OV, T-TR, T-RK, T-MX, T-MT + F-PE, F-FI, F-EX

User has 1 file  → skip Phase 2.3 mapping section
User has 2 files → run auto-detect from §2.3
User has 3+ files → ask for fact table first, then run star schema suggestion

User wants Scenario tab → apply IR-26, IR-27, IR-28, IR-29 strictly
User wants Export/Import → apply IR-30, IR-31, IR-32
User wants Methodology → apply IR-33, IR-34
```

---

*Blueprint version 1.0 — built from the Sales & COGS Dashboard project (2025)*
