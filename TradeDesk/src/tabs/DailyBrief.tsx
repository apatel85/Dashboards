import { useState } from 'react';
import EmptyState from '../components/EmptyState';
import {
  ScoreBar,
  Badge,
  IndexBadges,
  SignalBadge,
  TrendArrow,
  Chip,
  Stat,
  SectionHead,
  LoadingPanel,
  ErrorPanel,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { fmtMoney, fmtPct, fmtFullDate, fmtTimeET, prettify } from '../lib/format';
import type { DailyBrief, BreakoutCandidate, DtePick, SectorPerf, MarketRegime } from '../types';

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

function BreakoutRow({ c }: { c: BreakoutCandidate }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="clickable" onClick={() => setOpen((o) => !o)} title="Click for thesis">
        <td>
          <span className="ticker">{c.ticker}</span>
          <span className="subname">{c.name}</span>
        </td>
        <td className="num">
          {fmtMoney(c.price)}
          <span className="subname">{c.price_ts ? fmtTimeET(c.price_ts) : ''}</span>
        </td>
        <td>
          <IndexBadges items={c.index_membership} />
        </td>
        <td>
          {c.sector}
          <span className="subname">{c.subsector}</span>
        </td>
        <td className="setup">{c.setup}</td>
        <td className="num">
          <span className="up">{fmtMoney(c.trigger_price)}</span>
          {' / '}
          <span className="down">{fmtMoney(c.stop_price)}</span>
        </td>
        <td>
          <ScoreBar value={c.score} small />
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="detail-grid">
              <div className="detail-thesis">{c.thesis}</div>
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
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DteCard({ p }: { p: DtePick }) {
  return (
    <div className="dte-card">
      <div className="dte-head">
        <span className="ticker">{p.ticker}</span>
        <SignalBadge signal={p.bias} />
      </div>
      <div className="dte-stats">
        <Stat label="Underlying" value={fmtMoney(p.underlying_price)} />
        <Stat label="IV rank" value={p.iv_rank != null ? `${p.iv_rank}` : '—'} />
        <Stat label="Exp. move" value={fmtPct(p.expected_move_pct, 1, false)} />
      </div>
      <div className="dte-levels">
        <span className="detail-label">Key levels</span>
        <div className="chips">
          {p.key_levels.length > 0 ? (
            p.key_levels.map((k) => <Chip key={k}>{fmtMoney(k)}</Chip>)
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>
      <p className="dte-thesis">{p.thesis}</p>
    </div>
  );
}

function SectorTable({ rows }: { rows: SectorPerf[] }) {
  if (rows.length === 0) return <p className="muted">No sectors in this group.</p>;
  return (
    <div className="table-scroll">
      <table className="dtable">
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
                {s.sector} <span className="subname">{s.etf}</span>
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

export default function DailyBriefTab() {
  const { data, loading, error } = useJsonData<DailyBrief>('daily-brief.json');

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

  return (
    <section className="tab">
      <div className="panel brief-head">
        <div className="brief-head-main">
          <div className="eyebrow">Daily Brief · {brief.universe}</div>
          <h2>{fmtFullDate(brief.brief_date)}</h2>
          <p className="regime-notes">{brief.regime_notes}</p>
        </div>
        <div className="brief-head-side">
          <Badge tone={REGIME_TONE[brief.market_regime]}>{REGIME_LABEL[brief.market_regime]}</Badge>
          <div className="muted small">Generated {fmtTimeET(brief.generated_at)}</div>
        </div>
      </div>

      <SectionHead
        title="Breakout candidates"
        sub="1–2 week window · scored on confluence"
      />
      {hasCandidates ? (
        <div className="table-scroll">
          <table className="dtable">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Price</th>
                <th>Index</th>
                <th>Sector</th>
                <th>Setup</th>
                <th>Trigger / Stop</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {brief.breakout_candidates.map((c) => (
                <BreakoutRow key={c.ticker} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          dataFile="public/data/daily-brief.json"
          loading={false}
          error={null}
          items={['No breakout candidates met the scoring cutoffs in this run.']}
        />
      )}

      <SectionHead title="0DTE / 1DTE focus" sub="High-liquidity names · options lens" />
      <div className="dte-grid">
        <div>
          <h4 className="dte-title">0DTE — expires today</h4>
          {brief.dte_focus.zero_dte.length > 0 ? (
            brief.dte_focus.zero_dte.map((p) => <DteCard key={p.ticker} p={p} />)
          ) : (
            <p className="muted">No 0DTE names flagged.</p>
          )}
        </div>
        <div>
          <h4 className="dte-title">1DTE — expires tomorrow</h4>
          {brief.dte_focus.one_dte.length > 0 ? (
            brief.dte_focus.one_dte.map((p) => <DteCard key={p.ticker} p={p} />)
          ) : (
            <p className="muted">No 1DTE names flagged.</p>
          )}
        </div>
      </div>

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
      {brief.rotation_notes ? (
        <div className="callout">
          <span className="detail-label">Rotation</span>
          <p>{brief.rotation_notes}</p>
        </div>
      ) : null}
    </section>
  );
}
