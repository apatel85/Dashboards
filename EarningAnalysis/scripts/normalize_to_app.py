#!/usr/bin/env python3
"""
normalize_to_app.py
Merges pipeline outputs (calendar_raw + fundamentals + insider_raw)
into the single earnings.json format that the React app reads.
"""

import os, json

def load_json(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None

def main():
    calendar = load_json("public/data/earnings_calendar_raw.json")
    fundamentals_list = load_json("public/data/fundamentals.json") or []
    insider_raw = load_json("public/data/insider_raw.json") or {}

    if not calendar:
        print("ERROR: earnings_calendar_raw.json not found. Run fetch_earnings_calendar.py first.")
        return

    fundamentals = {f["ticker"]: f for f in fundamentals_list}

    merged = []
    for event in calendar:
        ticker = event["ticker"]
        fund   = fundamentals.get(ticker, {})
        ins    = insider_raw.get(ticker, {})

        record = {
            "ticker":        ticker,
            "name":          event.get("company_name", ticker),
            "sector":        event.get("sector", "Unknown"),
            "cap":           event.get("cap", "Large"),
            "day":           event.get("date_finnhub", event.get("date_fmp", "")),
            "week":          event.get("week", "current"),
            "time":          event.get("time", "AMC"),
            "eps_est":       event.get("eps_est") or 0,
            "eps_est_trend": "flat",
            "rev_est":       str(event.get("revenue_est") or "N/A"),
            "implied_move":  0,
            "streak":        [],
            "insider":       "neutral",
            "health":        50,
            "prob_up":       50,
            "verification":  event.get("verification", "single-source"),
            "earnings_quality_ratio": 1.0,
            "guidance_accuracy": 75,
            "piotroski":     5,
            "altman_z":      3.0,
            "short_interest": 5.0,
            "financials":    fund.get("metrics", []),
            "insider_trades": [],
            "institutional": [],
            "news":          [],
        }
        merged.append(record)

    os.makedirs("public/data", exist_ok=True)
    with open("public/data/earnings.json", "w") as f:
        json.dump(merged, f, indent=2)

    verified = sum(1 for r in merged if r["verification"] == "verified")
    print(f"Wrote {len(merged)} companies to earnings.json ({verified} verified)")

if __name__ == "__main__":
    main()
