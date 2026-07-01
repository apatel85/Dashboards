# Data Sources Reference

## Source 1 — CongressInvests API (Discovery Layer)

- **URL:** https://congressinfor-production.up.railway.app
- **Type:** Unofficial third-party aggregator
- **Covers:** House + Senate PTR filings
- **Rate limit:** 100 req/day per IP on free tier; refreshed every 6 hours
- **Use:** Fast discovery of new filings only. Every record must be verified against an official source.
- **Response fields:** `representative`/`senator`, `ticker`, `type`, `transaction_date`, `disclosure_date`, `amount`, `pdf_url`, `data_lag_minutes`
- **Note:** Not a government entity. Data lag may vary.

---

## Source 2 — House Clerk eFD (Official)

- **URL:** https://disclosures-clerk.house.gov/FinancialDisclosure
- **Search:** https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch
- **Type:** Official U.S. Government — Clerk of the House
- **Covers:** All House Members' PTRs and Annual Financial Disclosure Statements
- **Legal basis:** STOCK Act (2012); Stop Trading on Congressional Knowledge Act
- **Format:** Form-based HTML search → PDF download
- **Commercial use:** **Restricted** — review terms before commercial deployment
- **PDF parser:** Use `pdfplumber` or `pdfminer.six` to extract transaction rows

---

## Source 3 — Senate eFD (Official)

- **URL:** https://www.ethics.senate.gov/public/index.cfm/financialdisclosure
- **Type:** Official U.S. Government — Senate Select Committee on Ethics
- **Covers:** All Senators' PTRs and Annual Financial Disclosure Reports
- **Legal basis:** STOCK Act (2012)
- **Format:** Session-based search form → PDF download
- **Authentication:** Requires CAPTCHA bypass or credentialed scraping session
- **PDF parser:** `pdfplumber` for structured extraction of transaction tables

---

## Source 4 — OGE Form 278 / 278-T (Official — White House / Executive Branch)

- **URL:** https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index
- **Type:** Official U.S. Government — Office of Government Ethics
- **Covers:** President, Vice President, cabinet officials, senior White House staff
- **Legal basis:** Ethics in Government Act; OGE Form 278 (annual) and 278-T (periodic transactions)
- **Family disclosures:** Spouse and dependent children assets/transactions are reported **within the filer's own 278/278-T** — no separate family filing exists
- **Format:** PAS index by filer name → PDF download → extract transaction tables
- **Key filers to monitor:**
  - Donald J. Trump (POTUS)
  - James D. Vance (VPOTUS)
  - Senior advisors / cabinet members
- **Whitehouse.gov mirror:** Some 278-T filings also published at https://www.whitehouse.gov

---

## Source 5 — Independent Public Trackers (Secondary Cross-check)

| Tracker | Covers | URL |
|---------|--------|-----|
| CongressStock.com | House + Senate | https://www.congressstock.com |
| OmniFolio | House + Senate | https://www.omnifolio.app/tools/political-intelligence/congress-tracker |
| Open Cabinet | Executive Branch (OGE) | https://open-cabinet.org |

All three state they source directly from STOCK Act / OGE filings.  
Use as a secondary validation layer only — **not as primary evidence**.

---

## Verification Score Weights

| Source | Weight |
|--------|-------|
| Official source match (Clerk / Senate eFD / OGE) | **0.60** |
| Independent tracker match | **0.25** |
| CongressInvests match | **0.15** |

## Status Definitions

| Status | Criteria |
|--------|----------|
| `VERIFIED` | Official source = ✅ AND confidence ≥ 0.75 |
| `NEEDS_REVIEW` | Official = ✅ but score < 0.75, OR only independent tracker match |
| `UNVERIFIED` | No official match, no independent tracker match |

---

## Legal Disclaimer

This tool is for **educational and research purposes only**.  
All data originates from legally mandated government disclosures.  
This is **not investment advice**.  
Review each source's terms of use before deploying commercially.
