# Earnings Tracker App v1 — How to Use & Go-Live Guide

## What the App Does

The Earnings Tracker is a weekly earnings intelligence dashboard that shows every company reporting in the current week and the following week. You can filter by sector, market cap, and report timing, then click any company to open a full deep-dive with financial metrics, insider/institutional activity, a live adjustable predictive model, and news sentiment.

---

## Part 1 — Run the App (Mock Data Mode — Instant, No API Keys)

This mode works out of the box using the bundled mock data. No internet connection or API keys required.

### Prerequisites

- Node.js v18 or later: https://nodejs.org/en/download
- Terminal (Mac: Terminal / iTerm, Windows: PowerShell or WSL)

### Steps

```bash
# 1. Navigate to the app folder
cd earnings-tracker

# 2. Install dependencies (one time only)
npm install

# 3. Start the development server
npm run dev

# 4. Open your browser
# Vite will print: "Local: http://localhost:5173"
# Open that URL to see the app
```

The app will open automatically at http://localhost:5173 showing:
- 13 companies across current and next week
- Fully functional filters (sector, market cap, timing, search)
- All 5 deep-dive tabs working for every company
- Live weight sliders on the Predictive Model tab

---

## Part 2 — App Navigation Guide

### Dashboard (main view)

- **Week toggle**: "This Week / Next Week / Both" — switches which earnings you see
- **Filter bar**: Select sector, market cap tier, BMO/AMC timing, or type a ticker/name
- **Company cards**: Show 9 key signals. Color-coded health bar. Green dot = beat on EPS streak. 🔴/🟢 Insider badge shows 90-day trend.
- **Verification badge**: ✓ Verified = confirmed by 2 data sources. Single Source = one source only. ⚠ Conflict = sources disagree, scoring disabled.

### Company Deep-Dive (click any card)

Five tabs open in a slide-over panel:

| Tab | What it shows |
|---|---|
| Earnings History | Last 4 quarters: EPS beat/miss, revenue beat/miss, surprise %, earnings quality ratio, guidance accuracy |
| Financials | Full metrics table by category (Growth, Profitability, Balance Sheet, Cash Flow, Quality, Valuation), each with 0–10 score and trend |
| Smart Money | Form 4 insider trades with 10b5 flag, institutional 13F changes, short interest |
| Predictive Model | Adjustable weight sliders per category, live probability recalculation |
| News & Sentiment | NLP-scored news articles, bullish/bearish/neutral |

### Model Studio (sidebar)

Shows the global default weight configuration for all companies. Each category has a default % weight. Override per-company in the Predictive Model tab of the deep dive.

### Smart Money Feed (sidebar)

Shows all insider transactions across every company in the dataset on a single screen for quick scanning.

### Data Sources (sidebar)

Documents all four data sources (SEC EDGAR, Finnhub, FMP, Alpha Vantage) and the verification rules applied to each data field.

---

## Part 3 — Go Live with Real Data

### Step 1: Get API Keys (Free)

| Source | Sign-up URL | Free Tier |
|---|---|---|
| Financial Modeling Prep | https://financialmodelingprep.com/developer | 250 calls/day |
| Finnhub | https://finnhub.io/dashboard | 60 calls/min |
| Alpha Vantage | https://alphavantage.co/support/#api-key | 25 calls/day |
| SEC EDGAR | No key needed — use your email as User-Agent | Unlimited |

### Step 2: Set Up Python Environment

```bash
# From the earnings-tracker/ directory:

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate       # Mac / Linux
.\venv\Scripts\activate       # Windows PowerShell

# Install dependencies
pip install -r requirements.txt
```

### Step 3: Configure API Keys

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your keys:
# FMP_API_KEY=abc123yourkeyhere
# FINNHUB_API_KEY=xyz789yourkeyhere
# ALPHAVANTAGE_KEY=abcdef123
# SEC_USER_AGENT=EarningsTracker your@email.com
```

### Step 4: Run the Data Pipeline

```bash
# Fetch earnings calendar for this week + next week
python scripts/fetch_earnings_calendar.py

# Enrich with financial fundamentals (SEC EDGAR + FMP)
python scripts/fetch_fundamentals.py

# Pull insider trades from SEC EDGAR (free, no API key)
python scripts/fetch_insider.py
```

Each script saves validated JSON files to `public/data/`. The app automatically loads these on next page refresh.

### Step 5: Merge Pipeline Output with App Data Format

The pipeline scripts produce raw validated data. To merge it into the app's `earnings.json` format:

```bash
python scripts/normalize_to_app.py
```

(This script merges calendar + fundamentals + insider into the single earnings.json the app reads. See the script for the field mapping.)

### Step 6: Schedule Automatic Refresh (Optional)

Add to your crontab (`crontab -e` on Mac/Linux):

```bash
# Refresh earnings calendar every weekday at 6:00 AM
0 6 * * 1-5 cd /path/to/earnings-tracker && python scripts/fetch_earnings_calendar.py

# Refresh all data after market close
0 18 * * 1-5 cd /path/to/earnings-tracker && python scripts/refresh_all.py
```

---

## Part 4 — Build for Production (Deploy to Web)

### Option A: Local network access (anyone on your WiFi can use it)

```bash
# Build the production files
npm run build

# Preview the production build
npm run preview
# Opens at: http://localhost:4173
```

### Option B: Deploy to GitHub Pages (free, public URL)

```bash
# Install gh-pages helper
npm install --save-dev gh-pages

# Add to package.json under "scripts":
# "deploy": "gh-pages -d dist"

# Deploy
npm run build
npm run deploy

# Your app will be live at: https://<your-github-username>.github.io/earnings-tracker/
```

### Option C: Deploy to Vercel (free, instant, custom domain)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (one command)
vercel

# Follow prompts → your app is live at https://your-app.vercel.app
```

---

## Part 5 — Upgrade Path to Full Backend (Plan B)

When you're ready to move from static JSON to a real backend:

1. Install Docker Desktop: https://www.docker.com/products/docker-desktop
2. See the Backend Setup Guide (included in this repo under /docs/backend-plan.md)
3. The React frontend only needs its API URLs changed from `/data/*.json` to `http://localhost:8000/api/...`
4. Every Python script in `/scripts` maps directly to a Celery task in the backend

The frontend does not change. Only the data layer changes.

---

## Part 6 — Data Verification Framework

The app uses a four-source, two-confirmation model.

### Sources by priority

1. **SEC EDGAR** (primary truth for filed data)
   - Form 4: insider trades — filed within 2 business days of transaction
   - 13F: institutional holdings — filed quarterly
   - 10-K/10-Q XBRL: financial statement values
   - API: https://data.sec.gov (free, no key)

2. **Finnhub** (primary calendar source)
   - Earnings dates, report timing, consensus estimates
   - Required for: earnings calendar base layer
   - Free tier: 60 calls/min

3. **Financial Modeling Prep** (cross-check and enrichment)
   - Second source for earnings calendar verification
   - Financial statement enrichment when SEC XBRL is incomplete
   - Estimate revision history
   - Free tier: 250 calls/day

4. **Alpha Vantage** (news sentiment)
   - NLP-scored news articles
   - Additional earnings data for cross-check
   - Free tier: 25 calls/day

### Verification logic

| Scenario | Badge shown | Scoring |
|---|---|---|
| Finnhub + FMP dates match | ✓ Verified | Enabled |
| Only one source available | Single Source | Enabled with warning |
| Finnhub + FMP dates differ | ⚠ Conflict | Disabled |
| Financial value: SEC overrides vendor | SEC Filed | Enabled |
| Data older than 24h | Stale | Enabled with warning |

---

## Troubleshooting

**App won't start:**
- Make sure Node.js 18+ is installed: `node --version`
- Try deleting `node_modules` and running `npm install` again

**Blank screen after `npm run dev`:**
- Check the terminal for errors
- Make sure `public/data/earnings.json` exists

**Python scripts fail:**
- Check that `.env` file has your API keys (not the placeholder text)
- Run `pip install -r requirements.txt` again
- Free API tiers have rate limits — wait a few minutes between large runs

**Data looks stale:**
- Rerun `python scripts/refresh_all.py`

---

## File Structure Reference

```
earnings-tracker/
├── public/
│   └── data/
│       └── earnings.json          ← App reads this file
├── scripts/
│   ├── fetch_earnings_calendar.py ← Pull calendar from Finnhub + FMP
│   ├── fetch_fundamentals.py      ← Pull financials from FMP + SEC EDGAR
│   ├── fetch_insider.py           ← Pull Form 4 from SEC EDGAR
│   └── refresh_all.py             ← Run all scripts in sequence
├── src/
│   ├── App.tsx                    ← Main application (all UI)
│   ├── types/index.ts             ← TypeScript types
│   ├── main.tsx                   ← React entry point
│   └── styles.css                 ← All styles
├── .env.example                   ← Copy to .env and add keys
├── requirements.txt               ← Python dependencies
├── package.json                   ← Node.js dependencies
├── vite.config.ts                 ← Build config
└── HOW_TO_USE.md                  ← This guide
```
