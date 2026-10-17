/* QA Capture v2 — popup */
(async function () {
  const status = document.getElementById("status");
  const list = document.getElementById("list");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab && tab.url ? new URL(tab.url).hostname : "";

  const resp = await chrome.runtime.sendMessage({ type: "listProjects" });
  const projects = (resp && resp.projects) || [];
  const match = (h) => {
    h = h.toLowerCase(); let best = null, bl = -1;
    for (const p of projects) for (const r of (p.hosts || [])) {
      const e = r.trim().toLowerCase();
      if (e && (h === e || h.endsWith("." + e)) && e.length > bl) { best = p; bl = e.length; }
    }
    return best;
  };
  const m = match(host);
  if (m) {
    status.textContent = "This site files into:";
    list.innerHTML = `<div class="proj"><b>${m.name}</b>
      <a href="https://apatel85.github.io/Dashboards/${m.dir || m.slug}/" target="_blank">Open dashboard ↗</a></div>`;
  } else {
    status.textContent = "No project matches this site yet.";
    list.innerHTML = `<div id="nomatch">Add <b>${host}</b> to a project in Settings, then reload the page.</div>`;
  }

  document.getElementById("flag").addEventListener("click", async () => {
    if (!m) { status.textContent = "Add this site to a project in Settings first."; return; }
    await chrome.tabs.sendMessage(tab.id, { type: "openForm" }).catch(() => {
      status.textContent = "Reload the page, then try again.";
    });
    window.close();
  });
  document.getElementById("settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
})();
