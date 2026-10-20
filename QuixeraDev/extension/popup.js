/* QA Capture v2 — popup */
(async function () {
  const status = document.getElementById("status");
  const list = document.getElementById("list");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab && tab.url ? new URL(tab.url).hostname : "";

  const resp = await chrome.runtime.sendMessage({ type: "listProjects" });
  const projects = (resp && resp.projects) || [];

  // v3.9 onboarding: no token yet → welcome state asking for theirs
  if (!resp || !resp.hasToken) {
    status.textContent = "👋 Welcome to QA Capture";
    list.innerHTML = `<div id="nomatch">To file bugs into the team dashboard, add <b>your own GitHub token</b> — it takes about 2 minutes, your name goes on everything you file, and the token stays only on this device.</div>`;
    document.getElementById("flag").style.display = "none";
    const st = document.getElementById("settings");
    st.textContent = "🔑 Add my GitHub token";
    st.addEventListener("click", () => chrome.runtime.openOptionsPage());
    return;
  }
  const setup = await chrome.runtime.sendMessage({ type: "setupState" }).catch(() => null);
  const who = setup && setup.login ? `<p class="sub" style="margin:8px 0 0">Signed in as @${setup.login}</p>` : "";

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
      <a href="https://apatel85.github.io/Dashboards/${m.dir || m.slug}/" target="_blank">Open dashboard ↗</a></div>` + who;
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
