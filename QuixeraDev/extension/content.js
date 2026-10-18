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
    else if (msg.type === "clipReady") { clip = { secs: msg.secs, kb: msg.kb }; renderClip(); resetRecUI(); updateMinibar(); }
    else if (msg.type === "clipRecording") { recStartedUI(); }
    else if (msg.type === "clipStopped") { resetRecUI(); }
    else if (msg.type === "clipError") { resetRecUI(); setStatus("❌ " + (msg.error || "recording failed")); }
  });

  function labelFor(el) {
    if (!el || el === document.body) return "(page background)";
    const t = (el.innerText || el.value || el.getAttribute("aria-label") ||
               el.getAttribute("placeholder") || el.tagName || "").trim().replace(/\s+/g, " ");
    return (el.tagName.toLowerCase() + ': "' + t.slice(0, 70) + '"');
  }

  function activate() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("#qa-overlay,#qa-flag-btn,#qa-minibar")) return;
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

  // v3.2: Snipping-Tool-style capture. Tapping capture/record minimizes the form
  // into a small floating bar, so screenshots come out clean (no overlay) and
  // the page stays usable while framing the shot.
  let capturing = false;
  function setStatus(t) {
    const s = $("qa-status"); if (s) s.textContent = t;
    const m = $("qa-mb-status"); if (m) m.textContent = t;
  }
  function doCapture(onDone) {
    if (capturing) { if (onDone) onDone(false); return; }
    capturing = true;
    setStatus("Capturing…");
    chrome.runtime.sendMessage({ type: "captureShot" }, (r) => {
      capturing = false;
      if (r && r.ok) {
        setStatus(""); refreshShots(); updateMinibar();
        if (onDone) onDone(true);
      } else if (r && r.error && /exceeds/i.test(r.error)) {
        setStatus("Capture is busy — retrying…");
        setTimeout(() => doCapture(onDone), 1500);
      } else {
        setStatus("❌ " + ((r && r.error) || "capture failed"));
        if (onDone) onDone(false);
      }
    });
  }

  // v3.3: in-place clip recording. ⏺ toggles start/stop; the tab picker is
  // Chrome's own UI, then recording runs in the minibar — no extra tab.
  let recording = false, recTimer = null, recT0 = 0;
  function fmtClock(s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }
  function recStartedUI() {
    recording = true; recT0 = Date.now();
    const rb = $("qa-mb-rec");
    if (rb) { rb.classList.add("live"); rb.textContent = "⏹"; rb.title = "Stop recording"; }
    if (recTimer) clearInterval(recTimer);
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recT0) / 1000);
      setStatus("● " + fmtClock(s));
      if (s >= 60) stopRec();
    }, 500);
    setStatus("● 0:00");
  }
  function resetRecUI() {
    recording = false;
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    const rb = $("qa-mb-rec");
    if (rb) { rb.classList.remove("live"); rb.textContent = "⏺"; rb.title = "Record a clip (up to 60s)"; }
  }
  function startRec() {
    setStatus("Pick the tab in the dialog…");
    chrome.runtime.sendMessage({ type: "startRecord" }, (r) => {
      if (r && !r.ok) setStatus("❌ " + (r.error || "could not start recording"));
    });
  }
  function stopRec() {
    if (!recording) return;
    setStatus("Finishing…");
    chrome.runtime.sendMessage({ type: "stopRecord" });
  }
  function inCaptureMode() { return !!$("qa-minibar"); }
  function enterCaptureMode() {
    if (inCaptureMode()) return;
    const ov = $("qa-overlay"), flag = $("qa-flag-btn");
    if (ov) ov.style.display = "none";
    if (flag) flag.style.display = "none";
    const bar = document.createElement("div");
    bar.id = "qa-minibar";
    bar.innerHTML =
      '<span class="qa-mb-title">QA</span>' +
      '<button id="qa-mb-shot" title="Capture screenshot">📷</button>' +
      '<button id="qa-mb-rec" title="Record a clip (up to 60s)">⏺</button>' +
      '<button id="qa-mb-x" title="Back to the form">✕</button>' +
      '<span id="qa-mb-status"></span>';
    document.body.appendChild(bar);
    updateMinibar();
    $("qa-mb-shot").addEventListener("click", (e) => { e.stopPropagation(); doCapture(); });
    $("qa-mb-rec").addEventListener("click", (e) => {
      e.stopPropagation();
      if (recording) stopRec(); else startRec();
    });
    $("qa-mb-x").addEventListener("click", (e) => { e.stopPropagation(); exitCaptureMode(); });
    document.addEventListener("keydown", mbEscKey, true);
  }
  function mbEscKey(e) {
    if (e.key === "Escape" && inCaptureMode()) { e.stopPropagation(); exitCaptureMode(); }
  }
  function exitCaptureMode() {
    const bar = $("qa-minibar");
    if (!bar) return;
    if (recording) stopRec();
    resetRecUI();
    bar.remove();
    document.removeEventListener("keydown", mbEscKey, true);
    const ov = $("qa-overlay"), flag = $("qa-flag-btn");
    if (ov) ov.style.display = "";
    if (flag) flag.style.display = "";
    refreshShots();
  }
  function updateMinibar() {
    if (!inCaptureMode()) return;
    chrome.runtime.sendMessage({ type: "getPending" }, (r) => {
      if (chrome.runtime.lastError || !r || !inCaptureMode()) return;
      const t = [];
      if (r.shots) t.push("📷 " + r.shots);
      if (r.clip) t.push("🎬 " + r.clip.secs + "s");
      const st = $("qa-mb-status");
      if (st && !capturing) st.textContent = t.join(" · ");
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
    $("qa-addshot").addEventListener("click", () => enterCaptureMode());
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
        <span class="qa-hint">Minimizes into a small bar — capture or record, then ✕ to return.</span>`;
      $("qa-rec").addEventListener("click", () => enterCaptureMode());
    }
  }

  function openForm() {
    if ($("qa-overlay")) return;
    // fresh filing state, then auto-capture a clean first screenshot
    // (overlay hidden so the form doesn't appear in its own screenshot)
    chrome.runtime.sendMessage({ type: "resetPending" }, () => {
      const ov0 = $("qa-overlay");
      if (ov0) ov0.style.display = "none";
      doCapture(() => { if (ov0) ov0.style.display = ""; });
    });
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
    }
    #qa-minibar{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:2147483647;
      display:flex;align-items:center;gap:6px;background:#1f2937;color:#fff;border-radius:999px;
      padding:8px 14px;box-shadow:0 6px 20px rgba(0,0,0,.45);
      font-family:system-ui,-apple-system,sans-serif}
    #qa-minibar button{width:44px;height:44px;border-radius:50%;border:none;background:#374151;color:#fff;
      font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
    #qa-minibar button:active{background:#4b5563}
    #qa-mb-x{font-size:16px}
    #qa-mb-rec.live{background:#c0392b;animation:qapulse 1.2s infinite}
    @keyframes qapulse{50%{opacity:.55}}
    .qa-mb-title{font-size:12px;font-weight:800;letter-spacing:.5px;color:#9ca3af;padding:0 4px}
    #qa-mb-status{font-size:12px;color:#d1d5db;max-width:200px;white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.documentElement.appendChild(style);
})();
