// CapitolPulse — Live Congress Trading Tracker
// Client-side fetch from the free CongressInvests API, no build step, no server required.

const API_BASE = "https://congressinfor-production.up.railway.app/trades/recent";
const CACHE_KEY = "capitolpulse_cache_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h daily auto-refresh

let allTrades = [];
let lastUpdated = null;
let charts = {};

function amtMid(a) {
  if (!a) return NaN;
  const s = String(a).replace(/\$/g, "").replace(/,/g, "").trim();
  if (s.includes("-")) {
    const [lo, hi] = s.split("-").map(x => parseFloat(x.trim()));
    if (!isNaN(lo) && !isNaN(hi)) return (lo + hi) / 2;
    return NaN;
  }
  return parseFloat(s);
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

async function fetchAllTrades() {
  let trades = [];
  let offset = 0;
  const limit = 500;
  let meta = {};
  while (true) {
    const res = await fetch(`${API_BASE}?limit=${limit}&offset=${offset}`);
    const j = await res.json();
    trades = trades.concat(j.trades);
    meta = j;
    if (!j.has_more || offset > 10000) break;
    offset += limit;
  }
  return { trades, meta };
}

function processTrades(raw) {
  const today = new Date();
  return raw
    .map(t => {
      const txDate = new Date(t.tx_date);
      const disclosed = new Date(t.disclosed);
      return {
        ...t,
        tx_date_obj: txDate,
        disclosed_obj: disclosed,
        lag_days: daysBetween(txDate, disclosed),
        amount_mid: amtMid(t.amount),
        trade_type: (t.trade_type || "").toLowerCase()
      };
    })
    .filter(t => t.tx_date_obj <= today && t.lag_days >= 0);
}

async function refreshData(force = false) {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!force && cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.savedAt < CACHE_TTL_MS) {
      allTrades = parsed.trades;
      lastUpdated = parsed.lastUpdated;
      renderAll();
      return;
    }
  }
  document.getElementById("loading").style.display = "block";
  document.getElementById("app").style.display = "none";
  try {
    const { trades, meta } = await fetchAllTrades();
    allTrades = processTrades(trades);
    lastUpdated = meta.last_updated;
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      trades: allTrades, lastUpdated, savedAt: Date.now()
    }));
  } catch (e) {
    console.error("Failed to fetch live data, trying cache fallback", e);
    if (cached) {
      const parsed = JSON.parse(cached);
      allTrades = parsed.trades;
      lastUpdated = parsed.lastUpdated;
    }
  }
  renderAll();
}

function getFiltered() {
  const windowDays = parseInt(document.getElementById("f-window").value, 10);
  const chamber = document.getElementById("f-chamber").value;
  const type = document.getElementById("f-type").value;

  const maxDisclosed = allTrades.reduce((max, t) => t.disclosed_obj > max ? t.disclosed_obj : max, new Date(0));
  const cutoff = new Date(maxDisclosed);
  cutoff.setDate(cutoff.getDate() - windowDays);

  return allTrades.filter(t => {
    if (t.disclosed_obj < cutoff) return false;
    if (chamber !== "all" && t.chamber !== chamber) return false;
    if (type !== "all" && t.trade_type !== type) return false;
    return true;
  });
}

function fmtDollar(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function renderMetrics(filtered) {
  document.getElementById("m-count").textContent = filtered.length.toLocaleString();
  const totalVol = filtered.reduce((s, t) => s + (t.amount_mid || 0), 0);
  document.getElementById("m-volume").textContent = fmtDollar(totalVol);
  document.getElementById("m-tickers").textContent = new Set(filtered.map(t => t.ticker)).size;
  const buys = filtered.filter(t => t.trade_type === "buy").length;
  const sells = filtered.filter(t => t.trade_type === "sell").length;
  document.getElementById("m-net").textContent = `${buys} buy / ${sells} sell`;

  document.getElementById("stat-total").textContent = allTrades.length.toLocaleString();
  document.getElementById("stat-refresh").textContent = lastUpdated ? new Date(lastUpdated).toLocaleString() : "unknown";
  const avgLag = allTrades.reduce((s, t) => s + t.lag_days, 0) / (allTrades.length || 1);
  document.getElementById("stat-lag").textContent = `${avgLag.toFixed(0)} days`;
  document.getElementById("refresh-badge").textContent = `⏱️ Data cached locally, auto-refreshes every 24h — last pulled ${new Date().toLocaleString()}`;
}

function renderTickerChart(filtered) {
  const buyMap = {}, sellMap = {};
  filtered.forEach(t => {
    const map = t.trade_type === "buy" ? buyMap : (t.trade_type === "sell" ? sellMap : null);
    if (map) map[t.ticker] = (map[t.ticker] || 0) + (t.amount_mid || 0);
  });
  const tickers = Object.keys(buyMap).sort((a, b) => buyMap[b] - buyMap[a]).slice(0, 12);
  destroyChart("tickers");
  charts["tickers"] = new Chart(document.getElementById("chart-tickers"), {
    type: "bar",
    data: {
      labels: tickers,
      datasets: [{
        label: "Buy $ (mid-est)",
        data: tickers.map(t => buyMap[t] || 0),
        backgroundColor: "#166534"
      }]
    },
    options: {
      indexAxis: "y",
      plugins: { title: { display: true, text: "Top Stocks by Congressional Buy Volume", font: { size: 15 } }, legend: { display: false } },
      scales: { x: { title: { display: true, text: "Buy $ (mid-est)" } } }
    }
  });
}

function renderMemberChart(filtered) {
  const map = {};
  filtered.forEach(t => { map[t.member] = (map[t.member] || 0) + (t.amount_mid || 0); });
  const members = Object.keys(map).sort((a, b) => map[b] - map[a]).slice(0, 12);
  destroyChart("members");
  charts["members"] = new Chart(document.getElementById("chart-members"), {
    type: "bar",
    data: {
      labels: members,
      datasets: [{ label: "Total $ (mid-est)", data: members.map(m => map[m]), backgroundColor: "#b45309" }]
    },
    options: {
      indexAxis: "y",
      plugins: { title: { display: true, text: "Most Active Congress Members by Trade $", font: { size: 15 } }, legend: { display: false } },
      scales: { x: { title: { display: true, text: "Total $ (mid-est)" } } }
    }
  });
}

function renderTrendChart() {
  const monthly = {};
  allTrades.forEach(t => {
    const d = t.tx_date_obj;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthly[key]) monthly[key] = { buy: 0, sell: 0 };
    if (t.trade_type === "buy") monthly[key].buy += t.amount_mid || 0;
    if (t.trade_type === "sell") monthly[key].sell += t.amount_mid || 0;
  });
  const months = Object.keys(monthly).filter(m => m >= "2025-01").sort();
  destroyChart("trend");
  charts["trend"] = new Chart(document.getElementById("chart-trend"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Buy", data: months.map(m => monthly[m].buy), backgroundColor: "#16a34a" },
        { label: "Sell", data: months.map(m => monthly[m].sell), backgroundColor: "#dc2626" }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "Congressional Buy vs Sell Volume by Month", font: { size: 15 } } },
      scales: { y: { title: { display: true, text: "$ Volume (mid-est)" } } }
    }
  });
}

function renderLateFilers() {
  const map = {};
  allTrades.forEach(t => {
    if (!map[t.member]) map[t.member] = [];
    map[t.member].push(t.lag_days);
  });
  const rows = Object.entries(map)
    .map(([member, lags]) => [member, lags.reduce((a, b) => a + b, 0) / lags.length])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const tbody = document.querySelector("#table-late tbody");
  tbody.innerHTML = rows.map(([m, l]) => `<tr><td>${m}</td><td>${l.toFixed(0)}</td></tr>`).join("");
}

function renderRawTable(filtered) {
  const sorted = [...filtered].sort((a, b) => b.disclosed_obj - a.disclosed_obj).slice(0, 300);
  const tbody = document.querySelector("#table-raw tbody");
  tbody.innerHTML = sorted.map(t => `
    <tr>
      <td>${t.member}</td>
      <td>${t.chamber}</td>
      <td>${t.ticker || "–"}</td>
      <td><span class="pill ${t.trade_type}">${t.trade_type}</span></td>
      <td>${t.amount}</td>
      <td>${t.tx_date}</td>
      <td>${t.disclosed}</td>
    </tr>`).join("");

  const dl = document.getElementById("dl-csv");
  dl.onclick = () => {
    const headers = ["member","chamber","ticker","trade_type","amount","tx_date","disclosed","lag_days"];
    const csvRows = [headers.join(",")].concat(
      filtered.map(t => headers.map(h => `"${(t[h] ?? "")}"`).join(","))
    );
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "capitolpulse_filtered.csv"; a.click();
  };
}

function renderAll() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "block";
  const filtered = getFiltered();
  renderMetrics(filtered);
  renderTickerChart(filtered);
  renderMemberChart(filtered);
  renderTrendChart();
  renderLateFilers();
  renderRawTable(filtered);
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

["f-window", "f-chamber", "f-type"].forEach(id => {
  document.getElementById(id).addEventListener("change", renderAll);
});

refreshData(false);
