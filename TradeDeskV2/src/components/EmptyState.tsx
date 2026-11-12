interface EmptyStateProps {
  /** e.g. "public/data/daily-brief.json" */
  dataFile: string;
  /** What the panel will show once the pipeline lands. */
  items: string[];
  loading: boolean;
  error: string | null;
}

/** Shown when a tab's data file has no real content yet. */
export default function EmptyState({ dataFile, items, loading, error }: EmptyStateProps) {
  if (loading) {
    return (
      <div className="panel">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  return (
    <div className="panel empty-state">
      <div className="empty-title">No data yet</div>
      <p className="muted">
        This panel is wired to <code>{dataFile}</code>, which the scheduled
        data pipeline has not written yet.
        {error ? ` (last fetch: ${error})` : ''}
      </p>
      <div className="empty-subtitle">What will live here</div>
      <ul className="empty-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
