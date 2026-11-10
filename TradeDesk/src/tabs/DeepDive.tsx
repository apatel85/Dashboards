import { useMemo, useState } from 'react';
import { SectionHead, TvLink, Badge } from '../components/ui';
import { Fundamentals } from '../components/Fundamentals';
import { useJsonData } from '../lib/useJsonData';
import {
  fetchDeepDive,
  DeepDiveError,
  SCHWAB_AUTH_START_URL,
} from '../lib/schwabDeepDive';
import type { DeepDiveData } from '../lib/schwabDeepDive';
import { fmtDate, fmtInt, fmtCompactMoney, fmtPct } from '../lib/format';
import type { SignalsFile, EarningsEntry, NewsFile, CongressTrade } from '../types';

const QUICK_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'MU', 'SNDK', 'TSM'];

interface InsiderTrade {
  ticker: string;
  owner_name: string;
  role: string;
  transaction_code: string; // P = purchase, S = sale
  shares: number;
  price: number | null;
  transaction_date: string;
  filed_date: string | null;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  return n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtUsd(n: number | null | undefined): string {
  return n == null ? '—' : `$${fmtNum(n)}`;
}

/** Smart-money section: congress + insider trades for one ticker.
 * Loads the two big files only once a ticker is submitted. */
function SmartMoneyPanel({ ticker, flow }: {
  ticker: string;
  flow: { direction: string; flow_score: number; buy_amount: number; sell_amount: number; net_flow: number; officials: number; buy_trades: number; sell_trades: number; cluster: boolean } | null;
}) {
  const { data: congress } = useJsonData<CongressTrade[]>('congress.json');
  const { data: insiders } = useJsonData<InsiderTrade[]>('insiders.json');
  const congTrades = useMemo(() => {
    if (!congress) return [];
    return congress
      .filter((t) => (t.ticker ?? '').toUpperCase() === ticker)
      .sort((a, b) => (a.disclosed_date ?? a.tx_date) < (b.disclosed_date ?? b.tx_date) ? 1 : -1)
      .slice(0, 5);
  }, [congress, ticker]);
  const insiderTrades = useMemo(() => {
    if (!insiders) return [];
    return insiders
      .filter((t) => t.ticker.toUpperCase() === ticker)
      .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
      .slice(0, 5);
  }, [insiders, ticker]);

  return (
    <div className="panel">
      <SectionHead title="Smart money" sub="Congress, White House & insider flow for this ticker" />
      {flow ? (
        <p className="muted small plain-note">
          Disclosed flow is <b>{flow.direction}</b> (score {flow.flow_score}/100):{' '}
          {fmtCompactMoney(flow.buy_amount)} bought vs {fmtCompactMoney(flow.sell_amount)} sold
          across {flow.officials} officials, net {fmtCompactMoney(flow.net_flow)}.
          {flow.cluster ? ' Several officials bought it in the same week.' : ''}
        </p>
      ) : (
        <p className="muted small plain-note">No disclosed congressional or White House flow for this ticker in the last 90 days.</p>
      )}
      {congTrades.length > 0 && (
        <>
          <h4 className="sector-title">Recent congressional trades</h4>
          <ul className="dd-list">
            {congTrades.map((t, i) => (
              <li key={i}>
                <b>{t.member}</b> · {t.trade_type} {t.amount_range} · disclosed {fmtDate(t.disclosed_date)}
              </li>
            ))}
          </ul>
        </>
      )}
      {insiderTrades.length > 0 && (
        <>
          <h4 className="sector-title">Recent insider trades</h4>
          <ul className="dd-list">
            {insiderTrades.map((t, i) => (
              <li key={i}>
                <b>{t.owner_name}</b> ({t.role}) · {t.transaction_code === 'P' ? 'bought' : t.transaction_code === 'S' ? 'sold' : t.transaction_code}{' '}
                {fmtInt(t.shares)} shares @ {fmtUsd(t.price)} · {fmtDate(t.transaction_date)}
              </li>
            ))}
          </ul>
        </>
      )}
      {congTrades.length === 0 && insiderTrades.length === 0 && (
        <p className="muted small">No individual congressional or insider trades on file for this ticker.</p>
      )}
    </div>
  );
}

export default function DeepDiveTab() {
  const [input, setInput] = useState('');
  const [ticker, setTicker] = useState<string | null>(null);
  const [data, setData] = useState<DeepDiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DeepDiveError | null>(null);

  // Small pipeline files for the context sections (loaded once, cheap).
  const { data: signals } = useJsonData<SignalsFile>('signals.json');
  const { data: earnings } = useJsonData<EarningsEntry[]>('earnings.json');
  const { data: news } = useJsonData<NewsFile>('news.json');

  const run = async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setTicker(t);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const d = await fetchDeepDive(t);
      setData(d);
    } catch (e) {
      setError(e instanceof DeepDiveError ? e : new DeepDiveError('fetch', e instanceof Error ? e.message : 'Deep Dive failed.'));
    } finally {
      setLoading(false);
    }
  };

  const flow = useMemo(() => {
    if (!ticker || !signals) return null;
    return signals.tickers.find((s) => s.ticker.toUpperCase() === ticker) ?? null;
  }, [signals, ticker]);

  const nextEarnings = useMemo(() => {
    if (!ticker || !earnings) return null;
    const upcoming = earnings
      .filter((e) => e.ticker.toUpperCase() === ticker && e.eps_actual == null)
      .sort((a, b) => (a.reporting_date < b.reporting_date ? -1 : 1));
    return upcoming[0] ?? null;
  }, [earnings, ticker]);

  const headlines = useMemo(() => {
    if (!ticker || !news) return [];
    return news.items.filter((h) => h.ticker.toUpperCase() === ticker).slice(0, 5);
  }, [news, ticker]);

  const q = data?.quote;
  const tech = data?.technicals;
  const opt = data?.options;
  const ivVsHv = opt?.atmIv != null && tech?.hv30 != null ? opt.atmIv / tech.hv30 : null;

  return (
    <section className="tab">
      <header className="tab-header">
        <h2>Deep Dive</h2>
        <p className="muted">
          Pick any stock. Live Schwab data — real-time price, 2 years of history, the full
          options chain — plus our own flow, fundamentals and news, analysed in plain English.
        </p>
        <p className="muted small plain-note">
          This is separate from the scheduled research agent: no waiting for Sunday or
          Wednesday, no 30-day probability — it is the live picture right now, for any ticker
          you type. The verdicts are computed from the numbers, so they never invent a price.
        </p>
      </header>

      <form
        className="panel filterbar dd-search"
        onSubmit={(e) => { e.preventDefault(); void run(input); }}
      >
        <label className="filter grow">
          <span>Ticker</span>
          <input
            type="text"
            value={input}
            placeholder="e.g. NVDA"
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            aria-label="Ticker to analyse"
          />
        </label>
        <button type="submit" className="btn" disabled={loading || !input.trim()}>
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
        <span className="dd-quick">
          {QUICK_TICKERS.map((t) => (
            <button key={t} type="button" className="chip-btn" onClick={() => { setInput(t); void run(t); }}>
              {t}
            </button>
          ))}
        </span>
      </form>

      {loading && (
        <div className="panel">
          <div className="empty-title">Pulling live Schwab data…</div>
          <p className="muted">Quote, 2-year history, SPY comparison and the options chain.</p>
        </div>
      )}

      {error && (
        <div className="panel">
          <div className="empty-title">
            {error.code === 'reauth' || error.code === 'no-session' ? 'Schwab needs a reconnect' : 'Could not analyse that ticker'}
          </div>
          <p className="muted">{error.message}</p>
          {(error.code === 'reauth' || error.code === 'no-session') && (
            <p>
              <a className="btn" href={SCHWAB_AUTH_START_URL}>Reconnect Schwab</a>
            </p>
          )}
        </div>
      )}

      {!loading && !error && !data && (
        <div className="panel">
          <div className="empty-title">Type a ticker to start</div>
          <p className="muted">
            You will get the live price and 52-week range, trend vs its moving averages and
            vs the S&amp;P 500, what the options market is pricing, who has been buying or
            selling it, the fundamentals, the next earnings date and the latest headlines.
          </p>
        </div>
      )}

      {data && q && tech && opt && (
        <>
          <div className="panel">
            <SectionHead
              title={<><TvLink ticker={data.ticker} /> · {fmtUsd(q.price)}</>}
              sub={`Live via Schwab · ${new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET`}
            />
            <div className="perf-stats">
              <div className="stat"><span className="stat-label">Today</span><span className="stat-value num">{q.changePct != null ? fmtPct(q.changePct / 100) : '—'}</span></div>
              <div className="stat"><span className="stat-label">52-wk range</span><span className="stat-value num">{fmtUsd(q.week52Low)} – {fmtUsd(q.week52High)}</span></div>
              <div className="stat"><span className="stat-label">P/E</span><span className="stat-value num">{fmtNum(q.peRatio, 1)}</span></div>
              <div className="stat"><span className="stat-label">Market cap</span><span className="stat-value num">{fmtCompactMoney(q.marketCap)}</span></div>
            </div>
            {tech.rangePct != null && (
              <div className="rangebar" title="Where the price sits in its 52-week range">
                <div className="rangebar-fill" style={{ width: `${Math.max(0, Math.min(100, tech.rangePct))}%` }} />
                <div className="rangebar-marker" style={{ left: `${Math.max(0, Math.min(100, tech.rangePct))}%` }} />
              </div>
            )}
            <p className="muted small plain-note">
              Trading at <b>{tech.rangePct != null ? `${Math.round(tech.rangePct)}%` : '—'}</b> of its
              52-week range
              {tech.volVsAvg != null ? <> · today's volume is <b>{tech.volVsAvg.toFixed(1)}×</b> its 10-day average{tech.volVsAvg > 1.5 ? ' — unusually busy' : tech.volVsAvg < 0.6 ? ' — quieter than usual' : ''}</> : ''}.
              Bid {fmtUsd(q.bid)} / ask {fmtUsd(q.ask)}
              {q.divYield != null && q.divYield > 0 ? <> · pays a {fmtPct(q.divYield)} dividend</> : ''}.
            </p>
          </div>

          <div className="panel">
            <SectionHead title="Trend & momentum" sub="2 years of daily prices vs its averages and vs the S&P 500" />
            <div className="perf-stats">
              <div className="stat"><span className="stat-label">Trend</span><span className="stat-value">{tech.trend === 'uptrend' ? 'Uptrend' : tech.trend === 'downtrend' ? 'Downtrend' : tech.trend === 'mixed' ? 'Mixed' : '—'}</span></div>
              <div className="stat"><span className="stat-label">50-day avg</span><span className="stat-value num">{fmtUsd(tech.sma50)}</span></div>
              <div className="stat"><span className="stat-label">200-day avg</span><span className="stat-value num">{fmtUsd(tech.sma200)}</span></div>
              <div className="stat"><span className="stat-label">Daily swing (ATR)</span><span className="stat-value num">{tech.atrPct != null ? `${tech.atrPct.toFixed(1)}%` : '—'}</span></div>
            </div>
            <p className="muted small plain-note">
              {tech.trend === 'uptrend' && <>In an uptrend — price above both its 50-day and 200-day averages.</>}
              {tech.trend === 'downtrend' && <>In a downtrend — price below both its 50-day and 200-day averages.</>}
              {tech.trend === 'mixed' && <>No clean trend — price is caught between its 50-day and 200-day averages.</>}
              {tech.rs3m != null && <> Over the last 3 months it has {tech.rs3m >= 0 ? 'beaten' : 'lagged'} the S&amp;P 500 by <b>{Math.abs(tech.rs3m).toFixed(1)} points</b>.</>}
              {tech.rs6m != null && <> Over 6 months: {tech.rs6m >= 0 ? '+' : ''}{tech.rs6m.toFixed(1)} points vs the S&amp;P 500.</>}
              {tech.atrPct != null && <> A typical day moves about {tech.atrPct.toFixed(1)}% — that is the swing to expect.</>}
            </p>
          </div>

          <div className="panel">
            <SectionHead title="Options market" sub={opt.nearestExpiry ? `Nearest expiry ${fmtDate(opt.nearestExpiry)} (${opt.nearestDte ?? '—'} days)` : 'Live option chain via Schwab'} />
            {opt.contracts === 0 ? (
              <p className="muted small">No listed options for this ticker, or the chain did not load — the rest of the dive is unaffected.</p>
            ) : (
              <>
                <div className="perf-stats">
                  <div className="stat"><span className="stat-label">ATM IV</span><span className="stat-value num">{opt.atmIv != null ? `${(opt.atmIv * 100).toFixed(0)}%` : '—'}</span></div>
                  <div className="stat"><span className="stat-label">IV vs actual moves</span><span className="stat-value num">{ivVsHv != null ? `${ivVsHv.toFixed(1)}×` : '—'}</span></div>
                  <div className="stat"><span className="stat-label">Put/call OI</span><span className="stat-value num">{opt.putCallOi != null ? opt.putCallOi.toFixed(2) : '—'}</span></div>
                  <div className="stat"><span className="stat-label">Max pain</span><span className="stat-value num">{fmtUsd(opt.maxPain)}</span></div>
                </div>
                <p className="muted small plain-note">
                  {opt.atmIv != null && tech.hv30 != null && (
                    <>Options imply about <b>{(opt.atmIv * 100).toFixed(0)}%</b> annualised moves, while the stock has actually moved about <b>{(tech.hv30 * 100).toFixed(0)}%</b> — {ivVsHv != null && ivVsHv > 1.15 ? 'options look expensive' : ivVsHv != null && ivVsHv < 0.85 ? 'options look cheap' : 'options are priced about fairly'}.</>
                  )}
                  {opt.putCallOi != null && <> Put/call open interest is <b>{opt.putCallOi.toFixed(2)}</b> — {opt.putCallOi > 1.2 ? 'traders are hedging hard, leaning cautious' : opt.putCallOi < 0.7 ? 'calls dominate, leaning bullish' : 'roughly balanced'}.</>}
                  {opt.maxPain != null && <> The pain point for the nearest expiry is <b>{fmtUsd(opt.maxPain)}</b> — where option sellers lose the least.</>}
                  {opt.callWall != null && opt.putWall != null && <> Biggest open interest: calls at {fmtUsd(opt.callWall)}, puts at {fmtUsd(opt.putWall)} — those strikes act like magnets and walls.</>}
                </p>
              </>
            )}
          </div>

          {ticker && (
            <SmartMoneyPanel
              ticker={ticker}
              flow={flow ? { direction: flow.direction, flow_score: flow.flow_score, buy_amount: flow.buy_amount, sell_amount: flow.sell_amount, net_flow: flow.net_flow, officials: flow.officials, buy_trades: flow.buy_trades, sell_trades: flow.sell_trades, cluster: flow.cluster } : null}
            />
          )}

          <div className="panel">
            <SectionHead title="Fundamentals" sub="Valuation, quality and growth vs its sector" />
            <Fundamentals ticker={data.ticker} />
          </div>

          <div className="panel">
            <SectionHead title="Earnings & news" sub="What is coming up and what people are saying" />
            {nextEarnings ? (
              <p className="muted small plain-note">
                Next earnings: <b>{fmtDate(nextEarnings.reporting_date)}</b> ({nextEarnings.report_time === 'BMO' ? 'before open' : nextEarnings.report_time === 'AMC' ? 'after close' : 'time unknown'})
                {nextEarnings.eps_est != null ? <> · Wall Street expects ${fmtNum(nextEarnings.eps_est)} per share</> : ''}
                {nextEarnings.implied_move_pct != null ? <> · options imply a <b>±{nextEarnings.implied_move_pct.toFixed(1)}%</b> move on the print</> : ''}.
              </p>
            ) : (
              <p className="muted small">No upcoming earnings date on file for this ticker.</p>
            )}
            {headlines.length > 0 && (
              <ul className="dd-list">
                {headlines.map((h, i) => (
                  <li key={i}>
                    <a href={h.url} target="_blank" rel="noreferrer">{h.title}</a>{' '}
                    <span className="muted small">— {h.publisher}</span>
                  </li>
                ))}
              </ul>
            )}
            {headlines.length === 0 && <p className="muted small">No recent headlines for this ticker in the news feed.</p>}
          </div>
        </>
      )}
    </section>
  );
}
