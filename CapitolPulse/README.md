# CapitolPulse — Live Congress Trading Tracker

Static, client-side dashboard (no build step, no server) tracking US Congress members'
disclosed stock trades in real time via the free CongressInvests API.

## How it works

- `index.html` + `assets/app.js` fetch live data directly in the visitor's browser.
- Data is cached in `localStorage` for 24 hours, so it auto-refreshes daily per-visitor
  without any backend or GitHub Actions job required.
- Click "Force refresh now" in the dashboard to bypass the cache anytime.

## Data source

CongressInvests API (https://congressinfor-production.up.railway.app) — free, no key
required. Underlying records originate from the official Senate eFD system and the
House Clerk's Financial Disclosure portal, both public under the STOCK Act.

## Notes

- Trade amounts are disclosed only as ranges; the dashboard uses the range midpoint.
- Disclosures can legally lag the actual trade by up to 45 days (often longer in practice).
- Educational/research use only — not investment advice.
