import { useMemo, useState } from 'react';
import '../mockb-reference.css';
import { DEFINITIONS, DEFINITION_COUNT } from '../lib/definitions';
import { useJsonData } from '../lib/useJsonData';
import { fmtTimeET } from '../lib/format';
import type {
  CongressTrade,
  DailyAlerts,
  DailyBrief,
  EarningsEntry,
  FundamentalsFile,
  NewsFile,
  PerformanceFile,
  PredictionPerformanceFile,
  ResearchIdea,
  SignalsFile,
} from '../types';

/** quotes.json has no shared type; only the fields this tab reads. */
interface QuotesFile {
  as_of: string;
  count?: number;
  quotes: Record<string, unknown>;
}

interface FileRow {
  file: string;
  what: string;
  count: number | null;
  asOf: string | null;
  status: 'loading' | 'ready' | 'missing';
}

function fmtCount(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('en-US');
}

function fmtAsOf(iso: string | null): string {
  return iso ? fmtTimeET(iso) : '—';
}

export default function ReferenceTab() {
  const [defsOpen, setDefsOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [query, setQuery] = useState('');

  const brief = useJsonData<DailyBrief>('daily-brief.json');
  const signals = useJsonData<SignalsFile>('signals.json');
  const earnings = useJsonData<EarningsEntry[]>('earnings.json');
  const insiders = useJsonData<unknown[]>('insiders.json');
  const congress = useJsonData<CongressTrade[]>('congress.json');
  const research = useJsonData<ResearchIdea[]>('research.json');
  const quotes = useJsonData<QuotesFile>('quotes.json');
  const fundamentals = useJsonData<FundamentalsFile>('fundamentals.json');
  const news = useJsonData<NewsFile>('news.json');
  const alerts = useJsonData<DailyAlerts>('daily-alerts.json');
  const predictions = useJsonData<PredictionPerformanceFile>('prediction-performance.json');
  const performance = useJsonData<PerformanceFile>('performance.json');

  const files: FileRow[] = [
    {
      file: 'daily-brief.json',
      what: "Today's brief — breakout candidates, 0DTE/1DTE focus, sector rotation",
      count: brief.data ? brief.data.breakout_candidates.length : null,
      asOf: brief.data?.generated_at ?? null,
      status: brief.loading ? 'loading' : brief.data ? 'ready' : 'missing',
    },
    {
      file: 'signals.json',
      what: 'Flow signals — stocks with unusual buying or selling',
      count: signals.data ? signals.data.tickers.length : null,
      asOf: signals.data?.generated_at ?? null,
      status: signals.loading ? 'loading' : signals.data ? 'ready' : 'missing',
    },
    {
      file: 'earnings.json',
      what: 'Companies reporting earnings soon',
      count: earnings.data ? earnings.data.length : null,
      asOf: null,
      status: earnings.loading ? 'loading' : earnings.data ? 'ready' : 'missing',
    },
    {
      file: 'insiders.json',
      what: 'Insider buys and sells by company executives and directors',
      count: insiders.data ? insiders.data.length : null,
      asOf: null,
      status: insiders.loading ? 'loading' : insiders.data ? 'ready' : 'missing',
    },
    {
      file: 'congress.json',
      what: 'Trades disclosed by members of Congress',
      count: congress.data ? congress.data.length : null,
      asOf: null,
      status: congress.loading ? 'loading' : congress.data ? 'ready' : 'missing',
    },
    {
      file: 'research.json',
      what: 'Full research cases — thesis, score, trigger and stop for each idea',
      count: research.data ? research.data.length : null,
      asOf: null,
      status: research.loading ? 'loading' : research.data ? 'ready' : 'missing',
    },
    {
      file: 'quotes.json',
      what: 'Latest prices for the stocks the app follows',
      count: quotes.data
        ? quotes.data.count ?? Object.keys(quotes.data.quotes).length
        : null,
      asOf: quotes.data?.as_of ?? null,
      status: quotes.loading ? 'loading' : quotes.data ? 'ready' : 'missing',
    },
    {
      file: 'fundamentals.json',
      what: 'Company numbers — sales, profits and value — for every ticker',
      count: fundamentals.data ? Object.keys(fundamentals.data.fundamentals).length : null,
      asOf: fundamentals.data?.as_of ?? null,
      status: fundamentals.loading
        ? 'loading'
        : fundamentals.data
          ? 'ready'
          : 'missing',
    },
    {
      file: 'news.json',
      what: 'Latest headlines for the stocks the app follows',
      count: news.data ? news.data.items.length : null,
      asOf: news.data?.as_of ?? null,
      status: news.loading ? 'loading' : news.data ? 'ready' : 'missing',
    },
    {
      file: 'daily-alerts.json',
      what: "What's new this morning — fresh filings and headlines",
      count: alerts.data
        ? alerts.data.congress.items.length +
          alerts.data.executive.items.length +
          alerts.data.news.items.length
        : null,
      asOf: alerts.data?.generated_at ?? null,
      status: alerts.loading ? 'loading' : alerts.data ? 'ready' : 'missing',
    },
    {
      file: 'prediction-performance.json',
      what: 'How past picks actually did, graded day by day',
      count: predictions.data ? predictions.data.rows.length : null,
      asOf: predictions.data?.as_of ?? null,
      status: predictions.loading
        ? 'loading'
        : predictions.data
          ? 'ready'
          : 'missing',
    },
    {
      file: 'performance.json',
      what: 'Tracked research ideas and how they have performed',
      count: performance.data ? performance.data.items.length : null,
      asOf: performance.data?.as_of ?? null,
      status: performance.loading
        ? 'loading'
        : performance.data
          ? 'ready'
          : 'missing',
    },
  ];

  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return DEFINITIONS;
    return DEFINITIONS.map((g) => ({
      ...g,
      items: g.items.filter(
        ([name, meaning]) =>
          name.toLowerCase().includes(q) || meaning.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const matchCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.items.length, 0),
    [filteredGroups],
  );

  return (
    <div className="mb-ref">
      <h1 className="mb-tabhead">Reference</h1>
      <p className="mb-lede">
        Every term used in this app, explained in plain English — plus where the
        app&apos;s data comes from, file by file. Research and education only;
        nothing here is financial advice.
      </p>

      {/* ── 01 · Glossary ─────────────────────────────────────────── */}
      <section className="mb-card" aria-label="Every term, in plain English">
        <button
          type="button"
          className="mb-card-head mb-ref-cardhead"
          onClick={() => setDefsOpen((o) => !o)}
          aria-expanded={defsOpen}
        >
          <span className="mb-card-num">01</span>
          <span className="mb-card-title">Every term, in plain English</span>
          <span className="mb-count-badge">{DEFINITION_COUNT} terms</span>
          <span className="mb-ref-chevron" aria-hidden="true">
            {defsOpen ? '▾' : '▸'}
          </span>
        </button>
        {defsOpen ? (
          <div className="mb-ref-body">
            <label className="mb-ref-search-label" htmlFor="mb-ref-search">
              Search terms
            </label>
            <input
              id="mb-ref-search"
              className="mb-ref-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or meaning — try “cheap” or “volatility”"
              aria-label="Search terms by name or meaning"
            />
            {q ? (
              <p className="mb-ref-matchline" role="status">
                {matchCount === 0
                  ? `No terms match “${query.trim()}”.`
                  : `${matchCount} of ${DEFINITION_COUNT} terms match “${query.trim()}”.`}
              </p>
            ) : null}
            {filteredGroups.length === 0 ? (
              <p className="mb-ref-empty">
                Nothing matches that search. Try a different word — for example,
                “price”, “growth” or “fear”.
              </p>
            ) : (
              filteredGroups.map((group) => (
                <div className="mb-ref-group" key={group.title}>
                  <h3 className="mb-ref-group-title">{group.title}</h3>
                  <dl className="mb-ref-list">
                    {group.items.map(([name, meaning]) => (
                      <div className="mb-ref-term" key={name}>
                        <dt className="mb-ref-term-name">{name}</dt>
                        <dd className="mb-ref-term-meaning">{meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>

      {/* ── 02 · Data files & counts ──────────────────────────────── */}
      <section className="mb-card" aria-label="Data on this page — files and counts">
        <button
          type="button"
          className="mb-card-head mb-ref-cardhead"
          onClick={() => setFilesOpen((o) => !o)}
          aria-expanded={filesOpen}
        >
          <span className="mb-card-num">02</span>
          <span className="mb-card-title">Data on this page — files &amp; counts</span>
          <span className="mb-count-badge">12 files</span>
          <span className="mb-ref-chevron" aria-hidden="true">
            {filesOpen ? '▾' : '▸'}
          </span>
        </button>
        {filesOpen ? (
          <div className="mb-ref-body">
            <p className="mb-ref-note">
              Counts and update times are read from the live files each time this
              tab opens. A “—” means the file was not published yet, or it carries
              no update time of its own.
            </p>
            <div className="mb-ref-tablewrap">
              <table className="mb-ref-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">What&apos;s inside</th>
                    <th scope="col" className="mb-ref-numcol">
                      Records
                    </th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((row) => (
                    <tr key={row.file}>
                      <td data-th="File" className="mb-ref-file">
                        {row.file}
                      </td>
                      <td data-th="What's inside">
                        {row.what}
                        {row.status === 'missing' ? (
                          <span className="mb-ref-missing">
                            Not published yet — the pipeline hasn&apos;t written
                            this file.
                          </span>
                        ) : null}
                      </td>
                      <td data-th="Records" className="mb-ref-numcol">
                        {row.status === 'loading' ? '…' : fmtCount(row.count)}
                      </td>
                      <td data-th="Updated" className="mb-ref-asof">
                        {row.status === 'loading' ? '…' : fmtAsOf(row.asOf)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
