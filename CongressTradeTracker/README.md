# CongressTradeTracker

A four-source verified trade tracking pipeline for U.S. House, Senate, and White House (POTUS/Executive Branch) financial disclosures.

## Architecture

```
CongressInvests API  ─┐
House Clerk eFD      ─┼──► Staging DB ──► Verification Engine ──► Master Trades Table ──► Web App
Senate eFD           ─┤                        (confidence score
                       │                         + status)
OGE 278/278-T        ─┘
(POTUS/Exec Branch)
```

## File Structure

```
CongressTradeTracker/
├── README.md
├── requirements.txt
├── etl.py                  # Extraction layer - all four data sources
├── reconcile.py            # Verification engine - confidence scoring & status
├── scheduler.py            # 6-hour refresh loop / cron runner
├── app.py                  # Flask API + HTML dashboard
├── schema.sql              # Master data model DDL
├── .github/
│   └── workflows/
│       └── refresh.yml     # GitHub Actions cron (every 6 hours)
└── docs/
    └── SOURCES.md          # Source reference guide & legal notes
```

## Data Sources

| Source | Chamber/Branch | Type | URL |
|--------|---------------|------|-----|
| CongressInvests API | House + Senate | Discovery (unofficial) | https://congressinfor-production.up.railway.app |
| House Clerk eFD | House | Official (.gov) | https://disclosures-clerk.house.gov |
| Senate eFD | Senate | Official (.gov) | https://ethics.senate.gov |
| OGE Form 278/278-T | White House / Exec Branch | Official (.gov) | https://extapps2.oge.gov |
| CongressStock.com | House + Senate | Independent tracker | https://www.congressstock.com |
| Open Cabinet | White House / Exec Branch | Independent tracker | https://open-cabinet.org |

## Verification Status Rules

| Status | Criteria |
|--------|----------|
| `VERIFIED` | Official source match = ✅ AND confidence score ≥ 0.75 |
| `NEEDS_REVIEW` | Official source match = ✅ but score < 0.75, OR independent tracker match only |
| `UNVERIFIED` | No official match, no independent tracker match |

## Confidence Score Weights

- Official source match (Clerk / Senate eFD / OGE): **0.60**
- Independent tracker match (congressstock / omnifolio / open-cabinet): **0.25**
- CongressInvests.com match: **0.15**

## Setup

```bash
pip install -r requirements.txt
python scheduler.py      # starts the 6-hour refresh loop
python app.py            # starts the web dashboard on http://localhost:5000
```

## Refresh Schedule

Runs automatically every 6 hours:
- `scheduler.py` — embedded Python loop (`time.sleep(21600)`)
- `crontab.txt` — OS cron entry: `0 */6 * * *`
- `.github/workflows/refresh.yml` — GitHub Actions scheduled workflow

## Legal / Terms of Use Notes

- House Clerk disclosure data explicitly restricts commercial use. Review terms before deploying commercially.
- Senate eFD search is form-based; PDF parsing required. No bulk API exists.
- OGE filings are indexed by name; implement PDF extraction (`pdfplumber`) for transaction line items.
- CongressInvests.com free tier: 100 requests/day per IP, refreshed every 6 hours.

## Disclaimer

This tool is for **educational and research purposes only**. All data originates from legally required government disclosures. This is not investment advice.
