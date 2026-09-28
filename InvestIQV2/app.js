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
const VIEW_TITLES = { dashboard: 'Dashboard', markets: 'Markets', detail: 'Market Detail', compare: 'STR vs LTR', methodology: 'Data & Methodology' };
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
  $('backToMarkets').addEventListener('click', () => showView('markets'));
  $('sc-apply').addEventListener('click', renderCompare);
  ['sc-nightly','sc-occ','sc-costs','sc-ltrcosts'].forEach(id =>
    $(id).addEventListener('change', renderCompare));
  loadData(false);
}
document.addEventListener('DOMContentLoaded', init);
