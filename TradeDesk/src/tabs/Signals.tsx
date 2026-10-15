import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Chip,
  ScoreBar,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { setQuoteUniverse, useLivePrice } from '../lib/quotes';
import PremarketLine from '../components/PremarketLine';
import { fmtDate, fmtMoney, fmtTimeET } from '../lib/format';
import type { ResearchIdea, SignalTicker, SignalsFile } from '../types';

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

function PupBadge({ p }: { p: number | null }) {
  if (p == null) return <span className="muted small">research pending</span>;
  const tone = p >= 60 ? 'green' : p >= 45 ? 'amber' : 'red';
  return (
    <span className="pup" title="Agent-estimated probability the stock closes higher 30 days out. Model judgment — not a calibrated statistic.">
      <Badge tone={tone}>P(up 30d) {p}%</Badge>
    </span>
  );
}

function SignalCard({ m }: { m: Merged }) {
  const [open, setOpen] = useState(false);
  const { sig, idea } = m;
  const lp = useLivePrice(sig.ticker, null);
  return (
    <article className={`panel signal-card${open ? ' open' : ''}`}>
      <button className="signal-main" onClick={() => setOpen((o) => !o)}>
        <span className="signal-top">
          <span>
            <span className="ticker big">{sig.ticker}</span>
            <span className="subname">{sig.asset_name}</span>
          </span>
          <span className="signal-dir">
            <Badge tone={DIR_TONE[sig.direction] ?? 'dim'}>{DIR_LABEL[sig.direction]}</Badge>
            {sig.cluster ? <Badge tone="amber">Cluster</Badge> : null}
          </span>
        </span>
        <span className="signal-mid">
          <span className="signal-price num">
            {lp.live ? <span className="livedot" title="Live ~15-min delayed quote" /> : null}
            {lp.price != null ? fmtMoney(lp.price) : <span className="muted">—</span>}
          </span>
          <PupBadge p={idea?.p_up ?? null} />
        </span>
        {lp.premarket ? <PremarketLine pm={lp.premarket} /> : null}
        <span className="signal-scores">
          <span className="signal-score">
            <span className="detail-label">Flow</span>
            <ScoreBar value={sig.flow_score} small />
          </span>
          {idea ? (
            <span className="signal-score">
              <span className="detail-label">Research</span>
              <ScoreBar value={idea.score} small />
            </span>
          ) : (
            <span className="muted small">deep-dive pending</span>
          )}
        </span>
        <span className="signal-meta muted small">
          Net {fmtFlow(sig.net_flow)} · {sig.officials} official{sig.officials === 1 ? '' : 's'} ·{' '}
          {sig.buy_trades + sig.sell_trades} trades · latest {fmtDate(sig.latest_ref_date)}
        </span>
      </button>
      {open && (
        <div className="signal-detail">
          {idea ? (
            <>
              <p className="idea-thesis">{idea.thesis}</p>
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
        </div>
      )}
    </article>
  );
}

export default function SignalsTab() {
  const { data: sigData, loading: sLoading, error: sError } = useJsonData<SignalsFile>('signals.json');
  const { data: research } = useJsonData<ResearchIdea[]>('research.json');

  const [dir, setDir] = useState<DirFilter>('all');
  const [sort, setSort] = useState<SortKey>('signal');

  const merged = useMemo((): Merged[] => {
    if (!sigData) return [];
    const byTicker = new Map<string, ResearchIdea>();
    for (const r of research || []) byTicker.set(r.ticker.toUpperCase(), r);
    return sigData.tickers
      .filter((s) => dir === 'all' || s.direction === dir)
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
  }, [sigData, research, dir, sort]);

  // Live delayed quotes for the top names on screen.
  useEffect(() => {
    if (sigData) setQuoteUniverse(sigData.tickers.slice(0, 60).map((t) => t.ticker));
  }, [sigData]);

  if (sLoading) return <LoadingPanel what="smart-money signals" />;
  if (sError || !sigData)
    return <ErrorPanel file="public/data/signals.json" error={sError ?? 'empty file'} />;

  const researched = merged.filter((m) => m.idea).length;

  return (
    <section className="tab">
      <header className="tab-header">
        <h2>Smart-money signals</h2>
        <p className="muted">
          {merged.length} tickers with unusual disclosed flow · updated {fmtDate(sigData.generated_at)}
          {researched > 0 ? ` · ${researched} with research deep-dives` : ''}
        </p>
      </header>

      <div className="callout">
        <span className="detail-label">How to read this</span>
        <p>
          <b>Flow</b> scores disclosed buying/selling pressure from Congress +
          White House filings (amount × officials × recency, 90-day window).{' '}
          <b>P(up 30d)</b> is the research agent's estimated probability the stock
          closes higher in 30 days — a model judgment, not a calibrated forecast.
          Research deep-dives run Sun/Wed nights on the top flow names. Research
          and education only — not financial advice.
        </p>
      </div>

      <div className="panel filterbar">
        <div className="seg" role="tablist" aria-label="Direction">
          {(['all', 'accumulation', 'distribution'] as DirFilter[]).map((d) => (
            <button key={d} className={dir === d ? 'active' : ''} onClick={() => setDir(d)}>
              {d === 'all' ? 'All' : DIR_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="Sort">
          <button className={sort === 'signal' ? 'active' : ''} onClick={() => setSort('signal')}>
            Signal
          </button>
          <button className={sort === 'flow' ? 'active' : ''} onClick={() => setSort('flow')}>
            Flow
          </button>
          <button className={sort === 'pup' ? 'active' : ''} onClick={() => setSort('pup')}>
            P(up)
          </button>
        </div>
      </div>

      {merged.length > 0 ? (
        <>
          <SectionHead
            title={dir === 'all' ? 'Ranked signals' : DIR_LABEL[dir]}
            sub="Tap a card for the thesis, levels and flow detail"
          />
          <div className="signal-list">
            {merged.slice(0, 60).map((m) => (
              <SignalCard key={m.sig.ticker} m={m} />
            ))}
          </div>
          {merged.length > 60 ? (
            <p className="muted small footnote-line">
              Showing top 60 of {merged.length} — refine with the direction filter.
            </p>
          ) : null}
        </>
      ) : (
        <div className="panel">
          <p className="muted">No signals match the current filter.</p>
        </div>
      )}
    </section>
  );
}
