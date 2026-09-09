
// TrainAPuppy Dashboard Logic
const LS_PROGRESS = 'tap_progress_v1';
const LS_GH = 'tap_gh_settings_v1';

let curriculum = null;
let progress = null;

function todayStr() {
  return new Date().toISOString().slice(0,10);
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

async function loadCurriculum() {
  const res = await fetch('curriculum.json');
  curriculum = await res.json();
}

function defaultProgress() {
  const p = { meta: { puppy: curriculum.puppy, createdAt: todayStr(), lastSynced: null }, currentWeek: 1, exercises: {} };
  curriculum.weeks.forEach(w => w.exercises.forEach(ex => {
    p.exercises[ex.id] = { status: 'not_started', lastPracticed: null, streak: 0, successCount: 0, attemptCount: 0, notes: '' };
  }));
  return p;
}

function loadLocalProgress() {
  const raw = localStorage.getItem(LS_PROGRESS);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) { /* fallthrough */ }
  }
  return defaultProgress();
}

function saveLocalProgress() {
  localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
}

function getGhSettings() {
  const raw = localStorage.getItem(LS_GH);
  if (raw) { try { return JSON.parse(raw); } catch(e) {} }
  return { owner: 'apatel85', repo: 'Dashboards', path: 'TrainAPuppy/progress.json', branch: 'main', token: '' };
}
function saveGhSettings(s) { localStorage.setItem(LS_GH, JSON.stringify(s)); }

function utf8ToB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghPull() {
  const s = getGhSettings();
  if (!s.token) { alert('Add your GitHub token in Settings first.'); return; }
  setSyncStatus('Syncing...');
  try {
    const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${s.path}?ref=${s.branch}`;
    const res = await fetch(url, { headers: { Authorization: `token ${s.token}` } });
    if (res.status === 404) { setSyncStatus('No cloud file yet — push to create it'); return; }
    if (!res.ok) throw new Error('Pull failed: ' + res.status);
    const data = await res.json();
    const cloudProgress = JSON.parse(b64ToUtf8(data.content));
    s._sha = data.sha;
    saveGhSettings(s);
    progress = cloudProgress;
    saveLocalProgress();
    render();
    setSyncStatus('Synced ✓ ' + new Date().toLocaleTimeString());
    document.getElementById('lastSyncedText').textContent = 'Last pulled: ' + new Date().toLocaleString();
  } catch (e) {
    setSyncStatus('Sync error');
    alert('Could not pull from GitHub: ' + e.message);
  }
}

async function ghPush() {
  const s = getGhSettings();
  if (!s.token) { alert('Add your GitHub token in Settings first.'); return; }
  setSyncStatus('Syncing...');
  try {
    progress.meta.lastSynced = new Date().toISOString();
    const getUrl = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${s.path}?ref=${s.branch}`;
    let sha = s._sha;
    const getRes = await fetch(getUrl, { headers: { Authorization: `token ${s.token}` } });
    if (getRes.ok) { const d = await getRes.json(); sha = d.sha; }
    const putUrl = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${s.path}`;
    const body = {
      message: `Update Simba training progress ${todayStr()}`,
      content: utf8ToB64(JSON.stringify(progress, null, 2)),
      branch: s.branch
    };
    if (sha) body.sha = sha;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: { Authorization: `token ${s.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!putRes.ok) { const err = await putRes.json(); throw new Error(err.message || putRes.status); }
    const putData = await putRes.json();
    s._sha = putData.content.sha;
    saveGhSettings(s);
    saveLocalProgress();
    setSyncStatus('Synced ✓ ' + new Date().toLocaleTimeString());
    document.getElementById('lastSyncedText').textContent = 'Last pushed: ' + new Date().toLocaleString();
  } catch (e) {
    setSyncStatus('Sync error');
    alert('Could not push to GitHub: ' + e.message);
  }
}

function setSyncStatus(text) {
  document.getElementById('syncStatus').textContent = text;
}

function findExercise(id) {
  for (const w of curriculum.weeks) {
    const ex = w.exercises.find(e => e.id === id);
    if (ex) return { ex, week: w };
  }
  return null;
}

function logPractice(id, success) {
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
  saveLocalProgress();
  render();
}

function setStatus(id, status) {
  progress.exercises[id].status = status;
  saveLocalProgress();
  render();
}

function setNotes(id, val) {
  progress.exercises[id].notes = val;
  saveLocalProgress();
}

function computeOverallStats() {
  const all = Object.values(progress.exercises);
  const total = all.length;
  const consistent = all.filter(e => e.status === 'consistent').length;
  const practicing = all.filter(e => e.status === 'practicing').length;
  const notStarted = all.filter(e => e.status === 'not_started').length;
  const pct = total ? Math.round((consistent / total) * 100) : 0;
  const streaks = all.map(e => e.streak || 0);
  const bestStreak = streaks.length ? Math.max(...streaks) : 0;
  return { total, consistent, practicing, notStarted, pct, bestStreak };
}

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

function render() {
  renderToday();
  renderOverview();
  renderIdealTimes();
  renderWeekSelect();
  renderWeeks();
}

function renderToday() {
  const container = document.getElementById('todayContent');
  container.innerHTML = '';
  const { activeId, nextId } = currentTimeSlotInfo();
  const weekNum = progress.currentWeek;
  const week = curriculum.weeks.find(w => w.week === weekNum);
  const slotsToShow = [activeId, nextId].filter(Boolean);
  const seen = new Set();
  slotsToShow.forEach(slotId => {
    if (seen.has(slotId)) return;
    seen.add(slotId);
    const slot = curriculum.idealTimes.find(t => t.id === slotId);
    if (!slot) return;
    const card = document.createElement('div');
    card.className = 'todayCard' + (slotId === activeId ? '' : ' next');
    const label = slotId === activeId ? `NOW: ${slot.label}` : `NEXT: ${slot.label}`;
    let exHtml = '';
    if (week && week.suggestedSlot === slotId) {
      exHtml = '<div class="exList">Focus (Week ' + week.week + '): ' + week.exercises.map(e => e.name).join(', ') + '</div>';
    } else {
      exHtml = '<div class="exList">Good for: ' + slot.bestFor.join(', ') + '</div>';
    }
    card.innerHTML = `<div class="label">${label}</div><div class="window">${slot.window}</div>${exHtml}`;
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
  document.getElementById('streakCount').textContent = stats.bestStreak;
  document.getElementById('consistentCount').textContent = stats.consistent;
  document.getElementById('practicingCount').textContent = stats.practicing;
  document.getElementById('notStartedCount').textContent = stats.notStarted;
}

function renderIdealTimes() {
  const container = document.getElementById('idealTimes');
  container.innerHTML = curriculum.idealTimes.map(t => `
    <div class="timeCard">
      <div class="label">${t.label}</div>
      <div class="window">${t.window}</div>
      <div class="bestFor"><b>Best for:</b> ${t.bestFor.join(', ')}</div>
      <div class="why">${t.why}</div>
    </div>
  `).join('');
  document.getElementById('generalTips').innerHTML = curriculum.generalTips.map(t => `<li>${t}</li>`).join('');
}

function renderWeekSelect() {
  const sel = document.getElementById('currentWeekSelect');
  if (sel.options.length === 0) {
    sel.innerHTML = curriculum.weeks.map(w => `<option value="${w.week}">Week ${w.week}: ${w.title}</option>`).join('');
  }
  sel.value = progress.currentWeek;
}

let openWeeks = new Set([progress ? progress.currentWeek : 1]);

function weekStats(week) {
  const ids = week.exercises.map(e => e.id);
  const consistent = ids.filter(id => progress.exercises[id].status === 'consistent').length;
  return { total: ids.length, consistent, pct: ids.length ? Math.round((consistent/ids.length)*100) : 0 };
}

function renderWeeks() {
  const container = document.getElementById('weeksContainer');
  container.innerHTML = '';
  curriculum.weeks.forEach(week => {
    const stats = weekStats(week);
    const card = document.createElement('div');
    card.className = 'weekCard';
    const isOpen = openWeeks.has(week.week);
    card.innerHTML = `
      <div class="weekCardHeader" data-week="${week.week}">
        <div>
          <div class="title">Week ${week.week}: ${week.title}</div>
          <div class="meta">${stats.consistent}/${stats.total} consistent · suggested slot: ${week.suggestedSlot}</div>
        </div>
        <div class="weekBarOuter"><div class="weekBarInner" style="width:${stats.pct}%"></div></div>
      </div>
      <div class="weekCardBody ${isOpen ? 'open' : ''}" id="weekBody-${week.week}"></div>
    `;
    container.appendChild(card);
    const body = card.querySelector(`#weekBody-${week.week}`);
    body.innerHTML = week.exercises.map(ex => renderExerciseRow(ex)).join('');
  });

  container.querySelectorAll('.weekCardHeader').forEach(h => {
    h.addEventListener('click', () => {
      const wk = parseInt(h.dataset.week);
      if (openWeeks.has(wk)) openWeeks.delete(wk); else openWeeks.add(wk);
      renderWeeks();
    });
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
  container.querySelectorAll('.notesInput').forEach(inp => {
    inp.addEventListener('blur', (e) => setNotes(e.target.dataset.id, e.target.value));
  });
}

function renderExerciseRow(ex) {
  const p = progress.exercises[ex.id];
  const lastText = p.lastPracticed ? `Last practiced: ${p.lastPracticed} · Streak: ${p.streak}d` : 'Not practiced yet';
  const rate = p.attemptCount ? Math.round((p.successCount/p.attemptCount)*100) : 0;
  return `
    <div class="exRow">
      <div class="exName">${ex.name} <span class="status-${p.status}">(${p.status.replace('_',' ')})</span></div>
      <div class="exGoal">${ex.goal}</div>
      <div class="exDetail"><b>Steps:</b> ${ex.steps}</div>
      <div class="exDetail"><b>Reward timing:</b> ${ex.rewardTiming}</div>
      <div class="exDetail"><b>Avoid:</b> ${ex.mistake}</div>
      <div class="exControls">
        <select class="statusSelect" data-id="${ex.id}">
          <option value="not_started" ${p.status==='not_started'?'selected':''}>Not started</option>
          <option value="practicing" ${p.status==='practicing'?'selected':''}>Practicing</option>
          <option value="consistent" ${p.status==='consistent'?'selected':''}>Consistent</option>
        </select>
        <button class="logBtn logSuccessBtn" data-id="${ex.id}">✓ Log Success</button>
        <button class="logBtn logAttemptBtn" data-id="${ex.id}" style="background:#d98c2b">Log Attempt</button>
        <span class="exMeta">${lastText} · ${rate}% success (${p.attemptCount} tries)</span>
      </div>
      <input class="notesInput" data-id="${ex.id}" placeholder="Notes..." value="${(p.notes||'').replace(/"/g,'&quot;')}">
    </div>
  `;
}

function initSettingsModal() {
  const s = getGhSettings();
  document.getElementById('ghOwner').value = s.owner;
  document.getElementById('ghRepo').value = s.repo;
  document.getElementById('ghPath').value = s.path;
  document.getElementById('ghBranch').value = s.branch;
  document.getElementById('ghToken').value = s.token || '';

  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.remove('hidden');
  });
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.getElementById('saveTokenBtn').addEventListener('click', () => {
    const ns = {
      owner: document.getElementById('ghOwner').value.trim(),
      repo: document.getElementById('ghRepo').value.trim(),
      path: document.getElementById('ghPath').value.trim(),
      branch: document.getElementById('ghBranch').value.trim(),
      token: document.getElementById('ghToken').value.trim()
    };
    saveGhSettings(ns);
    setSyncStatus('Connected — click Pull or Push');
  });
  document.getElementById('pullBtn').addEventListener('click', ghPull);
  document.getElementById('pushBtn').addEventListener('click', ghPush);
}

async function init() {
  await loadCurriculum();
  progress = loadLocalProgress();
  document.getElementById('currentWeekSelect').addEventListener('change', (e) => {
    progress.currentWeek = parseInt(e.target.value);
    saveLocalProgress();
    render();
  });
  initSettingsModal();
  render();
  const s = getGhSettings();
  if (s.token) { setSyncStatus('Connected'); }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
}

init();
