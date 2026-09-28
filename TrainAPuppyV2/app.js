// TrainAPuppy V2 — Dashboard Logic
// Fixes vs V1: local-timezone dates, conflict-safe sync w/ auto-push+pull,
// curriculum/progress reconciliation, XSS-safe notes, undo, weighted progress,
// true training-day streak, session timer, SW cache cleanup.
const LS_PROGRESS = 'tap2_progress_v1';
const LS_GH = 'tap2_gh_settings_v1';

let curriculum = null;
let progress = null;
let undoSnapshots = {};   // in-memory: exercise id -> snapshot before last log
let pushTimer = null;

// ---------- dates (local timezone, not UTC) ----------
function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local tz
}
function nowISO() { return new Date().toISOString(); }
function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  const da = new Date(pa[0], pa[1]-1, pa[2]), db = new Date(pb[0], pb[1]-1, pb[2]);
  return Math.round((db - da) / 86400000);
}

// ---------- html escaping ----------
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- progress model ----------
function defaultExercise() {
  return { status: 'not_started', lastPracticed: null, streak: 0,
           successCount: 0, attemptCount: 0, notes: '', updatedAt: null };
}
function defaultProgress() {
  const p = { meta: { puppy: curriculum.puppy, createdAt: todayStr(), updatedAt: nowISO(), activeDays: [] },
              currentWeek: 1, exercises: {} };
  curriculum.weeks.forEach(w => w.exercises.forEach(ex => { p.exercises[ex.id] = defaultExercise(); }));
  return p;
}
// Reconcile: add defaults for any curriculum exercise missing from progress
// (survives curriculum edits without crashing).
function reconcileProgress() {
  let changed = false;
  curriculum.weeks.forEach(w => w.exercises.forEach(ex => {
    if (!progress.exercises[ex.id]) { progress.exercises[ex.id] = defaultExercise(); changed = true; }
  }));
  if (!Array.isArray(progress.meta.activeDays)) { progress.meta.activeDays = []; changed = true; }
  return changed;
}
function loadLocalProgress() {
  const raw = localStorage.getItem(LS_PROGRESS);
  if (raw) { try { progress = JSON.parse(raw); } catch(e) { progress = null; } }
  if (!progress || !progress.exercises) progress = defaultProgress();
  if (reconcileProgress()) saveLocalProgress();
}
function saveLocalProgress() {
  localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
}
function touchExercise(id) {
  const t = nowISO();
  progress.exercises[id].updatedAt = t;
  progress.meta.updatedAt = t;
}

// ---------- GitHub sync (conflict-safe) ----------
function getGhSettings() {
  const raw = localStorage.getItem(LS_GH);
  if (raw) { try { return JSON.parse(raw); } catch(e) {} }
  return { owner: 'apatel85', repo: 'Dashboards', path: 'TrainAPuppyV2/progress.json', branch: 'main', token: '' };
}
function saveGhSettings(s) { localStorage.setItem(LS_GH, JSON.stringify(s)); }
function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64ToUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }
function ghHeaders() {
  const s = getGhSettings();
  return { Authorization: `Bearer ${s.token}`, 'Accept': 'application/vnd.github+json' };
}
// Merge: per-exercise, newer updatedAt wins. Never silently clobbers.
function mergeProgress(localP, cloudP) {
  const merged = JSON.parse(JSON.stringify(localP));
  merged.exercises = merged.exercises || {};
  Object.keys(cloudP.exercises || {}).forEach(id => {
    const l = merged.exercises[id], c = cloudP.exercises[id];
    if (!l) { merged.exercises[id] = c; return; }
    const lt = l.updatedAt || '', ct = c.updatedAt || '';
    if (ct > lt) merged.exercises[id] = c;
  });
  const days = new Set([...(merged.meta.activeDays || []), ...((cloudP.meta || {}).activeDays || [])]);
  merged.meta.activeDays = Array.from(days).sort();
  const lmt = merged.meta.updatedAt || '', cmt = (cloudP.meta || {}).updatedAt || '';
  if (cmt > lmt) {
    merged.meta.updatedAt = cloudP.meta.updatedAt;
    if (cloudP.currentWeek) merged.currentWeek = cloudP.currentWeek;
  }
  return merged;
}
async function ghPull(silent) {
  const s = getGhSettings();
  if (!s.token) { if (!silent) alert('Add your GitHub token in Settings first.'); return false; }
  if (!silent) setSyncStatus('Syncing...');
  try {
    const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${s.path}?ref=${s.branch}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (res.status === 404) { if (!silent) setSyncStatus('No cloud file yet — will create on first push'); return false; }
    if (!res.ok) throw new Error('Pull failed: ' + res.status);
    const data = await res.json();
    const cloudProgress = JSON.parse(b64ToUtf8(data.content));
    s._sha = data.sha; saveGhSettings(s);
    progress = mergeProgress(progress, cloudP_fix(cloudProgress));
    reconcileProgress();
    saveLocalProgress(); render();
    setSyncStatus('Synced ✓ ' + new Date().toLocaleTimeString());
    document.getElementById('lastSyncedText').textContent = 'Last pulled: ' + new Date().toLocaleString();
    return true;
  } catch (e) {
    if (!silent) { setSyncStatus('Sync error'); alert('Could not pull from GitHub: ' + e.message); }
    return false;
  }
}
// Back-compat: cloud files written by V1 lack updatedAt/activeDays.
function cloudP_fix(cp) {
  cp.meta = cp.meta || {};
  if (!Array.isArray(cp.meta.activeDays)) cp.meta.activeDays = [];
  Object.values(cp.exercises || {}).forEach(e => { if (!('updatedAt' in e)) e.updatedAt = null; });
  return cp;
}
function schedulePush() {
  const s = getGhSettings();
  if (!s.token) return;
  setSyncStatus('Saving… will auto-push');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => ghPush(true), 4000);
}
async function ghPush(silent) {
  const s = getGhSettings();
  if (!s.token) { if (!silent) alert('Add your GitHub token in Settings first.'); return; }
  if (!silent) setSyncStatus('Syncing...');
  try {
    progress.meta.updatedAt = nowISO();
    progress.meta.lastSynced = nowISO();
    const getUrl = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${s.path}?ref=${s.branch}`;
    let sha = s._sha;
    const getRes = await fetch(getUrl, { headers: ghHeaders() });
    if (getRes.ok) {
      const d = await getRes.json(); sha = d.sha;
      // Merge before push so we never overwrite someone else's newer change.
      const cloudP = cloudP_fix(JSON.parse(b64ToUtf8(d.content)));
      progress = mergeProgress(progress, cloudP);
      reconcileProgress(); saveLocalProgress(); render();
    }
    const putUrl = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${s.path}`;
    const body = { message: `Update Simba training progress ${todayStr()} (V2)`,
                   content: utf8ToB64(JSON.stringify(progress, null, 2)), branch: s.branch };
    if (sha) body.sha = sha;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: Object.assign(ghHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    if (!putRes.ok) { const err = await putRes.json().catch(()=>({})); throw new Error(err.message || putRes.status); }
    const putData = await putRes.json();
    s._sha = putData.content.sha; saveGhSettings(s);
    saveLocalProgress();
    setSyncStatus('Synced ✓ ' + new Date().toLocaleTimeString());
    document.getElementById('lastSyncedText').textContent = 'Last pushed: ' + new Date().toLocaleString();
  } catch (e) {
    setSyncStatus('Sync error — will retry on next change');
    if (!silent) alert('Could not push to GitHub: ' + e.message);
  }
}
function setSyncStatus(text) { document.getElementById('syncStatus').textContent = text; }
function refreshAutoSyncLabel() {
  const on = !!getGhSettings().token;
  document.getElementById('autoSyncState').textContent = on ? 'on' : 'off';
}

// ---------- training actions ----------
function markActiveDay() {
  const t = todayStr();
  if (!progress.meta.activeDays.includes(t)) {
    progress.meta.activeDays.push(t);
    progress.meta.activeDays.sort();
  }
}
function logPractice(id, success) {
  undoSnapshots[id] = JSON.stringify(progress.exercises[id]); // for Undo
  const p = progress.exercises[id];
  const today = todayStr();
  if (p.lastPracticed !== today) {
    p.streak = (p.lastPracticed && daysBetween(p.lastPracticed, today) === 1) ? p.streak + 1 : 1;
  }
  p.lastPracticed = today;
  p.attemptCount += 1;
  if (success) p.successCount += 1;
  const rate = p.attemptCount ? p.successCount / p.attemptCount : 0;
  if (p.attemptCount >= 3 && rate >= 0.8) p.status = 'consistent';
  else if (p.attemptCount >= 1) p.status = 'practicing';
  markActiveDay();
  touchExercise(id);
  saveLocalProgress(); render(); schedulePush();
}
function undoLastLog(id) {
  if (!undoSnapshots[id]) return;
  progress.exercises[id] = JSON.parse(undoSnapshots[id]);
  delete undoSnapshots[id];
  touchExercise(id);
  saveLocalProgress(); render(); schedulePush();
}
function setStatus(id, status) {
  progress.exercises[id].status = status;
  touchExercise(id);
  saveLocalProgress(); render(); schedulePush();
}
let notesTimer = null;
function setNotes(id, val) {
  progress.exercises[id].notes = val;
  touchExercise(id);
  saveLocalProgress();
  clearTimeout(notesTimer);
  notesTimer = setTimeout(schedulePush, 4000);
}

// ---------- stats ----------
function computeOverallStats() {
  const all = Object.values(progress.exercises);
  const total = all.length;
  const consistent = all.filter(e => e.status === 'consistent').length;
  const practicing = all.filter(e => e.status === 'practicing').length;
  const notStarted = all.filter(e => e.status === 'not_started').length;
  // Weighted: practicing counts half — the bar moves as you work, not just at mastery.
  const pct = total ? Math.round(((consistent + 0.5 * practicing) / total) * 100) : 0;
  return { total, consistent, practicing, notStarted, pct, dayStreak: trainingDayStreak() };
}
function trainingDayStreak() {
  const days = new Set(progress.meta.activeDays || []);
  if (!days.size) return 0;
  let streak = 0;
  let d = new Date();
  if (!days.has(d.toLocaleDateString('en-CA'))) d.setDate(d.getDate() - 1); // allow today missing
  while (days.has(d.toLocaleDateString('en-CA'))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

// ---------- session timer ----------
let timerState = { remaining: 600, total: 600, interval: null };
function fmtTime(s) {
  return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
}
function renderTimer() {
  const el = document.getElementById('timerDisplay');
  el.textContent = fmtTime(timerState.remaining);
  el.classList.toggle('low', timerState.remaining <= 60 && timerState.remaining > 0);
  document.getElementById('timerStartBtn').disabled = !!timerState.interval;
  document.getElementById('timerPauseBtn').disabled = !timerState.interval;
}
function timerTick() {
  timerState.remaining--;
  if (timerState.remaining <= 0) {
    timerState.remaining = 0;
    clearInterval(timerState.interval); timerState.interval = null;
    document.getElementById('timerDone').classList.remove('hidden');
    try { navigator.vibrate && navigator.vibrate([200,100,200]); } catch(e) {}
  }
  renderTimer();
}
function initTimer() {
  const lenSel = document.getElementById('timerLength');
  const reset = () => {
    clearInterval(timerState.interval); timerState.interval = null;
    timerState.total = parseInt(lenSel.value); timerState.remaining = timerState.total;
    document.getElementById('timerDone').classList.add('hidden');
    renderTimer();
  };
  lenSel.addEventListener('change', reset);
  document.getElementById('timerStartBtn').addEventListener('click', () => {
    if (timerState.interval) return;
    document.getElementById('timerDone').classList.add('hidden');
    timerState.interval = setInterval(timerTick, 1000);
    renderTimer();
  });
  document.getElementById('timerPauseBtn').addEventListener('click', () => {
    clearInterval(timerState.interval); timerState.interval = null; renderTimer();
  });
  document.getElementById('timerResetBtn').addEventListener('click', reset);
  reset();
}

// ---------- rendering ----------
function currentTimeSlotInfo() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const slots = [
    { id: 'morning', start: 7*60+55, end: 8*60+45 },
    { id: 'midday', start: 12*60+10, end: 13*60+15 },
    { id: 'afternoon', start: 16*60, end: 17*60+15 },
    { id: 'evening', start: 19*60+25, end: 20*60+15 }
  ];
  let active = slots.find(s => mins >= s.start && mins <= s.end);
  let next = slots.find(s => s.start > mins) || slots[0];
  return { activeId: active ? active.id : null, nextId: next.id };
}
function render() { renderToday(); renderOverview(); renderIdealTimes(); renderWeekSelect(); renderWeeks(); }
function renderToday() {
  const container = document.getElementById('todayContent');
  container.innerHTML = '';
  const { activeId, nextId } = currentTimeSlotInfo();
  const week = curriculum.weeks.find(w => w.week === progress.currentWeek);
  const seen = new Set();
  [activeId, nextId].filter(Boolean).forEach(slotId => {
    if (seen.has(slotId)) return; seen.add(slotId);
    const slot = curriculum.idealTimes.find(t => t.id === slotId);
    if (!slot) return;
    const card = document.createElement('div');
    card.className = 'todayCard' + (slotId === activeId ? '' : ' next');
    const label = slotId === activeId ? `NOW: ${escapeHtml(slot.label)}` : `NEXT: ${escapeHtml(slot.label)}`;
    let exHtml;
    if (week && week.suggestedSlot === slotId) {
      exHtml = '<div class="exList">Focus (Week ' + week.week + '): ' + week.exercises.map(e => escapeHtml(e.name)).join(', ') + '</div>';
    } else {
      exHtml = '<div class="exList">Good for: ' + slot.bestFor.map(escapeHtml).join(', ') + '</div>';
    }
    card.innerHTML = `<div class="label">${label}</div><div class="window">${escapeHtml(slot.window)}</div>${exHtml}`;
    container.appendChild(card);
  });
  if (!container.innerHTML) {
    container.innerHTML = '<div class="todayCard">No active window right now — check Ideal Training Times below.</div>';
  }
}
function renderOverview() {
  const stats = computeOverallStats();
  document.getElementById('overallBar').style.width = stats.pct + '%';
  document.getElementById('overallPct').textContent = stats.pct + '%';
  document.getElementById('streakCount').textContent = stats.dayStreak;
  document.getElementById('consistentCount').textContent = stats.consistent;
  document.getElementById('practicingCount').textContent = stats.practicing;
  document.getElementById('notStartedCount').textContent = stats.notStarted;
}
function renderIdealTimes() {
  document.getElementById('idealTimes').innerHTML = curriculum.idealTimes.map(t => `
    <div class="timeCard">
      <div class="label">${escapeHtml(t.label)}</div>
      <div class="window">${escapeHtml(t.window)}</div>
      <div class="bestFor"><b>Best for:</b> ${t.bestFor.map(escapeHtml).join(', ')}</div>
      <div class="why">${escapeHtml(t.why)}</div>
    </div>`).join('');
  document.getElementById('generalTips').innerHTML = curriculum.generalTips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
}
function renderWeekSelect() {
  const sel = document.getElementById('currentWeekSelect');
  if (sel.options.length === 0) {
    sel.innerHTML = curriculum.weeks.map(w => `<option value="${w.week}">Week ${w.week}: ${escapeHtml(w.title)}</option>`).join('');
  }
  sel.value = progress.currentWeek;
}
let openWeeks = new Set([1]);
function weekStats(week) {
  const ids = week.exercises.map(e => e.id);
  const score = ids.reduce((s, id) => {
    const st = (progress.exercises[id] || {}).status;
    return s + (st === 'consistent' ? 1 : st === 'practicing' ? 0.5 : 0);
  }, 0);
  return { total: ids.length, pct: ids.length ? Math.round((score/ids.length)*100) : 0,
           done: ids.filter(id => (progress.exercises[id] || {}).status === 'consistent').length };
}
function renderWeeks() {
  const container = document.getElementById('weeksContainer');
  container.innerHTML = '';
  curriculum.weeks.forEach(week => {
    const stats = weekStats(week);
    const card = document.createElement('div');
    card.className = 'weekCard';
    const isOpen = openWeeks.has(week.week);
    const header = document.createElement('div');
    header.className = 'weekCardHeader';
    header.innerHTML = `
      <div>
        <div class="title">Week ${week.week}: ${escapeHtml(week.title)}</div>
        <div class="meta">${stats.done}/${stats.total} consistent · suggested slot: ${escapeHtml(week.suggestedSlot)}</div>
      </div>
      <div class="weekBarOuter"><div class="weekBarInner" style="width:${stats.pct}%"></div></div>`;
    header.addEventListener('click', () => {
      if (openWeeks.has(week.week)) openWeeks.delete(week.week); else openWeeks.add(week.week);
      renderWeeks();
    });
    const body = document.createElement('div');
    body.className = 'weekCardBody' + (isOpen ? ' open' : '');
    body.innerHTML = week.exercises.map(ex => renderExerciseRow(ex)).join('');
    card.appendChild(header); card.appendChild(body);
    container.appendChild(card);
  });
  container.querySelectorAll('.statusSelect').forEach(sel => {
    sel.addEventListener('change', (e) => setStatus(e.target.dataset.id, e.target.value));
  });
  container.querySelectorAll('.logSuccessBtn').forEach(btn => {
    btn.addEventListener('click', (e) => logPractice(e.target.dataset.id, true));
  });
  container.querySelectorAll('.logAttemptBtn').forEach(btn => {
    btn.addEventListener('click', (e) => logPractice(e.target.dataset.id, false));
  });
  container.querySelectorAll('.undoBtn').forEach(btn => {
    btn.addEventListener('click', (e) => undoLastLog(e.target.dataset.id));
  });
  container.querySelectorAll('.notesInput').forEach(inp => {
    inp.addEventListener('input', (e) => setNotes(e.target.dataset.id, e.target.value));
  });
}
function renderExerciseRow(ex) {
  const p = progress.exercises[ex.id] || defaultExercise();
  const lastText = p.lastPracticed ? `Last practiced: ${escapeHtml(p.lastPracticed)} · Streak: ${p.streak}d` : 'Not practiced yet';
  const rate = p.attemptCount ? Math.round((p.successCount/p.attemptCount)*100) : 0;
  const undoHtml = undoSnapshots[ex.id] ? `<button class="undoBtn" data-id="${ex.id}">↩ Undo</button>` : '';
  return `
    <div class="exRow">
      <div class="exName">${escapeHtml(ex.name)} <span class="status-${p.status}">(${p.status.replace('_',' ')})</span></div>
      <div class="exGoal">${escapeHtml(ex.goal)}</div>
      <div class="exDetail"><b>Steps:</b> ${escapeHtml(ex.steps)}</div>
      <div class="exDetail"><b>Reward timing:</b> ${escapeHtml(ex.rewardTiming)}</div>
      <div class="exDetail"><b>Avoid:</b> ${escapeHtml(ex.mistake)}</div>
      <div class="exControls">
        <select class="statusSelect" data-id="${ex.id}">
          <option value="not_started" ${p.status==='not_started'?'selected':''}>Not started</option>
          <option value="practicing" ${p.status==='practicing'?'selected':''}>Practicing</option>
          <option value="consistent" ${p.status==='consistent'?'selected':''}>Consistent</option>
        </select>
        <button class="logBtn logSuccessBtn" data-id="${ex.id}">✓ Log Success</button>
        <button class="logBtn attempt logAttemptBtn" data-id="${ex.id}">Log Attempt</button>
        ${undoHtml}
        <span class="exMeta">${lastText} · ${rate}% success (${p.attemptCount} tries)</span>
      </div>
      <input class="notesInput" data-id="${ex.id}" placeholder="Notes..." value="${escapeHtml(p.notes)}">
    </div>`;
}

// ---------- settings ----------
function initSettingsModal() {
  const s = getGhSettings();
  document.getElementById('ghOwner').value = s.owner;
  document.getElementById('ghRepo').value = s.repo;
  document.getElementById('ghPath').value = s.path;
  document.getElementById('ghBranch').value = s.branch;
  document.getElementById('ghToken').value = s.token || '';
  refreshAutoSyncLabel();
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('hidden');
  });
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.getElementById('saveTokenBtn').addEventListener('click', async () => {
    const ns = {
      owner: document.getElementById('ghOwner').value.trim(),
      repo: document.getElementById('ghRepo').value.trim(),
      path: document.getElementById('ghPath').value.trim(),
      branch: document.getElementById('ghBranch').value.trim(),
      token: document.getElementById('ghToken').value.trim()
    };
    saveGhSettings(ns);
    refreshAutoSyncLabel();
    setSyncStatus(ns.token ? 'Connected — pulling…' : 'Local only');
    if (ns.token) await ghPull(false);
  });
  document.getElementById('pullBtn').addEventListener('click', () => ghPull(false));
  document.getElementById('pushBtn').addEventListener('click', () => ghPush(false));
}

// ---------- init ----------
async function init() {
  const res = await fetch('curriculum.json');
  curriculum = await res.json();
  loadLocalProgress();
  openWeeks = new Set([progress.currentWeek]);
  document.getElementById('currentWeekSelect').addEventListener('change', (e) => {
    progress.currentWeek = parseInt(e.target.value);
    progress.meta.updatedAt = nowISO();
    saveLocalProgress(); render(); schedulePush();
  });
  initSettingsModal();
  initTimer();
  render();
  const s = getGhSettings();
  if (s.token) {
    setSyncStatus('Connected — pulling latest…');
    refreshAutoSyncLabel();
    await ghPull(true); // silent auto-pull on load; merge keeps local work safe
    setSyncStatus('Auto-sync on ✓');
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
}
init();
