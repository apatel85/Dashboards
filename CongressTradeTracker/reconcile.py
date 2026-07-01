"""
reconcile.py — Verification engine.

Merges all five raw feeds into master_trades with a confidence score and
verification status.

Matching key: (normalized member_name, ticker, transaction_date, transaction_type)

Confidence score weights:
  Official source match (House Clerk / Senate eFD / OGE) = 0.60  ← required for VERIFIED
  Independent tracker match                               = 0.25
  CongressInvests match                                   = 0.15

Status rules:
  VERIFIED       → official_source_match == 1 AND score >= 0.75
  NEEDS_REVIEW   → official_source_match == 1 AND score < 0.75
                   OR (official_source_match == 0 AND independent_tracker_match == 1)
  UNVERIFIED     → official_source_match == 0 AND independent_tracker_match == 0
"""
import hashlib
import datetime
import sqlite3
import logging

DB_PATH = "output/master_trades.db"

WEIGHTS = {
    "official": 0.60,
    "independent": 0.25,
    "congressinvests": 0.15,
}

log = logging.getLogger(__name__)


def _uid(member: str, ticker: str, date: str, txn_type: str) -> str:
    raw = f"{member.strip().lower()}|{ticker.strip().upper()}|{date.strip()}|{txn_type.strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _normalize_key(rec: dict, name_field: str = "member_name") -> tuple:
    return (
        rec.get(name_field, "").strip().lower(),
        rec.get("ticker", "").strip().upper(),
        rec.get("transaction_date", "").strip(),
        rec.get("transaction_type", "").strip().lower(),
    )


def reconcile(
    ci_rows: list[dict],
    house_rows: list[dict],
    senate_rows: list[dict],
    oge_rows: list[dict],
    indep_rows: list[dict],
) -> list[dict]:
    """
    Merge all source lists into a single deduplicated master record list.
    Each record carries confidence_score and verification_status.
    """
    pool: dict[str, dict] = {}

    def _ingest(rows, source_flag, name_field="member_name", default_chamber=None):
        for r in rows:
            key = _normalize_key(r, name_field)
            uid = _uid(*key)
            rec = pool.setdefault(uid, {
                "trade_uid": uid,
                "member_name": r.get(name_field, ""),
                "ticker": key[1],
                "transaction_date": key[2],
                "transaction_type": key[3],
                "chamber": r.get("chamber", default_chamber) or default_chamber or "",
                "role": r.get("role", ""),
                "disclosure_date": r.get("disclosure_date", ""),
                "amount_range": r.get("amount_range", ""),
                "official_doc_url": r.get("doc_url", ""),
                "congressinvests_match": 0,
                "official_source_match": 0,
                "independent_tracker_match": 0,
            })
            if source_flag == "congressinvests":
                rec["congressinvests_match"] = 1
            elif source_flag == "official":
                rec["official_source_match"] = 1
                if r.get("doc_url") and not rec["official_doc_url"]:
                    rec["official_doc_url"] = r["doc_url"]
            elif source_flag == "independent":
                rec["independent_tracker_match"] = 1

    _ingest(ci_rows, "congressinvests")
    _ingest(house_rows, "official", default_chamber="HOUSE")
    _ingest(senate_rows, "official", default_chamber="SENATE")
    _ingest(oge_rows, "official", name_field="filer_name", default_chamber="WHITEHOUSE")
    _ingest(indep_rows, "independent")

    now = datetime.datetime.utcnow().isoformat()
    out = []
    for uid, rec in pool.items():
        score = (
            rec["official_source_match"] * WEIGHTS["official"]
            + rec["independent_tracker_match"] * WEIGHTS["independent"]
            + rec["congressinvests_match"] * WEIGHTS["congressinvests"]
        )
        if rec["official_source_match"] == 1 and score >= 0.75:
            status = "VERIFIED"
        elif rec["official_source_match"] == 1 or rec["independent_tracker_match"] == 1:
            status = "NEEDS_REVIEW"
        else:
            status = "UNVERIFIED"
        rec["confidence_score"] = round(score, 2)
        rec["verification_status"] = status
        rec["last_checked_at"] = now
        rec.setdefault("created_at", now)
        out.append(rec)

    log.info(f"[reconcile] {len(out)} records — "
             f"VERIFIED={sum(1 for r in out if r['verification_status']=='VERIFIED')} "
             f"NEEDS_REVIEW={sum(1 for r in out if r['verification_status']=='NEEDS_REVIEW')} "
             f"UNVERIFIED={sum(1 for r in out if r['verification_status']=='UNVERIFIED')}")
    return out


def upsert_master(records: list[dict], db_path: str = DB_PATH):
    """Upsert reconciled records into master_trades. Updates match flags and score on conflict."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    for r in records:
        cur.execute("""
            INSERT INTO master_trades (
                trade_uid, chamber, member_name, role, ticker, transaction_type,
                transaction_date, disclosure_date, amount_range,
                congressinvests_match, official_source_match, independent_tracker_match,
                official_doc_url, confidence_score, verification_status,
                last_checked_at, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(trade_uid) DO UPDATE SET
                congressinvests_match      = excluded.congressinvests_match,
                official_source_match      = excluded.official_source_match,
                independent_tracker_match  = excluded.independent_tracker_match,
                official_doc_url           = excluded.official_doc_url,
                confidence_score           = excluded.confidence_score,
                verification_status        = excluded.verification_status,
                last_checked_at            = excluded.last_checked_at
        """, (
            r["trade_uid"], r.get("chamber", ""), r["member_name"], r.get("role", ""),
            r["ticker"], r["transaction_type"], r["transaction_date"],
            r.get("disclosure_date", ""), r.get("amount_range", ""),
            r["congressinvests_match"], r["official_source_match"],
            r["independent_tracker_match"], r.get("official_doc_url", ""),
            r["confidence_score"], r["verification_status"],
            r["last_checked_at"], r["created_at"],
        ))
    conn.commit()
    conn.close()
    log.info(f"[upsert] {len(records)} records written to {db_path}")
