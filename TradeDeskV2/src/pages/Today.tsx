import { useEffect } from 'react';
import { AlertsSection, MoversSection, NewsSection, SectorsSection, REGIME_LEAD, REGIME_TONE } from '../tabs/DailyBrief';
import { scaled, fmtPx } from '../components/Gamma';
import { Badge, LoadingPanel, ErrorPanel, TvLink } from '../components/ui';
import { SubTabs, activeSub, type SubTab } from '../components/SubTabs';
import { useJsonData } from '../lib/useJsonData';
import { useFundamentals } from '../lib/useFundamentals';
import { setQuoteUniverse } from '../lib/quotes';
import { fmtFullDate, fmtMoney, fmtTimeAgo, fmtTimeET, fmtDayLabel } from '../lib/format';
import { hrefFor, navigate, type PageId } from '../lib/route';
import type {
  DailyBrief, EarningsEntry, GexFile, GexTicker, LottoFile, SignalsFile, TabId,
  NewsFile, FundamentalsFile, PerformanceFile, GexChangesFile, DailyAlerts,
} from '../types';

/** The alert rows still speak the old tab ids — map them to the new pages. */
const openLegacyTab = (id: TabId) => {
  if (id === 'congress') navigate('money');
  else if (id === 'options') navigate('options');
  else navigate('today');
};

function Card({
  title, sub, link, linkLabel = 'See all', children,
}: {
  title: string; sub?: string; link?: string; linkLabel?: string; children: React.ReactNode;
}) {
  return (
    <section className="ov-card">
      <header className="ov-card-head">
        <div>
          <h3>{title}</h3>
          {sub ? <p className="muted small">{sub}</p> : null}
        </div>
        {link ? (
          <a className="ov-link" href={link}>
            {linkLabel} <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted ov-empty">{children}</p>;
}

/** One futures gamma card: regime first, then the four levels that matter. */
function GammaCard({ which, g }: { which: 'ES' | 'NQ'; g: GexTicker | null }) {
  if (!g) {
    return (
      <div className="level-card">
        <div className="level-head"><span className="level-name">{which}</span></div>
        <Empty>No gamma read in this run.</Empty>
      </div>
    );
  }
  const e = g.expiries[0];
  const dir = g.regime.direction;
  const tone = dir === 'long' ? 'green' : dir === 'short' ? 'red' : 'dim';
  const plain =
    dir === 'long' ? 'Expect pinning — fades at the walls tend to work.'
      : dir === 'short' ? 'Expect bigger moves — breaks tend to run.'
        : 'No clear dealer lean today.';
  return (
    <div className="level-card">
      <div className="level-head">
        <span className="level-name">{which}</span>
        <Badge tone={tone}>
          Gamma {dir}{g.regime.confidence === 'contested' ? ' · contested' : g.regime.confidence === 'firm' ? ' · firm' : ''}
        </Badge>
        <span className="level-chart"><TvLink ticker={which} /></span>
      </div>
      <p className="level-plain">{plain}</p>
      {e ? (
        <dl className="level-grid">
          <div><dt>Spot</dt><dd className="num">{fmtPx(g.spot)}</dd></div>
          <div><dt>Call wall</dt><dd className="num down">{fmtPx(e.call_wall)}</dd></div>
          <div><dt>Put wall</dt><dd className="num up">{fmtPx(e.put_wall)}</dd></div>
          <div><dt>Flip</dt><dd className="num">{e.flip_strike != null ? fmtPx(e.flip_strike) : '—'}</dd></div>
        </dl>
      ) : null}
    </div>
  );
}

function Overview({ brief }: { brief: DailyBrief }) {
  const { data: gex } = useJsonData<GexFile>('gex.json');
  const { data: lotto } = useJsonData<LottoFile>('lotto.json');
  const { data: signals } = useJsonData<SignalsFile>('signals.json');
  const { data: earnings } = useJsonData<EarningsEntry[]>('earnings.json');
  const { get: getFund } = useFundamentals();

  const proxy = (w: 'ES' | 'NQ') => {
    const t = gex ? Object.values(gex.tickers).find((x) => x.proxy_for === w) : null;
    return t ? scaled(t) : null;
  };

  const validated = (lotto?.candidates ?? []).filter((c) => c.setup_validated).slice(0, 3);
  const breakouts = brief.breakout_candidates.slice(0, 3);
  const flows = (signals?.tickers ?? []).slice(0, 3);

  // Next reporting day that still has unreported companies (today if any).
  const upcoming = (earnings ?? [])
    .filter((e) => e.eps_actual == null && e.reporting_date >= brief.brief_date)
    .sort((a, b) => (a.reporting_date < b.reporting_date ? -1 : a.reporting_date > b.reporting_date ? 1 : (b.conviction ?? 0) - (a.conviction ?? 0)));
  const nextDay = upcoming[0]?.reporting_date ?? null;
  const nextDayRows = upcoming.filter((e) => e.reporting_date === nextDay);

  useEffect(() => {
    setQuoteUniverse(breakouts.map((c) => c.ticker));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief]);

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <div className="eyebrow">{fmtFullDate(brief.brief_date)}</div>
          <h2 className="hero-title">
            <span className={`regime-dot tone-${REGIME_TONE[brief.market_regime]}`} aria-hidden="true" />
            {REGIME_LEAD[brief.market_regime].replace(/ —$/, '')}
          </h2>
          <p className="hero-note">{brief.regime_notes}</p>
        </div>
        <div className="hero-side muted small">
          Brief built {fmtTimeET(brief.generated_at)}
          <br />
          <a href={hrefFor('today', 'data')}>Data status →</a>
        </div>
      </section>

      <Card
        title="Index levels"
        sub="Dealer gamma for the futures you trade — ES via SPX, NQ via QQQ×40"
        link={hrefFor('options', 'gamma')}
        linkLabel="Full gamma read"
      >
        <div className="level-row">
          <GammaCard which="ES" g={proxy('ES')} />
          <GammaCard which="NQ" g={proxy('NQ')} />
        </div>
      </Card>

      <div className="ov-grid">
        <Card title="Option setups" sub="Backtest-validated only" link={hrefFor('options', 'lotto')}>
          {validated.length === 0 ? (
            <Empty>No validated setup right now. That is normal — most days flag nothing.</Empty>
          ) : (
            <ul className="ov-list">
              {validated.map((c) => (
                <li key={c.ticker}>
                  <div className="ov-row-top">
                    <TvLink ticker={c.ticker} />
                    <Badge tone={c.direction === 'CALL' ? 'green' : c.direction === 'PUT' ? 'red' : 'amber'}>{c.direction}</Badge>
                    <span className="ov-score num">{c.score}</span>
                  </div>
                  <p className="ov-row-text">{c.entry_trigger}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Breakouts" sub="Top 3 by score · 1–2 week window" link={hrefFor('ideas', 'breakouts')}>
          {breakouts.length === 0 ? (
            <Empty>No breakout candidates cleared the cutoffs in this run.</Empty>
          ) : (
            <ul className="ov-list">
              {breakouts.map((c) => (
                <li key={c.ticker}>
                  <div className="ov-row-top">
                    <TvLink ticker={c.ticker} />
                    <span className="ov-name">{getFund(c.ticker)?.name ?? ''}</span>
                    <span className="ov-score num">{c.score}</span>
                  </div>
                  <p className="ov-row-text">
                    Above <span className="num up">{fmtMoney(c.trigger_price)}</span> · stop{' '}
                    <span className="num down">{fmtMoney(c.stop_price)}</span> · {c.setup}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Smart-money flow" sub="Congress + White House, last 90 days" link={hrefFor('ideas', 'signals')}>
          {flows.length === 0 ? (
            <Empty>No flow signals in this run.</Empty>
          ) : (
            <ul className="ov-list">
              {flows.map((s) => (
                <li key={s.ticker}>
                  <div className="ov-row-top">
                    <TvLink ticker={s.ticker} />
                    <Badge tone={s.direction === 'accumulation' ? 'green' : s.direction === 'distribution' ? 'red' : 'dim'}>
                      {s.direction === 'accumulation' ? 'Buying' : s.direction === 'distribution' ? 'Selling' : 'Mixed'}
                    </Badge>
                    <span className="ov-score num">{s.flow_score}</span>
                  </div>
                  <p className="ov-row-text">
                    {s.officials} official{s.officials === 1 ? '' : 's'} · {s.buy_trades} buys / {s.sell_trades} sells
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Earnings next"
          sub={nextDay ? `${fmtDayLabel(nextDay)} · ${nextDayRows.length} reporting` : undefined}
          link={hrefFor('earnings')}
          linkLabel="Calendar"
        >
          {nextDayRows.length === 0 ? (
            <Empty>No upcoming reports in the calendar window.</Empty>
          ) : (
            <ul className="ov-list ov-compact">
              {nextDayRows.slice(0, 6).map((e) => (
                <li key={e.ticker}>
                  <div className="ov-row-top">
                    <TvLink ticker={e.ticker} />
                    <span className="ov-name">{e.name}</span>
                    <span className="muted small">{e.report_time === 'BMO' ? 'Before open' : e.report_time === 'AMC' ? 'After close' : ''}</span>
                    <span className="ov-score num" title="Implied move">
                      {e.implied_move_pct != null ? `±${e.implied_move_pct}%` : '—'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AlertsSection onOpenTab={openLegacyTab} />
    </>
  );
}

/** Every dataset with its last-built time — so stale data is obvious, not a guess. */
function DataStatus() {
  const brief = useJsonData<DailyBrief>('daily-brief.json');
  const gex = useJsonData<GexFile>('gex.json');
  const gexCh = useJsonData<GexChangesFile>('gex-changes.json');
  const lotto = useJsonData<LottoFile>('lotto.json');
  const signals = useJsonData<SignalsFile>('signals.json');
  const news = useJsonData<NewsFile>('news.json');
  const alerts = useJsonData<DailyAlerts>('daily-alerts.json');
  const fund = useJsonData<FundamentalsFile>('fundamentals.json');
  const perf = useJsonData<PerformanceFile>('performance.json');

  const rows: { name: string; where: [PageId, string]; ts: string | null | undefined; state: { loading: boolean; error: string | null } }[] = [
    { name: 'Daily brief (regime, breakouts, sectors)', where: ['today', ''], ts: brief.data?.generated_at, state: brief },
    { name: 'New developments (alerts)', where: ['today', ''], ts: alerts.data?.generated_at, state: alerts },
    { name: 'Gamma levels', where: ['options', 'gamma'], ts: gex.data?.computed_at, state: gex },
    { name: 'Gamma alerts', where: ['options', 'gamma'], ts: gexCh.data?.computed_at, state: gexCh },
    { name: 'Lotto scanner', where: ['options', 'lotto'], ts: lotto.data?.generated_at, state: lotto },
    { name: 'Smart-money signals', where: ['ideas', 'signals'], ts: signals.data?.generated_at, state: signals },
    { name: 'News', where: ['today', 'news'], ts: news.data?.as_of, state: news },
    { name: 'Fundamentals', where: ['lookup', 'screener'], ts: fund.data?.as_of, state: fund },
    { name: 'Track record', where: ['record', ''], ts: perf.data?.as_of, state: perf },
  ];

  const ageHours = (ts: string | null | undefined) => (ts ? (Date.now() - new Date(ts).getTime()) / 36e5 : null);
  const status = (r: (typeof rows)[number]) => {
    if (r.state.loading) return <Badge tone="dim">Loading</Badge>;
    if (r.state.error || !r.ts) return <Badge tone="red">Missing</Badge>;
    const h = ageHours(r.ts) ?? 0;
    // Pipeline runs twice each weekday; over 3 days old means it skipped more than a weekend.
    if (h > 72) return <Badge tone="red">Stale</Badge>;
    if (h > 30) return <Badge tone="amber">Aging</Badge>;
    return <Badge tone="green">Fresh</Badge>;
  };

  return (
    <div className="panel">
      <p className="muted small">
        TradeDesk reads files a scheduled pipeline rebuilds twice each weekday. If a row is
        Stale or Missing, the pipeline run failed or has not happened yet — the numbers on
        that page are older than they look.
      </p>
      <div className="table-scroll">
        <table className="dtable">
          <thead>
            <tr><th>Dataset</th><th>Last built</th><th>Age</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td data-th="Dataset"><a href={hrefFor(r.where[0], r.where[1])}>{r.name}</a></td>
                <td data-th="Last built" className="num">{r.ts ? fmtTimeET(r.ts) : '—'}</td>
                <td data-th="Age" className="num">{r.ts ? fmtTimeAgo(r.ts) : '—'}</td>
                <td data-th="Status">{status(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS: SubTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'market', label: 'Sectors & movers' },
  { id: 'news', label: 'News' },
  { id: 'data', label: 'Data status' },
];

export default function TodayPage({ sub }: { sub: string }) {
  const { data, loading, error } = useJsonData<DailyBrief>('daily-brief.json');
  const active = activeSub(TABS, sub);
  return (
    <section className="tab">
      <SubTabs page="today" tabs={TABS} active={active} />
      {active === 'data' ? (
        <DataStatus />
      ) : loading ? (
        <LoadingPanel what="today's brief" />
      ) : error || !data ? (
        <ErrorPanel file="daily-brief.json" error={error ?? 'empty file'} />
      ) : active === 'overview' ? (
        <Overview brief={data} />
      ) : active === 'market' ? (
        <>
          <MoversSection />
          <SectorsSection brief={data} />
        </>
      ) : (
        <NewsSection />
      )}
    </section>
  );
}
