#!/usr/bin/env python3
"""Build the Quixera DEV bug-tracker dashboard (index.html).
Data-driven: bugs live in data/base.json (QA team + Arlo) plus bugs/*.json (QA Capture).
Three segments: QA team retest | Arlo dev pass | Manual captures.
Re-run to regenerate. Reconciliation: when a fix lands, set status to "Fixed" (after re-verifying) and republish."""
import base64, io, json, os, re
from datetime import date
from urllib.parse import urlparse
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "index.html")
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

def _normalize(b):
    """Extension-filed bugs (severity/trail/page/url) -> card format (sev/steps/link)."""
    if "sev" not in b or not b["sev"]:
        b["sev"] = b.pop("severity", "Medium") if "severity" in b else "Medium"
    b.setdefault("status", "Open")
    b.setdefault("source", "manual")
    if "steps" not in b:
        trail = b.get("trail") or []
        b["steps"] = [f"{t.get('page', '')} — {t.get('clicked', '')}".strip(" —") for t in trail] or ["(no steps recorded)"]
    b.setdefault("link", b.get("url") or DEV)
    b.setdefault("expected", "")
    b.setdefault("actual", "")
    b.setdefault("title", b.get("id", "Untitled"))
    b.setdefault("issue_type", "Other")
    return b

def _load_bugs():
    base = json.load(open(os.path.join(HERE, "data", "base.json")))
    bugs = list(base["bugs"])
    backlog = list(base.get("backlog", []))
    bugs_dir = os.path.join(HERE, "bugs")
    if os.path.isdir(bugs_dir):
        for fn in sorted(os.listdir(bugs_dir)):
            if fn.endswith(".json"):
                with open(os.path.join(bugs_dir, fn)) as f:
                    bugs.append(_normalize(json.load(f)))
    for b in bugs:
        b["imgs"] = [os.path.join(HERE, s) for s in b.get("shots", []) if os.path.exists(os.path.join(HERE, s))]
    return bugs, backlog

BUGS, BACKLOG = _load_bugs()

# ---- potential-duplicate detection for manual captures ----
# Policy (2026-10-18, Ankit): an identical title alone NEVER flags a bug.
# A bug is flagged only as a *potential* duplicate when title similarity is
# corroborated by details (same page, same category, or similar
# expected/actual). Nothing is ever removed automatically — the dashboard
# shows a side-by-side compare popup so he can confirm duplicate vs different.
_DUP_STOP = {"the", "a", "an", "on", "in", "of", "to", "and", "or", "for",
             "with", "is", "are", "was", "not", "no", "tab", "page", "button",
             "click", "clicking", "open", "opens", "shows", "show", "new",
             "when", "from", "with", "that", "this"}

def _dup_words(t):
    return {w for w in re.sub(r"[^a-z0-9 ]", " ", (t or "").lower()).split()
            if len(w) > 3 and w not in _DUP_STOP}

def _dup_path(b):
    for k in ("page", "link"):
        v = b.get(k) or ""
        if v.startswith("/"):
            return v.split("?")[0]
        if v.startswith("http"):
            try:
                return urlparse(v).path
            except Exception:
                pass
    return ""

def _dup_match(manual, others):
    """Return (best_other, reasons). Title similarity alone never flags —
    at least one corroborating detail (same page, same category, or similar
    expected/actual) is required."""
    mw = _dup_words(manual.get("title", ""))
    mp = _dup_path(manual)
    mexp = _dup_words((manual.get("expected") or "") + " " + (manual.get("actual") or ""))
    best, best_score, best_reasons = None, 0, []
    for o in others:
        if o.get("id") == manual.get("id"):
            continue
        s, reasons = 0, []
        tw = mw & _dup_words(o.get("title", ""))
        if tw:
            s += 2 * len(tw)
            reasons.append("similar title")
        op = _dup_path(o)
        if mp and op and mp == op:
            s += 3
            reasons.append("same page")
        if (manual.get("issue_type") and manual["issue_type"] != "Other"
                and o.get("issue_type") == manual["issue_type"]):
            s += 2
            reasons.append("same category")
        ew = mexp & _dup_words((o.get("expected") or "") + " " + (o.get("actual") or ""))
        if len(ew) >= 2:
            s += 3
            reasons.append("similar details")
        corroborated = any(r in reasons for r in ("same page", "same category", "similar details"))
        if corroborated and s > best_score:
            best, best_score, best_reasons = o, s, reasons
    if best_score >= 6:
        return best, best_reasons
    return None, []

for _m in BUGS:
    if _m["source"] == "manual":
        _hit, _reasons = _dup_match(_m, BUGS)
        if _hit:
            _m["dup_of"] = {"id": _hit["id"], "reasons": _reasons}

SEV_ORDER = ["High", "Medium", "Low", "Info"]
SEV_COLOR = {"High": "#b91c1c", "Medium": "#b45309", "Low": "#4d7c0f", "Info": "#1d4ed8"}
STATUS_COLOR = {"Open": "#b91c1c", "Partly fixed": "#b45309", "Still failing": "#7f1d1d",
                "Blocked": "#6b7280", "Fixed": "#15803d"}
SOURCE_LABEL = {"arlo": "Arlo dev pass", "team": "QA team retest", "manual": "Manual capture"}
SEGMENTS = [
    ("team", "🧪 Tested by the QA team",
     "Bugs from the QA team's 2026-10-15 retest report — 186 retests (159 Fixed · 19 Partly fixed · 6 Still failing · 2 Blocked) plus 16 new bugs they filed."),
    ("arlo", "🤖 Tested by Arlo",
     "Bugs found in the independent dev-environment pass (DEV-001 … DEV-016), each re-verified with screenshots and repro steps."),
    ("manual", "🚩 Your manual captures",
     "Bugs you flagged yourself with the QA Capture extension — click trail, screenshots and clips attached automatically."),
]

def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# v3.6: human-readable click trails. The extension records raw DOM clicks
# (tag + label + page); this turns them into plain-English steps the way a
# human QA note would read, e.g. Click "View" on the dashboard.
PAGE_NAMES = [
    ("/memberships/directory", "the Memberships directory"),
    ("/memberships", "Memberships"),
    ("/people/leads", "the Leads page"),
    ("/billing", "the Billing page"),
    ("/analytics", "Analytics"),
    ("/ai-insights", "AI Insights"),
    ("/dashboard", "the dashboard"),
    ("/messages", "Messages"),
    ("/settings", "Settings"),
    ("/teams", "Teams"),
    ("/bookings", "Bookings"),
    ("/customers", "Customers"),
    ("/programs", "Programs"),
]

def friendly_page(page):
    p = (page or "").split("?")[0].rstrip("/") or "/"
    for prefix, name in PAGE_NAMES:
        if p == prefix or p.startswith(prefix + "/"):
            return name
    seg = p.strip("/").split("/")[-1].replace("-", " ").replace("_", " ") if p.strip("/") else ""
    return "the " + seg[0].upper() + seg[1:] if seg else "the page"

def humanize_step(t):
    page = t.get("page", "") or ""
    clicked = re.sub(r"\s+", " ", (t.get("clicked", "") or "").strip())
    pg = friendly_page(page)
    if clicked == "(page background)":
        return "Click on the page background (%s)." % pg
    m = re.match(r'^([^:]+):\s*"(.*)"$', clicked, re.S)
    tag = m.group(1).strip().lower() if m else ""
    text = re.sub(r"\s+", " ", m.group(2).strip()) if m else clicked
    if len(text) > 60:
        text = text[:57].rsplit(" ", 1)[0] + "…"
    if tag == "input":
        verb = "Click into"
    elif tag == "select":
        verb = "Choose from"
    elif tag == "textarea":
        verb = "Type in"
    else:
        verb = "Click"
    label = '"%s"' % text if text else ("a " + tag if tag else "an item")
    return "%s %s on %s." % (verb, label, pg)

def humanize_trail(trail):
    steps = []
    for t in trail or []:
        s = humanize_step(t)
        if not s:
            continue
        if steps and steps[-1][0] == s:
            steps[-1][1] += 1
        else:
            steps.append([s, 1])
    return [s + (" (×%d)" % n if n > 1 else "") for s, n in steps]

def trail_html(b):
    trail = b.get("trail")
    if isinstance(trail, list) and trail and isinstance(trail[0], dict):
        steps = humanize_trail(trail)
        items = "".join(
            f"<li><span class='stp'>{i + 1}</span><span class='cl'>{esc(x)}</span></li>"
            for i, x in enumerate(steps)) or "<li>No steps recorded.</li>"
        raw = "".join(
            f"<li><span class='pg'>{esc(t.get('page', ''))}</span> "
            f"<span class='cl'>{esc(t.get('clicked', ''))}</span></li>"
            for t in trail)
        return (f"<ol class='trail'>{items}</ol>"
                f"<details class='rawtrail'><summary>Raw click data</summary>"
                f"<ol class='trail'>{raw}</ol></details>")
    steps = "".join(f"<li><span class='stp'>{i + 1}</span><span class='cl'>{esc(x)}</span></li>"
                    for i, x in enumerate(b.get("steps", [])))
    return f"<ol class='trail'>{steps}</ol>"

CARD_STATUSES = ["Open", "Partly fixed", "Still failing", "Blocked", "Fixed"]
_CARD_SEQ = [0]

def filed_stamp(b):
    """'created' ISO -> ('Oct 20, 2026 · 11:21 AM EDT', epoch) in Ankit's tz."""
    c = b.get("created")
    if not c:
        return "", 0
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        dt = datetime.fromisoformat(str(c).replace("Z", "+00:00"))
        return (dt.astimezone(ZoneInfo("America/New_York")).strftime("%b %d, %Y · %I:%M %p %Z"),
                int(dt.timestamp()))
    except Exception:
        return "", 0

def card(b):
    if b["imgs"]:
        shots = "".join(
            f"<figure><img src=\"{U(n)}\" alt=\"screenshot {k + 1}\" loading=\"lazy\" onclick=\"openLB(this.src)\">"
            f"<figcaption>Screenshot {k + 1} of {len(b['imgs'])}</figcaption></figure>"
            for k, n in enumerate(b["imgs"]))
    else:
        shots = '<div class="noshot">No screenshot attached.</div>'
    clip = ""
    if b.get("clip"):
        secs = f" ({b['clip_secs']}s)" if b.get("clip_secs") else ""
        clip = (f"<figure><video controls preload='none' src='{esc(b['clip'])}'></video>"
                f"<figcaption>Screen recording{secs} — plays in the browser</figcaption></figure>")
    itype = (f"<span class='itype'>{esc(b['issue_type'])}</span>"
             if b["source"] == "manual" and b.get("issue_type") else "")
    dup = ""
    if b.get("dup_of"):
        d = b["dup_of"]
        why = ", ".join(d["reasons"])
        dup = (f"<p class='dupwarn'>⚠️ <b>Potential duplicate</b> of "
               f"<button class='duplink' onclick=\"openDupCmp('{b['id']}','{d['id']}')\">{d['id']}</button>"
               f" <span class='dupwhy'>(flagged for: {esc(why)})</span><br>"
               f"<span class='dupnote'>Tap the ID to compare side-by-side. Nothing is removed automatically.</span></p>")
    extra = ""
    if b.get("where"):
        extra += f"<p><b>Where:</b> {esc(b['where'])}</p>"
    if b.get("repro"):
        extra += f"<p><b>Reproducibility:</b> {esc(b['repro'])}</p>"
    if b.get("env"):
        extra += f"<p><b>Environment:</b> {esc(b['env'])}</p>"
    fix = f"<div class=\"fix\"><b>Suggested fix:</b> {esc(b['fix'])}</div>" if b.get("fix") else ""
    jira = f"<p><b>Jira:</b> <a href=\"{b['jira']}\" target=\"_blank\" rel=\"noopener\">{esc(b['jira'].rstrip('/').split('/')[-1])}</a> (parent ticket)</p>" if b.get("jira") else ""
    stamp, ts = filed_stamp(b)
    filed = f"<p class='filed'>🕐 Filed {stamp}</p>" if stamp else ""
    _CARD_SEQ[0] += 1
    return f"""
    <article class="card" id="bug-{b['id']}" data-sev="{b['sev']}" data-status="{b['status']}" data-source="{b['source']}" data-ts="{ts}" data-orig="{_CARD_SEQ[0]}">
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
            <p><span class="src">{SOURCE_LABEL[b['source']]}</span>{itype} {jira}</p>
            {filed}
            {dup}
            <p><a class="golink" href="{b['link']}" target="_blank" rel="noopener">↗ Open this page in the dev app</a></p>
            {extra}
            <p><b>What was done (click trail):</b></p>{trail_html(b)}
            <p><b>Expected:</b> {esc(b['expected'])}</p>
            <p><b>Actual:</b> {esc(b['actual'])}</p>
            {fix}
          </div>
          <div class="shots">{clip}{shots}</div>
        </div>
      </div>
    </article>"""

segments = ""
for src, title, desc in SEGMENTS:
    # order by severity within the segment
    ordered = []
    for s in SEV_ORDER:
        ordered += [card(b) for b in BUGS if b["source"] == src and b["sev"] == s]
    n = sum(1 for b in BUGS if b["source"] == src)
    n_open = sum(1 for b in BUGS if b["source"] == src and b["status"] == "Open")
    segments += f"""
    <section class="seg" data-src="{src}">
      <div class="seghead"><h2>{title}</h2>
        <span class="segcount">{n} issue{'s' if n != 1 else ''} · {n_open} open</span></div>
      <p class="segdesc">{desc}</p>
      {''.join(ordered) if ordered else '<p class="segempty">Nothing here yet — flag an issue with the QA Capture extension and it will appear in this segment.</p>'}
    </section>"""

bl_rows = ""
for i in BACKLOG:
    st = {"CHANGED": "Partly fixed", "STILL_FAILING": "Still failing", "BLOCKED": "Blocked"}[i["st"]]
    bl_rows += (f"<tr><td class='mono'>{esc(i['id'])}</td><td>{esc(i['title'])}</td>"
                f"<td><span class='status' style='background:{STATUS_COLOR[st]}'>{st}</span></td></tr>")

counts = {s: sum(1 for b in BUGS if b["sev"] == s) for s in SEV_ORDER}
n_open = sum(1 for b in BUGS if b["status"] == "Open")
n_src = {k: sum(1 for b in BUGS if b["source"] == k) for k in SOURCE_LABEL}
STATUSES = ["Open", "Partly fixed", "Still failing", "Blocked", "Fixed"]
n_st = {s: sum(1 for b in BUGS if b["status"] == s) for s in STATUSES}
st_btns = "".join(
    f"""<button class="fbtn sbtn" data-st="{s}">{s} · {n_st[s]}</button>"""
    for s in STATUSES if n_st[s])

HEAD = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
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
.stat.clickable{cursor:pointer;transition:transform .12s,box-shadow .12s}
.stat.clickable:hover{transform:translateY(-2px);box-shadow:0 4px 10px rgba(0,0,0,.12)}
.stat.clickable.active{outline:3px solid #1e3a5f}
.dupwarn{background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:10px}
.dupwarn a{font-weight:700;color:#b45309}
.duplink{background:none;border:none;color:#b45309;font-weight:700;font-size:14px;cursor:pointer;text-decoration:underline;padding:0;font-family:ui-monospace,Menlo,monospace}
.dupwhy{color:#6b7280;font-size:12px}
.dupnote{color:#6b7280;font-size:12px}
#dupmodal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:200;padding:20px}
#dupmodal.open{display:flex}
.dupbox{background:#fff;border-radius:14px;max-width:960px;width:100%;max-height:90vh;overflow:auto;padding:24px;position:relative;text-align:left}
.dupclose{position:absolute;top:12px;right:12px;border:1px solid #d1d5db;background:#fff;border-radius:8px;width:36px;height:36px;font-size:15px;cursor:pointer}
.dupbox h3{margin-bottom:4px;font-size:18px}
.dupsub{font-size:13px;color:#6b7280;margin-bottom:14px}
.dupcols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:700px){.dupcols{grid-template-columns:1fr}}
.dupcol{border:1px solid #e5e7eb;border-radius:10px;padding:14px;font-size:14px}
.dupcol h4{font-size:15px;margin-bottom:8px;font-family:ui-monospace,Menlo,monospace;color:#1e3a5f}
.dupcol p{margin-bottom:10px}
.dupcol .k{color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.dupcol .pg{white-space:normal;max-width:none}
.toolbar{position:sticky;top:0;z-index:50;background:#f1f4f8ee;backdrop-filter:blur(6px);padding:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid #e5e7eb;margin-bottom:18px}
.fbtn{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:6px 14px;font-size:13px;cursor:pointer}
.fbtn.active{background:#1e3a5f;color:#fff;border-color:#1e3a5f}
.tsep{font-size:13px;color:#6b7280;margin-left:6px}
.tbtn{margin-left:auto;border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
.seg{margin-bottom:30px}
.seghead{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.seghead h2{font-size:20px}
.segcount{font-size:13px;color:#6b7280;background:#fff;border-radius:999px;padding:3px 12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.segdesc{font-size:13px;color:#6b7280;margin-bottom:14px}
.segempty{background:#fff;border-radius:12px;padding:22px;text-align:center;color:#9ca3af;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.pill{color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}
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
.itype{display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;margin-left:6px}
.trail{list-style:none;margin:0 0 12px;padding:0}
.trail li{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;font-size:14px}
.stp{flex:none;min-width:26px;height:26px;border-radius:50%;background:#1e3a5f;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.pg{flex:none;font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f3f4f6;border-radius:6px;padding:3px 8px;color:#4b5563;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl{flex:1}
.rawtrail{margin:-4px 0 12px;font-size:13px;color:#6b7280}
.rawtrail summary{cursor:pointer;color:#1d4ed8;font-weight:600}
.filed{color:#6b7280;font-size:13px;margin-bottom:8px}
.manage{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:13px}
.manage .mk{font-weight:700;color:#374151}
.mstatus{padding:6px 8px;border-radius:6px;border:1px solid #d1d5db;font-size:13px;background:#fff}
.mdel{border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:6px;padding:6px 10px;font-size:13px;cursor:pointer}
.mnote{color:#6b7280;font-size:12px}
#sortsel{padding:6px 8px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;background:#fff}
.fix{background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:12px 14px;font-size:14px;margin-top:6px}
.src{display:inline-block;background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;margin-right:6px}
.golink{display:inline-block;background:#1e3a5f;color:#fff!important;text-decoration:none;font-size:13px;font-weight:600;border-radius:8px;padding:6px 14px;margin:2px 0 4px}
.golink:hover{background:#2c5282}
.shots figure{margin:0 0 14px}
.shots img{width:100%;border-radius:8px;border:1px solid #e5e7eb;cursor:zoom-in}
.shots video{width:100%;border-radius:8px;border:1px solid #e5e7eb;background:#000}
.shots figcaption{font-size:12px;color:#6b7280;margin-top:4px}
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
#gate{position:fixed;inset:0;background:#1e3a5f;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
#gate .gcard{background:#fff;border-radius:14px;padding:32px;width:380px;max-width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
#gate h2{margin-bottom:6px;font-size:20px;color:#1e3a5f}
#gate p{font-size:13px;color:#6b7280;margin-bottom:16px}
#gate input{width:100%;padding:14px;font-size:16px;border:1px solid #ccc;border-radius:10px;box-sizing:border-box;margin-bottom:12px}
#gate button{width:100%;min-height:52px;font-size:16px;font-weight:700;border-radius:10px;border:none;background:#1e3a5f;color:#fff;cursor:pointer}
#gateerr{color:#b91c1c;font-size:13px;min-height:20px;margin-top:10px}
</style></head><body>"""

# Comparison data for the potential-duplicate popup
dupdata = {}
for b in BUGS:
    tr = b.get("trail")
    ntrail = len(tr) if isinstance(tr, list) else len(b.get("steps", []) or [])
    dupdata[b["id"]] = {
        "id": b["id"],
        "title": b.get("title", ""),
        "sev": b.get("sev", ""),
        "status": b.get("status", ""),
        "page": _dup_path(b) or b.get("page", "") or b.get("link", ""),
        "itype": b.get("issue_type", ""),
        "expected": b.get("expected", ""),
        "actual": b.get("actual", ""),
        "shots": len(b.get("imgs", [])),
        "trail": ntrail,
        "src": SOURCE_LABEL.get(b.get("source"), ""),
    }

INNER = """<div id="lb" onclick="this.style.display='none'"><img id="lbimg" src=""></div>
<div id="dupmodal" onclick="if(event.target===this)closeDupCmp()">
  <div class="dupbox">
    <button class="dupclose" onclick="closeDupCmp()" title="Close">✕</button>
    <h3>Potential duplicate — compare</h3>
    <p class="dupsub">Review the details and decide whether these are the same bug or different ones. Nothing is removed automatically.</p>
    <div class="dupcols" id="dupcols"></div>
  </div>
</div>
<div class="wrap">
<header>
<h1>Quixera DEV — Bug Tracker Dashboard</h1>
<p>https://facility-dev.quixeraos.com · QA team retest 2026-10-15 (186 fixes) + Arlo dev pass 2026-10-15 · Desktop 1440px, Chromium · Signed in as Ankit Patel (Admin) · QA_AP-labeled test records; no deletes / no outward-facing sends</p>
<div class="recon"><b>How to reconcile:</b> when a fix lands, tell Arlo (e.g. “QXR-416-F10 is fixed on dev”) — he'll re-verify on dev and flip the card to <b>Fixed</b>. Manual captures can be edited or deleted from the QA Capture extension's issue log. Statuses: Open · Partly fixed · Still failing · Blocked · Fixed.</div>
<div class="grid">
<div class="stat clickable" data-seg="team" title="Show only QA team bugs"><div class="n" style="color:#1e3a5f">""" + str(n_src["team"]) + """</div><div class="l">🧪 QA team — tap to filter</div></div>
<div class="stat clickable" data-seg="arlo" title="Show only Arlo bugs"><div class="n" style="color:#1e3a5f">""" + str(n_src["arlo"]) + """</div><div class="l">🤖 Arlo pass — tap to filter</div></div>
<div class="stat clickable" data-seg="manual" title="Show only manual captures"><div class="n" style="color:#1e3a5f">""" + str(n_src["manual"]) + """</div><div class="l">🚩 Manual — tap to filter</div></div>
<div class="stat clickable" data-seg="open" title="Show only open bugs"><div class="n" style="color:#b91c1c">""" + str(n_open) + """</div><div class="l">Open now — tap to filter</div></div>
</div></header>
<div class="toolbar">
<button class="fbtn active" data-f="All">All severities</button>
<button class="fbtn" data-f="High">High · """ + str(counts["High"]) + """</button>
<button class="fbtn" data-f="Medium">Medium · """ + str(counts["Medium"]) + """</button>
<button class="fbtn" data-f="Low">Low · """ + str(counts["Low"]) + """</button>
<button class="fbtn" data-f="Info">Info · """ + str(counts["Info"]) + """</button>
<span class="tsep">Status:</span>
<button class="fbtn sbtn active" data-st="All">All</button>
""" + st_btns + """
<span class="tsep">Sort:</span>
<select id="sortsel" onchange="sortCards(this.value)">
<option value="sev" selected>By severity</option>
<option value="new">Newest first</option>
<option value="old">Oldest first</option>
</select>
<button class="tbtn" onclick="setAll(true)">Expand all</button>
<button class="tbtn" onclick="setAll(false)">Collapse all</button>
</div>
""" + segments + """
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
<li>Phase 2 sweep (2026-10-17): membership purchase for QA_AP Waitlist Athlete 1 — 121 Session Pack, $121.00 offline cash (RCP-AC1-000156, INV-2026-000189); plan “QA_AP P2 Test Plan” (5 credits, $5.00) created then deactivated to restore active-plan count.</li>
</ul></details>
<footer>Rebuilt """ + date.today().isoformat() + """ · Re-verify before flipping any status to Fixed · QA Capture v3</footer>
</div>"""

GATE_HASH_FILE = os.path.join(HERE, ".gate_hash")
if not os.path.exists(GATE_HASH_FILE):
    raise SystemExit("gate hash missing — refusing to build an ungated dashboard")
GATE_HASH = open(GATE_HASH_FILE).read().strip()
PAYLOAD = base64.b64encode(INNER.encode("utf-8")).decode()

HTML = HEAD + """
<script>const DUPDATA = """ + json.dumps(dupdata) + """;</script>
<div id="gate"><div class="gcard">
<h2>🔒 QA Dashboard</h2>
<p>This bug tracker is private. Enter the password to view it.</p>
<input type="password" id="gatepw" placeholder="Password" autocomplete="off">
<button onclick="unlockGate()">Unlock</button>
<div id="gateerr"></div>
</div></div>
<div id="locked"></div>
<script>
const GATE_SALT = "qxrcapture::v1::";
const GATE_HASH = \"""" + GATE_HASH + """\";
const PAYLOAD = \"""" + PAYLOAD + """\";
async function sha256hex(s){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function unlockGate(){
  const v = document.getElementById("gatepw").value;
  const h = await sha256hex(GATE_SALT + v);
  if (h === GATE_HASH) { try{sessionStorage.setItem("qxr_gate","1");}catch(e){} showContent(); }
  else document.getElementById("gateerr").textContent = "Wrong password \\u2014 try again.";
}
function showContent(){
  document.getElementById("gate").style.display = "none";
  const el = document.getElementById("locked");
  if (!el.dataset.done) {
    el.innerHTML = decodeURIComponent(escape(atob(PAYLOAD)));
    el.dataset.done = "1";
    initDashboard();
  }
}
function toggleCard(btn){btn.closest('.card').classList.toggle('open')}
function setAll(open){document.querySelectorAll('.card').forEach(c=>c.classList.toggle('open',open))}
function openLB(src){document.getElementById('lbimg').src=src;document.getElementById('lb').style.display='flex'}
function escH(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function dupCol(d){
  return "<div class='dupcol'><h4>"+escH(d.id)+"</h4>"
  +"<p><span class='k'>Title</span><br>"+escH(d.title)+"</p>"
  +"<p><span class='k'>Severity · Status · Source</span><br>"+escH(d.sev)+" · "+escH(d.status)+" · "+escH(d.src)+"</p>"
  +"<p><span class='k'>Page</span><br><span class='pg'>"+escH(d.page||'—')+"</span></p>"
  +"<p><span class='k'>Category</span><br>"+escH(d.itype||'—')+"</p>"
  +"<p><span class='k'>Expected</span><br>"+escH(d.expected||'—')+"</p>"
  +"<p><span class='k'>Actual</span><br>"+escH(d.actual||'—')+"</p>"
  +"<p><span class='k'>Evidence</span><br>"+d.shots+" screenshot(s) · "+d.trail+" trail step(s)</p>"
  +"<p><a href='#bug-"+escH(d.id)+"' onclick='closeDupCmp()'>Jump to this card ↓</a></p></div>";
}
function openDupCmp(a,b){
  const da=(typeof DUPDATA!=='undefined')?DUPDATA[a]:null;
  const db=(typeof DUPDATA!=='undefined')?DUPDATA[b]:null;
  if(!da||!db) return;
  document.getElementById('dupcols').innerHTML=dupCol(da)+dupCol(db);
  document.getElementById('dupmodal').classList.add('open');
}
function closeDupCmp(){document.getElementById('dupmodal').classList.remove('open')}
function sortCards(mode){
  document.querySelectorAll('.seg').forEach(sec=>{
    const cards=[...sec.querySelectorAll('.card')];
    if(mode==='sev') cards.sort((a,b)=>(+a.dataset.orig||0)-(+b.dataset.orig||0));
    else cards.sort((a,b)=> mode==='new' ? (+b.dataset.ts||0)-(+a.dataset.ts||0) : (+a.dataset.ts||0)-(+b.dataset.ts||0));
    cards.forEach(c=>sec.appendChild(c));
  });
}
function initDashboard(){
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.getElementById('lb').style.display='none';closeDupCmp();}});
document.querySelectorAll('.fbtn:not(.sbtn)').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.fbtn:not(.sbtn)').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  F.sev=b.dataset.f; applyFilters();
}));
document.querySelectorAll('.sbtn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.sbtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  F.st=b.dataset.st; applyFilters();
}));
let F={seg:null,sev:'All',st:'All'};
function applyFilters(){
  document.querySelectorAll('.card').forEach(c=>{
    const okSeg=!F.seg||(F.seg==='open'?c.dataset.status==='Open':c.dataset.source===F.seg);
    const okSev=(F.sev==='All'||c.dataset.sev===F.sev);
    const okSt=(F.st==='All'||c.dataset.status===F.st);
    c.style.display=(okSeg&&okSev&&okSt)?'':'none';
  });
  document.querySelectorAll('.seg').forEach(s=>{
    const anyVisible=[...s.querySelectorAll('.card')].some(c=>c.style.display!=='none');
    s.style.display=anyVisible?'':'none';
  });
}
document.querySelectorAll('.stat.clickable').forEach(t=>t.addEventListener('click',()=>{
  const seg=t.dataset.seg;
  const wasActive=t.classList.contains('active');
  document.querySelectorAll('.stat.clickable').forEach(x=>x.classList.remove('active'));
  if(wasActive){F.seg=null;}
  else{t.classList.add('active');F.seg=seg;}
  applyFilters();
}));
setAll(true);
}
document.getElementById("gatepw").addEventListener("keydown", e=>{ if(e.key==="Enter") unlockGate(); });
try{ if(sessionStorage.getItem("qxr_gate")==="1") showContent(); }catch(e){}
</script></body></html>"""

with open(OUT, "w") as f:
    f.write(HTML)
print("wrote", OUT, os.path.getsize(OUT)//1024, "KB")
