/**
 * TradeDesk — JSON data contracts.
 *
 * Each tab reads one static JSON file from `public/data/` (written by the
 * scheduled data pipelines; see DATA_CONTRACTS.md). These interfaces are the
 * single source of truth for both the pipelines and the UI.
 */

/** Index membership segments used across tabs. */
export type IndexSegment = 'SP500' | 'NASDAQ100' | 'RUSSELL2000';

/** Broad market regime for the trading day. */
export type MarketRegime = 'uptrend' | 'downtrend' | 'choppy' | 'unknown';

/** Simple directional read. */
export type Signal = 'bullish' | 'bearish' | 'neutral';

/* ── daily-brief.json ─────────────────────────────────────────────── */

export interface BreakoutCandidate {
  ticker: string;
  name: string;
  price: number | null;
  price_ts: string | null; // ISO timestamp of the quote
  index_membership: IndexSegment[];
  sector: string;
  subsector: string;
  /** Chart setup, e.g. "volatility-contraction base", "cup-with-handle". */
  setup: string;
  trigger_price: number | null;
  stop_price: number | null;
  /** 0-100 confluence score. */
  score: number;
  /** Which scoring attributes fired, e.g. "earnings_acceleration". */
  attributes: string[];
  catalyst: string | null;
  catalyst_date: string | null; // YYYY-MM-DD
  thesis: string;
}

export interface DtePick {
  ticker: string;
  underlying_price: number | null;
  bias: 'long' | 'short' | 'neutral';
  thesis: string;
  key_levels: number[];
  iv_rank: number | null; // 0-100
  expected_move_pct: number | null;
}

export interface SectorPerf {
  sector: string;
  /** Representative ETF, e.g. "XLK". */
  etf: string;
  perf_1d_pct: number | null;
  perf_5d_pct: number | null;
  perf_1m_pct: number | null;
  rel_strength_rank: number | null;
  trend: 'up' | 'down' | 'flat';
}

export interface DailyBrief {
  brief_date: string; // YYYY-MM-DD (trading day the brief covers)
  generated_at: string; // ISO timestamp
  universe: string; // e.g. "liquid US equities"
  market_regime: MarketRegime;
  regime_notes: string;
  /** Stocks with potential breakout within 1-2 weeks. */
  breakout_candidates: BreakoutCandidate[];
  dte_focus: {
    zero_dte: DtePick[];
    one_dte: DtePick[];
  };
  sectors: {
    hot: SectorPerf[];
    weak: SectorPerf[];
  };
  rotation_notes: string;
}

/* ── earnings.json ────────────────────────────────────────────────── */

export interface EarningsQuarter {
  quarter: string; // e.g. "Q2 2026"
  eps_result: 'beat' | 'in-line' | 'miss';
  revenue_result: 'beat' | 'in-line' | 'miss' | null; // null: no keyless source for historical revenue estimates
  surprise_pct: number | null;
}

export interface NewsItem {
  date: string; // YYYY-MM-DD
  headline: string;
  source: string;
  sentiment: Signal;
}

export interface EarningsEntry {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  cap_tier: 'Mega' | 'Large' | 'Mid' | 'Small' | 'Micro';
  reporting_date: string; // YYYY-MM-DD
  report_time: 'BMO' | 'AMC' | 'UNKNOWN';
  eps_est: number | null;
  eps_actual: number | null;
  rev_est_b: number | null; // billions USD
  rev_actual_b: number | null; // billions USD
  current_price: number | null;
  price_ts: string | null; // ISO timestamp of the quote
  implied_move_pct: number | null; // from options chain
  iv_rank: number | null; // 0-100
  health_score: number | null; // 0-100 fundamental health
  prob_up_pct: number | null; // model estimate, 0-100
  conviction: number | null; // 0-100
  /** Last 4 reported quarters, most recent first. */
  streak: EarningsQuarter[];
  insider_signal: Signal;
  political_signal: Signal;
  news: NewsItem[];
}

/* ── congress.json ────────────────────────────────────────────────── */

export interface CongressTrade {
  member: string;
  chamber: 'House' | 'Senate' | 'Executive';
  party?: string | null;
  state?: string | null;
  committee?: string | null; // relevant committee, if any
  /** Executive-branch only: e.g. "President", "Secretary of Energy". */
  role?: string | null;
  /** Executive-branch only: e.g. "White House", "DOE". */
  agency?: string | null;
  ticker: string | null; // null when the filing names no tradeable ticker
  /**
   * Aggregation key: tradeable ticker when known, else a normalized asset
   * description ("DESC:…"). Never invent tickers from descriptions.
   */
  agg_key?: string | null;
  asset_name: string;
  trade_type: 'buy' | 'sell' | 'exchange';
  amount_range: string; // disclosure range, e.g. "$1,001 - $15,000"
  amount_mid: number | null; // midpoint in USD
  tx_date: string; // YYYY-MM-DD (actual trade)
  disclosed_date: string | null; // YYYY-MM-DD (filing); null when unknown upstream
  lag_days: number | null; // disclosed_date - tx_date
  doc_url: string | null; // official filing PDF
  /** True when 2+ members bought the same ticker in a ~7d window. */
  cluster: boolean;
}

/* ── research.json ────────────────────────────────────────────────── */

export interface ScoreComponent {
  attribute: string; // e.g. "earnings_acceleration"
  weight: number; // 0-1
  score: number; // 0-100
  note: string;
}

export interface InsiderCluster {
  insider_role: string; // e.g. "CEO", "CFO"
  buys_7d: number;
  total_usd: number | null;
  first_time_buyer: boolean;
}

export interface AnalystNote {
  agent: string; // e.g. "fundamentals_analyst", "bull_researcher"
  summary: string;
  stance: Signal;
}

export interface ResearchIdea {
  ticker: string;
  name: string;
  sector: string;
  subsector: string;
  index_membership: IndexSegment[];
  thesis: string;
  /** 0-100 unified confluence score. */
  score: number;
  /**
   * Agent-estimated probability (0-100) the stock closes higher 30 days out.
   * Model judgment from the Portfolio Manager — NOT a calibrated statistic.
   */
  p_up?: number | null;
  /** Disclosure flow signal for this ticker (null when not flow-selected). */
  flow?: {
    direction: 'accumulation' | 'distribution' | 'mixed';
    flow_score: number | null;
    net_flow: number | null;
    buy_amount: number | null;
    sell_amount: number | null;
    officials: number | null;
    buy_trades: number | null;
    sell_trades: number | null;
    cluster: boolean;
    latest_ref_date: string | null;
  } | null;
  score_breakdown: ScoreComponent[];
  trend_template_pass: boolean;
  stage: 'Stage 1' | 'Stage 2' | 'Stage 3' | 'Stage 4';
  rs_rank: number | null; // 0-100
  distance_from_52w_high_pct: number | null;
  insider_clusters: InsiderCluster[];
  /** Count of recent congressional member purchases. */
  congress_buys: number;
  unusual_options: boolean;
  sentiment: Signal | 'mixed';
  quality_gate_pass: boolean;
  quality_flags: string[];
  trigger_price: number | null;
  stop_price: number | null;
  invalidation: string;
  analyst_notes: AnalystNote[];
  updated_at: string; // ISO timestamp
}

/* ── Tab plumbing ─────────────────────────────────────────────────── */

/* ── signals.json ─────────────────────────────────────────────────── */

export interface SignalTicker {
  ticker: string;
  asset_name: string;
  direction: 'accumulation' | 'distribution' | 'mixed';
  /** 0-100 mechanical flow score (amount × officials × recency). */
  flow_score: number;
  buy_amount: number;
  sell_amount: number;
  /** buy_amount − sell_amount, USD midpoints. */
  net_flow: number;
  recency_weighted_net: number;
  buy_trades: number;
  sell_trades: number;
  officials: number;
  congress_trades: number;
  exec_trades: number;
  cluster: boolean;
  latest_ref_date: string;
}

export interface SignalsFile {
  generated_at: string;
  window_days: number;
  tickers: SignalTicker[];
}

/* ── gex.json / gex-changes.json ─────────────────────────────────── */

export interface GexStrike {
  k: number;
  call: number;
  put: number;
  net: number;
}

export interface GexExpiry {
  expiry: string;
  dte: number;
  /** $M per 1% move. */
  net_gex: number;
  call_gex: number;
  put_gex: number;
  flip_strike: number | null;
  magnet_strike: number;
  call_wall: number;
  put_wall: number;
  strikes: GexStrike[];
  bullets: string[];
}

export interface GexLevel {
  price: number;
  type: 'support' | 'resistance' | 'pivot';
  strength: 'strong' | 'moderate' | 'weak';
  sources: string[];
}

export interface GexTicker {
  ticker: string;
  spot: number;
  /** e.g. 'ES' — this ticker's gamma is shown as a futures proxy. */
  proxy_for?: string;
  /** multiply strikes/prices by this to read them in futures terms. */
  proxy_scale?: number;
  proxy_note?: string;
  expiries: GexExpiry[];
  levels: GexLevel[];
  level_bullets: string[];
  regime: {
    direction: 'short' | 'long' | 'neutral';
    confidence: 'firm' | 'leaning' | 'contested' | 'low';
    bullet: string;
  };
}

export interface GexFile {
  computed_at: string;
  risk_free: number;
  formula: string;
  watchlist: string[];
  tickers: Record<string, GexTicker>;
}

export interface GexChange {
  ticker: string;
  expiry: string | null;
  type: 'flip' | 'swing' | 'wall_move' | 'new' | 'gone';
  detail: string;
  rank: number;
}

export interface GexChangesFile {
  computed_at: string;
  prev_computed_at: string | null;
  changes: GexChange[];
}

/* ── tabs ───────────────────────────────────────────────────────── */

export type TabId = 'brief' | 'earnings' | 'congress' | 'research' | 'signals';

export interface TabDef {
  id: TabId;
  label: string;
  dataFile: string;
}

/* ── lotto scanner ────────────────────────────────────────────────── */

export interface LottoHotStrike {
  strike: number;
  side: 'call' | 'put';
  volume: number;
  oi: number | null;
}

export interface LottoCandidate {
  ticker: string;
  spot: number;
  direction: 'CALL' | 'PUT' | 'BOTH';
  setup: string;
  setup_validated: boolean | null;
  score: number;
  entry_trigger: string;
  invalidation: string;
  targets: number[];
  expected_move_pct: number | null;
  expiry_0dte: string | null;
  expiry_1dte: string | null;
  unusual: { vol_oi_ratio: number; hot_strikes: LottoHotStrike[]; call_vol: number; put_vol: number };
  iv_pct: number | null;
  rv20_pct: number | null;
  gamma_regime: string | null;
  friday_pin: { strike: number; distPct: number } | null;
  notes: string[];
}

export interface LottoValidationSummary {
  validated: boolean;
  n: number;
  win_rate: number;
  expectancy_net: number;
}

export interface LottoFile {
  generated_at: string;
  as_of: string;
  is_friday: boolean;
  universe_scanned: number;
  candidates_considered: number;
  validation_summary: Record<string, LottoValidationSummary>;
  candidates: LottoCandidate[];
}
