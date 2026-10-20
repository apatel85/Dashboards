/* QA Capture v3 — background service worker.
   Owns: project matching, GitHub API, screenshots, annotation editor + clip
   recorder orchestration, bug filing, project scaffolding, issue log read/edit. */

const SEED_PROJECTS = [
  { id: "qdev", name: "Quixera Dev", slug: "QuixeraDev", dir: "QuixeraDev",
    hosts: ["facility-dev.quixeraos.com"] },
  { id: "quat", name: "Quixera UAT", slug: "QuixeraUAT", dir: "QuixeraUAT",
    hosts: ["facility-uat.quixeraos.com"] },
];
const DEFAULT_REPO = "apatel85/Dashboards";
const BRANCH = "main";
const MAX_SHOTS = 5;
const MAX_CLIP_SECS = 60;

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.local.get(["projects", "ghRepo"]);
  const patch = {};
  if (!cur.projects) patch.projects = SEED_PROJECTS;
  else {
    // v3.1.1 migration: the seeded UAT host was wrong (facility.quixeraos.com
    // is not UAT). Patch existing installs that still carry the old value.
    const fixed = cur.projects.map(p =>
      (p.id === "quat" && (p.hosts || []).join(",") === "facility.quixeraos.com")
        ? { ...p, hosts: ["facility-uat.quixeraos.com"] } : p);
    if (JSON.stringify(fixed) !== JSON.stringify(cur.projects)) patch.projects = fixed;
  }
  if (!cur.ghRepo) patch.ghRepo = DEFAULT_REPO;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  // v3.9: first install → open the setup page so the very first thing a new
  // user is asked for is their own GitHub token (with instructions).
  if (details && details.reason === "install") {
    const { ghToken } = await chrome.storage.local.get(["ghToken"]);
    if (!ghToken) { try { chrome.runtime.openOptionsPage(); } catch (e) {} }
  }
});

async function cfg() {
  const c = await chrome.storage.local.get(["ghToken", "ghRepo", "projects"]);
  return {
    token: c.ghToken || "",
    repo: c.ghRepo || DEFAULT_REPO,
    projects: c.projects || SEED_PROJECTS
  };
}

function matchProject(hostname, projects) {
  const host = (hostname || "").toLowerCase();
  let best = null, bestLen = -1;
  for (const p of projects) {
    for (const raw of (p.hosts || [])) {
      const h = raw.trim().toLowerCase();
      if (!h) continue;
      if (host === h || host.endsWith("." + h)) {
        if (h.length > bestLen) { best = p; bestLen = h.length; }
      }
    }
  }
  return best;
}

async function gh(path, method, body, token) {
  const { repo } = await cfg();
  const res = await fetch("https://api.github.com" + path, {
    method: method || "GET",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error("GitHub " + res.status + ": " + t.slice(0, 200));
  }
  if (res.status === 204) return null;
  return res.json();
}

async function commitFile(repoPath, b64, message, token) {
  const { repo } = await cfg();
  let sha = null;
  try {
    const cur = await gh(`/repos/${repo}/contents/${repoPath}?ref=${BRANCH}`, "GET", null, token);
    sha = cur.sha;
  } catch (e) { /* new file */ }
  const payload = { message, content: b64, branch: BRANCH };
  if (sha) payload.sha = sha;
  await gh(`/repos/${repo}/contents/${repoPath}`, "PUT", payload, token);
}

const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));

/* ---------- identity + audit (v3.8) ----------
   Each person uses their OWN GitHub credential in the extension, so
   GET /user tells us who is acting. Filings are stamped with filed_by.
   Rules: anyone signed in may change a bug's status; only the person who
   filed a bug may delete it (pre-filed_by bugs count as the repo owner's).
   Every status change and delete is appended to <dir>/data/audit.json. */
async function whoami() {
  const { token } = await cfg();
  if (!token) return null;
  const c = await chrome.storage.local.get(["ghLogin", "ghLoginTok"]);
  if (c.ghLogin && c.ghLoginTok === token) return c.ghLogin;
  try {
    const u = await gh("/user", "GET", null, token);
    if (u && u.login) {
      await chrome.storage.local.set({ ghLogin: u.login, ghLoginTok: token });
      return u.login;
    }
  } catch (e) { /* token may be fine-grained without /user scope — stay null */ }
  return null;
}

async function repoOwner() {
  const { repo } = await cfg();
  return (repo || "").split("/")[0] || "";
}

async function audit(dir, entry, token) {
  const path = `${dir}/data/audit.json`;
  const { repo } = await cfg();
  for (let attempt = 0; attempt < 2; attempt++) {
    let doc = { entries: [] }, sha = null;
    try {
      const cur = await gh(`/repos/${repo}/contents/${path}?ref=${BRANCH}`, "GET", null, token);
      sha = cur.sha;
      doc = JSON.parse(decodeURIComponent(escape(atob(cur.content))));
      if (!Array.isArray(doc.entries)) doc = { entries: [] };
    } catch (e) { /* first entry — file does not exist yet */ }
    doc.entries.push(entry);
    try {
      const payload = { message: `QA Capture: audit ${entry.action} ${entry.bug}`,
                        content: b64encode(JSON.stringify(doc, null, 2)), branch: BRANCH };
      if (sha) payload.sha = sha;
      await gh(`/repos/${repo}/contents/${path}`, "PUT", payload, token);
      return;
    } catch (e) {
      if (attempt === 1) throw e; // conflict twice — give up loudly
    }
  }
}

async function auditStamp(dir, partial, token) {
  const me = await whoami();
  await audit(dir, { ts: new Date().toISOString(), user: me || "(unknown)", ...partial }, token);
}

/* ---------- pending filing state per tab ---------- */
const pending = {}; // tabId -> { shots: [dataUrl], clip: {dataUrl, secs} | null }
function pend(tabId) {
  if (!pending[tabId]) pending[tabId] = { shots: [], clip: null };
  return pending[tabId];
}
function dataUrlSizeKB(d) { return Math.round((d.length * 3 / 4) / 1024); }

/* ---------- project scaffolding ---------- */
async function scaffoldProject(project, token) {
  const { repo } = await cfg();
  const dir = project.dir || project.slug;
  const stamp = new Date().toISOString().slice(0, 10);
  const base = {
    title: project.name + " — QA Bug Tracker",
    subtitle: "Bugs captured with QA Capture (click trail + screenshot).",
    created: stamp
  };
  await commitFile(`${dir}/bugs/.gitkeep`, b64encode(""), `QA Capture: scaffold ${dir}/bugs`, token);
  await commitFile(`${dir}/bugs/shots/.gitkeep`, b64encode(""), `QA Capture: scaffold ${dir}/bugs/shots`, token);
  await commitFile(`${dir}/bugs/clips/.gitkeep`, b64encode(""), `QA Capture: scaffold ${dir}/bugs/clips`, token);
  try {
    const { repo: r } = await cfg();
    await gh(`/repos/${r}/contents/${dir}/data/base.json?ref=${BRANCH}`, "GET", null, token);
  } catch (e) {
    await commitFile(`${dir}/data/base.json`, b64encode(JSON.stringify(base, null, 2)),
      `QA Capture: scaffold ${dir}/data/base.json`, token);
  }
  return `https://apatel85.github.io/Dashboards/${dir}/`;
}

/* ---------- bug filing ---------- */
// v3.7: readable ids — MAN-MMDD-HHMM-CAT (local time, category abbreviation),
// e.g. MAN-1020-1137-BL for a Broken link filed Oct 20 at 11:37 AM.
const CAT_ABBR = {
  "Broken link": "BL", "Button not working": "BTN",
  "Page not loading / blank page": "PL",
  "Miscount between summary and detail": "MC",
  "Wrong data displayed": "WD", "Missing validation": "MV",
  "UI / layout issue": "UI", "Slow performance": "SP", "Other": "OT"
};
function newBugId(issueType) {
  const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
  const stamp = p2(d.getMonth() + 1) + p2(d.getDate()) + "-" +
                p2(d.getHours()) + p2(d.getMinutes());
  return "MAN-" + stamp + "-" + (CAT_ABBR[issueType] || "OT");
}

async function fileBug(project, bug, sender) {
  const { token, repo } = await cfg();
  if (!token) throw new Error("No GitHub token set. Open the extension Settings and paste your token.");
  const dir = project.dir || project.slug;
  // collision guard: two filings in the same minute + category get -2, -3…
  const baseId = newBugId(bug.issue_type);
  let id = baseId;
  for (let suffix = 2; ; suffix++) {
    try {
      await gh(`/repos/${repo}/contents/${dir}/bugs/${id}.json?ref=${BRANCH}`, "GET", null, token);
      id = `${baseId}-${suffix}`; // exists — try the next suffix
    } catch (e) {
      if (!/GitHub 404/.test(String(e.message || e))) {
        id = `${baseId}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
      }
      break;
    }
  }
  const shots = [];
  for (let i = 0; i < bug.shots.length; i++) {
    const b64 = bug.shots[i].split(",")[1];
    const name = `bugs/shots/${id}-${i + 1}.jpg`;
    await commitFile(`${dir}/${name}`, b64, `QA Capture: screenshot ${i + 1} for ${id}`, token);
    shots.push(name);
  }
  let clip = null, clipSecs = 0;
  if (bug.clip) {
    const b64 = bug.clip.dataUrl.split(",")[1];
    clip = `bugs/clips/${id}.webm`;
    clipSecs = bug.clip.secs || 0;
    await commitFile(`${dir}/${clip}`, b64, `QA Capture: clip for ${id} (${clipSecs}s)`, token);
  }
  const record = {
    id,
    source: "manual",
    project: project.name,
    issue_type: bug.issue_type || "Other",
    title: bug.title,
    severity: bug.severity,
    page: bug.page,
    url: bug.url,
    expected: bug.expected,
    actual: bug.actual,
    trail: bug.trail || [],
    shots,
    clip,
    clip_secs: clipSecs,
    filed_by: (await whoami()) || undefined,
    created: new Date().toISOString()
  };
  await commitFile(`${dir}/bugs/${id}.json`, b64encode(JSON.stringify(record, null, 2)),
    `QA Capture: bug ${id} — ${bug.title.slice(0, 60)}`, token);
  return { ok: true, id };
}

/* ---------- issue log read/edit ---------- */
async function listIssues(projectId, limit) {
  const { token, repo, projects } = await cfg();
  if (!token) throw new Error("Set your GitHub token first.");
  const p = projects.find(x => x.id === projectId);
  if (!p) throw new Error("Unknown project");
  const dir = p.dir || p.slug;
  const me = await whoami();
  const owner = await repoOwner();
  const entries = await gh(`/repos/${repo}/contents/${dir}/bugs?ref=${BRANCH}`, "GET", null, token);
  const files = entries.filter(e => e.type === "file" && e.name.endsWith(".json"))
    .map(e => e.name).sort().reverse().slice(0, limit || 50);
  const out = [];
  for (const name of files) {
    try {
      const f = await gh(`/repos/${repo}/contents/${dir}/bugs/${name}?ref=${BRANCH}`, "GET", null, token);
      const b = JSON.parse(decodeURIComponent(escape(atob(f.content))));
      const filer = b.filed_by || owner;
      out.push({ id: b.id, title: b.title, severity: b.severity,
                 issue_type: b.issue_type || "Other", created: b.created,
                 status: b.status || "Open", filed_by: b.filed_by || null,
                 can_delete: !!me && me === filer,
                 expected: b.expected || "", actual: b.actual || "", _file: name });
    } catch (e) { /* skip unreadable */ }
  }
  return { issues: out, me };
}

async function updateIssue(projectId, file, patch) {
  const { token, repo, projects } = await cfg();
  const p = projects.find(x => x.id === projectId);
  const dir = p.dir || p.slug;
  let cur;
  try {
    cur = await gh(`/repos/${repo}/contents/${dir}/bugs/${file}?ref=${BRANCH}`, "GET", null, token);
  } catch (e) {
    if (String(e.message).includes("GitHub 404")) {
      throw new Error("This bug no longer exists — it was already deleted. The dashboard refreshes on its next rebuild.");
    }
    throw e;
  }
  const b = JSON.parse(decodeURIComponent(escape(atob(cur.content))));
  const oldStatus = b.status || "Open";
  for (const k of ["title", "severity", "issue_type", "expected", "actual", "status"]) {
    if (patch[k] !== undefined) b[k] = patch[k];
  }
  b.updated = new Date().toISOString();
  await gh(`/repos/${repo}/contents/${dir}/bugs/${file}`, "PUT", {
    message: `QA Capture: edit ${b.id}`, content: b64encode(JSON.stringify(b, null, 2)),
    sha: cur.sha, branch: BRANCH
  }, token);
  // v3.8: status changes are audited with who + when
  if (patch.status !== undefined && patch.status !== oldStatus) {
    await auditStamp(dir, { bug: b.id, title: b.title || "", action: "status",
                            from: oldStatus, to: patch.status }, token);
  }
  return { ok: true };
}

async function deleteIssue(projectId, file) {
  const { token, repo, projects } = await cfg();
  const p = projects.find(x => x.id === projectId);
  const dir = p.dir || p.slug;
  let cur;
  try {
    cur = await gh(`/repos/${repo}/contents/${dir}/bugs/${file}?ref=${BRANCH}`, "GET", null, token);
  } catch (e) {
    // v3.9.1: deleting a bug that's already gone (e.g. a stale dashboard
    // card) is a clean outcome, not an error.
    if (String(e.message).includes("GitHub 404")) return { ok: true, alreadyGone: true };
    throw e;
  }
  const b = JSON.parse(decodeURIComponent(escape(atob(cur.content))));
  // v3.8: only the person who filed a bug may delete it. Bugs filed before
  // filed_by existed count as the repo owner's.
  const me = await whoami();
  const filer = b.filed_by || (await repoOwner());
  if (!me || me !== filer) {
    throw new Error(`Only the person who filed this can delete it (filed by ${filer}). You are ${me || "not signed in"}.`);
  }
  // delete screenshots + clip first, then the bug file
  for (const s of (b.shots || [])) {
    try {
      const f = await gh(`/repos/${repo}/contents/${dir}/${s}?ref=${BRANCH}`, "GET", null, token);
      await gh(`/repos/${repo}/contents/${dir}/${s}`, "DELETE", {
        message: `QA Capture: delete ${b.id} screenshot`, sha: f.sha, branch: BRANCH }, token);
    } catch (e) { /* already gone */ }
  }
  if (b.clip) {
    try {
      const f = await gh(`/repos/${repo}/contents/${dir}/${b.clip}?ref=${BRANCH}`, "GET", null, token);
      await gh(`/repos/${repo}/contents/${dir}/${b.clip}`, "DELETE", {
        message: `QA Capture: delete ${b.id} clip`, sha: f.sha, branch: BRANCH }, token);
    } catch (e) {}
  }
  await gh(`/repos/${repo}/contents/${dir}/bugs/${file}`, "DELETE", {
    message: `QA Capture: delete issue ${b.id}`, sha: cur.sha, branch: BRANCH }, token);
  await auditStamp(dir, { bug: b.id, title: b.title || "", action: "delete",
                          from: b.status || "Open", to: null }, token);
  return { ok: true };
}

/* ---------- possible-duplicate matching (mirrors dashboard builder) ---------- */
const DUP_STOP = new Set(["the","a","an","on","in","of","to","and","or","for",
  "with","is","are","was","not","no","tab","page","button","click","clicking",
  "open","opens","shows","show","new","when","from","that","this"]);
function dupWords(t){
  return new Set(((t||"").toLowerCase().replace(/[^a-z0-9 ]/g," ")).split(/\s+/)
    .filter(w => w.length > 3 && !DUP_STOP.has(w)));
}
function dupPath(b){
  for (const k of ["page","link"]) {
    const v = b[k] || "";
    if (v.startsWith("/")) return v.split("?")[0];
    if (v.startsWith("http")) { try { return new URL(v).pathname; } catch(e){} }
  }
  return "";
}
function dupMatch(manual, others){
  const mw = dupWords(manual.title), mp = dupPath(manual);
  let best = null, bs = 0;
  for (const o of others) {
    if (o.id === manual.id) continue;
    const ow = dupWords(o.title);
    let inter = 0; mw.forEach(w => { if (ow.has(w)) inter++; });
    let s = 2 * inter;
    const op = dupPath(o);
    if (mp && op && mp === op) s += 2;
    if (manual.issue_type && manual.issue_type !== "Other" && o.issue_type === manual.issue_type) s += 3;
    if (s > bs) { best = o; bs = s; }
  }
  return bs >= 4 ? best : null;
}
const DUP_SRC_LABEL = { arlo: "Arlo testing", team: "QA team testing", manual: "another manual capture" };

async function projectBugs(projectId){
  const key = "dupbugs_" + projectId;
  const cached = await chrome.storage.session.get([key]);
  if (cached[key] && Date.now() - cached[key].at < 3600e3) return cached[key].bugs;
  const { token, repo, projects } = await cfg();
  const p = projects.find(x => x.id === projectId);
  if (!p || !token) return [];
  const dir = p.dir || p.slug, out = [];
  try {
    const entries = await gh(`/repos/${repo}/contents/${dir}/bugs?ref=${BRANCH}`, "GET", null, token);
    const files = entries.filter(e => e.type === "file" && e.name.endsWith(".json")).slice(-80);
    for (const e of files) {
      try {
        const f = await gh(`/repos/${repo}/contents/${dir}/bugs/${e.name}?ref=${BRANCH}`, "GET", null, token);
        const b = JSON.parse(decodeURIComponent(escape(atob(f.content))));
        out.push({ id: b.id, title: b.title || "", issue_type: b.issue_type || "",
                   page: b.page || "", link: b.url || "", source: "manual" });
      } catch(err){}
    }
  } catch(e){}
  try {
    const f = await gh(`/repos/${repo}/contents/${dir}/data/base.json?ref=${BRANCH}`, "GET", null, token);
    const base = JSON.parse(decodeURIComponent(escape(atob(f.content))));
    for (const b of (base.bugs || []))
      out.push({ id: b.id, title: b.title || "", issue_type: "", page: "", link: b.link || "", source: b.source || "" });
  } catch(e){}
  await chrome.storage.session.set({ [key]: { at: Date.now(), bugs: out } });
  return out;
}

/* ---------- message router ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const { projects } = await cfg();
      const tabId = sender.tab ? sender.tab.id : msg.tabId;

      if (msg.type === "matchProject") {
        sendResponse({ project: matchProject(msg.host, projects), projects });
      } else if (msg.type === "listProjects") {
        const c = await cfg();
        sendResponse({ projects: c.projects, repo: c.repo, hasToken: !!c.token });
      } else if (msg.type === "setupState") {
        // v3.9 onboarding: does this install have a token, and whose is it?
        const { token } = await cfg();
        sendResponse({ ok: true, hasToken: !!token, login: token ? await whoami() : null });
      } else if (msg.type === "saveToken") {
        const t = (msg.token || "").trim();
        if (!t) throw new Error("Paste your GitHub token first.");
        await chrome.storage.local.set({ ghToken: t });
        await chrome.storage.local.remove(["ghLogin", "ghLoginTok"]);
        const login = await whoami();
        sendResponse({ ok: true, login, verified: !!login });
      } else if (msg.type === "captureShot") {
        const p = pend(tabId);
        if (p.shots.length >= MAX_SHOTS) throw new Error(`Max ${MAX_SHOTS} screenshots per bug.`);
        const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "jpeg", quality: 72 });
        p.shots.push(dataUrl);
        sendResponse({ ok: true, index: p.shots.length - 1, kb: dataUrlSizeKB(dataUrl), count: p.shots.length });
      } else if (msg.type === "removeShot") {
        pend(tabId).shots.splice(msg.index, 1);
        sendResponse({ ok: true, count: pend(tabId).shots.length });
      } else if (msg.type === "annotateShot") {
        const p = pend(tabId);
        if (!p.shots[msg.index]) throw new Error("Screenshot not found");
        await chrome.storage.session.set({ ["edit_" + tabId + "_" + msg.index]: p.shots[msg.index] });
        await chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") + `?t=${tabId}&i=${msg.index}` });
        sendResponse({ ok: true });
      } else if (msg.type === "editorDone" || msg.type === "editorCancel") {
        // v3.4: we close the editor tab ourselves and return focus to the tab
        // being tested (msg.t) — the old code left focus on a random tab.
        const origTabId = Number(msg.t);
        if (msg.type === "editorDone") {
          const key = `edit_${msg.t}_${msg.i}`;
          const stored = await chrome.storage.session.get([key]);
          if (stored[key]) {
            pend(origTabId).shots[Number(msg.i)] = stored[key];
            await chrome.storage.session.remove([key]);
          }
        }
        try { await chrome.tabs.update(origTabId, { active: true }); } catch (e) {}
        if (msg.type === "editorDone") {
          try { chrome.tabs.sendMessage(origTabId, { type: "shotsUpdated" }).catch(() => {}); } catch (e) {}
        }
        try { if (sender.tab && sender.tab.id) await chrome.tabs.remove(sender.tab.id); } catch (e) {}
        sendResponse({ ok: true });
      } else if (msg.type === "clipData") {
        // v3.5: the content script records the clip itself (getDisplayMedia)
        // and hands the finished data URL here for the pending bug.
        pend(tabId).clip = { dataUrl: msg.dataUrl, secs: msg.secs };
        sendResponse({ ok: true });
      } else if (msg.type === "discardClip") {
        pend(tabId).clip = null;
        sendResponse({ ok: true });
      } else if (msg.type === "ping") {
        // v3.6 keep-alive: the content script pings every 20s while the form
        // or minibar is open so the MV3 worker (and its in-memory pending
        // shots/clip) can't fall asleep mid-filing.
        sendResponse({ ok: true });
      } else if (msg.type === "getPending") {
        const p = pend(tabId);
        sendResponse({ shots: p.shots.length, clip: p.clip ? { secs: p.clip.secs, kb: dataUrlSizeKB(p.clip.dataUrl) } : null });
      } else if (msg.type === "resetPending") {
        delete pending[tabId];
        sendResponse({ ok: true });
      } else if (msg.type === "fileBug") {
        const pr = projects.find(x => x.id === msg.projectId);
        if (!pr) throw new Error("Unknown project");
        const p = pend(tabId);
        const resp = await fileBug(pr, {
          title: msg.bug.title, severity: msg.bug.severity, issue_type: msg.bug.issue_type,
          expected: msg.bug.expected, actual: msg.bug.actual, page: msg.bug.page,
          url: msg.bug.url, trail: msg.bug.trail, shots: p.shots, clip: p.clip
        }, sender);
        delete pending[tabId];
        sendResponse(resp);
      } else if (msg.type === "scaffold") {
        const c = await cfg();
        if (!c.token) throw new Error("Set your GitHub token first.");
        const pr = c.projects.find(x => x.id === msg.projectId);
        if (!pr) throw new Error("Unknown project");
        const url = await scaffoldProject(pr, c.token);
        sendResponse({ ok: true, url });
      } else if (msg.type === "listIssues") {
        const r = await listIssues(msg.projectId);
        sendResponse({ ok: true, issues: r.issues, me: r.me });
      } else if (msg.type === "updateIssue") {
        sendResponse(await updateIssue(msg.projectId, msg.file, msg.patch));
      } else if (msg.type === "deleteIssue") {
        sendResponse(await deleteIssue(msg.projectId, msg.file));
      } else if (msg.type === "dashWhoami") {
        // v3.8 dashboard bridge: the dashboard page asks (via the content
        // script) who the extension is signed in as — no token ever touches
        // the web page.
        sendResponse({ ok: true, login: await whoami() });
      } else if (msg.type === "dashSetStatus" || msg.type === "dashDelete") {
        const pr = projects.find(x => (x.dir || x.slug) === msg.dir);
        if (!pr) throw new Error("Unknown dashboard");
        if (msg.type === "dashSetStatus") {
          sendResponse(await updateIssue(pr.id, msg.file, { status: msg.status }));
        } else {
          sendResponse(await deleteIssue(pr.id, msg.file));
        }
      } else if (msg.type === "checkDup") {
        const bugs = await projectBugs(msg.projectId);
        const hit = dupMatch({ title: msg.title, issue_type: msg.issue_type,
                               page: msg.page }, bugs);
        sendResponse({ ok: true, hit: hit ? { id: hit.id, title: hit.title,
          src: DUP_SRC_LABEL[hit.source] || "earlier testing" } : null });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});
