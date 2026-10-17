#!/usr/bin/env python3
"""Build a self-contained interactive bug-tracker dashboard for the Quixera DEV environment.
Data-driven: bugs live in data/base.json and bugs/*.json. Re-run to regenerate.
Reconciliation: when a fix lands, set the bug's status to "Fixed" (after re-verifying) and republish."""
import base64, io, json, os
from PIL import Image

HERE = os.path.expanduser("~/workspace/quixera-qa-dev")
SRC = os.path.join(HERE, "screenshots")
SHOTS_SRC = os.path.join(HERE, "shots-src")
OUT = os.path.join(HERE, "quixera-dev-report.html")
DEV = "https://facility-dev.quixeraos.com"

def img_b64(path, max_w=1280, q=72):
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

CACHE = {}
def U(path):
    if path not in CACHE:
        CACHE[path] = img_b64(path)
    return CACHE[path]
    return CACHE[path]

def team_img(bug_id, idx):
    return os.path.join(SHOTS_SRC, f"{bug_id}-{idx}.jpg")

# ------------------------------------------------- data (JSON-driven)
# Bugs come from data/base.json (curated) plus QuixeraDev/bugs/*.json (QA Capture).
# Screenshots resolve relative to this directory.
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "index.html")
DEV = "https://facility-dev.quixeraos.com"

def _load_bugs():
    base = json.load(open(os.path.join(HERE, "data", "base.json")))
    bugs = list(base["bugs"])
    backlog = list(base.get("backlog", []))
    bugs_dir = os.path.join(HERE, "bugs")
    if os.path.isdir(bugs_dir):
        for fn in sorted(os.listdir(bugs_dir)):
            if fn.endswith(".json"):
                with open(os.path.join(bugs_dir, fn)) as f:
                    bugs.append(json.load(f))
    for b in bugs:
        b["imgs"] = [os.path.join(HERE, s) for s in b.get("shots", [])]
    return bugs, backlog

BUGS, BACKLOG = _load_bugs()

SEV_ORDER = ["High", "Medium", "Low", "Info"]
SEV_COLOR = {"High": "#b91c1c", "Medium": "#b45309", "Low": "#4d7c0f", "Info": "#1d4ed8"}
STATUS_COLOR = {"Open": "#b91c1c", "Partly fixed": "#b45309", "Still failing": "#7f1d1d",
                "Blocked": "#6b7280", "Fixed": "#15803d"}
SOURCE_LABEL = {"arlo": "Arlo dev pass", "team": "QA team retest", "manual": "Manual capture"}

def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def card(b):
    steps = "".join(f"<li>{esc(x)}</li>" for x in b["steps"])
    if b["imgs"]:
        shots = "".join(
            f'<figure><img src="{U(n)}" alt="{esc(os.path.basename(n))}" loading="lazy" onclick="openLB(this.src)">'
            f"<figcaption>{esc(os.path.basename(n).replace('.png', '').replace('.jpg', '').replace('-', ' '))}</figcaption></figure>"
            for n in b["imgs"])
    else:
        shots = '<div class="noshot">No screenshot attached.</div>'
    extra = ""
    if b.get("where"):
        extra += f"<p><b>Where:</b> {esc(b['where'])}</p>"
    if b.get("repro"):
        extra += f"<p><b>Reproducibility:</b> {esc(b['repro'])}</p>"
    if b.get("env"):
        extra += f"<p><b>Environment:</b> {esc(b['env'])}</p>"
    fix = f"<div class=\"fix\"><b>Suggested fix:</b> {esc(b['fix'])}</div>" if b.get("fix") else ""
    jira = f"<p><b>Jira:</b> <a href=\"{b['jira']}\" target=\"_blank\" rel=\"noopener\">{esc(b['jira'].rstrip('/').split('/')[-1])}</a> (parent ticket)</p>" if b.get("jira") else ""
    return f"""
    <article class="card" data-sev="{b['sev']}" data-status="{b['status']}" data-source="{b['source']}">
      <button class="card-head" onclick="toggleCard(this)">
        <span class="pill" style="background:{SEV_COLOR[b['sev']]}">{b['sev']}</span>
        <span class="cid">{b['id']}</span>
        <span class="ctitle">{esc(b['title'])}</span>
        <span class="status" style="background:{STATUS_COLOR[b['status']]}">{b['status']}</span>
        <span class="chev">▾</span>
      </button>
      <div class="card-body">
        <div class="cols">
          <div class="details">
            <p><span class="src">{SOURCE_LABEL[b['source']]}</span> {jira}</p>
            <p><a class="golink" href="{b['link']}" target="_blank" rel="noopener">↗ Open this page in the dev app</a></p>
            {extra}
            <p><b>Steps to reproduce:</b></p><ol>{steps}</ol>
            <p><b>Expected:</b> {esc(b['expected'])}</p>
            <p><b>Actual:</b> {esc(b['actual'])}</p>
            {fix}
          </div>
          <div class="shots">{shots}</div>
        </div>
      </div>
    </article>"""

sections = ""
for s in SEV_ORDER:
    cards = [card(b) for b in BUGS if b["sev"] == s]
    sections += f"""
    <section class="sevsec" data-sev="{s}">
      <h2><span class="pill big" style="background:{SEV_COLOR[s]}">{s}</span>
      <span class="count">{len(cards)} issue{'s' if len(cards) != 1 else ''}</span></h2>
      {''.join(cards)}
    </section>"""

bl_rows = ""
for i in BACKLOG:
    st = {"CHANGED": "Partly fixed", "STILL_FAILING": "Still failing", "BLOCKED": "Blocked"}[i["st"]]
    bl_rows += (f"<tr><td class='mono'>{esc(i['id'])}</td><td>{esc(i['title'])}</td>"
                f"<td><span class='status' style='background:{STATUS_COLOR[st]}'>{st}</span></td></tr>")

counts = {s: sum(1 for b in BUGS if b["sev"] == s) for s in SEV_ORDER}
n_open = sum(1 for b in BUGS if b["status"] == "Open")
n_src = {k: sum(1 for b in BUGS if b["source"] == k) for k in SOURCE_LABEL}

HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quixera DEV — Bug Tracker Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f1f4f8;color:#1f2937;line-height:1.55}
.wrap{max-width:1200px;margin:0 auto;padding:24px 20px 80px}
header{background:#1e3a5f;color:#fff;border-radius:14px;padding:28px 30px;margin-bottom:20px}
header h1{font-size:24px;margin-bottom:6px}
header p{color:#c3d2e5;font-size:14px}
.recon{background:#eff6ff;border:1px solid #3b82f6;border-radius:10px;padding:12px 16px;font-size:14px;margin:14px 0;color:#1e3a5f}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
.stat{background:#fff;border-radius:10px;padding:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat .n{font-size:26px;font-weight:700}
.stat .l{font-size:12px;color:#6b7280}
.toolbar{position:sticky;top:0;z-index:50;background:#f1f4f8ee;backdrop-filter:blur(6px);padding:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid #e5e7eb;margin-bottom:18px}
.fbtn{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer}
.fbtn.active{background:#1e3a5f;color:#fff;border-color:#1e3a5f}
.tbtn{margin-left:auto;border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
.sevsec{margin-bottom:26px}
.sevsec h2{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.pill{color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
.pill.big{font-size:13px;padding:5px 14px}
.count{font-size:14px;color:#6b7280}
.card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:12px;overflow:hidden}
.card-head{width:100%;display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border:0;cursor:pointer;text-align:left;font-size:15px}
.cid{font-weight:700;color:#1e3a5f;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:13px}
.ctitle{flex:1}
.status{color:#fff;font-size:11px;border-radius:999px;padding:3px 10px;white-space:nowrap}
.chev{color:#9ca3af;transition:transform .2s}
.card.open .chev{transform:rotate(180deg)}
.card-body{display:none;padding:0 18px 18px}
.card.open .card-body{display:block}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:860px){.cols{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}}
.details p{margin-bottom:10px;font-size:14px}
.details ol{margin:0 0 10px 20px;font-size:14px}
.details li{margin-bottom:4px}
.fix{background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:12px 14px;font-size:14px;margin-top:6px}
.src{display:inline-block;background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;margin-right:6px}
.golink{display:inline-block;background:#1e3a5f;color:#fff!important;text-decoration:none;font-size:13px;font-weight:600;border-radius:8px;padding:6px 14px;margin:2px 0 4px}
.golink:hover{background:#2c5282}
.shots figure{margin:0 0 14px}
.shots img{width:100%;border-radius:8px;border:1px solid #e5e7eb;cursor:zoom-in}
.shots figcaption{font-size:12px;color:#6b7280;margin-top:4px;text-transform:capitalize}
.noshot{background:#f3f4f6;border:1px dashed #d1d5db;border-radius:8px;padding:24px;text-align:center;color:#9ca3af;font-size:13px}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:100;cursor:zoom-out;padding:24px}
#lb img{max-width:96vw;max-height:94vh;border-radius:8px}
.note{background:#fff;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);font-size:14px}
.note h3{margin-bottom:8px;font-size:16px}
.note ul{margin-left:20px}
table.bl{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
table.bl td,table.bl th{padding:8px 12px;border-bottom:1px solid #eef0f3;text-align:left;vertical-align:top}
table.bl th{background:#f8fafc;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:nowrap}
footer{color:#6b7280;font-size:13px;margin-top:30px;text-align:center}
</style></head><body>
<div id="lb" onclick="this.style.display='none'"><img id="lbimg" src=""></div>
<div class="wrap">
<header>
<h1>Quixera DEV — Bug Tracker Dashboard</h1>
<p>https://facility-dev.quixeraos.com · QA team retest 2026-10-15 (186 fixes) + Arlo dev pass 2026-10-15 · Desktop 1440px, Chromium · Signed in as Ankit Patel (Admin) · QA_AP-labeled test records; no deletes / no outward-facing sends</p>
<div class="recon"><b>How to reconcile:</b> when a fix lands, tell Arlo (e.g. “QXR-416-F10 is fixed on dev”) — he'll re-verify on dev and flip the card to <b>Fixed</b>. Statuses: Open · Partly fixed · Still failing · Blocked · Fixed.</div>
<div class="grid">
<div class="stat"><div class="n" style="color:#b91c1c">""" + str(counts["High"]) + """</div><div class="l">High</div></div>
<div class="stat"><div class="n" style="color:#b45309">""" + str(counts["Medium"]) + """</div><div class="l">Medium</div></div>
<div class="stat"><div class="n" style="color:#4d7c0f">""" + str(counts["Low"]) + """</div><div class="l">Low</div></div>
<div class="stat"><div class="n" style="color:#1e3a5f">""" + str(n_open) + """</div><div class="l">Open now</div></div>
</div></header>
<div class="toolbar">
<button class="fbtn active" data-f="All">All · """ + str(len(BUGS)) + """</button>
<button class="fbtn" data-f="High">High · """ + str(counts["High"]) + """</button>
<button class="fbtn" data-f="Medium">Medium · """ + str(counts["Medium"]) + """</button>
<button class="fbtn" data-f="Low">Low · """ + str(counts["Low"]) + """</button>
<button class="fbtn" data-f="Info">Info · """ + str(counts["Info"]) + """</button>
<button class="fbtn" data-f="team">QA team · """ + str(n_src["team"]) + """</button>
<button class="fbtn" data-f="arlo">Arlo pass · """ + str(n_src["arlo"]) + """</button>
<button class="fbtn" data-f="manual">Manual · """ + str(n_src["manual"]) + """</button>
<button class="tbtn" onclick="setAll(true)">Expand all</button>
<button class="tbtn" onclick="setAll(false)">Collapse all</button>
</div>
""" + sections + """
<details class="note"><summary style="cursor:pointer;font-weight:600">Retest backlog — 19 partly fixed + 6 still failing + 2 blocked (from the QA team retest of 186 fixes)</summary>
<div style="overflow-x:auto;margin-top:10px"><table class="bl">
<tr><th>ID</th><th>Title</th><th>Status</th></tr>
""" + bl_rows + """
</table></div></details>
<details class="note"><summary style="cursor:pointer;font-weight:600">Report quality audit — is the QA team's report legit? (checked 2026-10-15)</summary>
<div style="margin-top:8px">
<p><b>Structure checks out.</b> 186 retests split exactly as claimed (159 Fixed + 19 Partly fixed + 6 Still failing + 2 Blocked); 16 new bugs split 4 High / 3 Medium / 9 Low as claimed. All 202 IDs are unique. The 16 new bugs each carry Where / Environment / Preconditions / Steps / Expected / Actual / Reproducibility / Impact, and the Fixed retests state the observed retest behavior (not just "it works now").</p>
<p style="margin-top:8px"><b>Issues found in the report itself:</b></p>
<ul style="margin-left:20px">
<li><b>"10 pre-existing" is not traceable.</b> The summary says ten findings are pre-existing, but only 2 of the 16 new-bug cards carry an explicit pre-existing note (QXR-279-F15, QXR-310-F20). The other eight cannot be identified per-card.</li>
<li><b>6 of the 16 new bugs have no screenshots or raw evidence</b> — all API-level: QXR-277-F26, QXR-307-F12, QXR-416-F10, QXR-416-F12, QXR-416-F13, QXR-311-F20. For API bugs the raw request/response is the core evidence; without it they are harder to action.</li>
<li><b>QXR-314-F12 (High, duplicate Stripe charge) reproduced only 1 in 3 runs</b> but is filed as a definite bug. It should be flagged intermittent, and it is missing the Stripe payment-intent IDs needed to investigate.</li>
<li><b>QXR-415-F16 is missing complete Stripe subscription identifiers;</b> QXR-416-F10 / QXR-416-F12 do not document the circuit-breaker threshold/configuration behind the 30&nbsp;s 503s.</li>
<li><b>QXR-279-F15 is missing Preconditions</b> (minor doc gap).</li>
<li><b>Apparent contradiction, resolved:</b> QXR-280-F15 reports red "Enrolment cancelled" text on dev lead 267 (a converted lead whose enrolment was later cancelled). An independent dev-pass check found the converted-lead styling fixed — but on a plain converted lead, a different case. Both can be true; the team should confirm the exact lead state when retesting.</li>
</ul>
<p style="margin-top:8px;color:#6b7280">Note: this audit checks the report's internal consistency and documentation quality. It is not a live re-verification of all 202 items.</p>
</div></details>

<details class="note"><summary style="cursor:pointer;font-weight:600">Feature gaps vs competitors (not bugs — capabilities Upper Hand / TeamSnap / SportsEngine have that Quixera lacks)</summary>
<ul style="margin:8px 0 0 20px">
<li><b>No waitlist.</b> A full program (2/2 seats) refuses a third athlete with “This program is at capacity — no seats remain.” No waitlist roster, no auto-promotion, nothing in Settings &gt; Notifications. The Academy Assistant confirms no waitlist feature exists.</li>
<li><b>No Coach role and no roles/permissions matrix.</b> User roles are ADMIN, FACILITY_ADMIN, INSTRUCTOR only; no matrix UI in Settings and no “view as” — so least-privilege access cannot be verified.</li>
<li><b>No calendar sync.</b> No iCal download or Google Calendar sync in Schedule (View settings = layout/density only). CSV/Excel booking export works correctly.</li>
<li><b>No payment plans / installments.</b> Invoice actions are Download, Email, Issue credit note, Void invoice, Write off invoice only.</li>
<li><b>No series-level management for recurring bookings.</b> Four weekly bookings created as a series have no series linkage — each must be edited/cancelled individually.</li>
<li><b>Promo codes don’t work with card checkout</b> (“Card checkout does not support promo codes yet”) and there is no promo field in the membership flow at all.</li>
</ul></details>

<details class="note"><summary style="cursor:pointer;font-weight:600">Test records created on dev (all QA_AP-labeled)</summary>
<ul style="margin-top:8px">
<li>Memberships: QAAudit TestAthlete “Unlimited pack” $30 Offline-Cash (RCP-AC1-000148); QAAudit2 Athlete “202 STRIPE TEST” $202 via Stripe test card (RCP-AC1-000152, single ledger row — no duplicate).</li>
<li>Payments: $2.00 cash on QA invoice INV-2026-000174 (RCP-AC1-000149); $50.00 cash on booking invoice INV-2026-000182 (RCP-AC1-000150); in-store sale “QA_AP Test Item” $10.66 cash (RCP-AC1-000151, INV-2026-000183).</li>
<li>Tag “QA_AP Tag Test” (via Bulk edit on RCP-AC1-000136).</li>
<li>Second pass (2026-10-15): athletes QA_AP Waitlist Athlete 1/2/3 (ATH-292/293/294); guardians qaap.waitlist@example.com / qaap.waitlist2@example.com / qaap.waitlist3@example.com; bookings BK-2743/44/45/46 (recurring series, all cancelled) and BK-2747 ($45.00 with promo QA_AP10, paid cash); promo QA_AP10 (10% off bookings); invoice INV-2026-000188 + receipt RCP-AC1-000153 ($45.00); FULL refund $50.00 on RCP-AC1-000150 (invoice INV-2026-000182 reopened); PARTIAL refund $5.00 on RCP-AC1-000151 (invoice INV-2026-000183 partially paid); announcement “QA_AP Test Announcement — Please Ignore” (id 563) sent in-app only to the 3 QA_AP guardians. Note: an accidental duplicate “QA_AP Customer” was created (qa_ap_customer@example.com) — no delete path exists.</li>
<li>Lead “QA_AP Lead” (New → Contacted → Trial, 2 notes); Customer “QA_AP Customer”; Booking #BK-2742 ($50 Pay Later, Oct 16 9:00 AM, then paid).</li>
</ul></details>
<footer>Built 2026-10-15 · Re-verify before flipping any status to Fixed · Generator: ~/workspace/quixera-qa-dev/build_dev_report.py</footer>
</div>
<script>
function toggleCard(btn){btn.closest('.card').classList.toggle('open')}
function setAll(open){document.querySelectorAll('.card').forEach(c=>c.classList.toggle('open',open))}
function openLB(src){document.getElementById('lbimg').src=src;document.getElementById('lb').style.display='none';document.getElementById('lbimg').src=src;document.getElementById('lb').style.display='flex'}
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('lb').style.display='none'});
document.querySelectorAll('.fbtn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.fbtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  const f=b.dataset.f;
  document.querySelectorAll('.sevsec').forEach(s=>{s.style.display=(f==='All'||s.dataset.sev===f||s.dataset.sev==='')?'':'none'});
  document.querySelectorAll('.card').forEach(c=>{
    const show=(f==='All')||c.dataset.sev===f||c.dataset.source===f||c.dataset.status===f;
    c.style.display=show?'':'none';
  });
}));
setAll(true);
</script></body></html>"""

with open(OUT, "w") as f:
    f.write(HTML)
print("wrote", OUT, os.path.getsize(OUT)//1024, "KB")
