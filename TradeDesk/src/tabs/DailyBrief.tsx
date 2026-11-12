import '../mockb-brief.css';
import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState';
import {
  ScoreBar,
  Badge,
  IndexBadges,
  TrendArrow,
  Chip,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { useFundamentals } from '../lib/useFundamentals';
import { setQuoteUniverse, useLivePrice } from '../lib/quotes';
import { usePremarketRange } from '../lib/premarketRange';
import { supabase } from '../lib/supabase';
import { SCHWAB_PROXY_URL } from '../lib/useSchwabLive';
import PremarketLine from '../components/PremarketLine';
import { Fundamentals } from '../components/Fundamentals';
import { DteCard } from '../components/Dte';
import { fmtMoney, fmtPct, fmtFullDate, fmtDateY, fmtTimeET, fmtTimeAgo, fmtCompactMoney, prettify, prettifyOptions } from '../lib/format';
import { requestCongressDeepLink } from '../lib/congressDeepLink';
import type { DailyBrief, BreakoutCandidate, SectorPerf, MarketRegime, NewsFile, SchwabMover, CongressTrade, TabId, DailyAlerts, AlertTradeItem, AlertNewsItem } from '../types';

const REGIME_TONE: Record<MarketRegime, 'green' | 'red' | 'amber' | 'dim'> = {
  uptrend: 'green',
  downtrend: 'red',
  choppy: 'amber',
  unknown: 'dim',
};

const REGIME_LABEL: Record<MarketRegime, string> = {
  uptrend: 'Uptrend',
  downtrend: 'Downtrend',
  choppy: 'Choppy',
  unknown: 'Unknown',
};

/** Plain-words lead-in for the mood banner, by regime. */
const REGIME_LEAD: Record<MarketRegime, string> = {
  uptrend: 'The market is in an uptrend —',
  downtrend: 'The market is in a downtrend —',
  choppy: 'The market is choppy —',
  unknown: 'Market mood is unclear —',
};

type FeedFilter = 'all' | 'breakouts' | 'options' | 'congress';

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'breakouts', label: 'Breakouts' },
  { id: 'options', label: 'Options' },
  { id: 'congress', label: 'Congress' },
];

/** First sentence of the thesis — the card's plain-English verdict. */
function firstSentence(s: string): string {
  const t = (s || '').trim();
  if (!t) return '';
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

/** Plain-English rendering of the scan's own checks (attributes). */
const ATTRIBUTE_PLAIN: Record<string, string> = {
  near_52w_high: 'near its 52-week high',
  relative_strength: 'stronger than the market over 3 months',
  volume_expansion: 'volume running above average',
  above_50d: 'above its 50-day average',
};

/** "Why:" line — the checks that fired, in plain words. */
function whyLine(c: BreakoutCandidate): string {
  const bits = (c.attributes ?? []).map((a) => ATTRIBUTE_PLAIN[a] ?? prettify(a));
  return bits.join(' · ');
}

/** Plain one-sentence market read, by regime. */
const REGIME_PLAIN: Record<MarketRegime, string> = {
  uptrend: 'The market is in an uptrend.',
  downtrend: 'The market is in a downtrend.',
  choppy: 'The market is choppy.',
  unknown: 'Market mood is unclear.',
};

/**
 * "Today in 10 seconds" — the whole brief in one box, computed from the
 * live morning data: mood + #1 candidate's trigger/stop. Never hardcoded.
 */
function TenSecondsBox({ brief }: { brief: DailyBrief }) {
  const top = brief.breakout_candidates[0];
  let line = REGIME_PLAIN[brief.market_regime];
  if (top) {
    if (top.trigger_price != null && top.stop_price != null) {
      line += ` Start with #1 ${top.ticker} — watch for a break above ${fmtMoney(top.trigger_price)}. The idea is off below ${fmtMoney(top.stop_price)}.`;
    } else if (top.stop_price != null) {
      line += ` Start with #1 ${top.ticker} — the idea is off below ${fmtMoney(top.stop_price)}.`;
    } else {
      line += ` Start with #1 ${top.ticker} (score ${top.score}).`;
    }
  }
  return (
    <div className="ten-seconds" role="status">
      <span className="ten-seconds-title">Today in 10 seconds</span>
      <p>{line}</p>
    </div>
  );
}

/**
 * Mock B "01 Market mood" summary card — always visible (summary cards
 * never collapse). One plain sentence (REGIME_PLAIN) + a breadth bar:
 * hot vs weak sectors from the live brief, with counts labelled.
 */
function MoodCard({ brief }: { brief: DailyBrief }) {
  const hot = brief.sectors.hot.length;
  const weak = brief.sectors.weak.length;
  const total = hot + weak;
  const hotPct = total > 0 ? (hot / total) * 100 : 50;
  return (
    <div className="mb-card mb-mood-card">
      <div className="mb-card-head mb-card-head-static">
        <span className="mb-card-num">01</span>
        <span className="mb-card-title">Market mood</span>
        <span className="mb-count-badge">
          {hot} hot · {weak} weak
        </span>
      </div>
      <div className="mb-card-body">
        <p className="mb-mood-sentence">{REGIME_PLAIN[brief.market_regime]}</p>
        {total > 0 ? (
          <>
            <div
              className="mb-breadth-bar"
              role="img"
              aria-label={`${hot} hot sectors vs ${weak} weak sectors`}
              title={`${hot} hot sectors vs ${weak} weak sectors`}
            >
              <div className="mb-breadth-hot" style={{ width: `${hotPct}%` }} />
              <div className="mb-breadth-weak" style={{ width: `${100 - hotPct}%` }} />
            </div>
            <div className="mb-breadth-labels">
              <span className="mb-breadth-label hot">{hot} hot</span>
              <span className="mb-breadth-label weak">{weak} weak</span>
            </div>
            <p className="mb-breadth-names">
              <b>Hot:</b> {brief.sectors.hot.map((s) => s.sector).join(', ') || '—'}
              <br />
              <b>Weak:</b> {brief.sectors.weak.map((s) => s.sector).join(', ') || '—'}
            </p>
          </>
        ) : (
          <p className="muted small">No sector data in this run.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Sticky top-call bar (phone only, above the bottom nav). Tap jumps to the
 * #1 idea's card. Plain wording, same numbers as the summary box.
 */
function TopCallBar({
  brief,
  onJump,
}: {
  brief: DailyBrief;
  onJump: (ticker: string) => void;
}) {
  const top = brief.breakout_candidates[0];
  if (!top || top.trigger_price == null || top.stop_price == null) return null;
  return (
    <>
      <button
        type="button"
        className="topcall-bar"
        onClick={() => onJump(top.ticker)}
        title="Tap to open the #1 idea"
      >
        <span>
          <b>#1 {top.ticker}</b> · break above {fmtMoney(top.trigger_price)} · off below{' '}
          {fmtMoney(top.stop_price)}
        </span>
        <span aria-hidden="true">↑</span>
      </button>
      <div className="topcall-spacer" aria-hidden="true" />
    </>
  );
}

/**
 * Verdict-first breakout card. Upfront: rank, verdict, ticker + company
 * name, score, and the key numbers (price, trigger, stop). The "Why:" line
 * (the scan's own checks, in plain words) and the "What could go wrong:"
 * line (stop + its distance below today's price, computed live) show
 * WITHOUT tapping. Tap to expand the full detail — thesis, attributes,
 * catalyst, fundamentals.
 */
function BreakoutCard({
  c,
  rank,
  companyName,
  expanded,
  onToggle,
}: {
  c: BreakoutCandidate;
  rank: number;
  companyName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lp = useLivePrice(c.ticker, c.price);
  const range = usePremarketRange(c.ticker);
  // During extended hours the price IS the pre/post-market price (Schwab
  // mark) — show it as such, with the gap vs yesterday's close.
  const extended = lp.session === 'premarket' || lp.session === 'afterhours';
  const gapPct =
    extended && lp.prevClose != null && lp.price != null
      ? (lp.price - lp.prevClose) / lp.prevClose
      : null;
  const verdict = firstSentence(c.thesis) || `${c.ticker} is setting up: ${c.setup}.`;
  const why = whyLine(c);
  const price = lp.price ?? c.price;
  const risk =
    c.stop_price != null && price != null
      ? price <= c.stop_price
        ? `the price is already below the ${fmtMoney(c.stop_price)} exit — this idea is off.`
        : `the idea is off below ${fmtMoney(c.stop_price)} — ${fmtMoney(price - c.stop_price)} (${(((price - c.stop_price) / price) * 100).toFixed(1)}%) below today's price of ${fmtMoney(price)}.`
      : null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <article className={`feed-card${expanded ? ' open' : ''}`} id={`feed-card-${c.ticker}`}>
      <div
        className="feed-card-main"
        onClick={onToggle}
        onKeyDown={onKey}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        title="Tap for the full detail"
      >
        <div className="feed-card-head">
          <div className="feed-card-id">
            <div className="feed-card-titlerow">
              <span className="feed-rank num" title={`Rank ${rank} by score`}>
                #{rank}
              </span>
              {/* Stop the TvLink click from also toggling the card. */}
              <span onClick={(e) => e.stopPropagation()}>
                <TvLink ticker={c.ticker} />
              </span>
            </div>
            <span className="subname">{companyName}</span>
          </div>
          <div className="feed-card-score">
            <ScoreBar value={c.score} small />
            <span className="feed-chev" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </div>
        </div>
        <p className="feed-verdict">{verdict}</p>
        {why ? (
          <p className="feed-why">
            <b>Why:</b> {why}
          </p>
        ) : null}
        {risk ? (
          <p className="feed-risk">
            <b>What could go wrong:</b> {risk}
          </p>
        ) : null}
        <div className="feed-keynums">
          <span className="feed-num">
            <span className="feed-num-label">
              {extended ? (lp.session === 'premarket' ? 'Pre-market' : 'After-hours') : 'Price'}
            </span>
            {extended ? (
              <span className="pmdot" title="Live extended-hours price (Schwab mark)" />
            ) : lp.live ? (
              <span className="livedot" title="Live ~15-min delayed quote" />
            ) : null}
            <span className="num">{fmtMoney(lp.price)}</span>
            {gapPct != null ? (
              <span className={`gap-pct ${gapPct >= 0 ? 'up' : 'down'}`} title="Gap vs yesterday's close">
                {gapPct >= 0 ? '+' : ''}
                {(gapPct * 100).toFixed(2)}%
              </span>
            ) : null}
          </span>
          <span className="feed-num feed-num-trigger">
            <span className="feed-num-label">Trigger</span>
            <span className="num up">{fmtMoney(c.trigger_price)}</span>
          </span>
          <span className="feed-num feed-num-stop">
            <span className="feed-num-label">Stop</span>
            <span className="num down">{fmtMoney(c.stop_price)}</span>
          </span>
          <span className="feed-num feed-num-setup">
            <span className="feed-num-label">Setup</span>
            {c.setup}
          </span>
        </div>
        {range ? (
          <div
            className="pm-range"
            title="The highest and lowest prices before today's open (Schwab pre-market prints, from ~7:00 AM ET) — the first levels to watch at the open"
          >
            Pre-market high <span className="num">{fmtMoney(range.high)}</span> · low{' '}
            <span className="num">{fmtMoney(range.low)}</span>
          </div>
        ) : null}
        {!extended && <PremarketLine pm={lp.premarket} />}
      </div>
      {expanded && (
        <div className="feed-card-detail">
          <div className="detail-thesis">{prettifyOptions(c.thesis || '')}</div>
          <div className="detail-meta">
            <div>
              <span className="detail-label">Attributes</span>
              <div className="chips">
                {c.attributes.length > 0 ? (
                  c.attributes.map((a) => <Chip key={a}>{prettify(a)}</Chip>)
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
            <div>
              <span className="detail-label">Catalyst</span>
              <div>
                {c.catalyst ? (
                  <>
                    {prettify(c.catalyst)}
                    {c.catalyst_date ? <span className="muted"> · {c.catalyst_date}</span> : null}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
            <div>
              <span className="detail-label">Index</span>
              <IndexBadges items={c.index_membership} />
            </div>
            <div>
              <span className="detail-label">Sector</span>
              <div>
                {c.sector}
                {c.subsector ? <span className="muted"> · {c.subsector}</span> : null}
              </div>
            </div>
          </div>
          <Fundamentals ticker={c.ticker} />
        </div>
      )}
    </article>
  );
}

/**
 * Congress flow summary for the feed: buys vs sells across the tracked
 * filings (congress.json spans the last 12 months), with a jump into the
 * full Congress & Gov tab. Hidden when the file is missing/empty.
 */
function CongressCard({ onOpenTab }: { onOpenTab?: (id: TabId) => void }) {
  const { data } = useJsonData<CongressTrade[]>('congress.json');
  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;
    let buys = 0;
    let sells = 0;
    let buyAmt = 0;
    let sellAmt = 0;
    let latest = '';
    for (const t of data) {
      if (t.trade_type === 'buy') {
        buys++;
        buyAmt += t.amount_mid ?? 0;
      } else if (t.trade_type === 'sell') {
        sells++;
        sellAmt += t.amount_mid ?? 0;
      }
      const k = t.disclosed_date ?? t.tx_date;
      if (k && k > latest) latest = k;
    }
    return { buys, sells, buyAmt, sellAmt, latest };
  }, [data]);
  if (!stats) return null;
  const total = stats.buys + stats.sells;
  const buyPct = total > 0 ? (stats.buys / total) * 100 : 50;
  const selling = stats.sells > stats.buys;
  return (
    <article className="feed-card congress-card">
      <div className="feed-card-head">
        <div className="feed-card-id">
          <span className="ticker">Congress flow</span>
        </div>
        <Badge tone={selling ? 'red' : 'green'}>{selling ? 'Selling' : 'Buying'}</Badge>
      </div>
      <p className="feed-verdict">
        Congress is {selling ? 'selling' : 'buying'} — {stats.buys.toLocaleString('en-US')} buys
        vs {stats.sells.toLocaleString('en-US')} sells in the last 12 months of filings.
      </p>
      <div
        className="flow-bar"
        title={`${stats.buys.toLocaleString('en-US')} buys vs ${stats.sells.toLocaleString('en-US')} sells`}
      >
        <div className="flow-bar-buy" style={{ width: `${buyPct}%` }} />
      </div>
      <div className="feed-keynums">
        <span className="feed-num">
          <span className="feed-num-label">Buys</span>
          <span className="num up">{fmtCompactMoney(stats.buyAmt)}</span>
        </span>
        <span className="feed-num">
          <span className="feed-num-label">Sells</span>
          <span className="num down">{fmtCompactMoney(stats.sellAmt)}</span>
        </span>
        <span className="feed-num">
          <span className="feed-num-label">Latest filing</span>
          {stats.latest || '—'}
        </span>
      </div>
      {onOpenTab ? (
        <button className="btn btn-ghost feed-card-cta" onClick={() => onOpenTab('congress')}>
          Open Congress &amp; Gov →
        </button>
      ) : null}
    </article>
  );
}

function DteSection({ brief }: { brief: DailyBrief }) {
  const zero = brief.dte_focus?.zero_dte ?? [];
  const one = brief.dte_focus?.one_dte ?? [];
  if (zero.length === 0 && one.length === 0) return null;
  return (
    <>
      {zero.length > 0 && (
        <>
          <SectionHead
            title="Options expiring today — can go to zero today"
            sub="Expires today · index options"
          />
          <div className="dte-grid">
            {zero.map((p) => (
              <DteCard key={p.ticker} p={p} />
            ))}
          </div>
        </>
      )}
      {one.length > 0 && (
        <>
          <SectionHead title="Options expiring tomorrow" sub="Expires tomorrow · index options" />
          <div className="dte-grid">
            {one.map((p) => (
              <DteCard key={p.ticker} p={p} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function SectorTable({ rows, emptyText }: { rows: SectorPerf[]; emptyText?: string }) {
  if (rows.length === 0) return <p className="muted">{emptyText ?? 'No sectors in this group.'}</p>;
  return (
    <div className="table-scroll">
      <table className="dtable slim notrans">
        <thead>
          <tr>
            <th>Sector</th>
            <th className="r">1D</th>
            <th className="r">5D</th>
            <th className="r">1M</th>
            <th className="r">RS rank</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.sector}>
              <td>
                {s.sector} <TvLink ticker={s.etf} />
              </td>
              <td className={`r num ${s.perf_1d_pct != null ? (s.perf_1d_pct >= 0 ? 'up' : 'down') : ''}`}>
                {fmtPct(s.perf_1d_pct)}
              </td>
              <td className={`r num ${s.perf_5d_pct != null ? (s.perf_5d_pct >= 0 ? 'up' : 'down') : ''}`}>
                {fmtPct(s.perf_5d_pct)}
              </td>
              <td className={`r num ${s.perf_1m_pct != null ? (s.perf_1m_pct >= 0 ? 'up' : 'down') : ''}`}>
                {fmtPct(s.perf_1m_pct)}
              </td>
              <td className="r num">{s.rel_strength_rank != null ? s.rel_strength_rank : '—'}</td>
              <td>
                <TrendArrow trend={s.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoverList({ rows, tone }: { rows: SchwabMover[]; tone: 'up' | 'down' }) {
  if (rows.length === 0) return <p className="muted">No movers in this run.</p>;
  return (
    <div>
      {rows.map((m) => (
        <div key={m.symbol} className="mover-row">
          <span>
            <TvLink ticker={m.symbol} />
            {m.description ? <span className="subname">{m.description}</span> : null}
          </span>
          <span className="mover-price num">
            {fmtMoney(m.lastPrice ?? null)}
            <span className={`subname ${tone}`}>
              {fmtPct(m.percentChange ?? null)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * S&P 500 top movers via the Schwab proxy, fetched once when the tab opens.
 * Any failure (no session, reauth needed, network) hides the section —
 * movers are a garnish, never a reason to error the brief.
 */
function MoversSection() {
  const [movers, setMovers] = useState<{ up: SchwabMover[]; down: SchwabMover[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) return;
        const fetchDir = async (dir: 'up' | 'down'): Promise<SchwabMover[]> => {
          const q = new URLSearchParams({ movers: '$SPX', direction: dir, change: 'percent' });
          const res = await fetch(`${SCHWAB_PROXY_URL}?${q.toString()}`, {
            headers: { Authorization: `Bearer ${jwt}` },
            cache: 'no-cache',
          });
          if (!res.ok) return [];
          const json = await res.json();
          const rows = Array.isArray(json)
            ? json
            : Array.isArray(json?.screeners)
              ? json.screeners
              : [];
          return (rows as SchwabMover[]).slice(0, 5);
        };
        const [up, down] = await Promise.all([fetchDir('up'), fetchDir('down')]);
        if (!cancelled && (up.length > 0 || down.length > 0)) setMovers({ up, down });
      } catch {
        // Hide the section on any failure.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!movers) return null;
  return (
    <>
      <SectionHead title="Movers" sub="S&P 500 · top % movers · live via Schwab" />
      <div className="sector-grid">
        <div className="panel">
          <h4 className="sector-title up">Top gainers</h4>
          <MoverList rows={movers.up} tone="up" />
        </div>
        <div className="panel">
          <h4 className="sector-title down">Top losers</h4>
          <MoverList rows={movers.down} tone="down" />
        </div>
      </div>
    </>
  );
}

/**
 * Pipeline news headlines (news.json, Yahoo search). Hidden entirely when
 * the file is missing or empty — the brief must not depend on it.
 */
function NewsSection() {
  const { data } = useJsonData<NewsFile>('news.json');
  if (!data || data.items.length === 0) return null;
  const items = data.items.slice(0, 12);
  return (
    <>
      <SectionHead title="News" sub={`Headlines for brief tickers · ${fmtTimeET(data.as_of)}`} />
      <div className="panel news-list">
        {items.map((n, i) => (
          <div key={`${n.url}-${i}`} className="news-item">
            <a href={n.url} target="_blank" rel="noreferrer">
              {n.title}
            </a>
            <span className="muted small news-meta">
              {n.ticker} · {n.publisher}
              {n.published_at ? ` · ${fmtTimeAgo(n.published_at)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * "New developments" — the day's new Congress / White House disclosures and
 * news to watch, from the morning pipeline run (daily-alerts.json). Rendered
 * at the very top of the Daily Brief, above the mood banner. A missing file
 * (pipeline hasn't run the new step yet) shows a quiet note, never a crash.
 */
function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const todayNoon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  return Math.round((todayNoon - t) / 86400000);
}

/** "today" / "yesterday" / "2 days ago" for a disclosure date. */
function disclosedWhen(iso: string | null | undefined): string {
  const d = daysAgo(iso);
  if (d === null) return '';
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

function tradeVerb(t: AlertTradeItem['trade_type']): string {
  if (t === 'buy') return 'bought';
  if (t === 'sell') return 'sold';
  return 'exchanged';
}

/**
 * One disclosure in the alerts. Tapping the row jumps to the Congress & Gov
 * tab with this exact trade filtered and highlighted — the Filing link and
 * the chart link still work on their own (their clicks don't navigate).
 */
function AlertTradeRow({
  t,
  branch,
  onOpenTab,
}: {
  t: AlertTradeItem;
  branch: 'congress' | 'executive';
  onOpenTab?: (id: TabId) => void;
}) {
  const openTrade = () => {
    if (!onOpenTab) return;
    requestCongressDeepLink({
      branch,
      query: t.ticker ?? t.member,
      key: `${t.member}|${t.ticker ?? t.asset_name}|${t.disclosed_date ?? t.tx_date}`,
    });
    onOpenTab('congress');
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTrade();
    }
  };
  return (
    <div
      className="alert-item alert-item-clickable"
      role="button"
      tabIndex={0}
      onClick={openTrade}
      onKeyDown={onKey}
      title="Tap to open this trade in Congress & Gov"
    >
      <div className="alert-line">
        <b>{t.member}</b>
        {t.role ? <span className="muted"> · {t.role}</span> : null} {tradeVerb(t.trade_type)}{' '}
        {t.ticker ? <TvLink ticker={t.ticker} /> : <b>{t.asset_name}</b>}
        {' · '}
        {t.amount_range}
        {t.cluster ? <span className="alert-cluster">cluster buy</span> : null}
      </div>
      <span className="muted small alert-meta">
        {t.chamber}
        {t.disclosed_date
          ? ` · disclosed ${disclosedWhen(t.disclosed_date)} (${fmtDateY(t.disclosed_date)})`
          : ` · traded ${fmtDateY(t.tx_date)}`}
        {t.doc_url ? (
          <span onClick={(e) => e.stopPropagation()}>
            {' · '}
            <a href={t.doc_url} target="_blank" rel="noreferrer">
              Filing ↗
            </a>
          </span>
        ) : null}
      </span>
    </div>
  );
}

function AlertNewsRow({ n }: { n: AlertNewsItem }) {
  return (
    <div className="alert-item">
      <a href={n.url} target="_blank" rel="noreferrer">
        {n.title}
      </a>
      <span className="muted small alert-meta">
        {n.ticker} · {n.publisher}
        {n.published_at ? ` · ${fmtTimeAgo(n.published_at)}` : ''}
      </span>
    </div>
  );
}

/** Collapsed state per alerts block, remembered across visits. Default: open. */
function useCollapsed(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // Private mode etc. — collapsing still works for this visit.
      }
      return next;
    });
  };
  return [collapsed, toggle];
}

/** One of the three alerts blocks with a tap-to-collapse header. */
function AlertBlock({
  title,
  count,
  storageKey,
  summary,
  hint,
  children,
}: {
  title: string;
  count: number;
  storageKey: string;
  summary: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const [collapsed, toggle] = useCollapsed(storageKey);
  return (
    <div className="panel alerts-block">
      <button
        type="button"
        className="alerts-head"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? 'Tap to expand' : 'Tap to collapse'}
      >
        <span className="alerts-title">
          {title} <span className="muted">· {count}</span>
        </span>
        <span className="alerts-chev" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {!collapsed && (
        <>
          <p className="muted small">{summary}</p>
          {hint ? <p className="muted small alerts-hint">{hint}</p> : null}
          <div className="alerts-items">{children}</div>
        </>
      )}
    </div>
  );
}

function AlertsSection({ onOpenTab }: { onOpenTab?: (id: TabId) => void }) {
  const { data, loading, error } = useJsonData<DailyAlerts>('daily-alerts.json');
  if (loading) {
    return (
      <>
        <SectionHead title="New developments" sub="Checking this morning's disclosures…" />
        <p className="muted">Loading the latest disclosures and headlines…</p>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <SectionHead title="New developments" sub="Congress, White House & news to watch" />
        <div className="panel">
          <p className="muted">
            Alerts load with the morning update — check back after the daily pipeline run.
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <SectionHead
        title="New developments"
        sub={`Updated ${fmtTimeET(data.generated_at)} · as of this morning's run`}
      />
      <div className="alerts-grid">
        <AlertBlock
          title="Congress & Senate"
          count={data.congress.count}
          storageKey="td-alerts-congress"
          summary={data.congress.summary}
          hint="Tap a trade to open it in Congress & Gov."
        >
          {data.congress.items.length === 0 ? (
            <p className="muted">Nothing new to show.</p>
          ) : (
            data.congress.items.map((t, i) => (
              <AlertTradeRow
                key={`${t.member}-${t.ticker ?? t.asset_name}-${t.tx_date}-${i}`}
                t={t}
                branch="congress"
                onOpenTab={onOpenTab}
              />
            ))
          )}
        </AlertBlock>
        <AlertBlock
          title="White House"
          count={data.executive.count}
          storageKey="td-alerts-executive"
          summary={data.executive.summary}
          hint="Tap a trade to open it in the White House branch."
        >
          {data.executive.items.length === 0 ? (
            <p className="muted">Nothing new to show.</p>
          ) : (
            data.executive.items.map((t, i) => (
              <AlertTradeRow
                key={`${t.member}-${t.ticker ?? t.asset_name}-${t.tx_date}-${i}`}
                t={t}
                branch="executive"
                onOpenTab={onOpenTab}
              />
            ))
          )}
        </AlertBlock>
        <AlertBlock
          title="News to watch"
          count={data.news.count}
          storageKey="td-alerts-news"
          summary={data.news.summary}
        >
          {data.news.items.length === 0 ? (
            <p className="muted">Nothing new to show.</p>
          ) : (
            data.news.items.map((n, i) => <AlertNewsRow key={`${n.url}-${i}`} n={n} />)
          )}
        </AlertBlock>
      </div>
    </>
  );
}

export default function DailyBriefTab({ onOpenTab }: { onOpenTab?: (id: TabId) => void }) {
  const { data, loading, error } = useJsonData<DailyBrief>('daily-brief.json');
  // Company names for the ticker cells (fundamentals.json is the source of
  // truth — the brief's `name` field is just the ticker). One fetch here,
  // passed down, so 15 rows don't each fetch the file.
  const { get: getFund } = useFundamentals();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setQuoteUniverse(data.breakout_candidates.map((c) => c.ticker));
    }
  }, [data]);

  if (loading) return <LoadingPanel what="daily brief" />;
  if (error || !data)
    return (
      <ErrorPanel
        file="public/data/daily-brief.json"
        error={error ?? 'empty file'}
      />
    );

  const brief = data;
  const hasCandidates = brief.breakout_candidates.length > 0;
  const q = query.trim().toLowerCase();
  const visibleCandidates = brief.breakout_candidates.filter((c) => {
    if (!q) return true;
    const name = (getFund(c.ticker)?.name ?? c.name).toLowerCase();
    return c.ticker.toLowerCase().includes(q) || name.includes(q);
  });
  const showBreakouts = filter === 'all' || filter === 'breakouts';
  const showOptions = (filter === 'all' || filter === 'options') && !q;
  const showCongress = (filter === 'all' || filter === 'congress') && !q;
  const showRest = filter === 'all' && !q;

  const jumpTo = (ticker: string) => {
    setQuery('');
    setFilter('breakouts');
    setExpanded(ticker);
    window.setTimeout(() => {
      document.getElementById(`feed-card-${ticker}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <section className="tab">
      <div className="panel brief-head mb-card mb-brief-head">
        <div className="brief-head-main">
          <div className="eyebrow">Daily Brief · {brief.universe}</div>
          <h2 className="mb-tabhead">{fmtFullDate(brief.brief_date)}</h2>
        </div>
        <div className="brief-head-side">
          <Badge tone={REGIME_TONE[brief.market_regime]}>{REGIME_LABEL[brief.market_regime]}</Badge>
          <div className="muted small">Generated {fmtTimeET(brief.generated_at)}</div>
        </div>
      </div>

      <AlertsSection onOpenTab={onOpenTab} />

      <MoodCard brief={brief} />

      <div className="mood-banner">
        <span className="mood-label">Today</span>
        <p>
          {REGIME_LEAD[brief.market_regime]} {brief.regime_notes}
        </p>
      </div>

      <TenSecondsBox brief={brief} />

      <div className="feed-controls mb-search-rail">
        <input
          id="brief-search"
          className="screener-search feed-search"
          type="search"
          placeholder="Search a ticker or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search breakout candidates by ticker or company name"
        />
        {brief.breakout_candidates.length > 0 && (
          <div className="mb-quick-row" role="group" aria-label="Quick picks — top breakout tickers">
            <span className="mb-quick-label">Quick picks:</span>
            {brief.breakout_candidates.slice(0, 5).map((c) => {
              const active = q === c.ticker.toLowerCase();
              return (
                <button
                  key={c.ticker}
                  type="button"
                  className={`mb-quick-chip${active ? ' on' : ''}`}
                  onClick={() => setQuery(active ? '' : c.ticker)}
                  aria-pressed={active}
                  title={`Search ${c.ticker}`}
                >
                  {c.ticker}
                </button>
              );
            })}
          </div>
        )}
        <div className="feed-chips" role="group" aria-label="Filter the feed">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip-btn${filter === f.id ? ' on' : ''}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {showBreakouts && (
        <>
          <SectionHead
            title="Stocks to watch today"
            sub={q ? `${visibleCandidates.length} match${visibleCandidates.length === 1 ? '' : 'es'} · 1–2 week window` : '1–2 week window · tap a card for the full detail'}
          />
          {hasCandidates ? (
            visibleCandidates.length > 0 ? (
              <>
              <div className="feed-list">
                {visibleCandidates.map((c) => (
                  <BreakoutCard
                    key={c.ticker}
                    c={c}
                    rank={brief.breakout_candidates.indexOf(c) + 1}
                    companyName={getFund(c.ticker)?.name ?? c.name}
                    expanded={expanded === c.ticker}
                    onToggle={() => setExpanded((cur) => (cur === c.ticker ? null : c.ticker))}
                  />
                ))}
              </div>
              {!q && onOpenTab && (
                <button type="button" className="mb-see-all" onClick={() => onOpenTab('scanner')}>
                  See all {brief.breakout_candidates.length} breakout candidates in Scanner →
                </button>
              )}
              </>
            ) : (
              <EmptyState
                dataFile="public/data/daily-brief.json"
                loading={false}
                error={null}
                items={[`No breakout candidate matches “${query.trim()}”.`]}
              />
            )
          ) : (
            <EmptyState
              dataFile="public/data/daily-brief.json"
              loading={false}
              error={null}
              items={['No breakout candidates met the scoring cutoffs in this run.']}
            />
          )}
        </>
      )}

      {showCongress && (
        <>
          <SectionHead title="Congress" sub="What disclosed trading says · last 12 months" />
          <CongressCard onOpenTab={onOpenTab} />
        </>
      )}

      {showOptions && <DteSection brief={brief} />}

      {showRest && (
        <>
          <MoversSection />

          <SectionHead title="Sectors" sub="Hot vs. weak · rotation read" />
          <div className="sector-grid">
            <div className="panel">
              <h4 className="sector-title up">Hot sectors</h4>
              <SectorTable rows={brief.sectors.hot} />
            </div>
            <div className="panel">
              <h4 className="sector-title down">Weak sectors</h4>
              <SectorTable rows={brief.sectors.weak} />
            </div>
          </div>
          {brief.subsectors ? (
            <>
              <SectionHead title="Subsectors" sub="Industry momentum · liquid industry ETFs" />
              <div className="sector-grid">
                <div className="panel">
                  <h4 className="sector-title up">Hot subsectors</h4>
                  <SectorTable rows={brief.subsectors.hot} emptyText="No subsector data in this run." />
                </div>
                <div className="panel">
                  <h4 className="sector-title down">Weak subsectors</h4>
                  <SectorTable rows={brief.subsectors.weak} emptyText="No subsector data in this run." />
                </div>
              </div>
            </>
          ) : null}

          {brief.rotation_notes ? (
            <div className="callout">
              <span className="detail-label">Rotation</span>
              <p>{brief.rotation_notes}</p>
            </div>
          ) : null}

          <NewsSection />
        </>
      )}

      <TopCallBar brief={brief} onJump={jumpTo} />
    </section>
  );
}
