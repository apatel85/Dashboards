export type VerificationStatus = 'verified' | 'single-source' | 'conflict' | 'stale' | 'sec-filed';

export type InsiderSignal = 'buy' | 'sell' | 'neutral';
export type ReportTiming = 'BMO' | 'AMC';
export type CapTier = 'Mega' | 'Large' | 'Mid' | 'Small' | 'Micro';
export type Party = 'D' | 'R' | 'I';
export type Chamber = 'House' | 'Senate';

export interface EarningsStreak {
  quarter: string;
  eps: 'beat' | 'miss' | 'in-line';
  revenue: 'beat' | 'miss' | 'in-line';
  surprise_pct: number;
}

export interface NewsItem {
  date: string;
  headline: string;
  source: string;
  sentiment: 'bullish' | 'neutral' | 'bearish';
  url?: string;
}

export interface InsiderTrade {
  date: string;
  name: string;
  role: string;
  type: 'buy' | 'sell' | 'option-exercise';
  shares: number;
  value: number;
  is_10b5: boolean;
}

export interface PoliticianTrade {
  date: string;
  chamber: Chamber;
  party: Party;
  committee?: string;
  type: 'buy' | 'sell';
  amount_range: string;
  filed_days_late?: number;
}

export interface InstitutionalChange {
  institution: string;
  change: 'new' | 'increased' | 'decreased' | 'closed';
  shares: number;
  value_m: number;
}

export interface FinancialMetric {
  label: string;
  value: string;
  score: number;
  category: string;
  trend: 'up' | 'down' | 'flat';
  weight?: number;
}

export interface ModelWeights {
  earningsQuality: number;
  estimateMomentum: number;
  fundamentalHealth: number;
  valuation: number;
  insiderActivity: number;
  institutionalFlow: number;
  technicalMomentum: number;
  sentiment: number;
  politicalActivity: number;
}

export interface OptionLeg {
  action: 'Buy' | 'Sell';
  type: 'Call' | 'Put';
  strike: number;
  note?: string;
}

export interface OptionRecommendation {
  strategy: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral' | 'Skip';
  legs: OptionLeg[];
  expiry: string;
  rationale: string;
  maxProfit: string;
  maxLoss: string;
  breakevens: number[];
  probProfit: number;
  riskRating: 1 | 2 | 3 | 4 | 5;
  skip?: boolean;
  skipReason?: string;
}

export interface Company {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  subsector: string;
  cap: CapTier;
  day: string;
  reporting_date: string;
  week: 'current' | 'next';
  time: ReportTiming;
  eps_est: number;
  eps_est_trend: 'rising' | 'falling' | 'flat';
  rev_est: string;
  implied_move: number;
  streak: EarningsStreak[];
  insider: InsiderSignal;
  health: number;
  prob_up: number;
  verification: VerificationStatus;
  current_price: number;
  political_signal: InsiderSignal;
  political_trades: PoliticianTrade[];
  // Deep dive data
  financials: FinancialMetric[];
  insider_trades: InsiderTrade[];
  institutional: InstitutionalChange[];
  short_interest: number;
  news: NewsItem[];
  earnings_quality_ratio: number;
  guidance_accuracy: number;
  piotroski: number;
  altman_z: number;
}
