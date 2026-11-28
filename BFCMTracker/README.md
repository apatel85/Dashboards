# BFCM Deal Tracker 2026

Black Friday / Cyber Monday deal tracker — verified deals for Simba (dog food & dog items) and electronics.

Live: https://apatel85.github.io/Dashboards/BFCMTracker/

## What it is
Static site, no backend, no secrets, no Supabase. Data lives in `deals.json` (18 items checked live Nov 27, 2026, 07:51 ET on Chewy + Best Buy).

- Filters: Dog / Electronics, search, sort by discount / $ saved / price
- True-deal toggle (>=10%)
- Deal-stack calculator: cashback % + card % → net price per item
- Coupons / rebates / card promos reference: Slickdeals, eDealsInfo, RetailMeNot, Rakuten, TopCashback, Capital One Shopping, Chase/Discover rotating 5%, Amex/Chase/Capital One Offers
- True-deal rule: >=10-15% off AND at/below 30- and 90-day low where history is available. List-price % alone is not a true deal.

## Updating
Edit `deals.json` (price, list_price, history_note, verdict, stack, url) and republish. Keep `last_verified` current. Prices change during BFCM — re-verify on the retailer page before calling anything a deal.

## Version
v1.1.0 — Nov 28, 2026. 19 deals, 12 true deals >=10% (excluding XM4, which is beaten by the cheaper XM5). Best Buy Black Friday sale ends Nov 28, 11:59 p.m. CT; added MacBook Air M5 1TB at Amazon $1,199.99 ($100 less than Best Buy's $1,299).
