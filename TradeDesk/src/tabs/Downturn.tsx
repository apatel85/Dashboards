import { useEffect, useMemo, useState } from 'react';
import '../mockb-downturn.css';
import { useFundamentals } from '../lib/useFundamentals';
import { useJsonData } from '../lib/useJsonData';
import { quotesTimestamp, setQuoteUniverse, useLivePrice } from '../lib/quotes';
import { DASH, fmtMoney, fmtPct, fmtTimeET } from '../lib/format';
import type { FundamentalMetrics } from '../types';
import {
  BUILDERS,
  DOWNTURN_ROWS,
  MARKET,
  SNAPSHOT_LABEL,
  SNAPSHOT_TS,
  TIERS,
} from './downturnData';
import type { BuilderRow, DownturnRow } from './downturnData';

/**
 * Downturn tab (13th tab, added 2026-11-20) — the DownturnWatchlist list
 * moved into TradeDesk, where the live data plumbing already exists.
 *
 * Data: embedded Nov 20 midday snapshot (downturnData.ts — source of
 * truth is research/downturn-debate-revised-list-2026-11-20.md, NOTE
 * VALUES WIN). FCF $ / FCF margin / capex / leverage / gross margin are
 * the FIXED Nov 20 TTM snapshot and are NEVER refreshed. Two things do
 * refresh, the way other tabs do:
 *  - Fundamentals (D/E, ROE, margin, YoY, CAGR) from fundamentals.json
 *    via useFundamentals — same file the snapshot came from. P/E is NOT
 *    overlaid live: it is price-derived, and the live file's P/E rides an
 *    older price than the midday snapshot.
 *  - Prices via useLivePrice — but ONLY when the live quote is NEWER than
 *    the midday snapshot. The pipeline's quotes.json snapshot is a morning
 *    snapshot; adopting it blindly would roll prices BACK from midday to
 *    the morning. Schwab session prices (lp.session != null) are always
 *    newer and are adopted unconditionally. When a live price is adopted,
 *    P/E, market cap and FCF yield rescale by the price ratio, exactly
 *    as the §8 refresh did.
 * Off-high stays on the snapshot by design (no 52w-high field in the
 * feeds). Monitor list, not buy recommendations.
 */

interface QuotesFile {
  as_of: string;
  count?: number;
  quotes: Record<string, unknown>;
}

function fmtMc(mcB: number): string {
  if (mcB >= 1000) return `$${(mcB / 1000).toFixed(2)}T`;
  return `$${mcB.toFixed(1)}B`;
}

function fmtFcf(fcf: number | null): string {
  if (fcf == null) return DASH;
  const sign = fcf < 0 ? '-' : '';
  return `${sign}$${Math.abs(fcf).toFixed(1)}B`;
}

function fmtNdf(ndf: number | 'cash'): string {
  return ndf === 'cash' ? 'net cash' : `${ndf.toFixed(1)}×`;
}

function flagTone(flag: string, fk: string): 'red' | 'amber' | 'info' | 'plain' {
  if (flag.startsWith('RED FLAG')) return 'red';
  if (flag.startsWith('Yellow flag')) return 'amber';
  if (fk === 'note') return 'info';
  return 'plain';
}

interface MetricCell {
  k: string;
  v: string;
  live?: boolean;
}

function KvGrid({ cells }: { cells: MetricCell[] }) {
  return (
    <div className="mb-dt-grid">
      {cells.map((c) => (
        <div className="mb-dt-kv" key={c.k}>
          <div className="mb-dt-k">{c.k}</div>
          <div className="mb-dt-v">
            {c.live ? (
              <span className="livedot" title="Live ~15-min delayed quote" />
            ) : null}
            {c.v}
          </div>
        </div>
      ))}
    </div>
  );
}

function RowCard({
  row,
  fund,
}: {
  row: DownturnRow;
  fund: FundamentalMetrics | null;
}) {
  const [open, setOpen] = useState(false);
  const lp = useLivePrice(row.t, row.price);
  // Adopt the live price only when it is newer than the midday snapshot.
  const qts = quotesTimestamp();
  const livePrice =
    lp.session != null
      ? lp.price
      : lp.live && qts != null && qts > SNAPSHOT_TS
        ? lp.price
        : null;
  const price = livePrice ?? row.price;
  const ratio = price / row.price;
  const dayPct = ((price - row.nov19) / row.nov19) * 100;
  const pe = row.pe * ratio;
  const mc = row.mc * ratio;
  const fcfy = row.fcfy == null ? null : row.fcfy / ratio;
  const isLive = livePrice != null;

  // Fundamentals overlay (live file, same units as the snapshot after
  // conversion: D/E is stored in percent, the rest as fractions).
  const de = fund?.debt_equity != null ? fund.debt_equity / 100 : row.de;
  const roe = fund?.roe != null ? fund.roe * 100 : row.roe;
  const mg = fund?.profit_margin != null ? fund.profit_margin * 100 : row.mg;
  const yoy =
    fund?.revenue_growth_yoy != null ? fund.revenue_growth_yoy * 100 : row.yoy;
  const cagr =
    fund?.revenue_cagr_3y != null ? fund.revenue_cagr_3y * 100 : row.cagr;
  const fundLive = fund != null;
  const tone = flagTone(row.flag, row.fk);

  const cells: MetricCell[] = [
    { k: 'Price', v: fmtMoney(price), live: isLive },
    { k: 'Today', v: fmtPct(dayPct) },
    { k: 'Off 52w high', v: `${row.off.toFixed(1)}%` },
    { k: 'Vs 200-day', v: row.vsSma200 == null ? DASH : fmtPct(row.vsSma200) },
    { k: 'P/E', v: pe.toFixed(1) },
    { k: 'Market cap', v: fmtMc(mc) },
    { k: 'FCF yield', v: fcfy == null ? DASH : `${fcfy.toFixed(1)}%` },
    { k: 'FCF (TTM)', v: fmtFcf(row.fcf) },
    { k: 'FCF margin', v: row.fcfm == null ? DASH : `${row.fcfm.toFixed(1)}%` },
    { k: 'Capex intensity', v: row.cx == null ? DASH : `${row.cx.toFixed(1)}% of rev` },
    { k: 'D/E', v: de.toFixed(2), live: fundLive },
    { k: 'ROE', v: `${Math.round(roe)}%`, live: fundLive },
    { k: 'Margin', v: `${Math.round(mg)}%`, live: fundLive },
    { k: 'Rev YoY', v: fmtPct(yoy, 1, false), live: fundLive },
    { k: 'Rev 3Y CAGR', v: fmtPct(cagr, 1, false), live: fundLive },
    {
      k: 'Rev QoQ (last 2)',
      v: `${fmtPct(row.qoq[0])} / ${fmtPct(row.qoq[1])}`,
    },
    { k: 'Net debt / FCF', v: fmtNdf(row.ndf) },
    { k: 'Debt / EBITDA', v: `${row.deb.toFixed(2)}×` },
    { k: 'Gross margin', v: `${row.gm.toFixed(1)}%` },
    { k: '52w high', v: fmtMoney(row.high52) },
  ];

  return (
    <article className={`mb-dt-row${open ? ' open' : ''}`}>
      <button
        type="button"
        className="mb-dt-rowhead"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="mb-dt-id">
          <span className="mb-dt-ticker">{row.t}</span>
          <span className="mb-dt-name">{row.name}</span>
          <span className="mb-dt-sub">
            {row.sector} · {row.industry}
          </span>
        </span>
        <span className="mb-dt-nums">
          <span className="mb-dt-price">
            {isLive ? (
              <span className="livedot" title="Live ~15-min delayed quote" />
            ) : null}
            {fmtMoney(price)}
          </span>
          <span className={dayPct < 0 ? 'mb-dt-down' : 'mb-dt-up'}>
            {fmtPct(dayPct)}
          </span>
          <span className="mb-dt-off">{row.off.toFixed(1)}% off high</span>
        </span>
        <span className="mb-dt-chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="mb-dt-body">
          <KvGrid cells={cells} />
          {row.fx === 1 ? (
            <p className="mb-dt-caveat">
              Reports in local currency — FCF yield is a converted estimate;
              ratios are valid, dollar figures are not.
            </p>
          ) : null}
          {row.flag ? (
            <p className={`mb-dt-flag mb-dt-flag-${tone}`}>{row.flag}</p>
          ) : null}
          <p className="mb-dt-links">
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(row.t)}`}
              target="_blank"
              rel="noopener"
            >
              Chart on TradingView ↗
            </a>
            <span className="mb-dt-plain">
              Off-high as of {SNAPSHOT_LABEL}; QoQ from latest filings.
            </span>
          </p>
        </div>
      ) : null}
    </article>
  );
}

function BuilderCard({ row }: { row: BuilderRow }) {
  const [open, setOpen] = useState(false);
  const lp = useLivePrice(row.t, row.price);
  const qts = quotesTimestamp();
  const livePrice =
    lp.session != null
      ? lp.price
      : lp.live && qts != null && qts > SNAPSHOT_TS
        ? lp.price
        : null;
  const price = livePrice ?? row.price;
  const ratio = price / row.price;
  const dayPct = ((price - row.nov19) / row.nov19) * 100;
  const isLive = livePrice != null;

  const cells: MetricCell[] = [
    { k: 'Price', v: fmtMoney(price), live: isLive },
    { k: 'Today', v: fmtPct(dayPct) },
    { k: 'Off 52w high', v: `${row.off.toFixed(1)}%` },
    { k: 'Vs 200-day', v: fmtPct(row.vsSma200) },
    { k: 'P/E', v: (row.pe * ratio).toFixed(1) },
    { k: 'D/E', v: row.de.toFixed(2) },
    { k: 'ROE', v: `${row.roe}%` },
    { k: 'Rev YoY', v: fmtPct(row.yoy, 1, false) },
    { k: 'FCF (TTM)', v: fmtFcf(row.fcf) },
    { k: 'FCF margin', v: `${row.fcfm.toFixed(1)}%` },
    { k: 'Capex intensity', v: `${row.cx.toFixed(1)}% of rev` },
    { k: 'Net debt / FCF', v: row.ndf },
    { k: 'Debt / EBITDA', v: `${row.deb.toFixed(2)}×` },
    { k: 'Gross margin', v: `${row.gm.toFixed(1)}%` },
  ];

  return (
    <article className={`mb-dt-row${open ? ' open' : ''}`}>
      <button
        type="button"
        className="mb-dt-rowhead"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="mb-dt-id">
          <span className="mb-dt-ticker">{row.t}</span>
          <span className="mb-dt-name">{row.name}</span>
          <span className="mb-dt-sub">{row.sector}</span>
        </span>
        <span className="mb-dt-nums">
          <span className="mb-dt-price">
            {isLive ? (
              <span className="livedot" title="Live ~15-min delayed quote" />
            ) : null}
            {fmtMoney(price)}
          </span>
          <span className={dayPct < 0 ? 'mb-dt-down' : 'mb-dt-up'}>
            {fmtPct(dayPct)}
          </span>
          <span className="mb-dt-off">{row.off.toFixed(1)}% off high</span>
        </span>
        <span className="mb-dt-chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="mb-dt-body">
          <KvGrid cells={cells} />
          <p className="mb-dt-flag mb-dt-flag-info">
            <strong>What brings it back: </strong>
            {row.back}
          </p>
          <p className="mb-dt-links">
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(row.t)}`}
              target="_blank"
              rel="noopener"
            >
              Chart on TradingView ↗
            </a>
          </p>
        </div>
      ) : null}
    </article>
  );
}

export default function DownturnTab() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'tier' | 'fcfy' | 'off'>('tier');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    day: true,
    t1: true,
    t2: true,
    t3: true,
    t4: true,
    t5: true,
    builders: true,
    gates: true,
    method: true,
    sorted: true,
  });

  const fund = useFundamentals();
  const quotes = useJsonData<QuotesFile>('quotes.json');

  useEffect(() => {
    setQuoteUniverse([
      ...DOWNTURN_ROWS.map((r) => r.t),
      ...BUILDERS.map((b) => b.t),
    ]);
  }, []);

  const toggle = (key: string) =>
    setOpenSections((o) => ({ ...o, [key]: !o[key] }));

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      DOWNTURN_ROWS.filter(
        (r) =>
          !q ||
          r.t.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q),
      ),
    [q],
  );
  const sorted = useMemo(() => {
    if (sort === 'fcfy')
      return [...filtered].sort((a, b) => (b.fcfy ?? -1) - (a.fcfy ?? -1));
    if (sort === 'off') return [...filtered].sort((a, b) => a.off - b.off);
    return filtered;
  }, [filtered, sort]);

  const fundCount = useMemo(
    () => DOWNTURN_ROWS.filter((r) => fund.get(r.t) != null).length,
    [fund],
  );
  const quotesCovered = useMemo(
    () =>
      quotes.data
        ? DOWNTURN_ROWS.filter((r) => r.t in quotes.data!.quotes).length
        : null,
    [quotes.data],
  );
  const feedNewer =
    quotes.data != null && quotes.data.as_of > SNAPSHOT_TS;

  const sectionHead = (
    key: string,
    num: string,
    title: string,
    sub: string,
    badge: string,
  ) => (
    <button
      type="button"
      className="mb-card-head"
      onClick={() => toggle(key)}
      aria-expanded={openSections[key]}
    >
      <span className="mb-card-num">{num}</span>
      <span className="mb-card-title">{title}</span>
      <span className="mb-card-sub">{sub}</span>
      <span className="mb-count-badge">{badge}</span>
      <span className="mb-dt-chev" aria-hidden="true">
        {openSections[key] ? '▾' : '▸'}
      </span>
    </button>
  );

  return (
    <div className="mb-dt">
      <h1 className="mb-tabhead">Downturn</h1>
      <p className="mb-lede">
        26 quality stocks to watch while the market falls — low-debt
        compounders plus a rotation bucket, screened from 1,147 tickers and
        run through an expert debate. Monitor list, not buy recommendations.
      </p>
      <p className="mb-dt-dateline">
        Prices {SNAPSHOT_LABEL} (Yahoo ~15-min delayed) · FCF metrics are the
        Nov 20 TTM snapshot and do not refresh
      </p>
      <p className="mb-dt-status" role="status">
        {quotes.loading
          ? 'Snapshot: Nov 20, 2026 midday. Live refresh checking…'
          : quotes.data
            ? `Snapshot: Nov 20 midday. Live refresh ${fmtTimeET(quotes.data.as_of)} — fundamentals for ${fundCount} of 26, prices for ${quotesCovered} of 26 in the quotes feed${feedNewer ? ' (feed is newer than the snapshot — showing live prices)' : ' (feed is older than the snapshot — showing snapshot prices)'}. Off-high stays on the snapshot; FCF metrics never refresh.`
            : 'Live refresh unavailable — showing the Nov 20 midday snapshot. Off-high and FCF metrics stay on the snapshot.'}
      </p>

      <div className="mb-dt-controls">
        <input
          className="mb-dt-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker or name — try “NVDA” or “insurance”"
          aria-label="Search the downturn list by ticker or name"
        />
        <label className="mb-dt-sort-label" htmlFor="mb-dt-sort">
          Sort
        </label>
        <select
          id="mb-dt-sort"
          className="mb-dt-sort"
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as 'tier' | 'fcfy' | 'off')
          }
        >
          <option value="tier">By tier</option>
          <option value="fcfy">FCF yield, high to low</option>
          <option value="off">Off high, deepest first</option>
        </select>
      </div>

      {/* ── 01 · The day ──────────────────────────────────────────── */}
      <section className="mb-card" aria-label="The day so far">
        {sectionHead(
          'day',
          '01',
          'The day',
          'Another leg down, led by semis',
          `${MARKET.downCount} of 26 down`,
        )}
        {openSections.day ? (
          <div className="mb-dt-mood">
            <p className="mb-dt-mood-say">
              Another leg down, led by semis — {MARKET.downCount} of 26 down.
              The rotation bucket is the only green.
            </p>
            <p className="mb-dt-mood-plain">
              Nov 5: Nasdaq −5.5% into correction, semis −12.2%, $2.5T wiped —
              AI-regulation scrutiny after the midterm sweep, on top of
              AI-capex ROI doubt and crowded, levered positioning. Nov 19:
              Dow −1,100, S&amp;P down a 6th straight session; Anthropic&rsquo;s
              record IPO (priced $83, opened $111.50, closed ~$97) did not stop
              the selling. Nov 20 midday: MU −12.5%, SKHY −10.1%, AGX −10.1%,
              NVDA −7.0% — while ALL +2.7%, CINF +1.4% and VRTX +0.6% held up.
              The three green names are all non-tech.
            </p>
            <div className="mb-dt-mood-stats">
              <div className="mb-dt-mstat">
                <span className="mb-dt-mstat-k">S&amp;P 500</span>
                <span className="mb-dt-mstat-v">
                  {MARKET.sp.v.toLocaleString('en-US')}
                </span>
                <span className="mb-dt-mstat-e">
                  {MARKET.sp.off.toFixed(1)}% off high
                </span>
              </div>
              <div className="mb-dt-mstat">
                <span className="mb-dt-mstat-k">Nasdaq</span>
                <span className="mb-dt-mstat-v">
                  {MARKET.nasdaq.v.toLocaleString('en-US')}
                </span>
                <span className="mb-dt-mstat-e">
                  {MARKET.nasdaq.off.toFixed(1)}% off high
                </span>
              </div>
              <div className="mb-dt-mstat">
                <span className="mb-dt-mstat-k">SOX semis</span>
                <span className="mb-dt-mstat-v">
                  {MARKET.soxOff.toFixed(1)}%
                </span>
                <span className="mb-dt-mstat-e">off high</span>
              </div>
              <div className="mb-dt-mstat">
                <span className="mb-dt-mstat-k">VIX</span>
                <span className="mb-dt-mstat-v">
                  {MARKET.vix.toFixed(1)}
                </span>
                <span className="mb-dt-mstat-e">fear is elevated</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── 02–06 · The tiers ─────────────────────────────────────── */}
      {sort === 'tier' ? (
        TIERS.map((tier, i) => {
          const rows = filtered.filter((r) => r.tier === tier.n);
          if (rows.length === 0) return null;
          const key = `t${tier.n}`;
          return (
            <section
              className="mb-card"
              key={tier.n}
              aria-label={tier.title}
            >
              {sectionHead(
                key,
                String(i + 2).padStart(2, '0'),
                tier.title,
                tier.sub,
                `${rows.length} name${rows.length === 1 ? '' : 's'}`,
              )}
              {openSections[key] ? (
                <div className="mb-dt-rows">
                  {rows.map((r) => (
                    <RowCard key={r.t} row={r} fund={fund.get(r.t)} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })
      ) : (
        <section className="mb-card" aria-label="All names, sorted">
          {sectionHead(
            'sorted',
            '02',
            'All names',
            sort === 'fcfy'
              ? 'Sorted by FCF yield, high to low'
              : 'Sorted by off-high, deepest first',
            `${sorted.length} names`,
          )}
          {openSections.sorted ? (
            <div className="mb-dt-rows">
              {sorted.map((r) => (
                <RowCard key={r.t} row={r} fund={fund.get(r.t)} />
              ))}
            </div>
          ) : null}
        </section>
      )}
      {q && filtered.length === 0 ? (
        <p className="mb-dt-empty">
          Nothing matches “{query.trim()}”. Try a ticker or a company name.
        </p>
      ) : null}

      {/* ── 07 · Builders on FCF watch ────────────────────────────── */}
      <section className="mb-card" aria-label="Builders on FCF watch">
        {sectionHead(
          'builders',
          '07',
          'Builders on FCF watch',
          'Failed the hard FCF test — not sells, on watch until FCF turns',
          '2 names',
        )}
        {openSections.builders ? (
          <div className="mb-dt-rows">
            <p className="mb-dt-note">
              GOOGL and AMZN failed the debate&rsquo;s hard FCF test:{' '}
              <strong>FCF must be positive</strong>. They are not sells — they
              are on watch until FCF turns. WPM was dropped outright: gold
              miners are a level-based trade, not a quality holding; NEM stays
              as the gold name (its FCF is $9.2B, yield 8.3% at midday).
            </p>
            {BUILDERS.filter(
              (b) =>
                !q ||
                b.t.toLowerCase().includes(q) ||
                b.name.toLowerCase().includes(q),
            ).map((b) => (
              <BuilderCard key={b.t} row={b} />
            ))}
            <p className="mb-dt-note">
              <strong>Valuation watch</strong> (applications / quality names
              that fail the screen — Damodaran trigger-price names, not adds):
              CRWD, PANW (fail ROE/margin/PE), SHOP (PE 81×), LLY (fails D/E
              + PE; ND/FCF 4.8×), AZN (fails D/E; ND/FCF 4.6×), DIS (fails
              ROE/margin/CAGR; ND/FCF 5.5×), SBUX (fails 6 criteria;
              debt/EBITDA 3.9×), F (fails 4).
            </p>
          </div>
        ) : null}
      </section>

      {/* ── 08 · Gates — what would say “now” ─────────────────────── */}
      <section className="mb-card" aria-label="Gates — what would say now">
        {sectionHead(
          'gates',
          '08',
          'Gates — what would say “now”',
          'Three checks before treating a bounce as real',
          '2 not yet',
        )}
        {openSections.gates ? (
          <div className="mb-dt-body">
            <div className="mb-dt-gate">
              <h3>
                Credit gate — <span className="mb-dt-up">OPEN</span>
              </h3>
              <p>
                AI credit is stressed (CoreWeave CDS 1,289bp, Oracle ~300bp)
                while broad credit is calm (CDX IG 59→62bp). AI credit widening
                + broad calm = sector repricing, not systemic — the screen
                still works. Broad high-yield blowing out = regime change, and
                the screen breaks. No leveraged AI names are in the 26.
              </p>
            </div>
            <div className="mb-dt-gate">
              <h3>
                Breadth gate (Klement) —{' '}
                <span className="mb-dt-down">NOT YET</span>
              </h3>
              <p>
                SPY ${MARKET.spy.toFixed(2)} vs its 200-day $
                {MARKET.spySma200.toFixed(2)} = {MARKET.spyVsSma200.toFixed(1)}
                % below (was −2.8% this morning). Re-cross above the 200-day +
                breadth improving = the confirmation signal. Crash signal (≥8%
                below the 52w high AND below the 200-day) still{' '}
                <strong>TRUE</strong>: SPY {MARKET.spyOffHigh.toFixed(1)}%
                below its high.
              </p>
            </div>
            <div className="mb-dt-gate">
              <h3>Event calendar — re-screen after each</h3>
              <p>
                <strong>Fed Dec 8–9</strong> (hike ~100% priced; Waller pushing
                50bp) · <strong>Hyperscaler 2027 capex guidance</strong>{' '}
                (every $1 less capex = $1 less semis revenue) ·{' '}
                <strong>Data-center regulation milestones</strong> ·{' '}
                <strong>NVDA permanent CEO</strong>.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── 09 · Method & honest limits ───────────────────────────── */}
      <section className="mb-card" aria-label="Method and honest limits">
        {sectionHead(
          'method',
          '09',
          'Method & honest limits',
          'How the list was built, and what it cannot tell you',
          'Read first',
        )}
        {openSections.method ? (
          <div className="mb-dt-body">
            <p className="mb-dt-note">
              <strong>How the list was built:</strong> screened from 1,147
              tickers in TradeDesk fundamentals.json — market cap ≥$2B, D/E
              ≤0.50, ROE ≥15%, margin ≥15%, revenue YoY ≥+5%, 3Y CAGR ≥+5%, P/E
              0–40 — then run through the debate&rsquo;s ten new criteria
              (FCF/owner-earnings yield, refinancing risk, pricing power,
              AI-revenue quality, capex ROI, customer concentration, credit
              gate, breadth gate, rotation bucket, event calendar).
            </p>
            <p className="mb-dt-note">
              <strong>The hard test:</strong> FCF must be positive. FCF =
              operating cash flow − capex (TTM); FCF yield = FCF ÷ market cap.
              GOOGL and AMZN fail it and sit on Builders Watch until FCF
              turns.
            </p>
            <p className="mb-dt-note">
              <strong>What does not refresh:</strong> FCF metrics are the Nov
              20 TTM snapshot (Yahoo financialData) and never refresh. Foreign
              ADRs report in local currency — TSM&rsquo;s and PDD&rsquo;s FCF
              yields are converted estimates (≈2.0% / ≈6.4%); SKHY and TCOM
              have no FCF in Yahoo. FCF for insurers (ALL, CINF) is a rough
              proxy. Margin and DSO trends are not computable from free Yahoo
              endpoints — recorded as gaps, not faked.
            </p>
            <p className="mb-dt-note">
              <strong>What was NOT added, and why:</strong> insider buying
              (rejected — none of the five value thinkers uses it); buyback
              capacity (contested, dangerous if debt-funded); relative strength
              as a quality screen (13F is 45–75 days stale — timing overlay
              only).
            </p>
            <p className="mb-dt-note">
              <strong>Sources:</strong> TradeDesk fundamentals.json (Nov 20
              pull); Yahoo financialData TTM (Nov 20); Yahoo 1-year daily bars
              for 52-week highs; research note
              downturn-debate-revised-list-2026-11-20.md. Monitor list, not
              buy recommendations.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
