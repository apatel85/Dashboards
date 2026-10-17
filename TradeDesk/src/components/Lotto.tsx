import { useState } from 'react';
import { Badge, SectionHead, Stat, TvLink } from './ui';
import { prettifyOptions } from '../lib/format';
import type { LottoCandidate, LottoFile } from '../types';

const SETUP_LABEL: Record<string, string> = {
  'IGNITION-WATCH': 'Momentum ignition',
  'CHEAP-IV': 'Cheap-IV breakout',
  'FRIDAY-PIN': 'Friday pin-break',
  'UNUSUAL-FLOW': 'Unusual flow',
  'MOMENTUM-WATCH': 'Momentum watch',
};

function dirTone(d: string): 'green' | 'red' | 'amber' {
  return d === 'CALL' ? 'green' : d === 'PUT' ? 'red' : 'amber';
}

function LottoCard({ c, rank }: { c: LottoCandidate; rank: number }) {
  const [open, setOpen] = useState(rank < 3);
  return (
    <div className={`signal-card${open ? ' open' : ''}`}>
      <div
        className="signal-head"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o);
        }}
      >
        <span className="rank num">#{rank + 1}</span>
        <TvLink ticker={c.ticker} />
        <Badge tone={dirTone(c.direction)}>{c.direction}</Badge>
        <Badge tone={c.setup_validated ? 'green' : 'dim'}>
          {c.setup_validated ? '✓ validated' : c.setup_validated === false ? 'experimental' : 'unscored'}
        </Badge>
        <span className="score num">{c.score}</span>
        <span className="chev">{open ? '▾' : '▸'}</span>
      </div>
      <div className="signal-sub muted small">
        {SETUP_LABEL[c.setup] ?? c.setup}
        {c.expected_move_pct != null ? ` · 0DTE expected ±${c.expected_move_pct}%` : ''}
        {c.iv_pct != null ? ` · IV ${c.iv_pct}%` : ''}
      </div>
      {open && (
        <div className="signal-body">
          <div className="thesis-line">
            <strong>Trigger:</strong> {c.entry_trigger}
          </div>
          <div className="thesis-line">
            <strong>Invalidation:</strong> {c.invalidation}
          </div>
          {c.targets?.length ? (
            <div className="thesis-line">
              <strong>Targets:</strong> {c.targets.map((t) => `$${t}`).join(' → ')}
            </div>
          ) : null}
          {c.suggested_ticket ? (
            <div className="thesis-line ticket-box">
              <strong>🎟 Suggested ticket:</strong> {c.direction === 'CALL' ? 'call' : 'put'} ${c.suggested_ticket.strike}{' '}
              @ ${c.suggested_ticket.premium} (Δ {c.suggested_ticket.delta})
              <br />
              <span className="muted">
                Breakeven ${c.suggested_ticket.breakeven} ({c.suggested_ticket.breakeven_pct}% move needed) ·
                target ${c.suggested_ticket.target} ({c.suggested_ticket.target_source}) →
                ≈ ${c.suggested_ticket.value_at_target} intrinsic ({c.suggested_ticket.multiple_at_target}×)
                · needs {c.suggested_ticket.move_for_2x_pct}% for a double
              </span>
            </div>
          ) : null}
          {c.gamma_0dte ? (
            <div className="thesis-line small">
              <strong>Γ 0DTE:</strong> <span className="muted">{c.gamma_0dte}</span>
            </div>
          ) : null}
          <div className="stat-grid">
            <Stat label="Spot" value={`$${c.spot}`} />
            {c.expiry_0dte ? <Stat label="0DTE exp" value={c.expiry_0dte.slice(5)} /> : null}
            {c.expiry_1dte ? <Stat label="1DTE exp" value={c.expiry_1dte.slice(5)} /> : null}
            <Stat
              label="Day vol / OI"
              value={`${c.unusual.vol_oi_ratio}×`}
              accent={c.unusual.vol_oi_ratio >= 1 ? 'up' : undefined}
            />
            {c.rv20_pct != null ? <Stat label="20d realized" value={`${c.rv20_pct}%`} /> : null}
            {c.gamma_regime ? <Stat label="Gamma" value={c.gamma_regime} /> : null}
          </div>
          {c.friday_pin ? (
            <div className="thesis-line">
              <strong>📌 Friday pin:</strong> max OI at ${c.friday_pin.strike} ({c.friday_pin.distPct}% away)
            </div>
          ) : null}
          {c.unusual.hot_strikes?.length ? (
            <div className="thesis-line small muted">
              Hot strikes: {c.unusual.hot_strikes.map((h) => `$${h.strike} ${h.side} (${(h.volume / 1000).toFixed(0)}k vol)`).join(' · ')}
            </div>
          ) : null}
          {c.notes?.length ? (
            <ul className="bullet-list">
              {c.notes.map((n, i) => (
                <li key={i}>{prettifyOptions(n)}</li>
              ))}
            </ul>
          ) : null}
          <p className="muted small footnote-line">
            Educational research only — not financial advice. 0DTE options can go to zero the same day.
          </p>
        </div>
      )}
    </div>
  );
}

export function LottoScanner({ lotto }: { lotto: LottoFile | null }) {
  if (!lotto) return null;
  const vs = lotto.validation_summary ?? {};
  const keys = Object.keys(vs);
  return (
    <>
      <SectionHead
        title={`🎰 Lotto scanner — top 25 ${lotto.is_friday ? 'Friday 0DTE' : '0DTE/1DTE'}`}
        sub={`as of ${lotto.as_of} · ${lotto.candidates_considered} names scored · tap a card for trigger, invalidation and targets`}
      />
      {keys.length > 0 && (
        <div className="chip-row">
          {keys.map((k) => (
            <Badge key={k} tone={vs[k].validated ? 'green' : 'dim'}>
              {k.replace('S1_', '').replace('S2_', '').replace('S3_', '').replace('_', ' ')} {vs[k].validated ? '✓' : '✗'} n={vs[k].n}
            </Badge>
          ))}
        </div>
      )}
      <div className="signal-list">
        {lotto.candidates.map((c, i) => (
          <LottoCard key={c.ticker} c={c} rank={i} />
        ))}
      </div>
      <p className="muted small footnote-line">
        Setups backtested on 2y daily + 1mo intraday data; ticket P&amp;L modeled with Black-Scholes (IV ≈ trailing realized vol). Only ✓ validated setups cleared positive expectancy after friction.
      </p>
    </>
  );
}
