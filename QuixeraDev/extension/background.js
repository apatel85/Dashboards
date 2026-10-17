/* Quixera QA Capture — background service worker.
   Takes the screenshot, then commits the bug JSON + screenshot to GitHub,
   which triggers the dashboard rebuild Action. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'QA_FLAG') {
    handleFlag(msg.bug, sender.tab).then(sendResponse);
    return true; // async
  }
});

function bugId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `MAN-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function gh(path, pat, method = 'GET', body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${pat}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

// base64 of a UTF-8 string
function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function putFile(repo, branch, pat, path, contentB64, message) {
  let sha;
  try {
    const cur = await gh(`/repos/${repo}/contents/${path}?ref=${branch}`, pat);
    sha = cur.sha;
  } catch (e) { /* file doesn't exist yet — create */ }
  const payload = { message, content: contentB64, branch };
  if (sha) payload.sha = sha;
  await gh(`/repos/${repo}/contents/${path}`, pat, 'PUT', payload);
}

async function handleFlag(bug, tab) {
  try {
    const s = await chrome.storage.local.get(['qa_pat', 'qa_repo', 'qa_branch', 'qa_env']);
    const pat = (s.qa_pat || '').trim();
    const repo = (s.qa_repo || 'apatel85/Dashboards').trim();
    const branch = (s.qa_branch || 'main').trim();
    const env = s.qa_env || 'dev';
    if (!pat) return { ok: false, error: 'No GitHub token set — open the extension popup and paste your token first.' };

    const id = bugId();
    const shotPath = `QuixeraDev/bugs/shots/${id}.jpg`;
    const jsonPath = `QuixeraDev/bugs/${id}.json`;

    // 1. screenshot of the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
    const shotB64 = dataUrl.split(',')[1];

    // 2. build the normalized bug record (matches dashboard schema)
    const steps = bug.trail.map((st, i) => {
      const where = st.url ? new URL(st.url).pathname : '';
      return `${i + 1}. [${st.tag}] "${st.label}" — ${where}`;
    });
    const record = {
      id, sev: bug.sev, status: 'Open', source: 'manual',
      link: bug.url, title: bug.title,
      steps, expected: bug.expected, actual: bug.actual,
      fix: '', env: `Facility ${env} — reported via QA Capture`,
      where: bug.url, repro: '1/1 (manual capture)', shots: [`bugs/shots/${id}.jpg`], jira: null,
      capturedAt: new Date().toISOString(),
    };

    // 3. commit screenshot + json (two commits; each triggers the rebuild Action)
    await putFile(repo, branch, pat, shotPath, shotB64, `QA Capture: screenshot for ${id}`);
    await putFile(repo, branch, pat, jsonPath, b64encodeUtf8(JSON.stringify(record, null, 2)), `QA Capture: new bug ${id} — ${bug.title.slice(0, 60)}`);

    return { ok: true, dashboardUrl: 'https://apatel85.github.io/Dashboards/QuixeraDev/' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
