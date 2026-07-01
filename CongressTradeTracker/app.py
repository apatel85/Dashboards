"""
app.py — Flask API + HTML dashboard for the CongressTradeTracker master data.

Run:  python app.py           (dev, port 5000)
      gunicorn app:app        (production)

API Endpoints:
  GET /api/trades            Query master_trades (filters: chamber, status, member, ticker, from_date, to_date)
  GET /api/trades/<uid>      Get single trade record by trade_uid
  GET /api/refresh-log       Last 20 pipeline run records
  GET /api/stats             Summary stats (counts by chamber and status)
  GET /                      HTML dashboard
"""
import os
import sqlite3
from flask import Flask, jsonify, request, render_template_string

DB_PATH = os.getenv("DB_PATH", "output/master_trades.db")
app = Flask(__name__)


def query_db(sql: str, args=(), one: bool = False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(sql, args)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return (rows[0] if rows else None) if one else rows


# ── API: trades ──────────────────────────────────────────────────────────────
@app.route("/api/trades")
def get_trades():
    chamber = request.args.get("chamber", "").upper() or None
    status = request.args.get("status", "").upper() or None
    member = request.args.get("member", "") or None
    ticker = request.args.get("ticker", "").upper() or None
    from_date = request.args.get("from_date") or None
    to_date = request.args.get("to_date") or None

    sql = "SELECT * FROM master_trades WHERE 1=1"
    params = []
    if chamber:
        sql += " AND chamber = ?"; params.append(chamber)
    if status:
        sql += " AND verification_status = ?"; params.append(status)
    if member:
        sql += " AND member_name LIKE ?"; params.append(f"%{member}%")
    if ticker:
        sql += " AND ticker = ?"; params.append(ticker)
    if from_date:
        sql += " AND transaction_date >= ?"; params.append(from_date)
    if to_date:
        sql += " AND transaction_date <= ?"; params.append(to_date)
    sql += " ORDER BY transaction_date DESC LIMIT 500"

    return jsonify(query_db(sql, params))


@app.route("/api/trades/<trade_uid>")
def get_trade(trade_uid):
    rec = query_db("SELECT * FROM master_trades WHERE trade_uid = ?", [trade_uid], one=True)
    if not rec:
        return jsonify({"error": "not found"}), 404
    return jsonify(rec)


@app.route("/api/refresh-log")
def get_refresh_log():
    return jsonify(query_db(
        "SELECT * FROM refresh_log ORDER BY started_at DESC LIMIT 20"
    ))


@app.route("/api/stats")
def get_stats():
    by_chamber = query_db(
        "SELECT chamber, verification_status, COUNT(*) AS count "
        "FROM master_trades GROUP BY chamber, verification_status"
    )
    total = query_db("SELECT COUNT(*) AS total FROM master_trades", one=True)
    last_run = query_db(
        "SELECT * FROM refresh_log ORDER BY started_at DESC LIMIT 1", one=True
    )
    return jsonify({"by_chamber": by_chamber, "total": total, "last_run": last_run})


# ── HTML Dashboard ────────────────────────────────────────────────────────────
DASHBOARD = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Congress & White House Trade Tracker</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,Arial,sans-serif;background:#f5f5f3;color:#1a1a1a}
    header{background:#21808d;color:#fff;padding:16px 24px;display:flex;align-items:center;gap:12px}
    header h1{font-size:20px;font-weight:700}
    header span{font-size:12px;opacity:.8}
    .toolbar{background:#fff;border-bottom:1px solid #e0e0e0;padding:12px 24px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .toolbar select,.toolbar input{padding:7px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px}
    .toolbar button{padding:7px 16px;background:#21808d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px}
    .toolbar button:hover{background:#196570}
    .stats-bar{display:flex;gap:16px;padding:12px 24px;background:#eef9fa;border-bottom:1px solid #d0eef1}
    .stat{text-align:center}
    .stat .num{font-size:22px;font-weight:700;color:#21808d}
    .stat .lbl{font-size:11px;color:#666;text-transform:uppercase}
    .table-wrap{padding:16px 24px;overflow-x:auto}
    table{width:100%;border-collapse:collapse;background:#fff;font-size:13px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    th{background:#21808d;color:#fff;padding:10px 8px;text-align:left;white-space:nowrap}
    td{padding:8px;border-bottom:1px solid #f0f0f0}
    tr:hover td{background:#f9fefe}
    .VERIFIED{color:#196570;font-weight:700}
    .NEEDS_REVIEW{color:#bf912d;font-weight:700}
    .UNVERIFIED{color:#c52040;font-weight:700}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
    .b-house{background:#dff0ea;color:#196570}
    .b-senate{background:#dce8f7;color:#1a4e8a}
    .b-whitehouse{background:#fef3e2;color:#7a4f0d}
    a.src{color:#21808d;font-size:11px}
    .meta{font-size:11px;color:#888;padding:8px 24px 16px}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>&#127482;&#127480; Congress &amp; White House Trade Tracker</h1>
      <span>Master data · Four-source verified · Refreshes every 6 hours</span>
    </div>
  </header>

  <div class="stats-bar">
    <div class="stat"><div class="num" id="s-total">—</div><div class="lbl">Total Trades</div></div>
    <div class="stat"><div class="num" id="s-verified" style="color:#196570">—</div><div class="lbl">Verified</div></div>
    <div class="stat"><div class="num" id="s-review" style="color:#bf912d">—</div><div class="lbl">Needs Review</div></div>
    <div class="stat"><div class="num" id="s-unverified" style="color:#c52040">—</div><div class="lbl">Unverified</div></div>
    <div class="stat" style="margin-left:auto"><div class="num" id="s-lastrun" style="font-size:13px;color:#666">—</div><div class="lbl">Last Refresh</div></div>
  </div>

  <div class="toolbar">
    <select id="chamber">
      <option value="">All Chambers</option>
      <option value="HOUSE">&#127968; House</option>
      <option value="SENATE">&#127963; Senate</option>
      <option value="WHITEHOUSE">&#127968; White House / POTUS</option>
    </select>
    <select id="status">
      <option value="">All Statuses</option>
      <option value="VERIFIED">&#9989; Verified</option>
      <option value="NEEDS_REVIEW">&#9888;&#65039; Needs Review</option>
      <option value="UNVERIFIED">&#10060; Unverified</option>
    </select>
    <input id="member" placeholder="Member / official name" style="width:180px">
    <input id="ticker" placeholder="Ticker (e.g. NVDA)" style="width:120px">
    <input id="from_date" type="date" title="From date">
    <input id="to_date" type="date" title="To date">
    <button onclick="loadTrades()">&#128269; Filter</button>
    <button onclick="clearFilters()" style="background:#888">Clear</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Chamber</th><th>Member / Official</th><th>Role</th>
          <th>Ticker</th><th>Type</th><th>Txn Date</th>
          <th>Disclosed</th><th>Amount Range</th>
          <th>Confidence</th><th>Status</th><th>Source Doc</th>
        </tr>
      </thead>
      <tbody id="tbody"><tr><td colspan="11" style="text-align:center;padding:24px;color:#999">Loading...</td></tr></tbody>
    </table>
  </div>
  <div class="meta" id="meta"></div>

<script>
async function loadStats() {
  const r = await fetch('/api/stats');
  const d = await r.json();
  document.getElementById('s-total').textContent = d.total?.total ?? 0;
  let v=0,nr=0,uv=0;
  (d.by_chamber||[]).forEach(row=>{
    if(row.verification_status==='VERIFIED') v+=row.count;
    else if(row.verification_status==='NEEDS_REVIEW') nr+=row.count;
    else uv+=row.count;
  });
  document.getElementById('s-verified').textContent = v;
  document.getElementById('s-review').textContent = nr;
  document.getElementById('s-unverified').textContent = uv;
  if(d.last_run) document.getElementById('s-lastrun').textContent = d.last_run.started_at?.slice(0,16).replace('T',' ') + ' UTC';
}

async function loadTrades() {
  const p = new URLSearchParams({
    chamber: document.getElementById('chamber').value,
    status:  document.getElementById('status').value,
    member:  document.getElementById('member').value,
    ticker:  document.getElementById('ticker').value,
    from_date: document.getElementById('from_date').value,
    to_date:   document.getElementById('to_date').value,
  });
  const r = await fetch('/api/trades?' + p.toString());
  const data = await r.json();
  const tbody = document.getElementById('tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:#999">No records found</td></tr>';
    document.getElementById('meta').textContent = '';
    return;
  }
  const chamberBadge = c => ({'HOUSE':'b-house','SENATE':'b-senate','WHITEHOUSE':'b-whitehouse'}[c]||'');
  tbody.innerHTML = data.map(r => `
    <tr>
      <td><span class="badge ${chamberBadge(r.chamber)}">${r.chamber||''}</span></td>
      <td>${r.member_name||''}</td>
      <td style="font-size:11px;color:#666">${r.role||''}</td>
      <td><strong>${r.ticker||''}</strong></td>
      <td>${r.transaction_type||''}</td>
      <td>${r.transaction_date||''}</td>
      <td>${r.disclosure_date||''}</td>
      <td>${r.amount_range||''}</td>
      <td style="text-align:center">${r.confidence_score ?? ''}</td>
      <td><span class="${r.verification_status}">${r.verification_status||''}</span></td>
      <td>${r.official_doc_url ? `<a class="src" href="${r.official_doc_url}" target="_blank">&#128196; source</a>` : '<span style="color:#ccc">—</span>'}</td>
    </tr>`).join('');
  document.getElementById('meta').textContent = `Showing ${data.length} record${data.length!==1?'s':''} · last checked ${data[0]?.last_checked_at?.slice(0,16).replace('T',' ')} UTC`;
}

function clearFilters() {
  ['chamber','status'].forEach(id=>document.getElementById(id).value='');
  ['member','ticker','from_date','to_date'].forEach(id=>document.getElementById(id).value='');
  loadTrades();
}

loadStats();
loadTrades();
</script>
</body>
</html>
"""

@app.route("/")
def dashboard():
    return render_template_string(DASHBOARD)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
