/** Downturn monitor list — embedded snapshot (Nov 20, 2026 midday).
 *
 * Source of truth: research/downturn-debate-revised-list-2026-11-20.md
 * (§5 the 26 names, §8 the Nov 20 midday refresh). NOTE VALUES WIN.
 * Prices / % off 52w high / P/E / market cap / FCF yield are the FRESH
 * Nov 20 midday values (Yahoo ~15-min delayed, fetched ~11:45 ET; Yahoo's
 * Nov 19 bar closes matched the old snapshot for all 26, 0 mismatches).
 * FCF $ / FCF margin / capex / leverage / gross margin are the FIXED
 * Nov 20 TTM snapshot and must NEVER be refreshed from a live feed.
 * D/E, ROE, margin, YoY, CAGR, P/E may be overlaid live from
 * fundamentals.json (same file the snapshot came from); price may be
 * overlaid live only when the live quote is NEWER than this snapshot.
 */
export interface DownturnRow {
  t: string; name: string; sector: string; industry: string; tier: 1 | 2 | 3 | 4 | 5;
  nov19: number; price: number; dayPct: number; off: number; high52: number;
  vsSma200: number | null; pe: number; mc: number; fcfy: number | null;
  de: number; roe: number; mg: number; yoy: number; cagr: number; qoq: [number, number];
  fcf: number | null; fcfm: number | null; cx: number | null;
  ndf: number | 'cash'; deb: number; gm: number;
  fx: number | null; flag: string; fk: string;
}

export const SNAPSHOT_LABEL = 'Nov 20, 2026, 11:45 AM ET';
/** ISO time the midday prices were fetched — live quotes older than this must NOT override the snapshot. */
export const SNAPSHOT_TS = '2026-11-20T16:45:00Z';

export const DOWNTURN_ROWS: DownturnRow[] = [
  { t: "AMAT", name: "Applied Materials, Inc.", sector: "Technology", industry: "Semiconductor Equipment & Materials", tier: 1,
    nov19: 338.93, price: 306.68, dayPct: -9.5, off: -58.5, high52: 739.67,
    vsSma200: -31.4, pe: 24.3, mc: 243.4, fcfy: 1.0,
    de: 0.25, roe: 43, mg: 29, yoy: 21.4, cagr: 9.1, qoq: [15.2, 14.2],
    fcf: 2.5, fcfm: 7.3, cx: 18.4, ndf: "cash", deb: 0.55, gm: 50,
    fx: null, flag: "Thin FCF yield (1.0%) — the thinnest in Tier 1; FCF margin 7.3%.", fk: "risk" },
  { t: "ASML", name: "ASML Holding N.V.", sector: "Technology", industry: "Semiconductor Equipment & Materials", tier: 1,
    nov19: 1356.2, price: 1276.52, dayPct: -5.9, off: -36.2, high52: 1999.96,
    vsSma200: -20.3, pe: 31.4, mc: 492.0, fcfy: 2.1,
    de: 0.09, roe: 66, mg: 34, yoy: 15.6, cagr: 15.6, qoq: [6.4, 25],
    fcf: 10.4, fcfm: 26.3, cx: 31.3, ndf: "cash", deb: 0.12, gm: 54.3,
    fx: null, flag: "", fk: "" },
  { t: "LRCX", name: "Lam Research Corporation", sector: "Technology", industry: "Semiconductor Equipment & Materials", tier: 1,
    nov19: 203.68, price: 184.69, dayPct: -9.3, off: -57.9, high52: 438.5,
    vsSma200: -34.8, pe: 27.6, mc: 230.7, fcfy: 2.0,
    de: 0.27, roe: 70, mg: 32, yoy: 26, cagr: 10.1, qoq: [15.1, 22.3],
    fcf: 4.5, fcfm: 17.4, cx: 11.6, ndf: "cash", deb: 0.37, gm: 51.1,
    fx: null, flag: "", fk: "" },
  { t: "MU", name: "Micron Technology, Inc.", sector: "Technology", industry: "Semiconductors", tier: 1,
    nov19: 690.44, price: 604.38, dayPct: -12.5, off: -51.8, high52: 1255.0,
    vsSma200: -21.8, pe: 8.1, mc: 683.8, fcfy: 4.2,
    de: 0.04, roe: 88, mg: 64, yoy: 256.3, cagr: 104.6, qoq: [73.7, 30.8],
    fcf: 29.1, fcfm: 21.9, cx: 45.5, ndf: "cash", deb: 0.05, gm: 80.7,
    fx: null, flag: "Memory is cyclical — the +256% YoY is an HBM/DRAM price explosion, not a permanent run-rate. The bounce case is real but the cycle turns fast; watch DRAM spot pricing.", fk: "risk" },
  { t: "NVDA", name: "NVIDIA Corporation", sector: "Technology", industry: "Semiconductors", tier: 1,
    nov19: 145.98, price: 135.72, dayPct: -7.0, off: -44.2, high52: 243.37,
    vsSma200: -33.3, pe: 14.6, mc: 3277.3, fcfy: 3.0,
    de: 0.14, roe: 117, mg: 63, yoy: 65.5, cagr: 100, qoq: [17.9, 20.4],
    fcf: 99.2, fcfm: 27.4, cx: 16.5, ndf: "cash", deb: 0.16, gm: 74.9,
    fx: null, flag: "The −44.2% includes a leadership crisis (Huang stepped down), not just multiple compression. The business is still growing +20% QoQ. Bellwether: if NVDA can't base, the tape can't. AI-revenue-quality flags: DSO stretched 45→60 days, $108.5B in partner guarantees, OpenAI exposure.", fk: "risk" },
  { t: "SKHY", name: "SK hynix Inc.", sector: "Technology", industry: "Semiconductors", tier: 1,
    nov19: 119.2, price: 107.14, dayPct: -10.1, off: -46.4, high52: 199.87,
    vsSma200: null, pe: 5.9, mc: 755.5, fcfy: null,
    de: 0.06, roe: 93, mg: 70, yoy: 46.8, cagr: 29.6, qoq: [50.9, 31.9],
    fcf: null, fcfm: null, cx: null, ndf: "cash", deb: 0.08, gm: 77.4,
    fx: null, flag: "Memory is cyclical — the +47% YoY is HBM/DRAM pricing, not a permanent run-rate. Watch DRAM spot pricing. FCF is n/a in Yahoo (KRW reporting) — not penalised.", fk: "risk" },
  { t: "TSM", name: "Taiwan Semiconductor Manufacturing", sector: "Technology", industry: "Semiconductors", tier: 1,
    nov19: 352.09, price: 322.33, dayPct: -8.5, off: -33.9, high52: 487.47,
    vsSma200: -20.1, pe: 20.9, mc: 1671.8, fcfy: 2.0,
    de: 0.15, roe: 42, mg: 51, yoy: 31.6, cagr: 18.9, qoq: [12, 17.6],
    fcf: null, fcfm: 21.1, cx: 42.2, ndf: "cash", deb: 0.3, gm: 65.8,
    fx: 1, flag: "FCF yield ≈2.0% after TWD→USD conversion; Yahoo reports TSM in TWD — ratios are valid, dollar figures are not.", fk: "note" },
  { t: "META", name: "Meta Platforms, Inc.", sector: "Communication Services", industry: "Internet Content & Information", tier: 2,
    nov19: 596.22, price: 572.58, dayPct: -4.0, off: -26.6, high52: 779.82,
    vsSma200: -8.9, pe: 19.5, mc: 1463.7, fcfy: 1.1,
    de: 0.42, roe: 32, mg: 31, yoy: 22.2, cagr: 19.9, qoq: [8, 6.2],
    fcf: 16.8, fcfm: 7, cx: 48.1, ndf: 1.9, deb: 0.99, gm: 81,
    fx: null, flag: "Yellow flag — FCF $16.8B, margin 7.0%, capex 48.1% of revenue. The buildout is eating the business; watch the next capex guide.", fk: "risk" },
  { t: "MSFT", name: "Microsoft Corporation", sector: "Technology", industry: "Software - Infrastructure", tier: 2,
    nov19: 498.3, price: 489.45, dayPct: -1.8, off: -12.5, high52: 559.15,
    vsSma200: 10.3, pe: 25.5, mc: 3634.8, fcfy: 0.1,
    de: 0.28, roe: 34, mg: 41, yoy: 17.8, cagr: 16.1, qoq: [8.6, 2.5],
    fcf: 3, fcfm: 0.9, cx: 55.7, ndf: 23.2, deb: 0.65, gm: 67.7,
    fx: null, flag: "RED FLAG — FCF +$3.0B barely positive, FCF margin 0.9%, capex 55.7% of revenue (worst in the list). ND/FCF 23.2× is a denominator artefact, and debt/EBITDA 0.65 is low — but the Damodaran test is failing in real time. Stays only because FCF is still positive and leverage is low.", fk: "risk" },
  { t: "AGX", name: "Argan, Inc.", sector: "Industrials", industry: "Engineering & Construction", tier: 3,
    nov19: 295.85, price: 265.97, dayPct: -10.1, off: -67.0, high52: 805.75,
    vsSma200: -48.5, pe: 20.7, mc: 3.7, fcfy: 12.8,
    de: 0.02, roe: 40, mg: 15, yoy: 8.1, cagr: 27.6, qoq: [11, 32],
    fcf: 0.5, fcfm: 39.4, cx: 7.4, ndf: "cash", deb: 0.06, gm: 20.7,
    fx: null, flag: "Thinnest gross margin in the list (20.7%) — pricing power is the thing to watch.", fk: "risk" },
  { t: "DECK", name: "Deckers Outdoor Corporation", sector: "Consumer Cyclical", industry: "Footwear & Accessories", tier: 3,
    nov19: 78.95, price: 78.62, dayPct: -0.4, off: -35.7, high52: 122.29,
    vsSma200: -19.6, pe: 10.8, mc: 10.9, fcfy: 7.5,
    de: 0.23, roe: 44, mg: 19, yoy: 9.8, cagr: 14.7, qoq: [-8.9, 45.2],
    fcf: 0.8, fcfm: 14.6, cx: 5.6, ndf: "cash", deb: 0.39, gm: 58.9,
    fx: null, flag: "QoQ swing is seasonal (footwear), not deterioration.", fk: "note" },
  { t: "FFIV", name: "F5, Inc.", sector: "Technology", industry: "Software - Infrastructure", tier: 3,
    nov19: 318.09, price: 308.82, dayPct: -2.9, off: -36.1, high52: 483.3,
    vsSma200: -15.8, pe: 23.5, mc: 16.8, fcfy: 3.6,
    de: 0.05, roe: 19, mg: 21, yoy: 10.6, cagr: 6.7, qoq: [6.6, 6.1],
    fcf: 0.6, fcfm: 17.7, cx: 10.4, ndf: "cash", deb: 0.27, gm: 81.9,
    fx: null, flag: "", fk: "" },
  { t: "FSLR", name: "First Solar, Inc.", sector: "Technology", industry: "Solar", tier: 3,
    nov19: 151.95, price: 145.38, dayPct: -4.3, off: -54.7, high52: 320.95,
    vsSma200: -31.1, pe: 8.4, mc: 15.7, fcfy: 4.4,
    de: 0.03, roe: 19, mg: 37, yoy: 24.1, cagr: 25.8, qoq: [1.1, 16.5],
    fcf: 0.7, fcfm: 13.7, cx: 3, ndf: "cash", deb: 0.13, gm: 49.3,
    fx: null, flag: "", fk: "" },
  { t: "INTU", name: "Intuit Inc.", sector: "Technology", industry: "Software - Application", tier: 3,
    nov19: 310.02, price: 282.77, dayPct: -8.8, off: -58.6, high52: 682.27,
    vsSma200: -18.5, pe: 17.1, mc: 75.5, fcfy: 9.3,
    de: 0.44, roe: 24, mg: 21, yoy: 13.9, cagr: 14.3, qoq: [-49.1, 0],
    fcf: 7.1, fcfm: 32.3, cx: 10, ndf: 0.3, deb: 1.06, gm: 80.6,
    fx: null, flag: "QoQ swing is seasonal (tax season), not deterioration.", fk: "note" },
  { t: "PDD", name: "PDD Holdings Inc.", sector: "Consumer Cyclical", industry: "Internet Retail", tier: 3,
    nov19: 86.0, price: 84.94, dayPct: -1.2, off: -32.2, high52: 125.36,
    vsSma200: -4.9, pe: 9.6, mc: 120.9, fcfy: 6.4,
    de: 0.01, roe: 23, mg: 20, yoy: 9.7, cagr: 49, qoq: [5.8, -3.6],
    fcf: null, fcfm: 12.2, cx: 12, ndf: "cash", deb: 0.05, gm: 56.7,
    fx: 1, flag: "Lowest debt on this list (D/E 0.01). Already turning: +9.2% in the last month. FCF yield ≈6.4% after CNY conversion.", fk: "note" },
  { t: "TWLO", name: "Twilio Inc.", sector: "Technology", industry: "Software - Infrastructure", tier: 3,
    nov19: 178.78, price: 176.55, dayPct: -1.2, off: -42.8, high52: 308.4,
    vsSma200: -9.4, pe: 24.1, mc: 29.6, fcfy: 3.6,
    de: 0.12, roe: 15, mg: 22, yoy: 13.7, cagr: 9.8, qoq: [6.6, 4],
    fcf: 1.1, fcfm: 18.5, cx: 1.9, ndf: "cash", deb: 1.8, gm: 48.6,
    fx: null, flag: "Highest leverage among the kept names (debt/EBITDA 1.80×) — but net cash, so no refinancing risk.", fk: "note" },
  { t: "UI", name: "Ubiquiti Inc.", sector: "Technology", industry: "Communication Equipment", tier: 3,
    nov19: 663.22, price: 599.8, dayPct: -9.6, off: -45.5, high52: 1099.99,
    vsSma200: -10.1, pe: 33.9, mc: 36.3, fcfy: 2.2,
    de: 0.05, roe: 85, mg: 30, yoy: 27.2, cagr: 19, qoq: [18.9, 9.5],
    fcf: 0.8, fcfm: 22.4, cx: 7.1, ndf: "cash", deb: 0.06, gm: 46.5,
    fx: null, flag: "Priciest on the list (33.9×) but already turning: +8.8% in the last month, above its 50-day.", fk: "note" },
  { t: "ASND", name: "Ascendis Pharma A/S", sector: "Healthcare", industry: "Biotechnology", tier: 4,
    nov19: 255.96, price: 254.36, dayPct: -0.6, off: -9.8, high52: 282.15,
    vsSma200: 5.6, pe: 17.7, mc: 17.6, fcfy: 0.8,
    de: 0.3, roe: 132, mg: 73, yoy: 98, cagr: 141.4, qoq: [37.6, 9],
    fcf: 0.1, fcfm: 11.7, cx: 32.9, ndf: "cash", deb: 1.19, gm: 91.9,
    fx: null, flag: "Biotech, lumpy revenue — held-up quality, not fallen value. Thinnest FCF cover in the list ($0.1B, yield 0.8%) — kept because it is net cash with no leverage risk.", fk: "note" },
  { t: "MEDP", name: "Medpace Holdings, Inc.", sector: "Healthcare", industry: "Diagnostics & Research", tier: 4,
    nov19: 633.98, price: 622.17, dayPct: -1.9, off: -10.3, high52: 693.97,
    vsSma200: 16.5, pe: 35.2, mc: 17.8, fcfy: 2.9,
    de: 0.29, roe: 118, mg: 18, yoy: 20, cagr: 20.1, qoq: [0.1, 1.2],
    fcf: 0.5, fcfm: 17.5, cx: 7.9, ndf: "cash", deb: 0.27, gm: 72.2,
    fx: null, flag: "Flat last two quarters — held-up quality, not fallen value.", fk: "note" },
  { t: "NEM", name: "Newmont Corporation", sector: "Basic Materials", industry: "Gold", tier: 4,
    nov19: 100.05, price: 97.0, dayPct: -3.0, off: -28.3, high52: 135.29,
    vsSma200: -13.3, pe: 12.5, mc: 111.7, fcfy: 8.3,
    de: 0.16, roe: 27, mg: 35, yoy: 21.3, cagr: 23.9, qoq: [-16.3, 4],
    fcf: 9.2, fcfm: 34.4, cx: 14.8, ndf: "cash", deb: 0.32, gm: 68,
    fx: null, flag: "Growth is gold-price-driven; the last quarter shrank. A hedge bucket, not a growth bucket. The clean gold name: passes the new FCF criteria; WPM was dropped.", fk: "risk" },
  { t: "TCOM", name: "Trip.com Group Limited", sector: "Consumer Cyclical", industry: "Travel Services", tier: 4,
    nov19: 42.26, price: 41.27, dayPct: -2.4, off: -47.8, high52: 78.99,
    vsSma200: -11.3, pe: 8.4, mc: 26.2, fcfy: null,
    de: 0.17, roe: 16, mg: 37, yoy: 17.1, cagr: 46, qoq: [5.3, -3.4],
    fcf: null, fcfm: null, cx: null, ndf: "cash", deb: 2.36, gm: 80,
    fx: null, flag: "Already turning: +7.5% in the last month — relative strength, not capitulation. Debt/EBITDA 2.36× is the highest leverage ratio in the kept list; FCF is n/a in Yahoo (CNY reporting).", fk: "note" },
  { t: "VRTX", name: "Vertex Pharmaceuticals Incorporated", sector: "Healthcare", industry: "Biotechnology", tier: 4,
    nov19: 520.66, price: 523.59, dayPct: 0.6, off: -7.9, high52: 568.67,
    vsSma200: 8.0, pe: 33.7, mc: 132.7, fcfy: 1.8,
    de: 0.31, roe: 21, mg: 31, yoy: 8.9, cagr: 10.4, qoq: [11.6, 3.2],
    fcf: 2.3, fcfm: 18.1, cx: 10.5, ndf: 0.1, deb: 1.27, gm: 54.8,
    fx: null, flag: "", fk: "" },
  { t: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics", tier: 5,
    nov19: 349.21, price: 346.19, dayPct: -0.9, off: -4.1, high52: 360.83,
    vsSma200: 14.2, pe: 38.4, mc: 5009.0, fcfy: 2.1,
    de: 0.84, roe: 142, mg: 28, yoy: 15.1, cagr: 7.7, qoq: [-1.6, 4.6],
    fcf: 105.7, fcfm: 22.1, cx: 8.2, ndf: 0.4, deb: 0.55, gm: 48.8,
    fx: null, flag: "The adopter, not a builder — FCF $105.7B is the largest in the set. Fails the original screen on gross D/E only (0.84); the net-debt lens overturns it (ND/FCF 0.4×). −4.1% off high, above its 50-day.", fk: "note" },
  { t: "ALL", name: "The Allstate Corporation", sector: "Financial Services", industry: "Insurance - Property & Casualty", tier: 5,
    nov19: 266.77, price: 274.06, dayPct: 2.7, off: -2.5, high52: 281.11,
    vsSma200: 17.4, pe: 6.3, mc: 69.0, fcfy: 12.8,
    de: 0.23, roe: 39, mg: 17, yoy: 5.6, cagr: 10.4, qoq: [9.8, -6.7],
    fcf: 8.8, fcfm: 12.6, cx: 5.9, ndf: 0.1, deb: 0.48, gm: 34.9,
    fx: null, flag: "Insurance, near highs (+6.3% in the last month). Yahoo FCF for insurers is a rough proxy — read the yield with that caveat.", fk: "note" },
  { t: "CINF", name: "Cincinnati Financial Corporation", sector: "Financial Services", industry: "Insurance - Property & Casualty", tier: 5,
    nov19: 188.04, price: 190.59, dayPct: 1.4, off: -2.6, high52: 195.72,
    vsSma200: 12.0, pe: 11.3, mc: 29.5, fcfy: 8.2,
    de: 0.05, roe: 17, mg: 20, yoy: 11.4, cagr: 24.4, qoq: [49.3, -28.7],
    fcf: 2.4, fcfm: 18.1, cx: 5.2, ndf: "cash", deb: 0.25, gm: 26.2,
    fx: null, flag: "QoQ is lumpy (insurance seasonality: +49.3% / −28.7%). Near highs (+8.3% in the last month).", fk: "note" },
  { t: "QLYS", name: "Qualys, Inc.", sector: "Technology", industry: "Software - Infrastructure", tier: 5,
    nov19: 192.43, price: 190.44, dayPct: -1.0, off: -19.1, high52: 235.55,
    vsSma200: 37.1, pe: 29.1, mc: 6.1, fcfy: 4.1,
    de: 0.08, roe: 36, mg: 30, yoy: 10.1, cagr: 11, qoq: [3.7, 3.2],
    fcf: 0.3, fcfm: 35.4, cx: 10.7, ndf: "cash", deb: 0.2, gm: 83.3,
    fx: null, flag: "Druckenmiller's applications name (cybersecurity) that actually passes — GM 83.3%, FCF margin 35.4%, net cash.", fk: "note" },
];

export const TIERS: { n: 1 | 2 | 3 | 4 | 5; title: string; sub: string }[] = [
  { n: 1, title: 'Tier 1 — Epicenter', sub: 'Semis and the memory buildout — where the downturn started' },
  { n: 2, title: 'Tier 2 — Mega quality', sub: 'The hyperscalers that still pass — barely, in MSFT’s case' },
  { n: 3, title: 'Tier 3 — Fallen quality', sub: 'Good businesses marked down hard with the tape' },
  { n: 4, title: 'Tier 4 — Diversifiers', sub: 'Outside tech: gold, biotech, travel — the hedge bucket' },
  { n: 5, title: 'Tier 5 — Rotation & applications', sub: 'Adopters and non-tech names holding near their highs' },
];

export interface BuilderRow {
  t: string; name: string; sector: string;
  nov19: number; price: number; dayPct: number; off: number; vsSma200: number;
  de: number; roe: number; yoy: number; pe: number;
  fcf: number; fcfm: number; cx: number; ndf: string; deb: number; gm: number;
  back: string;
}

export const BUILDERS: BuilderRow[] = [
  { t: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication Services',
    nov19: 272.66, price: 274.99, dayPct: 0.9, off: -32.7, vsSma200: -18.4,
    de: 0.22, roe: 44, yoy: 15.1, pe: 14.3,
    fcf: -1.2, fcfm: -0.2, cx: 38.4, ndf: 'net cash', deb: 0.81, gm: 60.9,
    back: 'FCF turning positive as the capex wave crests — then it re-enters the list on the same screen.' },
  { t: 'AMZN', name: 'Amazon.com, Inc.', sector: 'Consumer Cyclical',
    nov19: 257.37, price: 251.69, dayPct: -2.2, off: -12.4, vsSma200: 2.7,
    de: 0.50, roe: 27, yoy: 12.4, pe: 20.3,
    fcf: -34.7, fcfm: -4.4, cx: 25.5, ndf: 'net debt $190.6B', deb: 1.66, gm: 51.4,
    back: 'FCF turning positive and net debt falling from $190.6B — then it re-enters the list on the same screen.' },
];

export const MARKET = {
  sp: { v: 7037, off: -10.3 },
  nasdaq: { v: 23102, off: -16.7 },
  soxOff: -41.2,
  vix: 30.6,
  spy: 701.96, spySma200: 732.82, spyVsSma200: -4.2, spyOffHigh: -10.2,
  downCount: 23,
};
