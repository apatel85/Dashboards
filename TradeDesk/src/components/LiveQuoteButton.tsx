import { refreshQuotes, useQuoteStatus } from '../lib/quotes';
import { fmtTimeET } from '../lib/format';

/** "10:24 AM ET" → "10:24a" for the compact button label. */
function shortTime(ms: number): string {
  return fmtTimeET(new Date(ms).toISOString())
    .replace(' ET', '')
    .replace(' AM', 'a')
    .replace(' PM', 'p');
}

/**
 * Top-bar button: pulls ~15-minute-delayed quotes for the tickers on the
 * active tab, straight from the free Stooq feed. Manual refresh only.
 */
export default function LiveQuoteButton() {
  const s = useQuoteStatus();

  let label: string;
  let title: string;
  let className = 'btn btn-ghost livebtn';
  if (s.fetching) {
    label = 'Updating…';
    title = 'Fetching delayed quotes…';
  } else if (s.lastError && !s.lastOk) {
    label = '↻ Retry prices';
    title = `Last attempt failed: ${s.lastError}. Tap to retry.`;
    className += ' btn-warn';
  } else if (s.lastOk) {
    label = `● Live ${shortTime(s.lastOk)}`;
    title = `Delayed ~15 min · updated ${fmtTimeET(new Date(s.lastOk).toISOString())} · ${s.cached} tickers cached. Tap to refresh.`;
    className += ' live-on';
  } else {
    label = '↻ Live prices';
    title = 'Pull ~15-minute-delayed quotes for this tab (free feed, no key needed)';
  }

  return (
    <button className={className} onClick={() => void refreshQuotes()} title={title}>
      {label}
    </button>
  );
}
