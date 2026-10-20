/* QA Capture v2 — options page: token, repo, project CRUD + dashboard scaffolding */
(function () {
  const $ = (id) => document.getElementById(id);
  const msg = (t, ok) => {
    const m = $("msg");
    m.textContent = t; m.style.display = "block";
    m.style.background = ok === false ? "#fdecea" : "#e8f5e9";
    clearTimeout(msg._t); msg._t = setTimeout(() => m.style.display = "none", 5000);
  };
  const uid = () => "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const slugify = (s) => s.trim().replace(/[^a-zA-Z0-9]+/g, "") || "Project";

  let projects = [];
  let repo = "";

  function card(p) {
    const div = document.createElement("div");
    div.className = "card"; div.dataset.pid = p.id;
    const dir = p.dir || p.slug;
    div.innerHTML = `
      <label>Project name <input type="text" class="f-name" value="${esc(p.name)}"></label>
      <label>Dashboard folder in repo <input type="text" class="f-dir" value="${esc(dir)}"></label>
      <label>Watched sites (one host per line) <textarea class="f-hosts" rows="3">${esc((p.hosts || []).join("\n"))}</textarea></label>
      <p class="dashlink">📊 Dashboard: <a target="_blank" href="https://apatel85.github.io/Dashboards/${esc(dir)}/">https://apatel85.github.io/Dashboards/${esc(dir)}/</a></p>
      <div class="row">
        <button class="b-scaffold">🧱 Create dashboard in repo</button>
        <button class="b-del danger">Delete project</button>
      </div>`;
    div.querySelector(".b-del").addEventListener("click", () => {
      if (confirm(`Delete project "${p.name}"? Flagged bugs already in the repo are kept.`)) {
        projects = projects.filter(x => x.id !== p.id);
        render();
      }
    });
    div.querySelector(".b-scaffold").addEventListener("click", async (e) => {
      e.target.disabled = true;
      const r = await chrome.runtime.sendMessage({ type: "scaffold", projectId: p.id });
      e.target.disabled = false;
      if (r && r.ok) msg(`✅ Dashboard ready: ${r.url}`);
      else msg("❌ " + ((r && r.error) || "failed"), false);
    });
    return div;
  }

  function esc(s) { return String(s || "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

  function render() {
    const wrap = $("projects"); wrap.innerHTML = "";
    projects.forEach(p => wrap.appendChild(card(p)));
  }

  function collect() {
    const out = [];
    document.querySelectorAll("#projects .card").forEach(div => {
      const name = div.querySelector(".f-name").value.trim();
      const dir = div.querySelector(".f-dir").value.trim() || slugify(name);
      const hosts = div.querySelector(".f-hosts").value.split("\n").map(s => s.trim()).filter(Boolean);
      const prev = projects.find(p => p.id === div.dataset.pid) || {};
      out.push({ id: div.dataset.pid, name: name || "Untitled", slug: prev.slug || slugify(name),
                 dir, hosts });
    });
    return out;
  }

  $("add").addEventListener("click", () => {
    projects.push({ id: uid(), name: "", slug: "NewProject", dir: "NewProject", hosts: [], _new: true });
    render();
    const cards = document.querySelectorAll("#projects .card");
    cards[cards.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("save").addEventListener("click", async () => {
    projects = collect();
    const token = $("token").value.trim();
    repo = $("repo").value.trim() || "apatel85/Dashboards";
    const patch = { projects, ghRepo: repo };
    if (token) patch.ghToken = token;
    await chrome.storage.local.set(patch);
    // auto-scaffold brand-new projects so their dashboard exists
    for (const p of projects.filter(p => p._new)) {
      const r = await chrome.runtime.sendMessage({ type: "scaffold", projectId: p.id });
      if (!(r && r.ok)) { msg(`Saved, but dashboard scaffold failed for "${p.name}": ${(r && r.error) || ""}`, false); render(); return; }
      delete p._new;
    }
    await chrome.storage.local.set({ projects });
    msg("✅ Saved. New dashboards are live in the repo.");
    render();
  });

  /* ---------- GitHub token: save & verify (v3.9 onboarding) ---------- */
  async function refreshTokState() {
    const el = $("tok-state");
    const r = await chrome.runtime.sendMessage({ type: "setupState" }).catch(() => null);
    if (!el) return;
    if (r && r.hasToken && r.login) el.textContent = `✅ Signed in as @${r.login}`;
    else if (r && r.hasToken) el.textContent = "Token saved (identity not verified yet).";
    else el.textContent = "No token saved yet — add yours above to start filing.";
  }
  $("tok-save").addEventListener("click", async () => {
    const el = $("tok-state");
    const t = $("token").value.trim();
    if (!t) { el.textContent = "Paste your token first."; return; }
    el.textContent = "Verifying…";
    const r = await chrome.runtime.sendMessage({ type: "saveToken", token: t }).catch(e => ({ ok: false, error: String(e) }));
    if (r && r.ok && r.verified) {
      el.textContent = `✅ Signed in as @${r.login} — you're ready to file.`;
      $("token").value = "";
      $("token").placeholder = "•••••• saved — paste a new one to replace";
    } else if (r && r.ok) {
      el.textContent = "⚠️ Token saved, but GitHub didn't confirm your identity — double-check it has Contents access to the Dashboards repo.";
      $("token").value = "";
    } else {
      el.textContent = "❌ " + ((r && r.error) || "failed");
    }
  });

  (async function init() {
    const c = await chrome.storage.local.get(["ghToken", "ghRepo", "projects"]);
    projects = c.projects || [];
    repo = c.ghRepo || "apatel85/Dashboards";
    $("repo").value = repo;
    if (c.ghToken) $("token").placeholder = "•••••• saved — paste a new one to replace";
    render();
    refreshTokState();
    initIssues();
  })();

  /* ---------- filed issue log ---------- */
  const ISSUE_TYPES = ["Broken link","Button not working","Page not loading / blank page",
    "Miscount between summary and detail","Wrong data displayed","Missing validation",
    "UI / layout issue","Slow performance","Other"];
  let issueCache = [];

  function initIssues() {
    const sel = $("issue-proj");
    sel.innerHTML = projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("issue-load").addEventListener("click", async () => {
      const list = $("issue-list");
      list.innerHTML = "<p class='hint'>Loading…</p>";
      $("issue-edit").style.display = "none";
      const r = await chrome.runtime.sendMessage({ type: "listIssues", projectId: sel.value });
      if (!r || !r.ok) { list.innerHTML = `<p class='hint'>❌ ${(r && r.error) || "failed"}</p>`; return; }
      issueCache = r.issues;
      if (!issueCache.length) { list.innerHTML = "<p class='hint'>No issues filed yet.</p>"; return; }
      const STATUSES = ["Open", "Partly fixed", "Still failing", "Blocked", "Fixed"];
      list.innerHTML = issueCache.map((b, i) => `
        <div class="card" style="margin:8px 0;padding:10px 12px">
          <b style="font-family:monospace">${esc(b.id)}</b>
          <span class="hint">[${esc(b.issue_type)} · ${esc(b.severity)}]</span><br>
          ${esc(b.title)}<br>
          <span class="hint">${esc((b.created||"").slice(0,16).replace("T"," "))}${b.filed_by ? " · filed by " + esc(b.filed_by) : ""}</span>
          <div class="row">
            <label style="flex:1">Status <select data-s="${i}" style="width:100%;min-height:40px">${STATUSES.map(s => `<option ${s === (b.status || "Open") ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          </div>
          <div class="row"><button data-e="${i}">✏️ Edit</button>${b.can_delete
            ? `<button data-d="${i}" style="color:#b91c1c">🗑 Delete</button>`
            : `<span class="hint">🔒 Only ${esc(b.filed_by || "the person who filed it")} can delete this</span>`}</div>
          <span class="hint" data-m="${i}"></span>
        </div>`).join("");
      list.querySelectorAll("[data-e]").forEach(btn => btn.addEventListener("click", () => editIssue(Number(btn.dataset.e))));
      list.querySelectorAll("[data-d]").forEach(btn => btn.addEventListener("click", () => deleteIssueUI(Number(btn.dataset.d), btn)));
      list.querySelectorAll("[data-s]").forEach(sel => sel.addEventListener("change", async () => {
        const i = Number(sel.dataset.s), b = issueCache[i];
        const m = list.querySelector(`[data-m="${i}"]`);
        const r = await chrome.runtime.sendMessage({ type: "updateIssue",
          projectId: $("issue-proj").value,
          file: b._file, patch: { status: sel.value } });
        if (r && r.ok) { b.status = sel.value; if (m) m.textContent = "✅ Status saved — logged in the audit trail."; }
        else if (m) m.textContent = "❌ " + ((r && r.error) || "failed");
      }));
    });
  }

  async function deleteIssueUI(i, btn) {
    const b = issueCache[i];
    if (btn.dataset.armed) {
      btn.textContent = "Deleting…"; btn.disabled = true;
      const r = await chrome.runtime.sendMessage({ type: "deleteIssue",
        projectId: $("issue-proj").value, file: b._file });
      if (r && r.ok) { $("issue-edit").style.display = "none"; $("issue-load").click(); }
      else { btn.textContent = "❌ " + ((r && r.error) || "failed"); btn.disabled = false; delete btn.dataset.armed; }
      return;
    }
    btn.dataset.armed = "1";
    btn.textContent = "Tap again to confirm delete";
    setTimeout(() => { if (btn.isConnected) { btn.textContent = "🗑 Delete"; delete btn.dataset.armed; } }, 4000);
  }

  function editIssue(i) {
    const b = issueCache[i];
    const ed = $("issue-edit");
    ed.style.display = "block";
    const typeOpts = ISSUE_TYPES.map(t => `<option ${t === b.issue_type ? "selected" : ""}>${esc(t)}</option>`).join("");
    const sevOpts = ["High","Medium","Low"].map(s => `<option ${s === b.severity ? "selected" : ""}>${s}</option>`).join("");
    ed.innerHTML = `
      <h3 style="margin:0 0 8px">Editing <span style="font-family:monospace">${esc(b.id)}</span></h3>
      <label>Title <input type="text" id="ie-title" value="${esc(b.title)}"></label>
      <div class="row">
        <label style="flex:1">Severity <select id="ie-sev" style="width:100%;min-height:48px">${sevOpts}</select></label>
        <label style="flex:2">Issue type <select id="ie-type" style="width:100%;min-height:48px">${typeOpts}</select></label>
      </div>
      <label>Expected <textarea id="ie-exp" rows="2">${esc(b.expected || "")}</textarea></label>
      <label>Actual <textarea id="ie-act" rows="2">${esc(b.actual || "")}</textarea></label>
      <div class="row"><button class="primary" id="ie-save">💾 Save changes</button><button id="ie-cancel">Cancel</button></div>
      <p class="hint" id="ie-msg"></p>`;
    ed.querySelector("#ie-cancel").addEventListener("click", () => ed.style.display = "none");
    ed.querySelector("#ie-save").addEventListener("click", async () => {
      const msg = ed.querySelector("#ie-msg");
      msg.textContent = "Saving…";
      const r = await chrome.runtime.sendMessage({ type: "updateIssue",
        projectId: $("issue-proj").value, file: b._file,
        patch: { title: ed.querySelector("#ie-title").value.trim(),
                 severity: ed.querySelector("#ie-sev").value,
                 issue_type: ed.querySelector("#ie-type").value,
                 expected: ed.querySelector("#ie-exp").value.trim(),
                 actual: ed.querySelector("#ie-act").value.trim() } });
      if (r && r.ok) { msg.textContent = "✅ Saved — dashboard rebuilds shortly."; $("issue-load").click(); }
      else msg.textContent = "❌ " + ((r && r.error) || "failed");
    });
    ed.scrollIntoView({ behavior: "smooth", block: "center" });
  }
})();
