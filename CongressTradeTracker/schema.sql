-- MASTER TRADE DATA MODEL
CREATE TABLE IF NOT EXISTS raw_congressinvests (
    id TEXT PRIMARY KEY, chamber TEXT, member_name TEXT, ticker TEXT,
    transaction_type TEXT, transaction_date TEXT, disclosure_date TEXT,
    amount_range TEXT, source_url TEXT, pulled_at TEXT
);
CREATE TABLE IF NOT EXISTS raw_official_house (
    id TEXT PRIMARY KEY, member_name TEXT, ticker TEXT,
    transaction_type TEXT, transaction_date TEXT, disclosure_date TEXT,
    amount_range TEXT, doc_url TEXT, pulled_at TEXT
);
CREATE TABLE IF NOT EXISTS raw_official_senate (
    id TEXT PRIMARY KEY, member_name TEXT, ticker TEXT,
    transaction_type TEXT, transaction_date TEXT, disclosure_date TEXT,
    amount_range TEXT, doc_url TEXT, pulled_at TEXT
);
CREATE TABLE IF NOT EXISTS raw_official_oge (
    id TEXT PRIMARY KEY, filer_name TEXT, role TEXT, ticker TEXT,
    transaction_type TEXT, transaction_date TEXT, disclosure_date TEXT,
    amount_range TEXT, doc_url TEXT, pulled_at TEXT
);
CREATE TABLE IF NOT EXISTS raw_independent_tracker (
    id TEXT PRIMARY KEY, tracker_name TEXT, chamber TEXT, member_name TEXT,
    ticker TEXT, transaction_type TEXT, transaction_date TEXT,
    amount_range TEXT, pulled_at TEXT
);
-- Web login
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT
);
-- Master reconciled table
CREATE TABLE IF NOT EXISTS master_trades (
    trade_uid TEXT PRIMARY KEY,
    chamber TEXT, member_name TEXT, role TEXT, ticker TEXT,
    transaction_type TEXT, transaction_date TEXT, disclosure_date TEXT,
    amount_range TEXT,
    congressinvests_match INTEGER DEFAULT 0,
    official_source_match INTEGER DEFAULT 0,
    independent_tracker_match INTEGER DEFAULT 0,
    official_doc_url TEXT,
    confidence_score REAL,
    verification_status TEXT,
    last_checked_at TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS refresh_log (
    run_id TEXT PRIMARY KEY, started_at TEXT, finished_at TEXT,
    records_pulled INTEGER, records_verified INTEGER,
    records_flagged INTEGER, status TEXT
);
CREATE INDEX IF NOT EXISTS idx_mt_chamber  ON master_trades (chamber);
CREATE INDEX IF NOT EXISTS idx_mt_member   ON master_trades (member_name);
CREATE INDEX IF NOT EXISTS idx_mt_ticker   ON master_trades (ticker);
CREATE INDEX IF NOT EXISTS idx_mt_status   ON master_trades (verification_status);
CREATE INDEX IF NOT EXISTS idx_mt_txn_date ON master_trades (transaction_date);
CREATE INDEX IF NOT EXISTS idx_users_uname ON users (username);
