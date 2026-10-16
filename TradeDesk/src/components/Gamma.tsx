import { useMemo, useState } from 'react';
import { Badge, Chip, SectionHead } from './ui';
import { fmtDate } from '../lib/format';
import type { GexChange, GexChangesFile, GexFile, GexTicker } from '../types';

/* ── watchlist (per-device stars) ─────────────────────────────────── */
const WATCH_KEY = 'td_watchlist';

export function useWatchlist(): [string[], (t: string) => void] {
  const [list, setList] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const toggle = (t: string) => {
    setList((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      try {
        localStorage.setItem(WATCH_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };
  return [list, toggle];
}

/* ── formatting ───────────────────────────────────────────────────── */
function fmtM(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  return `${s}$${a >= 100 ? a.toFixed(0) : a.toFixed(1)}M`;
}

function fmtPx(v: number): string {
  return v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : v >= 100 ? v.toFixed(v % 1 === 0 ? 0 : 2).replace(/\.00$/, '')
    : v.toFixed(2);
}

/** Scale a proxy ticker (e.g. QQQ×40 → NQ) for display. */
function scaled(g: GexTicker): GexTicker {
  const k = g.proxy_scale && g.proxy_scale !== 1 ? g.proxy_scale : 1;
  if (k === 1) return g;
  const px = (v: number | null) => (v == null ? v : Math.round(v * k * 100) / 100);
  return {
    ...g,
    spot: px(g.spot) as number,
    expiries: g.expiries.map((e) => ({
      ...e,
      flip_strike: px(e.flip_strike),
      magnet_strike: px(e.magnet_strike) as number,
      call_wall: px(e.call_wall) as number,
      put_wall: px(e.put_wall) as number,
      strikes: e.strikes.map((s) => ({ ...s, k: px(s.k) as number })),
    })),
    levels: g.levels.map((l) => ({ ...l, price: px(l.price) as number })),
  };
}

/* ── per-ticker gamma detail ──────────────────────────────────────── */
export function TickerGamma({ g, computedAt }: { g: GexTicker; computedAt?: string }) {
  const sg = useMemo(() => scaled(g), [g]);
  const [ei, setEi] = useState(0);
  const e = sg.expiries[Math.min(ei, sg.expiries.length - 1)];
  if (!e) return null;
  const neg = e.net_gex < 0;
  return (
    <div className="gamma">
      <div className="gamma-head">
        <span className="detail-label">Gamma exposure</span>
        {g.proxy_for ? (
          <span className="muted small" title={g.proxy_note}>
            {g.proxy_for} via {g.ticker.replace('^', '')}
          </span>
        ) : null}
        <span className="muted small">as of {computedAt ? fmtDate(computedAt) : '—'}</span>
      </div>
      <div className="seg small-seg" role="tablist" aria-label="Expiry">
        {sg.expiries.map((x, i) => (
          <button key={x.expiry} className={i === ei ? 'active' : ''} onClick={() => setEi(i)}>
            {x.dte === 0 ? '0DTE' : `${x.dte}d`}
          </button>
        ))}
      </div>
      <div className="chips" style={{ margin: '8px 0' }}>
        <Badge tone={sg.regime.direction === 'short' ? 'red' : sg.regime.direction === 'long' ? 'green' : 'dim'}>
          Gamma {sg.regime.direction.toUpperCase()}
          {sg.regime.confidence === 'firm' ? ' · firm' : sg.regime.confidence === 'contested' ? ' · contested' : ''}
        </Badge>
        <Badge tone={neg ? 'red' : 'green'}>Net {fmtM(e.net_gex)}</Badge>
        <Chip>
          Walls C {fmtPx(e.call_wall)} / P {fmtPx(e.put_wall)}
        </Chip>
        {e.flip_strike != null ? <Chip>Flip {fmtPx(e.flip_strike)}</Chip> : null}
      </div>
      <ul className="gamma-bullets">
        {sg.regime.bullet ? <li key="regime"><b>{sg.regime.bullet}</b></li> : null}
        {e.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {sg.levels.length > 0 ? (
        <>
          <div className="detail-label" style={{ marginTop: 8 }}>
            Key levels
          </div>
          <div className="levels">
            {sg.levels.slice(0, 6).map((l) => (
              <div className="level-row" key={`${l.price}-${l.type}`}>
                <span className="num level-price">{fmtPx(l.price)}</span>
                <Badge tone={l.type === 'support' ? 'green' : l.type === 'resistance' ? 'red' : 'dim'}>
                  {l.type === 'support' ? 'Support' : l.type === 'resistance' ? 'Resistance' : 'Pivot'}
                </Badge>
                {l.strength === 'strong' ? <Badge tone="amber">Strong</Badge> : null}
                <span className="muted small level-src">{l.sources.join(' + ')}</span>
              </div>
            ))}
          </div>
          {sg.level_bullets.length > 0 ? (
            <ul className="gamma-bullets">
              {sg.level_bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="muted small footnote-line">
        $M per 1% move, Black-Scholes from listed implied vol. Spot {fmtPx(sg.spot)} (~15-min
        delayed). Research only — not financial advice.
      </p>
    </div>
  );
}

/* ── futures panel: ES via SPX, NQ via QQQ ─────────────────────────── */
export function FuturesGamma({ gex }: { gex: GexFile | null }) {
  const [which, setWhich] = useState<'ES' | 'NQ'>('ES');
  const g = useMemo(() => {
    if (!gex) return null;
    const t = Object.values(gex.tickers).find((x) => x.proxy_for === which) ?? null;
    return t ? scaled(t) : null;
  }, [gex, which]);
  if (!gex || !g) return null;
  const e = g.expiries[0];
  return (
    <section className="panel futures-gamma">
      <div className="futures-head">
        <SectionHead title="Index gamma — futures lens" sub="ES via SPX · NQ via QQQ×40" />
        <div className="seg" role="tablist" aria-label="Futures">
          {(['ES', 'NQ'] as const).map((f) => (
            <button key={f} className={which === f ? 'active' : ''} onClick={() => setWhich(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {e ? (
        <>
          <div className="chips">
            <Badge tone={g.regime.direction === 'short' ? 'red' : g.regime.direction === 'long' ? 'green' : 'dim'}>
              {which} gamma {g.regime.direction.toUpperCase()}
              {g.regime.confidence === 'firm' ? ' · firm' : g.regime.confidence === 'contested' ? ' · contested' : ''}
            </Badge>
            <Chip>
              Spot {fmtPx(g.spot)}
            </Chip>
            <Chip>
              Walls C {fmtPx(e.call_wall)} / P {fmtPx(e.put_wall)}
            </Chip>
            {e.flip_strike != null ? <Chip>Flip {fmtPx(e.flip_strike)}</Chip> : null}
          </div>
          <ul className="gamma-bullets">
            {g.regime.bullet ? <li><b>{g.regime.bullet}</b></li> : null}
            {g.level_bullets.slice(0, 2).map((b, i) => (
              <li key={`l${i}`}>{b}</li>
            ))}
          </ul>
          <p className="muted small footnote-line" title={g.proxy_note}>
            Proxy: CME ES/NQ options have no free feed — SPX tracks ES tick-for-tick and
            QQQ×40 ≈ NQ, so index dealer gamma reads across to the futures.
          </p>
        </>
      ) : null}
    </section>
  );
}

/* ── change alerts ────────────────────────────────────────────────── */
const CHANGE_ICON: Record<GexChange['type'], string> = {
  flip: '🔄',
  swing: '⚡',
  wall_move: '🧱',
  new: '✨',
  gone: '🚫',
};

export function GexAlerts({
  changes,
  watched,
}: {
  changes: GexChangesFile | null;
  watched: string[];
}) {
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => {
    const all = changes?.changes ?? [];
    const isW = (t: string) => watched.includes(t);
    const sorted = [...all].sort((a, b) => Number(isW(b.ticker)) - Number(isW(a.ticker)));
    return showAll ? sorted : sorted.slice(0, 5);
  }, [changes, watched, showAll]);
  if (!changes || !changes.changes.length) return null;
  return (
    <section className="panel gex-alerts">
      <SectionHead
        title="Gamma alerts"
        sub={`exposure changes since ${changes.prev_computed_at ? fmtDate(changes.prev_computed_at) : 'baseline'} · ★ = your watchlist first`}
      />
      <ul className="alert-list">
        {list.map((c, i) => (
          <li key={i} className="alert-row">
            <span aria-hidden>{CHANGE_ICON[c.type]}</span>
            {watched.includes(c.ticker) ? (
              <span className="watch-star" aria-label="watched">
                ★
              </span>
            ) : null}
            <span>{c.detail}</span>
          </li>
        ))}
      </ul>
      {changes.changes.length > 5 ? (
        <button className="linklike small" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer' : `Show all ${changes.changes.length}`}
        </button>
      ) : null}
    </section>
  );
}
