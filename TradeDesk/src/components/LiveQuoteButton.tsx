import { refreshQuotes, useQuoteStatus, quotesTimestamp } from '../lib/quotes';
import { fmtTimeET } from '../lib/format';

/** "10:24 AM ET" → "10:24a" for the compact button label. */
function shortTime(ms: number): string {
  return fmtTimeET(new Date(ms).toISOString())
    .replace(' ET', '')
    .replace(' AM', 'a')
    .replace(' PM', 'p');
}

/**
 * Top-bar button: (re)loads the pipeline's delayed quote snapshot
 * (data/quotes.json, ~15-min-delayed Yahoo prices). No free quote API is
 * reachable from the browser, so this is the honest refresh path.
 */
export default function LiveQuoteButton() {
  const s = useQuoteStatus();

  const asOf = quotesTimestamp();
  const asOfLabel = asOf ? `snapshot ${shortTime(new Date(asOf).getTime())}` : 'snapshot';

  let label: string;
  let title: string;
  let className = 'btn btn-ghost livebtn';
  if (s.fetching) {
    label = 'Updating…';
    title = 'Loading delayed quotes…';
  } else if (s.lastError && !s.lastOk) {
    label = '↻ Retry prices';
    title = `Last attempt failed: ${s.lastError}. Tap to retry.`;
    className += ' btn-warn';
  } else if (s.lastOk) {
    label = `● Quotes ${asOf ? shortTime(new Date(asOf).getTime()) : shortTime(s.lastOk)}`;
    title = `Delayed ~15 min · ${asOfLabel} · ${s.cached} tickers. Tap to re-check for a newer snapshot.`;
    className += ' live-on';
  } else {
    label = '↻ Quotes';
    title = 'Load delayed quotes from the latest pipeline snapshot (free feed, no key needed)';
  }

  return (
    <button className={className} onClick={() => void refreshQuotes()} title={title}>
      {label}
    </button>
  );
}
