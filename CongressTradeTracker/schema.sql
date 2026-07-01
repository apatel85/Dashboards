-- ============================================================
-- MASTER TRADE DATA MODEL
-- CongressTradeTracker - SQLite schema
-- Chambers: HOUSE, SENATE, WHITEHOUSE
-- ============================================================

-- Raw staging: CongressInvests API (discovery layer)
CREATE TABLE IF NOT EXISTS raw_congressinvests (
    id                TEXT PRIMARY KEY,
    chamber           TEXT,           -- HOUSE / SENATE
    member_name       TEXT,
    ticker            TEXT,
    transaction_type  TEXT,           -- purchase / sale / exchange
    transaction_date  TEXT,           -- ISO 8601 YYYY-MM-DD
    disclosure_date   TEXT,
    amount_range      TEXT,           -- e.g. '$1,001 - $15,000'
    source_url        TEXT,
    pulled_at         TEXT
);

-- Raw staging: Official House Clerk eFD
CREATE TABLE IF NOT EXISTS raw_official_house (
    id                TEXT PRIMARY KEY,
    member_name       TEXT,
    ticker            TEXT,
    transaction_type  TEXT,
    transaction_date  TEXT,
    disclosure_date   TEXT,
    amount_range      TEXT,
    doc_url           TEXT,           -- direct link to filed PDF
    pulled_at         TEXT
);

-- Raw staging: Official Senate eFD
CREATE TABLE IF NOT EXISTS raw_official_senate (
    id                TEXT PRIMARY KEY,
    member_name       TEXT,
    ticker            TEXT,
    transaction_type  TEXT,
    transaction_date  TEXT,
    disclosure_date   TEXT,
    amount_range      TEXT,
    doc_url           TEXT,
    pulled_at         TEXT
);

-- Raw staging: OGE 278 / 278-T (POTUS, VPOTUS, cabinet, family)
CREATE TABLE IF NOT EXISTS raw_official_oge (
    id                TEXT PRIMARY KEY,
    filer_name        TEXT,
    role              TEXT,           -- POTUS / VPOTUS / FAMILY / STAFF
    ticker            TEXT,
    transaction_type  TEXT,
    transaction_date  TEXT,
    disclosure_date   TEXT,
    amount_range      TEXT,
    doc_url           TEXT,
    pulled_at         TEXT
);

-- Raw staging: independent public trackers
CREATE TABLE IF NOT EXISTS raw_independent_tracker (
    id                TEXT PRIMARY KEY,
    tracker_name      TEXT,           -- congressstock.com / omnifolio / open-cabinet
    chamber           TEXT,
    member_name       TEXT,
    ticker            TEXT,
    transaction_type  TEXT,
    transaction_date  TEXT,
    amount_range      TEXT,
    pulled_at         TEXT
);

-- ============================================================
-- MASTER RECONCILED TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS master_trades (
    trade_uid                   TEXT PRIMARY KEY,  -- sha256(member+ticker+date+type)[:16]
    chamber                     TEXT,              -- HOUSE / SENATE / WHITEHOUSE
    member_name                 TEXT,
    role                        TEXT,              -- REP / SENATOR / POTUS / VPOTUS / FAMILY / STAFF
    ticker                      TEXT,
    transaction_type            TEXT,
    transaction_date            TEXT,
    disclosure_date             TEXT,
    amount_range                TEXT,
    congressinvests_match       INTEGER DEFAULT 0, -- 1 = found in congressinvests feed
    official_source_match       INTEGER DEFAULT 0, -- 1 = confirmed in Clerk/eFD/OGE filing
    independent_tracker_match   INTEGER DEFAULT 0, -- 1 = confirmed in congressstock/omnifolio/open-cabinet
    official_doc_url            TEXT,              -- link to actual .gov filed PDF
    confidence_score            REAL,              -- 0.0 - 1.0
    verification_status         TEXT,              -- VERIFIED / NEEDS_REVIEW / UNVERIFIED
    last_checked_at             TEXT,
    created_at                  TEXT
);

-- Refresh run audit log
CREATE TABLE IF NOT EXISTS refresh_log (
    run_id             TEXT PRIMARY KEY,
    started_at         TEXT,
    finished_at        TEXT,
    records_pulled     INTEGER,
    records_verified   INTEGER,
    records_flagged    INTEGER,
    status             TEXT           -- SUCCESS / FAILED: <error>
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_mt_chamber   ON master_trades (chamber);
CREATE INDEX IF NOT EXISTS idx_mt_member    ON master_trades (member_name);
CREATE INDEX IF NOT EXISTS idx_mt_ticker    ON master_trades (ticker);
CREATE INDEX IF NOT EXISTS idx_mt_status    ON master_trades (verification_status);
CREATE INDEX IF NOT EXISTS idx_mt_txn_date  ON master_trades (transaction_date);
