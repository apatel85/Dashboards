/* InvestIQ V2 — live data engine
 * HUD FY2027 SAFMR (baked, official) + Census ACS 2024 5-yr (live via Census Reporter).
 * No API keys. No backend. No fake sync buttons. */
'use strict';

const MARKETS_URL = 'data/markets.json';
const CENSUS_API = 'https://api.censusreporter.org/1.0/data/show/latest';
const CACHE_KEY = 'investiq_v2_census_v1';
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const BATCH_SIZE = 5;
const TABLES = 'B25077,B19013,B25003,B25002';

let MARKETS = [];        // [{zip, metro, hud_area, fmr_*}]
let ROWS = [];           // merged rows with census + derived
let dataState = 'loading'; // loading | live | cached | error
let sortKey = 'gross_yield', sortDir = -1;
let dashMode = 'yield';
let yieldChart = null;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmt$ = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const fmtPct = (n, d=1) => n == null ? '—' : n.toFixed(d) + '%';
const fmtNum = n => n == null ? '—' : n.toLocaleString('en-US');

/* ---------------- data loading ---------------- */
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c && c.ts && (Date.now() - c.ts) < CACHE_TTL_MS && c.data) return c;
  } catch(e) {}
  return null;
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
}

async function fetchCensusBatch(zips) {
  const geos = zips.map(z => '86000US' + z).join(',');
  const url = `${CENSUS_API}?table_ids=${TABLES}&geo_ids=${encodeURIComponent(geos)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Census Reporter HTTP ' + res.status);
  return res.json();
}

function parseCensus(payload) {
  const out = {};
  const data = payload.data || {};
  for (const [geo, vals] of Object.entries(data)) {
    const zip = geo.replace('86000US', '');
    try {
      const mv = vals.B25077.estimate.B25077001;
      const inc = vals.B19013.estimate.B19013001;
      const occ = vals.B25003.estimate;
      const totOcc = occ.B25003001 || 0;
      const renterPct = totOcc ? 100 * (occ.B25003003 || 0) / totOcc : null;
      const vac = vals.B25002.estimate;
      const totUnits = vac.B25002001 || 0;
      const vacPct = totUnits ? 100 * (vac.B25002003 || 0) / totUnits : null;
      out[zip] = {
        median_home: mv, median_income: inc,
        renter_pct: renterPct == null ? null : +renterPct.toFixed(1),
        vacancy_pct: vacPct == null ? null : +vacPct.toFixed(1),
      };
    } catch(e) { /* incomplete table set for this geo */ }
  }
  return out;
}

function derive(row) {
  const fmr2 = row.fmr_2br;
  const mh = row.median_home, inc = row.median_income;
  row.annual_rent = fmr2 * 12;
  row.gross_yield = mh ? +(100 * row.annual_rent / mh).toFixed(2) : null;
  row.pr_ratio = mh ? +(mh / row.annual_rent).toFixed(1) : null;
  row.rent_burden = inc ? +(100 * row.annual_rent / inc).toFixed(1) : null;
}

function scoreRows() {
  const num = k => ROWS.map(r => r[k]).filter(v => v != null);
  const norm = (v, arr, invert=false) => {
    if (v == null || arr.length < 2) return null;
    const mn = Math.min(...arr), mx = Math.max(...arr);
    if (mx === mn) return 0.5;
    const n = (v - mn) / (mx - mn);
    return invert ? 1 - n : n;
  };
  const yields = num('gross_yield'), renters = num('renter_pct'),
        vacs = num('vacancy_pct'), burdens = num('rent_burden'), incomes = num('median_income');
  for (const r of ROWS) {
    const parts = [
      [norm(r.gross_yield, yields), 0.40],
      [norm(r.renter_pct, renters), 0.20],
      [norm(r.vacancy_pct, vacs, true), 0.15],
      [norm(r.rent_burden, burdens, true), 0.15],
      [norm(r.median_income, incomes), 0.10],
    ].filter(([v]) => v != null);
    if (!parts.length) { r.score = null; r.grade = 'D'; continue; }
    const wSum = parts.reduce((s,[,w]) => s + w, 0);
    r.score = Math.round(100 * parts.reduce((s,[v,w]) => s + v*w, 0) / wSum);
    r.grade = r.score >= 75 ? 'A' : r.score >= 60 ? 'B' : r.score >= 45 ? 'C' : 'D';
  }
}

function setStatus(state, sub) {
  dataState = state;
  const dot = $('dataStatusDot'), title = $('dataStatusTitle'), sub2 = $('dataStatusSub');
  const pill = $('livePill'), pillText = $('livePillText');
  dot.className = 'api-dot' + (state === 'live' ? ' live' : state === 'cached' ? ' cached' : state === 'error' ? ' error' : '');
  const labels = { loading: 'LOADING DATA', live: 'LIVE DATA', cached: 'CACHED DATA', error: 'DATA ERROR' };
  title.textContent = labels[state] || state;
  sub2.textContent = sub || '';
  pill.className = 'live-pill' + (state === 'cached' ? ' cached' : state === 'error' ? ' error' : '');
  pillText.textContent = labels[state] || state;
}

async function loadData(forceRefresh=false) {
  setStatus('loading', 'Fetching live Census data…');
  $('loadProgress').style.display = 'block';
  $('loadProgress').textContent = 'contacting Census Reporter…';
  $('refreshBtn').disabled = true;
  try {
    const mres = await fetch(MARKETS_URL);
    if (!mres.ok) throw new Error('markets.json HTTP ' + mres.status);
    const mdata = await mres.json();
    MARKETS = mdata.markets;

    let census = null, fromCache = false;
    if (!forceRefresh) {
      const c = readCache();
      if (c) { census = c.data; fromCache = true; }
    }
    if (!census) {
      census = {};
      const zips = MARKETS.map(m => m.zip);
      for (let i = 0; i < zips.length; i += BATCH_SIZE) {
        const batch = zips.slice(i, i + BATCH_SIZE);
        $('loadProgress').textContent = `Census batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(zips.length/BATCH_SIZE)}…`;
        const payload = await fetchCensusBatch(batch);
        Object.assign(census, parseCensus(payload));
        await new Promise(r => setTimeout(r, 700)); // be polite to the free API
      }
      writeCache(census);
    }
    ROWS = MARKETS.map(m => Object.assign({}, m, census[m.zip] || {
      median_home: null, median_income: null, renter_pct: null, vacancy_pct: null }));
    ROWS.forEach(derive);
    scoreRows();

    const dt = fromCache ? JSON.parse(localStorage.getItem(CACHE_KEY)).ts : Date.now();
    setStatus(fromCache ? 'cached' : 'live',
      (fromCache ? 'cached ' : 'live · ') + new Date(dt).toLocaleString());
    $('loadProgress').style.display = 'none';
    renderAll();
    populateListingScope();
  } catch (err) {
    console.error(err);
    setStatus('error', String(err.message || err));
    $('loadProgress').style.display = 'none';
    $('emptyDashboard').style.display = 'none';
    $('loadError').style.display = 'block';
    $('loadErrorMsg').textContent = 'The Census data service didn\'t respond (' + (err.message || 'network error') + '). Check your connection and retry.';
    const tb = $('marketsTableBody');
    if (tb) tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--neg)">Data failed to load. Press “Refresh live data”.</td></tr>';
  } finally {
    $('refreshBtn').disabled = false;
  }
}

/* ---------------- navigation ---------------- */
const VIEW_TITLES = { dashboard: 'Dashboard', markets: 'Markets', detail: 'Market Detail', listings: 'Live Listings', compare: 'STR vs LTR', methodology: 'Data & Methodology' };
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('pageTitle').textContent = VIEW_TITLES[name] || name;
  $('sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}
function openDetail(zip) {
  renderDetail(zip);
  showView('detail');
}

/* ---------------- dashboard ---------------- */
function avg(k) {
  const vs = ROWS.map(r => r[k]).filter(v => v != null);
  return vs.length ? vs.reduce((a,b) => a + b, 0) / vs.length : null;
}
function renderDashboard() {
  const live = ROWS.filter(r => r.median_home != null).length;
  $('s-markets').textContent = live;
  $('s-markets-sub').textContent = `of ${ROWS.length} tracked ZIPs with Census data`;
  const y = avg('gross_yield');
  $('s-yield').textContent = y == null ? '—' : y.toFixed(2) + '%';
  $('s-yield-delta').textContent = y == null ? '' : bestYieldNote();
  const mh = avg('median_home');
  $('s-home').textContent = fmt$(mh);
  const rp = avg('renter_pct');
  $('s-renter').textContent = fmtPct(rp);
  const withData = ROWS.filter(r => r.gross_yield != null).length;
  $('s-markets-delta').innerHTML = withData
    ? `<span style="color:var(--live)">● ${withData} yields computed</span>`
    : `<span style="color:var(--warn)">no yield data</span>`;
  $('dashSourceBadge').textContent = dataState === 'live' ? '● Census Reporter · live' :
    dataState === 'cached' ? '● Census Reporter · cached' : '● waiting for data';

  if (!ROWS.length) return;
  $('emptyDashboard').style.display = 'none';
  $('loadError').style.display = 'none';
  $('dashboardContent').style.display = 'block';
  renderYieldChart();
  renderRankList();
  renderOppCards();
}
function bestYieldNote() {
  const best = [...ROWS].filter(r => r.gross_yield != null).sort((a,b) => b.gross_yield - a.gross_yield)[0];
  return best ? `best: ${best.zip} ${best.gross_yield}%` : '';
}
function renderYieldChart() {
  if (typeof Chart === 'undefined') {
    $('yieldChart').parentElement.innerHTML = '<p style="color:var(--t3);font-size:12px">Chart library failed to load (CDN). Data is still live in the tables.</p>';
    return;
  }
  const top = [...ROWS].filter(r => r.gross_yield != null).sort((a,b) => b.gross_yield - a.gross_yield).slice(0, 10);
  if (yieldChart) yieldChart.destroy();
  yieldChart = new Chart($('yieldChart'), {
    type: 'bar',
    data: { labels: top.map(r => r.zip),
      datasets: [{ data: top.map(r => r.gross_yield), backgroundColor: 'rgba(245,158,11,0.75)', borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.x}% · ${top[c.dataIndex].metro}` } } },
      scales: { x: { ticks: { color: '#606080', callback: v => v + '%' }, grid: { color: 'rgba(30,30,48,.6)' } },
                y: { ticks: { color: '#A0A0C0', font: { family: 'JetBrains Mono' } }, grid: { display: false } } },
      maintainAspectRatio: false }
  });
}
function renderRankList() {
  const ranked = [...ROWS].filter(r => r.score != null).sort((a,b) => b.score - a.score).slice(0, 8);
  $('rankList').innerHTML = ranked.map((r, i) =>
    `<div class="rank-row" data-zip="${esc(r.zip)}">
       <span class="rank-pos">${i+1}</span>
       <span class="grade-badge grade-${r.grade.toLowerCase()}">${r.grade}</span>
       <span class="rank-zip">${esc(r.zip)}</span>
       <span class="rank-metro">${esc(r.metro)}</span>
       <span class="rank-score">${r.score}</span>
     </div>`).join('');
  $('rankList').querySelectorAll('.rank-row').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.zip)));
}
function renderOppCards() {
  const pool = ROWS.filter(r => r.gross_yield != null);
  let sorted;
  if (dashMode === 'yield') sorted = [...pool].sort((a,b) => b.gross_yield - a.gross_yield);
  else if (dashMode === 'score') sorted = [...pool].sort((a,b) => (b.score||0) - (a.score||0));
  else sorted = [...pool].sort((a,b) => (a.median_home||Infinity) - (b.median_home||Infinity));
  const top3 = sorted.slice(0, 6);
  $('oppCards').innerHTML = top3.map(r =>
    `<div class="property-card" data-zip="${esc(r.zip)}">
       <div class="prop-header"><div><div class="prop-address">${esc(r.zip)}</div><div class="prop-city">${esc(r.metro)}</div></div>
       <span class="prop-badge">GRADE ${r.grade}</span></div>
       <div class="prop-price-row"><span class="prop-price">${fmt$(r.median_home)}</span>
       <span class="prop-delta" style="color:var(--pos)">${r.gross_yield}% yield</span></div>
       <div class="prop-metrics">
         <div class="metric-chip"><div class="metric-val">${fmt$(r.fmr_2br)}</div><div class="metric-lbl">FMR 2BR/mo</div></div>
         <div class="metric-chip"><div class="metric-val">${fmtPct(r.renter_pct,0)}</div><div class="metric-lbl">Renters</div></div>
         <div class="metric-chip"><div class="metric-val">${r.pr_ratio || '—'}</div><div class="metric-lbl">P/R ratio</div></div>
       </div>
     </div>`).join('') || '<p style="color:var(--t3)">No complete market data yet.</p>';
  $('oppCards').querySelectorAll('.property-card').forEach(el =>
    el.addEventListener('click', () => openDetail(el.dataset.zip)));
}

/* ---------------- markets table ---------------- */
function renderTable() {
  const q = $('globalSearch').value.trim().toLowerCase();
  let rows = ROWS.filter(r => !q || r.zip.includes(q) || r.metro.toLowerCase().includes(q));
  rows = [...rows].sort((a,b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sortDir;
  });
  $('tableCount').textContent = `${rows.length} of ${ROWS.length} markets`;
  $('liveCountBadge').style.display = dataState === 'live' ? '' : 'none';
  $('marketsTableBody').innerHTML = rows.map(r =>
    `<tr data-zip="${esc(r.zip)}">
       <td class="addr" style="font-family:var(--mono);font-weight:600">${esc(r.zip)}</td>
       <td>${esc(r.metro)}</td>
       <td class="num">${fmt$(r.fmr_2br)}</td>
       <td class="num">${fmt$(r.median_home)}</td>
       <td class="${r.gross_yield != null && r.gross_yield >= 8 ? 'pos' : r.gross_yield != null ? 'gold' : ''}">${r.gross_yield == null ? '—' : r.gross_yield + '%'}</td>
       <td class="num">${r.pr_ratio || '—'}</td>
       <td class="num">${fmtPct(r.renter_pct,0)}</td>
       <td class="num">${fmtPct(r.vacancy_pct,0)}</td>
       <td><span class="grade-badge grade-${r.grade.toLowerCase()}">${r.grade}</span></td>
     </tr>`).join('');
  $('marketsTableBody').querySelectorAll('tr').forEach(tr =>
    tr.addEventListener('click', () => openDetail(tr.dataset.zip)));
  document.querySelectorAll('#marketsTable th').forEach(th => {
    const k = th.dataset.sort;
    th.querySelector('.sort-arrow').textContent = k === sortKey ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
  });
}
function exportCSV() {
  const head = ['zip','metro','hud_area','fmr_2br','median_home','median_income','renter_pct','vacancy_pct','gross_yield','pr_ratio','rent_burden','score','grade'];
  const lines = [head.join(',')].concat(ROWS.map(r =>
    head.map(k => { const v = r[k]; return v == null ? '' : (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v); }).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'investiq_v2_markets.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- detail view ---------------- */
function kv(label, value, cls='') {
  return `<div class="kv-row"><span class="kv-label">${label}</span><span class="kv-value ${cls}">${value}</span></div>`;
}
function renderDetail(zip) {
  const r = ROWS.find(x => x.zip === zip);
  if (!r) return;
  const fmrRows = [['Efficiency', r.fmr_0br], ['1 BR', r.fmr_1br], ['2 BR', r.fmr_2br], ['3 BR', r.fmr_3br], ['4 BR', r.fmr_4br]]
    .map(([l, v]) => kv(l + ' FMR', fmt$(v))).join('');
  $('detailContent').innerHTML = `
    <div class="detail-hero">
      <span class="grade-badge grade-${r.grade.toLowerCase()}" style="position:absolute;top:20px;right:20px;width:44px;height:44px;font-size:18px">${r.grade}</span>
      <div class="detail-zip">${esc(r.zip)}</div>
      <div class="detail-metro">${esc(r.metro)} · composite score ${r.score == null ? '—' : r.score + '/100'}</div>
      <div class="detail-hud">${esc(r.hud_area)}</div>
    </div>
    <div class="detail-grid">
      <div class="chart-panel"><div class="chart-title">Valuation &amp; Yield</div>
        ${kv('Median home value', fmt$(r.median_home), 'gold')}
        ${kv('HUD FY2027 FMR 2BR / mo', fmt$(r.fmr_2br), 'green')}
        ${kv('Gross rental yield', r.gross_yield == null ? '—' : r.gross_yield + '%', 'gold')}
        ${kv('Price-to-rent ratio', r.pr_ratio || '—')}
        ${kv('Rent burden (FMR ÷ income)', fmtPct(r.rent_burden, 0))}
      </div>
      <div class="chart-panel"><div class="chart-title">Demand &amp; Risk (ACS 2024 5-yr)</div>
        ${kv('Median household income', fmt$(r.median_income))}
        ${kv('Renter-occupied share', fmtPct(r.renter_pct, 0), 'green')}
        ${kv('Vacancy rate', fmtPct(r.vacancy_pct, 0))}
        ${kv('Data status', dataState === 'live' ? '● live from Census Reporter' : dataState === 'cached' ? '● cached (≤7 days)' : '● unavailable', dataState === 'live' ? 'green' : '')}
      </div>
    </div>
    <div class="chart-panel" style="margin-bottom:20px"><div class="chart-title">HUD FY2027 Fair Market Rents by bedroom</div>
      <div class="chart-sub">Official SAFMR schedule · effective Oct 1, 2026 · gross rents incl. utilities</div>
      ${fmrRows}
    </div>
    <p class="table-footnote">Estimates carry Census margins of error; treat close yields as ties. FMR is a benchmark, not a guaranteed achievable rent.</p>`;
}

/* ---------------- STR vs LTR scenario ---------------- */
function renderCompare() {
  if (!ROWS.length) { $('compareBody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--t3)">Waiting for data…</td></tr>'; return; }
  const nightly = Math.max(20, +$('sc-nightly').value || 145);
  const occ = Math.min(100, Math.max(5, +$('sc-occ').value || 62)) / 100;
  const strCosts = Math.max(0, +$('sc-costs').value || 0);
  const ltrCosts = Math.max(0, +$('sc-ltrcosts').value || 0);
  const strGross = nightly * 30 * occ;
  const rows = ROWS.map(r => {
    const ltrNet = r.fmr_2br - ltrCosts;
    const strNet = strGross - strCosts;
    const winner = strNet > ltrNet ? 'STR' : 'LTR';
    return { r, ltrNet, strNet, winner, edge: Math.abs(strNet - ltrNet) };
  }).sort((a,b) => b.edge - a.edge);
  $('compareBody').innerHTML = rows.map(({ r, ltrNet, strNet, winner, edge }) =>
    `<tr data-zip="${esc(r.zip)}">
       <td class="addr" style="font-family:var(--mono)">${esc(r.zip)}</td><td>${esc(r.metro)}</td>
       <td class="num">${fmt$(r.fmr_2br)}</td>
       <td class="num">${fmt$(ltrNet)}</td>
       <td class="num">${fmt$(strGross)}</td>
       <td class="num">${fmt$(strNet)}</td>
       <td class="num" style="color:${winner === 'STR' ? 'var(--pos)' : 'var(--gold)'};font-weight:700">${winner}</td>
       <td class="num">${fmt$(edge)}/mo</td>
     </tr>`).join('');
  $('compareBody').querySelectorAll('tr').forEach(tr =>
    tr.addEventListener('click', () => openDetail(tr.dataset.zip)));
}

function renderAll() {
  renderDashboard();
  renderTable();
  renderCompare();
}

/* ================================================================
   LIVE LISTINGS — real for-sale inventory via Realtor.com (RapidAPI).
   Key stays in the user's browser localStorage. Each listing gets an
   implied gross yield from the ZIP's HUD FY2027 2BR rent:
     implied_yield = fmr_2br * 12 / list_price
   directly comparable to ZIP-level gross yields in the model.
================================================================ */
const RAPID_HOST = 'realty-in-us.p.rapidapi.com';
const LISTINGS_URL = `https://${RAPID_HOST}/properties/v3/list`;
const RAPID_KEY_STORE = 'investiq_v2_rapidapi_key';
const LISTINGS_CACHE_KEY = 'investiq_v2_listings_v1';
const LISTINGS_CACHE_TTL_MS = 24 * 3600 * 1000;
const LISTINGS_PER_ZIP = 50;

const listings = {
  key: null,
  callsThisSession: 0,
  scanning: false,
  results: [],
};

function getRapidKey() {
  if (!listings.key) { try { listings.key = localStorage.getItem(RAPID_KEY_STORE); } catch (e) {} }
  return listings.key;
}
function setRapidKey(k) {
  listings.key = k;
  try { if (k) localStorage.setItem(RAPID_KEY_STORE, k); else localStorage.removeItem(RAPID_KEY_STORE); } catch (e) {}
}

function getListingsCache() {
  try { return JSON.parse(localStorage.getItem(LISTINGS_CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveListingsCache(c) {
  try { localStorage.setItem(LISTINGS_CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}

/* Raw API shape → flat listing record (fields per Realty-in-US v3 docs) */
function flattenListing(home) {
  const loc = home.location || {}, addr = loc.address || {}, coord = addr.coordinate || {};
  const desc = home.description || {}, photo = home.primary_photo || {};
  const flags = home.flags || {};
  return {
    property_id: home.property_id || home.listing_id || null,
    listing_href: home.href || null,
    status: home.status || null,
    list_price: typeof home.list_price === 'number' ? home.list_price : null,
    list_date: home.list_date || null,
    beds: desc.beds ?? null,
    baths: desc.baths ?? null,
    sqft: desc.sqft ?? null,
    lot_sqft: desc.lot_sqft ?? null,
    year_built: desc.year_built ?? null,
    type: desc.type || null,
    sub_type: desc.sub_type || null,
    address_line: addr.line || null,
    city: addr.city || null,
    state: addr.state_code || null,
    postal_code: addr.postal_code || null,
    lat: coord.lat ?? null,
    lon: coord.lon ?? null,
    photo: photo.href || null,
    is_pending: !!(flags.is_pending || flags.is_contingent),
    days_on: home.days_on_realtor ?? null,
  };
}

async function realtyListForZip(apiKey, zip, limit, offset) {
  const res = await fetch(LISTINGS_URL, {
    method: 'POST',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPID_HOST,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      limit, offset,
      postal_code: zip,
      status: ['for_sale'],
      sort: { direction: 'desc', field: 'list_date' },
    }),
  });
  listings.callsThisSession++;
  updateQuotaBadge();
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('bad_key'), { code: 'bad_key' });
  if (res.status === 429) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
  if (!res.ok) throw Object.assign(new Error('http_' + res.status), { code: 'http', status: res.status });
  const json = await res.json().catch(() => ({}));
  const hs = (json.data && json.data.home_search) || {};
  return (hs.results || []).map(flattenListing);
}

function updateQuotaBadge() {
  const b = $('quotaBadge');
  if (b) b.textContent = listings.callsThisSession + ' API call' + (listings.callsThisSession === 1 ? '' : 's');
}

function criteriaFromUI() {
  return {
    minYield: parseFloat($('lc-minYield').value) || 0,
    maxPrice: parseFloat($('lc-maxPrice').value) || Infinity,
    minBeds: parseInt($('lc-minBeds').value, 10) || 0,
    type: $('lc-type').value || null,
    hidePending: $('lc-hidePending').checked,
  };
}

/* Score + filter a flat listing against the ranking model */
function scoreListing(l, zipRow, crit) {
  l.zip = l.postal_code || '';
  l.fmr_2br = zipRow ? zipRow.fmr_2br : null;
  l.zipGrade = zipRow ? zipRow.grade : null;
  l.zipScore = zipRow ? zipRow.score : null;
  l.implied_yield = (l.list_price && zipRow && zipRow.fmr_2br)
    ? +(100 * zipRow.fmr_2br * 12 / l.list_price).toFixed(2)
    : null;
  l.passes = true; l.failReason = null;
  if (l.implied_yield == null || l.implied_yield < crit.minYield) { l.passes = false; l.failReason = 'yield'; }
  else if (l.list_price > crit.maxPrice) { l.passes = false; l.failReason = 'price'; }
  else if (l.beds != null && l.beds < crit.minBeds) { l.passes = false; l.failReason = 'beds'; }
  else if (crit.type && l.type !== crit.type) { l.passes = false; l.failReason = 'type'; }
  else if (crit.hidePending && l.is_pending) { l.passes = false; l.failReason = 'pending'; }
  else if (!l.list_price) { l.passes = false; l.failReason = 'no_price'; }
  return l;
}

function renderListingCards() {
  const wrap = $('listingCards');
  const empty = $('listingEmpty');
  const matched = listings.results.filter(l => l.passes);
  $('listingCount').textContent = matched.length + ' match' + (matched.length === 1 ? '' : 'es') +
    ' · ' + listings.results.length + ' scanned';
  if (!matched.length) {
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  wrap.innerHTML = matched.map(l => {
    const hot = l.implied_yield >= 10;
    const photoHtml = l.photo
      ? `<img class="listing-photo" src="${esc(l.photo)}" alt="Property photo" loading="lazy" onerror="this.outerHTML='<div class=\\'listing-photo fallback\\'>🏠</div>'">`
      : `<div class="listing-photo fallback">🏠</div>`;
    return `<div class="listing-card">
      ${photoHtml}
      <div class="listing-body">
        <div class="listing-price-row">
          <span class="listing-price">${fmt$(l.list_price)}</span>
          <span class="yield-badge ${hot ? 'hot' : 'warm'}">${l.implied_yield != null ? l.implied_yield.toFixed(1) + '% yield' : '—'}</span>
        </div>
        <div>
          <div class="listing-addr">${esc(l.address_line || 'Address not listed')}</div>
          <div class="listing-locale">${esc([l.city, l.state, l.postal_code].filter(Boolean).join(', '))}</div>
        </div>
        <div class="listing-facts">
          <span>${l.beds != null ? l.beds + ' bd' : '— bd'}</span>
          <span>${l.baths != null ? l.baths + ' ba' : '— ba'}</span>
          <span>${l.sqft ? l.sqft.toLocaleString() + ' sqft' : ''}</span>
          <span>${esc(l.type || '').replace(/_/g, ' ')}</span>
        </div>
        <div class="listing-model">
          <span>ZIP <strong>${esc(l.zip)}</strong></span>
          ${l.zipGrade ? `<span class="grade-badge grade-${l.zipGrade.toLowerCase()}">${l.zipGrade}</span>` : ''}
          <span>FMR $${l.fmr_2br ? l.fmr_2br.toLocaleString() : '—'}/mo</span>
        </div>
        <div class="listing-cta">
          ${l.listing_href ? `<a class="listing-link" href="${esc(l.listing_href)}" target="_blank" rel="noopener">View on Realtor.com ↗</a>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function scanListings() {
  if (listings.scanning) return;
  const key = getRapidKey();
  if (!key) { $('keyStatus').textContent = 'Paste your RapidAPI key above first.'; $('keyStatus').className = 'key-status err'; return; }
  const crit = criteriaFromUI();
  const scope = $('lc-scope').value;
  const zips = scope === 'all' ? ROWS.map(r => r.zip) : ROWS.filter(r => r.metro === scope).map(r => r.zip);
  if (!zips.length) return;

  listings.scanning = true;
  $('scanBtn').disabled = true;
  const prog = $('scanProgress');
  prog.textContent = 'Starting scan…';
  prog.classList.add('visible');

  const cache = getListingsCache();
  const now = Date.now();
  const fresh = [], toFetch = [];
  zips.forEach(z => {
    const c = cache[z];
    if (c && now - c.ts < LISTINGS_CACHE_TTL_MS) fresh.push(...c.items);
    else toFetch.push(z);
  });

  listings.results = [];
  const zipMap = Object.fromEntries(ROWS.map(r => [r.zip, r]));
  fresh.forEach(l => listings.results.push(scoreListing(l, zipMap[l.postal_code], crit)));

  let failed = 0, badKey = false;
  for (let i = 0; i < toFetch.length; i++) {
    const z = toFetch[i];
    prog.textContent = `Fetching ${z} (${i + 1}/${toFetch.length})…`;
    try {
      const items = await realtyListForZip(key, z, LISTINGS_PER_ZIP, 0);
      cache[z] = { ts: now, items };
      items.forEach(l => listings.results.push(scoreListing(l, zipMap[l.postal_code] || zipMap[z], crit)));
    } catch (e) {
      failed++;
      if (e.code === 'bad_key') { badKey = true; break; }
      if (e.code === 'rate_limited') { prog.textContent = 'Rate limited by RapidAPI — wait a minute and try again.'; break; }
    }
  }
  saveListingsCache(cache);
  listings.scanning = false;
  $('scanBtn').disabled = false;

  // highest implied yield first — same ranking logic as the ZIP table
  listings.results.sort((a, b) => (b.implied_yield || 0) - (a.implied_yield || 0));
  renderListingCards();

  if (badKey) {
    $('keyStatus').textContent = 'Key rejected (401/403). Check the key or your RapidAPI subscription.';
    $('keyStatus').className = 'key-status err';
    $('keyBanner').style.display = 'flex';
    $('listingsMain').style.display = 'none';
  }
  prog.textContent = `Scan complete: ${listings.results.length} listings from ${zips.length} ZIPs` +
    (failed ? ` · ${failed} ZIP${failed === 1 ? '' : 's'} failed` : '') +
    (toFetch.length === 0 ? ' · all from 24h cache' : '') + '.';
  $('listingsSourceBadge').style.display = 'inline-block';
}

function initListings() {
  populateListingScope();

  const hasKey = !!getRapidKey();
  $('keyBanner').style.display = hasKey ? 'none' : 'flex';
  $('listingsMain').style.display = hasKey ? 'block' : 'none';
  if (hasKey) $('clearKeyBtn').style.display = 'inline-block';

  $('saveKeyBtn').addEventListener('click', async () => {
    const k = $('rapidKeyInput').value.trim();
    if (!k) { $('keyStatus').textContent = 'Paste a key first.'; $('keyStatus').className = 'key-status err'; return; }
    $('keyStatus').textContent = 'Verifying key…';
    $('keyStatus').className = 'key-status';
    try {
      // 1-call verification against a known ZIP
      await realtyListForZip(k, ROWS[0].zip, 1, 0);
      setRapidKey(k);
      $('keyStatus').textContent = '✓ Key verified — live listings unlocked.';
      $('keyStatus').className = 'key-status ok';
      $('clearKeyBtn').style.display = 'inline-block';
      setTimeout(() => { $('keyBanner').style.display = 'none'; $('listingsMain').style.display = 'block'; }, 800);
    } catch (e) {
      $('keyStatus').textContent = e.code === 'bad_key'
        ? 'Key rejected. Make sure you subscribed to "Realty in US" on RapidAPI and copied the key.'
        : 'Verification failed (' + (e.message || 'network') + '). Try again.';
      $('keyStatus').className = 'key-status err';
    }
  });
  $('clearKeyBtn').addEventListener('click', () => {
    setRapidKey(null);
    $('rapidKeyInput').value = '';
    $('clearKeyBtn').style.display = 'none';
    $('keyBanner').style.display = 'flex';
    $('listingsMain').style.display = 'none';
  });
  $('scanBtn').addEventListener('click', scanListings);
  // re-filter instantly when criteria change after a scan
  ['lc-minYield', 'lc-maxPrice', 'lc-minBeds', 'lc-type', 'lc-hidePending'].forEach(id =>
    $(id).addEventListener('change', () => {
      if (listings.results.length) {
        const crit = criteriaFromUI();
        const zipMap = Object.fromEntries(ROWS.map(r => [r.zip, r]));
        listings.results.forEach(l => scoreListing(l, zipMap[l.postal_code] || zipMap[l.zip], crit));
        listings.results.sort((a, b) => (b.implied_yield || 0) - (a.implied_yield || 0));
        renderListingCards();
      }
    }));
}

function populateListingScope() {
  // re-render scope select once ROWS is loaded (metros + counts)
  const sel = $('lc-scope');
  if (!sel || !ROWS.length) return;
  const cur = sel.value || 'all';
  sel.innerHTML = `<option value="all">All ${ROWS.length} ZIPs (~${ROWS.length} calls)</option>` +
    [...new Set(ROWS.map(r => r.metro))].sort()
      .map(m => `<option value="${esc(m)}">${esc(m)} (${ROWS.filter(r => r.metro === m).length} ZIPs)</option>`).join('');
  sel.value = cur;
}

/* ---------------- events ---------------- */
function init() {
  document.querySelectorAll('.nav-item').forEach(b =>
    b.addEventListener('click', () => showView(b.dataset.view)));
  $('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('refreshBtn').addEventListener('click', () => loadData(true));
  $('retryBtn').addEventListener('click', () => { $('loadError').style.display = 'none'; $('emptyDashboard').style.display = 'block'; loadData(true); });
  $('globalSearch').addEventListener('input', () => {
    const q = $('globalSearch').value.trim();
    if ($('view-markets').classList.contains('active')) renderTable();
    if (q.length === 5 && /^\d{5}$/.test(q) && ROWS.some(r => r.zip === q)) openDetail(q);
  });
  document.querySelectorAll('#marketsTable th').forEach(th =>
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
      renderTable();
    }));
  document.querySelectorAll('#dashModeToggle .mode-btn').forEach(b =>
    b.addEventListener('click', () => {
      document.querySelectorAll('#dashModeToggle .mode-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      dashMode = b.dataset.mode;
      renderOppCards();
    }));
  $('exportCsvBtn').addEventListener('click', exportCSV);
  initListings();
  $('backToMarkets').addEventListener('click', () => showView('markets'));
  $('sc-apply').addEventListener('click', renderCompare);
  ['sc-nightly','sc-occ','sc-costs','sc-ltrcosts'].forEach(id =>
    $(id).addEventListener('change', renderCompare));
  loadData(false);
}
document.addEventListener('DOMContentLoaded', init);
