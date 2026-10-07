# PL Dashboard — Complete Feature Blueprint
**Version:** Based on pl-dashboard-v8.3.0  
**Purpose:** Reusable feature library for future app development. Each feature is self-contained. Pick what you need, implement it bug-free.

---

## HOW TO USE THIS DOCUMENT

1. **Read the Feature Selection Matrix** — check off which features your new app needs.
2. **Start with Foundation** (always required) — sets up data storage, theme, utilities.
3. **Add features one at a time**, following each feature's implementation checklist.
4. **Run the Audit Checklist** at the bottom to verify everything works before shipping.

---

## FEATURE SELECTION MATRIX

> Check the box next to each feature you want in your new app.

| # | Feature | What It Does (Plain English) | Depends On |
|---|---------|------------------------------|------------|
| F0 | **Foundation** | Data storage (IndexedDB), settings, CSS theme, utility functions | — (always include) |
| F1 | **Dashboard / KPI Cards** | Shows summary numbers: total revenue, expenses, profit, margin | F0 |
| F2 | **Charts** | Bar chart, line chart, pie charts for revenue/expense trends | F0, F1 |
| F3 | **Revenue Table** | Paginated list of all income entries, searchable, deletable | F0 |
| F4 | **Expense Table** | Paginated list of all expense entries, searchable, deletable | F0 |
| F5 | **All Transactions Table** | Combined income + expenses in one table with advanced filters and sort | F0 |
| F6 | **Monthly P&L Table** | One row per month: revenue, expenses, net profit, margin % | F0 |
| F7 | **Add Transaction Form** | Manual form to add a single income or expense entry | F0 |
| F8 | **CSV / Excel Import** | Upload a spreadsheet to add many transactions at once | F0 |
| F9 | **Category Management** | Create/rename/delete custom labels for transactions | F0 |
| F10 | **File Sync (Local Backup)** | Auto-save data to a file on your computer every 30 minutes | F0 |
| F11 | **Three-Layer Backup** | Snapshot backups in browser + local file + Google Sheets cloud | F0, F10 |
| F12 | **Settings Page** | Configure business name, fiscal year, currency symbol | F0 |
| F13 | **Auth Gate (Optional)** | License key or Google sign-in to protect the app | F0 |
| F14 | **Theme Toggle** | Switch between dark mode and light mode | F0 |
| F15 | **Toast Notifications** | Small pop-up messages (success, error, info) | F0 |
| F16 | **Undo Delete** | 6-second window to recover deleted transactions | F0, F15 |
| F17 | **Keyboard Shortcuts** | Press keys to navigate without clicking | F0 |
| F18 | **PWA / Offline Support** | App works without internet, installs on phone like a native app | F0 |
| F19 | **Data Export** | Download all data as CSV, Excel, or JSON file | F0 |
| F20 | **Industry Templates** | Pre-built category sets for SaaS, e-commerce, consulting, etc. | F9 |

---

## FOUNDATION (F0) — Always Required

### What It Does
Sets up the core infrastructure every other feature needs: data storage, settings, theme system, and utility functions.

### Critical Files
- Primary app file: `/home/user/pl-dashboard/pl-dashboard-v8.html` (reference implementation)

### Data Model

```javascript
// Transaction record stored in IndexedDB
const Transaction = {
  id:          Number,   // Date.now() + Math.random() — unique, never reuse
  date:        String,   // "YYYY-MM-DD" — always ISO format
  type:        String,   // "revenue" | "expense" — only these two values
  category:    String,   // User-defined label, e.g. "Rent"
  description: String,   // Optional free text note
  amount:      Number,   // Always positive. Never store negative amounts.
  month:       String,   // "Jan".."Dec" — derived from date on save
  year:        Number,   // Fiscal year integer — derived from date on save
  _sample:     Boolean   // Optional: true only on demo/sample data
};

// Settings stored in localStorage
const Settings = {
  bizName:    String,   // Business name shown in sidebar
  fiscalYear: Number,   // e.g. 2025
  currency:   String    // "$" | "£" | "€" | "¥" etc.
};
```

### IndexedDB Setup

```javascript
const DB_NAME    = 'PLDashboard';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) {
        const store = d.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // CRITICAL: create all indexes — queries depend on these
        store.createIndex('date',     'date',     { unique: false });
        store.createIndex('type',     'type',     { unique: false });
        store.createIndex('month',    'month',    { unique: false });
        store.createIndex('year',     'year',     { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ALWAYS call openDB() before any DB operations
// Handle IndexedDB unavailable (private browsing, storage quota, etc.)
async function initDB() {
  try {
    await openDB();
  } catch (err) {
    // Replace page with friendly error — do not silently fail
    document.body.innerHTML = `
      <div style="padding:40px;text-align:center;font-family:sans-serif">
        <h2>Storage Unavailable</h2>
        <p>This app needs browser storage. Try a different browser or disable private mode.</p>
        <p style="color:#888;font-size:12px">${err.message}</p>
      </div>`;
    throw err;
  }
}
```

### IndexedDB CRUD Functions

```javascript
// BUG PREVENTION: All DB functions return Promises — always await them

function dbPut(txn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).put(txn).onsuccess = () => resolve();
    t.onerror = e => reject(e.target.error);
  });
}

function dbGet(id) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readonly');
    const req = t.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).delete(id).onsuccess = () => resolve();
    t.onerror = e => reject(e.target.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_NAME, 'readonly');
    const req = t.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

function dbBulkPut(txns, onProgress) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    const store = t.objectStore(STORE_NAME);
    let done = 0;
    txns.forEach(txn => {
      const req = store.put(txn);
      req.onsuccess = () => {
        done++;
        if (onProgress) onProgress(done, txns.length);
        if (done === txns.length) resolve();
      };
      req.onerror = e => reject(e.target.error);
    });
    if (txns.length === 0) resolve();
    t.onerror = e => reject(e.target.error);
  });
}

function dbClear() {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, 'readwrite');
    t.objectStore(STORE_NAME).clear().onsuccess = () => resolve();
    t.onerror = e => reject(e.target.error);
  });
}

// Advanced query with search, filter, sort, pagination
// BUG PREVENTION: All comparisons must account for undefined/null fields
async function dbQuery({ search='', type='', month='', year='', sort='date', dir='desc', page=1, pageSize=25 } = {}) {
  let rows = await dbGetAll();

  // Apply filters
  if (type)  rows = rows.filter(r => r.type === type);
  if (month) rows = rows.filter(r => r.month === month);
  if (year)  rows = rows.filter(r => r.year === +year);

  // Full-text search (case-insensitive)
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(r =>
      (r.description || '').toLowerCase().includes(q) ||
      (r.category    || '').toLowerCase().includes(q) ||
      String(r.amount || '').includes(q) ||
      (r.date        || '').includes(q)
    );
  }

  // Sort
  rows.sort((a, b) => {
    let av = a[sort] ?? '';
    let bv = b[sort] ?? '';
    if (sort === 'amount') { av = +av; bv = +bv; }
    if (sort === 'date')   { av = av || ''; bv = bv || ''; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ?  1 : -1;
    return 0;
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total };
}
```

### Settings (localStorage)

```javascript
const SETTINGS_KEY = 'pl_settings_v4';

let settings = { bizName: '', fiscalYear: new Date().getFullYear(), currency: '$' };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch { /* use defaults */ }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```

### Security Utilities (REQUIRED — use on every user-facing string)

```javascript
// XSS prevention — wrap ALL user data before inserting into innerHTML
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// CSV formula injection — wrap ALL values in CSV/Excel exports
function csvSanitize(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
```

### Currency Formatter

```javascript
// BUG PREVENTION: Use Math.round to avoid floating-point drift (e.g. 0.1+0.2 = 0.30000000000000004)
function fmt(n) {
  const cur     = settings.currency || '$';
  const rounded = Math.round((+n || 0) * 100) / 100;
  const s       = Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return rounded < 0 ? `(${cur}${s})` : `${cur}${s}`;
}

// For percentage display
function fmtPct(n) {
  return (Math.round((+n || 0) * 10) / 10).toFixed(1) + '%';
}
```

### Month Utilities

```javascript
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getMonthFromDate(isoDate) {
  // BUG PREVENTION: Use UTC to avoid timezone-off-by-one on date parsing
  const [y, m, d] = isoDate.split('-').map(Number);
  return MONTHS[m - 1] || '';
}

function getYearFromDate(isoDate) {
  return +isoDate.slice(0, 4) || new Date().getFullYear();
}

// Always set month+year when saving a transaction:
function prepareTransaction(raw) {
  return {
    ...raw,
    month: getMonthFromDate(raw.date),
    year:  getYearFromDate(raw.date)
  };
}
```

### CSS Theme System

```css
/* Always define both themes; default to dark */
:root, :root[data-theme="dark"] {
  --bg:           #0f1117;
  --surface:      #181c27;
  --surface2:     #1f2435;
  --border:       #2a3045;
  --border-strong:#3a4260;
  --teal:         #0ecfbe;   /* revenue / positive */
  --amber:        #f5a623;   /* profit / margin */
  --red:          #e74c3c;   /* expense / danger */
  --green:        #27ae60;   /* success / backup */
  --blue:         #3b82f6;   /* info / link */
  --text:         #e8eaf0;
  --muted:        #6b7394;
  --shadow:       0 4px 24px rgba(0,0,0,.45);
  --radius:       10px;
  --focus:        #6ea8ff;
}

:root[data-theme="light"] {
  --bg:           #f5f6fa;
  --surface:      #ffffff;
  --surface2:     #f0f2f8;
  --border:       #d4d8e8;
  --border-strong:#b0b8d0;
  --teal:         #0aab9e;
  --amber:        #d97706;
  --red:          #dc2626;
  --green:        #16a34a;
  --blue:         #2563eb;
  --text:         #1a1f35;
  --muted:        #6b7394;
  --shadow:       0 2px 12px rgba(0,0,0,.12);
  --radius:       10px;
  --focus:        #2563eb;
}
```

### App Initialization Sequence

```javascript
// Run in this exact order on page load — ordering bugs cause blank screens
async function initApp() {
  loadSettings();         // 1. Load settings first (currency needed for formatters)
  loadCategories();       // 2. Load categories (needed by form and tables)
  applyTheme();           // 3. Apply theme before any rendering
  await initDB();         // 4. Open IndexedDB (must succeed before any data ops)
  checkAuthSession();     // 5. Check if user is already logged in (optional, skip if no auth)
  showView('dashboard-view'); // 6. Show default view
  scheduleVersionCheck(); // 7. Async update check (non-blocking)
}
```

---

## FEATURE 1 — Dashboard / KPI Cards (F1)

### What It Does (Plain English)
Shows your financial summary at a glance: total money earned, total spent, profit, and margin percentage. Updates automatically when you filter by month.

### HTML Structure

```html
<div id="dashboard-view">
  <!-- Month filter chips (one per month that has data) -->
  <div id="dash-month-filter" class="filter-chips"></div>

  <!-- 6 KPI cards in a grid -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value teal" id="kpi-rev">$0.00</div>
      <div class="kpi-sub" id="kpi-rev-ct">0 entries</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Expenses</div>
      <div class="kpi-value red"  id="kpi-exp">$0.00</div>
      <div class="kpi-sub" id="kpi-exp-ct">0 entries</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Net Profit</div>
      <div class="kpi-value"      id="kpi-net">$0.00</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gross Profit</div>
      <div class="kpi-value"      id="kpi-gross">$0.00</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Profit Margin</div>
      <div class="kpi-value amber" id="kpi-margin">0.0%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Avg Monthly Revenue</div>
      <div class="kpi-value"      id="kpi-avg-rev">$0.00</div>
    </div>
  </div>

  <!-- Charts area — see F2 -->
  <div class="charts-grid" id="charts-area">...</div>
</div>
```

### Logic

```javascript
// COGS categories — used to compute Gross Profit
const COGS_KEYWORDS = ['cost of goods', 'cogs', 'cost of sales', 'materials', 'inventory'];

let dashFilter = ''; // '' = all months, 'Jan'...'Dec' = filtered month

async function refreshDashboard() {
  const all = await dbGetAll();

  // Apply year filter to current fiscal year
  const yearRows = all.filter(r => r.year === settings.fiscalYear);

  // Apply month filter
  const rows = dashFilter
    ? yearRows.filter(r => r.month === dashFilter)
    : yearRows;

  // Calculate KPIs
  const rev  = rows.filter(r => r.type === 'revenue');
  const exp  = rows.filter(r => r.type === 'expense');

  const totalRev = rev.reduce((s, r) => s + r.amount, 0);
  const totalExp = exp.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalRev - totalExp;

  // Gross Profit = Revenue minus COGS only
  const cogs = exp
    .filter(r => COGS_KEYWORDS.some(k => (r.category || '').toLowerCase().includes(k)))
    .reduce((s, r) => s + r.amount, 0);
  const grossProfit = totalRev - cogs;

  // Margin — BUG: guard against divide-by-zero
  const margin = totalRev > 0 ? (netProfit / totalRev) * 100 : 0;

  // Avg monthly revenue (distinct months that have revenue)
  const revMonths = new Set(rev.map(r => r.month)).size || 1;
  const avgRev = totalRev / revMonths;

  // Update DOM
  document.getElementById('kpi-rev').textContent    = fmt(totalRev);
  document.getElementById('kpi-rev-ct').textContent  = `${rev.length} entries`;
  document.getElementById('kpi-exp').textContent    = fmt(totalExp);
  document.getElementById('kpi-exp-ct').textContent  = `${exp.length} entries`;

  // Net profit color: green if positive, red if negative
  const netEl = document.getElementById('kpi-net');
  netEl.textContent = fmt(netProfit);
  netEl.className   = 'kpi-value ' + (netProfit >= 0 ? 'teal' : 'red');

  document.getElementById('kpi-gross').textContent  = fmt(grossProfit);
  document.getElementById('kpi-margin').textContent = fmtPct(margin);
  document.getElementById('kpi-avg-rev').textContent = fmt(avgRev);

  // Build month filter chips
  renderDashMonthFilter(yearRows);
}

function renderDashMonthFilter(yearRows) {
  // Only show chips for months that actually have data
  const activeMonths = [...new Set(yearRows.map(r => r.month))];
  const orderedMonths = MONTHS.filter(m => activeMonths.includes(m));

  const container = document.getElementById('dash-month-filter');
  container.innerHTML = orderedMonths.length
    ? ['', ...orderedMonths].map(m =>
        `<button class="filter-chip ${dashFilter === m ? 'active' : ''}"
                 onclick="setDashFilter('${m}')">${m || 'All'}</button>`
      ).join('')
    : '';
}

function setDashFilter(month) {
  dashFilter = month;
  refreshDashboard(); // re-render KPIs + charts with new filter
}
```

### CSS

```css
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
@media (max-width: 900px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .kpi-grid { grid-template-columns: 1fr 1fr; } }

.kpi-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}
.kpi-label { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
.kpi-value { font-size: 26px; font-weight: 700; color: var(--text); }
.kpi-value.teal  { color: var(--teal); }
.kpi-value.red   { color: var(--red);  }
.kpi-value.amber { color: var(--amber);}
.kpi-sub   { font-size: 12px; color: var(--muted); margin-top: 4px; }
.filter-chip { padding: 4px 14px; border-radius: 20px; border: 1px solid var(--border);
               background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; }
.filter-chip.active { border-color: var(--teal); color: var(--teal); background: rgba(14,207,190,.1); }
```

### Known Bugs to Avoid
- **Divide-by-zero**: Always check `totalRev > 0` before computing margin.
- **Float drift**: Use `Math.round(x * 100) / 100` before display, never raw floating point.
- **Missing months**: Filter chips must only include months with actual data (not all 12 months).

---

## FEATURE 2 — Charts (F2)

### What It Does (Plain English)
Four interactive graphs that visualize your financial data: a bar chart comparing monthly revenue vs expenses, a line chart showing profit trend, and two pie charts breaking down categories.

### Dependencies
- Chart.js 4.4.1 (inline it in the HTML — no CDN, for offline support)

### Chart Setup

```javascript
const charts = {}; // Track instances to destroy before recreating

// BUG PREVENTION: Always destroy existing chart before creating new one
// Chart.js throws if you create a chart on a canvas that already has one
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function themeColors() {
  // Read current CSS variables — must read at render time, not at init
  const s = getComputedStyle(document.documentElement);
  return {
    text:    s.getPropertyValue('--text').trim()    || '#e8eaf0',
    muted:   s.getPropertyValue('--muted').trim()   || '#6b7394',
    surface: s.getPropertyValue('--surface').trim() || '#181c27',
    border:  s.getPropertyValue('--border').trim()  || '#2a3045',
    teal:    s.getPropertyValue('--teal').trim()     || '#0ecfbe',
    red:     s.getPropertyValue('--red').trim()      || '#e74c3c',
    amber:   s.getPropertyValue('--amber').trim()    || '#f5a623',
  };
}

// Shared bar/line chart options
function bOpts(tc) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: tc.text, font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: ctx => ` ${fmt(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: { ticks: { color: tc.muted }, grid: { color: tc.border } },
      y: { ticks: { color: tc.muted, callback: v => fmt(v) }, grid: { color: tc.border } }
    }
  };
}

// Shared doughnut chart options
function dOpts(tc) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { color: tc.text, font: { size: 11 }, boxWidth: 12, padding: 10 }
      },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}`
        }
      }
    }
  };
}

// Categorical colors for pie slices — enough for 12 categories
const PIE_COLORS = [
  '#0ecfbe','#3b82f6','#f5a623','#e74c3c','#8b5cf6',
  '#10b981','#f59e0b','#6366f1','#ec4899','#14b8a6',
  '#a855f7','#ef4444'
];
```

### Render All Charts

```javascript
async function renderCharts() {
  const tc      = themeColors();
  const all     = await dbGetAll();
  const yearRows = all.filter(r => r.year === settings.fiscalYear);
  const filtered = dashFilter ? yearRows.filter(r => r.month === dashFilter) : yearRows;

  // Monthly aggregation for bar + line charts
  const monthlyRev = {};
  const monthlyExp = {};
  yearRows.forEach(r => {
    if (r.type === 'revenue') monthlyRev[r.month] = (monthlyRev[r.month] || 0) + r.amount;
    if (r.type === 'expense') monthlyExp[r.month] = (monthlyExp[r.month] || 0) + r.amount;
  });

  const chartMonths  = MONTHS.filter(m => monthlyRev[m] || monthlyExp[m]);
  const revData      = chartMonths.map(m => monthlyRev[m] || 0);
  const expData      = chartMonths.map(m => monthlyExp[m] || 0);
  const profitData   = chartMonths.map((m, i) => revData[i] - expData[i]);

  // 1. Revenue vs Expenses bar chart
  destroyChart('revExp');
  charts.revExp = new Chart(document.getElementById('chart-rev-exp'), {
    type: 'bar',
    data: {
      labels: chartMonths,
      datasets: [
        { label: 'Revenue',  data: revData,    backgroundColor: tc.teal + '99' },
        { label: 'Expenses', data: expData,    backgroundColor: tc.red  + '99' }
      ]
    },
    options: bOpts(tc)
  });

  // 2. Net Profit trend line chart
  destroyChart('profit');
  charts.profit = new Chart(document.getElementById('chart-profit'), {
    type: 'line',
    data: {
      labels: chartMonths,
      datasets: [{
        label:           'Net Profit',
        data:            profitData,
        borderColor:     tc.amber,
        backgroundColor: tc.amber + '22',
        fill:            true,
        tension:         0.4,
        pointRadius:     4
      }]
    },
    options: bOpts(tc)
  });

  // 3 & 4. Category breakdowns (use filtered data for pie charts)
  renderCategoryChart('chart-rev-cat',  filtered.filter(r => r.type === 'revenue'),  tc, 'Revenue by Category');
  renderCategoryChart('chart-exp-cat',  filtered.filter(r => r.type === 'expense'),  tc, 'Expenses by Category');
}

function renderCategoryChart(canvasId, rows, tc, label) {
  // Aggregate by category
  const cats = {};
  rows.forEach(r => { cats[r.category || 'Uncategorized'] = (cats[r.category || 'Uncategorized'] || 0) + r.amount; });

  const labels = Object.keys(cats);
  const data   = Object.values(cats);

  const key = canvasId; // use canvas ID as chart key
  destroyChart(key);

  if (data.length === 0) {
    // BUG PREVENTION: Don't create empty chart — Chart.js renders oddly with 0 data
    return;
  }

  charts[key] = new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: PIE_COLORS.slice(0, labels.length) }]
    },
    options: dOpts(tc)
  });
}

// Re-tint all charts on theme toggle (call after toggling theme)
function retintCharts() {
  // Destroy and re-render — simplest, no theme patch bugs
  renderCharts();
}
```

### HTML Canvases

```html
<div class="charts-grid">
  <div class="chart-card">
    <h3>Revenue vs Expenses</h3>
    <div class="chart-wrap"><canvas id="chart-rev-exp"></canvas></div>
  </div>
  <div class="chart-card">
    <h3>Net Profit Trend</h3>
    <div class="chart-wrap"><canvas id="chart-profit"></canvas></div>
  </div>
  <div class="chart-card">
    <h3>Revenue by Category</h3>
    <div class="chart-wrap"><canvas id="chart-rev-cat"></canvas></div>
  </div>
  <div class="chart-card">
    <h3>Expenses by Category</h3>
    <div class="chart-wrap"><canvas id="chart-exp-cat"></canvas></div>
  </div>
</div>
```

```css
.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.chart-card  { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.chart-wrap  { position: relative; height: 240px; }
@media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }
```

### Known Bugs to Avoid
- **Double canvas bug**: Always call `destroyChart(key)` before `new Chart(...)`. Never skip this.
- **Empty data**: Skip chart creation if data array is empty — Chart.js renders a blank circle otherwise.
- **Theme retint**: Call `retintCharts()` after theme toggle, not `update()` — updating with new colors is unreliable.

---

## FEATURE 3 — Revenue Table (F3)

### What It Does (Plain English)
A paginated list of all your income transactions. You can search, select multiple rows to delete them, and edit any entry inline.

### HTML Structure

```html
<div id="revenue-view">
  <div class="table-toolbar">
    <input id="rev-search" type="search" placeholder="Search revenue..." oninput="debouncedRevSearch()">
    <div id="rev-bulk-bar" style="display:none">
      <span id="rev-sel-count">0 selected</span>
      <button onclick="deleteBulkRev()">Delete Selected</button>
    </div>
  </div>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="rev-check-all" onchange="toggleAllRev(this)"></th>
          <th>Date</th>
          <th>Category</th>
          <th>Description</th>
          <th>Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="rev-tbody"></tbody>
    </table>
  </div>
  <div id="rev-pagination" class="pagination"></div>
</div>
```

### Logic

```javascript
let revPage = 1;
const REV_PAGE_SIZE = 50;
let revSearch = '';
const selectedRevIds = new Set();

async function renderRevTable() {
  const { rows, total } = await dbQuery({
    search:   revSearch,
    type:     'revenue',
    sort:     'date',
    dir:      'desc',
    page:     revPage,
    pageSize: REV_PAGE_SIZE
  });

  const tbody = document.getElementById('rev-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
      No revenue entries. <button onclick="showView('add-view')">Add one</button>
    </td></tr>`;
    document.getElementById('rev-pagination').innerHTML = '';
    return;
  }

  // BUG PREVENTION: escapeHtml on every user-sourced string
  tbody.innerHTML = rows.map(r => `
    <tr data-id="${r.id}">
      <td><input type="checkbox" class="rev-row-check" value="${r.id}"
                 ${selectedRevIds.has(r.id) ? 'checked' : ''}
                 onchange="onRevCheck(this)"></td>
      <td>${escapeHtml(r.date)}</td>
      <td><span class="badge teal">${escapeHtml(r.category || 'Uncategorized')}</span></td>
      <td>${escapeHtml(r.description || '—')}</td>
      <td class="amount teal">${fmt(r.amount)}</td>
      <td>
        <button class="icon-btn" onclick="deleteOneTxn(${r.id})" title="Delete">🗑</button>
      </td>
    </tr>
  `).join('');

  renderPagination('rev-pagination', revPage, total, REV_PAGE_SIZE, p => {
    revPage = p;
    renderRevTable();
  });
}

function onRevCheck(checkbox) {
  const id = +checkbox.value;
  if (checkbox.checked) selectedRevIds.add(id); else selectedRevIds.delete(id);
  updateRevBulkBar();
}

function toggleAllRev(masterCheckbox) {
  document.querySelectorAll('.rev-row-check').forEach(cb => {
    cb.checked = masterCheckbox.checked;
    onRevCheck(cb);
  });
}

function updateRevBulkBar() {
  const bar = document.getElementById('rev-bulk-bar');
  bar.style.display = selectedRevIds.size > 0 ? 'flex' : 'none';
  document.getElementById('rev-sel-count').textContent = `${selectedRevIds.size} selected`;
}

async function deleteBulkRev() {
  if (!selectedRevIds.size) return;
  const ids = [...selectedRevIds];
  // Store for undo BEFORE deleting
  const deleted = await Promise.all(ids.map(id => dbGet(id)));

  if (!confirm(`Delete ${ids.length} transaction(s)?`)) return;

  await Promise.all(ids.map(id => dbDelete(id)));
  selectedRevIds.clear();
  updateRevBulkBar();
  renderRevTable();
  offerUndo(`Deleted ${deleted.length} entries`, deleted);
}

// Debounce search to avoid too many DB reads
let revSearchTimer;
function debouncedRevSearch() {
  clearTimeout(revSearchTimer);
  revSearchTimer = setTimeout(() => {
    revSearch = document.getElementById('rev-search').value;
    revPage = 1; // reset to first page on new search
    renderRevTable();
  }, 250);
}
```

### Pagination Helper (shared by all tables)

```javascript
function renderPagination(containerId, currentPage, total, pageSize, onPageChange) {
  const totalPages = Math.ceil(total / pageSize);
  const container  = document.getElementById(containerId);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const start = (currentPage - 1) * pageSize + 1;
  const end   = Math.min(currentPage * pageSize, total);

  // Show pages: first, ..., (current-2)..(current+2), ..., last
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      pages.push(i);
    }
  }

  // Add ellipsis markers
  const withGaps = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) withGaps.push('...');
    withGaps.push(p);
  });

  container.innerHTML = `
    <span class="pg-info">Showing ${start}–${end} of ${total}</span>
    <button onclick="(${onPageChange})(1)"          ${currentPage===1?'disabled':''}>«</button>
    <button onclick="(${onPageChange})(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>
    ${withGaps.map(p => p === '...'
      ? `<span>…</span>`
      : `<button class="${p===currentPage?'active':''}" onclick="(${onPageChange})(${p})">${p}</button>`
    ).join('')}
    <button onclick="(${onPageChange})(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>
    <button onclick="(${onPageChange})(${totalPages})"     ${currentPage===totalPages?'disabled':''}>»</button>
  `;
}
```

### Known Bugs to Avoid
- **Stale selections**: Clear `selectedRevIds` after bulk delete completes.
- **Page reset on search**: Always set `revPage = 1` when search text changes.
- **XSS in table rows**: Every `r.category`, `r.description`, `r.date` must pass through `escapeHtml()`.

---

## FEATURE 4 — Expense Table (F4)

### What It Does (Plain English)
Identical to the Revenue Table but shows only expense transactions. Uses the same pagination, search, and bulk-delete patterns.

### Implementation
Same as F3 — copy the Revenue Table implementation and change:
- `type: 'revenue'` → `type: 'expense'`
- All variable names: `rev` → `exp`
- Badge color: `.badge.teal` → `.badge.red`
- Amount color: `.amount.teal` → `.amount.red`

---

## FEATURE 5 — All Transactions Table (F5)

### What It Does (Plain English)
A master view showing all income and expenses together. You can filter by type, month, and year, sort any column, and export everything to a file.

### Key Difference from F3/F4
- Shows both revenue and expenses
- Supports column sorting (click header)
- Year + month + type dropdowns as filters
- Page size selector (25/50/100/250)
- Export to CSV/Excel buttons

### Logic

```javascript
let txnPage     = 1;
let txnPageSize = 25;
let txnSort     = { col: 'date', dir: 'desc' };
let txnFilters  = { search: '', type: '', month: '', year: '' };

async function renderTxnTable() {
  const { rows, total } = await dbQuery({
    ...txnFilters,
    sort:     txnSort.col,
    dir:      txnSort.dir,
    page:     txnPage,
    pageSize: txnPageSize
  });

  // ... render table rows with escapeHtml on all values
}

function sortTxnBy(col) {
  if (txnSort.col === col) {
    txnSort.dir = txnSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    txnSort.col = col;
    txnSort.dir = 'asc';
  }
  txnPage = 1;
  renderTxnTable();
}

// Page size change
function onTxnPageSizeChange() {
  txnPageSize = +document.getElementById('txn-page-size').value;
  txnPage = 1;
  renderTxnTable();
}
```

### CSV Export

```javascript
async function exportCSV() {
  const all = await dbGetAll();
  const header = ['Date','Type','Category','Description','Amount','Month','Year'];

  // BUG PREVENTION: csvSanitize on every cell to prevent formula injection
  const lines = [
    header.join(','),
    ...all.map(r => [
      csvSanitize(r.date),
      csvSanitize(r.type),
      csvSanitize(r.category),
      csvSanitize(r.description || ''),
      csvSanitize(r.amount),
      csvSanitize(r.month),
      csvSanitize(r.year)
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pl_export_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## FEATURE 6 — Monthly P&L Table (F6)

### What It Does (Plain English)
A one-row-per-month summary for the selected fiscal year. Shows total revenue, expenses, net profit, and margin for each month. Useful for spotting your best and worst months.

### Logic

```javascript
async function renderMonthlyTable() {
  const all  = await dbGetAll();
  const rows = all.filter(r => r.year === settings.fiscalYear);

  // Aggregate by month
  const monthData = {};
  rows.forEach(r => {
    if (!monthData[r.month]) monthData[r.month] = { rev: 0, exp: 0 };
    if (r.type === 'revenue') monthData[r.month].rev += r.amount;
    if (r.type === 'expense') monthData[r.month].exp += r.amount;
  });

  // Only months with data, in calendar order
  const activeMonths = MONTHS.filter(m => monthData[m]);

  let totalRev = 0, totalExp = 0;

  const tbody = document.getElementById('monthly-tbody');
  tbody.innerHTML = activeMonths.map(m => {
    const { rev, exp } = monthData[m];
    const net    = rev - exp;
    const margin = rev > 0 ? (net / rev * 100) : 0;
    totalRev += rev;
    totalExp += exp;
    return `<tr>
      <td>${m}</td>
      <td class="teal">${fmt(rev)}</td>
      <td class="red">${fmt(exp)}</td>
      <td class="${net >= 0 ? 'teal' : 'red'}">${fmt(net)}</td>
      <td class="amber">${fmtPct(margin)}</td>
    </tr>`;
  }).join('');

  // Footer totals
  const totalNet    = totalRev - totalExp;
  const totalMargin = totalRev > 0 ? (totalNet / totalRev * 100) : 0;
  document.getElementById('monthly-footer').innerHTML = `
    <tr class="total-row">
      <td><strong>Total</strong></td>
      <td class="teal"><strong>${fmt(totalRev)}</strong></td>
      <td class="red"><strong>${fmt(totalExp)}</strong></td>
      <td class="${totalNet >= 0 ? 'teal' : 'red'}"><strong>${fmt(totalNet)}</strong></td>
      <td class="amber"><strong>${fmtPct(totalMargin)}</strong></td>
    </tr>`;
}
```

---

## FEATURE 7 — Add Transaction Form (F7)

### What It Does (Plain English)
A simple form to enter a single income or expense. Pick the date, choose income or expense, type the amount, select or type a category, and add an optional note. Press Enter to save quickly.

### HTML

```html
<div id="add-view">
  <form id="quick-add-form" onsubmit="quickAddTransaction(event)">
    <div class="form-row">
      <label class="form-label">Date</label>
      <input id="qa-date" type="date" class="form-input" required>
    </div>
    <div class="form-row">
      <label class="form-label">Type</label>
      <div class="type-toggle">
        <button type="button" id="qa-type-rev" class="active" onclick="setType('revenue')">Revenue</button>
        <button type="button" id="qa-type-exp"               onclick="setType('expense')">Expense</button>
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">Category</label>
      <input id="qa-category" type="text" list="cat-datalist" class="form-input"
             placeholder="e.g. Product Sales" autocomplete="off">
      <datalist id="cat-datalist"></datalist>
    </div>
    <div class="form-row">
      <label class="form-label">Amount</label>
      <div class="amount-input-wrap">
        <span id="qa-currency-prefix" class="currency-prefix">$</span>
        <input id="qa-amount" type="number" min="0.01" step="0.01" class="form-input" placeholder="0.00" required>
      </div>
    </div>
    <div class="form-row">
      <label class="form-label">Description <span class="optional">(optional)</span></label>
      <input id="qa-description" type="text" class="form-input" placeholder="Notes...">
    </div>
    <button type="submit" class="btn btn-primary">Add Transaction</button>
  </form>

  <!-- Recently added (last 5) -->
  <div id="qa-recent"></div>
</div>
```

### Logic

```javascript
let qaType = 'revenue';

function setType(type) {
  qaType = type;
  document.getElementById('qa-type-rev').classList.toggle('active', type === 'revenue');
  document.getElementById('qa-type-exp').classList.toggle('active', type === 'expense');
  updateCatDatalist(); // Refresh categories based on type
}

function updateCatDatalist() {
  const datalist = document.getElementById('cat-datalist');
  datalist.innerHTML = CATEGORIES
    .filter(c => guessType(c) === qaType) // Only show relevant categories
    .map(c => `<option value="${escapeHtml(c)}">`)
    .join('');
}

async function quickAddTransaction(e) {
  e.preventDefault();

  const date   = document.getElementById('qa-date').value;
  const amount = parseFloat(document.getElementById('qa-amount').value);
  const cat    = document.getElementById('qa-category').value.trim();
  const desc   = document.getElementById('qa-description').value.trim();

  // Validation
  if (!date)          { toast('Date is required', 'error'); return; }
  if (!amount || amount <= 0) { toast('Enter a valid positive amount', 'error'); return; }

  const txn = prepareTransaction({
    id:          Date.now() + Math.random(), // unique ID
    date,
    type:        qaType,
    category:    cat || 'Uncategorized',
    description: desc,
    amount:      Math.round(amount * 100) / 100, // store rounded value
  });

  await dbPut(txn);
  scheduleSnapshot();

  // Clear form — keep date and type for rapid entry
  document.getElementById('qa-amount').value      = '';
  document.getElementById('qa-category').value    = '';
  document.getElementById('qa-description').value = '';
  document.getElementById('qa-amount').focus();

  toast(`${qaType === 'revenue' ? 'Revenue' : 'Expense'} added`, 'success');
  renderRecentEntries();
}

async function renderRecentEntries() {
  const all    = await dbGetAll();
  // Sort by id (timestamp) descending, take first 5
  const recent = all.sort((a, b) => b.id - a.id).slice(0, 5);

  const container = document.getElementById('qa-recent');
  if (!recent.length) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <h4>Recently Added</h4>
    <table class="recent-table">
      ${recent.map(r => `
        <tr>
          <td>${escapeHtml(r.date)}</td>
          <td><span class="badge ${r.type === 'revenue' ? 'teal' : 'red'}">${escapeHtml(r.type)}</span></td>
          <td>${escapeHtml(r.category)}</td>
          <td class="${r.type === 'revenue' ? 'teal' : 'red'}">${fmt(r.amount)}</td>
        </tr>
      `).join('')}
    </table>`;
}

// Initialize date to today on view load
function initAddForm() {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  document.getElementById('qa-date').value = today;
  document.getElementById('qa-currency-prefix').textContent = settings.currency || '$';
  updateCatDatalist();
  renderRecentEntries();
}
```

### Known Bugs to Avoid
- **Amount float drift**: Store `Math.round(amount * 100) / 100`, not the raw `parseFloat` value.
- **Empty category**: Default to `'Uncategorized'` not empty string.
- **Duplicate IDs**: Use `Date.now() + Math.random()` — never use sequential counters that reset on refresh.
- **Date off by one**: Always use `new Date().toISOString().slice(0,10)` for today's date (UTC-safe).

---

## FEATURE 8 — CSV / Excel Import (F8)

### What It Does (Plain English)
Upload a spreadsheet or CSV file to import many transactions at once. The app helps you map which column in your file corresponds to which field (date, amount, etc.), then imports everything automatically.

### Architecture
- Files under 500KB: parse synchronously in main thread.
- Files 500KB+: parse in a Web Worker to avoid freezing the UI.

### CSV Parser

```javascript
// RFC 4180 compliant CSV parser
// BUG PREVENTION: Handle quoted fields with embedded commas and newlines
function parseCSV(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (ch === '\r') {
        // skip \r in \r\n
      } else {
        field += ch;
      }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
```

### Web Worker for Large Files

```javascript
const CSV_WORKER_SRC = `
  self.onmessage = function(e) {
    const text = e.data.text;
    // Inline the same parseCSV() function here
    function parseCSV(text) { /* same as above */ }
    const rows = parseCSV(text);
    self.postMessage({ type: 'done', rows });
  };
`;

function parseCSVWithWorker(text) {
  return new Promise((resolve) => {
    const blob   = new Blob([CSV_WORKER_SRC], { type: 'application/javascript' });
    const url    = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = e => {
      URL.revokeObjectURL(url);
      worker.terminate();
      resolve(e.data.rows);
    };
    worker.postMessage({ text });
  });
}

async function handleFileImport(file) {
  const text = await file.text();
  let rows;
  if (text.length > 500_000) {
    rows = await parseCSVWithWorker(text);
  } else {
    rows = parseCSV(text);
  }
  openMappingModal(rows, file.name);
}
```

### Field Mapping Modal

```javascript
// State for the mapping modal
let csvPreviewRows = [];
let csvFieldMap    = {}; // { 'Date': 0, 'Amount': 2, ... } — field name → column index

function openMappingModal(rows, filename) {
  csvPreviewRows = rows;
  const headers  = rows[0] || [];
  const dataRows = rows.slice(1, 6); // Preview first 5 data rows

  // Auto-guess mapping based on header names
  const guesses = { date: -1, type: -1, category: -1, description: -1, amount: -1 };
  headers.forEach((h, i) => {
    const low = (h || '').toLowerCase().trim();
    if (/date/i.test(low))        guesses.date        = i;
    if (/amount|total|value/i.test(low)) guesses.amount = i;
    if (/category|type2/i.test(low)) guesses.category  = i;
    if (/type|kind/i.test(low))   guesses.type        = i;
    if (/desc|note|memo/i.test(low)) guesses.description = i;
  });

  // Render mapping selects — one dropdown per field
  const fields = ['date', 'type', 'category', 'description', 'amount'];
  // ... render HTML with selects pre-set to guesses

  document.getElementById('mapping-modal').style.display = 'flex';
}

async function finishCsvImport() {
  const headers  = csvPreviewRows[0] || [];
  const dataRows = csvPreviewRows.slice(1);

  // Read mapping from dropdowns
  const map = {
    date:        +document.getElementById('map-date').value,
    type:        +document.getElementById('map-type').value,
    category:    +document.getElementById('map-category').value,
    description: +document.getElementById('map-description').value,
    amount:      +document.getElementById('map-amount').value,
  };

  const imported = [];
  const skipped  = [];

  dataRows.forEach((row, i) => {
    const raw = {
      date:        row[map.date]        || '',
      type:        row[map.type]        || 'expense',
      category:    row[map.category]    || 'Uncategorized',
      description: row[map.description] || '',
      amount:      row[map.amount]      || '0',
    };

    // Parse amount — handle accounting format: (1,234.56) = negative, but we use absolute
    let amt = parseFloat(
      String(raw.amount)
        .replace(/\((.+)\)/, '-$1')   // (1234) → -1234
        .replace(/[^0-9.\-]/g, '')     // strip currency symbols, commas
    );
    if (isNaN(amt) || amt === 0) { skipped.push(i + 2); return; }
    amt = Math.abs(amt); // always positive

    // Parse date — try multiple formats
    let date = raw.date.trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
      const [m, d, y] = date.split('/');
      date = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped.push(i + 2); return; }

    // Normalize type
    const type = /rev|income|earn/i.test(raw.type) ? 'revenue' : 'expense';

    imported.push(prepareTransaction({
      id:          Date.now() + Math.random(),
      date,
      type,
      category:    raw.category.trim() || 'Uncategorized',
      description: raw.description.trim(),
      amount:      Math.round(amt * 100) / 100,
    }));
  });

  if (imported.length === 0) {
    toast('No valid rows found. Check date and amount columns.', 'error');
    return;
  }

  await dbBulkPut(imported);
  scheduleSnapshot();
  document.getElementById('mapping-modal').style.display = 'none';
  toast(`Imported ${imported.length} transactions${skipped.length ? ` (${skipped.length} skipped)` : ''}`, 'success');
  refreshDashboard();
}
```

### Known Bugs to Avoid
- **Quoted fields with commas**: Must use RFC 4180 parser, not `row.split(',')`.
- **Accounting format**: `(1,234.56)` means negative — strip parentheses and commas before `parseFloat`.
- **Date formats**: Always convert `MM/DD/YYYY` to `YYYY-MM-DD` before storing.
- **Zero amounts**: Skip rows where amount is 0 or NaN — they indicate bad mapping.

---

## FEATURE 9 — Category Management (F9)

### What It Does (Plain English)
A list of labels you can customize. Add your own categories, rename them, or delete them. Renaming a category automatically updates all existing transactions that use it.

### Default Categories

```javascript
const DEFAULT_CATEGORIES = [
  'Product Sales', 'Service Revenue', 'Consulting / Retainers',
  'Subscription Revenue', 'Licensing Fees', 'Grants & Funding',
  'Cost of Goods Sold (COGS)', 'Salaries & Wages', 'Rent / Office Space',
  'Utilities', 'Software & Subscriptions', 'Marketing & Advertising',
  'Professional Services', 'Insurance', 'Travel & Transportation',
  'Meals & Entertainment', 'Equipment & Hardware', 'Loan Repayments',
  'Taxes & Licenses', 'Miscellaneous'
];

const CATEGORIES_KEY = 'pl_categories_v1';
let CATEGORIES = [...DEFAULT_CATEGORIES];

function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (raw) CATEGORIES = JSON.parse(raw);
  } catch { CATEGORIES = [...DEFAULT_CATEGORIES]; }
}

function saveCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(CATEGORIES));
}
```

### Guess Revenue vs Expense from Name

```javascript
const REVENUE_KEYWORDS = ['sales', 'revenue', 'income', 'service', 'consult', 'subscription', 'licens', 'grant', 'earning'];

function guessType(category) {
  const low = (category || '').toLowerCase();
  return REVENUE_KEYWORDS.some(k => low.includes(k)) ? 'revenue' : 'expense';
}
```

### Category CRUD

```javascript
async function addCategory(name, type) {
  name = name.trim();
  if (!name) { toast('Category name required', 'error'); return; }

  // BUG PREVENTION: Check for duplicate (case-insensitive)
  if (CATEGORIES.some(c => c.toLowerCase() === name.toLowerCase())) {
    toast('Category already exists', 'error');
    return;
  }
  CATEGORIES.push(name);
  saveCategories();
  renderCategoryManager();
  toast('Category added', 'success');
}

async function renameCategory(oldName, newName) {
  newName = newName.trim();
  if (!newName) { toast('Name required', 'error'); return; }
  if (CATEGORIES.some(c => c.toLowerCase() === newName.toLowerCase() && c !== oldName)) {
    toast('Name already in use', 'error');
    return;
  }

  // Update all transactions with old category name
  const all = await dbGetAll();
  const toUpdate = all.filter(r => r.category === oldName);
  await Promise.all(toUpdate.map(r => dbPut({ ...r, category: newName })));

  // Update category list
  const idx = CATEGORIES.indexOf(oldName);
  if (idx !== -1) CATEGORIES[idx] = newName;
  saveCategories();
  renderCategoryManager();
  toast(`Renamed "${oldName}" to "${newName}" (${toUpdate.length} transactions updated)`, 'success');
}

async function deleteCategory(name) {
  if (!confirm(`Delete "${name}"? Transactions will be labeled "Uncategorized".`)) return;

  // Update transactions
  const all = await dbGetAll();
  const toUpdate = all.filter(r => r.category === name);
  await Promise.all(toUpdate.map(r => dbPut({ ...r, category: 'Uncategorized' })));

  CATEGORIES = CATEGORIES.filter(c => c !== name);
  saveCategories();
  renderCategoryManager();
  toast(`Deleted "${name}" (${toUpdate.length} transactions updated)`, 'success');
}
```

### Industry Templates

```javascript
const INDUSTRY_TEMPLATES = {
  saas: {
    name: 'SaaS',
    categories: ['MRR / Subscription Revenue', 'One-Time Licenses', 'Professional Services', 'Hosting & Infrastructure', 'Salaries & Wages', 'Marketing & Ads', 'Customer Support Tools', 'R&D Expenses']
  },
  ecommerce: {
    name: 'E-commerce',
    categories: ['Product Sales', 'Shipping Revenue', 'Cost of Goods Sold (COGS)', 'Fulfillment & Shipping', 'Marketing & Ads', 'Returns & Refunds', 'Platform Fees', 'Salaries & Wages']
  },
  consulting: {
    name: 'Consulting',
    categories: ['Consulting Fees', 'Retainer Revenue', 'Project Deliverables', 'Subcontractor Costs', 'Travel & Transportation', 'Software & Tools', 'Professional Development', 'Insurance']
  },
  restaurant: {
    name: 'Restaurant',
    categories: ['Food Sales', 'Beverage Sales', 'Food Cost (COGS)', 'Labor / Wages', 'Rent', 'Utilities', 'Marketing', 'Equipment Repairs']
  },
  generic: {
    name: 'Generic Business',
    categories: [...DEFAULT_CATEGORIES]
  }
};

function applyIndustryTemplate(key) {
  const tmpl = INDUSTRY_TEMPLATES[key];
  if (!tmpl) return;
  // Merge — add template categories that don't already exist
  tmpl.categories.forEach(c => {
    if (!CATEGORIES.includes(c)) CATEGORIES.push(c);
  });
  saveCategories();
  renderCategoryManager();
  toast(`Applied "${tmpl.name}" template`, 'success');
}
```

---

## FEATURE 10 — File Sync (Local Backup) (F10)

### What It Does (Plain English)
Links a file on your computer and automatically saves all your data to it every 30 minutes. Only works in Chrome, Edge, or Brave (not Firefox or Safari).

### Browser Compatibility Check

```javascript
function isFileSystemAPISupported() {
  return typeof window.showSaveFilePicker === 'function';
}
```

### Auto-Backup Logic

```javascript
const L2_META_KEY      = 'pl_l2_meta';
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let autoFileHandle    = null;
let autoBackupTimer   = null;
let l2Meta            = { fileName: '', lastBackup: null };

function loadL2Meta() {
  try {
    const raw = localStorage.getItem(L2_META_KEY);
    if (raw) l2Meta = JSON.parse(raw);
  } catch { l2Meta = { fileName: '', lastBackup: null }; }
}

async function linkBackupFile() {
  if (!isFileSystemAPISupported()) {
    toast('File backup requires Chrome, Edge, or Brave', 'error');
    return;
  }

  try {
    autoFileHandle = await window.showSaveFilePicker({
      suggestedName: 'pl_backup.json',
      types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
    });
    l2Meta.fileName = autoFileHandle.name;
    localStorage.setItem(L2_META_KEY, JSON.stringify(l2Meta));
    startAutoFileBackupTimer();
    await runFileBackupNow(); // immediate first backup
    toast(`Linked to ${autoFileHandle.name}`, 'success');
  } catch (err) {
    if (err.name !== 'AbortError') toast('Could not link file', 'error');
  }
}

async function runFileBackupNow() {
  if (!autoFileHandle) return;
  try {
    const all  = await dbGetAll();
    const data = JSON.stringify({ settings, transactions: all, exportedAt: Date.now() }, null, 2);

    const writable = await autoFileHandle.createWritable();
    await writable.write(data);
    await writable.close();

    l2Meta.lastBackup = Date.now();
    localStorage.setItem(L2_META_KEY, JSON.stringify(l2Meta));
    toast('Backup saved', 'success');
  } catch (err) {
    // BUG PREVENTION: Permission may have been revoked — handle gracefully
    toast('Backup failed: ' + err.message, 'error');
  }
}

function startAutoFileBackupTimer() {
  clearInterval(autoBackupTimer);
  autoBackupTimer = setInterval(runFileBackupNow, AUTO_BACKUP_INTERVAL_MS);
}

function unlinkBackupFile() {
  autoFileHandle = null;
  clearInterval(autoBackupTimer);
  l2Meta = { fileName: '', lastBackup: null };
  localStorage.removeItem(L2_META_KEY);
  toast('File backup unlinked', 'info');
}
```

---

## FEATURE 11 — Three-Layer Backup System (F11)

### What It Does (Plain English)
Three overlapping safety nets for your data:
- **Layer 1**: The app automatically saves snapshots in your browser (up to 5 kept).
- **Layer 2**: Every 30 minutes, the app saves to a file on your computer (requires Chrome).
- **Layer 3**: Syncs your data to Google Sheets in the cloud (requires a Google account).

### Layer 1: Browser Snapshots

```javascript
const SNAPSHOTS_KEY = 'pl_snapshots_v4';
const MAX_SNAPSHOTS = 5;

let snapshotTimer = null;

function scheduleSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(createSnapshot, 3000); // debounce 3s after last change
}

async function createSnapshot() {
  const all       = await dbGetAll();
  let snapshots   = loadSnapshots();

  const snap = { ts: Date.now(), count: all.length, data: all };
  snapshots.unshift(snap); // newest first

  // Keep only last MAX_SNAPSHOTS
  if (snapshots.length > MAX_SNAPSHOTS) snapshots = snapshots.slice(0, MAX_SNAPSHOTS);

  // BUG PREVENTION: Guard localStorage quota
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Trim further and retry
      snapshots = snapshots.slice(0, 2);
      try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots)); } catch { /* ignore */ }
    }
  }
}

function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
  } catch { return []; }
}

async function restoreSnapshot(ts) {
  if (!confirm('Restore this snapshot? Current data will be replaced.')) return;

  const snapshots = loadSnapshots();
  const snap = snapshots.find(s => s.ts === ts);
  if (!snap) { toast('Snapshot not found', 'error'); return; }

  await dbClear();
  await dbBulkPut(snap.data);
  toast(`Restored ${snap.count} transactions`, 'success');
  refreshDashboard();
}
```

### Layer 3: Google Sheets Sync

```javascript
// Google Sheets integration requires:
// 1. A Google Cloud project with Sheets API enabled
// 2. An OAuth 2.0 client ID configured for your domain
// 3. The google.accounts.oauth2 library loaded

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';
let gsheetsToken = null;
let gsheetsSheetId = null;

async function gSheetsAPI(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${gsheetsToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
  return res.json();
}

async function gsheetsPushSilent() {
  if (!gsheetsToken || !gsheetsSheetId) return;
  try {
    const all = await dbGetAll();
    const values = [
      ['ID','Date','Type','Category','Description','Amount','Month','Year'],
      ...all.map(r => [r.id, r.date, r.type, r.category, r.description || '', r.amount, r.month, r.year])
    ];
    await gSheetsAPI('PUT',
      `https://sheets.googleapis.com/v4/spreadsheets/${gsheetsSheetId}/values/PL_Transactions!A1?valueInputOption=RAW`,
      { values }
    );
  } catch { /* silent — don't interrupt user */ }
}
```

### Protection Score Display

```javascript
function getProtectionScore() {
  let score = 0;
  const snapshots = loadSnapshots();
  if (snapshots.length > 0) score++;   // Layer 1 active
  if (autoFileHandle)       score++;   // Layer 2 active
  if (gsheetsSheetId)       score++;   // Layer 3 active
  return score; // 0, 1, 2, or 3
}

function updateProtectionBanner() {
  const score  = getProtectionScore();
  const banner = document.getElementById('protection-banner');
  const colors = ['red', 'amber', 'teal', 'teal'];
  const labels = ['No backup active', '1 layer active', '2 layers active', '3 layers active (maximum protection)'];
  banner.textContent  = labels[score];
  banner.className    = `protection-banner ${colors[score]}`;
}
```

---

## FEATURE 12 — Settings Page (F12)

### What It Does (Plain English)
Set your business name (shown in the app title), the year you're reporting on, and the currency symbol used throughout the app.

### HTML

```html
<div id="settings-view">
  <form onsubmit="saveSettingsForm(event)">
    <label>Business Name
      <input id="set-bizname" type="text" class="form-input" placeholder="My Business">
    </label>
    <label>Fiscal Year
      <input id="set-year" type="number" class="form-input" min="2000" max="2100">
    </label>
    <label>Currency Symbol
      <input id="set-currency" type="text" class="form-input" placeholder="$" maxlength="4">
    </label>
    <button type="submit" class="btn btn-primary">Save Settings</button>
  </form>
</div>
```

### Logic

```javascript
function loadSettingsForm() {
  document.getElementById('set-bizname').value  = settings.bizName    || '';
  document.getElementById('set-year').value     = settings.fiscalYear || new Date().getFullYear();
  document.getElementById('set-currency').value = settings.currency   || '$';
}

function saveSettingsForm(e) {
  e.preventDefault();
  settings.bizName    = document.getElementById('set-bizname').value.trim();
  settings.fiscalYear = +document.getElementById('set-year').value || new Date().getFullYear();
  settings.currency   = document.getElementById('set-currency').value.trim() || '$';
  saveSettings();
  toast('Settings saved', 'success');
  // Update currency prefix in Add form
  document.getElementById('qa-currency-prefix').textContent = settings.currency;
}
```

---

## FEATURE 13 — Auth Gate (F13, Optional)

### What It Does (Plain English)
A sign-in screen that protects the app. Users can sign in with their Google account or enter a license key. The session is remembered for 24 hours so they don't have to log in every time.

### When to Include
Include this only if your app needs access control (e.g., paid software, internal tools). Omit entirely for public or personal apps.

### Session Cache

```javascript
const AUTH_SESSION_KEY = 'pl_auth_session_v1';
const SESSION_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

let authUser = null; // { email, name, plan, ts }

function checkAuthSession() {
  try {
    const raw  = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return showAuthGate();
    const sess = JSON.parse(raw);
    if (Date.now() - sess.ts > SESSION_TTL_MS) return showAuthGate();
    authUser = sess;
    bootApp(); // session valid — go straight to app
  } catch {
    showAuthGate();
  }
}

function cacheSession(user) {
  authUser = { ...user, ts: Date.now() };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(authUser));
}

function authSignOut() {
  localStorage.removeItem(AUTH_SESSION_KEY);
  authUser = null;
  showAuthGate();
}
```

### Supabase License Check

```javascript
const SUPA_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPA_KEY = 'YOUR_ANON_KEY'; // safe to expose — protected by RLS

async function verifyLicense(email, licenseKey) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/pl_licensed_users?email=eq.${encodeURIComponent(email)}&select=*`,
    {
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      }
    }
  );

  if (!res.ok) throw new Error('Could not connect to license server');
  const rows = await res.json();

  if (!rows.length) throw new Error('No license found for this email');

  const user = rows[0];
  if (user.status === 'suspended') throw new Error('License suspended');
  if (user.expires_at && new Date(user.expires_at) < new Date()) throw new Error('License expired');
  if (licenseKey && user.license_key !== licenseKey) throw new Error('Invalid license key');

  return user; // { email, name, plan, status }
}
```

---

## FEATURE 14 — Theme Toggle (F14)

### What It Does (Plain English)
A button that switches the app between dark mode (dark background, light text) and light mode. Your preference is remembered.

### Logic

```javascript
const THEME_KEY = 'pl-theme';

function applyTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeButton(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.setAttribute('data-theme', next);
  updateThemeButton(next);
  if (typeof retintCharts === 'function') retintCharts(); // F2 integration
}

function updateThemeButton(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
```

---

## FEATURE 15 — Toast Notifications (F15)

### What It Does (Plain English)
Small pop-up messages that appear at the bottom of the screen to tell you when something succeeds, fails, or needs attention. They disappear automatically after a few seconds.

### HTML

```html
<!-- Place at bottom of <body> -->
<div id="toast" role="status" aria-live="polite" aria-atomic="false"></div>
```

### Logic

```javascript
function toast(msg, type = 'info', opts = {}) {
  const container = document.getElementById('toast');
  const duration  = opts.duration || 3200;

  const el        = document.createElement('div');
  el.className    = `toast-msg ${type}`;
  // BUG PREVENTION: escapeHtml before setting textContent is redundant but use textContent, not innerHTML
  el.textContent  = msg;

  if (opts.action) {
    const btn   = document.createElement('button');
    btn.textContent = opts.action.label;
    btn.className   = 'toast-action';
    btn.onclick     = () => { opts.action.onClick(); el.remove(); };
    el.appendChild(btn);
  }

  // Click to dismiss
  el.addEventListener('click', () => el.remove());

  container.appendChild(el);

  // Auto-dismiss
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300); // fade out then remove
  }, duration);
}
```

### CSS

```css
#toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
         z-index: 9999; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.toast-msg { padding: 12px 20px; border-radius: 8px; font-size: 14px; cursor: pointer;
             max-width: 360px; box-shadow: var(--shadow); transition: opacity 0.3s;
             display: flex; align-items: center; gap: 10px; }
.toast-msg.success { background: var(--green);  color: #fff; }
.toast-msg.error   { background: var(--red);    color: #fff; }
.toast-msg.info    { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.toast-action { background: rgba(255,255,255,.25); border: none; color: inherit;
                padding: 2px 10px; border-radius: 4px; cursor: pointer; font-weight: 600; }
@media (max-width: 640px) { #toast { bottom: 80px; } } /* above mobile nav bar */
```

---

## FEATURE 16 — Undo Delete (F16)

### What It Does (Plain English)
When you delete a transaction (or multiple transactions), an "Undo" button appears in a toast for 6 seconds. Click it to restore everything exactly as it was.

### Logic

```javascript
function offerUndo(label, deletedTxns) {
  // BUG PREVENTION: Clone the array to avoid mutations after this call
  const saved = deletedTxns.map(t => ({ ...t }));

  toast(label, 'info', {
    duration: 6000,
    action: {
      label:   'Undo',
      onClick: async () => {
        await dbBulkPut(saved);
        scheduleSnapshot();
        renderRevTable();  // or whichever view is active
        refreshDashboard();
        toast('Restored', 'success');
      }
    }
  });
}

// Usage when deleting:
async function deleteOneTxn(id) {
  const txn = await dbGet(id);
  if (!txn) return;
  await dbDelete(id);
  refreshCurrentView();
  offerUndo('Transaction deleted', [txn]);
}
```

---

## FEATURE 17 — Keyboard Shortcuts (F17)

### What It Does (Plain English)
Press keys to navigate without using the mouse. Press `?` to see a list of all shortcuts.

### Logic

```javascript
const SHORTCUTS = {
  'n': () => showView('add-view'),      // New transaction
  '/': () => document.querySelector('[id$="-search"]')?.focus(), // Search
  '?': toggleShortcutsModal,
  'g': null, // prefix key — handled below
};

const G_SHORTCUTS = {
  'd': () => showView('dashboard-view'),
  'r': () => showView('revenue-view'),
  'e': () => showView('expenses-view'),
  'm': () => showView('monthly-view'),
  't': () => showView('transactions-view'),
  's': () => showView('settings-view'),
  'i': () => showView('upload-view'),
  'b': () => showView('backup-view'),
};

let gKeyActive = false;

document.addEventListener('keydown', e => {
  // Skip if typing in an input, textarea, or select
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key.toLowerCase();

  if (e.key === 'Escape') {
    closeAllModals();
    return;
  }

  if (gKeyActive) {
    gKeyActive = false;
    if (G_SHORTCUTS[key]) G_SHORTCUTS[key]();
    return;
  }

  if (key === 'g') { gKeyActive = true; return; }

  if (SHORTCUTS[key]) SHORTCUTS[key]();
});
```

---

## FEATURE 18 — PWA / Offline Support (F18)

### What It Does (Plain English)
The app works without an internet connection after the first visit, and can be installed on a phone or desktop like a native app.

### manifest.json

```json
{
  "name": "P&L Dashboard",
  "short_name": "P&L Dash",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#0f1117",
  "background_color": "#0f1117",
  "description": "Track profit and loss for your business",
  "categories": ["finance", "productivity", "business"],
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "shortcuts": [
    { "name": "Add Transaction", "url": "/?action=add",    "description": "Quickly add a revenue or expense" },
    { "name": "Import CSV",      "url": "/?action=import", "description": "Import transactions from CSV" },
    { "name": "Dashboard",       "url": "/?action=dashboard", "description": "View your financial overview" }
  ]
}
```

### service-worker.js

```javascript
const CACHE_NAME   = 'pl-dashboard-v1';
const CORE_ASSETS  = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS)));
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', e => {
  // Delete old caches
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Bypass service worker for API calls (Supabase, Google)
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('accounts.google.com')) {
    return; // Let the browser handle it
  }

  // Stale-while-revalidate for app shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});
```

### Registration (in main app HTML)

```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}
```

---

## FEATURE 19 — Data Export (F19)

### What It Does (Plain English)
Download all your data as a CSV file (opens in Excel/Google Sheets), an Excel file, or a JSON file (for backup or importing into other apps).

### CSV Export (see F5 for full implementation)

### JSON Export

```javascript
async function exportJSON() {
  const all  = await dbGetAll();
  const data = { settings, transactions: all, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pl_backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### JSON Import

```javascript
async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data.transactions)) {
      toast('Invalid backup file', 'error');
      return;
    }

    if (!confirm(`Import ${data.transactions.length} transactions? Duplicates will be skipped.`)) return;

    // Merge — dbBulkPut uses put() which overwrites by ID
    // To merge without overwriting, filter for new IDs only
    const existing = new Set((await dbGetAll()).map(r => r.id));
    const toImport  = data.transactions.filter(r => !existing.has(r.id));

    await dbBulkPut(toImport);
    scheduleSnapshot();
    toast(`Imported ${toImport.length} new transactions`, 'success');
    refreshDashboard();
  } catch {
    toast('Could not read backup file', 'error');
  }
}
```

---

## FEATURE 20 — Industry Templates (F20)

### What It Does (Plain English)
Choose your business type (e.g., SaaS, restaurant, freelancer) and the app automatically sets up the right income and expense categories for you — saving time vs. creating them manually.

*See F9 for full implementation including `INDUSTRY_TEMPLATES` and `applyIndustryTemplate()`.*

---

## LAYOUT BLUEPRINT

### Full Page Structure

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <!-- REQUIRED: Prevent XSS via CSP -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com;
                 style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                 font-src 'self' https://fonts.gstatic.com;
                 connect-src 'self' https://*.supabase.co https://sheets.googleapis.com https://www.googleapis.com;">
  <title>P&L Dashboard</title>
  <link rel="manifest" href="manifest.json">
</head>
<body>
  <!-- Top Bar -->
  <header id="topbar">
    <div class="topbar-left">
      <button id="sidebar-toggle" class="icon-btn mobile-only">☰</button>
      <span class="app-logo">P&L Dashboard</span>
    </div>
    <div class="topbar-right">
      <span id="save-status" class="save-status"></span>
      <button id="theme-toggle" onclick="toggleTheme()">☀️</button>
    </div>
  </header>

  <!-- App body: sidebar + main -->
  <div id="app">
    <!-- Sidebar Navigation (Desktop) -->
    <nav id="sidebar">
      <div class="nav-section">
        <div class="nav-label">Overview</div>
        <a onclick="showView('dashboard-view')"    class="nav-item" data-view="dashboard-view">📊 Dashboard</a>
        <a onclick="showView('transactions-view')" class="nav-item" data-view="transactions-view">📋 All Transactions</a>
      </div>
      <div class="nav-section">
        <div class="nav-label">Transactions</div>
        <a onclick="showView('revenue-view')"  class="nav-item" data-view="revenue-view">💰 Revenue</a>
        <a onclick="showView('expenses-view')" class="nav-item" data-view="expenses-view">📉 Expenses</a>
        <a onclick="showView('monthly-view')"  class="nav-item" data-view="monthly-view">📅 Monthly P&L</a>
      </div>
      <div class="nav-section">
        <div class="nav-label">Data</div>
        <a onclick="showView('add-view')"        class="nav-item" data-view="add-view">➕ Add Transaction</a>
        <a onclick="showView('upload-view')"     class="nav-item" data-view="upload-view">📤 Import</a>
        <a onclick="showView('categories-view')" class="nav-item" data-view="categories-view">🏷 Categories</a>
        <a onclick="showView('backup-view')"     class="nav-item" data-view="backup-view">💾 Backup</a>
        <a onclick="showView('settings-view')"   class="nav-item" data-view="settings-view">⚙️ Settings</a>
      </div>
    </nav>

    <!-- Main Content Area -->
    <main id="main">
      <!-- Each view div — only one visible at a time -->
      <div id="dashboard-view"    class="view">...</div>
      <div id="transactions-view" class="view" style="display:none">...</div>
      <div id="revenue-view"      class="view" style="display:none">...</div>
      <div id="expenses-view"     class="view" style="display:none">...</div>
      <div id="monthly-view"      class="view" style="display:none">...</div>
      <div id="add-view"          class="view" style="display:none">...</div>
      <div id="upload-view"       class="view" style="display:none">...</div>
      <div id="categories-view"   class="view" style="display:none">...</div>
      <div id="backup-view"       class="view" style="display:none">...</div>
      <div id="settings-view"     class="view" style="display:none">...</div>
    </main>
  </div>

  <!-- Mobile Bottom Navigation -->
  <nav id="bottombar" class="mobile-only">
    <button onclick="showView('dashboard-view')">📊<br>Dashboard</button>
    <button onclick="showView('revenue-view')">💰<br>Revenue</button>
    <button class="fab" onclick="showView('add-view')">+</button>
    <button onclick="showView('expenses-view')">📉<br>Expenses</button>
    <button onclick="openMoreDrawer()">☰<br>More</button>
  </nav>

  <!-- Toast container -->
  <div id="toast" role="status" aria-live="polite"></div>
</body>
</html>
```

### View Navigation Function

```javascript
function showView(viewId) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  // Show target
  const target = document.getElementById(viewId);
  if (!target) return;
  target.style.display = 'block';

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewId);
  });

  // Trigger view-specific render
  const renders = {
    'dashboard-view':    () => { refreshDashboard(); renderCharts(); },
    'revenue-view':      () => { revPage = 1; renderRevTable(); },
    'expenses-view':     () => { expPage = 1; renderExpTable(); },
    'transactions-view': () => { txnPage = 1; renderTxnTable(); },
    'monthly-view':      renderMonthlyTable,
    'add-view':          initAddForm,
    'categories-view':   renderCategoryManager,
    'settings-view':     loadSettingsForm,
  };
  if (renders[viewId]) renders[viewId]();
}
```

---

## AUDIT PLAN

### How to Run the Audit
After building any feature from this blueprint, run through the corresponding checklist. Check each box before marking the feature "ready to ship."

---

### A0 — Foundation Audit

```
[ ] IndexedDB opens without errors on first load
[ ] Reload page → data persists (IndexedDB didn't clear)
[ ] Open in private/incognito → app shows "Storage Unavailable" error (not blank screen)
[ ] Settings (business name, currency) save and reload correctly
[ ] Theme preference persists after page reload
[ ] escapeHtml('<script>alert(1)</script>') returns '&lt;script&gt;alert(1)&lt;/script&gt;'
[ ] fmt(1234567.899) returns correct currency string (e.g., "$1,234,567.90")
[ ] fmt(0.1 + 0.2) returns "$0.30" not "$0.30000000000000004"
[ ] getMonthFromDate('2025-01-15') returns 'Jan'
[ ] getYearFromDate('2025-01-15') returns 2025
[ ] prepareTransaction sets month and year fields correctly
```

### A1 — Dashboard Audit

```
[ ] All 6 KPI cards render with correct values (verify manually with known test data)
[ ] Net Profit = Revenue - Expenses (check formula)
[ ] Margin = Net Profit / Revenue × 100 (check formula)
[ ] Margin shows 0.0% when revenue is 0 (no divide-by-zero error)
[ ] Month filter chips appear only for months with transactions
[ ] Clicking "Jan" filter chip shows only January data
[ ] Clicking "All" chip clears filter and shows full year
[ ] KPI values update immediately after adding a new transaction
[ ] Test with negative net profit → value shows in red, positive → teal
```

### A2 — Charts Audit

```
[ ] All 4 charts render without JavaScript errors
[ ] Reload dashboard after adding data → charts show new data
[ ] Toggle dark/light theme → charts re-render with correct colors
[ ] Add 0 transactions for a category → that category does NOT appear in pie chart
[ ] Add transactions in only 2 months → bar chart shows only 2 months
[ ] Chart tooltips show formatted currency values (e.g., "$1,234.00")
```

### A3/A4 — Revenue and Expense Table Audit

```
[ ] Table shows correct transactions (revenue-only or expense-only)
[ ] Search "rent" → shows only rows containing "rent" in any field
[ ] Clear search → all rows return
[ ] Pagination shows correct "Showing X–Y of Z" text
[ ] Next/Previous buttons navigate pages correctly
[ ] Last page "Next" button is disabled
[ ] Select 3 checkboxes → bulk bar shows "3 selected"
[ ] Delete bulk → rows removed from DB (not just UI)
[ ] Undo button restores deleted rows within 6 seconds
[ ] Undo button disappears after 6 seconds
[ ] Category badges show correct color (teal=revenue, red=expense)
[ ] Test XSS: Add transaction with description "<script>alert(1)</script>" → renders as text, no alert fires
[ ] Test long category name (50 chars) → wraps correctly, doesn't break layout
```

### A5 — All Transactions Table Audit

```
[ ] Shows both revenue and expense rows
[ ] Type filter "Revenue" → shows only revenue
[ ] Year filter → shows only selected year
[ ] Month filter → shows only selected month
[ ] Sort by Amount ascending → smallest first
[ ] Sort by Date descending → newest first
[ ] Click sort column twice → reverses direction
[ ] Page size change to 100 → shows up to 100 rows
[ ] Export CSV button → file downloads
[ ] Open CSV in Excel → no formulas execute (test with description starting with "=")
```

### A6 — Monthly P&L Audit

```
[ ] Shows all months with at least one transaction
[ ] Empty months (no transactions) are NOT shown
[ ] Footer "Total" row sums correctly
[ ] Net Profit per row = Revenue - Expenses for that month
[ ] Margin per row = Net Profit / Revenue × 100 (0% when revenue = 0)
[ ] Loss months show red Net Profit values
```

### A7 — Add Transaction Form Audit

```
[ ] Date field defaults to today's date
[ ] Submit with no date → shows error toast
[ ] Submit with amount = 0 → shows error toast  
[ ] Submit with negative amount → shows error toast
[ ] Submit valid data → success toast, form resets (amount cleared, date kept)
[ ] Submit valid data → transaction appears in "Recently Added" list
[ ] Currency prefix updates when settings currency changes
[ ] Category datalist shows correct categories for current type (revenue vs expense)
[ ] Press Enter in Amount field → submits form
[ ] Adding transaction → dashboard KPIs update on next navigation to dashboard
[ ] ID uniqueness: add 100 transactions rapidly → no duplicate IDs (use Set to check)
```

### A8 — CSV Import Audit

```
[ ] Drop a CSV file → mapping modal opens
[ ] Modal shows first 5 rows as preview
[ ] Auto-guess: CSV with "Date" header → date field auto-selected
[ ] Auto-guess: CSV with "Amount" header → amount field auto-selected
[ ] Click Import → transactions added to DB
[ ] Import 0-row CSV → error toast "No valid rows found"
[ ] CSV with amount "(1,234.56)" (accounting format) → imported as 1234.56
[ ] CSV with date "12/31/2025" (MM/DD/YYYY) → stored as "2025-12-31"
[ ] CSV with formula "=SUM(A1:A10)" in description → imported as text, not executed
[ ] Large CSV > 500KB → no UI freeze (Web Worker used)
[ ] Duplicate import (import same file twice) → no duplicate transactions
[ ] Cancel button → closes modal, nothing imported
```

### A9 — Category Management Audit

```
[ ] Default categories load on first use
[ ] Add new category → appears in list + in Add Transaction datalist
[ ] Add duplicate name (case-insensitive) → error toast
[ ] Rename "Rent" to "Office Rent" → all existing "Rent" transactions updated
[ ] Delete category → all transactions updated to "Uncategorized"
[ ] Reset to defaults → default categories restored
[ ] Apply SaaS industry template → SaaS categories added (not replacing existing)
[ ] Categories persist after page reload
```

### A10 — File Sync Audit

```
[ ] In Firefox: "File backup requires Chrome/Edge/Brave" message shown (not error)
[ ] In Chrome: Link file dialog opens
[ ] Link file → file name displayed, auto-backup timer starts
[ ] Add transaction → backup file updates within 30 minutes
[ ] Manual "Backup Now" → file updates immediately
[ ] Unlink → file no longer updated
[ ] Reopen app after closing → linked file status restored (if handle still valid)
```

### A11 — Three-Layer Backup Audit

```
LAYER 1:
[ ] Add/edit transaction → snapshot auto-created after 3 seconds
[ ] Maximum 5 snapshots kept (older ones discarded)
[ ] Restore snapshot → transactions replaced with snapshot data
[ ] Download snapshot → JSON file downloads correctly
[ ] Fill localStorage to quota → app doesn't crash (trims snapshots gracefully)

LAYER 3 (if implemented):
[ ] Sign in with Google → OAuth flow completes
[ ] Link Google Sheet → transactions push to sheet
[ ] Pull from sheet → transactions sync to app
[ ] Conflict: local newer than sheet → local wins
```

### A12 — Settings Audit

```
[ ] Save business name → appears in sidebar
[ ] Change fiscal year to 2024 → dashboard shows 2024 data
[ ] Change currency to "€" → all amounts show "€" symbol
[ ] Settings persist after page reload
[ ] Empty currency → defaults to "$"
```

### A14 — Theme Toggle Audit

```
[ ] Click theme toggle → page switches between dark and light
[ ] Theme persists after reload
[ ] All text readable in both themes (check muted text contrast)
[ ] Charts re-render with correct colors after toggle
```

### A15 — Toast Notifications Audit

```
[ ] Success toast → green background
[ ] Error toast → red background
[ ] Info toast → neutral background
[ ] Toast auto-dismisses after ~3 seconds
[ ] Click toast → dismisses immediately
[ ] Multiple toasts → stack vertically (don't overlap)
[ ] Undo toast stays for 6 seconds (not 3)
[ ] Mobile: toasts appear above bottom navigation bar
```

### A17 — Keyboard Shortcuts Audit

```
[ ] Press "n" → navigates to Add Transaction
[ ] Press "/" → focuses search input
[ ] Press "g" then "d" → navigates to Dashboard
[ ] Press "g" then "r" → navigates to Revenue
[ ] Press Escape → closes open modal
[ ] Press "?" → opens shortcuts modal
[ ] Typing in input field → shortcuts do NOT fire
```

### A18 — PWA / Offline Audit

```
[ ] First visit online → all assets load
[ ] Disconnect internet → app still loads on refresh
[ ] Add transaction offline → saves to IndexedDB (no server needed)
[ ] manifest.json accessible at /manifest.json
[ ] Install prompt appears in Chrome after using the app
[ ] Installed app → opens without browser UI (standalone mode)
[ ] PWA shortcuts appear (long-press app icon on mobile)
```

### End-to-End Smoke Test (Run on Every Build)

```
1. Fresh open (clear all browser data first)
2. Verify app loads and shows empty state
3. Go to Settings → set business name "Test Co", currency "€"
4. Go to Add Transaction → add revenue of €100 (category: Product Sales)
5. Add expense of €30 (category: Rent)
6. Go to Dashboard → verify Revenue=€100, Expenses=€30, Net=€70, Margin=70%
7. Go to Revenue → verify 1 entry for €100
8. Go to Expenses → verify 1 entry for €30
9. Go to Monthly P&L → verify current month row is correct
10. Go to Add Transaction → delete the revenue entry → click Undo → verify restored
11. Export CSV → open in spreadsheet → verify data correct, no formula injection
12. Go to Settings → change year to 2024 → dashboard shows €0 (no 2024 data)
13. Change year back → dashboard shows correct data again
14. Toggle theme → app switches theme, charts update
15. Reload page → all data and settings persist
PASS: All 15 steps complete without errors
```

---

## COMMON BUGS AND HOW TO AVOID THEM

| Bug | Cause | Prevention |
|-----|-------|-----------|
| XSS (script injection in UI) | `innerHTML` with raw user data | Always use `escapeHtml()` before inserting user data into DOM |
| Float display error ($0.30000000000001) | Raw floating-point arithmetic | Always use `Math.round(x * 100) / 100` before storing or displaying |
| Date off by one day | `new Date("2025-01-15")` parses as UTC midnight, displays as Jan 14 in UTC-5 | Parse date as `[y,m,d] = isoDate.split('-').map(Number)` without Date constructor |
| Blank chart after theme toggle | Old Chart.js instance not destroyed | Always call `chart.destroy()` before `new Chart()` |
| Search not resetting pagination | Page stays at 5, filtered results only have 1 page | Always set `page = 1` when search or filter changes |
| Duplicate IDs on bulk import | Using sequential counter that resets | Use `Date.now() + Math.random()` for all IDs |
| CSV formula injection | `=SUM(...)` in exported cell runs in Excel | Wrap all CSV values with `csvSanitize()` |
| IndexedDB unavailable | Private browsing, Firefox with enhanced tracking, iOS Safari limits | Show user-friendly error on `req.onerror`, don't crash silently |
| localStorage quota exceeded | Too many large snapshots | Catch `QuotaExceededError`, trim oldest snapshots, retry |
| Stale selection after bulk delete | `selectedIds` Set not cleared | Clear the Set after any bulk operation completes |
| Bulk delete undo wrong data | Deleted array mutated before undo fires | Clone array: `saved = deletedTxns.map(t => ({...t}))` before async delete |
| Category rename misses transactions | Case-sensitive comparison | Always compare `category === oldName` (exact match, not toLowerCase) |
| Charts blank when dashboard not visible | Chart.js renders to 0px container | Only call `renderCharts()` when dashboard-view is visible |
