import type { PremarketQuote } from '../lib/quotes';
import { fmtMoney } from '../lib/format';

/**
 * One-line extended-hours quote: amber dot + "Pre-market $345.39 +0.71% · 8:20 AM EDT".
 * Renders nothing when there is no extended-hours quote (regular session).
 */
export default function PremarketLine({ pm }: { pm: PremarketQuote | null }) {
  if (!pm) return null;
  const label = pm.session === 'PRE_MKT' ? 'Pre-market' : 'After-hours';
  const pct =
    pm.changePct != null && isFinite(pm.changePct)
      ? ` ${pm.changePct >= 0 ? '+' : ''}${pm.changePct.toFixed(2)}%`
      : '';
  return (
    <span className="subname pmline" title={`${label} quote from the free CNBC feed`}>
      <span className="pmdot" aria-hidden="true" />
      {label} {fmtMoney(pm.price)}
      {pct}
      {pm.time ? ` · ${pm.time}` : ''}
    </span>
  );
}
