"""
etl.py — Extraction layer for all four data source feeds.

Each fetch_* function returns a list of normalized dicts with keys:
  member_name, ticker, transaction_type, transaction_date,
  disclosure_date, amount_range, doc_url, [role, chamber]

TODO: Replace stub returns with real HTTP + PDF parsing logic.
The official House/Senate/OGE sources require form-based search
and pdfplumber extraction since no bulk REST API exists.
"""
import os
import requests
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

CONGRESS_INVESTS_BASE = os.getenv(
    "CONGRESS_INVESTS_URL",
    "https://congressinfor-production.up.railway.app"
)


# ------------------------------------------------------------------
# SOURCE 1: CongressInvests API (discovery layer — unofficial)
# Rate limit: 100 req/day per IP on free tier, refreshed every 6 hrs
# ------------------------------------------------------------------
def fetch_congressinvests(chamber: str = "ALL") -> list[dict]:
    """
    Pull latest PTR filings from the CongressInvests API.
    Returns normalized list of trade dicts.
    Congress chamber: ALL / HOUSE / SENATE
    """
    try:
        resp = requests.get(
            f"{CONGRESS_INVESTS_BASE}/trades/latest",
            params={"chamber": chamber},
            timeout=20,
        )
        resp.raise_for_status()
        raw = resp.json().get("trades", [])
        log.info(f"[congressinvests] fetched {len(raw)} records")
        return [
            {
                "member_name": r.get("representative") or r.get("senator") or r.get("member", ""),
                "chamber": r.get("chamber", chamber).upper(),
                "ticker": r.get("ticker", ""),
                "transaction_type": r.get("type", "").lower(),
                "transaction_date": r.get("transaction_date", ""),
                "disclosure_date": r.get("disclosure_date", ""),
                "amount_range": r.get("amount", ""),
                "doc_url": r.get("pdf_url", ""),
            }
            for r in raw
        ]
    except Exception as exc:
        log.warning(f"[congressinvests] fetch failed: {exc}")
        return []


# ------------------------------------------------------------------
# SOURCE 2: Official House Clerk eFD
# URL: https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch
# Note: Form-based search; PDF parsing required. Commercial use restricted.
# ------------------------------------------------------------------
def fetch_house_official() -> list[dict]:
    """
    Scrape House Clerk PTR disclosures and parse filing PDFs.
    TODO: Implement Playwright/Selenium form submission + pdfplumber extraction.
    Returns list of normalized dicts with chamber='HOUSE'.
    """
    try:
        # Probe connectivity to the official portal
        resp = requests.get(
            "https://disclosures-clerk.house.gov/FinancialDisclosure",
            timeout=15,
        )
        resp.raise_for_status()
        log.info("[house_official] portal reachable — PDF parsing not yet implemented")
    except Exception as exc:
        log.warning(f"[house_official] portal check failed: {exc}")
    # TODO: parse HTML search results -> download PDFs -> extract with pdfplumber
    return []


# ------------------------------------------------------------------
# SOURCE 3: Official Senate eFD
# URL: https://www.ethics.senate.gov/public/index.cfm/financialdisclosure
# Note: Requires authenticated search session; PDF parsing required.
# ------------------------------------------------------------------
def fetch_senate_official() -> list[dict]:
    """
    Scrape Senate eFD PTR disclosures and parse filing PDFs.
    TODO: Implement session-based form POST + pdfplumber extraction.
    Returns list of normalized dicts with chamber='SENATE'.
    """
    try:
        resp = requests.get(
            "https://www.ethics.senate.gov/public/index.cfm/financialdisclosure",
            timeout=15,
        )
        resp.raise_for_status()
        log.info("[senate_official] portal reachable — PDF parsing not yet implemented")
    except Exception as exc:
        log.warning(f"[senate_official] portal check failed: {exc}")
    # TODO: POST search form -> parse results table -> download PTR PDFs
    return []


# ------------------------------------------------------------------
# SOURCE 4: OGE Form 278 / 278-T (POTUS, VPOTUS, cabinet, family)
# URL: https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index
# Note: Indexed by filer name; PDF-only; no bulk REST API.
# ------------------------------------------------------------------
def fetch_oge() -> list[dict]:
    """
    Pull OGE Form 278/278-T disclosures for executive branch filers.
    Filer roles: POTUS, VPOTUS, FAMILY (reported under filer's own 278), STAFF.
    TODO: Crawl PAS+Index, match filer names, download PDFs, extract with pdfplumber.
    Returns list of normalized dicts with chamber='WHITEHOUSE'.
    """
    target_filers = [
        {"name": "Trump, Donald J.", "role": "POTUS"},
        {"name": "Vance, James D.", "role": "VPOTUS"},
        # Add additional White House staff as needed
    ]
    results = []
    for filer in target_filers:
        try:
            resp = requests.get(
                f"https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index",
                params={"Name": filer["name"]},
                timeout=15,
            )
            resp.raise_for_status()
            log.info(f"[oge] index reachable for {filer['name']} — PDF parsing not yet implemented")
        except Exception as exc:
            log.warning(f"[oge] fetch failed for {filer['name']}: {exc}")
        # TODO: parse index page -> download 278-T PDFs -> extract transaction rows
    return results


# ------------------------------------------------------------------
# SOURCE 5: Independent public trackers (secondary cross-check)
# CongressStock.com, OmniFolio, Open Cabinet
# ------------------------------------------------------------------
def fetch_independent_tracker() -> list[dict]:
    """
    Pull trade data from independent trackers as a secondary cross-check.
    Sources:
      - https://www.congressstock.com  (House + Senate)
      - https://www.omnifolio.app      (House + Senate)
      - https://open-cabinet.org       (Executive Branch)
    TODO: Implement per-source scrapers in compliance with each site's ToS.
    """
    log.info("[independent_tracker] not yet implemented")
    return []
