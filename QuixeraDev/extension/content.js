/* QA Capture v3 — content script. Click-trail recording, flag button, and the
   v3 issue form: issue-type presets, multi-screenshot capture + annotate,
   clip recording. Touch-friendly. */
(function () {
  if (window.__qaCaptureV3) return;
  window.__qaCaptureV3 = true;

  const ISSUE_TYPES = [
    "Broken link",
    "Button not working",
    "Page not loading / blank page",
    "Miscount between summary and detail",
    "Wrong data displayed",
    "Missing validation",
    "UI / layout issue",
    "Slow performance",
    "Other"
  ];

  let project = null, allProjects = [], trail = [];
  let shots = [];   // [{index, kb}]
  let clip = null;  // {secs, kb}

  chrome.runtime.sendMessage({ type: "matchProject", host: location.hostname }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp && resp.project) {
      project = resp.project;
      allProjects = resp.projects || [];
      activate();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "openForm") openForm();
    else if (msg.type === "shotsUpdated") refreshShots();
    else if (msg.type === "clipReady") { clip = { secs: msg.secs, kb: msg.kb }; renderClip(); }
  });

  function labelFor(el) {
    if (!el || el === document.body) return "(page background)";
    const t = (el.innerText || el.value || el.getAttribute("aria-label") ||
               el.getAttribute("placeholder") || el.tagName || "").trim().replace(/\s+/g, " ");
    return (el.tagName.toLowerCase() + ': "' + t.slice(0, 70) + '"');
  }

  function activate() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("#qa-overlay,#qa-flag-btn")) return;
      const el = e.target.closest("button, a, input, select, textarea, [role=button], [onclick]");
      trail.push({ step: trail.length + 1, page: location.pathname + location.search,
                   clicked: labelFor(el || e.target) });
      if (trail.length > 300) trail.shift();
    }, true);
    injectButton();
  }

  function injectButton() {
    if (document.getElementById("qa-flag-btn")) return;
    const btn = document.createElement("button");
    btn.id = "qa-flag-btn";
    btn.textContent = "🚩";
    btn.title = "Flag an issue (QA Capture)";
    Object.assign(btn.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: 2147483647,
      width: "60px", height: "60px", borderRadius: "50%", fontSize: "28px",
      background: "#c0392b", border: "3px solid #fff", cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,.35)", padding: "0"
    });
    btn.addEventListener("click", (e) => { e.stopPropagation(); openForm(); });
    document.body.appendChild(btn);
  }

  function esc(s) { return String(s || "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  const $ = (id) => document.getElementById(id);

  function refreshShots() {
    chrome.runtime.sendMessage({ type: "getPending" }, (r) => {
      if (chrome.runtime.lastError || !r) return;
      shots = Array.from({ length: r.shots }, (_, i) => ({ index: i }));
      if (r.clip) clip = r.clip;
      renderShots(); renderClip();
    });
  }

  // v3.1.1: single-flight capture with quota retry. The form auto-captures on
  // open, so a quick manual tap used to fire a second capture inside Chrome's
  // quota window ("This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
  // quota") while the first failure stayed invisible.
  let capturing = false;
  function doCapture() {
    if (capturing) return;
    capturing = true;
    const btn = $("qa-addshot");
    if (btn) btn.disabled = true;
    $("qa-status").textContent = "Capturing…";
    chrome.runtime.sendMessage({ type: "captureShot" }, (r) => {
      capturing = false;
      const btn2 = $("qa-addshot");
      if (btn2) btn2.disabled = false;
      if (r && r.ok) { $("qa-status").textContent = ""; refreshShots(); }
      else if (r && r.error && /exceeds/i.test(r.error)) {
        $("qa-status").textContent = "Capture is busy — retrying…";
        setTimeout(doCapture, 1500);
      }
      else $("qa-status").textContent = "❌ " + ((r && r.error) || "capture failed");
    });
  }

  function renderShots() {
    const wrap = $("qa-shots");
    if (!wrap) return;
    wrap.innerHTML = shots.map((s, n) =>
      `<span class="qa-chip">📷 ${n + 1}
         <button data-a="${n}" title="Annotate">✏️</button><button data-x="${n}" title="Remove">✕</button>
       </span>`).join("") +
      `<button id="qa-addshot" type="button">＋ Capture screen</button>`;
    wrap.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "annotateShot", index: Number(b.dataset.a) });
    }));
    wrap.querySelectorAll("[data-x]").forEach(b => b.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "removeShot", index: Number(b.dataset.x) }, refreshShots);
    }));
    $("qa-addshot").addEventListener("click", doCapture);
  }

  function renderClip() {
    const wrap = $("qa-clip");
    if (!wrap) return;
    if (clip) {
      wrap.innerHTML = `<span class="qa-chip">🎬 ${clip.secs}s · ${(clip.kb / 1024).toFixed(1)} MB
        <button id="qa-clipx" title="Remove clip">✕</button></span>`;
      $("qa-clipx").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "discardClip" }, () => { clip = null; renderClip(); });
      });
    } else {
      wrap.innerHTML = `<button id="qa-rec" type="button">⏺ Record a clip (up to 60s)</button>
        <span class="qa-hint">Opens a recorder tab — do the steps there, then Stop.</span>`;
      $("qa-rec").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "startRecord" });
        wrap.innerHTML = `<span class="qa-chip rec">● Recording… finish in the recorder tab, then come back here.</span>`;
      });
    }
  }

  function openForm() {
    if ($("qa-overlay")) return;
    // fresh filing state, then auto-capture first screenshot (errors shown, not swallowed)
    chrome.runtime.sendMessage({ type: "resetPending" }, () => { doCapture(); });
    trail = trail.slice(); // keep trail across filings in this page
    const projOpts = allProjects.map(p =>
      `<option value="${esc(p.id)}" ${p.id === project.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    const typeOpts = ISSUE_TYPES.map(t => `<option>${esc(t)}</option>`).join("");
    const ov = document.createElement("div");
    ov.id = "qa-overlay";
    ov.innerHTML = `
      <div id="qa-card">
        <h2>🚩 Flag an issue</h2>
        <label>Dashboard project <select id="qa-project">${projOpts}</select></label>
        <label>Issue type <select id="qa-type">${typeOpts}</select></label>
        <label>Title <input id="qa-title" placeholder="e.g. Save button does nothing"></label>
        <div id="qa-dup"></div>
        <label>Severity <select id="qa-sev"><option>High</option><option selected>Medium</option><option>Low</option></select></label>
        <div class="qa-sec"><b>Screenshots</b><div id="qa-shots"></div></div>
        <div class="qa-sec"><b>Clip</b><div id="qa-clip"></div></div>
        <label>What did you expect? <textarea id="qa-exp" rows="2"></textarea></label>
        <label>What actually happened? <textarea id="qa-act" rows="2"></textarea></label>
        <p class="qa-hint">Click trail (${trail.length} steps) + page URL attach automatically.</p>
        <div class="qa-actions"><button id="qa-cancel">Cancel</button><button id="qa-send">Capture &amp; send</button></div>
        <p id="qa-status"></p>
      </div>`;
    document.body.appendChild(ov);
    const st = $("qa-status");
    renderShots(); renderClip();
    $("qa-type").addEventListener("change", (e) => {
      if (e.target.value !== "Other" && !$("qa-title").value.trim())
        $("qa-title").value = "[" + e.target.value + "] ";
      scheduleDupCheck();
    });
    let dupTimer = null;
    function scheduleDupCheck() {
      clearTimeout(dupTimer);
      dupTimer = setTimeout(() => {
        const t = $("qa-title").value.trim();
        if (t.length < 9) { $("qa-dup").innerHTML = ""; return; }
        chrome.runtime.sendMessage({ type: "checkDup",
          projectId: $("qa-project").value, title: t,
          issue_type: $("qa-type").value,
          page: location.pathname + location.search }, (r) => {
          const box = $("qa-dup");
          if (r && r.hit) {
            box.innerHTML = `<div class="qa-dupwarn">⚠️ Possible duplicate of <b>${esc(r.hit.id)}</b> — “${esc(r.hit.title)}” (already covered by ${esc(r.hit.src)}). You can still file below.</div>`;
          } else box.innerHTML = "";
        });
      }, 700);
    }
    $("qa-title").addEventListener("input", scheduleDupCheck);
    $("qa-cancel").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "resetPending" });
      ov.remove();
    });
    ov.addEventListener("click", (e) => { if (e.target === ov) { chrome.runtime.sendMessage({ type: "resetPending" }); ov.remove(); } });
    $("qa-send").addEventListener("click", () => {
      const title = $("qa-title").value.trim();
      if (!title) { st.textContent = "Please add a title."; return; }
      if (!shots.length && !st.dataset.noshotok) {
        st.textContent = "⚠️ No screenshots attached. Tap “Capture screen” above, or press Capture & send again to file without one.";
        st.dataset.noshotok = "1";
        return;
      }
      delete st.dataset.noshotok;
      st.textContent = "Filing… (uploading screenshots" + (clip ? " + clip" : "") + ")";
      chrome.runtime.sendMessage({
        type: "fileBug",
        projectId: $("qa-project").value,
        bug: {
          title, issue_type: $("qa-type").value,
          severity: $("qa-sev").value,
          expected: $("qa-exp").value.trim(), actual: $("qa-act").value.trim(),
          page: location.pathname + location.search, url: location.href,
          trail: trail.slice()
        }
      }, (resp) => {
        if (chrome.runtime.lastError) { st.textContent = "Error: " + chrome.runtime.lastError.message; return; }
        if (resp && resp.ok) {
          st.textContent = "✅ Filed as " + resp.id + " — on the dashboard shortly.";
          trail = [];
          setTimeout(() => ov.remove(), 2500);
        } else st.textContent = "❌ " + ((resp && resp.error) || "failed");
      });
    });
  }

  const css = `
    #qa-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
    #qa-card{background:#fff;border-radius:14px;padding:22px;width:470px;max-width:100%;
      max-height:94vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,.4);
      font-family:system-ui,-apple-system,sans-serif;color:#222;box-sizing:border-box}
    #qa-card h2{margin:0 0 6px;font-size:20px}
    #qa-card label{display:block;margin:10px 0;font-size:14px;font-weight:600}
    #qa-card input:not([type=checkbox]),#qa-card textarea,#qa-card select{
      display:block;width:100%;margin-top:6px;padding:12px;font-size:15px;border:1px solid #ccc;
      border-radius:8px;box-sizing:border-box;font-weight:400;font-family:inherit}
    #qa-card .qa-sec{margin:12px 0;font-size:14px}
    #qa-card .qa-sec b{display:block;margin-bottom:6px}
    #qa-shots,#qa-clip{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .qa-chip{display:inline-flex;align-items:center;gap:6px;background:#eef2f7;border-radius:20px;
      padding:8px 12px;font-size:13px;font-weight:600}
    .qa-chip button{border:none;background:none;cursor:pointer;font-size:14px;padding:2px}
    .qa-chip.rec{background:#fdecea;color:#b91c1c}
    #qa-addshot,#qa-rec{min-height:44px;padding:8px 14px;font-size:14px;border-radius:10px;
      border:1px dashed #999;background:#fafafa;cursor:pointer}
    #qa-card .qa-hint{font-size:12px;color:#777;margin:8px 0 0;font-weight:400}
    #qa-card .qa-actions{display:flex;gap:10px;margin-top:14px}
    #qa-card .qa-actions button{flex:1;min-height:48px;font-size:16px;border-radius:10px;
      border:1px solid #ccc;background:#f4f4f4;cursor:pointer}
    #qa-card #qa-send{background:#c0392b;color:#fff;border:none;font-weight:700}
    #qa-status{font-size:14px;min-height:20px;margin:10px 0 0}
    .qa-dupwarn{background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;
      padding:10px 12px;font-size:13px;margin-top:6px;color:#92400e}
    @media (max-width:520px){
      #qa-overlay{padding:0;align-items:stretch}
      #qa-card{width:100%;border-radius:0;max-height:100vh}
    }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.documentElement.appendChild(style);
})();
