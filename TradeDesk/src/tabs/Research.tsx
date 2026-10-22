import {
  ScoreBar,
  Badge,
  IndexBadges,
  SignalBadge,
  Chip,
  Stat,
  PassFail,
  LoadingPanel,
  ErrorPanel,
  TvLink,
} from '../components/ui';
import { useJsonData } from '../lib/useJsonData';
import { fmtMoney, fmtPct, fmtTimeET, prettify } from '../lib/format';
import { Fundamentals } from '../components/Fundamentals';
import type { ResearchIdea } from '../types';

function IdeaCard({ idea }: { idea: ResearchIdea }) {
  return (
    <article className="panel idea-card">
      <header className="idea-head">
        <div>
          <TvLink ticker={idea.ticker} className="big" />
          <span className="subname">{idea.name}</span>
          <div className="idea-sub">
            {idea.sector} · {idea.subsector} <IndexBadges items={idea.index_membership} />
          </div>
        </div>
        <div className="idea-score">
          <span className="num big">{idea.score}</span>
          <span className="muted small">/ 100</span>
        </div>
      </header>

      <p className="idea-thesis">{idea.thesis}</p>

      <div className="idea-grid">
        <div>
          <span className="detail-label">Score breakdown</span>
          <div className="breakdown">
            {idea.score_breakdown.map((s) => (
              <div className="breakdown-row" key={s.attribute}>
                <span className="breakdown-attr" title={s.note}>
                  {prettify(s.attribute)}
                  <span className="muted"> · {Math.round(s.weight * 100)}%</span>
                </span>
                <ScoreBar value={s.score} small />
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="detail-label">Trade frame</span>
          <div className="framestats">
            <Stat label="Trigger" value={fmtMoney(idea.trigger_price)} />
            <Stat label="Stop" value={fmtMoney(idea.stop_price)} />
            <Stat label="RS rank" value={idea.rs_rank != null ? idea.rs_rank : '—'} />
            <Stat label="Dist. 52w high" value={fmtPct(idea.distance_from_52w_high_pct, 1, false)} />
          </div>
          <div className="idea-badges">
            <PassFail pass={idea.trend_template_pass} label="Trend template" />
            <Badge tone="outline">{idea.stage}</Badge>
            <SignalBadge signal={idea.sentiment} />
            <PassFail pass={idea.quality_gate_pass} label="Quality gate" />
            {idea.unusual_options ? <Badge tone="amber">Unusual options</Badge> : null}
          </div>
          {idea.invalidation ? (
            <p className="invalidation">
              <span className="detail-label">Invalidation: </span>
              {idea.invalidation}
            </p>
          ) : null}
          {idea.quality_flags.length > 0 ? (
            <ul className="flag-list">
              {idea.quality_flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {(idea.insider_clusters.length > 0 || idea.congress_buys > 0) && (
        <div className="idea-smart">
          <span className="detail-label">Smart money</span>
          <div className="chips">
            {idea.insider_clusters.map((c, i) => (
              <Chip key={i}>
                {c.insider_role}: {c.buys_7d} buys
                {c.total_usd != null ? ` · ${fmtMoney(c.total_usd, 0)}` : ''}
                {c.first_time_buyer ? ' · first-time' : ''}
              </Chip>
            ))}
            {idea.congress_buys > 0 ? (
              <Chip>
                {idea.congress_buys} congressional buy{idea.congress_buys === 1 ? '' : 's'}
              </Chip>
            ) : null}
          </div>
        </div>
      )}

      {idea.analyst_notes.length > 0 && (
        <div className="idea-notes">
          <span className="detail-label">Agent notes</span>
          {idea.analyst_notes.map((n, i) => (
            <div className="note" key={i}>
              <span className="note-agent">{prettify(n.agent)}</span>{' '}
              <SignalBadge signal={n.stance} />
              <p>{n.summary}</p>
            </div>
          ))}
        </div>
      )}

      <div className="muted small">Updated {fmtTimeET(idea.updated_at)}</div>
      <Fundamentals ticker={idea.ticker} />
    </article>
  );
}

export default function ResearchTab() {
  const { data, loading, error } = useJsonData<ResearchIdea[]>('research.json');

  if (loading) return <LoadingPanel what="research ideas" />;
  if (error)
    return <ErrorPanel file="public/data/research.json" error={error} />;

  if (!data || data.length === 0) {
    return (
      <section className="tab">
        <header className="tab-header">
          <h2>Research</h2>
          <p className="muted">Agentic stock research — scored ideas with full attribution.</p>
        </header>
        <div className="panel empty-state">
          <div className="empty-title">Research engine pending</div>
          <p className="muted">
            The research flow (technical / fundamental / news / sentiment analysts →
            bull-vs-bear debate → scored idea) runs <b>Sun &amp; Wed nights</b>. The
            first run hasn't landed yet — check back after the next scheduled run.
          </p>
          <div className="empty-subtitle">What each idea will carry</div>
          <ul className="empty-list">
            <li>0–100 confluence score with per-attribute breakdown and weights</li>
            <li>Minervini trend-template check, Weinstein stage, RS rank</li>
            <li>Insider clusters, congressional buys, unusual options, sentiment</li>
            <li>Trigger, stop, and what would invalidate the thesis</li>
            <li>Per-agent notes from the debate (bull, bear, risk)</li>
          </ul>
        </div>
      </section>
    );
  }

  const ranked = [...data].sort((a, b) => b.score - a.score);
  return (
    <section className="tab">
      <header className="tab-header">
        <h2>Research</h2>
        <p className="muted">
          {ranked.length} ranked ideas · bull-vs-bear debated · scores 0–100.
        </p>
      </header>
      <div className="idea-list">
        {ranked.map((idea) => (
          <IdeaCard key={idea.ticker} idea={idea} />
        ))}
      </div>
    </section>
  );
}
