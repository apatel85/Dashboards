import type { ReactNode } from 'react';

/** Collapsed-by-default explainer. Keeps pages short: the help is one tap away, not in the way. */
export function HowTo({ title = 'How to read this', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="howto">
      <summary>{title}</summary>
      <div className="howto-body">{children}</div>
    </details>
  );
}

/** "Show more" pager for long lists: render `shown` of `total`, grow by `step`. */
export function ShowMore({ shown, total, onMore, onAll }: { shown: number; total: number; onMore: () => void; onAll?: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="showmore">
      <span className="muted small">Showing {shown.toLocaleString('en-US')} of {total.toLocaleString('en-US')}</span>
      <button className="btn" onClick={onMore}>Show more</button>
      {onAll ? <button className="link-btn" onClick={onAll}>Show all</button> : null}
    </div>
  );
}
