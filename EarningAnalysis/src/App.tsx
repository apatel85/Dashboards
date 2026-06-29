import { useCallback, useEffect, useMemo, useState } from "react"
import { Company, ModelWeights, OptionLeg, OptionRecommendation } from "./types"

// ── helpers ──────────────────────────────────────────────────────────────────
function scoreColor(n: number) {
  if (n >= 70) return "var(--green)"
  if (n >= 40) return "var(--amber)"
  return "var(--red)"
}

function roundToStrike(price: number): number {
  if (price < 10)   return Math.round(price * 2) / 2
  if (price < 25)   return Math.round(price)
  if (price < 100)  return Math.round(price / 2.5) * 2.5
  if (price < 300)  return Math.round(price / 5) * 5
  if (price < 1000) return Math.round(price / 10) * 10
  return Math.round(price / 25) * 25
}

function getOptionStrategy(company: Company, livePrice?: number): OptionRecommendation {
  const price = livePrice ?? company.current_price
  const { prob_up, implied_move, health, insider, eps_est_trend, day } = company

  // Composite direction bias: -1 (strong bear) to +1 (strong bull)
  let bias = (prob_up - 50) / 50
  if (insider === "buy")             bias += 0.15
  else if (insider === "sell")       bias -= 0.15
  if (eps_est_trend === "rising")    bias += 0.08
  else if (eps_est_trend === "falling") bias -= 0.08
  bias = Math.max(-1, Math.min(1, bias))

  const atm       = roundToStrike(price)
  const moveAmt   = price * implied_move / 100
  const otmCall   = roundToStrike(price + moveAmt)
  const otmPut    = roundToStrike(price - moveAmt)
  const wideCall  = roundToStrike(price + moveAmt * 1.6)
  const widePut   = roundToStrike(price - moveAmt * 1.6)
  const expiry    = `${day} expiry (earnings week)`

  // ── Strong Bullish (bias > 0.25, roughly prob_up > 62%) ──────────────────
  if (bias > 0.25) {
    if (implied_move < 5) {
      return {
        strategy: "Long Call",
        bias: "Bullish",
        legs: [{ action: "Buy", type: "Call", strike: atm, note: "ATM" }],
        expiry,
        rationale: `Probability ↑ is ${prob_up}% with a low implied move of ±${implied_move}%. Calls are relatively cheap — long ATM call offers high delta exposure to the expected beat.${insider === "buy" ? " Insider buying adds conviction." : ""}`,
        maxProfit: "Unlimited above breakeven",
        maxLoss: `Premium paid (est. ~${(price * 0.022).toFixed(0)}/share)`,
        breakevens: [atm],
        probProfit: Math.round(prob_up * 0.76),
        riskRating: 2,
      }
    }
    return {
      strategy: "Bull Call Spread",
      bias: "Bullish",
      legs: [
        { action: "Buy",  type: "Call", strike: atm,     note: "ATM (long leg)" },
        { action: "Sell", type: "Call", strike: otmCall, note: `+${implied_move}% OTM (short leg)` },
      ],
      expiry,
      rationale: `Probability ↑ is ${prob_up}% but implied move of ±${implied_move}% makes outright calls expensive. Selling the ${otmCall} call finances ~40% of the premium cost while preserving full participation through the expected move range.`,
      maxProfit: `$${(otmCall - atm).toFixed(0)} spread – net debit`,
      maxLoss: "Net debit paid",
      breakevens: [atm],
      probProfit: Math.round(prob_up * 0.78),
      riskRating: 2,
    }
  }

  // ── Moderate Bullish (0.08 < bias ≤ 0.25) ────────────────────────────────
  if (bias > 0.08) {
    if (health >= 70) {
      return {
        strategy: "Cash-Secured Put",
        bias: "Bullish",
        legs: [{ action: "Sell", type: "Put", strike: otmPut, note: `−${implied_move}% OTM` }],
        expiry,
        rationale: `Moderate bullish lean (${prob_up}% prob ↑). Selling an OTM put at $${otmPut} collects premium AND gives a discounted entry if the stock pulls back. Health score ${health}/100 makes ownership attractive.`,
        maxProfit: "Premium collected (if above strike at expiry)",
        maxLoss: `Strike minus premium (assignment risk at $${otmPut})`,
        breakevens: [otmPut],
        probProfit: Math.round(100 - prob_up * 0.38),
        riskRating: 2,
      }
    }
    return {
      strategy: "Bull Call Spread",
      bias: "Bullish",
      legs: [
        { action: "Buy",  type: "Call", strike: atm,     note: "ATM (long leg)" },
        { action: "Sell", type: "Call", strike: otmCall, note: `+${implied_move}% OTM (short leg)` },
      ],
      expiry,
      rationale: `Moderate bullish lean (${prob_up}% prob ↑). The spread structure caps max loss to the net debit — appropriate when conviction is directional but not high enough for a naked call.`,
      maxProfit: `$${(otmCall - atm).toFixed(0)} spread – net debit`,
      maxLoss: "Net debit paid",
      breakevens: [atm],
      probProfit: Math.round(prob_up * 0.72),
      riskRating: 2,
    }
  }

  // ── Neutral (−0.08 ≤ bias ≤ 0.08) ────────────────────────────────────────
  if (bias >= -0.08) {
    if (implied_move >= 5) {
      return {
        strategy: "Iron Condor",
        bias: "Neutral",
        legs: [
          { action: "Sell", type: "Call", strike: otmCall, note: `+${implied_move}% OTM` },
          { action: "Buy",  type: "Call", strike: wideCall, note: "+buffer (protection)" },
          { action: "Sell", type: "Put",  strike: otmPut,  note: `−${implied_move}% OTM` },
          { action: "Buy",  type: "Put",  strike: widePut,  note: "−buffer (protection)" },
        ],
        expiry,
        rationale: `Near-neutral signal (${prob_up}% prob ↑) with elevated implied move (±${implied_move}%). Iron condor profits if the stock stays within $${otmPut}–$${otmCall} post-earnings. Collect premium from both sides of the range.`,
        maxProfit: "Net credit collected",
        maxLoss: "Spread width – net credit",
        breakevens: [otmPut, otmCall],
        probProfit: Math.round(65 + (0.08 - Math.abs(bias)) / 0.08 * 8),
        riskRating: 3,
      }
    }
    return {
      strategy: "No Clear Edge",
      bias: "Skip",
      legs: [],
      expiry,
      rationale: `Signal is near 50/50 (${prob_up}% prob ↑) and implied move is low (±${implied_move}%). Expected premium is insufficient to justify an Iron Condor. Risk/reward does not favour a position here.`,
      maxProfit: "N/A",
      maxLoss: "N/A",
      breakevens: [],
      probProfit: 50,
      riskRating: 1,
      skip: true,
      skipReason: "Insufficient edge — consider sitting this earnings event out.",
    }
  }

  // ── Moderate Bearish (−0.25 ≤ bias < −0.08) ──────────────────────────────
  if (bias >= -0.25) {
    return {
      strategy: "Bear Put Spread",
      bias: "Bearish",
      legs: [
        { action: "Buy",  type: "Put", strike: atm,    note: "ATM (long leg)" },
        { action: "Sell", type: "Put", strike: otmPut, note: `−${implied_move}% OTM (short leg)` },
      ],
      expiry,
      rationale: `Moderate bearish lean (only ${prob_up}% prob ↑). Bear put spread captures the expected downside through the ±${implied_move}% implied range while capping the debit spent. Max gain if stock falls to $${otmPut} or below.`,
      maxProfit: `$${(atm - otmPut).toFixed(0)} spread – net debit`,
      maxLoss: "Net debit paid",
      breakevens: [atm],
      probProfit: Math.round((100 - prob_up) * 0.72),
      riskRating: 2,
    }
  }

  // ── Strong Bearish (bias < −0.25) ─────────────────────────────────────────
  if (implied_move < 5) {
    return {
      strategy: "Long Put",
      bias: "Bearish",
      legs: [{ action: "Buy", type: "Put", strike: atm, note: "ATM" }],
      expiry,
      rationale: `Strong bearish signal (only ${prob_up}% prob ↑). Implied move is low (±${implied_move}%), keeping puts relatively cheap. ATM long put delivers high delta downside exposure.${insider === "sell" ? " Insider selling reinforces the thesis." : ""}`,
      maxProfit: `Down to zero (max $${atm} per share)`,
      maxLoss: `Premium paid (est. ~${(price * 0.018).toFixed(0)}/share)`,
      breakevens: [atm],
      probProfit: Math.round((100 - prob_up) * 0.75),
      riskRating: 2,
    }
  }

  return {
    strategy: "Bear Put Spread",
    bias: "Bearish",
    legs: [
      { action: "Buy",  type: "Put", strike: atm,    note: "ATM (long leg)" },
      { action: "Sell", type: "Put", strike: otmPut, note: `−${implied_move}% OTM (short leg)` },
    ],
    expiry,
    rationale: `Strong bearish signal (${prob_up}% prob ↑) with high implied move (±${implied_move}%). Bear put spread reduces the cost of expensive puts while keeping full participation through the expected down-move range.`,
    maxProfit: `$${(atm - otmPut).toFixed(0)} spread – net debit`,
    maxLoss: "Net debit paid",
    breakevens: [atm],
    probProfit: Math.round((100 - prob_up) * 0.76),
    riskRating: 3,
  }
}

function VBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    verified:       ["vbadge vbadge-verified", "✓ Verified"],
    "single-source":["vbadge vbadge-single",   "Single Source"],
    conflict:       ["vbadge vbadge-conflict",  "⚠ Conflict"],
    stale:          ["vbadge vbadge-stale",     "Stale"],
    "sec-filed":    ["vbadge vbadge-sec",       "SEC Filed"],
  }
  const [cls, label] = map[status] ?? ["vbadge vbadge-stale", status]
  return <span className={cls}>{label}</span>
}

const DEFAULT_WEIGHTS: ModelWeights = {
  earningsQuality:   20,
  estimateMomentum:  18,
  fundamentalHealth: 15,
  valuation:         12,
  insiderActivity:   12,
  institutionalFlow: 10,
  technicalMomentum:  8,
  sentiment:          5,
}

const WEIGHT_LABELS: Record<keyof ModelWeights, string> = {
  earningsQuality:   "Earnings Quality",
  estimateMomentum:  "Estimate Momentum",
  fundamentalHealth: "Fundamental Health",
  valuation:         "Valuation",
  insiderActivity:   "Insider Activity",
  institutionalFlow: "Institutional Flow",
  technicalMomentum: "Technical Momentum",
  sentiment:         "News & Sentiment",
}

const SECTOR_COLORS: Record<string, string> = {
  "IT": "#3b82f6", "Healthcare": "#10b981", "Financials": "#f59e0b",
  "Consumer Discretionary": "#ef4444", "Energy": "#f97316",
  "Industrials": "#6366f1", "Communication Services": "#8b5cf6",
  "Consumer Staples": "#14b8a6", "Materials": "#84cc16",
  "Utilities": "#06b6d4", "Real Estate": "#ec4899",
}

// ── CompanyCard ───────────────────────────────────────────────────────────────
function CompanyCard({ company, livePrice, onClick }: { company: Company; livePrice?: number; onClick: () => void }) {
  const accentColor = SECTOR_COLORS[company.sector] ?? "#3b82f6"
  const probColor = company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)"
  const price = livePrice ?? company.current_price
  const rec = getOptionStrategy(company, livePrice)

  return (
    <div className="card" onClick={onClick}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
      <div className="card-top">
        <div>
          <div className="ticker">{company.ticker}</div>
          <div className="co-name">{company.name}</div>
          <div className="card-price">
            ${price.toFixed(2)}
            {livePrice && <span className="live-dot" title="Live price">●</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`timing-badge ${company.time === "BMO" ? "bmo" : "amc"}`}>{company.time}</span>
          <span className={`opt-badge opt-${rec.bias.toLowerCase()}`}>{rec.strategy}</span>
        </div>
      </div>

      <div className="meta-row">
        <span className="chip sector">{company.sector}</span>
        <span className="chip">{company.cap}</span>
        <span className="chip">{company.day}</span>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">EPS Est</div>
          <div className="metric-value">${company.eps_est}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Rev Est</div>
          <div className="metric-value">{company.rev_est}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Implied Move</div>
          <div className="metric-value" style={{ color: "var(--amber)" }}>±{company.implied_move}%</div>
        </div>
        <div className="metric">
          <div className="metric-label">EPS Trend</div>
          <div className="metric-value" style={{ color: company.eps_est_trend === "rising" ? "var(--green)" : company.eps_est_trend === "falling" ? "var(--red)" : "var(--muted)" }}>
            {company.eps_est_trend === "rising" ? "↑ Rising" : company.eps_est_trend === "falling" ? "↓ Falling" : "→ Flat"}
          </div>
        </div>
      </div>

      <div className="streak-row">
        <span className="streak-label">4Q streak</span>
        <div className="streak-dots">
          {company.streak.map((s, i) => (
            <div key={i} className="streak-dot" style={{ background: s.eps === "beat" ? "var(--green)" : s.eps === "miss" ? "var(--red)" : "var(--amber)" }} />
          ))}
        </div>
        <span className={`insider-pill ${company.insider === "buy" ? "insider-buy" : company.insider === "sell" ? "insider-sell" : "insider-neutral"}`}>
          {company.insider === "buy" ? "🟢 Ins. Buy" : company.insider === "sell" ? "🔴 Ins. Sell" : "⚪ Insider Neutral"}
        </span>
      </div>

      <div className="score-section">
        <div className="score-labels">
          <span className="score-health-label">Health <b style={{ color: scoreColor(company.health) }}>{company.health}</b></span>
          <span className="score-prob" style={{ color: probColor }}>{company.prob_up}% ↑</span>
        </div>
        <div className="score-bar-track">
          <div className="score-bar-fill" style={{ width: `${company.health}%`, background: scoreColor(company.health) }} />
        </div>
      </div>

      <div className="verify-row">
        <VBadge status={company.verification} />
      </div>
    </div>
  )
}

// ── Drawer Tabs ───────────────────────────────────────────────────────────────
type TabKey = "history" | "financials" | "smart" | "model" | "news" | "options"
const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "history",    label: "Earnings History" },
  { key: "financials", label: "Financials" },
  { key: "smart",      label: "Smart Money" },
  { key: "model",      label: "Predictive Model" },
  { key: "news",       label: "News & Sentiment" },
  { key: "options",    label: "Options Strategy" },
]

function EarningsHistoryTab({ company }: { company: Company }) {
  return (
    <div>
      <p className="section-sub">Last 4 quarters — EPS and revenue actuals vs. estimate. Green = beat, Red = miss.</p>
      <div className="two-col">
        <div className="stat-box">
          <div className="stat-box-label">Earnings Quality Ratio</div>
          <div className="stat-box-val" style={{ color: company.earnings_quality_ratio >= 1 ? "var(--green)" : "var(--red)" }}>{company.earnings_quality_ratio.toFixed(2)}</div>
          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>OCF ÷ Net Income. &gt;1.0 = high quality</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Guidance Accuracy</div>
          <div className="stat-box-val" style={{ color: company.guidance_accuracy >= 80 ? "var(--green)" : "var(--amber)" }}>{company.guidance_accuracy}%</div>
          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>% of quarters mgmt met / beat own guidance</div>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Quarter</th>
            <th>EPS Result</th>
            <th>Revenue Result</th>
            <th>EPS Surprise</th>
          </tr>
        </thead>
        <tbody>
          {company.streak.map((s, i) => (
            <tr key={i}>
              <td>{s.quarter}</td>
              <td className={s.eps === "beat" ? "beat" : s.eps === "miss" ? "miss" : "inline"}>
                {s.eps === "beat" ? "✓ Beat" : s.eps === "miss" ? "✗ Miss" : "≈ In-line"}
              </td>
              <td className={s.revenue === "beat" ? "beat" : s.revenue === "miss" ? "miss" : "inline"}>
                {s.revenue === "beat" ? "✓ Beat" : s.revenue === "miss" ? "✗ Miss" : "≈ In-line"}
              </td>
              <td style={{ color: s.surprise_pct >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                {s.surprise_pct >= 0 ? "+" : ""}{s.surprise_pct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FinancialsTab({ company }: { company: Company }) {
  const categories = [...new Set(company.financials.map(f => f.category))]
  return (
    <div>
      <p className="section-sub">Full financial metrics organized by category. Each score is on a 0–10 scale and feeds into the predictive model.</p>
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--accent)", fontSize: 13 }}>{cat}</div>
          <table className="data-table">
            <thead><tr><th>Metric</th><th>Value</th><th>Score</th><th>Trend</th></tr></thead>
            <tbody>
              {company.financials.filter(f => f.category === cat).map((f, i) => (
                <tr key={i}>
                  <td>{f.label}</td>
                  <td style={{ fontWeight: 700 }}>{f.value}</td>
                  <td>
                    <div className="score-ring" style={{
                      background: f.score >= 7 ? "rgba(34,197,94,.15)" : f.score >= 4 ? "rgba(245,158,11,.15)" : "rgba(239,68,68,.15)",
                      color: f.score >= 7 ? "var(--green)" : f.score >= 4 ? "var(--amber)" : "var(--red)",
                    }}>{f.score}</div>
                  </td>
                  <td className={`trend-${f.trend}`}>{f.trend === "up" ? "↑" : f.trend === "down" ? "↓" : "→"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="two-col" style={{ marginTop: 14 }}>
        <div className="stat-box">
          <div className="stat-box-label">Piotroski F-Score</div>
          <div className="stat-box-val" style={{ color: company.piotroski >= 7 ? "var(--green)" : company.piotroski >= 4 ? "var(--amber)" : "var(--red)" }}>{company.piotroski} / 9</div>
          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>Fundamental strength: 0–3 weak, 7–9 strong</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Altman Z-Score</div>
          <div className="stat-box-val" style={{ color: company.altman_z >= 3 ? "var(--green)" : company.altman_z >= 1.8 ? "var(--amber)" : "var(--red)" }}>{company.altman_z}</div>
          <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>&lt;1.8 distress zone, &gt;3.0 safe zone</div>
        </div>
      </div>
    </div>
  )
}

function SmartMoneyTab({ company }: { company: Company }) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Insider Transactions (Form 4)</div>
        {company.insider_trades.length === 0 ? (
          <div className="empty">No insider transactions in last 180 days</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Name</th><th>Role</th><th>Type</th><th>Value</th><th>10b5</th></tr></thead>
            <tbody>
              {company.insider_trades.map((t, i) => (
                <tr key={i}>
                  <td>{t.date}</td>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: "var(--muted)" }}>{t.role}</td>
                  <td style={{ color: t.type === "buy" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                    {t.type === "buy" ? "▲ Buy" : t.type === "sell" ? "▼ Sell" : "⚙ Option Ex."}
                  </td>
                  <td>${(t.value / 1_000_000).toFixed(1)}M</td>
                  <td>{t.is_10b5 ? <span style={{ color: "var(--muted)", fontSize: 11 }}>Pre-sched.</span> : <span style={{ color: "var(--amber)", fontSize: 11, fontWeight: 700 }}>Discretionary</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Institutional Holdings (13F)</div>
        {company.institutional.length === 0 ? (
          <div className="empty">No recent 13F changes</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Institution</th><th>Change</th><th>Value</th></tr></thead>
            <tbody>
              {company.institutional.map((inst, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{inst.institution}</td>
                  <td style={{ color: inst.change === "new" || inst.change === "increased" ? "var(--green)" : inst.change === "decreased" || inst.change === "closed" ? "var(--red)" : "var(--muted)", fontWeight: 700 }}>
                    {inst.change === "new" ? "★ New" : inst.change === "increased" ? "↑ Increased" : inst.change === "decreased" ? "↓ Decreased" : inst.change === "closed" ? "✕ Closed" : "→ Flat"}
                  </td>
                  <td>${inst.value_m >= 1000 ? (inst.value_m / 1000).toFixed(1) + "B" : inst.value_m + "M"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="stat-box">
        <div className="stat-box-label">Short Interest % of Float</div>
        <div className="stat-box-val" style={{ color: company.short_interest > 15 ? "var(--red)" : company.short_interest > 8 ? "var(--amber)" : "var(--green)" }}>
          {company.short_interest}%
        </div>
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
          {company.short_interest > 15 ? "High — elevated short squeeze risk" : company.short_interest > 8 ? "Elevated" : "Normal range"}
        </div>
      </div>
    </div>
  )
}

function PredictiveModelTab({ company, weights, setWeights }: {
  company: Company;
  weights: ModelWeights;
  setWeights: (w: ModelWeights) => void;
}) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const avgFinScore = company.financials.length
    ? company.financials.reduce((a, f) => a + f.score, 0) / company.financials.length
    : 5
  const rawScore = (
    (avgFinScore * (weights.fundamentalHealth / 100)) +
    (Math.min(company.piotroski / 9 * 10, 10) * (weights.earningsQuality / 100)) +
    ((company.insider === "buy" ? 8 : company.insider === "sell" ? 3 : 5) * (weights.insiderActivity / 100)) +
    ((company.guidance_accuracy / 10) * (weights.estimateMomentum / 100)) +
    (avgFinScore * (weights.valuation / 100)) +
    ((company.short_interest < 8 ? 8 : company.short_interest > 15 ? 3 : 5) * (weights.institutionalFlow / 100)) +
    (5 * (weights.technicalMomentum / 100)) +
    (5 * (weights.sentiment / 100))
  ) * (100 / totalWeight) * 10
  const adjustedProb = Math.round(Math.min(Math.max(1 / (1 + Math.exp(-0.8 * (rawScore - 5))) * 100, 10), 90))

  return (
    <div>
      <p className="section-sub">Adjust category weights to change the probability model. Weights do not need to sum to exactly 100 — they are normalized automatically.</p>
      <div className="weight-grid">
        {(Object.keys(weights) as Array<keyof ModelWeights>).map(key => (
          <div key={key} className="weight-row">
            <span className="weight-label">{WEIGHT_LABELS[key]}</span>
            <input
              className="weight-slider"
              type="range" min="0" max="40"
              value={weights[key]}
              onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })}
            />
            <span className="weight-val">{weights[key]}%</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Total: {totalWeight} (normalized in calculation)</div>

      <div className="prob-display">
        <div style={{ display: "flex", justifyContent: "center", gap: 40 }}>
          <div>
            <div className="prob-up-val">{adjustedProb}%</div>
            <div className="prob-label">↑ Probability Up</div>
          </div>
          <div>
            <div className="prob-dn-val">{100 - adjustedProb}%</div>
            <div className="prob-label">↓ Probability Down</div>
          </div>
        </div>
        <div className="prob-bar-wrap">
          <div className="prob-bar-inner" style={{ width: `${adjustedProb}%` }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          Rules-based weighted model · Live weight adjustment active
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="stat-box">
          <div className="stat-box-label">Model Score</div>
          <div className="stat-box-val" style={{ color: scoreColor(rawScore * 10) }}>{rawScore.toFixed(1)} / 10</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Confidence</div>
          <div className="stat-box-val" style={{ color: "var(--amber)" }}>
            {Math.abs(adjustedProb - 50) > 20 ? "High" : Math.abs(adjustedProb - 50) > 10 ? "Medium" : "Low"}
          </div>
        </div>
      </div>
    </div>
  )
}

function NewsSentimentTab({ company }: { company: Company }) {
  return (
    <div>
      <p className="section-sub">Recent news articles scored by NLP sentiment analysis. Bullish = positive signal, Bearish = risk flag.</p>
      {company.news.length === 0
        ? <div className="empty">No news available</div>
        : company.news.map((n, i) => (
          <div key={i} className="news-card">
            <div className="news-meta">
              <span className="news-date">{n.date}</span>
              <span className="news-source">{n.source}</span>
              <span className={n.sentiment === "bullish" ? "sentiment-bull" : n.sentiment === "bearish" ? "sentiment-bear" : "sentiment-neutral"}>
                {n.sentiment.charAt(0).toUpperCase() + n.sentiment.slice(1)}
              </span>
            </div>
            <div className="news-headline">{n.headline}</div>
          </div>
        ))
      }
    </div>
  )
}

// ── Options Strategy Tab ───────────────────────────────────────────────────────
const RISK_LABELS = ["Very Low", "Low", "Moderate", "High", "Very High"]

function OptionsTab({ company, livePrice }: { company: Company; livePrice?: number }) {
  const price = livePrice ?? company.current_price
  const rec = getOptionStrategy(company, livePrice)

  const biasColor =
    rec.bias === "Bullish" ? "var(--green)" :
    rec.bias === "Bearish" ? "var(--red)" :
    rec.bias === "Skip"    ? "var(--muted)" : "var(--amber)"

  const biasIcon =
    rec.bias === "Bullish" ? "↑" :
    rec.bias === "Bearish" ? "↓" :
    rec.bias === "Skip"    ? "—" : "↔"

  return (
    <div>
      <p className="section-sub">
        Optimal options strategy derived from the predictive model's probability score, implied volatility, and insider/fundamental signals.
      </p>

      {/* Strategy header */}
      <div className="opt-strategy-box">
        <div>
          <div className="opt-strategy-name">{rec.strategy}</div>
          <div className="opt-strategy-meta">
            <span style={{ color: biasColor, fontWeight: 700 }}>{biasIcon} {rec.bias}</span>
            <span style={{ color: "var(--muted)" }}>·</span>
            <span style={{ color: "var(--muted)" }}>{rec.expiry}</span>
          </div>
        </div>
        {!rec.skip && (
          <div className="opt-prob-badge">
            <div style={{ fontSize: 22, fontWeight: 900, color: biasColor }}>{rec.probProfit}%</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Est. Prob Profit</div>
          </div>
        )}
      </div>

      {/* Current price */}
      <div className="opt-price-row">
        <span>Current Price</span>
        <span style={{ fontWeight: 800, fontSize: 16 }}>
          ${price.toFixed(2)}
          {livePrice && <span className="live-dot" style={{ marginLeft: 6 }}>● Live</span>}
        </span>
      </div>

      {rec.skip ? (
        <div className="opt-skip-box">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No Trade Recommended</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>{rec.skipReason}</div>
          <div style={{ fontSize: 13, marginTop: 10 }}>{rec.rationale}</div>
        </div>
      ) : (
        <>
          {/* Legs */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Strategy Legs</div>
            <div className="opt-legs-wrap">
              {rec.legs.map((leg: OptionLeg, i: number) => (
                <div key={i} className={`opt-leg opt-leg-${leg.action.toLowerCase()}`}>
                  <span className={`opt-leg-action ${leg.action === "Buy" ? "opt-buy" : "opt-sell"}`}>{leg.action}</span>
                  <span className="opt-leg-type">{leg.type}</span>
                  <span className="opt-leg-strike">${leg.strike}</span>
                  {leg.note && <span className="opt-leg-note">{leg.note}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* P&L */}
          <div className="two-col" style={{ marginBottom: 14 }}>
            <div className="stat-box">
              <div className="stat-box-label">Max Profit</div>
              <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 13, marginTop: 4 }}>{rec.maxProfit}</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-label">Max Loss</div>
              <div style={{ color: "var(--red)", fontWeight: 700, fontSize: 13, marginTop: 4 }}>{rec.maxLoss}</div>
            </div>
          </div>

          {/* Breakevens */}
          {rec.breakevens.length > 0 && (
            <div className="stat-box" style={{ marginBottom: 14 }}>
              <div className="stat-box-label">Breakeven{rec.breakevens.length > 1 ? "s at Expiry" : " at Expiry"}</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>
                {rec.breakevens.map(b => `$${b}`).join("  /  ")}
              </div>
              {rec.breakevens.length === 2 && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  Profit zone: between ${rec.breakevens[0]} and ${rec.breakevens[1]}
                </div>
              )}
            </div>
          )}

          {/* Risk rating */}
          <div className="stat-box" style={{ marginBottom: 14 }}>
            <div className="stat-box-label">Risk Level</div>
            <div className="opt-risk-row">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`opt-risk-dot ${i <= rec.riskRating ? "active" : ""}`}
                  style={{ background: i <= rec.riskRating ? (rec.riskRating <= 2 ? "var(--green)" : rec.riskRating === 3 ? "var(--amber)" : "var(--red)") : "var(--panel3)" }} />
              ))}
              <span style={{ marginLeft: 8, fontWeight: 700 }}>{RISK_LABELS[rec.riskRating - 1]}</span>
            </div>
          </div>
        </>
      )}

      {/* Signal inputs summary */}
      <div className="stat-box" style={{ marginBottom: 14 }}>
        <div className="stat-box-label">Signal Inputs Used</div>
        <div className="opt-signals">
          <div className="opt-signal-row"><span>Prob Up</span><span style={{ color: company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)", fontWeight: 700 }}>{company.prob_up}%</span></div>
          <div className="opt-signal-row"><span>Implied Move</span><span style={{ color: "var(--amber)", fontWeight: 700 }}>±{company.implied_move}%</span></div>
          <div className="opt-signal-row"><span>Health Score</span><span style={{ color: scoreColor(company.health), fontWeight: 700 }}>{company.health}/100</span></div>
          <div className="opt-signal-row"><span>Insider Signal</span><span style={{ color: company.insider === "buy" ? "var(--green)" : company.insider === "sell" ? "var(--red)" : "var(--muted)", fontWeight: 700 }}>{company.insider === "buy" ? "▲ Buy" : company.insider === "sell" ? "▼ Sell" : "Neutral"}</span></div>
          <div className="opt-signal-row"><span>EPS Trend</span><span style={{ fontWeight: 700 }}>{company.eps_est_trend === "rising" ? "↑ Rising" : company.eps_est_trend === "falling" ? "↓ Falling" : "→ Flat"}</span></div>
        </div>
      </div>

      {/* Rationale */}
      <div className="stat-box" style={{ marginBottom: 14 }}>
        <div className="stat-box-label">Why This Strategy</div>
        <div style={{ fontSize: 13, lineHeight: 1.75, marginTop: 4 }}>{rec.rationale}</div>
      </div>

      {/* Disclaimer */}
      <div className="opt-disclaimer">
        ⚠ Educational purposes only — not financial advice. Options involve significant risk including loss of entire premium. Always verify strikes and expiries with your broker before trading.
      </div>
    </div>
  )
}

// ── Drawer ─────────────────────────────────────────────────────────────────────
function CompanyDrawer({ company, livePrice, onClose }: { company: Company; livePrice?: number; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("history")
  const [weights, setWeights] = useState<ModelWeights>(DEFAULT_WEIGHTS)
  const accentColor = SECTOR_COLORS[company.sector] ?? "#3b82f6"
  const price = livePrice ?? company.current_price

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-title-row">
            <div>
              <div className="drawer-ticker" style={{ color: accentColor }}>{company.ticker}</div>
              <div className="drawer-name">{company.name}</div>
              <div style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 6px" }}>
                ${price.toFixed(2)}
                {livePrice && <span className="live-dot" style={{ fontSize: 12, marginLeft: 8 }}>● Live</span>}
              </div>
              <div className="drawer-meta">
                <span className="chip sector">{company.sector}</span>
                <span className="chip">{company.cap}</span>
                <span className="chip">{company.day}</span>
                <span className={`timing-badge ${company.time === "BMO" ? "bmo" : "amc"}`}>{company.time}</span>
                <VBadge status={company.verification} />
              </div>
            </div>
            <button className="close-btn" onClick={onClose}>✕ Close</button>
          </div>

          <div className="kpi-row">
            <div className="kpi-box">
              <div className="kpi-label">EPS Estimate</div>
              <div className="kpi-val">${company.eps_est}</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Revenue Estimate</div>
              <div className="kpi-val">{company.rev_est}</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Health Score</div>
              <div className="kpi-val" style={{ color: scoreColor(company.health) }}>{company.health}</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-label">Prob. Up</div>
              <div className="kpi-val" style={{ color: company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)" }}>{company.prob_up}%</div>
            </div>
          </div>

          <div className="tabs">
            {TAB_LABELS.map(t => (
              <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}${t.key === "options" ? " tab-options" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="tab-body">
          {tab === "history"    && <EarningsHistoryTab company={company} />}
          {tab === "financials" && <FinancialsTab company={company} />}
          {tab === "smart"      && <SmartMoneyTab company={company} />}
          {tab === "model"      && <PredictiveModelTab company={company} weights={weights} setWeights={setWeights} />}
          {tab === "news"       && <NewsSentimentTab company={company} />}
          {tab === "options"    && <OptionsTab company={company} livePrice={livePrice} />}
        </div>
      </div>
    </>
  )
}

// ── Go Live Instructions ───────────────────────────────────────────────────────
function GoLivePage({
  finnhubKey, setFinnhubKey,
  liveMode, setLiveMode,
  quoteCount, quoteFetchedAt, fetchLiveQuotes, fetching,
}: {
  finnhubKey: string; setFinnhubKey: (k: string) => void;
  liveMode: boolean; setLiveMode: (v: boolean) => void;
  quoteCount: number; quoteFetchedAt: Date | null; fetchLiveQuotes: () => void; fetching: boolean;
}) {
  const [showKey, setShowKey] = useState(false)
  const [savedKey, setSavedKey] = useState(finnhubKey)

  function saveKey() {
    localStorage.setItem("finnhubKey", savedKey)
    setFinnhubKey(savedKey)
  }

  function toggleLive() {
    const next = !liveMode
    localStorage.setItem("liveMode", String(next))
    setLiveMode(next)
  }

  return (
    <div>
      <div className="topbar-left" style={{ marginBottom: 24 }}>
        <h1>Go Live — Real Data Setup</h1>
        <p>Switch from demo data to live market data in two ways: quick browser-based quotes, or the full Python pipeline.</p>
      </div>

      {/* ── Option 1: Browser live quotes ── */}
      <div className="stat-box" style={{ marginBottom: 16, borderColor: liveMode ? "rgba(34,197,94,.4)" : "var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              Option 1 — Live Quotes (Browser, No Setup)
              <span style={{ marginLeft: 8, fontSize: 11, background: "rgba(59,130,246,.15)", color: "var(--accent)", padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>Recommended</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>Fetches current stock prices from Finnhub directly in your browser. Refreshes every 5 minutes.</div>
          </div>
          <button
            className={`live-toggle-btn ${liveMode ? "live-on" : "live-off"}`}
            onClick={toggleLive}
            disabled={liveMode && !finnhubKey}
          >
            {liveMode ? "● Live ON" : "○ Go Live"}
          </button>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Finnhub API Key</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="search-input"
              style={{ flex: 1 }}
              type={showKey ? "text" : "password"}
              placeholder="Paste your Finnhub API key here…"
              value={savedKey}
              onChange={e => setSavedKey(e.target.value)}
            />
            <button className="week-btn" style={{ padding: "8px 12px" }} onClick={() => setShowKey(!showKey)}>{showKey ? "Hide" : "Show"}</button>
            <button className="card-link-btn" onClick={saveKey} disabled={!savedKey}>Save</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
            Key stored in browser localStorage only — never sent to any server.
            Get a free key at <span style={{ color: "var(--accent)" }}>finnhub.io/dashboard</span> (free tier: 60 req/min).
          </div>
        </div>

        {finnhubKey && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button className="card-link-btn" onClick={fetchLiveQuotes} disabled={fetching}>
              {fetching ? "Fetching…" : "Refresh Quotes Now"}
            </button>
            {quoteFetchedAt && (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Last updated: {quoteFetchedAt.toLocaleTimeString()} · {quoteCount} quotes loaded
              </span>
            )}
          </div>
        )}

        {liveMode && !finnhubKey && (
          <div style={{ color: "var(--amber)", fontSize: 13, marginTop: 8 }}>⚠ Enter and save a Finnhub API key first.</div>
        )}
      </div>

      {/* ── Option 2: Full Python pipeline ── */}
      <div className="stat-box" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Option 2 — Full Data Pipeline (Python)</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>
          Populates the entire earnings.json with real earnings dates, estimates, financials, insider data, and news. Run weekly before earnings season.
        </div>

        {[
          {
            step: "1", title: "Get API Keys (5 min, all free tiers available)",
            content: (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>• <b>Finnhub</b> — earnings calendar, estimates, quotes: <span style={{ color: "var(--accent)" }}>finnhub.io</span> → Register → Dashboard</div>
                <div>• <b>Financial Modeling Prep (FMP)</b> — financials, earnings history: <span style={{ color: "var(--accent)" }}>financialmodelingprep.com/developer</span></div>
                <div>• <b>Alpha Vantage</b> — news sentiment: <span style={{ color: "var(--accent)" }}>alphavantage.co/support/#api-key</span></div>
              </div>
            )
          },
          {
            step: "2", title: "Install Python dependencies",
            content: (
              <div>
                <div className="code-block">pip install -r requirements.txt</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Requires Python 3.9+. Installs: requests, python-dotenv, pandas.</div>
              </div>
            )
          },
          {
            step: "3", title: "Configure API keys",
            content: (
              <div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Copy <code style={{ background: "var(--panel3)", padding: "1px 5px", borderRadius: 4 }}>.env.example</code> to <code style={{ background: "var(--panel3)", padding: "1px 5px", borderRadius: 4 }}>.env</code> and fill in your keys:</div>
                <div className="code-block">
                  cp .env.example .env{"\n"}
                  # Then edit .env:{"\n"}
                  FINNHUB_API_KEY=your_key_here{"\n"}
                  FMP_API_KEY=your_key_here{"\n"}
                  ALPHAVANTAGE_KEY=your_key_here
                </div>
              </div>
            )
          },
          {
            step: "4", title: "Run the data pipeline",
            content: (
              <div>
                <div className="code-block">python scripts/refresh_all.py</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  Fetches earnings calendar → fundamentals → insider → news → normalizes to app format.
                  Overwrites <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>public/data/earnings.json</code>. Takes ~2–3 min.
                </div>
              </div>
            )
          },
          {
            step: "5", title: "Rebuild and push (GitHub Pages)",
            content: (
              <div>
                <div className="code-block">
                  npm run build{"\n"}
                  git add .{"\n"}
                  git commit -m "refresh earnings data"{"\n"}
                  git push
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  GitHub Pages serves the updated data automatically within ~2 minutes of the push.
                </div>
              </div>
            )
          },
        ].map(({ step, title, content }) => (
          <div key={step} style={{ marginBottom: 16, borderLeft: "3px solid var(--accent)", paddingLeft: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              <span style={{ background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, marginRight: 8 }}>{step}</span>
              {title}
            </div>
            {content}
          </div>
        ))}
      </div>

      {/* ── Option 3: GitHub Actions auto-refresh ── */}
      <div className="stat-box" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Option 3 — GitHub Actions Auto-Refresh (Fully Automated)</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>Schedule the pipeline to run every Monday morning automatically — no manual steps after setup.</div>
        <div style={{ borderLeft: "3px solid var(--border)", paddingLeft: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Add API keys to GitHub Secrets</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
            Repo → Settings → Secrets → Actions → New secret for each key:<br />
            <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>FINNHUB_API_KEY</code>, <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>FMP_API_KEY</code>, <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>ALPHAVANTAGE_KEY</code>
          </div>
          <div style={{ fontWeight: 600, margin: "12px 0 6px", fontSize: 13 }}>Then create <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>.github/workflows/refresh-data.yml</code></div>
          <div className="code-block" style={{ fontSize: 11, lineHeight: 1.7 }}>
            {`name: Refresh Earnings Data
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday 6am UTC
  workflow_dispatch:       # Also allow manual trigger

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r EarningAnalysis/requirements.txt
      - run: python EarningAnalysis/scripts/refresh_all.py
        env:
          FINNHUB_API_KEY: \${{ secrets.FINNHUB_API_KEY }}
          FMP_API_KEY: \${{ secrets.FMP_API_KEY }}
          ALPHAVANTAGE_KEY: \${{ secrets.ALPHAVANTAGE_KEY }}
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd EarningAnalysis && npm ci && npm run build
      - run: |
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add EarningAnalysis/
          git commit -m "auto: refresh earnings data \$(date +%Y-%m-%d)" || exit 0
          git push`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState<Company[]>([])
  const [selected, setSelected] = useState<Company | null>(null)
  const [week, setWeek] = useState<"both" | "current" | "next">("both")
  const [sector, setSector] = useState("All")
  const [cap, setCap] = useState("All")
  const [timing, setTiming] = useState("All")
  const [search, setSearch] = useState("")
  const [activeNav, setActiveNav] = useState("dashboard")

  // Live data state
  const [finnhubKey, setFinnhubKey] = useState<string>(() => localStorage.getItem("finnhubKey") || "")
  const [liveMode, setLiveMode] = useState<boolean>(() => localStorage.getItem("liveMode") === "true")
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({})
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<Date | null>(null)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/earnings.json").then(r => r.json()).then(setData)
  }, [])

  const fetchLiveQuotes = useCallback(async () => {
    if (!finnhubKey || !data.length) return
    setFetching(true)
    const quotes: Record<string, number> = {}
    for (const company of data) {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${company.ticker}&token=${finnhubKey}`)
        const json = await res.json()
        if (json.c && json.c > 0) quotes[company.ticker] = json.c
      } catch { /* skip failed quote */ }
      await new Promise(r => setTimeout(r, 120))
    }
    setLiveQuotes(quotes)
    setQuoteFetchedAt(new Date())
    setFetching(false)
  }, [finnhubKey, data])

  useEffect(() => {
    if (!liveMode || !finnhubKey || !data.length) return
    fetchLiveQuotes()
    const id = setInterval(fetchLiveQuotes, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [liveMode, finnhubKey, data, fetchLiveQuotes])

  const sectors = useMemo(() => ["All", ...Array.from(new Set(data.map(d => d.sector))).sort()], [data])
  const caps = useMemo(() => ["All", "Mega", "Large", "Mid", "Small", "Micro"], [])

  const filtered = useMemo(() => data.filter(item => {
    const wMatch = week === "both" ? true : item.week === week
    const sMatch = sector === "All" || item.sector === sector
    const cMatch = cap === "All" || item.cap === cap
    const tMatch = timing === "All" || item.time === timing
    const qMatch = !search || item.ticker.toLowerCase().includes(search.toLowerCase()) || item.name.toLowerCase().includes(search.toLowerCase())
    return wMatch && sMatch && cMatch && tMatch && qMatch
  }), [data, week, sector, cap, timing, search])

  const currentWeek = filtered.filter(x => x.week === "current")
  const nextWeek    = filtered.filter(x => x.week === "next")
  const liveCount   = Object.keys(liveQuotes).length

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">📊</div>
          Earnings Tracker
        </div>
        <div className="nav-section">Views</div>
        {[
          ["dashboard", "📅", "Dashboard"],
          ["model",     "⚙️", "Model Studio"],
          ["backtest",  "🔬", "Backtesting"],
          ["smart",     "🕵️", "Smart Money"],
        ].map(([key, icon, label]) => (
          <button key={key} className={`nav-item ${activeNav === key ? "active" : ""}`} onClick={() => setActiveNav(key as string)}>
            <span>{icon}</span> {label}
          </button>
        ))}
        <div className="nav-section">Data</div>
        <button className={`nav-item ${activeNav === "golive" ? "active" : ""}`} onClick={() => setActiveNav("golive")}>
          <span>{liveMode ? "🟢" : "⚪"}</span>
          {liveMode ? "Live Mode ON" : "Go Live"}
        </button>
        <button className={`nav-item ${activeNav === "sources" ? "active" : ""}`} onClick={() => setActiveNav("sources")}>
          <span>🔗</span> Data Sources
        </button>
        <div className="nav-section">Settings</div>
        <button className={`nav-item ${activeNav === "settings" ? "active" : ""}`} onClick={() => setActiveNav("settings")}>
          <span>⚙</span> Settings
        </button>
        <div className="sidebar-footer">
          <div className="data-status">
            <div className="ds-title">Data Layer</div>
            <div className="ds-row"><span>Mode</span><span className={liveMode ? "ds-live" : "ds-mock"}>{liveMode ? "🟢 Live" : "Mock / Dev"}</span></div>
            <div className="ds-row"><span>Earnings</span><span>{data.length} companies</span></div>
            {liveMode && <div className="ds-row"><span>Quotes</span><span style={{ color: "var(--green)" }}>{liveCount} live</span></div>}
            {!liveMode && <div className="ds-row"><span>Verified</span><span>{data.filter(d => d.verification === "verified").length} / {data.length}</span></div>}
            {quoteFetchedAt && <div className="ds-row" style={{ fontSize: 10 }}><span>Updated</span><span>{quoteFetchedAt.toLocaleTimeString()}</span></div>}
          </div>
        </div>
      </aside>

      <main className="content">
        {activeNav === "dashboard" && (
          <>
            <div className="topbar">
              <div className="topbar-left">
                <h1>Weekly Earnings Dashboard</h1>
                <p>Current week · Next week · {filtered.length} companies after filters</p>
              </div>
              <div className="week-toggle">
                {(["both","current","next"] as const).map(w => (
                  <button key={w} className={`week-btn ${week === w ? "active" : ""}`} onClick={() => setWeek(w)}>
                    {w === "both" ? "Both Weeks" : w === "current" ? "This Week" : "Next Week"}
                  </button>
                ))}
              </div>
            </div>

            <div className="filterbar">
              <span className="filter-label">Sector</span>
              <select className="filter-select" value={sector} onChange={e => setSector(e.target.value)}>
                {sectors.map(s => <option key={s}>{s}</option>)}
              </select>
              <span className="filter-label">Market Cap</span>
              <select className="filter-select" value={cap} onChange={e => setCap(e.target.value)}>
                {caps.map(c => <option key={c}>{c}</option>)}
              </select>
              <span className="filter-label">Timing</span>
              <select className="filter-select" value={timing} onChange={e => setTiming(e.target.value)}>
                {["All","BMO","AMC"].map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="search-input" placeholder="Search ticker or company…" value={search} onChange={e => setSearch(e.target.value)} />
              <span className="filter-count">{filtered.length} results</span>
            </div>

            {(week === "current" || week === "both") && currentWeek.length > 0 && (
              <div className="week-section">
                <div className="section-header">
                  <span className="section-title">📅 This Week (Jun 30 – Jul 4)</span>
                  <span className="section-count">{currentWeek.length} companies</span>
                </div>
                <div className="card-grid">
                  {currentWeek.map(c => <CompanyCard key={c.ticker} company={c} livePrice={liveQuotes[c.ticker]} onClick={() => setSelected(c)} />)}
                </div>
              </div>
            )}

            {(week === "next" || week === "both") && nextWeek.length > 0 && (
              <div className="week-section">
                <div className="section-header">
                  <span className="section-title">📅 Next Week (Jul 7 – Jul 11)</span>
                  <span className="section-count">{nextWeek.length} companies</span>
                </div>
                <div className="card-grid">
                  {nextWeek.map(c => <CompanyCard key={c.ticker} company={c} livePrice={liveQuotes[c.ticker]} onClick={() => setSelected(c)} />)}
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="empty" style={{ marginTop: 60 }}>No companies match current filters.</div>
            )}
          </>
        )}

        {activeNav === "golive" && (
          <GoLivePage
            finnhubKey={finnhubKey} setFinnhubKey={setFinnhubKey}
            liveMode={liveMode} setLiveMode={setLiveMode}
            quoteCount={liveCount} quoteFetchedAt={quoteFetchedAt}
            fetchLiveQuotes={fetchLiveQuotes} fetching={fetching}
          />
        )}

        {activeNav === "sources" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}>
              <h1>Data Sources</h1>
              <p>Verified data pipeline — two-source confirmation required before any company scores are enabled</p>
            </div>
            {[
              { name: "SEC EDGAR", url: "data.sec.gov", type: "Government / Primary", status: "Live", desc: "Company facts, 10-K/10-Q XBRL, Form 4 insider filings, 13F institutional. Completely free. SEC-filed values override all vendor data.", fields: ["Financial statements","Insider trades (Form 4)","Institutional holdings (13F)","Company metadata"] },
              { name: "Finnhub", url: "finnhub.io", type: "Market Data / Primary Calendar", status: "API Key Required", desc: "Earnings calendar, consensus EPS/revenue estimates, real-time quotes. Free tier: 60 API calls/min.", fields: ["Earnings calendar dates/times","EPS & revenue estimates","News feed","Basic financials"] },
              { name: "Financial Modeling Prep", url: "financialmodelingprep.com", type: "Aggregator / Cross-Check", status: "API Key Required", desc: "Full financial statements, earnings history, estimates, insider data. Free tier: 250 calls/day. Used to cross-check Finnhub calendar and enrich financial data.", fields: ["Financial statements","Earnings surprise history","Estimate revision history","Insider transaction enrichment"] },
              { name: "Alpha Vantage", url: "alphavantage.co", type: "News Sentiment / Fallback", status: "API Key Required", desc: "News sentiment scoring via NLP, earnings data, technical indicators. Free tier: 25 requests/day.", fields: ["News + sentiment","Technical indicators","Earnings data (cross-check)","Economic indicators"] },
            ].map(s => (
              <div key={s.name} className="stat-box" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div>
                  <span className="vbadge vbadge-verified">{s.status}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 8px" }}>{s.url} · {s.type}</div>
                <div style={{ fontSize: 13, marginBottom: 10 }}>{s.desc}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {s.fields.map(f => <span key={f} className="chip">{f}</span>)}
                </div>
              </div>
            ))}
            <div className="stat-box" style={{ marginTop: 20, borderColor: "rgba(245,158,11,.3)" }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--amber)" }}>⚡ Verification Rules</div>
              {[
                "Earnings date/time: must match in both Finnhub AND FMP before display",
                "Filed financials: SEC EDGAR always overrides vendor data on mismatch",
                "Estimates: if Finnhub and FMP differ by >5%, card shows 'Conflict' badge and scoring is disabled",
                "Insider/13F data: SEC EDGAR is primary; vendor enrichment applied on top",
                "Stale data: any field not refreshed within 24h is flagged as stale",
              ].map((r, i) => <div key={i} style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>• {r}</div>)}
            </div>
          </div>
        )}

        {activeNav === "model" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}>
              <h1>Model Studio</h1>
              <p>Global default weight configuration — applied to all companies unless overridden in company deep dive</p>
            </div>
            <div className="stat-box">
              <div style={{ marginBottom: 16, fontWeight: 700 }}>Default Signal Weights</div>
              {Object.entries(DEFAULT_WEIGHTS).map(([key, val]) => (
                <div key={key} className="weight-row">
                  <span className="weight-label">{WEIGHT_LABELS[key as keyof ModelWeights]}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--panel3)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(val / 40) * 100}%`, background: "var(--accent)", borderRadius: 999 }} />
                  </div>
                  <span className="weight-val">{val}%</span>
                </div>
              ))}
              <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>Open any company card → Options Strategy tab to see the recommended trade for each company.</div>
            </div>
          </div>
        )}

        {activeNav === "backtest" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}>
              <h1>Backtesting</h1>
              <p>Walk-forward historical simulation — available in Backend version with full price history database</p>
            </div>
            <div className="stat-box">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Backtesting is ready for the live data phase</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
                The backtesting engine will apply the predictive model to historical earnings events and compare predicted direction vs. actual post-earnings price move (Day +1, +3, +5).<br /><br />
                To activate: connect the Python data pipeline scripts and populate <code style={{ background: "var(--panel3)", padding: "1px 5px", borderRadius: 4 }}>/public/data/</code> with real historical data from SEC EDGAR, Finnhub, and FMP.
              </div>
              <div className="badge-row">
                <span className="chip">Accuracy %</span>
                <span className="chip">Bull vs Bear precision</span>
                <span className="chip">Sector breakdown</span>
                <span className="chip">Equity curve</span>
                <span className="chip">Confusion matrix</span>
                <span className="chip">Config comparison</span>
              </div>
            </div>
          </div>
        )}

        {activeNav === "smart" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}>
              <h1>Smart Money Feed</h1>
              <p>Aggregate insider and institutional activity across all earnings companies</p>
            </div>
            {data.filter(d => d.insider_trades.length > 0).map(company => (
              <div key={company.ticker} className="stat-box" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{company.ticker} · {company.name}</div>
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Name</th><th>Role</th><th>Type</th><th>Value</th><th>10b5</th></tr></thead>
                  <tbody>
                    {company.insider_trades.map((t, i) => (
                      <tr key={i}>
                        <td>{t.date}</td>
                        <td>{t.name}</td>
                        <td style={{ color: "var(--muted)" }}>{t.role}</td>
                        <td style={{ color: t.type === "buy" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{t.type === "buy" ? "▲ Buy" : "▼ Sell"}</td>
                        <td>${(t.value / 1_000_000).toFixed(1)}M</td>
                        <td>{t.is_10b5 ? <span style={{ color: "var(--muted)", fontSize: 11 }}>Pre-scheduled</span> : <span style={{ color: "var(--amber)", fontWeight: 700, fontSize: 11 }}>Discretionary</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {activeNav === "settings" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}>
              <h1>Settings</h1>
              <p>API keys are stored in your browser only and used by the Python scripts.</p>
            </div>
            {[
              { key: "VITE_FMP_API_KEY", label: "Financial Modeling Prep API Key", placeholder: "Your FMP key (financialmodelingprep.com/developer)" },
              { key: "VITE_FINNHUB_API_KEY", label: "Finnhub API Key", placeholder: "Your Finnhub key (finnhub.io/dashboard)" },
              { key: "VITE_ALPHAVANTAGE_KEY", label: "Alpha Vantage API Key", placeholder: "Your Alpha Vantage key (alphavantage.co/support/#api-key)" },
            ].map(s => (
              <div key={s.key} className="stat-box" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{s.label}</div>
                <input className="search-input" style={{ width: "100%" }} placeholder={s.placeholder} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Set as <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>{s.key}</code> in your <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>.env</code> file for use in Python scripts</div>
              </div>
            ))}
            <div className="stat-box" style={{ borderColor: "rgba(59,130,246,.3)", marginTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Live Quotes</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>To enable live stock price quotes directly in the browser, go to <button className="inline-link" onClick={() => setActiveNav("golive")}>Go Live</button> and enter your Finnhub key.</div>
            </div>
          </div>
        )}
      </main>

      {selected && <CompanyDrawer company={selected} livePrice={liveQuotes[selected.ticker]} onClose={() => setSelected(null)} />}
    </div>
  )
}
