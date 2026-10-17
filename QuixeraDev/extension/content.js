/* Quixera QA Capture — content script.
   Records a click trail as you test, and injects the "Flag issue" UI.
   Runs inside a shadow root so page CSS can't break it. */
(() => {
  const ROOT_ID = 'qa-capture-root';
  if (document.getElementById(ROOT_ID)) return;

  const MAX_TRAIL = 60;
  let trail = [];
  let recording = true;

  chrome.storage.local.get(['qa_recording', 'qa_trail'], (s) => {
    recording = s.qa_recording !== false;
    trail = Array.isArray(s.qa_trail) ? s.qa_trail : [];
    renderToggle();
  });
  chrome.storage.onChanged.addListener((chg, area) => {
    if (area === 'local' && chg.qa_recording) { recording = chg.qa_recording.newValue; renderToggle(); }
  });

  function describe(el) {
    if (!el || !el.tagName) return { label: '?', tag: '?' };
    const attr = (n) => (el.getAttribute ? (el.getAttribute(n) || '') : '');
    const label = (attr('aria-label') || attr('title') || attr('placeholder') || attr('value') ||
      (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70) ||
      el.tagName.toLowerCase());
    return { label, tag: el.tagName.toLowerCase() };
  }

  function cssPath(el) {
    const parts = [];
    let n = el;
    for (let i = 0; i < 4 && n && n.tagName; i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += '#' + n.id; parts.unshift(s); break; }
      const cls = (n.className && typeof n.className === 'string' ? n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      if (cls) s += '.' + cls;
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  document.addEventListener('click', (e) => {
    if (!recording) return;
    if (e.target.closest && e.target.closest('#' + ROOT_ID)) return; // ignore our own UI
    const el = (e.target.closest && e.target.closest('button, a, [role="button"], input, select, textarea, [tabindex]')) || e.target;
    const d = describe(el);
    trail.push({
      t: new Date().toISOString(),
      url: location.href,
      page: (document.title || '').slice(0, 80),
      action: 'click',
      label: d.label,
      tag: d.tag,
      selector: cssPath(el),
    });
    if (trail.length > MAX_TRAIL) trail = trail.slice(-MAX_TRAIL);
    chrome.storage.local.set({ qa_trail: trail });
    bumpBadge();
  }, true);

  function bumpBadge() {
    const b = shadow.querySelector('#qa-count');
    if (b) b.textContent = trail.length + ' steps';
  }

  // ---- floating UI (shadow DOM) ----
  const host = document.createElement('div');
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      #qa-bar { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; }
      #qa-bar button { cursor: pointer; border: 0; border-radius: 999px; padding: 9px 14px;
        font-size: 13px; font-weight: 600; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
      #qa-flag { background: #b91c1c; color: #fff; margin-right: 8px; }
      #qa-toggle { background: #1e3a5f; color: #fff; }
      #qa-count { display:block; text-align:right; color:#fff; background:rgba(0,0,0,.55);
        border-radius:6px; padding:2px 8px; margin-top:6px; font-size:11px; }
      #qa-modal-veil { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 2147483647;
        display: flex; align-items: center; justify-content: center; }
      #qa-modal { background: #fff; border-radius: 12px; padding: 20px 22px; width: 440px; max-width: 92vw;
        max-height: 88vh; overflow: auto; color: #111; }
      #qa-modal h3 { margin: 0 0 4px; font-size: 16px; }
      #qa-modal p.sub { margin: 0 0 12px; font-size: 12px; color: #666; }
      #qa-modal label { display: block; font-size: 12px; font-weight: 600; margin: 10px 0 4px; }
      #qa-modal input[type=text], #qa-modal select, #qa-modal textarea {
        width: 100%; box-sizing: border-box; border: 1px solid #ccc; border-radius: 8px;
        padding: 8px 10px; font-size: 13px; font-family: inherit; }
      #qa-modal textarea { min-height: 56px; resize: vertical; }
      #qa-modal .row { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
      #qa-modal .row button { border-radius: 8px; padding: 9px 16px; }
      #qa-send { background: #15803d; color: #fff; }
      #qa-cancel { background: #e5e7eb; color: #111; }
      #qa-status { font-size: 12px; margin-top: 10px; min-height: 16px; }
      #qa-trail-preview { font-size: 11px; color: #555; background: #f6f7f9; border-radius: 8px;
        padding: 8px 10px; margin-top: 10px; max-height: 120px; overflow: auto; }
      #qa-trail-preview div { padding: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style>
    <div id="qa-bar">
      <button id="qa-flag" title="Flag an issue (captures trail + screenshot)">🚩 Flag issue</button><button id="qa-toggle" title="Pause/resume click recording">⏺</button>
      <span id="qa-count">0 steps</span>
    </div>`;

  function renderToggle() {
    const t = shadow.querySelector('#qa-toggle');
    if (t) { t.textContent = recording ? '⏺' : '⏸'; t.title = recording ? 'Recording clicks — click to pause' : 'Paused — click to resume'; }
  }
  shadow.querySelector('#qa-toggle').addEventListener('click', () => {
    recording = !recording;
    chrome.storage.local.set({ qa_recording: recording });
    renderToggle();
  });
  shadow.querySelector('#qa-flag').addEventListener('click', openModal);
  renderToggle(); bumpBadge();

  function trailPreviewHtml() {
    const last = trail.slice(-8);
    return last.map((s, i) =>
      `<div>${trail.length - last.length + i + 1}. [${s.tag}] ${escapeHtml(s.label)} <span style="color:#999">(${escapeHtml(shortUrl(s.url))})</span></div>`
    ).join('') + (trail.length > 8 ? `<div style="color:#999">… ${trail.length - 8} earlier steps</div>` : '');
  }
  function shortUrl(u) { try { return new URL(u).pathname; } catch { return u; } }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function openModal() {
    if (shadow.querySelector('#qa-modal-veil')) return;
    const veil = document.createElement('div');
    veil.id = 'qa-modal-veil';
    veil.innerHTML = `
      <div id="qa-modal">
        <h3>🚩 Flag an issue</h3>
        <p class="sub">Captures your last ${trail.length} clicks, the page URL and a screenshot, then sends it to the QA dashboard.</p>
        <label>Title</label>
        <input type="text" id="qa-f-title" placeholder="e.g. Freeze button disabled on every row">
        <label>Severity</label>
        <select id="qa-f-sev"><option>High</option><option selected>Medium</option><option>Low</option></select>
        <label>What did you expect?</label>
        <textarea id="qa-f-exp" placeholder="e.g. Freeze should be enabled for Active memberships"></textarea>
        <label>What actually happened?</label>
        <textarea id="qa-f-act" placeholder="e.g. Freeze and Cancel are greyed out on all rows"></textarea>
        <label>Your click trail (auto-recorded)</label>
        <div id="qa-trail-preview">${trailPreviewHtml()}</div>
        <div id="qa-status"></div>
        <div class="row">
          <button id="qa-cancel">Cancel</button>
          <button id="qa-send">📸 Capture &amp; send to dashboard</button>
        </div>
      </div>`;
    shadow.appendChild(veil);
    veil.querySelector('#qa-cancel').addEventListener('click', () => veil.remove());
    veil.addEventListener('click', (e) => { if (e.target.id === 'qa-modal-veil') veil.remove(); });
    veil.querySelector('#qa-send').addEventListener('click', async () => {
      const status = veil.querySelector('#qa-status');
      const bug = {
        title: veil.querySelector('#qa-f-title').value.trim(),
        sev: veil.querySelector('#qa-f-sev').value,
        expected: veil.querySelector('#qa-f-exp').value.trim(),
        actual: veil.querySelector('#qa-f-act').value.trim(),
        url: location.href,
        trail: trail,
      };
      if (!bug.title || !bug.actual) { status.textContent = 'Please fill in at least a title and what actually happened.'; status.style.color = '#b91c1c'; return; }
      status.textContent = 'Capturing screenshot and sending…'; status.style.color = '#1e3a5f';
      try {
        const res = await chrome.runtime.sendMessage({ type: 'QA_FLAG', bug });
        if (res && res.ok) {
          status.innerHTML = `✅ Sent! <a href="${res.dashboardUrl}" target="_blank" style="color:#15803d">Open dashboard</a> (updates in ~2 min). Trail cleared.`;
          status.style.color = '#15803d';
          trail = []; chrome.storage.local.set({ qa_trail: trail }); bumpBadge();
        } else {
          status.textContent = '❌ ' + ((res && res.error) || 'send failed');
          status.style.color = '#b91c1c';
        }
      } catch (err) {
        status.textContent = '❌ ' + err.message; status.style.color = '#b91c1c';
      }
    });
  }
})();
