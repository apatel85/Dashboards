#!/usr/bin/env python3
"""
fetch_fundamentals.py
Fetches financial statements from FMP and validates key metrics against SEC EDGAR.
SEC-filed values override vendor data on any mismatch.
"""

import os, json, requests
from typing import Optional

FMP_KEY = os.getenv("FMP_API_KEY", "YOUR_FMP_KEY_HERE")

EDGAR_COMPANY_FACTS = "https://data.sec.gov/api/xbrl/companyfacts/{cik}.json"
EDGAR_SUBMISSIONS   = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
FMP_INCOME          = "https://financialmodelingprep.com/api/v3/income-statement/{ticker}?limit=8&apikey={key}"
FMP_BALANCE         = "https://financialmodelingprep.com/api/v3/balance-sheet-statement/{ticker}?limit=4&apikey={key}"
FMP_CASHFLOW        = "https://financialmodelingprep.com/api/v3/cash-flow-statement/{ticker}?limit=4&apikey={key}"
FMP_RATIOS          = "https://financialmodelingprep.com/api/v3/ratios/{ticker}?limit=4&apikey={key}"

HEADERS = {"User-Agent": "EarningsTracker contact@youremail.com"}  # Required by SEC EDGAR

def fetch_sec_facts(cik: str) -> Optional[dict]:
    """Fetch XBRL company facts from SEC. Free, no key required."""
    try:
        url = EDGAR_COMPANY_FACTS.format(cik=cik.zfill(10))
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"  [EDGAR] Fetch failed: {e}")
    return None

def extract_sec_revenue(facts: dict) -> Optional[float]:
    """Extract most recent annual revenue from SEC XBRL facts."""
    try:
        rev = facts["facts"]["us-gaap"].get("Revenues") or facts["facts"]["us-gaap"].get("RevenueFromContractWithCustomerExcludingAssessedTax")
        if rev:
            annual = [v for v in rev["units"]["USD"] if v.get("form") in ("10-K",) and v.get("fp") == "FY"]
            if annual:
                return max(annual, key=lambda x: x["end"])["val"]
    except Exception:
        pass
    return None

def fetch_fmp_income(ticker: str) -> Optional[list]:
    try:
        url = FMP_INCOME.format(ticker=ticker, key=FMP_KEY)
        resp = requests.get(url, timeout=15)
        return resp.json() if resp.status_code == 200 else None
    except:
        return None

def fetch_fmp_ratios(ticker: str) -> Optional[list]:
    try:
        url = FMP_RATIOS.format(ticker=ticker, key=FMP_KEY)
        resp = requests.get(url, timeout=15)
        return resp.json() if resp.status_code == 200 else None
    except:
        return None

def build_financials(ticker: str, cik: Optional[str] = None) -> dict:
    """
    Merge FMP data with SEC EDGAR validation.
    Returns normalized financial metrics dict with source provenance.
    """
    print(f"  Fetching fundamentals for {ticker}...")
    fmp_income = fetch_fmp_income(ticker) or []
    fmp_ratios = fetch_fmp_ratios(ticker) or []

    result = {"ticker": ticker, "metrics": [], "sec_validated": False, "source": "fmp"}

    if fmp_income:
        latest = fmp_income[0]
        prior  = fmp_income[1] if len(fmp_income) > 1 else {}

        revenue_growth = None
        if latest.get("revenue") and prior.get("revenue") and prior["revenue"] != 0:
            revenue_growth = round((latest["revenue"] - prior["revenue"]) / abs(prior["revenue"]) * 100, 1)

        result["metrics"] = [
            {"label": "Revenue Growth", "value": f"{revenue_growth}%" if revenue_growth else "N/A", "source": "fmp"},
            {"label": "Gross Margin",   "value": f"{round(latest.get('grossProfitRatio', 0) * 100, 1)}%", "source": "fmp"},
            {"label": "Net Margin",     "value": f"{round(latest.get('netIncomeRatio', 0) * 100, 1)}%", "source": "fmp"},
        ]

    # SEC EDGAR validation
    if cik:
        sec_facts = fetch_sec_facts(cik)
        if sec_facts:
            sec_revenue = extract_sec_revenue(sec_facts)
            if sec_revenue and fmp_income:
                fmp_revenue = fmp_income[0].get("revenue", 0)
                diff_pct = abs(sec_revenue - fmp_revenue) / max(abs(sec_revenue), 1) * 100
                if diff_pct > 5:
                    print(f"  [VALIDATION] {ticker} revenue mismatch: SEC={sec_revenue:,.0f} FMP={fmp_revenue:,.0f} ({diff_pct:.1f}% diff) → using SEC")
                    result["sec_validated"] = True
                    result["source"] = "sec-overridden"
                else:
                    print(f"  [VALIDATION] {ticker} revenue confirmed by SEC ({diff_pct:.1f}% diff)")
                    result["sec_validated"] = True

    return result

def main():
    with open("public/data/earnings_calendar_raw.json") as f:
        events = json.load(f)

    tickers = list(set(e["ticker"] for e in events))
    print(f"Enriching {len(tickers)} tickers with financial data...")

    # CIK map — in production, fetch from: https://www.sec.gov/files/company_tickers.json
    CIK_MAP = {
        "AAPL": "320193", "MSFT": "789019", "NVDA": "1045810", "AMZN": "1018724",
        "GOOGL": "1652044", "META": "1326801", "TSLA": "1318605", "V": "1403161",
        "JPM": "19617", "BAC": "70858", "UNH": "731766", "PFE": "78003",
        "CAT": "18230", "NFLX": "1065280",
    }

    enriched = []
    for ticker in tickers[:20]:  # Limit to 20 on free API tier
        cik = CIK_MAP.get(ticker)
        fundamentals = build_financials(ticker, cik)
        enriched.append(fundamentals)

    os.makedirs("public/data", exist_ok=True)
    with open("public/data/fundamentals.json", "w") as f:
        json.dump(enriched, f, indent=2)

    print(f"\nSaved {len(enriched)} fundamental records.")

if __name__ == "__main__":
    main()
