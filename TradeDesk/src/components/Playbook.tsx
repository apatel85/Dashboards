import { SectionHead } from './ui';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="thesis-line">
      <strong>{title}</strong>
      <ul className="bullet-list" style={{ marginTop: 4 }}>
        {children}
      </ul>
    </div>
  );
}

export function Playbook() {
  return (
    <>
      <SectionHead
        title="📋 Reversal playbook — one page"
        sub="The zone + trigger + exit system from the backtests. Tape it to your monitor."
      />
      <div className="signal-card open">
        <div className="signal-body">
          <Block title="1 · Map the zones — before the session (daily + 4H)">
            <li>Prior swing highs/lows, especially multi-touch levels</li>
            <li>Round numbers — the most evidence-backed levels (ES 6800/6900, NQ equivalents)</li>
            <li>Gamma walls, flip and magnet from the gamma panel above</li>
            <li>Prior-day / overnight high/low: session reference only, no measured reversal edge</li>
          </Block>
          <Block title="2 · Wait for the trigger — 15m (decisions happen here)">
            <li>Price tags a mapped zone</li>
            <li>Rejection wick: hammer at support, shooting star at resistance</li>
            <li>Volume ≥ 1.8× the 20-bar average on the touch bar</li>
            <li>RSI with the trend: ≥ 55 for longs at support, ≤ 45 for shorts at resistance</li>
            <li>Price on the right side of EMA50</li>
          </Block>
          <Block title="3 · Enter — 3m (precision only, no decisions here)">
            <li>Enter on 3m confirmation in the trigger direction</li>
            <li>Stop: 0.5× ATR(15m) beyond the zone</li>
          </Block>
          <Block title="4 · Exits — never all at once">
            <li>Scale half at 0.75–1× ATR(15m) or the nearest minor level — bounces die here</li>
            <li>Move stop to breakeven after the first scale-out</li>
            <li>Trail the runner under the latest 3m swing low/high — let the market take you out</li>
            <li>Time stop: nothing happens in 5–10 15m bars → exit, dead money</li>
            <li>Exit alarm: rejection wick + volume spike <em>against</em> you near target → take the rest off, don't wait for the print</li>
          </Block>
          <Block title="5 · Skip the trade when">
            <li>Dealer gamma is LONG into the zone (pinning headwind)</li>
            <li>The level already broke and reclaimed (stop hunt — stand aside)</li>
            <li>No volume on the touch — unconfirmed</li>
          </Block>
          <p className="muted small footnote-line">
            Why: zones alone bounce ~53% (n=3,586, coin flip); with the trigger conditions 62–93%.
            Mechanical fixed-target entries didn't validate — the edge is in selecting which touches to take,
            and most bounces exhaust at 0.75–1 ATR. Research and education only — not financial advice.
          </p>
        </div>
      </div>
    </>
  );
}
