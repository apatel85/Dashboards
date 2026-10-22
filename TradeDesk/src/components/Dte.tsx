import { SignalBadge, Chip, Stat, TvLink } from './ui';
import PremarketLine from './PremarketLine';
import { Fundamentals } from './Fundamentals';
import { useLivePrice } from '../lib/quotes';
import { fmtMoney, fmtPct, fmtOcc, fmtK, splitThesis, prettifyOptions } from '../lib/format';
import type { DtePick } from '../types';

export function DteCard({ p }: { p: DtePick }) {
  const lp = useLivePrice(p.ticker, p.underlying_price);
  const { main: thesisMain, unusual } = splitThesis(p.thesis || '');
  return (
    <div className="dte-card">
      <div className="dte-head">
        <TvLink ticker={p.ticker} />
        <SignalBadge signal={p.bias} />
      </div>
      <div className="dte-stats">
        <Stat
          label={lp.live ? 'Underlying · live' : 'Underlying'}
          value={
            <>
              {lp.live ? <span className="livedot" title="Live ~15-min delayed quote" /> : null}
              {fmtMoney(lp.price)}
            </>
          }
        />
        <Stat label="IV rank" value={p.iv_rank != null ? `${p.iv_rank}` : '—'} />
        <Stat label="Exp. move" value={fmtPct(p.expected_move_pct, 1, false)} />
      </div>
      <PremarketLine pm={lp.premarket} />
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
      <p className="dte-thesis">{prettifyOptions(thesisMain)}</p>
      {unusual.length > 0 ? (
        <div className="unusual-block">
          <span className="detail-label">Unusual options</span>
          <div className="chips">
            {unusual.map((u, i) => (
              <span className="opt-chip" key={`${u.sym}-${i}`}>
                <strong>{fmtOcc(u.sym)}</strong>
                <span className="muted">
                  {u.vol != null ? `vol ${fmtK(u.vol)}` : ''}
                  {u.vol != null && u.oi != null ? ' · ' : ''}
                  {u.oi != null ? `OI ${fmtK(u.oi)}` : ''}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <Fundamentals ticker={p.ticker} />
    </div>
  );
}
