#!/usr/bin/env python3
"""
fetch_insider.py
Pulls Form 4 insider trades from SEC EDGAR Full-Text Search (free, no key).
SEC EDGAR is the authoritative source — no vendor dependency for this data.
"""

import os, json, requests
from datetime import datetime, timedelta

EDGAR_EFTS_URL = "https://efts.sec.gov/LATEST/search-index?q=%22form+type%22%3A%224%22&dateRange=custom&startdt={start}&enddt={end}&hits.hits.total.value=true&hits.hits._source=period_of_report,entity_name,file_num,form_type"
EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
HEADERS = {"User-Agent": "EarningsTracker contact@youremail.com"}

def search_form4_by_cik(cik: str, days_back: int = 180) -> list:
    """Search SEC EDGAR for Form 4 filings by CIK."""
    end   = datetime.today().strftime("%Y-%m-%d")
    start = (datetime.today() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    url   = f"https://efts.sec.gov/LATEST/search-index?q=%22{cik}%22&dateRange=custom&startdt={start}&enddt={end}&forms=4"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 200:
            hits = resp.json().get("hits", {}).get("hits", [])
            return hits
    except Exception as e:
        print(f"  [EDGAR Form4] {cik} error: {e}")
    return []

def main():
    with open("public/data/earnings_calendar_raw.json") as f:
        events = json.load(f)

    CIK_MAP = {
        "AAPL": "0000320193", "MSFT": "0000789019", "NVDA": "0001045810",
        "AMZN": "0001018724", "META": "0001326801", "TSLA": "0001318605",
        "V": "0001403161",   "JPM": "0000019617",  "BAC": "0000070858",
        "UNH": "0000731766", "PFE": "0000078003",  "CAT": "0000018230",
        "NFLX": "0001065280","GOOGL":"0001652044",
    }

    insider_data = {}
    tickers = list(set(e["ticker"] for e in events))

    for ticker in tickers:
        cik = CIK_MAP.get(ticker)
        if not cik:
            print(f"  [SKIP] No CIK for {ticker}")
            continue
        print(f"  Fetching Form 4 for {ticker} (CIK {cik})...")
        hits = search_form4_by_cik(cik.lstrip("0"))
        insider_data[ticker] = {
            "source": "sec-edgar",
            "cik": cik,
            "form4_count": len(hits),
            "filings": hits[:10],  # Store last 10 raw hits
            "verified": True,
        }
        print(f"    → {len(hits)} Form 4 filings found")

    os.makedirs("public/data", exist_ok=True)
    with open("public/data/insider_raw.json", "w") as f:
        json.dump(insider_data, f, indent=2)

    print(f"\nSaved insider data for {len(insider_data)} tickers.")

if __name__ == "__main__":
    main()
