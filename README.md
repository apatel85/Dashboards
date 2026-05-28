# Dashboards

A collection of self-contained, single-file HTML dashboards for business analysis.  
Each dashboard opens in any modern browser — no server, no install, no build step required.

---

## Available Dashboards

### 📊 [Sales & COGS Analysis](./Sales%26COGS/Sales_COGS_Dashboard.html)
**Path:** `Sales&COGS/Sales_COGS_Dashboard.html`

Interactive sales and cost-of-goods analysis dashboard for Shopify-style exports.

**Features:**
- Upload Sales CSV + Product Master CSV (data stored in browser IndexedDB)
- 6 tabs: Overview, Sales Trends, Margin Analysis, Scenario Planner, Detail Grid, Data Issues
- Interactive donut charts (Brand & Category) with $ amounts and % labels
- Click-to-filter on all charts and tables
- AOV (Average Order Value) by Category and Sub Category
- Monthly seasonality — see which products peak in which months
- Margin Scenario Planner: adjust target margin %, see projected gross profit
- YoY comparison (2024 vs 2025)
- Sub Category support (from Product Master)
- Export to CSV
- Mobile responsive

**How to use:**
1. Open `Sales&COGS/Sales_COGS_Dashboard.html` in your browser
2. Click **📤 Upload Data** to load your CSV files
3. All data is stored locally in your browser (IndexedDB) — no data leaves your device

---

## Repo Structure

```
Dashboards/
├── README.md              ← This file
├── Sales&COGS/
│   └── Sales_COGS_Dashboard.html   ← Main dashboard
└── [future dashboards here]
```

## Adding a New Dashboard
Create a new folder for each dashboard:
```
Dashboards/
└── YourDashboardName/
    └── YourDashboard.html
```

---

*All dashboards built with Chart.js, PapaParse, and vanilla JavaScript.*
