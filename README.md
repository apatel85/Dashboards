# Dashboards

A collection of self-contained, single-file HTML dashboards for business analysis.  
Each dashboard opens in any modern browser — no server, no install, no build step required.

> **Live site:** https://apatel85.github.io/Dashboards/

---

## Available Dashboards

### 📊 [Sales & COGS Analysis](./Sales%26COGS/Sales_COGS_Dashboard.html)
**Path:** `Sales&COGS/Sales_COGS_Dashboard.html`

Interactive sales and cost-of-goods analysis dashboard for Shopify-style exports.

**Features:**
- Upload Sales CSV + Product Master CSV (data stored in browser IndexedDB)
- 6 tabs: Overview, Sales Trends, Margin Analysis, Scenario Planner, Detail Grid, Data Issues
- Interactive donut charts (Brand & Category) with \$ amounts and % labels inside segments
- Click-to-filter on all charts — click a brand/category to filter the whole dashboard
- AOV (Average Order Value) by Category and Sub Category
- Monthly seasonality heatmap — see which products peak in which months
- **Margin Scenario Planner**: type a target margin %, instantly see projected gross profit
- YoY comparison (2024 vs 2025) toggle on all charts
- Sub Category support (new field in Product Master)
- Export Detail Grid to CSV
- Mobile responsive (works on phone/tablet)

**How to use:**
1. Open the dashboard URL
2. Click **📤 Upload Data** and drop your CSV files
3. Data is stored locally — no data leaves your device
4. Re-open anytime; data persists in browser storage

---

## Repo Structure

```
Dashboards/
├── index.html             ← GitHub Pages landing page
├── README.md              ← This file
├── Sales&COGS/
│   └── Sales_COGS_Dashboard.html
└── [future dashboards here]
```

## Adding a New Dashboard
Create a new folder for each dashboard:
```
Dashboards/
└── YourDashboardName/
    └── YourDashboard.html
```
Then add a card for it in `index.html`.

---

*Built with Chart.js, chartjs-plugin-datalabels, and PapaParse. No backend required.*
