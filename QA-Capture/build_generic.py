#!/usr/bin/env python3
"""Generic QA dashboard builder. Usage: build_generic.py <project-dir>
Reads <dir>/data/base.json (optional) + <dir>/bugs/*.json, writes <dir>/index.html."""
import base64, html, json, os, sys
from datetime import datetime

def esc(s): return html.escape(str(s or ""))

def main():
    proj = sys.argv[1]
    base_p = os.path.join(proj, "data", "base.json")
    base = {"title": os.path.basename(proj) + " — QA Bug Tracker",
            "subtitle": "Bugs captured with QA Capture (click trail + screenshot)."}
    if os.path.exists(base_p):
        base.update(json.load(open(base_p)))

    bugs = []
    bdir = os.path.join(proj, "bugs")
    if os.path.isdir(bdir):
        for fn in sorted(os.listdir(bdir)):
            if fn.endswith(".json"):
                b = json.load(open(os.path.join(bdir, fn)))
                bugs.append(b)
    bugs.sort(key=lambda b: b.get("created", ""), reverse=True)

    sev_order = {"High": 0, "Medium": 1, "Low": 2}
    counts = {}
    for b in bugs:
        counts[b.get("severity", "?")] = counts.get(b.get("severity", "?"), 0) + 1

    def img_tags(b):
        tags = []
        for s in b.get("shots", []):
            p = os.path.join(proj, s)
            if os.path.exists(p):
                with open(p, "rb") as f:
                    d64 = base64.b64encode(f.read()).decode()
                tags.append(
                    f'<figure><img src="data:image/jpeg;base64,{d64}" alt="screenshot" '
                    f'onclick="this.classList.toggle(\'zoom\')">'
                    f'<figcaption>Screenshot {len(tags) + 1} of {len(b["shots"])}</figcaption></figure>')
        return "".join(tags)

    def clip_tag(b):
        if b.get("clip"):
            secs = f" ({b['clip_secs']}s)" if b.get("clip_secs") else ""
            return (f"<figure><video controls preload='none' src='{esc(b['clip'])}'></video>"
                    f"<figcaption>Screen recording{secs}</figcaption></figure>")
        return ""

    def trail_html(b):
        t = b.get("trail", [])
        if not t: return ""
        items = "".join(
            f"<li><span class='stp'>{s.get('step', i+1)}</span> "
            f"<span class='pg'>{esc(s.get('page',''))}</span> — {esc(s.get('clicked',''))}</li>"
            for i, s in enumerate(t))
        return f"<details><summary>Click trail ({len(t)} steps)</summary><ol class='trail'>{items}</ol></details>"

    cards = []
    for b in bugs:
        sev = b.get("severity", "Medium")
        itype = (f"<span class='itype'>{esc(b['issue_type'])}</span> "
                 if b.get("issue_type") else "")
        cards.append(f"""
        <article class="card sev-{esc(sev)}" data-sev="{esc(sev)}">
          <div class="chead"><span class="pill">{esc(sev)}</span>
            <span class="bid">{esc(b.get('id',''))}</span>{itype}
            <span class="when">{esc(b.get('created','')[:16].replace('T',' '))}</span></div>
          <h3>{esc(b.get('title',''))}</h3>
          <div class="meta">📄 {esc(b.get('page',''))}</div>
          {"<div class='exp'><b>Expected:</b> " + esc(b.get('expected')) + "</div>" if b.get('expected') else ""}
          {"<div class='act'><b>Actual:</b> " + esc(b.get('actual')) + "</div>" if b.get('actual') else ""}
          {trail_html(b)}
          {clip_tag(b)}
          {img_tags(b)}
        </article>""")

    chips = " ".join(
        f"<button class='chip' data-f='{esc(s)}'>{esc(s)} ({n})</button>"
        for s, n in sorted(counts.items(), key=lambda kv: sev_order.get(kv[0], 9)))

    page = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(base['title'])}</title>
<style>
  body{{font-family:system-ui,-apple-system,sans-serif;max-width:1060px;margin:0 auto;padding:20px;color:#1e293b;background:#f8fafc}}
  header{{margin-bottom:18px}} h1{{margin:0;font-size:26px}} .sub{{color:#64748b;margin:6px 0 0}}
  .chips{{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}}
  .chip{{padding:8px 14px;border-radius:20px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:14px}}
  .chip.on{{background:#1e293b;color:#fff;border-color:#1e293b}}
  .card{{background:#fff;border-radius:12px;padding:18px;margin:14px 0;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:6px solid #94a3b8}}
  .sev-High{{border-left-color:#dc2626}} .sev-Medium{{border-left-color:#d97706}} .sev-Low{{border-left-color:#16a34a}}
  .chead{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
  .pill{{font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px;background:#eef2f7}}
  .sev-High .pill{{background:#fee2e2;color:#991b1b}} .sev-Medium .pill{{background:#fef3c7;color:#92400e}} .sev-Low .pill{{background:#dcfce7;color:#166534}}
  .bid{{font-family:monospace;font-size:13px;color:#64748b}} .when{{font-size:13px;color:#94a3b8;margin-left:auto}}
  h3{{margin:10px 0 6px;font-size:18px}} .meta{{font-size:13px;color:#64748b;margin-bottom:8px;word-break:break-all}}
  .exp,.act{{font-size:14px;margin:6px 0;background:#f8fafc;padding:8px 10px;border-radius:8px}}
  details{{margin:10px 0;font-size:14px}} summary{{cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center}}
  .trail{{font-size:13px;color:#475569}} .trail li{{margin:4px 0}} .stp{{font-weight:700;color:#1e293b}} .pg{{color:#94a3b8;font-family:monospace;font-size:12px}}
  .card img{{max-width:100%;border-radius:8px;margin-top:10px;cursor:zoom-in;border:1px solid #e2e8f0}}
  .card img.zoom{{position:fixed;inset:5vh 5vw;max-width:90vw;max-height:90vh;z-index:99;cursor:zoom-out;box-shadow:0 20px 60px rgba(0,0,0,.5)}}
  .card figure{{margin:14px 0 0}} .card figcaption{{font-size:12px;color:#94a3b8;margin-top:4px}}
  .card video{{max-width:100%;border-radius:8px;margin-top:10px;background:#000}}
  .itype{{font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px;background:#fef3c7;color:#92400e}}
  .empty{{color:#94a3b8;text-align:center;padding:60px 0}}
</style></head>
<body>
<header><h1>🚩 {esc(base['title'])}</h1><p class="sub">{esc(base['subtitle'])}</p></header>
<div class="chips"><button class="chip on" data-f="all">All ({len(bugs)})</button>{chips}</div>
<div id="cards">
{''.join(cards) if cards else '<p class="empty">No bugs filed yet. Flag one from the extension and it will appear here.</p>'}
</div>
<p class="sub">Last rebuilt {datetime.now().strftime('%Y-%m-%d %H:%M')} · QA Capture v3</p>
<script>
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{{
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');
  const f=c.dataset.f;
  document.querySelectorAll('.card').forEach(k=>k.style.display=(f==='all'||k.dataset.sev===f)?'':'none');
}}));
</script>
</body></html>"""
    with open(os.path.join(proj, "index.html"), "w") as f:
        f.write(page)
    print(f"built {proj}/index.html with {len(bugs)} bugs")

main()
