import { useEffect, useMemo, useState } from "react"
import { Company, ModelWeights } from "./types"

// ── helpers ──────────────────────────────────────────────────────────────────
function scoreColor(n: number) {
  if (n >= 70) return "var(--green)"
  if (n >= 40) return "var(--amber)"
  return "var(--red)"
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

// ── sub-components ────────────────────────────────────────────────────────────
function CompanyCard({ company, onClick }: { company: Company; onClick: () => void }) {
  const accentColor = SECTOR_COLORS[company.sector] ?? "#3b82f6"
  const probColor = company.prob_up >= 55 ? "var(--green)" : company.prob_up <= 45 ? "var(--red)" : "var(--amber)"

  return (
    <div className="card" onClick={onClick}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
      <div className="card-top">
        <div>
          <div className="ticker">{company.ticker}</div>
          <div className="co-name">{company.name}</div>
        </div>
        <span className={`timing-badge ${company.time === "BMO" ? "bmo" : "amc"}`}>{company.time}</span>
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
type TabKey = "history" | "financials" | "smart" | "model" | "news"
const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "history",    label: "Earnings History" },
  { key: "financials", label: "Financials" },
  { key: "smart",      label: "Smart Money" },
  { key: "model",      label: "Predictive Model" },
  { key: "news",       label: "News & Sentiment" },
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

// ── Drawer ─────────────────────────────────────────────────────────────────────
function CompanyDrawer({ company, onClose }: { company: Company; onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>("history")
  const [weights, setWeights] = useState<ModelWeights>(DEFAULT_WEIGHTS)
  const accentColor = SECTOR_COLORS[company.sector] ?? "#3b82f6"

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-title-row">
            <div>
              <div className="drawer-ticker" style={{ color: accentColor }}>{company.ticker}</div>
              <div className="drawer-name">{company.name}</div>
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
              <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="tab-body">
          {tab === "history"    && <EarningsHistoryTab company={company} />}
          {tab === "financials" && <FinancialsTab company={company} />}
          {tab === "smart"      && <SmartMoneyTab company={company} />}
          {tab === "model"      && <PredictiveModelTab company={company} weights={weights} setWeights={setWeights} />}
          {tab === "news"       && <NewsSentimentTab company={company} />}
        </div>
      </div>
    </>
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

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/earnings.json").then(r => r.json()).then(setData)
  }, [])

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
        <div className="nav-section">Settings</div>
        <button className={`nav-item ${activeNav === "sources" ? "active" : ""}`} onClick={() => setActiveNav("sources")}>
          <span>🔗</span> Data Sources
        </button>
        <button className={`nav-item ${activeNav === "settings" ? "active" : ""}`} onClick={() => setActiveNav("settings")}>
          <span>⚙</span> Settings
        </button>
        <div className="sidebar-footer">
          <div className="data-status">
            <div className="ds-title">Data Layer</div>
            <div className="ds-row"><span>Mode</span><span className="ds-mock">Mock / Dev</span></div>
            <div className="ds-row"><span>Earnings</span><span>{data.length} companies</span></div>
            <div className="ds-row"><span>Verified</span><span>{data.filter(d => d.verification === "verified").length} / {data.length}</span></div>
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
                  {currentWeek.map(c => <CompanyCard key={c.ticker} company={c} onClick={() => setSelected(c)} />)}
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
                  {nextWeek.map(c => <CompanyCard key={c.ticker} company={c} onClick={() => setSelected(c)} />)}
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="empty" style={{ marginTop: 60 }}>No companies match current filters.</div>
            )}
          </>
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
              <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>Open any company card → Predictive Model tab to adjust weights per company and see live probability recalculation.</div>
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
              <p>Configure API keys, refresh schedules, and display preferences</p>
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
          </div>
        )}
      </main>

      {selected && <CompanyDrawer company={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
