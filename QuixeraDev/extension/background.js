/* QA Capture v3 — background service worker.
   Owns: project matching, GitHub API, screenshots, annotation editor + clip
   recorder orchestration, bug filing, project scaffolding, issue log read/edit. */

const SEED_PROJECTS = [
  { id: "qdev", name: "Quixera Dev", slug: "QuixeraDev", dir: "QuixeraDev",
    hosts: ["facility-dev.quixeraos.com"] },
  { id: "quat", name: "Quixera UAT", slug: "QuixeraUAT", dir: "QuixeraUAT",
    hosts: ["facility.quixeraos.com"] }
];
const DEFAULT_REPO = "apatel85/Dashboards";
const BRANCH = "main";
const MAX_SHOTS = 5;
const MAX_CLIP_SECS = 60;

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(["projects", "ghRepo"]);
  const patch = {};
  if (!cur.projects) patch.projects = SEED_PROJECTS;
  if (!cur.ghRepo) patch.ghRepo = DEFAULT_REPO;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
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
async function fileBug(project, bug, sender) {
  const { token } = await cfg();
  if (!token) throw new Error("No GitHub token set. Open the extension Settings and paste your token.");
  const dir = project.dir || project.slug;
  const id = "MAN-" + Date.now().toString(36).toUpperCase();
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
  const entries = await gh(`/repos/${repo}/contents/${dir}/bugs?ref=${BRANCH}`, "GET", null, token);
  const files = entries.filter(e => e.type === "file" && e.name.endsWith(".json"))
    .map(e => e.name).sort().reverse().slice(0, limit || 50);
  const out = [];
  for (const name of files) {
    try {
      const f = await gh(`/repos/${repo}/contents/${dir}/bugs/${name}?ref=${BRANCH}`, "GET", null, token);
      const b = JSON.parse(decodeURIComponent(escape(atob(f.content))));
      out.push({ id: b.id, title: b.title, severity: b.severity,
                 issue_type: b.issue_type || "Other", created: b.created,
                 expected: b.expected || "", actual: b.actual || "", _file: name });
    } catch (e) { /* skip unreadable */ }
  }
  return out;
}

async function updateIssue(projectId, file, patch) {
  const { token, repo, projects } = await cfg();
  const p = projects.find(x => x.id === projectId);
  const dir = p.dir || p.slug;
  const cur = await gh(`/repos/${repo}/contents/${dir}/bugs/${file}?ref=${BRANCH}`, "GET", null, token);
  const b = JSON.parse(decodeURIComponent(escape(atob(cur.content))));
  for (const k of ["title", "severity", "issue_type", "expected", "actual"]) {
    if (patch[k] !== undefined) b[k] = patch[k];
  }
  b.updated = new Date().toISOString();
  await gh(`/repos/${repo}/contents/${dir}/bugs/${file}`, "PUT", {
    message: `QA Capture: edit ${b.id}`, content: b64encode(JSON.stringify(b, null, 2)),
    sha: cur.sha, branch: BRANCH
  }, token);
  return { ok: true };
}

async function deleteIssue(projectId, file) {
  const { token, repo, projects } = await cfg();
  const p = projects.find(x => x.id === projectId);
  const dir = p.dir || p.slug;
  const cur = await gh(`/repos/${repo}/contents/${dir}/bugs/${file}?ref=${BRANCH}`, "GET", null, token);
  const b = JSON.parse(decodeURIComponent(escape(atob(cur.content))));
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
  return { ok: true };
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
      } else if (msg.type === "editorDone") {
        const key = `edit_${msg.t}_${msg.i}`;
        const stored = await chrome.storage.session.get([key]);
        if (stored[key]) {
          pend(Number(msg.t)).shots[Number(msg.i)] = stored[key];
          await chrome.storage.session.remove([key]);
        }
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) chrome.tabs.sendMessage(tab.id, { type: "shotsUpdated" }).catch(() => {});
        } catch (e) {}
        sendResponse({ ok: true });
      } else if (msg.type === "startRecord") {
        await chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html") + `?src=${tabId}` });
        sendResponse({ ok: true });
      } else if (msg.type === "clipDone") {
        pend(tabId).clip = { dataUrl: msg.dataUrl, secs: msg.secs };
        try { chrome.tabs.sendMessage(tabId, { type: "clipReady", secs: msg.secs, kb: dataUrlSizeKB(msg.dataUrl) }).catch(() => {}); } catch (e) {}
        sendResponse({ ok: true });
      } else if (msg.type === "discardClip") {
        pend(tabId).clip = null;
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
        sendResponse({ ok: true, issues: await listIssues(msg.projectId) });
      } else if (msg.type === "updateIssue") {
        sendResponse(await updateIssue(msg.projectId, msg.file, msg.patch));
      } else if (msg.type === "deleteIssue") {
        sendResponse(await deleteIssue(msg.projectId, msg.file));
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});
