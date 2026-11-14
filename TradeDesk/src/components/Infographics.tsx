/**
 * Shared infographic primitives — Mock B editorial-ledger style.
 *
 * Hand-rolled SVG-free charts (CSS bars only, no dependencies). Every chart
 * is computed at render time from the data file its tab already loads.
 * Numbers are always shown alongside the bar — a bar without its number
 * is decoration, and this app is not decorated.
 *
 * Honesty rules baked in here:
 * - A "hit trigger" rate is never drawn as a win. Wins are money made.
 * - A metric with no data yet renders an honest empty state, never a zero
 *   or a fake bar.
 */
import '../mockb-infographics.css';
import { fmtInt } from '../lib/format';

export type BarTone = 'up' | 'down' | 'amber' | 'blue' | 'dim';

/** One titled chart block: title, the chart, then one plain-English line
 * saying what it means. `note` is for the fine print (sample size, window). */
export function VizBlock({
  title,
  read,
  note,
  children,
}: {
  title: string;
  read?: React.ReactNode;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-viz">
      <h4 className="mb-viz-title">{title}</h4>
      {children}
      {read ? <p className="mb-viz-read">{read}</p> : null}
      {note ? <p className="mb-viz-note">{note}</p> : null}
    </div>
  );
}

/** One horizontal bar row: label on the left, bar in the middle, value on
 * the right (mono, bold). `pct` is the bar length as % of the longest bar
 * in its group — pass 0–100. */
export function HBar({
  label,
  sub,
  value,
  pct,
  tone,
}: {
  label: string;
  sub?: string;
  value: string;
  pct: number;
  tone: BarTone;
}) {
  return (
    <div className="mb-hbar-row">
      <span className="mb-hbar-label">
        {label}
        {sub ? <span className="mb-hbar-sub">{sub}</span> : null}
      </span>
      <span className="mb-hbar-track" aria-hidden="true">
        <span
          className={`mb-hbar-fill mb-hbar-${tone}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="mb-hbar-value num">{value}</span>
    </div>
  );
}

/** Stacked segmented bar (a funnel level): one bar split by share, with a
 * legend that always shows every segment's count — even the zeroes. */
export function SegBar({
  segments,
}: {
  segments: { label: string; count: number; tone: BarTone }[];
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  if (total <= 0) return null;
  const aria = segments.map((s) => `${s.label} ${s.count}`).join(', ');
  return (
    <div className="mb-segbar-wrap">
      <div className="mb-segbar" role="img" aria-label={aria}>
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span
              key={s.label}
              className={`mb-seg mb-seg-${s.tone}`}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
      </div>
      <div className="mb-seg-legend">
        {segments.map((s) => (
          <span key={s.label} className="mb-seg-key">
            <span className={`mb-seg-dot mb-seg-${s.tone}`} aria-hidden="true" />
            {s.label} · <b className="num">{fmtInt(s.count)}</b>
            {` (${Math.round((s.count / total) * 100)}%)`}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Vertical histogram: count on top of each bar, label underneath. Bars
 * scale to the tallest bucket. */
export function HistBars({
  buckets,
}: {
  buckets: { label: string; count: number; tone: BarTone }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const aria = buckets.map((b) => `${b.label}: ${b.count}`).join(', ');
  return (
    <div className="mb-hist" role="img" aria-label={aria}>
      {buckets.map((b) => (
        <div className="mb-hist-col" key={b.label}>
          <span className="mb-hist-count num">{fmtInt(b.count)}</span>
          <span
            className={`mb-hist-bar mb-hist-${b.tone}`}
            style={{ height: `${Math.max((b.count / max) * 84, b.count > 0 ? 3 : 0)}px` }}
          />
          <span className="mb-hist-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Honest empty state for a chart with no data yet: says what is missing
 * and why, instead of a zero or a fake bar. */
export function EmptyViz({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-viz-empty">
      <div className="mb-viz-empty-title">{title}</div>
      {children}
    </div>
  );
}

/** Trigger-distance strip (Scanner): one row per candidate — the stop's
 * distance below the price (red, left of centre) against the trigger's
 * distance above it (green, right of centre), on one shared scale so the
 * two sides are honestly comparable. */
export function TriggerStrip({
  rows,
}: {
  rows: { ticker: string; triggerPct: number | null; stopPct: number | null }[];
}) {
  const scale = Math.max(
    1,
    ...rows.flatMap((r) => [r.triggerPct ?? 0, r.stopPct ?? 0]),
  );
  return (
    <div className="mb-strip">
      <div className="mb-strip-head" aria-hidden="true">
        <span>Stop below</span>
        <span>Price</span>
        <span>Trigger above</span>
      </div>
      {rows.map((r) => (
        <div className="mb-strip-row" key={r.ticker}>
          <span className="mb-strip-ticker num">{r.ticker}</span>
          <span className="mb-strip-track" aria-hidden="true">
            <span className="mb-strip-half mb-strip-left">
              <span
                className="mb-strip-fill mb-strip-down"
                style={{ width: `${((r.stopPct ?? 0) / scale) * 100}%` }}
              />
            </span>
            <span className="mb-strip-mid" />
            <span className="mb-strip-half mb-strip-right">
              <span
                className="mb-strip-fill mb-strip-up"
                style={{ width: `${((r.triggerPct ?? 0) / scale) * 100}%` }}
              />
            </span>
          </span>
          <span className="mb-strip-vals num">
            {r.triggerPct != null ? `+${r.triggerPct.toFixed(1)}%` : '—'}
            {' · '}
            {r.stopPct != null ? `−${r.stopPct.toFixed(1)}%` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
