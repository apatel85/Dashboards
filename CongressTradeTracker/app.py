"""
app.py - Flask API + HTML dashboard with session-based login.

Run (dev):   python app.py
Run (prod):  gunicorn app:app

Environment variables:
  SECRET_KEY     Flask session secret
  ADMIN_USERNAME Login username (default: admin)
  ADMIN_PASSWORD Login password (CHANGE before deploying)
  DB_PATH        SQLite DB path (default: output/master_trades.db)
"""
import os
import sqlite3
import hashlib
import secrets
from functools import wraps
from flask import (
    Flask, jsonify, request, render_template_string,
    session, redirect, url_for
)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))

DB_PATH    = os.getenv("DB_PATH", "output/master_trades.db")
ADMIN_USER = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "ChangeMe123!")

def _hash(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def query_db(sql, args=(), one=False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(sql, args)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return (rows[0] if rows else None) if one else rows

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login_page", next=request.path))
        return f(*args, **kwargs)
    return decorated

LOGIN_HTML = """
<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login - Congress Trade Tracker</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;background:#f0f4f5;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#fff;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.10);padding:40px 36px;width:360px}
.logo{text-align:center;margin-bottom:24px}
.logo h1{font-size:20px;color:#21808d;font-weight:700}
.logo p{font-size:12px;color:#888;margin-top:4px}
label{display:block;font-size:13px;color:#444;margin-bottom:6px;margin-top:16px}
input{width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:6px;font-size:14px;outline:none}
input:focus{border-color:#21808d;box-shadow:0 0 0 3px rgba(33,128,141,.15)}
button{width:100%;margin-top:24px;padding:11px;background:#21808d;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#196570}
.err{background:#fde8ec;color:#c52040;border-radius:6px;padding:10px 12px;font-size:13px;margin-top:16px}
.footer{text-align:center;font-size:11px;color:#aaa;margin-top:20px}
</style></head><body>
<div class="card">
  <div class="logo">
    <h1>&#127482;&#127480; Congress Trade Tracker</h1>
    <p>Four-source verified disclosure data</p>
  </div>
  {% if error %}<div class="err">{{ error }}</div>{% endif %}
  <form method="POST" action="/login">
    <input type="hidden" name="next" value="{{ next }}">
    <label>Username</label>
    <input type="text" name="username" autocomplete="username" required>
    <label>Password</label>
    <input type="password" name="password" autocomplete="current-password" required>
    <button type="submit">Sign In</button>
  </form>
  <div class="footer">Educational &amp; research use only &middot; Not investment advice</div>
</div>
</body></html>
"""

@app.route("/login", methods=["GET", "POST"])
def login_page():
    error = None
    next_url = request.args.get("next") or request.form.get("next") or "/"
    if request.method == "POST":
        uname = request.form.get("username", "").strip()
        pw = request.form.get("password", "")
        if uname == ADMIN_USER and _hash(pw) == _hash(ADMIN_PASS):
            session["logged_in"] = True
            session["username"] = uname
            return redirect(next_url)
        try:
            row = query_db(
                "SELECT password_hash FROM users WHERE username=? AND active=1",
                [uname], one=True
            )
            if row and row["password_hash"] == _hash(pw):
                session["logged_in"] = True
                session["username"] = uname
                return redirect(next_url)
        except Exception:
            pass
        error = "Invalid username or password."
    return render_template_string(LOGIN_HTML, error=error, next=next_url)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))

@app.route("/api/trades")
@login_required
def get_trades():
    chamber   = request.args.get("chamber", "").upper() or None
    status    = request.args.get("status", "").upper() or None
    member    = request.args.get("member") or None
    ticker    = request.args.get("ticker", "").upper() or None
    from_date = request.args.get("from_date") or None
    to_date   = request.args.get("to_date") or None
    sql = "SELECT * FROM master_trades WHERE 1=1"
    params = []
    if chamber:   sql += " AND chamber=?";             params.append(chamber)
    if status:    sql += " AND verification_status=?"; params.append(status)
    if member:    sql += " AND member_name LIKE ?";    params.append(f"%{member}%")
    if ticker:    sql += " AND ticker=?";              params.append(ticker)
    if from_date: sql += " AND transaction_date>=?";   params.append(from_date)
    if to_date:   sql += " AND transaction_date<=?";   params.append(to_date)
    sql += " ORDER BY transaction_date DESC LIMIT 500"
    return jsonify(query_db(sql, params))

@app.route("/api/trades/<trade_uid>")
@login_required
def get_trade(trade_uid):
    rec = query_db("SELECT * FROM master_trades WHERE trade_uid=?", [trade_uid], one=True)
    return jsonify(rec) if rec else (jsonify({"error": "not found"}), 404)

@app.route("/api/refresh-log")
@login_required
def get_refresh_log():
    return jsonify(query_db("SELECT * FROM refresh_log ORDER BY started_at DESC LIMIT 20"))

@app.route("/api/stats")
@login_required
def get_stats():
    by_chamber = query_db(
        "SELECT chamber, verification_status, COUNT(*) AS count "
        "FROM master_trades GROUP BY chamber, verification_status"
    )
    total    = query_db("SELECT COUNT(*) AS total FROM master_trades", one=True)
    last_run = query_db("SELECT * FROM refresh_log ORDER BY started_at DESC LIMIT 1", one=True)
    return jsonify({"by_chamber": by_chamber, "total": total, "last_run": last_run})

DASHBOARD = """
<!doctype html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Congress &amp; White House Trade Tracker</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;background:#f5f5f3;color:#1a1a1a}
header{background:#21808d;color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between}
header h1{font-size:19px;font-weight:700}
.logout{color:#fff;font-size:12px;text-decoration:none;background:rgba(255,255,255,.18);padding:4px 12px;border-radius:12px}
.logout:hover{background:rgba(255,255,255,.3)}
.toolbar{background:#fff;border-bottom:1px solid #e0e0e0;padding:12px 24px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.toolbar select,.toolbar input{padding:7px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px}
.toolbar button{padding:7px 16px;background:#21808d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px}
.toolbar button:hover{background:#196570}
.stats-bar{display:flex;gap:20px;padding:12px 24px;background:#eef9fa;border-bottom:1px solid #d0eef1;flex-wrap:wrap}
.stat{text-align:center;min-width:80px}
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
.meta-bar{font-size:11px;color:#888;padding:6px 24px 14px}
</style></head><body>
<header>
  <div>
    <h1>&#127482;&#127480; Congress &amp; White House Trade Tracker</h1>
    <div style="font-size:12px;opacity:.8">Master data &middot; Four-source verified &middot; Refreshes every 6 hours</div>
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-size:12px;opacity:.8">Signed in as <strong>{{ username }}</strong></span>
    <a class="logout" href="/logout">Sign out</a>
  </div>
</header>
<div class="stats-bar">
  <div class="stat"><div class="num" id="s-total">&mdash;</div><div class="lbl">Total Trades</div></div>
  <div class="stat"><div class="num" id="s-verified" style="color:#196570">&mdash;</div><div class="lbl">Verified</div></div>
  <div class="stat"><div class="num" id="s-review" style="color:#bf912d">&mdash;</div><div class="lbl">Needs Review</div></div>
  <div class="stat"><div class="num" id="s-unverified" style="color:#c52040">&mdash;</div><div class="lbl">Unverified</div></div>
  <div class="stat" style="margin-left:auto"><div class="num" id="s-lastrun" style="font-size:13px;color:#666">&mdash;</div><div class="lbl">Last Refresh</div></div>
</div>
<div class="toolbar">
  <select id="chamber">
    <option value="">All Chambers</option>
    <option value="HOUSE">House</option>
    <option value="SENATE">Senate</option>
    <option value="WHITEHOUSE">White House / POTUS</option>
  </select>
  <select id="status">
    <option value="">All Statuses</option>
    <option value="VERIFIED">Verified</option>
    <option value="NEEDS_REVIEW">Needs Review</option>
    <option value="UNVERIFIED">Unverified</option>
  </select>
  <input id="member" placeholder="Member / official name" style="width:180px">
  <input id="ticker" placeholder="Ticker (e.g. NVDA)" style="width:120px">
  <input id="from_date" type="date">
  <input id="to_date" type="date">
  <button onclick="loadTrades()">Filter</button>
  <button onclick="clearFilters()" style="background:#888">Clear</button>
</div>
<div class="table-wrap">
  <table>
    <thead><tr>
      <th>Chamber</th><th>Member / Official</th><th>Role</th>
      <th>Ticker</th><th>Type</th><th>Txn Date</th>
      <th>Disclosed</th><th>Amount Range</th>
      <th>Confidence</th><th>Status</th><th>Source Doc</th>
    </tr></thead>
    <tbody id="tbody"><tr><td colspan="11" style="text-align:center;padding:24px;color:#999">Loading...</td></tr></tbody>
  </table>
</div>
<div class="meta-bar" id="meta"></div>
<script>
async function loadStats(){
  const d=await(await fetch('/api/stats')).json();
  document.getElementById('s-total').textContent=d.total?.total??0;
  let v=0,nr=0,uv=0;
  (d.by_chamber||[]).forEach(r=>{
    if(r.verification_status==='VERIFIED')v+=r.count;
    else if(r.verification_status==='NEEDS_REVIEW')nr+=r.count;
    else uv+=r.count;
  });
  document.getElementById('s-verified').textContent=v;
  document.getElementById('s-review').textContent=nr;
  document.getElementById('s-unverified').textContent=uv;
  if(d.last_run)document.getElementById('s-lastrun').textContent=d.last_run.started_at?.slice(0,16).replace('T',' ')+' UTC';
}
async function loadTrades(){
  const p=new URLSearchParams({chamber:document.getElementById('chamber').value,status:document.getElementById('status').value,member:document.getElementById('member').value,ticker:document.getElementById('ticker').value,from_date:document.getElementById('from_date').value,to_date:document.getElementById('to_date').value});
  const data=await(await fetch('/api/trades?'+p)).json();
  const tb=document.getElementById('tbody');
  if(!Array.isArray(data)||!data.length){tb.innerHTML='<tr><td colspan="11" style="text-align:center;padding:24px;color:#999">No records. Run the ETL pipeline first.</td></tr>';document.getElementById('meta').textContent='';return;}
  const cb=c=>({'HOUSE':'b-house','SENATE':'b-senate','WHITEHOUSE':'b-whitehouse'}[c]||'');
  tb.innerHTML=data.map(r=>`<tr><td><span class="badge ${cb(r.chamber)}">${r.chamber||''}</span></td><td>${r.member_name||''}</td><td style="font-size:11px;color:#666">${r.role||''}</td><td><strong>${r.ticker||''}</strong></td><td>${r.transaction_type||''}</td><td>${r.transaction_date||''}</td><td>${r.disclosure_date||''}</td><td>${r.amount_range||''}</td><td style="text-align:center">${r.confidence_score??''}</td><td><span class="${r.verification_status}">${r.verification_status||''}</span></td><td>${r.official_doc_url?'<a class="src" href="'+r.official_doc_url+'" target="_blank">source</a>':'<span style="color:#ccc">&mdash;</span>'}</td></tr>`).join('');
  document.getElementById('meta').textContent=`Showing ${data.length} record${data.length!==1?'s':''} \u00b7 last checked ${data[0]?.last_checked_at?.slice(0,16).replace('T',' ')} UTC`;
}
function clearFilters(){['chamber','status'].forEach(id=>document.getElementById(id).value='');['member','ticker','from_date','to_date'].forEach(id=>document.getElementById(id).value='');loadTrades();}
loadStats();loadTrades();
</script>
</body></html>
"""

@app.route("/")
@login_required
def dashboard():
    return render_template_string(DASHBOARD, username=session.get("username", "user"))

if __name__ == "__main__":
    app.run(debug=True, port=5000)
