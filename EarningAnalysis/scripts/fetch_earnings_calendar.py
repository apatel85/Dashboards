#!/usr/bin/env python3
"""
fetch_earnings_calendar.py
Pulls the weekly earnings calendar from Finnhub AND Financial Modeling Prep.
Applies two-source verification: only companies confirmed by BOTH sources are marked 'verified'.
Output: public/data/earnings.json
"""

import os, json, requests
from datetime import datetime, timedelta

FMP_KEY      = os.getenv("FMP_API_KEY", "YOUR_FMP_KEY_HERE")
FINNHUB_KEY  = os.getenv("FINNHUB_API_KEY", "YOUR_FINNHUB_KEY_HERE")

def get_week_bounds(offset_weeks: int = 0):
    today = datetime.today()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset_weeks)
    friday = monday + timedelta(days=4)
    return monday.strftime("%Y-%m-%d"), friday.strftime("%Y-%m-%d")

def fetch_finnhub_calendar(from_date: str, to_date: str) -> dict:
    """Returns dict of ticker -> {date, time (BMO/AMC)}"""
    url = f"https://finnhub.io/api/v1/calendar/earnings?from={from_date}&to={to_date}&token={FINNHUB_KEY}"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json().get("earningsCalendar", [])
    result = {}
    for item in data:
        ticker = item.get("symbol", "")
        hour   = item.get("hour", "")
        result[ticker] = {
            "date": item.get("date", ""),
            "time": "BMO" if hour in ("bmo", "before market open") else "AMC",
            "eps_est": item.get("epsEstimate"),
            "eps_actual": item.get("epsActual"),
            "revenue_est": item.get("revenueEstimate"),
        }
    print(f"[Finnhub] {len(result)} companies fetched")
    return result

def fetch_fmp_calendar(from_date: str, to_date: str) -> dict:
    """Returns dict of ticker -> {date, time}"""
    url = f"https://financialmodelingprep.com/api/v3/earning_calendar?from={from_date}&to={to_date}&apikey={FMP_KEY}"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    result = {}
    for item in data:
        ticker = item.get("symbol", "")
        result[ticker] = {
            "date": item.get("date", ""),
            "time": item.get("when", "amc").upper(),
            "eps_est": item.get("epsEstimated"),
            "revenue_est": item.get("revenueEstimated"),
        }
    print(f"[FMP] {len(result)} companies fetched")
    return result

def verify_and_merge(finnhub: dict, fmp: dict, week_label: str) -> list:
    """
    Two-source verification:
    - Both sources have the ticker → 'verified'
    - Only one source → 'single-source'
    - Dates conflict → 'conflict' (scoring disabled in app)
    """
    all_tickers = set(finnhub.keys()) | set(fmp.keys())
    merged = []
    for ticker in all_tickers:
        fh = finnhub.get(ticker)
        fm = fmp.get(ticker)
        if fh and fm:
            # Verify dates match
            if fh["date"] != fm["date"]:
                status = "conflict"
                print(f"  [CONFLICT] {ticker}: Finnhub={fh['date']} vs FMP={fm['date']}")
            else:
                status = "verified"
            record = {
                "ticker": ticker,
                "date_finnhub": fh["date"],
                "date_fmp":     fm["date"],
                "time": fh.get("time", fm.get("time", "AMC")),
                "eps_est": fh.get("eps_est") or fm.get("eps_est"),
                "revenue_est": fh.get("revenue_est") or fm.get("revenue_est"),
                "week": week_label,
                "verification": status,
                "sources": ["finnhub", "fmp"],
            }
        elif fh:
            record = {**fh, "ticker": ticker, "week": week_label, "verification": "single-source", "sources": ["finnhub"]}
        else:
            record = {**fm, "ticker": ticker, "week": week_label, "verification": "single-source", "sources": ["fmp"]}
        merged.append(record)

    verified = sum(1 for r in merged if r["verification"] == "verified")
    conflicts = sum(1 for r in merged if r["verification"] == "conflict")
    print(f"  {week_label}: {len(merged)} total, {verified} verified, {conflicts} conflicts")
    return merged

def main():
    current_from, current_to = get_week_bounds(0)
    next_from,    next_to    = get_week_bounds(1)

    print(f"Fetching current week: {current_from} to {current_to}")
    fh_cur = fetch_finnhub_calendar(current_from, current_to)
    fm_cur = fetch_fmp_calendar(current_from, current_to)
    current_week = verify_and_merge(fh_cur, fm_cur, "current")

    print(f"\nFetching next week: {next_from} to {next_to}")
    fh_nxt = fetch_finnhub_calendar(next_from, next_to)
    fm_nxt = fetch_fmp_calendar(next_from, next_to)
    next_week = verify_and_merge(fh_nxt, fm_nxt, "next")

    all_events = current_week + next_week

    os.makedirs("public/data", exist_ok=True)
    with open("public/data/earnings_calendar_raw.json", "w") as f:
        json.dump(all_events, f, indent=2)

    print(f"\nSaved {len(all_events)} events to public/data/earnings_calendar_raw.json")
    print("Run fetch_fundamentals.py next to enrich with financial data.")

if __name__ == "__main__":
    main()
