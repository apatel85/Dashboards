"""
scheduler.py — Runs the full ETL + reconcile pipeline every 6 hours.

Two run modes:
  1. Python loop (default):  python scheduler.py
     Runs indefinitely, sleeping 6 hours between cycles.
  2. Single run (for cron/GitHub Actions):  python scheduler.py --once
     Runs once and exits. Use with OS cron or CI scheduler.

OS cron equivalent:
  0 */6 * * *  /usr/bin/python3 /app/scheduler.py --once >> /var/log/trades.log 2>&1
"""
import sys
import time
import uuid
import sqlite3
import datetime
import traceback
import logging

from etl import (
    fetch_congressinvests,
    fetch_house_official,
    fetch_senate_official,
    fetch_oge,
    fetch_independent_tracker,
)
from reconcile import reconcile, upsert_master

DB_PATH = "output/master_trades.db"
INTERVAL_SECONDS = 6 * 60 * 60  # 6 hours

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


def _log_run(run_id, started_at, finished_at, pulled, verified, flagged, status):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO refresh_log
            (run_id, started_at, finished_at, records_pulled,
             records_verified, records_flagged, status)
        VALUES (?,?,?,?,?,?,?)
    """, (run_id, started_at, finished_at, pulled, verified, flagged, status))
    conn.commit()
    conn.close()


def run_pipeline():
    run_id = str(uuid.uuid4())
    started_at = datetime.datetime.utcnow().isoformat()
    log.info(f"Pipeline run {run_id} starting")
    try:
        ci = fetch_congressinvests()
        house = fetch_house_official()
        senate = fetch_senate_official()
        oge = fetch_oge()
        indep = fetch_independent_tracker()

        merged = reconcile(ci, house, senate, oge, indep)
        upsert_master(merged)

        verified = sum(1 for r in merged if r["verification_status"] == "VERIFIED")
        flagged = sum(1 for r in merged if r["verification_status"] != "VERIFIED")
        finished_at = datetime.datetime.utcnow().isoformat()
        _log_run(run_id, started_at, finished_at, len(merged), verified, flagged, "SUCCESS")
        log.info(
            f"Run {run_id} SUCCESS: pulled={len(merged)} "
            f"verified={verified} flagged={flagged}"
        )
    except Exception as exc:
        finished_at = datetime.datetime.utcnow().isoformat()
        err = str(exc)[:200]
        _log_run(run_id, started_at, finished_at, 0, 0, 0, f"FAILED: {err}")
        log.error(f"Run {run_id} FAILED: {exc}")
        traceback.print_exc()


if __name__ == "__main__":
    once = "--once" in sys.argv
    if once:
        log.info("Single-run mode (--once)")
        run_pipeline()
    else:
        log.info(f"Continuous mode — running every {INTERVAL_SECONDS // 3600} hours")
        while True:
            run_pipeline()
            log.info(f"Sleeping {INTERVAL_SECONDS // 3600} hours until next run...")
            time.sleep(INTERVAL_SECONDS)
