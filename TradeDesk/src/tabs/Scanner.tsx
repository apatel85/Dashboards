import '../mockb-scanner.css';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Badge,
  Chip,
  ScoreBar,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { useFundamentals } from '../lib/useFundamentals';
import { setQuoteUniverse, useLivePrice } from '../lib/quotes';
import PremarketLine from '../components/PremarketLine';
import { FuturesGamma, GexAlerts, TickerGamma, useWatchlist } from '../components/Gamma';
import { Playbook } from '../components/Playbook';
import { Fundamentals } from '../components/Fundamentals';
import { fmtDate, fmtMoney, fmtTimeET, prettify, prettifyOptions } from '../lib/format';
import { useForceOpenCard, useForceOpenState, type ForceOpen } from '../lib/useForceOpen';
import type {
  BreakoutCandidate,
  DailyBrief,
  GexChangesFile,
  GexFile,
  GexTicker,
  ResearchIdea,
  SignalTicker,
  SignalsFile,
} from '../types';

type DirFilter = 'all' | 'accumulation' | 'distribution';
type SortKey = 'signal' | 'flow' | 'pup';

const DIR_TONE: Record<string, 'green' | 'red' | 'dim'> = {
  accumulation: 'green',
  distribution: 'red',
  mixed: 'dim',
};

const DIR_LABEL: Record<string, string> = {
  accumulation: 'Accumulation',
  distribution: 'Distribution',
  mixed: 'Mixed flow',
};

interface Merged {
  sig: SignalTicker;
  idea: ResearchIdea | null;
  /** 0.45×flow + 0.55×research when research exists, else flow score. */
  signal: number;
}

function fmtFlow(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  return `${s}$${Math.round(a / 1e3)}k`;
}

/* ── Mock B numbered card: collapsed by default, tap to expand ──── */

function MbCard({
  num,
  title,
  sub,
  count,
  children,
}: {
  num: string;
  title: string;
  sub?: string;
  count?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-card">
      <button
        type="button"
        className="mb-card-head mb-scanner-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="mb-card-num">{num}</span>
        <span className="mb-card-title">{title}</span>
        {sub ? <span className="mb-card-sub">{sub}</span> : null}
        {count ? <span className="mb-count-badge">{count}</span> : null}
        <span className="mb-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open ? <div className="mb-card-body">{children}</div> : null}
    </section>
  );
}

/* ── 01 · Breakout candidates ───────────────────────────────────── */

const ATTRIBUTE_PLAIN: Record<string, string> = {
  near_52w_high: 'near its 52-week high',
  relative_strength: 'stronger than the market over 3 months',
  volume_expansion: 'volume running above average',
  above_50d: 'above its 50-day average',
};

function BreakoutRow({
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
  const price = lp.price ?? c.price;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <>
      <tr
        className={`mb-row${expanded ? ' open' : ''}`}
        onClick={onToggle}
        onKeyDown={onKey}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        title="Tap for the full detail"
      >
        <td className="num mb-rank">#{rank}</td>
        <td>
          <span onClick={(e) => e.stopPropagation()}>
            <TvLink ticker={c.ticker} />
          </span>
          <span className="mb-subname">{companyName}</span>
        </td>
        <td className="num">
          <ScoreBar value={c.score} small />
        </td>
        <td className="num">{fmtMoney(price)}</td>
        <td className="num mb-trigger">{fmtMoney(c.trigger_price)}</td>
        <td className="num mb-stop">{fmtMoney(c.stop_price)}</td>
      </tr>
      {expanded ? (
        <tr className="mb-detail-row">
          <td colSpan={6}>
            <p className="mb-thesis">{prettifyOptions(c.thesis || '')}</p>
            <div className="mb-detail-grid">
              <div>
                <span className="detail-label">Why it flagged</span>
                <div className="mb-why">
                  {(c.attributes ?? [])
                    .map((a) => ATTRIBUTE_PLAIN[a] ?? prettify(a))
                    .join(' · ') || '—'}
                </div>
              </div>
              <div>
                <span className="detail-label">Setup</span>
                <div>{c.setup || '—'}</div>
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
                <span className="detail-label">Sector</span>
                <div>
                  {c.sector}
                  {c.subsector ? <span className="muted"> · {c.subsector}</span> : null}
                </div>
              </div>
            </div>
            <div className="chips mb-detail-chips">
              {c.attributes.length > 0 ? (
                c.attributes.map((a) => <Chip key={a}>{prettify(a)}</Chip>)
              ) : null}
              <Chip>Trigger {fmtMoney(c.trigger_price)}</Chip>
              <Chip>Stop {fmtMoney(c.stop_price)}</Chip>
            </div>
            {lp.premarket ? <PremarketLine pm={lp.premarket} /> : null}
            <Fundamentals ticker={c.ticker} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function BreakoutSection({ brief }: { brief: DailyBrief }) {
  const { get: getFund } = useFundamentals();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const rows = brief.breakout_candidates.filter((c) => {
    if (!q) return true;
    const name = (getFund(c.ticker)?.name ?? c.name ?? '').toLowerCase();
    return (
      c.ticker.toLowerCase().includes(q) ||
      name.includes(q) ||
      (c.setup ?? '').toLowerCase().includes(q) ||
      (c.sector ?? '').toLowerCase().includes(q)
    );
  });
  return (
    <div className="mb-scanner-section">
      <input
        className="mb-search"
        type="search"
        placeholder="Search ticker, company, setup or sector…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search breakout candidates"
      />
      {rows.length === 0 ? (
        <p className="muted">No breakout candidate matches “{query.trim()}”.</p>
      ) : (
        <div className="mb-table-scroll">
          <table className="mb-table">
            <thead>
              <tr>
                <th className="r">#</th>
                <th>Ticker</th>
                <th className="r">Score</th>
                <th className="r">Price</th>
                <th className="r">Trigger</th>
                <th className="r">Stop</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <BreakoutRow
                  key={c.ticker}
                  c={c}
                  rank={brief.breakout_candidates.indexOf(c) + 1}
                  companyName={getFund(c.ticker)?.name ?? c.name}
                  expanded={expanded === c.ticker}
                  onToggle={() => setExpanded((cur) => (cur === c.ticker ? null : c.ticker))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small footnote-line">
        Tap a row for the thesis, catalyst and fundamentals. Trigger = the price a
        breakout needs to clear; stop = the price where the idea is off. Research
        and education only — not financial advice.
      </p>
    </div>
  );
}

/* ── 02 · Smart-money signals (adapted from Signals.tsx) ─────────── */

function PupBadge({ p }: { p: number | null }) {
  if (p == null) return <span className="muted small">research pending</span>;
  const tone = p >= 60 ? 'green' : p >= 45 ? 'amber' : 'red';
  return (
    <span
      className="pup"
      title="Agent-estimated probability the stock closes higher 30 days out. Model judgment — not a calibrated statistic."
    >
      <Badge tone={tone}>P(up 30d) {p}%</Badge>
    </span>
  );
}

function SignalCard({
  m,
  gex,
  gexAt,
  watched,
  onToggleWatch,
  force,
}: {
  m: Merged;
  gex: GexTicker | null;
  gexAt?: string;
  watched: boolean;
  onToggleWatch: () => void;
  force: ForceOpen | null;
}) {
  const { isOpen, toggle } = useForceOpenCard(force, false);
  const { sig, idea } = m;
  const lp = useLivePrice(sig.ticker, null);
  return (
    <article className={`mb-signal-card${isOpen ? ' open' : ''}`}>
      <div
        className="mb-signal-main"
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggle();
        }}
        aria-expanded={isOpen}
      >
        <span className="mb-signal-top">
          <span>
            <TvLink ticker={sig.ticker} className="big" />
            <span className="mb-subname">{sig.asset_name}</span>
          </span>
          <span className="mb-signal-dir">
            <button
              type="button"
              className={`mb-watch-star${watched ? ' on' : ''}`}
              title={watched ? 'Remove from watchlist' : 'Watch for gamma alerts'}
              aria-label={watched ? `Remove ${sig.ticker} from watchlist` : `Watch ${sig.ticker} for gamma alerts`}
              onClick={(ev) => {
                ev.stopPropagation();
                onToggleWatch();
              }}
            >
              {watched ? '★' : '☆'}
            </button>
            <Badge tone={DIR_TONE[sig.direction] ?? 'dim'}>{DIR_LABEL[sig.direction]}</Badge>
            {sig.cluster ? <Badge tone="amber">Cluster</Badge> : null}
          </span>
        </span>
        <span className="mb-signal-mid">
          <span className="mb-signal-price num">
            {lp.live ? <span className="livedot" title="Live ~15-min delayed quote" /> : null}
            {lp.price != null ? fmtMoney(lp.price) : <span className="muted">—</span>}
          </span>
          <PupBadge p={idea?.p_up ?? null} />
        </span>
        {lp.premarket ? <PremarketLine pm={lp.premarket} /> : null}
        <span className="mb-signal-scores">
          <span className="mb-signal-score">
            <span className="detail-label">Flow</span>
            <ScoreBar value={sig.flow_score} small />
          </span>
          {idea ? (
            <span className="mb-signal-score">
              <span className="detail-label">Research</span>
              <ScoreBar value={idea.score} small />
            </span>
          ) : (
            <span className="muted small">deep-dive pending</span>
          )}
        </span>
        <span className="mb-signal-meta muted small">
          Net {fmtFlow(sig.net_flow)} · {sig.officials} official{sig.officials === 1 ? '' : 's'} ·{' '}
          {sig.buy_trades + sig.sell_trades} trades · latest {fmtDate(sig.latest_ref_date)}
        </span>
      </div>
      {isOpen && (
        <div className="mb-signal-detail">
          {idea ? (
            <>
              <p className="mb-thesis">{idea.thesis}</p>
              <div className="breakdown">
                {idea.score_breakdown.slice(0, 6).map((s) => (
                  <div className="breakdown-row" key={s.attribute}>
                    <span className="breakdown-attr" title={s.note}>
                      {s.attribute.replace(/_/g, ' ')}
                    </span>
                    <ScoreBar value={s.score} small />
                  </div>
                ))}
              </div>
              <div className="chips">
                <Chip>Trigger {fmtMoney(idea.trigger_price)}</Chip>
                <Chip>Stop {fmtMoney(idea.stop_price)}</Chip>
                <Chip>{idea.stage}</Chip>
                {idea.quality_gate_pass ? <Chip>Quality gate ✓</Chip> : <Chip>Gate issues</Chip>}
              </div>
              <div className="muted small">Research as of {fmtTimeET(idea.updated_at)}</div>
            </>
          ) : (
            <p className="muted small">
              No deep-dive yet — the research agent runs Sun/Wed nights on the top
              flow names and its verdict will appear here.
            </p>
          )}
          <div className="chips" style={{ marginTop: 8 }}>
            <Chip>
              Buys {fmtFlow(sig.buy_amount)} ({sig.buy_trades})
            </Chip>
            <Chip>
              Sells {fmtFlow(sig.sell_amount)} ({sig.sell_trades})
            </Chip>
            {sig.congress_trades > 0 ? <Chip>Congress ×{sig.congress_trades}</Chip> : null}
            {sig.exec_trades > 0 ? <Chip>White House ×{sig.exec_trades}</Chip> : null}
          </div>
          {gex ? (
            <div style={{ marginTop: 12 }}>
              <TickerGamma g={gex} computedAt={gexAt} />
            </div>
          ) : null}
          <Fundamentals ticker={sig.ticker} />
        </div>
      )}
    </article>
  );
}

function SignalsSection({
  sigData,
  research,
  gex,
  watched,
  toggleWatch,
}: {
  sigData: SignalsFile;
  research: ResearchIdea[] | null;
  gex: GexFile | null;
  watched: string[];
  toggleWatch: (t: string) => void;
}) {
  const [dir, setDir] = useState<DirFilter>('all');
  const [sort, setSort] = useState<SortKey>('signal');
  const [query, setQuery] = useState('');
  const { force, expandAll, collapseAll } = useForceOpenState();

  const gexByTicker = useMemo(() => {
    const m = new Map<string, GexTicker>();
    if (gex) for (const [k, v] of Object.entries(gex.tickers)) m.set(k.toUpperCase(), v);
    return m;
  }, [gex]);

  const merged = useMemo((): Merged[] => {
    const byTicker = new Map<string, ResearchIdea>();
    for (const r of research || []) byTicker.set(r.ticker.toUpperCase(), r);
    const q = query.trim().toUpperCase();
    return sigData.tickers
      .filter((s) => dir === 'all' || s.direction === dir)
      .filter(
        (s) =>
          !q ||
          s.ticker.toUpperCase().includes(q) ||
          (s.asset_name || '').toUpperCase().includes(q),
      )
      .map((sig) => {
        const idea = byTicker.get(sig.ticker.toUpperCase()) ?? null;
        const signal = idea ? Math.round(0.45 * sig.flow_score + 0.55 * idea.score) : sig.flow_score;
        return { sig, idea, signal };
      })
      .sort((a, b) => {
        if (sort === 'flow') return b.sig.flow_score - a.sig.flow_score;
        if (sort === 'pup') return (b.idea?.p_up ?? -1) - (a.idea?.p_up ?? -1);
        return b.signal - a.signal;
      });
  }, [sigData, research, dir, sort, query]);

  const researched = merged.filter((m) => m.idea).length;

  return (
    <div className="mb-scanner-section">
      <p className="mb-section-note">
        {merged.length} tickers with unusual disclosed flow · updated {fmtDate(sigData.generated_at)}
        {researched > 0 ? ` · ${researched} with research deep-dives` : ''}
      </p>
      <div className="mb-filterbar">
        <input
          className="mb-search"
          type="search"
          placeholder="Search ticker or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search signals"
        />
        <div className="mb-seg" role="tablist" aria-label="Direction">
          {(['all', 'accumulation', 'distribution'] as DirFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              className={dir === d ? 'active' : ''}
              onClick={() => setDir(d)}
            >
              {d === 'all' ? 'All' : DIR_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="mb-seg" role="tablist" aria-label="Sort">
          <button
            type="button"
            className={sort === 'signal' ? 'active' : ''}
            onClick={() => setSort('signal')}
          >
            Signal
          </button>
          <button
            type="button"
            className={sort === 'flow' ? 'active' : ''}
            onClick={() => setSort('flow')}
          >
            Flow
          </button>
          <button
            type="button"
            className={sort === 'pup' ? 'active' : ''}
            onClick={() => setSort('pup')}
          >
            P(up)
          </button>
        </div>
      </div>
      {merged.length > 0 ? (
        <>
          <div className="mb-collapse-row">
            <button type="button" className="mb-link-btn" onClick={expandAll}>
              Expand all
            </button>
            <span className="muted"> · </span>
            <button type="button" className="mb-link-btn" onClick={collapseAll}>
              Collapse all
            </button>
            <span className="muted small"> — tap a card for the thesis, levels and flow detail</span>
          </div>
          <div className="mb-signal-list">
            {merged.slice(0, 60).map((m) => (
              <SignalCard
                key={m.sig.ticker}
                m={m}
                gex={gexByTicker.get(m.sig.ticker.toUpperCase()) ?? null}
                gexAt={gex?.computed_at}
                watched={watched.includes(m.sig.ticker)}
                onToggleWatch={() => toggleWatch(m.sig.ticker)}
                force={force}
              />
            ))}
          </div>
          {merged.length > 60 ? (
            <p className="muted small footnote-line">
              Showing top 60 of {merged.length} — refine with the direction filter.
            </p>
          ) : null}
        </>
      ) : (
        <p className="muted">No signals match the current filter.</p>
      )}
    </div>
  );
}

/* ── Tab ─────────────────────────────────────────────────────────── */

export default function ScannerTab() {
  const { data: brief, loading: bLoading, error: bError } = useJsonData<DailyBrief>('daily-brief.json');
  const { data: sigData, loading: sLoading, error: sError } = useJsonData<SignalsFile>('signals.json');
  const { data: research } = useJsonData<ResearchIdea[]>('research.json');
  const { data: gex } = useJsonData<GexFile>('gex.json');
  const { data: gexChanges } = useJsonData<GexChangesFile>('gex-changes.json');
  const [watched, toggleWatch] = useWatchlist();

  // Live delayed quotes for the top names on screen.
  useEffect(() => {
    const tickers = [
      ...(brief?.breakout_candidates.map((c) => c.ticker) ?? []),
      ...(sigData?.tickers.slice(0, 60).map((t) => t.ticker) ?? []),
    ];
    if (tickers.length > 0) setQuoteUniverse([...new Set(tickers)]);
  }, [brief, sigData]);

  if (bLoading || sLoading) return <LoadingPanel what="scanner" />;
  if (bError || !brief)
    return <ErrorPanel file="public/data/daily-brief.json" error={bError ?? 'empty file'} />;
  if (sError || !sigData)
    return <ErrorPanel file="public/data/signals.json" error={sError ?? 'empty file'} />;

  const breakoutCount = brief.breakout_candidates.length;
  const signalCount = sigData.tickers.length;

  return (
    <section className="tab mb-scanner">
      <h2 className="mb-tabhead">Scanner</h2>
      <p className="mb-lede">
        Everything the scans found, in one place — breakout setups, smart-money
        flow, the reversal playbook and the gamma lens. Tap any card to open it;
        everything starts collapsed.
      </p>

      <MbCard
        num="01"
        title="Breakout candidates"
        sub="stocks setting up to break out in the next 1–2 weeks"
        count={`${breakoutCount}`}
      >
        <BreakoutSection brief={brief} />
      </MbCard>

      <MbCard
        num="02"
        title="Smart-money signals"
        sub="unusual disclosed buying and selling, ranked"
        count={`${signalCount} tickers`}
      >
        <SignalsSection sigData={sigData} research={research} gex={gex} watched={watched} toggleWatch={toggleWatch} />
      </MbCard>

      <MbCard num="03" title="How the scanner ranks" sub="the method, in plain English">
        <div className="mb-method">
          <p>
            <b>Flow score (0–100).</b> How much disclosed buying or selling pressure a
            stock has from Congress and White House filings — the amount traded,
            how many officials traded it, and how recent the filings are, over a
            90-day window. <b>Accumulation</b> means officials bought a lot more
            than they sold; <b>distribution</b> is the reverse.
          </p>
          <p>
            <b>Research score (0–100).</b> When the research agent has done a
            deep-dive on a name, it scores the setup on its own checks — earnings,
            trend, valuation and quality — and estimates <b>P(up 30d)</b>, the
            probability the stock closes higher in 30 days. That is a model
            judgment, not a calibrated forecast.
          </p>
          <p>
            <b>Cluster.</b> Two or more officials bought the same stock within
            about a week — flagged because coordinated buying is a stronger signal
            than a single trade.
          </p>
          <p>
            <b>Combined signal.</b> When a research deep-dive exists, the ranking
            is 0.45 × flow score + 0.55 × research score. When there is no
            deep-dive yet, the ranking is the flow score alone. Deep-dives run
            Sunday and Wednesday nights on the top flow names.
          </p>
          <p className="muted small">
            Research and education only — not financial advice.
          </p>
        </div>
      </MbCard>

      <MbCard num="04" title="Reversal playbook" sub="the zone + trigger + exit system">
        <div className="mb-playbook">
          <Playbook />
        </div>
      </MbCard>

      <MbCard
        num="05"
        title="Gamma — futures lens & alerts"
        sub="dealer positioning for ES / NQ and what changed"
        count={gex ? `as of ${fmtDate(gex.computed_at)}` : undefined}
      >
        <div className="mb-gamma">
          {gex ? (
            <FuturesGamma gex={gex} />
          ) : (
            <p className="muted">Gamma data has not loaded yet — check back after the next run.</p>
          )}
          <GexAlerts changes={gexChanges ?? null} watched={watched} />
          {gexChanges && gexChanges.changes.length === 0 ? (
            <p className="muted small footnote-line">
              No gamma exposure changes since{' '}
              {gexChanges.prev_computed_at ? fmtDate(gexChanges.prev_computed_at) : 'the baseline'}.
            </p>
          ) : null}
          <p className="muted small footnote-line">
            Gamma reads dealer hedging pressure: when dealers are short gamma they
            tend to amplify moves; when long, they tend to pin price. Star a
            ticker in the signals list above and its gamma changes jump to the top
            of the alerts.
          </p>
        </div>
      </MbCard>
    </section>
  );
}
