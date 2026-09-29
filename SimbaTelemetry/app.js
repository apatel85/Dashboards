/* =====================================================================
   Simba Telemetry PWA — app.js
   Single-file application logic. No build step. All deterministic
   physiological engines run on-device (ported from spec section 5).
   Supabase (Postgres + Auth + RLS) is the only backend.
   ===================================================================== */
'use strict';

/* ---------------- Configuration ---------------- */
const CFG = {
  SCHEMA: 'simba_telemetry',          // one schema per app (team convention)
  KCAL_MIN: 300, KCAL_MAX: 330,       // daily intake target (configurable in Setup)
  WATER_CUTOFF: '20:15',              // hard water cutoff (local time HH:MM)
  BEDTIME: '21:45',                   // den lockdown target
  PRE_BED_DRAIN_MIN: 10,              // pre-bed lawn drain = bedtime - this many min
  TARGET_AWAKE_HOLD: 80,              // fallback when no personal history yet
  MEAL_WINDOW_MIN: 15,                // 15-minute dish pickup rule
  KCAL_PER_TBSP: { Chicken: 26.94, Salmon: 25.31, Blend: 26.13 },
  KCAL_PER_TSP_GOATMILK: 0.7,
  KCAL_PER_EGG: 70,
  ML_PER_TBSP: 14.78, ML_PER_TSP: 4.93,
  LS: { SB_URL: 'st_sb_url', SB_KEY: 'st_sb_key', GEMINI: 'st_gemini', OFFLINE: 'st_offline',
        CFG: 'st_cfg', DISMISSED: 'st_dismissed' },
};

/* ---------------- Global state ---------------- */
const S = {
  sb: null,            // supabase-js client
  user: null,
  subject: null,       // Simba row
  events: [],          // today's events (local cache)
  history: [],         // last 90 days (for insights/trends)
  local: [],           // offline-mode queue (localStorage)
  online: false,
  tickTimer: null,
  sheetCtx: null,      // current modal context
  parsed: null,        // last parsed telemetry
  trendRange: 30,
  kbCache: {},
};

/* ---------------- Small utilities ---------------- */
const $ = id => document.getElementById(id);
const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = d => { d = new Date(d); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const fmtDur = mins => mins < 60 ? `${Math.round(mins)}m` : `${Math.floor(mins/60)}h ${Math.round(mins%60)}m`;
function toast(msg) {
  let t = document.querySelector('.app-toast');
  if (!t) { t = document.createElement('div'); t.className = 'app-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1e7a4e;color:#fff;padding:10px 18px;border-radius:10px;z-index:200;font-size:14px;';
  clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 2200);
}
function loadCfg() {
  try { const c = JSON.parse(localStorage.getItem(CFG.LS.CFG) || '{}');
    if (c.KCAL_MIN) CFG.KCAL_MIN = c.KCAL_MIN;
    if (c.KCAL_MAX) CFG.KCAL_MAX = c.KCAL_MAX;
    if (c.BEDTIME) CFG.BEDTIME = c.BEDTIME;
    if (c.DAY_ONE) CFG.DAY_ONE = c.DAY_ONE; else CFG.DAY_ONE = '2026-09-01';
  } catch(e){ CFG.DAY_ONE = '2026-09-01'; }
}
function saveCfg() {
  localStorage.setItem(CFG.LS.CFG, JSON.stringify({ KCAL_MIN: CFG.KCAL_MIN, KCAL_MAX: CFG.KCAL_MAX, BEDTIME: CFG.BEDTIME, DAY_ONE: CFG.DAY_ONE }));
}
function dayNumber(date = new Date()) {
  const d1 = new Date(CFG.DAY_ONE + 'T12:00:00');
  return Math.floor((new Date(date).setHours(12,0,0,0) - d1) / 86400000) + 1;
}
function ageWeeks(dob = '2026-05-31') {
  return Math.floor((Date.now() - new Date(dob + 'T12:00:00').getTime()) / (7 * 86400000));
}

/* ---------------- Supabase layer ---------------- */
function sbReady() { return !!(S.sb && S.user && !localStorage.getItem(CFG.LS.OFFLINE)); }

function initSupabase() {
  const url = localStorage.getItem(CFG.LS.SB_URL), key = localStorage.getItem(CFG.LS.SB_KEY);
  if (!url || !key || !window.supabase) return false;
  try {
    S.sb = window.supabase.createClient(url, key, { db: { schema: CFG.SCHEMA } });
    return true;
  } catch(e) { console.warn('supabase init failed', e); return false; }
}

async function testConnection() {
  const url = $('sbUrl').value.trim(), key = $('sbKey').value.trim();
  if (!url || !key) { $('sbStatus').textContent = 'Enter URL and anon key first.'; return; }
  $('sbStatus').textContent = 'Testing…';
  try {
    const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    $('sbStatus').textContent = r.ok ? '✓ Connection OK (HTTP ' + r.status + '). Save to use.' : '✗ HTTP ' + r.status + ' — check URL/key.';
  } catch(e) { $('sbStatus').textContent = '✗ Network error: ' + e.message; }
}

async function refreshSession() {
  if (!S.sb) return;
  const { data: { session } } = await S.sb.auth.getSession();
  S.user = session?.user || null;
  renderAuth();
  if (S.user) { await ensureSubject(); await loadData(); }
  else { S.events = []; S.subject = null; renderAll(); }
  setSync(S.user ? true : false);
}

function setSync(on) {
  S.online = on;
  const el = $('syncState');
  el.textContent = on ? '● synced' : '○ offline';
  el.classList.toggle('on', on);
}

/* Ensure the Simba subject row exists and is claimed by this user */
async function ensureSubject() {
  // 1) try to find a row owned by me
  let { data } = await S.sb.from('subjects').select('*').eq('owner_id', S.user.id).limit(1);
  if (data && data.length) { S.subject = data[0]; return; }
  // 2) try to claim the unclaimed seed row
  const { data: claimed, error: cErr } = await S.sb.from('subjects')
    .update({ owner_id: S.user.id }).is('owner_id', null).select();
  if (!cErr && claimed && claimed.length) { S.subject = claimed[0]; return; }
  // 3) create fresh
  const { data: created, error } = await S.sb.from('subjects').insert({
    owner_id: S.user.id, name: 'Simba', breed: 'Cavapoo (Cavalier King Charles Spaniel × Poodle)',
    date_of_birth: '2026-05-31', sex: 'male', current_weight_kg: 3.40,
    target_awake_hold_mins: 80, clean_overnight_streak_days: 27,
  }).select();
  if (error) { console.warn('subject create failed', error); return; }
  S.subject = created[0];
}

/* ---------------- Event persistence ---------------- */
function localSave(ev) { // offline queue
  const q = JSON.parse(localStorage.getItem('st_queue') || '[]');
  q.push(ev); localStorage.setItem('st_queue', JSON.stringify(q));
}

async function saveEvent(ev) {
  ev.subject_id = S.subject?.id || null;
  ev.owner_id = S.user?.id || null;
  ev.logged_at = ev.logged_at || new Date().toISOString();
  ev.day_number = dayNumber(ev.logged_at);
  if (sbReady() && ev.subject_id) {
    const { data, error } = await S.sb.from('telemetry_events').insert(ev).select();
    if (error) { toast('Save failed: ' + error.message); localSave(ev); return null; }
    return data[0];
  }
  localSave(ev); // offline: queue locally
  ev.id = 'local-' + Date.now();
  S.events.push(ev); S.history.push(ev); // keep local caches live in offline mode
  return ev;
}

async function loadData() {
  if (!sbReady() || !S.subject) return;
  const since = new Date(); since.setDate(since.getDate() - 90);
  const { data, error } = await S.sb.from('telemetry_events')
    .select('*').eq('subject_id', S.subject.id)
    .gte('logged_at', since.toISOString()).order('logged_at', { ascending: true });
  if (error) { console.warn('load failed', error); return; }
  S.history = data || [];
  const t = todayStr();
  S.events = S.history.filter(e => e.logged_at.slice(0,10) === t);
  renderAll();
}

async function syncOfflineQueue() {
  if (!sbReady()) return;
  const q = JSON.parse(localStorage.getItem('st_queue') || '[]');
  if (!q.length || !S.subject) return;
  let ok = 0;
  for (const ev of q) {
    ev.subject_id = S.subject.id; ev.owner_id = S.user.id;
    const { error } = await S.sb.from('telemetry_events').insert(ev);
    if (!error) ok++;
  }
  localStorage.setItem('st_queue', JSON.stringify(q.slice(ok)));
  if (ok) toast(`Synced ${ok} offline event(s).`);
  await loadData();
}

async function deleteEvent(id) {
  if (sbReady() && !String(id).startsWith('local-')) {
    const { error } = await S.sb.from('telemetry_events').delete().eq('id', id);
    if (error) { toast('Delete failed: ' + error.message); return; }
  } else {
    // offline: drop from local queue + caches
    const q = JSON.parse(localStorage.getItem('st_queue') || '[]').filter(e => String(e.id) !== String(id));
    localStorage.setItem('st_queue', JSON.stringify(q));
    S.events = S.events.filter(e => String(e.id) !== String(id));
    S.history = S.history.filter(e => String(e.id) !== String(id));
  }
  await loadData(); renderTimeline(); renderCockpit();
}

/* =====================================================================
   PART 2 — Deterministic physiological engines (spec section 5, Python → JS)
   ===================================================================== */

/**
 * Bladder hydrostatic + glomerular filtration model.
 * Port of calculate_bladder_state(): basal renal filtrate accumulates at
 * ~1.8 mL/kg/hr (3.4 kg → 0.102 mL/min awake, 0.035 mL/min in sleep);
 * fluid bolus peaks 30–45 min post-intake.
 */
function calculateBladderState(lastVoidTs, nowTs, isAsleep, recentFluidMl, timeSinceFluidMins) {
  const elapsed = (nowTs - lastVoidTs) / 60000;              // minutes
  const basalRate = isAsleep ? 0.035 : 0.102;                // mL/min
  const accumulatedBasal = elapsed * basalRate;
  let fraction = 0;
  if (timeSinceFluidMins > 0 && timeSinceFluidMins <= 60) {
    if (timeSinceFluidMins <= 20)      fraction = (timeSinceFluidMins / 20) * 0.20;
    else if (timeSinceFluidMins <= 45) fraction = 0.20 + ((timeSinceFluidMins - 20) / 25) * 0.70;
    else                               fraction = 0.90 + ((timeSinceFluidMins - 45) / 15) * 0.10;
  }
  const bolusFiltrate = recentFluidMl * fraction;
  const estimatedVolumeMl = accumulatedBasal + bolusFiltrate;
  let accidentRisk = 'LOW';
  if (!isAsleep) {
    if (elapsed >= 75 || (timeSinceFluidMins >= 30 && timeSinceFluidMins <= 45 && estimatedVolumeMl > 18.0))
      accidentRisk = 'CRITICAL';
    else if (elapsed >= 60 || estimatedVolumeMl > 14.0)
      accidentRisk = 'ELEVATED';
  }
  return { elapsedMins: Math.round(elapsed), estimatedVolumeMl: +estimatedVolumeMl.toFixed(2), accidentRisk };
}

/**
 * Multi-variable contingency triggers (spec 5.2). Returns alert strings.
 * state: { elapsedAwakeHoldMins, minsSinceFluid, currentSubstrate,
 *          minsSinceLastPee, dailyPoopsCompleted, doorTellFlag, lastMealTexture,
 *          mealInProgress, mealElapsedMins, currentTimeStr, waterBowlsPulled }
 */
function evaluateContingencyTriggers(st) {
  const alerts = [];
  if (st.elapsedAwakeHoldMins >= 75 &&
      st.minsSinceFluid >= 30 && st.minsSinceFluid <= 45 &&
      st.currentSubstrate === 'Living Room Carpet')
    alerts.push({ level: 'crit', text: 'CRITICAL: 80m awake hold converging with peak fluid filtration on carpet substrate. Carry to grass immediately.' });
  if (st.minsSinceLastPee <= 20 && st.dailyPoopsCompleted >= 2 && st.doorTellFlag && st.lastMealTexture === 'Dry_Kibble')
    alerts.push({ level: 'warn', text: 'DIAGNOSTIC ADVISORY: Dry kibble gastric swelling detected. Bladder and colon are physically empty. Allow stationed chewing on tile to dispel gas.' });
  if (st.mealInProgress && st.mealElapsedMins >= CFG.MEAL_WINDOW_MIN)
    alerts.push({ level: 'warn', text: `BEHAVIORAL DIRECTIVE: ${CFG.MEAL_WINDOW_MIN}-minute food pickup limit reached. Remove bowl and refrigerate unconsumed portions.` });
  if (st.currentTimeStr >= CFG.WATER_CUTOFF && !st.waterBowlsPulled)
    alerts.push({ level: 'warn', text: 'OPERATIONAL CUTOFF: 08:15 PM hard water cutoff active. Pull all water dishes from floor to safeguard overnight crate continence.' });
  return alerts;
}

/* ---- Live state derivation from today's events ---- */
function lastOf(cat) {
  const list = S.events.filter(e => e.category === cat);
  return list.length ? list[list.length - 1] : null;
}
function lastElim(types) {
  const list = S.events.filter(e => types.includes(e.elimination_type));
  return list.length ? list[list.length - 1] : null;
}
function isAsleep() {
  const crates = S.events.filter(e => e.category === 'Crate' || e.category === 'Nap');
  if (!crates.length) return false;
  const last = crates[crates.length - 1];
  return last.crate_action === 'Crate_Entry'; // no wake logged yet
}
function liveState(now = new Date()) {
  const pee = lastElim(['Pee', 'Pee_Poop']);
  const lastVoidTs = pee ? new Date(pee.logged_at).getTime() : new Date(now).setHours(0,0,0,0);
  const fluids = S.events.filter(e => e.category === 'Water' || (e.toppers_detail || '').includes('goat'));
  const lastFluid = fluids.length ? fluids[fluids.length - 1] : null;
  const recentFluidMl = lastFluid ? (lastFluid.water_consumed_tsp || 0) * CFG.ML_PER_TSP : 0;
  const minsSinceFluid = lastFluid ? (now - new Date(lastFluid.logged_at)) / 60000 : 999;
  const asleep = isAsleep();
  const bladder = calculateBladderState(lastVoidTs, now.getTime(), asleep, recentFluidMl, minsSinceFluid);
  const poops = S.events.filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length;
  const kcal = S.events.reduce((a, e) => a + (+e.event_kcal || 0), 0);
  const fluidMl = S.events.reduce((a, e) => a + (+e.cumulative_daily_fluid_ml || 0) * 0 + ((+e.water_consumed_tsp || 0) * CFG.ML_PER_TSP), 0);
  const meals = S.events.filter(e => e.category === 'Food');
  const lastMeal = meals.length ? meals[meals.length - 1] : null;
  const mealElapsed = lastMeal ? (now - new Date(lastMeal.logged_at)) / 60000 : 999;
  return {
    now, bladder, asleep, poops, kcal, fluidMl,
    lastPeeAt: pee ? new Date(pee.logged_at) : null,
    lastMealAt: lastMeal ? new Date(lastMeal.logged_at) : null,
    mealInProgress: !!lastMeal && mealElapsed < 30,
    mealElapsedMins: mealElapsed,
    lastMealTexture: lastMeal && /dry/i.test(lastMeal.toppers_detail || '') ? 'Dry_Kibble' : 'Wet_Topped',
    doorTellFlag: S.events.some(e => e.door_tell_observed),
    waterBowlsPulled: localStorage.getItem('st_bowls') === '1',
    currentSubstrate: (S.events.filter(e => e.location_substrate).pop() || {}).location_substrate || 'Unknown',
    currentTimeStr: fmtTime(now),
  };
}

/* =====================================================================
   PART 3 — Natural-language structured extraction (spec 6.1)
   ===================================================================== */
const WORD_NUM = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  half:.5, quarter:.25, fourth:.25, third:1/3 };
function wordsToNum(text) {
  let t = ' ' + text.toLowerCase() + ' ';
  const DEN = { half: 2, halves: 2, quarter: 4, quarters: 4, fourth: 4, fourths: 4, third: 3, thirds: 3 };
  // "two and three fourth" → 2.75 ; "one and a half" → 1.5
  t = t.replace(/\b(one|two|three|four|five)\s+and\s+(?:a\s+)?(one|two|three)\s+(half|halves|quarter|quarters|fourth|fourths|third|thirds)\b/g,
    (m, a, b, c) => ` ${(WORD_NUM[a] + WORD_NUM[b] / DEN[c]).toFixed(3)} `);
  t = t.replace(/\b(one|two|three)\s+(half|halves|quarter|quarters|fourth|fourths|third|thirds)\b/g,
    (m, a, b) => ` ${(WORD_NUM[a] / DEN[b]).toFixed(3)} `);
  // "two and a half" → 2.5
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+and\s+(?:a\s+)?(half|quarter|fourth|third)s?\b/g,
    (m, a, b) => ` ${(WORD_NUM[a] + WORD_NUM[b]).toFixed(2)} `);
  t = t.replace(/\ba\s+half\b/g, ' 0.5 ').replace(/\bhalf\b/g, ' 0.5 ');
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, m => ` ${WORD_NUM[m.trim()]} `);
  return t;
}
function extractAmount(t, unitRe) {
  // matches "2.75 tbsp", "3 tsp", "1/2 cup"
  const m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:\\/\\s*(\\d+))?\\s*(?:${unitRe})`));
  if (!m) return 0;
  let v = parseFloat(m[1]); if (m[2]) v = v / parseFloat(m[2]);
  return v;
}
/** Parse freeform telemetry text → structured event. Returns {event, notes[]} */
function parseTelemetry(raw) {
  const t = wordsToNum(raw);
  const notes = [];
  const ev = { category: 'Note', raw_input: raw, location_substrate: 'Unknown' };
  // Word-boundary matching (avoids "ate" matching "water", "p " matching "poop")
  const has = (...ws) => ws.some(w => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t));

  // --- elimination type ---
  const peeW = has('peed', 'pee', 'urinated', 'urination');
  const poopW = has('pooped', 'poop', 'bowel movement', 'stool');
  if (/\baccident\b/.test(t) || has('inside', 'indoors', 'on the carpet', 'on carpet')) {
    ev.category = 'Elimination';
    ev.elimination_type = poopW ? 'Accident_Poop' : 'Accident_Pee';
  } else if (peeW && poopW) { ev.category = 'Elimination'; ev.elimination_type = 'Pee_Poop'; }
  else if (peeW) {
    ev.category = 'Elimination';
    ev.elimination_type = /\bmicro\b/.test(t) ? 'Micro_Pee' : (/\bdry\b/.test(t) ? 'Dry_Check' : 'Pee');
  }
  else if (poopW) { ev.category = 'Elimination'; ev.elimination_type = 'Poop'; }

  // --- food / water / training / nap / weight ---
  const tbsp = extractAmount(t, 'tbsp|tablespoons?');
  const tsp = extractAmount(t, 'tsp|teaspoons?');
  if (has('ate', 'food', 'kibble', 'meal', 'breakfast', 'lunch', 'dinner', 'fed') || tbsp > 0) {
    ev.category = 'Food';
    ev.kibble_offered_tbsp = tbsp || 0; ev.kibble_consumed_tbsp = tbsp || 0;
    ev.kibble_type = has('salmon') ? 'Salmon' : 'Chicken';
    if (has('egg', 'eggs')) { ev.toppers_detail = (ev.toppers_detail || '') + ' scrambled egg'; ev.event_kcal = (ev.event_kcal || 0) + CFG.KCAL_PER_EGG * 0.5; }
    if (has('goat')) { ev.toppers_detail = (ev.toppers_detail || '') + ' goat milk'; ev.event_kcal = (ev.event_kcal || 0) + 3 * CFG.KCAL_PER_TSP_GOATMILK; }
    ev.event_kcal = (ev.event_kcal || 0) + tbsp * CFG.KCAL_PER_TBSP[ev.kibble_type === 'Salmon' ? 'Salmon' : 'Chicken'];
  }
  if (has('drank', 'water', 'hydration') || (tsp > 0 && ev.category !== 'Food')) {
    if (ev.category === 'Note') ev.category = 'Water';
    ev.water_consumed_tsp = tsp || 2;
  }
  if (has('train', 'training', 'trained', 'sit', 'stay', 'recall', 'leash', 'session')) ev.category = 'Training';
  if (has('nap', 'napping', 'crate', 'sleep', 'bedtime', 'den')) {
    ev.category = has('nap', 'napping') ? 'Nap' : 'Crate';
    ev.crate_action = has('woke', 'wake', 'out of crate') ? 'Crate_Wake' : 'Crate_Entry';
  }
  const wMatch = t.match(/(\d+(?:\.\d+)?)\s*lbs?/);
  if (wMatch && has('weigh', 'weighs', 'weighed', 'weight', 'lbs')) { ev.category = 'Weight'; ev.status_outcome = `Weight: ${wMatch[1]} lbs`; }

  // --- substrate mapping ---
  if (has('carpet', 'rug')) ev.location_substrate = 'Living Room Carpet';
  else if (has('grass', 'outside', 'out', 'yard', 'lawn')) ev.location_substrate = 'Lawn Grass';
  else if (has('tile', 'kitchen')) ev.location_substrate = 'Kitchen Tile';

  // --- door tell ---
  if (/\bby the door\b/.test(t) || has('waiting at', 'hovering', 'went to the door')) { ev.door_tell_observed = true; notes.push('Door tell detected'); }

  // --- stream duration "3 to 4 second" ---
  const sMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*second/);
  if (sMatch) ev.stream_duration_seconds = +(((+sMatch[1] + +sMatch[2]) / 2).toFixed(1));
  const fsMatch = t.match(/(?:fecal|stool|purina)?\s*score\s*(\d)/);
  if (fsMatch) ev.fecal_score = Math.min(7, Math.max(1, +fsMatch[1]));

  // --- explicit time: use the LAST time mentioned ("out at 7:50 … peed at 7:52" → 7:52)
  const timeMatches = [...raw.matchAll(/\b(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/gi)];
  if (timeMatches.length) {
    const timeMatch = timeMatches[timeMatches.length - 1];
    let h = +timeMatch[1]; const ap = (timeMatch[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    const d = new Date(); d.setHours(h, +timeMatch[2], 0, 0);
    if (!ap) { while (d > new Date()) d.setHours(d.getHours() - 12); } // no marker → latest past time
    else if (d > new Date()) d.setDate(d.getDate() - 1);
    ev.logged_at = d.toISOString(); notes.push('Timestamp taken from text: ' + fmtTime(d));
  }
  if (!ev.event_kcal) ev.event_kcal = 0;
  return { event: ev, notes };
}

/* =====================================================================
   PART 4 — UI: navigation, cockpit, quick-log, timeline
   ===================================================================== */
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $('screen-' + name);
  if (el) el.classList.add('active');
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'trends') renderTrends();
  if (name === 'insights') renderInsights();
  if (name === 'timeline') renderTimeline();
  if (name === 'knowledge') loadKnowledge('specialized');
  if (name === 'ask') refreshAuditEvents();
  window.scrollTo(0, 0);
}

function renderAll() { renderCockpit(); renderTimeline(); }

/* ---------- Cockpit ---------- */
function renderCockpit() {
  // Subject header
  const wks = ageWeeks(S.subject?.date_of_birth || '2026-05-31');
  const kg = S.subject?.current_weight_kg || +(localStorage.getItem('st_weight') || 3.40);
  const wt = (kg * 2.20462).toFixed(2);
  const streak = S.subject?.clean_overnight_streak_days ?? 27;
  $('subjectMeta').textContent = `${wks} weeks · ${wt} lbs · ${streak}-day clean streak`;

  const st = liveState();
  // Risk gauge
  const rv = $('riskValue');
  rv.textContent = st.bladder.accidentRisk;
  rv.className = 'risk-value risk-' + st.bladder.accidentRisk;
  $('riskSub').textContent = st.asleep
    ? `Sleeping — ADH suppression active, hold ${fmtDur(st.bladder.elapsedMins)}`
    : `Hold ${fmtDur(st.bladder.elapsedMins)} · est. volume ${st.bladder.estimatedVolumeMl} mL`;

  // Stats
  $('holdTimer').textContent = fmtDur(st.bladder.elapsedMins);
  $('holdSub').textContent = 'last pee ' + (st.lastPeeAt ? fmtTime(st.lastPeeAt) : '—');
  $('kcalNow').textContent = Math.round(st.kcal);
  $('kcalSub').textContent = kcalPaceNote(st);
  $('fluidNow').textContent = Math.round(st.fluidMl);
  $('fluidSub').textContent = minsSinceFluidNote(st);
  $('poopNow').textContent = st.poops;
  $('poopSub').textContent = st.poops >= 2 ? 'quota met ✓' : `${2 - st.poops} more expected`;

  // Visceral pills
  const pb = $('pillBladder');
  const fullVoid = st.lastPeeAt && st.bladder.elapsedMins < 20;
  pb.textContent = `Bladder: ${fullVoid ? 'True Zero' : 'Filling'} (${fmtDur(st.bladder.elapsedMins)})`;
  pb.className = 'pill ' + (st.bladder.accidentRisk === 'LOW' ? 'ok' : 'warn');
  const pc = $('pillColon');
  pc.textContent = `Colon: ${st.poops >= 2 ? 'Quota Done' : 'Quota ' + st.poops + '/2'}`;
  pc.className = 'pill ' + (st.poops >= 2 ? 'ok' : 'warn');

  // Countdowns
  renderCountdowns(st);
  // Alerts from contingency engine
  const trigState = {
    elapsedAwakeHoldMins: st.asleep ? 0 : st.bladder.elapsedMins,
    minsSinceFluid: (Date.now() - (lastFluidTs() || 0)) / 60000,
    currentSubstrate: st.currentSubstrate,
    minsSinceLastPee: st.lastPeeAt ? (Date.now() - st.lastPeeAt.getTime()) / 60000 : 999,
    dailyPoopsCompleted: st.poops,
    doorTellFlag: st.doorTellFlag,
    lastMealTexture: st.lastMealTexture,
    mealInProgress: st.mealInProgress,
    mealElapsedMins: st.mealElapsedMins,
    currentTimeStr: st.currentTimeStr,
    waterBowlsPulled: st.waterBowlsPulled,
  };
  const alerts = evaluateContingencyTriggers(trigState);
  renderAlerts(alerts);
}
function lastFluidTs() {
  const fs = S.events.filter(e => e.category === 'Water' || (e.toppers_detail || '').includes('goat'));
  return fs.length ? new Date(fs[fs.length - 1].logged_at).getTime() : null;
}
function kcalPaceNote(st) {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const expected = (CFG.KCAL_MAX * Math.min(1, h / 16)).toFixed(0);
  return st.kcal > CFG.KCAL_MAX ? 'over target — ease off' : `pace: ~${expected} by now`;
}
function minsSinceFluidNote(st) {
  const ts = lastFluidTs();
  if (!ts) return 'absorption —';
  const m = Math.round((Date.now() - ts) / 60000);
  return m <= 45 ? `peak filtration window (${m}m)` : 'drained';
}
function renderCountdowns(st) {
  const box = $('countdowns'); const items = [];
  const now = new Date();
  const hm = s => { const [h, m] = s.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  // Water cutoff
  const wc = hm(CFG.WATER_CUTOFF);
  if (now < wc) items.push(['💧 Hard water cutoff ' + CFG.WATER_CUTOFF, wc - now, () => { localStorage.setItem('st_bowls', '1'); renderCockpit(); toast('Water bowls marked as pulled.'); }]);
  // Pre-bed drain + lockdown
  const bed = hm(CFG.BEDTIME);
  const drain = new Date(bed.getTime() - CFG.PRE_BED_DRAIN_MIN * 60000);
  if (now < drain) items.push(['🌙 Pre-bed lawn drain (~' + fmtTime(drain) + ')', drain - now, null]);
  if (now < bed) items.push(['💤 Overnight den lockdown ' + CFG.BEDTIME, bed - now, null]);
  // Meal pickup countdown
  if (st.mealInProgress) {
    const end = new Date(st.lastMealAt.getTime() + CFG.MEAL_WINDOW_MIN * 60000);
    if (end > now) items.push(['🍽️ Dish pickup in', end - now, null]);
  }
  box.innerHTML = items.length ? '' : '<div class="muted">No active countdowns.</div>';
  for (const [label, ms, action] of items) {
    const div = document.createElement('div'); div.className = 'countdown';
    div.innerHTML = `<span>${esc(label)}</span><span class="t">${fmtDur(ms / 60000)}${action ? ' <button class="btn small">done</button>' : ''}</span>`;
    if (action) div.querySelector('button').onclick = action;
    box.appendChild(div);
  }
}
function renderAlerts(alerts) {
  const card = $('alertCard'), list = $('alertList');
  if (!alerts.length) { card.hidden = true; return; }
  card.hidden = false;
  list.innerHTML = alerts.map(a => `<div class="alert ${a.level === 'crit' ? 'crit' : ''}">${esc(a.text)}</div>`).join('');
}

/* ---------- Quick-log dock ---------- */
const CAT_EMOJI = { Pee: '💧', Poop: '💩', Food: '🥩', Water: '🚰', Nap: '💤', Training: '🎯', Weight: '⚖️', Note: '📝', Elimination: '🚻', Crate: '💤' };

function quickLog(category) {
  if (category === 'Food' || category === 'Water') return openSheet(category);
  if (category === 'Weight') return openSheet('Weight');
  if (category === 'Note') return openSheet('Note');
  const ev = { category };
  if (category === 'Pee') { ev.category = 'Elimination'; ev.elimination_type = 'Pee'; ev.location_substrate = 'Lawn Grass'; }
  if (category === 'Poop') { ev.category = 'Elimination'; ev.elimination_type = 'Poop'; ev.location_substrate = 'Lawn Grass'; ev.fecal_score = 2; }
  if (category === 'Nap') { ev.category = 'Nap'; ev.crate_action = 'Crate_Entry'; }
  if (category === 'Training') { ev.status_outcome = 'Training session logged'; }
  saveEvent(ev).then(r => { if (r) { toast(`${category} logged ✓`); loadData(); checkNudges(); } });
}

/* ---------- Detail sheet (modal) ---------- */
function openSheet(kind, existing = null) {
  S.sheetCtx = { kind, existing };
  $('sheetTitle').textContent = (existing ? 'Edit ' : 'Log ') + kind;
  const b = $('sheetBody');
  if (kind === 'Food') {
    b.innerHTML = `
      <label class="lbl">Kibble type</label>
      <select id="fType"><option>Chicken</option><option>Salmon</option></select>
      <label class="lbl">Kibble consumed (tbsp)</label>
      <input id="fTbsp" type="number" step="0.25" value="3">
      <label class="lbl">Toppers / notes</label>
      <input id="fTop" placeholder="e.g. 0.5 scrambled egg, goat milk 2 tsp">
      <label class="lbl">Egg (whole eggs)</label>
      <input id="fEgg" type="number" step="0.25" value="0.5">`;
  } else if (kind === 'Water') {
    b.innerHTML = `
      <label class="lbl">Water consumed (tsp)</label>
      <input id="wTsp" type="number" step="0.5" value="4">
      <label class="lbl">Notes</label>
      <input id="wNote" placeholder="e.g. after play">`;
  } else if (kind === 'Weight') {
    b.innerHTML = `<label class="lbl">Weight (lbs)</label><input id="wtLbs" type="number" step="0.05" placeholder="7.60">`;
  } else if (kind === 'Note') {
    b.innerHTML = `<label class="lbl">Note</label><textarea id="nText" rows="3" placeholder="Behavior, training, vet…"></textarea>`;
  }
  if (existing) {
    if (kind === 'Food') { $('fType').value = existing.kibble_type || 'Chicken'; $('fTbsp').value = existing.kibble_consumed_tbsp || 0; $('fTop').value = existing.toppers_detail || ''; }
    if (kind === 'Water') { $('wTsp').value = existing.water_consumed_tsp || 0; }
  }
  $('sheet').hidden = false;
}
function closeSheet() { $('sheet').hidden = true; S.sheetCtx = null; }
async function saveSheet() {
  const { kind, existing } = S.sheetCtx || {};
  if (!kind) return closeSheet();
  let ev = existing ? { ...existing } : { category: kind };
  if (kind === 'Food') {
    const type = $('fType').value, tbsp = +$('fTbsp').value || 0, egg = +$('fEgg').value || 0;
    ev.category = 'Food'; ev.kibble_type = type;
    ev.kibble_offered_tbsp = tbsp; ev.kibble_consumed_tbsp = tbsp;
    ev.toppers_detail = $('fTop').value;
    ev.event_kcal = tbsp * (type === 'Salmon' ? CFG.KCAL_PER_TBSP.Salmon : CFG.KCAL_PER_TBSP.Chicken) + egg * CFG.KCAL_PER_EGG;
    ev.status_outcome = `Ate ${tbsp} tbsp ${type} kibble${ev.toppers_detail ? ' + ' + ev.toppers_detail : ''}`;
  } else if (kind === 'Water') {
    ev.category = 'Water'; ev.water_consumed_tsp = +$('wTsp').value || 0;
    ev.status_outcome = `Drank ${ev.water_consumed_tsp} tsp water` + ($('wNote').value ? ' (' + $('wNote').value + ')' : '');
  } else if (kind === 'Weight') {
    const lbs = +$('wtLbs').value;
    if (!lbs) { toast('Enter a weight.'); return; }
    ev.category = 'Weight'; ev.status_outcome = `Weight: ${lbs} lbs`;
    const kg = +(lbs / 2.20462).toFixed(2);
    localStorage.setItem('st_weight', String(kg)); // offline fallback
    if (S.subject && sbReady()) {
      await S.sb.from('subjects').update({ current_weight_kg: kg }).eq('id', S.subject.id);
      S.subject.current_weight_kg = kg;
    }
  } else if (kind === 'Note') {
    ev.category = 'Note'; ev.raw_input = $('nText').value; ev.status_outcome = $('nText').value.slice(0, 120);
  }
  if (existing && sbReady() && !String(existing.id).startsWith('local-')) {
    const { id, ...patch } = ev;
    const { error } = await S.sb.from('telemetry_events').update(patch).eq('id', id);
    if (error) toast('Update failed: ' + error.message); else toast('Updated ✓');
  } else {
    const r = await saveEvent(ev);
    if (r) toast(kind + ' logged ✓');
  }
  closeSheet(); await loadData(); renderCockpit(); checkNudges();
}

/* ---------- Timeline ---------- */
function renderTimeline() {
  $('timelineDate').textContent = todayStr();
  const list = $('timelineList');
  if (!S.events.length) { list.innerHTML = '<div class="muted">No events logged today yet.</div>'; return; }
  list.innerHTML = '';
  [...S.events].reverse().forEach(ev => {
    const div = document.createElement('div'); div.className = 'tl-item';
    const cat = ev.elimination_type || ev.category;
    div.innerHTML = `<div class="tl-time">${fmtTime(ev.logged_at)}</div>
      <div class="tl-body"><span class="tl-cat">${CAT_EMOJI[ev.category] || '•'} ${esc(cat)}</span><br>
      <span class="muted">${esc(ev.status_outcome || ev.raw_input || '')}</span></div>
      <div class="tl-actions"><button data-act="edit" title="Edit">✏️</button><button data-act="del" title="Delete">🗑</button></div>`;
    div.querySelector('[data-act=del]').onclick = () => { if (confirm('Delete this event?')) deleteEvent(ev.id); };
    div.querySelector('[data-act=edit]').onclick = () => {
      const kind = ev.category === 'Food' ? 'Food' : ev.category === 'Water' ? 'Water' : null;
      if (kind) openSheet(kind, ev); else toast('Editing is supported for Food/Water entries.');
    };
    list.appendChild(div);
  });
}

/* =====================================================================
   PART 5 — Trends, learned-schedule insights, predictive nudges
   ===================================================================== */
function eventsInDays(n) {
  const cut = new Date(); cut.setDate(cut.getDate() - n);
  return S.history.filter(e => new Date(e.logged_at) >= cut);
}
function dayBuckets(events) {
  const m = {};
  events.forEach(e => { const d = e.logged_at.slice(0, 10); (m[d] = m[d] || []).push(e); });
  return m;
}
/* Pee probability per hour-of-day over the window: days with ≥1 pee in that hour / days with data */
function hourlyProb(events, matchFn) {
  const days = dayBuckets(events);
  const dayKeys = Object.keys(days);
  const probs = new Array(24).fill(0), counts = new Array(24).fill(0);
  dayKeys.forEach(d => {
    const hours = new Set();
    days[d].forEach(e => { if (matchFn(e)) hours.add(new Date(e.logged_at).getHours()); });
    hours.forEach(h => counts[h]++);
  });
  for (let h = 0; h < 24; h++) probs[h] = dayKeys.length ? counts[h] / dayKeys.length : 0;
  return { probs, days: dayKeys.length };
}
const isPee = e => ['Pee', 'Pee_Poop', 'Micro_Pee'].includes(e.elimination_type);

function drawBars(id, labels, values, opts = {}) {
  const cv = $(id); if (!cv) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = +cv.getAttribute('height') || 150;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(...values, 1);
  const bw = W / values.length;
  values.forEach((v, i) => {
    const h = (v / max) * (H - 26);
    ctx.fillStyle = opts.colorFn ? opts.colorFn(v, i) : '#35c37d';
    ctx.fillRect(i * bw + 2, H - 20 - h, bw - 4, h);
  });
  ctx.fillStyle = '#9db3a7'; ctx.font = '10px sans-serif';
  if (opts.band) { // target band overlay (kcal chart)
    const y1 = H - 20 - (opts.band[1] / max) * (H - 26), y2 = H - 20 - (opts.band[0] / max) * (H - 26);
    ctx.fillStyle = 'rgba(53,195,125,.15)'; ctx.fillRect(0, y1, W, y2 - y1);
  }
  labels.forEach((l, i) => { if (i % Math.ceil(labels.length / 8) === 0) ctx.fillText(l, i * bw + 2, H - 6); });
}

function renderTrends() {
  const n = S.trendRange, evs = eventsInDays(n);
  const days = dayBuckets(evs), dayKeys = Object.keys(days).sort();
  // Pee probability by hour
  const { probs } = hourlyProb(evs, isPee);
  drawBars('chPee', [...Array(24).keys()].map(h => h + ':00'), probs,
    { colorFn: v => v >= .8 ? '#35c37d' : v >= .5 ? '#f2b134' : '#2a4636' });
  // Daily kcal
  const kcalByDay = dayKeys.map(d => days[d].reduce((a, e) => a + (+e.event_kcal || 0), 0));
  drawBars('chKcal', dayKeys.map(d => d.slice(5)), kcalByDay,
    { band: [CFG.KCAL_MIN, CFG.KCAL_MAX], colorFn: v => (v >= CFG.KCAL_MIN && v <= CFG.KCAL_MAX) ? '#35c37d' : '#f2b134' });
  // Avg awake hold: pee-to-pee gaps while awake-ish (filter gaps < 6h as awake holds)
  const pees = evs.filter(isPee).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const gaps = [];
  for (let i = 1; i < pees.length; i++) {
    const g = (new Date(pees[i].logged_at) - new Date(pees[i - 1].logged_at)) / 60000;
    if (g > 10 && g < 360) gaps.push(g);
  }
  $('trHold').textContent = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) + 'm' : '—';
  const acc = evs.filter(e => ['Accident_Pee', 'Accident_Poop'].includes(e.elimination_type)).length;
  $('trAcc').textContent = acc;
  const poopDays = dayKeys.map(d => days[d].filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length);
  $('trPoop').textContent = poopDays.length ? (poopDays.reduce((a, b) => a + b, 0) / poopDays.length).toFixed(1) : '—';
  $('trKcal').textContent = kcalByDay.length ? Math.round(kcalByDay.reduce((a, b) => a + b, 0) / kcalByDay.length) : '—';
  // Weight curve
  const wts = evs.filter(e => e.category === 'Weight').map(e => {
    const m = (e.status_outcome || '').match(/([\d.]+)\s*lbs/); return m ? { d: e.logged_at.slice(5, 10), v: +m[1] } : null;
  }).filter(Boolean);
  if (wts.length > 1) {
    const vs = wts.map(w => w.v), lo = Math.min(...vs) - .1, hi = Math.max(...vs) + .1;
    drawBars('chWeight', wts.map(w => w.d), vs.map(v => v - lo), { colorFn: () => '#4fa8e4' });
    $('weightNote').textContent = `${wts.length} weigh-ins · latest ${vs[vs.length - 1]} lbs`;
  } else $('weightNote').textContent = 'Log weight via the ⚖️ button.';
  // stash for insights
  S._gaps = gaps;
}

/* ---------- Learned schedule + "what to expect" ---------- */
function learnedWindows(events, matchFn, label, threshold = 0.8) {
  const { probs, days } = hourlyProb(events, matchFn);
  if (days < 3) return [];
  const wins = []; let start = -1;
  for (let h = 0; h <= 24; h++) {
    const p = h < 24 ? probs[h] : 0;
    if (p >= threshold && start < 0) start = h;
    if ((p < threshold || h === 24) && start >= 0) { wins.push({ start, end: h - 1, prob: Math.max(...probs.slice(start, h)), label }); start = -1; }
  }
  return wins;
}
function personalAvgHold() {
  const g = S._gaps || [];
  return g.length >= 5 ? g.reduce((a, b) => a + b, 0) / g.length : 81.9; // spec baseline
}
function renderInsights() {
  const evs = eventsInDays(90);
  const st = liveState();
  // --- What to expect right now ---
  const box = $('expectNow'); const cards = [];
  const avg = personalAvgHold(), el = st.asleep ? 0 : st.bladder.elapsedMins;
  if (st.asleep) cards.push('😴 <b>Crating.</b> ADH suppression is handling continence — no action needed.');
  else if (el < avg * 0.6) cards.push(`✅ <b>No urgency.</b> Hold is ${fmtDur(el)} vs your ${Math.round(avg)}m average — <b>skipping this trip is fine.</b>`);
  else if (el < avg * 0.85) cards.push(`🟡 <b>On track.</b> Hold ${fmtDur(el)} vs ${Math.round(avg)}m average. Next window approaching.`);
  else cards.push(`🔴 <b>Due soon.</b> Hold ${fmtDur(el)} is at/past your ${Math.round(avg)}m average — take him out.`);
  const ts = lastFluidTs();
  if (ts) {
    const m = (Date.now() - ts) / 60000;
    if (m > 20 && m < 50) cards.push(`💧 <b>Filtration peak.</b> Fluids ${Math.round(m)}m ago are hitting the bladder now — expect a full void if you go out.`);
    else if (m >= 50) cards.push('💧 Fluids drained — bladder volume is basal only.');
  }
  if (st.poops < 2) cards.push(`💩 <b>Colon quota ${st.poops}/2.</b> ${st.poops === 0 ? 'Morning bowel #1 typically lands 07:45–08:30.' : 'Afternoon bowel #2 typically lands 12:45–17:00.'}`);
  else cards.push('💩 <b>Colon quota met (2/2).</b> Further squats today are likely gas/false urge.');
  box.innerHTML = cards.map(c => `<div class="window-card">${c}</div>`).join('');

  // --- Learned schedule windows ---
  const wins = [
    ...learnedWindows(evs, isPee, 'Pee'),
    ...learnedWindows(evs, e => ['Poop', 'Pee_Poop'].includes(e.elimination_type), 'Poop'),
    ...learnedWindows(evs, e => e.category === 'Food', 'Meal'),
  ];
  S._windows = wins;
  const sw = $('scheduleWindows');
  sw.innerHTML = wins.length
    ? wins.map(w => `<div class="window-card"><span class="prob">${Math.round(w.prob * 100)}%</span> of days: <b>${w.label}</b> ${String(w.start).padStart(2, '0')}:00–${String(w.end).padStart(2, '0')}:59</div>`).join('')
    : '<div class="muted">Not enough history yet — windows appear after ~3 days of logging.</div>';
  renderNudges(wins);
}
function nudgeKey(w) { return `nudge:${todayStr()}:${w.label}:${w.start}`; }
function renderNudges(wins) {
  const now = new Date(), box = $('nudgeList');
  const dismissed = JSON.parse(localStorage.getItem(CFG.LS.DISMISSED) || '{}');
  const upcoming = [];
  for (const w of (wins || [])) {
    const start = new Date(); start.setHours(w.start, 0, 0, 0);
    const minsTo = (start - now) / 60000;
    if (minsTo < -60 || minsTo > 30) continue;                       // only near-term
    if (dismissed[nudgeKey(w)]) continue;
    const loggedToday = S.events.some(e =>
      (w.label === 'Pee' && isPee(e)) ||
      (w.label === 'Poop' && ['Poop', 'Pee_Poop'].includes(e.elimination_type)) ||
      (w.label === 'Meal' && e.category === 'Food'));
    if (!loggedToday) upcoming.push(w);
  }
  box.innerHTML = upcoming.length
    ? upcoming.map(w => `<div class="nudge">🔔 <b>${Math.round(w.prob * 100)}% of days</b> Simba ${w.label === 'Meal' ? 'eats' : w.label.toLowerCase() + 's'} around <b>${String(w.start).padStart(2, '0')}:00</b> — take him out / prep now. <button class="btn small" data-nk="${esc(nudgeKey(w))}">dismiss</button></div>`).join('')
    : '<div class="muted">No upcoming high-probability windows.</div>';
  box.querySelectorAll('[data-nk]').forEach(b => b.onclick = () => {
    const d = JSON.parse(localStorage.getItem(CFG.LS.DISMISSED) || '{}');
    d[b.dataset.nk] = 1; localStorage.setItem(CFG.LS.DISMISSED, JSON.stringify(d)); renderNudges(S._windows || []);
  });
}
/* Called after each save + every tick: surface due nudges on the cockpit too */
function checkNudges() {
  if (!S._windows) { const evs = eventsInDays(90);
    S._windows = [...learnedWindows(evs, isPee, 'Pee'),
      ...learnedWindows(evs, e => ['Poop', 'Pee_Poop'].includes(e.elimination_type), 'Poop'),
      ...learnedWindows(evs, e => e.category === 'Food', 'Meal')]; }
  const now = new Date(), dismissed = JSON.parse(localStorage.getItem(CFG.LS.DISMISSED) || '{}');
  for (const w of S._windows) {
    const start = new Date(); start.setHours(w.start, 0, 0, 0);
    const minsTo = (start - now) / 60000;
    if (minsTo <= 15 && minsTo >= -15 && !dismissed[nudgeKey(w)]) {
      const loggedToday = S.events.some(e =>
        (w.label === 'Pee' && isPee(e)) ||
        (w.label === 'Poop' && ['Poop', 'Pee_Poop'].includes(e.elimination_type)) ||
        (w.label === 'Meal' && e.category === 'Food'));
      if (!loggedToday && !document.querySelector(`[data-live-nudge="${esc(nudgeKey(w))}"]`)) {
        const card = $('alertCard'); card.hidden = false;
        const div = document.createElement('div');
        div.className = 'nudge'; div.dataset.liveNudge = nudgeKey(w);
        div.innerHTML = `🔔 <b>${Math.round(w.prob * 100)}% of days</b> Simba ${w.label === 'Meal' ? 'eats' : w.label.toLowerCase() + 's'} ~${String(w.start).padStart(2, '0')}:00 — in case you forgot.`;
        $('alertList').prepend(div);
      }
    }
  }
}

/* =====================================================================
   PART 6 — Ask / clinical audit, knowledge, export, setup, voice, init
   ===================================================================== */

/* ---------- Knowledge base ---------- */
async function loadKnowledge(which) {
  document.querySelectorAll('#kbTabs button').forEach(b => b.classList.toggle('active', b.dataset.kb === which));
  const body = $('kbBody');
  const file = which === 'specialized' ? 'knowledge/cavapoo-specialized.md' : 'knowledge/general-canine.md';
  if (S.kbCache[file]) { body.textContent = S.kbCache[file]; return S.kbCache[file]; }
  body.textContent = 'Loading…';
  try {
    const r = await fetch(file);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    S.kbCache[file] = txt; body.textContent = txt;
    $('kbMeta').textContent = `${txt.length.toLocaleString()} chars · updated ${new Date(document.lastModified).toLocaleDateString()}`;
    return txt;
  } catch (e) {
    body.textContent = '⏳ Knowledge document pending — it will appear here once published. The audit builder works without it.';
    $('kbMeta').textContent = '';
    return '';
  }
}
async function knowledgeExcerpts(maxChars = 2500) {
  // Specialized first, then general — per Ankit's requirement.
  const spec = await loadKnowledgeSilent('knowledge/cavapoo-specialized.md');
  const gen = await loadKnowledgeSilent('knowledge/general-canine.md');
  let out = '';
  if (spec) out += '--- SPECIALIZED (Cavapoo) KNOWLEDGE ---\n' + spec.slice(0, maxChars) + '\n';
  if (gen) out += '--- GENERAL CANINE KNOWLEDGE ---\n' + gen.slice(0, maxChars) + '\n';
  return out || '(knowledge documents pending)';
}
async function loadKnowledgeSilent(file) {
  if (S.kbCache[file] !== undefined) return S.kbCache[file];
  try { const r = await fetch(file); if (!r.ok) throw 0; const t = await r.text(); S.kbCache[file] = t; return t; }
  catch (e) { S.kbCache[file] = ''; return ''; }
}

/* ---------- Clinical audit prompt (spec 6.2) ---------- */
function refreshAuditEvents() {
  const sel = $('auditEvent');
  const evs = [...S.events].reverse();
  sel.innerHTML = evs.length
    ? evs.map(e => `<option value="${e.id}">${fmtTime(e.logged_at)} — ${esc(e.elimination_type || e.category)}${e.event_code ? ' (' + esc(e.event_code) + ')' : ''}</option>`).join('')
    : '<option value="">(no events today — log one first)</option>';
}
async function buildAuditPrompt() {
  const id = $('auditEvent').value;
  const ev = S.events.find(e => String(e.id) === String(id)) || S.events[S.events.length - 1];
  if (!ev) { toast('Log an event first.'); return; }
  const st = liveState();
  const kb = await knowledgeExcerpts();
  const prompt =
`You are the Clinical & Behavioral Canine Telemetry Engine for Simba, an intact ${ageWeeks()} -week-old Cavapoo (~${S.subject ? (S.subject.current_weight_kg * 2.20462).toFixed(2) : '7.50'} lbs). Analyze the incoming field telemetry against his longitudinal constants and deliver a structured clinical audit.

KNOWLEDGE BASE (specialized first, then general — consult specialized first):
${kb}

EVENT UNDER AUDIT:
${JSON.stringify({ code: ev.event_code || '(unsaved)', at: ev.logged_at, day: ev.day_number, category: ev.category, elimination: ev.elimination_type, fecal_score: ev.fecal_score, stream_s: ev.stream_duration_seconds, substrate: ev.location_substrate, door_tell: ev.door_tell_observed, kcal: ev.event_kcal, kibble: ev.kibble_consumed_tbsp + ' tbsp ' + (ev.kibble_type || ''), toppers: ev.toppers_detail, raw: ev.raw_input }, null, 2)}

LIVE PHYSIOLOGICAL STATE:
${JSON.stringify({ awake_hold_mins: st.bladder.elapsedMins, bladder_vol_ml: st.bladder.estimatedVolumeMl, risk: st.bladder.accidentRisk, asleep: st.asleep, kcal_today: Math.round(st.kcal), fluid_ml_today: Math.round(st.fluidMl), poops_today: st.poops }, null, 2)}

DELIVER:
1. Sentence 1: the concrete operational outcome + event confirmation. No filler.
2. Physiological & Behavioral Telemetry Audit: elapsed holds, fluid volumes, caloric bank vs DER, somatic tells, stool architecture.
3. Tactical Operational Roadmap: exact timestamps for the next 2–4 hours (feed boundaries, water cutoff 8:15 PM, outdoor intercepts, crate windows).
Tone: empathetic, analytically rigorous, grounded, authoritative.`;
  $('auditPrompt').value = prompt;
  $('promptCard').hidden = false;
  toast('Audit prompt built ✓');
}

async function generateWithGemini() {
  const key = localStorage.getItem(CFG.LS.GEMINI) || $('geminiKey').value.trim();
  const out = $('geminiOut');
  if (!key) { out.textContent = 'Enter your Gemini API key above first (free tier at aistudio.google.com). It stays on this device.'; return; }
  const prompt = $('auditPrompt').value;
  if (!prompt) { out.textContent = 'Build the audit prompt first.'; return; }
  out.textContent = 'Generating…';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'HTTP ' + r.status);
    out.textContent = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '(empty response)';
  } catch (e) { out.textContent = '✗ Gemini error: ' + e.message; }
}

/* ---------- Export ---------- */
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function toCSV(rows) {
  const cols = ['event_code', 'logged_at', 'day_number', 'category', 'elimination_type', 'fecal_score', 'kibble_consumed_tbsp', 'kibble_type', 'water_consumed_tsp', 'event_kcal', 'location_substrate', 'door_tell_observed', 'status_outcome', 'raw_input'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return cols.join(',') + '\n' + rows.map(r => cols.map(c => q(r[c])).join(',')).join('\n');
}
async function allHistory() {
  if (sbReady() && S.subject) {
    const { data } = await S.sb.from('telemetry_events').select('*').eq('subject_id', S.subject.id).order('logged_at');
    return data || [];
  }
  return S.history;
}
async function exportCSV() {
  const rows = await allHistory();
  download(`simba-events-${todayStr()}.csv`, toCSV(rows), 'text/csv');
  $('expStatus').textContent = `Exported ${rows.length} events.`;
}
async function exportMD() {
  const rows = await allHistory();
  const days = dayBuckets(rows);
  let md = `# Simba Telemetry — Daily Summary\n\nExported ${new Date().toLocaleString()}\n\n`;
  Object.keys(days).sort().forEach(d => {
    const evs = days[d];
    const kcal = evs.reduce((a, e) => a + (+e.event_kcal || 0), 0);
    const pees = evs.filter(isPee).length, poops = evs.filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length;
    const acc = evs.filter(e => /Accident/.test(e.elimination_type || '')).length;
    md += `## ${d}\n- Events: ${evs.length} · Pees: ${pees} · Poops: ${poops} · Accidents: ${acc} · Kcal: ${Math.round(kcal)}\n`;
    evs.forEach(e => { md += `- ${fmtTime(e.logged_at)} ${e.event_code || ''} **${e.elimination_type || e.category}** — ${e.status_outcome || e.raw_input || ''}\n`; });
    md += '\n';
  });
  download(`simba-summary-${todayStr()}.md`, md, 'text/markdown');
  $('expStatus').textContent = 'Markdown summary exported.';
}
async function exportXLSX() {
  const rows = await allHistory();
  const loadSheetJS = () => new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  try {
    await loadSheetJS();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
      Event_ID: r.event_code, Date: (r.logged_at || '').slice(0, 10), Timestamp: r.logged_at, Day: r.day_number,
      Category: r.category, Elimination: r.elimination_type, Fecal_Score: r.fecal_score,
      Kibble_tbsp: r.kibble_consumed_tbsp, Kibble_Type: r.kibble_type, Water_tsp: r.water_consumed_tsp,
      Kcal: r.event_kcal, Substrate: r.location_substrate, Door_Tell: r.door_tell_observed, Notes: r.status_outcome || r.raw_input,
    }))), 'Full_Master_Log');
    const days = dayBuckets(rows);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.keys(days).sort().map(d => {
      const evs = days[d];
      return { Date: d, Total_Events: evs.length, Pee_Count: evs.filter(isPee).length,
        Poop_Count: evs.filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length,
        Accidents: evs.filter(e => /Accident/.test(e.elimination_type || '')).length,
        Total_Kcal: Math.round(evs.reduce((a, e) => a + (+e.event_kcal || 0), 0)) };
    })), 'Daily_Summary');
    XLSX.writeFile(wb, `simba_master_telemetry_${todayStr()}.xlsx`);
    $('expStatus').textContent = 'XLSX workbook exported (2 sheets).';
  } catch (e) { $('expStatus').textContent = 'XLSX lib unavailable offline — exported CSV instead.'; exportCSV(); }
}

/* ---------- Auth ---------- */
async function renderAuth() {
  const inOut = !!S.user;
  $('signInBtn').hidden = inOut; $('signUpBtn').hidden = inOut; $('signOutBtn').hidden = !inOut;
  $('authEmail').disabled = inOut; $('authPass').disabled = inOut;
  $('authStatus').textContent = inOut ? `Signed in as ${S.user.email}` : 'Not signed in.';
}
async function signIn() {
  if (!S.sb) { toast('Connect Supabase first.'); return; }
  const { error } = await S.sb.auth.signInWithPassword({ email: $('authEmail').value.trim(), password: $('authPass').value });
  if (error) toast('Sign-in failed: ' + error.message); else { toast('Signed in ✓'); await refreshSession(); await syncOfflineQueue(); }
}
async function signUp() {
  if (!S.sb) { toast('Connect Supabase first.'); return; }
  const { error } = await S.sb.auth.signUp({ email: $('authEmail').value.trim(), password: $('authPass').value });
  toast(error ? 'Sign-up failed: ' + error.message : 'Account created — check email if confirmation is on, then sign in.');
}

/* ---------- Voice input (Web Speech API — free, no key) ---------- */
let recog = null, listening = false;
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('micStatus').textContent = 'Voice not supported in this browser — type instead.'; return; }
  if (listening) { recog.stop(); return; }
  recog = new SR(); recog.lang = 'en-US'; recog.interimResults = true;
  $('micBtn').classList.add('listening'); $('micLabel').textContent = 'LISTENING… TAP TO STOP';
  listening = true;
  let final = '';
  recog.onresult = ev => {
    let interim = '';
    for (const r of ev.results) { if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript; }
    $('micStatus').textContent = (final + interim).slice(-120);
  };
  recog.onend = () => {
    $('micBtn').classList.remove('listening'); $('micLabel').textContent = 'TAP TO SPEAK TELEMETRY';
    listening = false;
    if (final.trim()) { $('logText').value = final.trim(); $('micStatus').textContent = 'Heard ✓ — review and Parse.'; parseAndPreview(); }
    else $('micStatus').textContent = 'Did not catch that — try again.';
  };
  recog.onerror = e => { $('micStatus').textContent = 'Mic error: ' + e.error; };
  recog.start();
}
function parseAndPreview() {
  const raw = $('logText').value.trim();
  if (!raw) { toast('Enter or dictate something first.'); return; }
  const { event, notes } = parseTelemetry(raw);
  S.parsed = event;
  const rows = Object.entries(event).filter(([, v]) => v !== undefined && v !== '' && v !== 0 && v !== null)
    .map(([k, v]) => `<div><span class="k">${esc(k)}:</span> ${esc(v)}</div>`).join('');
  $('parsePreview').innerHTML = rows + (notes.length ? `<div class="muted">${notes.map(esc).join(' · ')}</div>` : '');
  $('parseCard').hidden = false;
}

/* ---------- Wiring + init ---------- */
function wire() {
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => show(b.dataset.screen));
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => show(b.dataset.goto));
  document.querySelectorAll('.dock-btn').forEach(b => b.onclick = () => quickLog(b.dataset.log));
  $('sheetSave').onclick = saveSheet; $('sheetCancel').onclick = closeSheet;
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });
  $('micBtn').onclick = toggleMic;
  $('parseBtn').onclick = parseAndPreview;
  $('discardParsedBtn').onclick = () => { S.parsed = null; $('parseCard').hidden = true; };
  $('saveParsedBtn').onclick = async () => {
    if (!S.parsed) return;
    const r = await saveEvent(S.parsed);
    if (r) { toast('Event saved ✓'); $('parseCard').hidden = true; $('logText').value = ''; S.parsed = null; await loadData(); checkNudges(); }
  };
  document.querySelectorAll('#trendRange button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#trendRange button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); S.trendRange = +b.dataset.range; renderTrends();
  });
  document.querySelectorAll('#kbTabs button').forEach(b => b.onclick = () => loadKnowledge(b.dataset.kb));
  $('buildPromptBtn').onclick = buildAuditPrompt;
  $('copyPromptBtn').onclick = () => { $('auditPrompt').select(); document.execCommand('copy'); toast('Prompt copied ✓'); };
  $('saveGeminiBtn').onclick = () => { localStorage.setItem(CFG.LS.GEMINI, $('geminiKey').value.trim()); toast('Gemini key saved on this device.'); };
  $('genGeminiBtn').onclick = generateWithGemini;
  $('expCsv').onclick = exportCSV; $('expMd').onclick = exportMD; $('expXlsx').onclick = exportXLSX;
  $('sbTest').onclick = testConnection;
  $('sbSave').onclick = () => {
    localStorage.setItem(CFG.LS.SB_URL, $('sbUrl').value.trim());
    localStorage.setItem(CFG.LS.SB_KEY, $('sbKey').value.trim());
    localStorage.removeItem(CFG.LS.OFFLINE);
    initSupabase(); toast('Saved. Sign in below.'); refreshSession();
  };
  $('offlineBtn').onclick = () => { localStorage.setItem(CFG.LS.OFFLINE, '1'); setSync(false); toast('Offline mode — events stay on this device.'); show('cockpit'); };
  $('signInBtn').onclick = signIn; $('signUpBtn').onclick = signUp;
  $('signOutBtn').onclick = async () => { await S.sb.auth.signOut(); S.user = null; S.events = []; renderAuth(); renderAll(); setSync(false); };
  $('cfgSave').onclick = () => {
    CFG.KCAL_MIN = +$('cfgKcalMin').value || 300; CFG.KCAL_MAX = +$('cfgKcalMax').value || 330;
    CFG.BEDTIME = $('cfgBedtime').value || '21:45'; CFG.DAY_ONE = $('cfgDayOne').value || '2026-09-01';
    saveCfg(); toast('Settings saved ✓'); renderCockpit();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderCockpit(); });
}

async function init() {
  loadCfg();
  $('sbUrl').value = localStorage.getItem(CFG.LS.SB_URL) || '';
  $('sbKey').value = localStorage.getItem(CFG.LS.SB_KEY) || '';
  $('geminiKey').value = localStorage.getItem(CFG.LS.GEMINI) || '';
  $('cfgKcalMin').value = CFG.KCAL_MIN; $('cfgKcalMax').value = CFG.KCAL_MAX;
  $('cfgBedtime').value = CFG.BEDTIME; $('cfgDayOne').value = CFG.DAY_ONE;
  wire();
  if (localStorage.getItem(CFG.LS.OFFLINE)) { setSync(false); renderAll(); }
  else if (initSupabase()) { await refreshSession(); }
  else { setSync(false); renderAll(); show('setup'); toast('Welcome — connect Supabase or use offline mode.'); }
  // 60-second deterministic engine tick (spec section 5)
  S.tickTimer = setInterval(() => { renderCockpit(); checkNudges(); }, 60000);
}
document.addEventListener('DOMContentLoaded', init);
