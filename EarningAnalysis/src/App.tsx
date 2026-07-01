import { useCallback, useEffect, useMemo, useState } from "react"
import { Company, LastEarningsResult, ModelWeights, OptionLeg, OptionRecommendation, PoliticianTrade } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// Conviction score: how high-conviction (either direction) is this company?
// Range 0–100. Used to rank and filter Top 20.
function getConvictionScore(company: Company): number {
  const directionStrength = Math.abs(company.prob_up - 50) / 50
  const healthNorm        = company.health / 100
  const verifiedScore     = company.verification === "verified"    ? 1
                          : company.verification === "sec-filed"   ? 0.8
                          : company.verification === "single-source"? 0.6
                          : company.verification === "stale"       ? 0.4 : 0.3
  const insiderScore      = (company.insider === "buy" || company.insider === "sell") ? 1 : 0.5
  const politicalScore    = (company.political_signal === "buy" || company.political_signal === "sell") ? 1 : 0.5
  const ivScore           = Math.min(company.implied_move / 8, 1)

  return Math.round(
    directionStrength * 38 +
    healthNorm        * 28 +
    verifiedScore     * 14 +
    insiderScore      *  8 +
    politicalScore    *  7 +
    ivScore           *  5
  )
}

function getOptionStrategy(company: Company, livePrice?: number): OptionRecommendation {
  const price = livePrice ?? company.current_price
  const { prob_up, implied_move, health, insider, eps_est_trend, day, political_signal } = company

  let bias = (prob_up - 50) / 50
  if (insider === "buy")                    bias += 0.15
  else if (insider === "sell")              bias -= 0.15
  if (eps_est_trend === "rising")           bias += 0.08
  else if (eps_est_trend === "falling")     bias -= 0.08
  if (political_signal === "buy")           bias += 0.08
  else if (political_signal === "sell")     bias -= 0.08
  bias = Math.max(-1, Math.min(1, bias))

  const atm      = roundToStrike(price)
  const moveAmt  = price * implied_move / 100
  const otmCall  = roundToStrike(price + moveAmt)
  const otmPut   = roundToStrike(price - moveAmt)
  const wideCall = roundToStrike(price + moveAmt * 1.6)
  const widePut  = roundToStrike(price - moveAmt * 1.6)
  const expiry   = `${day} expiry (earnings week)`

  if (bias > 0.25) {
    if (implied_move < 5) {
      return { strategy: "Long Call", bias: "Bullish",
        legs: [{ action: "Buy", type: "Call", strike: atm, note: "ATM" }], expiry,
        rationale: `${prob_up}% prob ↑ with low IV (±${implied_move}%). Calls are cheap — ATM long call offers high delta exposure.${insider === "buy" ? " Insider buying adds conviction." : ""}${political_signal === "buy" ? " Congressional buying supports the bullish thesis." : ""}`,
        maxProfit: "Unlimited above breakeven", maxLoss: `Premium paid (~${(price * 0.022).toFixed(0)}/share)`,
        breakevens: [atm], probProfit: Math.round(prob_up * 0.76), riskRating: 2 }
    }
    return { strategy: "Bull Call Spread", bias: "Bullish",
      legs: [{ action: "Buy", type: "Call", strike: atm, note: "ATM (long leg)" }, { action: "Sell", type: "Call", strike: otmCall, note: `+${implied_move}% OTM (short leg)` }], expiry,
      rationale: `${prob_up}% prob ↑ but IV of ±${implied_move}% makes outright calls expensive. Selling the ${otmCall} call finances ~40% of premium while keeping exposure through the expected range.`,
      maxProfit: `$${(otmCall - atm).toFixed(0)} spread – net debit`, maxLoss: "Net debit paid",
      breakevens: [atm], probProfit: Math.round(prob_up * 0.78), riskRating: 2 }
  }
  if (bias > 0.08) {
    if (health >= 70) {
      return { strategy: "Cash-Secured Put", bias: "Bullish",
        legs: [{ action: "Sell", type: "Put", strike: otmPut, note: `−${implied_move}% OTM` }], expiry,
        rationale: `Moderate bullish lean (${prob_up}% prob ↑). Selling put at $${otmPut} collects premium + gives a discounted entry. Health ${health}/100 supports ownership.`,
        maxProfit: "Premium collected", maxLoss: `Strike minus premium (assignment at $${otmPut})`,
        breakevens: [otmPut], probProfit: Math.round(100 - prob_up * 0.38), riskRating: 2 }
    }
    return { strategy: "Bull Call Spread", bias: "Bullish",
      legs: [{ action: "Buy", type: "Call", strike: atm, note: "ATM (long leg)" }, { action: "Sell", type: "Call", strike: otmCall, note: `+${implied_move}% OTM (short leg)` }], expiry,
      rationale: `Moderate bullish lean (${prob_up}% prob ↑). Spread caps max loss to net debit — appropriate for moderate conviction.`,
      maxProfit: `$${(otmCall - atm).toFixed(0)} spread – net debit`, maxLoss: "Net debit paid",
      breakevens: [atm], probProfit: Math.round(prob_up * 0.72), riskRating: 2 }
  }
  if (bias >= -0.08) {
    if (implied_move >= 5) {
      return { strategy: "Iron Condor", bias: "Neutral",
        legs: [
          { action: "Sell", type: "Call", strike: otmCall, note: `+${implied_move}% OTM` },
          { action: "Buy",  type: "Call", strike: wideCall, note: "+buffer (protection)" },
          { action: "Sell", type: "Put",  strike: otmPut,  note: `-${implied_move}% OTM` },
          { action: "Buy",  type: "Put",  strike: widePut,  note: "-buffer (protection)" },
        ], expiry,
        rationale: `Near-neutral (${prob_up}% prob ↑) with elevated IV (±${implied_move}%). Condor profits if stock stays within $${otmPut}–$${otmCall}. Collect premium from both sides.`,
        maxProfit: "Net credit collected", maxLoss: "Spread width – net credit",
        breakevens: [otmPut, otmCall], probProfit: Math.round(65 + (0.08 - Math.abs(bias)) / 0.08 * 8), riskRating: 3 }
    }
    return { strategy: "No Clear Edge", bias: "Skip", legs: [], expiry,
      rationale: `Near 50/50 (${prob_up}% prob ↑) and low IV (±${implied_move}%). Premium is insufficient for an Iron Condor to be viable. Consider sitting this one out.`,
      maxProfit: "N/A", maxLoss: "N/A", breakevens: [], probProfit: 50, riskRating: 1, skip: true,
      skipReason: "Insufficient edge — consider sitting this earnings event out." }
  }
  if (bias >= -0.25) {
    return { strategy: "Bear Put Spread", bias: "Bearish",
      legs: [{ action: "Buy", type: "Put", strike: atm, note: "ATM (long leg)" }, { action: "Sell", type: "Put", strike: otmPut, note: `-${implied_move}% OTM (short leg)` }], expiry,
      rationale: `Moderate bearish lean (only ${prob_up}% prob ↑). Spread captures expected downside through ±${implied_move}% range while capping debit. Max gain if stock falls to $${otmPut}.`,
      maxProfit: `$${(atm - otmPut).toFixed(0)} spread – net debit`, maxLoss: "Net debit paid",
      breakevens: [atm], probProfit: Math.round((100 - prob_up) * 0.72), riskRating: 2 }
  }
  if (implied_move < 5) {
    return { strategy: "Long Put", bias: "Bearish",
      legs: [{ action: "Buy", type: "Put", strike: atm, note: "ATM" }], expiry,
      rationale: `Strong bearish signal (only ${prob_up}% prob ↑). Low IV keeps puts cheap. ATM long put delivers high delta downside exposure.${insider === "sell" ? " Insider selling reinforces the thesis." : ""}${political_signal === "sell" ? " Congressional selling adds to bearish conviction." : ""}`,
      maxProfit: `Up to $${atm}/share`, maxLoss: `Premium paid (~${(price * 0.018).toFixed(0)}/share)`,
      breakevens: [atm], probProfit: Math.round((100 - prob_up) * 0.75), riskRating: 2 }
  }
  return { strategy: "Bear Put Spread", bias: "Bearish",
    legs: [{ action: "Buy", type: "Put", strike: atm, note: "ATM (long leg)" }, { action: "Sell", type: "Put", strike: otmPut, note: `-${implied_move}% OTM (short leg)` }], expiry,
    rationale: `Strong bearish signal (${prob_up}% prob ↑) with high IV (±${implied_move}%). Spread reduces the cost of expensive puts while keeping full downside participation.`,
    maxProfit: `$${(atm - otmPut).toFixed(0)} spread – net debit`, maxLoss: "Net debit paid",
    breakevens: [atm], probProfit: Math.round((100 - prob_up) * 0.76), riskRating: 3 }
}

function fmt(d: string) {
  // "2026-07-01" → "Jul 1"
  const parts = d.split("-")
  const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${months[+parts[1]]} ${+parts[2]}`
}

function fmtBil(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(2)}T`
  if (b >= 100)  return `$${b.toFixed(1)}B`
  return `$${b.toFixed(2)}B`
}

function extractYoY(note: string): string | null {
  const m = note.match(/([+-]\d+(?:\.\d+)?%)\s*YoY/i)
  return m ? m[1] : null
}

// Compute Mon–Fri range string for the calendar week containing isoDate
function calendarWeekRange(isoDate: string): string {
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d   = new Date(isoDate + 'T12:00:00Z')
  const dow = d.getUTCDay()
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  const fri = new Date(mon); fri.setUTCDate(mon.getUTCDate() + 4)
  if (mon.getUTCMonth() === fri.getUTCMonth())
    return `${MONS[mon.getUTCMonth()]} ${mon.getUTCDate()}–${fri.getUTCDate()}`
  return `${MONS[mon.getUTCMonth()]} ${mon.getUTCDate()} – ${MONS[fri.getUTCMonth()]} ${fri.getUTCDate()}`
}

// Returns [monday ISO, friday ISO] for the calendar week containing isoDate
function getCalendarWeekBounds(isoDate: string): [string, string] {
  const d = new Date(isoDate + 'T12:00:00Z')
  const dow = d.getUTCDay()
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  const fri = new Date(mon)
  fri.setUTCDate(mon.getUTCDate() + 4)
  return [mon.toISOString().slice(0, 10), fri.toISOString().slice(0, 10)]
}

function VBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    verified:        ["vbadge vbadge-verified", "✓ Verified"],
    "single-source": ["vbadge vbadge-single",   "Single Source"],
    conflict:        ["vbadge vbadge-conflict",  "⚠ Conflict"],
    stale:           ["vbadge vbadge-stale",     "Stale"],
    "sec-filed":     ["vbadge vbadge-sec",       "SEC Filed"],
  }
  const [cls, label] = map[status] ?? ["vbadge vbadge-stale", status]
  return <span className={cls}>{label}</span>
}

const DEFAULT_WEIGHTS: ModelWeights = {
  earningsQuality: 18, estimateMomentum: 16, fundamentalHealth: 14, valuation: 11,
  insiderActivity: 10, institutionalFlow: 9, technicalMomentum: 7, sentiment: 5,
  politicalActivity: 10,
}
const WEIGHT_LABELS: Record<keyof ModelWeights, string> = {
  earningsQuality: "Earnings Quality", estimateMomentum: "Estimate Momentum",
  fundamentalHealth: "Fundamental Health", valuation: "Valuation",
  insiderActivity: "Insider Activity", institutionalFlow: "Institutional Flow",
  technicalMomentum: "Technical Momentum", sentiment: "News & Sentiment",
  politicalActivity: "Congressional Trading (STOCK Act)",
}
const SECTOR_COLORS: Record<string, string> = {
  "IT": "#3b82f6", "Healthcare": "#10b981", "Financials": "#f59e0b",
  "Consumer Discretionary": "#ef4444", "Energy": "#f97316",
  "Industrials": "#6366f1", "Communication Services": "#8b5cf6",
  "Consumer Staples": "#14b8a6", "Materials": "#84cc16",
  "Utilities": "#06b6d4", "Real Estate": "#ec4899",
}

// ── Company Card ──────────────────────────────────────────────────────────────
function CompanyCard({ company, livePrice, rank, onClick }: {
  company: Company; livePrice?: number; rank: number; onClick: () => void
}) {
  const accentColor = SECTOR_COLORS[company.sector] ?? "#3b82f6"
  const probColor = company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)"
  const price = livePrice ?? company.current_price
  const rec = getOptionStrategy(company, livePrice)
  const conviction = getConvictionScore(company)

  return (
    <div className="card" onClick={onClick}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

      {/* Header row: ticker + rank + timing */}
      <div className="card-top">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="ticker">{company.ticker}</div>
            <div className="rank-badge">#{rank}</div>
          </div>
          <div className="co-name">{company.name}</div>
          <div className="card-price">
            ${price.toFixed(2)}
            {livePrice && <span className="live-dot" title="Live price"> ●</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <span className={`timing-badge ${company.time === "BMO" ? "bmo" : "amc"}`}>{company.time}</span>
          <span className={`opt-badge opt-${rec.bias.toLowerCase()}`}>{rec.strategy}</span>
        </div>
      </div>

      {/* Reporting date — prominent */}
      <div className="report-date-row">
        <span className="report-date-icon">📅</span>
        <span className="report-date-text">Reports {company.day}</span>
        <span className={`timing-pill ${company.time === "BMO" ? "timing-bmo" : "timing-amc"}`}>
          {company.time === "BMO" ? "Before Open" : "After Close"}
        </span>
      </div>

      {/* Meta chips */}
      <div className="meta-row">
        <span className="chip sector">{company.sector}</span>
        <span className="chip" title={company.subsector}>{company.industry}</span>
        <span className="chip">{company.cap}</span>
      </div>

      {/* Key estimates row */}
      <div className="est-row">
        <div className="est-block">
          <div className="est-label">EPS Est</div>
          <div className="est-value">
            ${company.eps_est.toFixed(2)}
            <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 3, color: company.eps_est_trend === "rising" ? "var(--green)" : company.eps_est_trend === "falling" ? "var(--red)" : "var(--muted)" }}>
              {company.eps_est_trend === "rising" ? " ▲" : company.eps_est_trend === "falling" ? " ▼" : " —"}
            </span>
          </div>
        </div>
        <div className="est-block">
          <div className="est-label">Rev Est</div>
          <div className="est-value">{company.rev_est}</div>
        </div>
        <div className="est-block">
          <div className="est-label">Implied Move</div>
          <div className="est-value" style={{ color: "var(--amber)" }}>±{company.implied_move}%</div>
        </div>
      </div>

      {/* Prior quarter actuals – EPS & Revenue vs consensus + YoY */}
      {company.last_earnings && (() => {
        const le = company.last_earnings
        const epsBeat = le.eps_actual >= le.eps_est * 0.999
        const revBeat = le.rev_actual_b >= le.rev_est_b * 0.999
        const epsPct  = le.eps_est ? (le.eps_actual - le.eps_est) / Math.abs(le.eps_est) * 100 : 0
        const revPct  = le.rev_est_b ? (le.rev_actual_b - le.rev_est_b) / Math.abs(le.rev_est_b) * 100 : 0
        const yoy     = le.note ? extractYoY(le.note) : null
        return (
          <div className="prior-q-row">
            <div className="prior-q-header">
              <span className="prior-q-label">Last Q · {le.quarter}</span>
              {yoy && <span className="yoy-badge" style={{ color: yoy.startsWith('+') ? "var(--green)" : "var(--red)" }}>{yoy} YoY</span>}
            </div>
            <div className="prior-q-grid">
              <span className="pq-item">EPS <b>${le.eps_actual.toFixed(2)}</b> <span className="pq-vs">vs ${le.eps_est.toFixed(2)}</span></span>
              <span className={`pq-beat ${epsBeat ? "pq-beat-pos" : "pq-beat-neg"}`}>{epsPct >= 0 ? "+" : ""}{epsPct.toFixed(1)}%</span>
              <span className="pq-item">Rev <b>{fmtBil(le.rev_actual_b)}</b> <span className="pq-vs">vs {fmtBil(le.rev_est_b)}</span></span>
              <span className={`pq-beat ${revBeat ? "pq-beat-pos" : "pq-beat-neg"}`}>{revPct >= 0 ? "+" : ""}{revPct.toFixed(1)}%</span>
            </div>
          </div>
        )
      })()}

      {/* Streak + insider + political */}
      <div className="streak-row">
        <span className="streak-label">4Q streak</span>
        <div className="streak-dots">
          {company.streak.map((s, i) => (
            <div key={i} className="streak-dot" style={{ background: s.eps === "beat" ? "var(--green)" : s.eps === "miss" ? "var(--red)" : "var(--amber)" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <span className={`insider-pill ${company.insider === "buy" ? "insider-buy" : company.insider === "sell" ? "insider-sell" : "insider-neutral"}`} style={{ marginLeft: 0 }}>
            {company.insider === "buy" ? "🟢 Ins." : company.insider === "sell" ? "🔴 Ins." : "⚪ Ins."}
          </span>
          {company.political_signal !== "neutral" && (
            <span className={`political-pill ${company.political_signal === "buy" ? "political-buy" : "political-sell"}`}>
              {company.political_signal === "buy" ? "🏛 Buy" : "🏛 Sell"}
            </span>
          )}
        </div>
      </div>

      {/* Health bar + conviction */}
      <div className="score-section">
        <div className="score-labels">
          <span className="score-health-label">Health <b style={{ color: scoreColor(company.health) }}>{company.health}</b></span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Score <b style={{ color: "var(--accent)" }}>{conviction}</b></span>
            <span className="score-prob" style={{ color: probColor }}>{company.prob_up}% ↑</span>
          </span>
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
  const le: LastEarningsResult = company.last_earnings
  const epsBeatPct  = ((le.eps_actual - le.eps_est) / Math.abs(le.eps_est)) * 100
  const revBeatPct  = ((le.rev_actual_b - le.rev_est_b) / Math.abs(le.rev_est_b)) * 100
  const epsColor    = epsBeatPct >= 0 ? "var(--green)" : "var(--red)"
  const revColor    = revBeatPct >= 0 ? "var(--green)" : "var(--red)"
  return (
    <div>
      {/* Most-recent actual results card */}
      <div className="last-earnings-card">
        <div className="last-earnings-header">
          <span className="last-earnings-label">Last Reported: {le.quarter}</span>
          <span className="last-earnings-date">{le.report_date}</span>
        </div>
        <div className="last-earnings-grid">
          {/* EPS block */}
          <div className="last-earnings-block">
            <div className="le-metric-title">EPS</div>
            <div className="le-row">
              <span className="le-key">Actual</span>
              <span className="le-actual">${le.eps_actual.toFixed(2)}</span>
            </div>
            <div className="le-row">
              <span className="le-key">Consensus</span>
              <span className="le-est">${le.eps_est.toFixed(2)}</span>
            </div>
            <div className="le-beat-pill" style={{ background: epsBeatPct >= 0 ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)", color: epsColor, border: `1px solid ${epsBeatPct >= 0 ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}` }}>
              {epsBeatPct >= 0 ? "▲" : "▼"} {epsBeatPct >= 0 ? "+" : ""}{epsBeatPct.toFixed(1)}% vs est
            </div>
          </div>
          {/* Revenue block */}
          <div className="last-earnings-block">
            <div className="le-metric-title">Revenue</div>
            <div className="le-row">
              <span className="le-key">Actual</span>
              <span className="le-actual">{fmtBil(le.rev_actual_b)}</span>
            </div>
            <div className="le-row">
              <span className="le-key">Consensus</span>
              <span className="le-est">{fmtBil(le.rev_est_b)}</span>
            </div>
            <div className="le-beat-pill" style={{ background: revBeatPct >= 0 ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)", color: revColor, border: `1px solid ${revBeatPct >= 0 ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}` }}>
              {revBeatPct >= 0 ? "▲" : "▼"} {revBeatPct >= 0 ? "+" : ""}{revBeatPct.toFixed(1)}% vs est
            </div>
          </div>
        </div>
        {le.note && (
          <div className="le-note">ⓘ {le.note}</div>
        )}
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
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

      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>4-Quarter Trend</div>
      <table className="data-table">
        <thead><tr><th>Quarter</th><th>EPS Result</th><th>Revenue Result</th><th>EPS Surprise</th></tr></thead>
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
      <p className="section-sub">Financial metrics by category. 0–10 scale, feeds into the predictive model.</p>
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
                  <td><div className="score-ring" style={{ background: f.score >= 7 ? "rgba(34,197,94,.15)" : f.score >= 4 ? "rgba(245,158,11,.15)" : "rgba(239,68,68,.15)", color: f.score >= 7 ? "var(--green)" : f.score >= 4 ? "var(--amber)" : "var(--red)" }}>{f.score}</div></td>
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
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Altman Z-Score</div>
          <div className="stat-box-val" style={{ color: company.altman_z >= 3 ? "var(--green)" : company.altman_z >= 1.8 ? "var(--amber)" : "var(--red)" }}>{company.altman_z}</div>
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
        {company.insider_trades.length === 0
          ? <div className="empty">No insider transactions in last 180 days</div>
          : <table className="data-table">
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
        }
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Congressional Trading (STOCK Act Disclosures)</div>
        {company.political_trades.length === 0
          ? <div className="empty">No congressional trades disclosed in last 90 days</div>
          : <>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Chamber</th><th>Party</th><th>Committee</th><th>Type</th><th>Amount Range</th></tr></thead>
                <tbody>
                  {company.political_trades.map((t: PoliticianTrade, i: number) => (
                    <tr key={i}>
                      <td>{t.date}{t.filed_days_late ? <span style={{ color: "var(--amber)", fontSize: 10, marginLeft: 4 }}>+{t.filed_days_late}d late</span> : null}</td>
                      <td style={{ color: "var(--muted)" }}>{t.chamber}</td>
                      <td><span style={{ fontWeight: 700, color: t.party === "D" ? "#3b82f6" : t.party === "R" ? "#ef4444" : "var(--muted)" }}>{t.party === "D" ? "Dem." : t.party === "R" ? "Rep." : "Ind."}</span></td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{t.committee ?? "—"}</td>
                      <td style={{ color: t.type === "buy" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{t.type === "buy" ? "▲ Buy" : "▼ Sell"}</td>
                      <td style={{ fontSize: 12 }}>{t.amount_range}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                Amounts are statutory disclosure ranges per STOCK Act (Periodic Transaction Reports). Filed within 45 days of trade. Member identities anonymized.
              </div>
            </>
        }
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Institutional Holdings (13F)</div>
        {company.institutional.length === 0
          ? <div className="empty">No recent 13F changes</div>
          : <table className="data-table">
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
        }
      </div>
      <div className="stat-box">
        <div className="stat-box-label">Short Interest % of Float</div>
        <div className="stat-box-val" style={{ color: company.short_interest > 15 ? "var(--red)" : company.short_interest > 8 ? "var(--amber)" : "var(--green)" }}>{company.short_interest}%</div>
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
          {company.short_interest > 15 ? "High — elevated short squeeze risk" : company.short_interest > 8 ? "Elevated" : "Normal range"}
        </div>
      </div>
    </div>
  )
}

function PredictiveModelTab({ company, weights, setWeights }: { company: Company; weights: ModelWeights; setWeights: (w: ModelWeights) => void }) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const avgFinScore = company.financials.length ? company.financials.reduce((a, f) => a + f.score, 0) / company.financials.length : 5
  const rawScore = (
    (avgFinScore * (weights.fundamentalHealth / 100)) +
    (Math.min(company.piotroski / 9 * 10, 10) * (weights.earningsQuality / 100)) +
    ((company.insider === "buy" ? 8 : company.insider === "sell" ? 3 : 5) * (weights.insiderActivity / 100)) +
    ((company.guidance_accuracy / 10) * (weights.estimateMomentum / 100)) +
    (avgFinScore * (weights.valuation / 100)) +
    ((company.short_interest < 8 ? 8 : company.short_interest > 15 ? 3 : 5) * (weights.institutionalFlow / 100)) +
    (5 * (weights.technicalMomentum / 100)) + (5 * (weights.sentiment / 100)) +
    ((company.political_signal === "buy" ? 8 : company.political_signal === "sell" ? 3 : 5) * (weights.politicalActivity / 100))
  ) * (100 / totalWeight) * 10
  const adjustedProb = Math.round(Math.min(Math.max(1 / (1 + Math.exp(-0.8 * (rawScore - 5))) * 100, 10), 90))
  return (
    <div>
      <p className="section-sub">Adjust weights to change the probability model. Normalized automatically.</p>
      <div className="weight-grid">
        {(Object.keys(weights) as Array<keyof ModelWeights>).map(key => (
          <div key={key} className="weight-row">
            <span className="weight-label">{WEIGHT_LABELS[key]}</span>
            <input className="weight-slider" type="range" min="0" max="40" value={weights[key]} onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })} />
            <span className="weight-val">{weights[key]}%</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Total: {totalWeight} (normalized in calculation)</div>
      <div className="prob-display">
        <div style={{ display: "flex", justifyContent: "center", gap: 40 }}>
          <div><div className="prob-up-val">{adjustedProb}%</div><div className="prob-label">↑ Probability Up</div></div>
          <div><div className="prob-dn-val">{100 - adjustedProb}%</div><div className="prob-label">↓ Probability Down</div></div>
        </div>
        <div className="prob-bar-wrap"><div className="prob-bar-inner" style={{ width: `${adjustedProb}%` }} /></div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Rules-based weighted model · Live weight adjustment active</div>
      </div>
      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="stat-box"><div className="stat-box-label">Model Score</div><div className="stat-box-val" style={{ color: scoreColor(rawScore * 10) }}>{rawScore.toFixed(1)} / 10</div></div>
        <div className="stat-box"><div className="stat-box-label">Confidence</div><div className="stat-box-val" style={{ color: "var(--amber)" }}>{Math.abs(adjustedProb - 50) > 20 ? "High" : Math.abs(adjustedProb - 50) > 10 ? "Medium" : "Low"}</div></div>
      </div>
    </div>
  )
}

function NewsSentimentTab({ company }: { company: Company }) {
  return (
    <div>
      <p className="section-sub">Recent news scored by NLP sentiment analysis.</p>
      {company.news.length === 0 ? <div className="empty">No news available</div>
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

const RISK_LABELS = ["Very Low", "Low", "Moderate", "High", "Very High"]

function OptionsTab({ company, livePrice }: { company: Company; livePrice?: number }) {
  const price = livePrice ?? company.current_price
  const rec = getOptionStrategy(company, livePrice)
  const biasColor = rec.bias === "Bullish" ? "var(--green)" : rec.bias === "Bearish" ? "var(--red)" : rec.bias === "Skip" ? "var(--muted)" : "var(--amber)"
  const biasIcon  = rec.bias === "Bullish" ? "↑" : rec.bias === "Bearish" ? "↓" : rec.bias === "Skip" ? "—" : "↔"
  return (
    <div>
      <p className="section-sub">Optimal options strategy derived from the predictive model, implied volatility, and insider signals.</p>
      <div className="opt-strategy-box">
        <div>
          <div className="opt-strategy-name">{rec.strategy}</div>
          <div className="opt-strategy-meta">
            <span style={{ color: biasColor, fontWeight: 700 }}>{biasIcon} {rec.bias}</span>
            <span style={{ color: "var(--muted)" }}>·</span>
            <span style={{ color: "var(--muted)" }}>{rec.expiry}</span>
          </div>
        </div>
        {!rec.skip && <div className="opt-prob-badge"><div style={{ fontSize: 22, fontWeight: 900, color: biasColor }}>{rec.probProfit}%</div><div style={{ fontSize: 11, color: "var(--muted)" }}>Est. Prob Profit</div></div>}
      </div>
      <div className="opt-price-row">
        <span>Current Price</span>
        <span style={{ fontWeight: 800, fontSize: 16 }}>${price.toFixed(2)}{livePrice && <span className="live-dot" style={{ marginLeft: 6 }}>● Live</span>}</span>
      </div>
      {rec.skip ? (
        <div className="opt-skip-box">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No Trade Recommended</div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>{rec.skipReason}</div>
          <div style={{ fontSize: 13, marginTop: 10 }}>{rec.rationale}</div>
        </div>
      ) : (
        <>
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
          <div className="two-col" style={{ marginBottom: 14 }}>
            <div className="stat-box"><div className="stat-box-label">Max Profit</div><div style={{ color: "var(--green)", fontWeight: 700, fontSize: 13, marginTop: 4 }}>{rec.maxProfit}</div></div>
            <div className="stat-box"><div className="stat-box-label">Max Loss</div><div style={{ color: "var(--red)", fontWeight: 700, fontSize: 13, marginTop: 4 }}>{rec.maxLoss}</div></div>
          </div>
          {rec.breakevens.length > 0 && (
            <div className="stat-box" style={{ marginBottom: 14 }}>
              <div className="stat-box-label">Breakeven{rec.breakevens.length > 1 ? "s" : ""} at Expiry</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{rec.breakevens.map(b => `$${b}`).join("  /  ")}</div>
              {rec.breakevens.length === 2 && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Profit zone: ${rec.breakevens[0]} – ${rec.breakevens[1]}</div>}
            </div>
          )}
          <div className="stat-box" style={{ marginBottom: 14 }}>
            <div className="stat-box-label">Risk Level</div>
            <div className="opt-risk-row">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="opt-risk-dot" style={{ background: i <= rec.riskRating ? (rec.riskRating <= 2 ? "var(--green)" : rec.riskRating === 3 ? "var(--amber)" : "var(--red)") : "var(--panel3)" }} />
              ))}
              <span style={{ marginLeft: 8, fontWeight: 700 }}>{RISK_LABELS[rec.riskRating - 1]}</span>
            </div>
          </div>
        </>
      )}
      <div className="stat-box" style={{ marginBottom: 14 }}>
        <div className="stat-box-label">Signal Inputs</div>
        <div className="opt-signals">
          {[
            ["Prob Up", `${company.prob_up}%`, company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)"],
            ["Implied Move", `±${company.implied_move}%`, "var(--amber)"],
            ["Health Score", `${company.health}/100`, scoreColor(company.health)],
            ["Insider", company.insider === "buy" ? "▲ Buy" : company.insider === "sell" ? "▼ Sell" : "Neutral", company.insider === "buy" ? "var(--green)" : company.insider === "sell" ? "var(--red)" : "var(--muted)"],
            ["Political (Congress)", company.political_signal === "buy" ? "▲ Buy" : company.political_signal === "sell" ? "▼ Sell" : "Neutral", company.political_signal === "buy" ? "var(--green)" : company.political_signal === "sell" ? "var(--red)" : "var(--muted)"],
            ["EPS Trend", company.eps_est_trend === "rising" ? "↑ Rising" : company.eps_est_trend === "falling" ? "↓ Falling" : "→ Flat", "var(--text)"],
          ].map(([label, val, color]) => (
            <div key={label as string} className="opt-signal-row">
              <span>{label}</span><span style={{ color: color as string, fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="stat-box" style={{ marginBottom: 14 }}>
        <div className="stat-box-label">Why This Strategy</div>
        <div style={{ fontSize: 13, lineHeight: 1.75, marginTop: 4 }}>{rec.rationale}</div>
      </div>
      <div className="opt-disclaimer">⚠ Educational purposes only — not financial advice. Options involve significant risk including loss of entire premium. Verify strikes and expiries with your broker before trading.</div>
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
              <div style={{ fontSize: 20, fontWeight: 800, margin: "4px 0 2px" }}>
                ${price.toFixed(2)}{livePrice && <span className="live-dot" style={{ fontSize: 12, marginLeft: 8 }}>● Live</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                📅 Reports <b style={{ color: "var(--text)" }}>{company.day}</b>
                <span className={`timing-pill ${company.time === "BMO" ? "timing-bmo" : "timing-amc"}`} style={{ marginLeft: 8 }}>
                  {company.time === "BMO" ? "Before Open" : "After Close"}
                </span>
              </div>
              <div className="drawer-meta">
                <span className="chip sector">{company.sector}</span>
                <span className="chip">{company.industry}</span>
                <span className="chip" style={{ fontSize: 10, opacity: 0.8 }}>{company.subsector}</span>
                <span className="chip">{company.cap}</span>
                <VBadge status={company.verification} />
              </div>
            </div>
            <button className="close-btn" onClick={onClose}>✕ Close</button>
          </div>
          <div className="kpi-row">
            <div className="kpi-box"><div className="kpi-label">EPS Estimate</div><div className="kpi-val">${company.eps_est}</div></div>
            <div className="kpi-box"><div className="kpi-label">Revenue Estimate</div><div className="kpi-val">{company.rev_est}</div></div>
            <div className="kpi-box"><div className="kpi-label">Health Score</div><div className="kpi-val" style={{ color: scoreColor(company.health) }}>{company.health}</div></div>
            <div className="kpi-box"><div className="kpi-label">Prob. Up</div><div className="kpi-val" style={{ color: company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)" }}>{company.prob_up}%</div></div>
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

// ── Summary Page ───────────────────────────────────────────────────────────────
function SummaryPage({ data }: { data: Company[] }) {
  // Sector → industry → subsector → companies
  type SectorMap = Record<string, Record<string, Record<string, Company[]>>>
  const tree = useMemo<SectorMap>(() => {
    const t: SectorMap = {}
    for (const co of data) {
      if (!t[co.sector])                         t[co.sector] = {}
      if (!t[co.sector][co.industry])            t[co.sector][co.industry] = {}
      if (!t[co.sector][co.industry][co.subsector]) t[co.sector][co.industry][co.subsector] = []
      t[co.sector][co.industry][co.subsector].push(co)
    }
    return t
  }, [data])

  // Day-by-day schedule
  const byDay = useMemo(() => {
    const m: Record<string, Company[]> = {}
    for (const co of data) {
      if (!m[co.reporting_date]) m[co.reporting_date] = []
      m[co.reporting_date].push(co)
    }
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
  }, [data])

  const bmoCount = data.filter(d => d.time === "BMO").length
  const amcCount = data.filter(d => d.time === "AMC").length
  const sectorCount = Object.keys(tree).length

  return (
    <div>
      <div className="topbar-left" style={{ marginBottom: 20 }}>
        <h1>Earnings Period Summary</h1>
        <p>{data.length} companies reporting this period across {sectorCount} sectors</p>
      </div>

      {/* Hero stats */}
      <div className="summary-hero">
        <div className="summary-stat"><div className="summary-stat-val">{data.length}</div><div className="summary-stat-lbl">Companies Reporting</div></div>
        <div className="summary-stat"><div className="summary-stat-val">{sectorCount}</div><div className="summary-stat-lbl">Sectors</div></div>
        <div className="summary-stat"><div className="summary-stat-val" style={{ color: "var(--teal)" }}>{bmoCount}</div><div className="summary-stat-lbl">Before Open (BMO)</div></div>
        <div className="summary-stat"><div className="summary-stat-val" style={{ color: "var(--purple)" }}>{amcCount}</div><div className="summary-stat-lbl">After Close (AMC)</div></div>
        <div className="summary-stat"><div className="summary-stat-val" style={{ color: "var(--green)" }}>{data.filter(d => d.week === "current").length}</div><div className="summary-stat-lbl">This Week</div></div>
        <div className="summary-stat"><div className="summary-stat-val" style={{ color: "var(--accent)" }}>{data.filter(d => d.week === "next").length}</div><div className="summary-stat-lbl">Next Week</div></div>
      </div>

      {/* Day-by-day schedule */}
      <div style={{ marginBottom: 28 }}>
        <div className="summary-section-title">📅 Reporting Schedule</div>
        <div className="day-schedule">
          {byDay.map(([date, cos]) => (
            <div key={date} className="day-col">
              <div className="day-col-header">
                <div className="day-col-date">{cos[0].day.split(" ").slice(0, 2).join(" ")}</div>
                <div className="day-col-count">{cos.length}</div>
              </div>
              {cos.map(co => (
                <div key={co.ticker} className="day-co-row">
                  <span className="day-co-ticker">{co.ticker}</span>
                  <span className={`timing-pill-sm ${co.time === "BMO" ? "timing-bmo" : "timing-amc"}`}>{co.time}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Sector → Industry → Subsector tree */}
      <div style={{ marginBottom: 28 }}>
        <div className="summary-section-title">🏭 By Sector, Industry & Subsector</div>
        {Object.entries(tree).sort(([,a],[,b]) => {
          const countA = Object.values(a).flatMap(x => Object.values(x)).flat().length
          const countB = Object.values(b).flatMap(x => Object.values(x)).flat().length
          return countB - countA
        }).map(([sector, industries]) => {
          const totalInSector = Object.values(industries).flatMap(x => Object.values(x)).flat().length
          const color = SECTOR_COLORS[sector] ?? "#3b82f6"
          return (
            <div key={sector} className="sector-tree-card" style={{ borderLeftColor: color }}>
              <div className="sector-tree-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="sector-tree-name">{sector}</div>
                  <div className="sector-tree-count">{totalInSector} {totalInSector === 1 ? "company" : "companies"}</div>
                </div>
                <div className="sector-tree-bar-wrap">
                  <div className="sector-tree-bar" style={{ width: `${(totalInSector / data.length) * 100}%`, background: color }} />
                </div>
              </div>
              {Object.entries(industries).map(([industry, subsectors]) => {
                const totalInIndustry = Object.values(subsectors).flat().length
                return (
                  <div key={industry} className="industry-row">
                    <div className="industry-row-header">
                      <span className="industry-name">{industry}</span>
                      <span className="industry-count">{totalInIndustry}</span>
                    </div>
                    {Object.entries(subsectors).map(([subsector, cos]) => (
                      <div key={subsector} className="subsector-row">
                        <span className="subsector-name">{subsector}</span>
                        <div className="subsector-tickers">
                          {cos.map(co => (
                            <span key={co.ticker} className="subsector-ticker" style={{ borderColor: color, color: color }}>
                              {co.ticker}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* BMO vs AMC breakdown */}
      <div style={{ marginBottom: 28 }}>
        <div className="summary-section-title">⏰ Pre-Market vs After-Hours</div>
        <div className="two-col">
          <div className="stat-box" style={{ borderColor: "rgba(45,212,191,.3)" }}>
            <div className="stat-box-label" style={{ color: "var(--teal)" }}>Before Market Open (BMO)</div>
            <div className="stat-box-val" style={{ color: "var(--teal)" }}>{bmoCount}</div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.filter(d => d.time === "BMO").map(co => (
                <span key={co.ticker} className="chip">{co.ticker} · {fmt(co.reporting_date)}</span>
              ))}
            </div>
          </div>
          <div className="stat-box" style={{ borderColor: "rgba(167,139,250,.3)" }}>
            <div className="stat-box-label" style={{ color: "var(--purple)" }}>After Market Close (AMC)</div>
            <div className="stat-box-val" style={{ color: "var(--purple)" }}>{amcCount}</div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.filter(d => d.time === "AMC").map(co => (
                <span key={co.ticker} className="chip">{co.ticker} · {fmt(co.reporting_date)}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Go Live Page ────────────────────────────────────────────────────────────────
function GoLivePage({
  finnhubKey, setFinnhubKey, liveMode, setLiveMode,
  quoteCount, quoteFetchedAt, fetchLiveQuotes, fetching,
}: {
  finnhubKey: string; setFinnhubKey: (k: string) => void;
  liveMode: boolean; setLiveMode: (v: boolean) => void;
  quoteCount: number; quoteFetchedAt: Date | null; fetchLiveQuotes: () => void; fetching: boolean;
}) {
  const [showKey, setShowKey] = useState(false)
  const [savedKey, setSavedKey] = useState(finnhubKey)

  function saveKey() { localStorage.setItem("finnhubKey", savedKey); setFinnhubKey(savedKey) }
  function toggleLive() { const n = !liveMode; localStorage.setItem("liveMode", String(n)); setLiveMode(n) }

  return (
    <div>
      <div className="topbar-left" style={{ marginBottom: 24 }}>
        <h1>Go Live — Real Data Setup</h1>
        <p>Switch from demo data to live market data in two ways: quick browser-based quotes, or the full Python pipeline.</p>
      </div>

      <div className="stat-box" style={{ marginBottom: 16, borderColor: liveMode ? "rgba(34,197,94,.4)" : "var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Option 1 — Live Quotes (Browser, No Setup) <span style={{ marginLeft: 8, fontSize: 11, background: "rgba(59,130,246,.15)", color: "var(--accent)", padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>Recommended</span></div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>Fetches current prices via Finnhub. Auto-refreshes every 5 min.</div>
          </div>
          <button className={`live-toggle-btn ${liveMode ? "live-on" : "live-off"}`} onClick={toggleLive}>{liveMode ? "● Live ON" : "○ Go Live"}</button>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Finnhub API Key</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="search-input" style={{ flex: 1 }} type={showKey ? "text" : "password"} placeholder="Paste your Finnhub API key here…" value={savedKey} onChange={e => setSavedKey(e.target.value)} />
            <button className="week-btn" style={{ padding: "8px 12px" }} onClick={() => setShowKey(!showKey)}>{showKey ? "Hide" : "Show"}</button>
            <button className="card-link-btn" onClick={saveKey} disabled={!savedKey}>Save</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>Stored in browser localStorage only. Get free key at <span style={{ color: "var(--accent)" }}>finnhub.io/dashboard</span></div>
        </div>
        {finnhubKey && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button className="card-link-btn" onClick={fetchLiveQuotes} disabled={fetching}>{fetching ? "Fetching…" : "Refresh Quotes Now"}</button>
            {quoteFetchedAt && <span style={{ fontSize: 12, color: "var(--muted)" }}>Last updated: {quoteFetchedAt.toLocaleTimeString()} · {quoteCount} quotes</span>}
          </div>
        )}
        {liveMode && !finnhubKey && <div style={{ color: "var(--amber)", fontSize: 13, marginTop: 8 }}>⚠ Enter and save a Finnhub API key first.</div>}
      </div>

      <div className="stat-box" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Option 2 — Full Data Pipeline (Python)</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 14 }}>Populates earnings.json with real data — dates, estimates, financials, insider, news. Run weekly.</div>
        {[
          { step: "1", title: "Get API Keys (all free tiers)", content: <div style={{ fontSize: 13, lineHeight: 1.8 }}><div>• <b>Finnhub</b>: <span style={{ color: "var(--accent)" }}>finnhub.io</span> → Register → Dashboard</div><div>• <b>FMP</b>: <span style={{ color: "var(--accent)" }}>financialmodelingprep.com/developer</span></div><div>• <b>Alpha Vantage</b>: <span style={{ color: "var(--accent)" }}>alphavantage.co/support/#api-key</span></div></div> },
          { step: "2", title: "Install Python dependencies", content: <div><div className="code-block">pip install -r requirements.txt</div></div> },
          { step: "3", title: "Configure API keys", content: <div><div className="code-block">{"cp .env.example .env\n# Edit .env:\nFINNHUB_API_KEY=your_key\nFMP_API_KEY=your_key\nALPHAVANTAGE_KEY=your_key"}</div></div> },
          { step: "4", title: "Run the data pipeline", content: <div><div className="code-block">python scripts/refresh_all.py</div><div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Fetches calendar → fundamentals → insider → news → writes earnings.json. ~2–3 min.</div></div> },
          { step: "5", title: "Rebuild and push", content: <div><div className="code-block">{"npm run build\ngit add .\ngit commit -m \"refresh earnings data\"\ngit push"}</div></div> },
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

      <div className="stat-box">
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Option 3 — GitHub Actions Auto-Refresh</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>Schedule weekly auto-refresh via CI — zero manual steps after setup.</div>
        <div className="code-block" style={{ fontSize: 11, lineHeight: 1.7 }}>
          {`name: Refresh Earnings Data
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday 6am UTC
  workflow_dispatch:

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
          git commit -m "auto: refresh \$(date +%Y-%m-%d)" || exit 0
          git push`}
        </div>
      </div>
    </div>
  )
}

// ── Meta type ─────────────────────────────────────────────────────────────────
interface EarningsMeta {
  lastUpdated: string
  nextUpdate:  string
  source:      string
  companies:   number
  window:      string
}

// ── Day Schedule View ─────────────────────────────────────────────────────────
function DayScheduleView({
  data, liveQuotes, onSelect, ranked,
}: {
  data: Company[], liveQuotes: Record<string, number>,
  onSelect: (c: Company) => void, ranked: (Company & { _conviction: number })[],
}) {
  // Group companies by reporting_date
  const byDate = useMemo(() => {
    const map: Record<string, Company[]> = {}
    for (const co of data) {
      if (!map[co.reporting_date]) map[co.reporting_date] = []
      map[co.reporting_date].push(co)
    }
    return map
  }, [data])

  const sortedDates = useMemo(() => Object.keys(byDate).sort(), [byDate])

  // Split into week groups by 'week' field
  const currentDates = sortedDates.filter(d => byDate[d].some(c => c.week === 'current'))
  const nextDates    = sortedDates.filter(d => byDate[d].some(c => c.week === 'next'))

  const fmtDateHeader = (iso: string) => {
    const d = new Date(iso + 'T12:00:00Z')
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${DAYS[d.getUTCDay()]}, ${MONS[d.getUTCMonth()]} ${d.getUTCDate()}`
  }

  const fmtWeekRange = (dates: string[]) => {
    if (!dates.length) return ''
    const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const a = new Date(dates[0] + 'T12:00:00Z')
    const b = new Date(dates[dates.length - 1] + 'T12:00:00Z')
    if (a.getUTCMonth() === b.getUTCMonth())
      return `${MONS[a.getUTCMonth()]} ${a.getUTCDate()}–${b.getUTCDate()}`
    return `${MONS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONS[b.getUTCMonth()]} ${b.getUTCDate()}`
  }

  const convictionOf = (co: Company) => ranked.find(r => r.ticker === co.ticker)?._conviction ?? 0

  const DayColumn = ({ date }: { date: string }) => {
    const all = (byDate[date] || []).slice().sort((a, b) => convictionOf(b) - convictionOf(a))
    const bmo = all.filter(c => c.time === 'BMO')
    const amc = all.filter(c => c.time === 'AMC')

    const CompanyRow = ({ co }: { co: Company }) => {
      const score = convictionOf(co)
      const price = liveQuotes[co.ticker] ?? co.current_price
      const scoreCol = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)'
      return (
        <div className="day-company-row" onClick={() => onSelect(co)}>
          <div className="day-co-left">
            <span className="day-co-ticker">{co.ticker}</span>
            <span className="day-co-name">{co.name.split(' ').slice(0, 2).join(' ')}</span>
          </div>
          <div className="day-co-right">
            <span className="day-co-score" style={{ color: scoreCol }}>{score}</span>
            <span className="day-co-eps">EPS ${co.eps_est.toFixed(2)}</span>
            <span className="day-co-move">±{co.implied_move}%</span>
            {price > 0 && <span className="day-co-price">${price < 10 ? price.toFixed(2) : price.toFixed(0)}</span>}
          </div>
        </div>
      )
    }

    return (
      <div className="day-column">
        <div className="day-column-header">
          <span className="day-header-date">{fmtDateHeader(date)}</span>
          <span className="day-header-count">{all.length} co.</span>
        </div>
        {bmo.length > 0 && (
          <div className="day-timing-block">
            <div className="day-timing-label bmo-label">☀ BMO</div>
            {bmo.map(co => <CompanyRow key={co.ticker} co={co} />)}
          </div>
        )}
        {amc.length > 0 && (
          <div className="day-timing-block">
            <div className="day-timing-label amc-label">🌙 AMC</div>
            {amc.map(co => <CompanyRow key={co.ticker} co={co} />)}
          </div>
        )}
      </div>
    )
  }

  const WeekGroup = ({ dates, label }: { dates: string[], label: string }) => {
    if (!dates.length) return null
    return (
      <div className="day-week-group">
        <div className="day-week-header">
          <span className="day-week-title">{label}</span>
          <span className="day-week-count">{dates.reduce((n, d) => n + (byDate[d]?.length ?? 0), 0)} companies</span>
        </div>
        <div className="day-columns-row">
          {dates.map(d => <DayColumn key={d} date={d} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="day-schedule-view">
      <WeekGroup dates={currentDates} label={`📅 Current Week  ${fmtWeekRange(currentDates)}`} />
      <WeekGroup dates={nextDates}    label={`📅 Next Week & Upcoming  ${fmtWeekRange(nextDates)}`} />
      {data.length === 0 && <div className="empty" style={{ marginTop: 60 }}>No earnings data loaded.</div>}
    </div>
  )
}

// ── Dynamic section title helpers ─────────────────────────────────────────────
function dateRangeLabel(companies: Company[]): string {
  if (!companies.length) return ''
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dates = companies.map(c => c.reporting_date).sort()
  const a = new Date(dates[0] + 'T12:00:00Z')
  const b = new Date(dates[dates.length - 1] + 'T12:00:00Z')
  if (a.toDateString() === b.toDateString())
    return `${MONS[a.getUTCMonth()]} ${a.getUTCDate()}`
  if (a.getUTCMonth() === b.getUTCMonth())
    return `${MONS[a.getUTCMonth()]} ${a.getUTCDate()}–${b.getUTCDate()}`
  return `${MONS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONS[b.getUTCMonth()]} ${b.getUTCDate()}`
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState<Company[]>([])
  const [meta, setMeta] = useState<EarningsMeta | null>(null)
  const [selected, setSelected] = useState<Company | null>(null)
  const [week, setWeek] = useState<"both" | "current" | "next">("both")
  const [sector, setSector] = useState("All")
  const [cap, setCap] = useState("All")
  const [timing, setTiming] = useState("All")
  const [search, setSearch] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [activeNav, setActiveNav] = useState("dashboard")
  const [viewMode, setViewMode] = useState<"cards" | "by-day">("cards")

  const [finnhubKey, setFinnhubKey] = useState<string>(() => localStorage.getItem("finnhubKey") || "")
  const [liveMode, setLiveMode] = useState<boolean>(() => localStorage.getItem("liveMode") === "true")
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({})
  const [quoteFetchedAt, setQuoteFetchedAt] = useState<Date | null>(null)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/earnings.json").then(r => r.json()).then(setData)
    fetch(import.meta.env.BASE_URL + "data/meta.json").then(r => r.json()).then(setMeta).catch(() => {})
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
      } catch { /* skip */ }
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

  // Dynamically classify each company's week based on today's calendar date,
  // overriding whatever week field the JSON has hardcoded.
  const classifiedData = useMemo(() => {
    if (!data.length) return data
    const today = new Date().toISOString().slice(0, 10)
    const allDates = [...new Set(data.map(c => c.reporting_date))].sort()
    const upcoming = allDates.filter(d => d >= today)
    const firstDate = upcoming[0] ?? allDates[0]
    const [monStr, friStr] = getCalendarWeekBounds(firstDate)
    return data.map(c => ({
      ...c,
      week: (c.reporting_date >= monStr && c.reporting_date <= friStr ? 'current' : 'next') as 'current' | 'next'
    }))
  }, [data])

  const sectors = useMemo(() => ["All", ...Array.from(new Set(classifiedData.map(d => d.sector))).sort()], [classifiedData])

  // Filter, then sort by conviction score, then rank
  const ranked = useMemo(() => {
    const filtered = classifiedData.filter(item => {
      const wMatch = week === "both" ? true : item.week === week
      const sMatch = sector === "All" || item.sector === sector
      const cMatch = cap === "All" || item.cap === cap
      const tMatch = timing === "All" || item.time === timing
      const qMatch = !search || item.ticker.toLowerCase().includes(search.toLowerCase()) || item.name.toLowerCase().includes(search.toLowerCase())
      return wMatch && sMatch && cMatch && tMatch && qMatch
    })
    return filtered
      .map(co => ({ ...co, _conviction: getConvictionScore(co) }))
      .sort((a, b) => b._conviction - a._conviction)
  }, [classifiedData, week, sector, cap, timing, search])

  const displayed = showAll ? ranked : ranked.slice(0, 20)
  const currentWeek = displayed.filter(x => x.week === "current")
  const nextWeek    = displayed.filter(x => x.week === "next")
  const liveCount   = Object.keys(liveQuotes).length

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">📊</div>
          Earnings Tracker
        </div>
        <div className="nav-section">Views</div>
        {([
          ["dashboard", "📅", "Dashboard"],
          ["by-day",    "🗓",  "By Day"],
          ["summary",   "📊", "Period Summary"],
          ["model",     "⚙️", "Model Studio"],
          ["backtest",  "🔬", "Backtesting"],
          ["smart",     "🕵️", "Smart Money"],
        ] as const).map(([key, icon, label]) => (
          <button key={key} className={`nav-item ${activeNav === key ? "active" : ""}`} onClick={() => setActiveNav(key)}>
            <span>{icon}</span> {label}
          </button>
        ))}
        <div className="nav-section">Data</div>
        <button className={`nav-item ${activeNav === "golive" ? "active" : ""}`} onClick={() => setActiveNav("golive")}>
          <span>{liveMode ? "🟢" : "⚪"}</span> {liveMode ? "Live Mode ON" : "Go Live"}
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
            <div className="ds-row"><span>Companies</span><span>{data.length}</span></div>
            {liveMode && <div className="ds-row"><span>Quotes</span><span style={{ color: "var(--green)" }}>{liveCount} live</span></div>}
            {quoteFetchedAt && <div className="ds-row" style={{ fontSize: 10 }}><span>Updated</span><span>{quoteFetchedAt.toLocaleTimeString()}</span></div>}
            {meta && (
              <>
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }} />
                <div className="ds-title" style={{ marginBottom: 4 }}>Auto-Refresh</div>
                <div className="ds-row" style={{ fontSize: 10 }}>
                  <span>Last fetch</span>
                  <span title={meta.lastUpdated}>{new Date(meta.lastUpdated).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                </div>
                <div className="ds-row" style={{ fontSize: 10 }}>
                  <span>Next Friday</span>
                  <span style={{ color: "var(--accent)" }}>{new Date(meta.nextUpdate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                </div>
                <div className="ds-row" style={{ fontSize: 10 }}>
                  <span>Window</span>
                  <span style={{ color: "var(--muted)" }}>{meta.window}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="content">
        {activeNav === "dashboard" && (
          <>
            <div className="topbar">
              <div className="topbar-left">
                <h1>Weekly Earnings Dashboard</h1>
                <p>
                  Sorted by conviction score · {ranked.length} companies found
                  {!showAll && ranked.length > 20 && ` · showing top 20`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div className="week-toggle">
                  <button className={`week-btn ${viewMode === "cards" ? "active" : ""}`} onClick={() => setViewMode("cards")}>🃏 Cards</button>
                  <button className={`week-btn ${viewMode === "by-day" ? "active" : ""}`} onClick={() => setViewMode("by-day")}>🗓 By Day</button>
                </div>
                {viewMode === "cards" && (
                  <div className="week-toggle">
                    {(["both","current","next"] as const).map(w => (
                      <button key={w} className={`week-btn ${week === w ? "active" : ""}`} onClick={() => setWeek(w)}>
                        {w === "both" ? "Both" : w === "current" ? "This Week" : "Next Week"}
                      </button>
                    ))}
                  </div>
                )}
                {viewMode === "cards" && ranked.length > 20 && (
                  <button className={`week-btn ${showAll ? "active" : ""}`} onClick={() => setShowAll(v => !v)}>
                    {showAll ? "Top 20 ▲" : "Show All ▼"}
                  </button>
                )}
              </div>
            </div>

            {viewMode === "by-day" ? (
              <DayScheduleView
                data={classifiedData}
                liveQuotes={liveQuotes}
                onSelect={setSelected}
                ranked={ranked}
              />
            ) : (
              <>
            <div className="filterbar">
              <span className="filter-label">Sector</span>
              <select className="filter-select" value={sector} onChange={e => setSector(e.target.value)}>
                {sectors.map(s => <option key={s}>{s}</option>)}
              </select>
              <span className="filter-label">Market Cap</span>
              <select className="filter-select" value={cap} onChange={e => setCap(e.target.value)}>
                {["All","Mega","Large","Mid","Small","Micro"].map(c => <option key={c}>{c}</option>)}
              </select>
              <span className="filter-label">Timing</span>
              <select className="filter-select" value={timing} onChange={e => setTiming(e.target.value)}>
                {["All","BMO","AMC"].map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="search-input" placeholder="Search ticker or company…" value={search} onChange={e => setSearch(e.target.value)} />
              <span className="filter-count">{displayed.length} shown</span>
            </div>

            {(week === "current" || week === "both") && currentWeek.length > 0 && (
              <div className="week-section">
                <div className="section-header">
                  <span className="section-title">📅 Current Week ({currentWeek[0] ? calendarWeekRange(currentWeek[0].reporting_date) : ''})</span>
                  <span className="section-count">{currentWeek.length} companies</span>
                </div>
                <div className="card-grid">
                  {currentWeek.map((c) => {
                    const globalRank = ranked.findIndex(r => r.ticker === c.ticker) + 1
                    return <CompanyCard key={c.ticker} company={c} livePrice={liveQuotes[c.ticker]} rank={globalRank} onClick={() => setSelected(c)} />
                  })}
                </div>
              </div>
            )}

            {(week === "next" || week === "both") && nextWeek.length > 0 && (
              <div className="week-section">
                <div className="section-header">
                  <span className="section-title">📅 Next Week & Upcoming ({dateRangeLabel(nextWeek)})</span>
                  <span className="section-count">{nextWeek.length} companies</span>
                </div>
                <div className="card-grid">
                  {nextWeek.map(c => {
                    const globalRank = ranked.findIndex(r => r.ticker === c.ticker) + 1
                    return <CompanyCard key={c.ticker} company={c} livePrice={liveQuotes[c.ticker]} rank={globalRank} onClick={() => setSelected(c)} />
                  })}
                </div>
              </div>
            )}

            {displayed.length === 0 && (
              <div className="empty" style={{ marginTop: 60 }}>No companies match current filters.</div>
            )}
              </>
            )}
          </>
        )}

        {activeNav === "by-day" && (
          <>
            <div className="topbar">
              <div className="topbar-left">
                <h1>By Day — Earnings Calendar</h1>
                <p>{data.length} companies · reporting dates sorted chronologically · click any company to open analysis</p>
              </div>
              {meta && (
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                  <div>Data refreshed: <span style={{ color: "var(--text)" }}>{new Date(meta.lastUpdated).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>
                  <div>Next auto-fetch: <span style={{ color: "var(--accent)" }}>Friday {new Date(meta.nextUpdate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
                </div>
              )}
            </div>
            <DayScheduleView
              data={classifiedData}
              liveQuotes={liveQuotes}
              onSelect={setSelected}
              ranked={ranked}
            />
          </>
        )}

        {activeNav === "summary" && <SummaryPage data={classifiedData} />}

        {activeNav === "golive" && (
          <GoLivePage finnhubKey={finnhubKey} setFinnhubKey={setFinnhubKey} liveMode={liveMode} setLiveMode={setLiveMode}
            quoteCount={liveCount} quoteFetchedAt={quoteFetchedAt} fetchLiveQuotes={fetchLiveQuotes} fetching={fetching} />
        )}

        {activeNav === "sources" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}><h1>Data Sources</h1><p>Two-source confirmation required before any company scores are enabled</p></div>
            {[
              { name: "SEC EDGAR", url: "data.sec.gov", type: "Government / Primary", status: "Live", desc: "Company facts, 10-K/10-Q XBRL, Form 4, 13F. Free. SEC-filed values override all vendor data.", fields: ["Financial statements","Insider trades (Form 4)","Institutional holdings (13F)","Company metadata"] },
              { name: "Finnhub", url: "finnhub.io", type: "Market Data / Calendar", status: "API Key Required", desc: "Earnings calendar, consensus estimates, real-time quotes. Free tier: 60 req/min.", fields: ["Earnings calendar","EPS & revenue estimates","News feed","Live quotes"] },
              { name: "Financial Modeling Prep", url: "financialmodelingprep.com", type: "Aggregator / Cross-Check", status: "API Key Required", desc: "Full financial statements, earnings history, estimates. Free: 250 calls/day.", fields: ["Financial statements","Earnings surprise history","Estimate revisions","Insider enrichment"] },
              { name: "Alpha Vantage", url: "alphavantage.co", type: "News Sentiment / Fallback", status: "API Key Required", desc: "News sentiment NLP, technical indicators. Free: 25 req/day.", fields: ["News + sentiment","Technical indicators","Earnings (cross-check)"] },
            ].map(s => (
              <div key={s.name} className="stat-box" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div><span className="vbadge vbadge-verified">{s.status}</span></div>
                <div style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 8px" }}>{s.url} · {s.type}</div>
                <div style={{ fontSize: 13, marginBottom: 10 }}>{s.desc}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{s.fields.map(f => <span key={f} className="chip">{f}</span>)}</div>
              </div>
            ))}
          </div>
        )}

        {activeNav === "model" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}><h1>Model Studio</h1><p>Global default weights — override per company in the Predictive Model tab</p></div>
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
            </div>
          </div>
        )}

        {activeNav === "backtest" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}><h1>Backtesting</h1><p>Walk-forward simulation — available with full price history database</p></div>
            <div className="stat-box">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Ready for live data phase</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>Connect the Python pipeline and populate historical data to activate walk-forward accuracy testing.</div>
              <div className="badge-row">
                {["Accuracy %","Bull vs Bear","Sector breakdown","Equity curve","Confusion matrix","Config comparison"].map(c => <span key={c} className="chip">{c}</span>)}
              </div>
            </div>
          </div>
        )}

        {activeNav === "smart" && (
          <div>
            <div className="topbar-left" style={{ marginBottom: 24 }}><h1>Smart Money Feed</h1><p>Aggregate insider activity across all earnings companies</p></div>
            {data.filter(d => d.insider_trades.length > 0).map(company => (
              <div key={company.ticker} className="stat-box" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{company.ticker} · {company.name}</div>
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Name</th><th>Role</th><th>Type</th><th>Value</th><th>10b5</th></tr></thead>
                  <tbody>
                    {company.insider_trades.map((t, i) => (
                      <tr key={i}>
                        <td>{t.date}</td><td>{t.name}</td><td style={{ color: "var(--muted)" }}>{t.role}</td>
                        <td style={{ color: t.type === "buy" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{t.type === "buy" ? "▲ Buy" : "▼ Sell"}</td>
                        <td>${(t.value / 1_000_000).toFixed(1)}M</td>
                        <td>{t.is_10b5 ? <span style={{ color: "var(--muted)", fontSize: 11 }}>Pre-sched.</span> : <span style={{ color: "var(--amber)", fontWeight: 700, fontSize: 11 }}>Discretionary</span>}</td>
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
            <div className="topbar-left" style={{ marginBottom: 24 }}><h1>Settings</h1><p>API keys for Python scripts. For live browser quotes, use <button className="inline-link" onClick={() => setActiveNav("golive")}>Go Live</button>.</p></div>
            {[
              { key: "FINNHUB_API_KEY", label: "Finnhub API Key", placeholder: "finnhub.io/dashboard" },
              { key: "FMP_API_KEY", label: "Financial Modeling Prep API Key", placeholder: "financialmodelingprep.com/developer" },
              { key: "ALPHAVANTAGE_KEY", label: "Alpha Vantage API Key", placeholder: "alphavantage.co/support/#api-key" },
            ].map(s => (
              <div key={s.key} className="stat-box" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{s.label}</div>
                <input className="search-input" style={{ width: "100%" }} placeholder={s.placeholder} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Set as <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>{s.key}</code> in <code style={{ background: "var(--panel3)", padding: "1px 4px", borderRadius: 3 }}>.env</code></div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selected && <CompanyDrawer company={selected} livePrice={liveQuotes[selected.ticker]} onClose={() => setSelected(null)} />}
    </div>
  )
}
