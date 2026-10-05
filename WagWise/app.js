/* =====================================================================
   WagWise PWA — app.js
   Single-file application logic. No build step. All deterministic
   physiological engines run on-device (ported from spec section 5).
   Supabase (Postgres + Auth + RLS) is the only backend.
   ===================================================================== */
'use strict';

/* ---------------- Configuration ---------------- */
const APP_VERSION = '3.18.0'; // shown in More → About so you can confirm you're on the latest
const CFG = {
  SCHEMA: 'simba_telemetry',          // one schema per app (team convention)
  KCAL_MIN: 300, KCAL_MAX: 330,       // daily intake target (configurable in Setup)
  WATER_CUTOFF: '20:15',              // hard water cutoff (local time HH:MM)
  BEDTIME: '22:00',                   // v3.10 — master-log median lockdown 9:57 PM (was 21:45)
  PRE_BED_DRAIN_MIN: 10,              // pre-bed lawn drain = bedtime - this many min
  TARGET_AWAKE_HOLD: 75,              // v3.10 — master-log median awake hold (was 80)
  MEAL_WINDOW_MIN: 15,                // 15-minute dish pickup rule
  KCAL_PER_TBSP: { Chicken: 26.94, Salmon: 25.31, Blend: 26.13 }, // legacy; v3.6 uses FOODS
  KCAL_PER_TSP_GOATMILK: 3.5, // v3.16 — was 0.7 (wrong); USDA 21 kcal/fl oz → 3.5/tsp, matches researched snack value
  KCAL_PER_EGG: 70,
  ML_PER_TBSP: 14.78, ML_PER_TSP: 4.93,
  LS: { SB_URL: 'st_sb_url', SB_KEY: 'st_sb_key', GEMINI: 'st_gemini', OFFLINE: 'st_offline',
        CFG: 'st_cfg', DISMISSED: 'st_dismissed' },
};

/* v3.6 — Simba's foods with proper product names. kcal/tbsp = kcal/cup ÷ 16.
   kibble_type stores the full product name (no ambiguity in logs/exports);
   helpers below resolve ids, legacy 'Chicken'/'Salmon' values, and voice words. */
const FOODS = [
  { id: 'frontrunner', short: 'Frontrunner Puppy', name: 'Nulo Frontrunner Puppy — Chicken, Oats & Turkey (Ancient Grains)', kcalTbsp: 26.94, defaultTbsp: 3.5, kcalCup: 431, kcalSrc: 'bag' },
  { id: 'freestyle', short: 'FreeStyle Small Breed', name: 'Nulo FreeStyle Small Breed — Salmon & Lentils', kcalTbsp: 25.31, defaultTbsp: 0, kcalCup: 405, kcalSrc: 'bag' },
  { id: 'medalseries', short: 'MedalSeries Small Breed', name: 'Nulo MedalSeries Ancient Grains Small Breed — Salmon, Oats & Acadian Redfish', kcalTbsp: 26.69, defaultTbsp: 0, kcalCup: 427, kcalSrc: 'mfr' },
];
/* ---------- v3.11 — snack library ----------
   Portions researched 2026-10-04 (analysis/snack-portions.md):
   experts AKC Dr. Jerry Klein, Tufts Drs. Heinze/Freeman, WSAVA; kcal from
   USDA FoodData Central. puppy = portion for Simba NOW (~8 lbs, 18 wks),
   pre-filled in the sheet; adultMax = cap for adult Cavapoo (~13 lbs).
   Treats+snacks combined must stay ≤10% of daily kcal (~30-33 kcal). */
const SNACKS = [
  { id: 'pumpkin', name: 'Pumpkin puree', emoji: '🎃', unit: 'tsp', units: 'tsp', puppy: 1, adultMax: 2, kcalPerUnit: 1.7, words: ['pumpkin'], note: 'Plain canned only — never pie filling' },
  { id: 'yogurt', name: 'Plain yogurt', emoji: '🥛', unit: 'tsp', units: 'tsp', puppy: 2, adultMax: 3, kcalPerUnit: 3, words: ['yogurt', 'yoghurt'], note: 'Unsweetened, no xylitol/birch sugar' },
  { id: 'goatmilk', name: 'Goat milk', emoji: '🐐', unit: 'tsp', units: 'tsp', puppy: 2, adultMax: 4, kcalPerUnit: 3.5, words: ['goat milk', 'goatmilk'], note: 'Easier to digest than cow milk' },
  { id: 'cheese', name: 'Cheese cube', emoji: '🧀', unit: 'cube', units: 'cubes', puppy: 1, adultMax: 3, kcalPerUnit: 3, words: ['cheese'], note: 'Pea-size; low-fat mozzarella/cottage/goat — never blue cheese; occasional' },
  { id: 'tofu', name: 'Tofu cube', emoji: '🍢', unit: 'cube', units: 'cubes', puppy: 1, adultMax: 2, kcalPerUnit: 9, words: ['tofu'], note: 'Plain, cooked, unsalted; occasional' },
  { id: 'blueberry', name: 'Blueberries', emoji: '🫐', unit: 'berry', units: 'berries', puppy: 3, adultMax: 8, kcalPerUnit: 0.6, words: ['blueberr'], note: 'Halve for gulpy eaters' },
  { id: 'strawberry', name: 'Strawberry', emoji: '🍓', unit: 'berry', units: 'berries', puppy: 1, adultMax: 1, kcalPerUnit: 5, words: ['strawberr'], note: 'Sliced; higher sugar than blueberries' },
  { id: 'carrot', name: 'Baby carrot', emoji: '🥕', unit: 'piece', units: 'pieces', puppy: 1, adultMax: 2, kcalPerUnit: 2, words: ['carrot'], note: 'Cut into sticks for small dogs' },
  { id: 'greenbean', name: 'Green beans', emoji: '🫛', unit: 'bean', units: 'beans', puppy: 3, adultMax: 8, kcalPerUnit: 1.3, words: ['green bean', 'greenbean'], note: 'Plain only — no salt/butter/garlic' },
  { id: 'apple', name: 'Apple slice', emoji: '🍎', unit: 'slice', units: 'slices', puppy: 1, adultMax: 3, kcalPerUnit: 5, words: ['apple'], note: 'No seeds/core/stem' },
  { id: 'watermelon', name: 'Watermelon cube', emoji: '🍉', unit: 'cube', units: 'cubes', puppy: 2, adultMax: 5, kcalPerUnit: 3, words: ['watermelon'], note: 'Seedless flesh only, no rind' },
  { id: 'banana', name: 'Banana slice', emoji: '🍌', unit: 'slice', units: 'slices', puppy: 2, adultMax: 3, kcalPerUnit: 6, words: ['banana'], note: '¼-inch slices; high sugar — occasional only' },
];
/** Pure: food by id, defaulting to Frontrunner. Tested. */
function foodById(id) { return FOODS.find(f => f.id === id) || FOODS[0]; }
/** Pure: snack by id. Tested. */
function snackById(id) { return SNACKS.find(s => s.id === id) || SNACKS[0]; }
/* ---------- v3.16 — structured meal toppers with portions + kcal ----------
   Any of the 12 researched snacks can be logged as a meal topper with its
   portion; kcal = amount × kcalPerUnit flows into the meal's event_kcal so
   daily totals are real. Pure — tested. */
/** Pure: kcal for topper rows [{snack, amount}]. Tested. */
function topperKcal(rows) {
  return +rows.reduce((s, r) => s + (r.amount || 0) * ((r.snack || {}).kcalPerUnit || 0), 0).toFixed(1);
}
/** Pure: "Pumpkin puree 2 tsp + Blueberries 3 berries" (+ trailing notes). Tested. */
function buildToppersDetail(rows, notes) {
  const parts = (rows || []).filter(r => r.amount > 0).map(r => {
    const u = +r.amount === 1 ? r.snack.unit : r.snack.units;
    return `${r.snack.name} ${+r.amount} ${u}`;
  });
  if (notes && String(notes).trim()) parts.push(String(notes).trim());
  return parts.join(' + ');
}
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Pure: restore rows + notes from a stored toppers_detail (edit path). Tested. */
function parseToppersDetail(str) {
  const rows = []; let rest = ' ' + (str || '') + ' ';
  SNACKS.forEach(s => {
    const re = new RegExp(escRe(s.name) + '\\s+([\\d.]+)\\s+(' + escRe(s.unit) + '|' + escRe(s.units) + ')', 'i');
    const m = rest.match(re);
    if (m) { rows.push({ snackId: s.id, amount: +m[1] }); rest = rest.replace(re, ' '); }
  });
  return { rows, notes: rest.replace(/\s*\+\s*/g, ' ').trim() };
}
/** Pure: did this meal have a topper (structured row or egg mention)? Tested. */
function mealHasTopper(e) {
  if (!e || e.category !== 'Food') return false;
  const d = e.toppers_detail || '';
  if (parseToppersDetail(d).rows.length) return true;
  return /egg/i.test(d);
}
/** Pure: compare intake with vs without toppers over the trailing 14 days; verdict on dropping them. Tested. */
function topperEatingAnalysis(history, now = new Date()) {
  const meals = filterLastDays(history, 14, now).filter(e => e.category === 'Food');
  const withT = meals.filter(mealHasTopper);
  const plain = meals.filter(e => !mealHasTopper(e));
  const stats = arr => {
    const tb = arr.map(e => +e.kibble_consumed_tbsp || 0).filter(x => x > 0);
    return { n: arr.length, avgTbsp: tb.length ? tb.reduce((a, b) => a + b, 0) / tb.length : 0 };
  };
  const t = stats(withT), p = stats(plain);
  let verdict = 'not-enough-data', text;
  if (!meals.length) text = 'No meals logged in the last 14 days.';
  else if (p.n < 3 && !t.n) text = `Only ${p.n} plain meal(s) in the last 14 days — log a few more to judge.`;
  else if (!t.n) { verdict = 'eating-well'; text = `All ${p.n} recent meals were plain, averaging ${p.avgTbsp.toFixed(1)} tbsp — he's eating without toppers. Continue without.`; }
  else if (p.n < 3) { text = `Only ${p.n} plain meal(s) vs ${t.n} with toppers in the last 14 days — log a few more plain meals to judge.`; }
  else {
    const ratio = t.avgTbsp > 0 ? p.avgTbsp / t.avgTbsp : 1;
    if (ratio >= 0.9) { verdict = 'eating-well'; text = `Without toppers he's eating ${p.avgTbsp.toFixed(1)} tbsp/meal vs ${t.avgTbsp.toFixed(1)} with toppers (${p.n} plain vs ${t.n} topper meals) — he's eating it. Continue without toppers.`; }
    else { verdict = 'eating-less'; text = `Without toppers he's eating ${p.avgTbsp.toFixed(1)} tbsp/meal vs ${t.avgTbsp.toFixed(1)} with toppers — noticeably less. Keep a topper for now.`; }
  }
  return { topper: t, plain: p, verdict, text };
}
/** Pure: unit-aware amount for a snack mentioned in free text. Tested. */
function snackAmountFromWords(t, s, tbsp, tsp) {
  if (s.unit === 'tsp') return tsp || 0;
  if (s.unit === 'tbsp') return tbsp || 0;
  // v3.16 FIX: the old unit-words regex required the number directly before the
  // unit ('3 berries') and never matched '3 blueberries' — scan words instead.
  const units = ['piece', 'pieces', 'cube', 'cubes', 'berry', 'berries', 'slice', 'slices', 'bean', 'beans', 'carrot', 'carrots', 'stick', 'sticks'];
  const words = String(t).toLowerCase().split(/[^a-z0-9.]+/);
  const isUnit = w => units.some(u => w.endsWith(u)); // 'blueberries' endswith 'berries'
  for (let i = 0; i < words.length; i++) {
    if (!isUnit(words[i])) continue;
    for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
      const n = parseFloat(words[k]);
      if (isFinite(n)) return n;
    }
  }
  return 0;
}
/** Pure: build a snack event; amount clamped to the adult max. Tested. */
function buildSnackEvent(snackId, amount) {
  const s = snackById(snackId);
  let amt = +amount || 0;
  const clamped = amt > s.adultMax;
  if (clamped) amt = s.adultMax;
  const kcal = +(amt * s.kcalPerUnit).toFixed(1);
  return {
    snack: s, amount: amt, clamped, kcal,
    ev: {
      category: 'Snack', snack_name: s.name, snack_amount: amt, snack_unit: s.unit, event_kcal: kcal,
      status_outcome: `Snack: ${amt} ${amt === 1 ? s.unit : s.units} ${s.name.toLowerCase()} (~${kcal} kcal)`,
    },
  };
}
/** Pure: find the snack mentioned in free text, if any. Tested. */
function snackFromWords(t) {
  const low = String(t || '').toLowerCase();
  return SNACKS.find(s => s.words.some(w => low.includes(w))) || null;
}
/** Pure: resolve any stored kibble_type (id, short name, full name, legacy 'Chicken'/'Salmon', or a "Mix: ..." label) to a food. Tested. */
function foodFor(v) {
  const t = String(v || '').toLowerCase();
  if (!t) return FOODS[0];
  const byId = FOODS.find(f => f.id === t); if (byId) return byId;
  const byName = FOODS.find(f => f.name.toLowerCase() === t); if (byName) return byName;
  const byShort = FOODS.find(f => f.short.toLowerCase() === t); if (byShort) return byShort;
  if (/oat|redfish|medal|acadian/.test(t)) return foodById('medalseries');
  if (/freestyle|lentil|salmon/.test(t)) return foodById('freestyle'); // legacy 'Salmon' → his established salmon food
  return FOODS[0]; // legacy 'Chicken' or anything else → Frontrunner
}
/** Pure: full proper product name for a stored kibble_type. Tested. */
function foodLabel(v) { return foodFor(v).name; }
/** Pure: detect which food a voice/text note describes. Tested. */
function foodIdFromWords(t) {
  const x = String(t || '').toLowerCase();
  if (/oat|redfish|medal|acadian/.test(x)) return 'medalseries';
  if (/freestyle|lentil|salmon/.test(x)) return 'freestyle';
  return 'frontrunner'; // chicken/turkey or unspecified → his primary food
}
/** Pure: build the stored kibble_type label from meal components [{food, tbsp}].
    Single food → full product name (v3.6-compatible); a mix → "Mix: <full name> <tbsp> tbsp + ...". Tested. */
function buildMixLabel(comp) {
  const parts = comp.filter(c => c.tbsp > 0);
  if (!parts.length) return foodById('frontrunner').name;
  if (parts.length === 1) return parts[0].food.name;
  return 'Mix: ' + parts.map(c => `${c.food.name} ${+c.tbsp.toFixed(2)} tbsp`).join(' + ');
}
/** Pure: parse a stored kibble_type back into [{id, tbsp}] — tbsp is null for
    single/legacy foods (use the event's kibble_consumed_tbsp as the total). Tested. */
function parseMix(v) {
  const t = String(v || '').trim();
  const m = t.match(/^mix:\s*(.+)$/i);
  if (m) {
    return m[1].split(/\s*\+\s*/).map(p => {
      const pm = p.match(/^(.*?)\s+([\d.]+)\s*tbsp$/i);
      if (!pm) return null;
      return { id: foodFor(pm[1]).id, tbsp: parseFloat(pm[2]) };
    }).filter(Boolean);
  }
  return [{ id: foodFor(t).id, tbsp: null }];
}
/** Pure: events that count as fluid intake for the bladder model — bowl water,
    water added to a meal, or goat-milk toppers. Tested. */
function isFluidEvent(e) {
  return e.category === 'Water' ||
    (e.category === 'Food' && (+e.water_consumed_tsp || 0) > 0) ||
    (e.toppers_detail || '').includes('goat');
}
/** Pure: short human summary of a stored kibble_type for timelines/edits. Tested. */
function mixSummary(v) {
  const parts = parseMix(v);
  if (parts.length === 1 && parts[0].tbsp == null) return foodById(parts[0].id).short;
  return 'mix ' + parts.map(p => `${+p.tbsp.toFixed(2)} ${foodById(p.id).short}`).join(' + ');
}

/* Shared backend config (config.js) — one Supabase project for every app.
   The anon key is public by design; RLS (not the key) protects the data. */
const ST_CONFIG = window.ST_CONFIG || {};
function effectiveSbKey() {
  const k = ST_CONFIG.SUPABASE_ANON_KEY;
  if (k && !k.includes('PASTE')) return k;
  return localStorage.getItem(CFG.LS.SB_KEY) || '';
}

/* ---------------- Global state ---------------- */
const S = {
  sb: null,            // supabase-js client
  user: null,
  subject: null,       // active subject row (Simba)
  subjects: [],        // all visible subjects (own + household-shared) — v2.0 multi-pet
  events: [],          // today's events (local cache)
  history: [],         // last 90 days (for insights/trends)
  local: [],           // offline-mode queue (localStorage)
  online: false,
  tickTimer: null,
  sheetCtx: null,      // current modal context
  parsed: null,        // last parsed telemetry
  trendRange: 30,
  timelineRange: 1,    // v3.16.1 — timeline review range: 1=today, 2=yesterday, 7=last 7 days
  kbCache: {},
  dialType: 'All',     // clockface filter: All | Pee | Poop
  walk: null,          // active GPS walk {points, startTs, distM, watchId}
  meds: [], medLogs: [], vax: [],   // care tables (v2.0)
};

/* ---------------- Small utilities ---------------- */
const $ = id => document.getElementById(id);
const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
/** Pure: local calendar day for an ISO timestamp. Tested. */
const localDay = iso => { const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
/** Pure: is this ISO timestamp today (local)? Tested. */
const isToday = iso => localDay(iso) === todayStr();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = d => { d = new Date(d); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2,'0')} ${ap}`; };
const fmtDur = mins => mins < 60 ? `${Math.round(mins)}m` : `${Math.floor(mins/60)}h ${Math.round(mins%60)}m`;
/** Pure: 24h hour → "7 AM". Tested. */
function fmtHour(h) { h = ((Math.round(h) % 24) + 24) % 24; const ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12} ${ap}`; }
/** Pure: 24h hour + minutes → "7:05 AM". Tested. */
function fmtHM(h, m) { h = ((Math.round(h) % 24) + 24) % 24; const mm = String(Math.round(m || 0)).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${mm} ${ap}`; }
/** Pure: "20:15" → "8:15 PM". Tested. */
function fmtClock(hhmm) { const [h, m] = String(hhmm || '').split(':').map(Number); return fmtHM(h || 0, m || 0); }
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
  const url = ST_CONFIG.SUPABASE_URL || localStorage.getItem(CFG.LS.SB_URL);
  const key = effectiveSbKey();
  if (!url || !key || !window.supabase) return false;
  try {
    S.sb = window.supabase.createClient(url, key, { db: { schema: CFG.SCHEMA } });
    return true;
  } catch(e) { console.warn('supabase init failed', e); return false; }
}

function renderConnStatus(ok) {
  const el = $('connStatus'); if (!el) return;
  el.innerHTML = ok === true ? '<span class="conn-ok">● Connected — syncing automatically</span>'
    : ok === false ? '<span class="conn-bad">○ Not connected</span>'
    : '<span class="muted">Checking connection…</span>';
}
async function testConnection() {
  const url = ST_CONFIG.SUPABASE_URL, key = effectiveSbKey();
  if (!url || !key) { $('sbStatus').textContent = 'Built-in key not installed yet.'; renderConnStatus(false); return; }
  $('sbStatus').textContent = 'Testing…';
  try {
    const r = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    $('sbStatus').textContent = r.ok ? '✓ Connection OK (HTTP ' + r.status + ').' : '✗ HTTP ' + r.status + ' — check the Supabase project.';
    renderConnStatus(r.ok);
  } catch(e) { $('sbStatus').textContent = '✗ Network error: ' + e.message; renderConnStatus(false); }
}

async function refreshSession() {
  if (!S.sb) return;
  const { data: { session } } = await S.sb.auth.getSession();
  S.user = session?.user || null;
  renderAuth();
  if (S.user) {
    await claimHousehold(); await loadSubjects(); await loadCareTables(); await loadData();
    if (S._needsOnboard) { S._needsOnboard = false; openOnboard(false); }  // v2.1 first-run profile
    else maybeWeightPrompt();                                              // v2.1 monthly check-in
  }
  else { S.events = []; S.subject = null; S.subjects = []; renderAll(); }
  setSync(S.user ? true : false);
}

function setSync(on) {
  S.online = on;
  const el = $('syncState');
  // v2.2 — three honest states: synced / connected-but-signed-out / offline
  if (on && S.user) { el.textContent = '● synced'; el.classList.add('on'); }
  else if (S.sb && !localStorage.getItem(CFG.LS.OFFLINE)) { el.textContent = '○ not signed in'; el.classList.remove('on'); }
  else { el.textContent = '○ offline'; el.classList.remove('on'); }
}
/* v2.2 — offline mode that can be undone via Test & reconnect */
function goOffline() {
  localStorage.setItem(CFG.LS.OFFLINE, '1');
  S.sb = null; S.user = null;
  setSync(false); renderConnStatus(false); renderAll(); show('cockpit');
  toast('Offline mode — events stay on this device.');
}

/* v2.0 — Household: an invited email claims its membership row on first sign-in */
async function claimHousehold() {
  if (!sbReady() || !S.user?.email) return;
  try {
    await S.sb.from('household_members')
      .update({ user_id: S.user.id })
      .is('user_id', null)
      .eq('email', S.user.email.toLowerCase());
  } catch (e) { /* migration_v2 not run yet — household unavailable */ }
}

/* v2.0 — Multi-pet: load every subject visible to this user (own + household-shared).
   Falls back to the v1 single-subject flow when nothing is visible. */
/** Pure: should this user claim unclaimed subject rows? Tested. */
function needsClaim(subjects, isMember) {
  return !isMember && (subjects || []).some(s => !s.owner_id);
}
async function loadSubjects() {
  S.subjects = []; S.subject = null;
  if (!sbReady()) return;
  try {
    const { data, error } = await S.sb.from('subjects').select('*').order('created_at');
    if (error) throw error;
    S.subjects = data || [];
  } catch (e) { console.warn('subjects load failed', e); return; }
  let isMember = false;
  try {
    const { data: mem } = await S.sb.from('household_members').select('id').eq('user_id', S.user.id).limit(1);
    isMember = !!(mem && mem.length);
  } catch (e) { /* table missing pre-migration */ }
  // v2.8 — claim unclaimed (NULL-owner) rows so profile updates pass RLS.
  // (v2.0 dropped the v1 claim step; without it every subjects UPDATE fails
  // "new row violates row-level security policy". Household members never claim.)
  if (needsClaim(S.subjects, isMember)) {
    const { error } = await S.sb.from('subjects').update({ owner_id: S.user.id }).is('owner_id', null);
    if (!error) {
      const { data } = await S.sb.from('subjects').select('*').order('created_at');
      S.subjects = data || [];
    } else console.warn('subject claim failed', error);
  }
  if (!S.subjects.length) {
    // v2.1 — no silent auto-create: first-run users complete the onboarding
    // profile screen instead. Household members never onboard (they share).
    if (!isMember) S._needsOnboard = true;
  }
  const saved = localStorage.getItem('st_active_pet');
  S.subject = S.subjects.find(s => String(s.id) === String(saved)) || S.subjects[0] || null;
}

function switchSubject(id) {
  const s = S.subjects.find(x => String(x.id) === String(id));
  if (!s) return;
  S.subject = s;
  localStorage.setItem('st_active_pet', String(s.id));
  loadData();
}

/* v2.0 — is this user the owner of the active subject? (only owners manage household) */
function isSubjectOwner() {
  return !!(S.user && S.subject && S.subject.owner_id && S.subject.owner_id === S.user.id);
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
  // v3.0 — compare LOCAL calendar days: logged_at is UTC, so a UTC slice
  // hides everything logged after 8 PM EDT from "today"
  S.events = S.history.filter(e => isToday(e.logged_at));
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
 * v3.10 thresholds (CRITICAL 90m / ELEVATED 70m) tuned on the 33-day master log.
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
    // v3.10 — thresholds from 33-day master log: median verified awake hold = 75 min
    // (48% of routine holds tripped the old 75-min CRITICAL); accidents at 83–125 min.
    if (elapsed >= 90 || (timeSinceFluidMins >= 30 && timeSinceFluidMins <= 45 && estimatedVolumeMl > 18.0))
      accidentRisk = 'CRITICAL';
    else if (elapsed >= 70 || estimatedVolumeMl > 14.0)
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
  if (st.elapsedAwakeHoldMins >= 90 && // v3.10 — was 75; master-log median awake hold is 75
      st.minsSinceFluid >= 30 && st.minsSinceFluid <= 45 &&
      st.currentSubstrate === 'Living Room Carpet')
    alerts.push({ level: 'crit', text: 'CRITICAL: 90m awake hold converging with peak fluid filtration on carpet substrate. Carry to grass immediately.' });
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
  return last.crate_action === 'Crate_Entry' || last.crate_action === 'Nap_Start'; // v3.9 — nap/crate session still open
}
function liveState(now = new Date()) {
  const pee = lastElim(['Pee', 'Pee_Poop']);
  const lastVoidTs = pee ? new Date(pee.logged_at).getTime() : new Date(now).setHours(0,0,0,0);
  const fluids = S.events.filter(isFluidEvent); // v3.8 — meal water counts as fluid intake too
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
    waterBowlsPulled: localStorage.getItem('st_bowls') === todayStr(), // v3.15 — date-scoped: reset daily
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
  // v3.4 — ASR mangles "pm"/"am": "10:00 p." / "10 p.m." / "10 p m" → "10:00 pm"
  t = t.replace(/\b([ap])\.m\./g, '$1m');
  t = t.replace(/(?<![\d.])(\d{1,2}(?::\d{2})?)\s*([ap])\s*\.(?!\d)/g, '$1 $2m');
  t = t.replace(/(\d{1,2}(?::\d{2})?)\s+([ap])\s+m\b/g, '$1 $2m');
  // v3.2 — spoken clock times BEFORE single words are digitized:
  // "nine fifty-one" → 9:51, "ten oh five" → 10:05
  const HRS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12 };
  const TENSW = { twenty:20, thirty:30, forty:40, fifty:50 };
  const ONEW = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9 };
  const HW = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
  const OW = 'one|two|three|four|five|six|seven|eight|nine';
  t = t.replace(new RegExp(`\\b(${HW})[\\s-]+(twenty|thirty|forty|fifty)(?:[\\s-]+(${OW}))?\\b`, 'g'),
    (m, h, te, on) => ` ${HRS[h]}:${String(TENSW[te] + (on ? ONEW[on] : 0)).padStart(2, '0')} `);
  t = t.replace(new RegExp(`\\b(${HW})\\s+oh\\s+(${OW})\\b`, 'g'),
    (m, h, on) => ` ${HRS[h]}:0${ONEW[on]} `);
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
/* --- negation guard (v2.4): "did not poop" / "didn't pee" / "no poop yet" ---
   A negated mention must NEVER become a positive event — it is recorded as a
   Note (observation) instead, so the telemetry stays truthful. */
const NEG_SRC = "didn'?t|did not|doesn'?t|does not|hasn'?t|has not|haven'?t|have not|hadn'?t|had not|won'?t|will not|wouldn'?t|would not|couldn'?t|could not|never|without";
const NEG_GROUPS = [
  { id: 'pee', words: ['peed', 'pee', 'urinated', 'urination'] },
  { id: 'poop', words: ['pooped', 'poop', 'bowel movement', 'stool'] },
  { id: 'food', words: ['ate', 'eat', 'eating', 'food', 'kibble', 'meal', 'breakfast', 'lunch', 'dinner', 'fed'] },
  { id: 'water', words: ['drank', 'drink', 'drinking', 'water', 'hydration'] },
  { id: 'train', words: ['train', 'training', 'trained', 'sit', 'stay', 'recall', 'leash', 'session'] },
  { id: 'nap', words: ['nap', 'napping', 'crate', 'sleep', 'bedtime', 'den'] },
  { id: 'accident', words: ['accident', 'accidents'] },
];
function negatedGroups(t) {
  const neg = new Set();
  const clean = t.replace(/\bnot only\b/g, ' '); // "not only peed but also pooped" is positive
  const clauses = clean.split(/[.,;!?]+|\bbut\b|\band then\b|\bthen\b/);
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const cl of clauses) {
    for (const g of NEG_GROUPS) {
      for (const w of g.words) {
        const kw = escRe(w);
        const re = new RegExp(`\\b(?:${NEG_SRC})\\b(?:\\s+\\w+){0,3}\\s+\\b${kw}\\b|\\bno\\b\\s+\\b${kw}\\b`);
        if (re.test(cl)) { neg.add(g.id); break; }
      }
    }
  }
  return neg;
}
/* Resolve a spoken time. Explicit am/pm always wins. Otherwise assume the half
   of the day you're in (afternoon → PM, morning → AM). If the result would be
   in the future, fall back to the latest past occurrence. */
/* Daypart words ("evening", "this morning") pin the meridiem when no am/pm is said. */
function daypartOf(clause) {
  const c = ' ' + String(clause).toLowerCase() + ' ';
  if (/\btonight\b/.test(c)) return { mer: 'pm', today: true };
  if (/\bthis morning\b/.test(c)) return { mer: 'am', today: true };
  if (/\bthis afternoon\b/.test(c)) return { mer: 'pm', today: true };
  if (/\bthis evening\b/.test(c)) return { mer: 'pm', today: true };
  if (/\bmorning\b/.test(c)) return { mer: 'am', today: false };
  if (/\bafternoon\b|\bevening\b/.test(c)) return { mer: 'pm', today: false };
  if (/\bnight\b/.test(c)) return { mer: 'pm', today: false };
  return null;
}
function resolveTime(h, m, ap, now, dp) {
  const build = mer => {
    const d = new Date(now);
    d.setHours((h % 12) + (mer === 'pm' ? 12 : 0), m, 0, 0);
    return d;
  };
  if (ap) { const d = build(ap); if (d > now) d.setDate(d.getDate() - 1); return d; }
  if (dp) {
    const d = build(dp.mer);
    if (d > now && !dp.today) d.setDate(d.getDate() - 1);
    return d;
  }
  const assumed = now.getHours() >= 12 ? 'pm' : 'am';
  let d = build(assumed);
  if (d > now) d = build(assumed === 'pm' ? 'am' : 'pm');
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}
function parseTelemetry(raw, now = new Date()) {
  let t = wordsToNum(raw);
  t = t.replace(/\bpoop bags?\b/g, ' ').replace(/\bpee pads?\b|\bpotty pads?\b/g, ' '); // supplies, not telemetry
  const notes = [];
  const ev = { category: 'Note', raw_input: raw, location_substrate: 'Unknown' };
  // Word-boundary matching (avoids "ate" matching "water", "p " matching "poop")
  const has = (...ws) => ws.some(w => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t));
  const neg = negatedGroups(t);
  if (neg.size) notes.push('Negation noted (' + [...neg].join(', ') + ') — saved as observation, no event logged.');

  // --- elimination type ---
  const peeW = has('peed', 'pee', 'urinated', 'urination') && !neg.has('pee');
  const poopW = has('pooped', 'poop', 'bowel movement', 'stool') && !neg.has('poop');
  if ((/\baccident\b/.test(t) || has('inside', 'indoors', 'on the carpet', 'on carpet')) && !neg.has('accident')) {
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
  // v3.9.2 — "around his lunch hours" is a time reference, not a meal
  const mealTimeRef = /\b(around|after|before|during)\s+(his\s+|the\s+)?(breakfast|lunch|dinner)\s+(hours?|time)\b/i.test(t);
  if ((has('ate', 'food', 'kibble', 'meal', 'fed') || (!mealTimeRef && has('breakfast', 'lunch', 'dinner')) || tbsp > 0) && !neg.has('food')) {
    ev.category = 'Food';
    ev.kibble_offered_tbsp = tbsp || 0; ev.kibble_consumed_tbsp = tbsp || 0;
    ev.kibble_type = foodById(foodIdFromWords(t)).name; // v3.6 — which of Simba's three foods
    if (has('egg', 'eggs')) {
      const eggAmt = extractAmount(t, 'eggs?') || 0.5; // v3.16 — "2 eggs" → 2; default half
      ev.toppers_detail = (ev.toppers_detail || '') + ` scrambled egg (${eggAmt})`;
      ev.event_kcal = (ev.event_kcal || 0) + CFG.KCAL_PER_EGG * eggAmt;
    }
    if (has('goat')) { ev.toppers_detail = (ev.toppers_detail || '') + ' goat milk'; ev.event_kcal = (ev.event_kcal || 0) + 3 * CFG.KCAL_PER_TSP_GOATMILK; }
    ev.event_kcal = (ev.event_kcal || 0) + tbsp * foodFor(ev.kibble_type).kcalTbsp;
  }
  // v3.11 — snacks: "gave him a teaspoon of pumpkin puree", "3 blueberries as a snack".
  // v3.16 — "2 tsp pumpkin puree on his dinner" is a MEAL TOPPER: it joins the Food
  //   event (portion + kcal) instead of overwriting the meal as a Snack event.
  // Goat milk stays a food topper when meal words are present without the word "snack".
  const snackHit = snackFromWords(t);
  const snackWord = has('snack', 'treat', 'treats');
  const mealWord = has('ate', 'food', 'kibble', 'meal', 'fed', 'breakfast', 'lunch', 'dinner');
  const asMealTopper = snackHit && snackHit.id !== 'goatmilk' && mealWord && !snackWord && !neg.has('snack') && ev.category === 'Food';
  if (asMealTopper) {
    const s = snackHit, tamt = snackAmountFromWords(t, s, tbsp, tsp) || s.puppy;
    const tu = tamt == 1 ? s.unit : s.units;
    ev.toppers_detail = ((ev.toppers_detail ? ev.toppers_detail + ' + ' : '') + `${s.name} ${tamt} ${tu}`).trim();
    ev.event_kcal = (ev.event_kcal || 0) + +(tamt * s.kcalPerUnit).toFixed(1);
  } else if (snackHit && !neg.has('snack') && (snackWord || !mealWord || snackHit.id !== 'goatmilk')) {
    const s = snackHit;
    const built = buildSnackEvent(s.id, snackAmountFromWords(t, s, tbsp, tsp) || s.puppy);
    Object.assign(ev, built.ev);
  }
  if ((has('drank', 'water', 'hydration') || (tsp > 0 && !['Food', 'Snack'].includes(ev.category))) && !neg.has('water')) {
    if (ev.category === 'Note') ev.category = 'Water';
    ev.water_consumed_tsp = tsp || 2;
    if (ev.category === 'Water' && !ev.status_outcome) ev.status_outcome = `Drank ${ev.water_consumed_tsp} tsp water`; // v3.9.2
  }
  if (has('train', 'training', 'trained', 'sit', 'stay', 'recall', 'leash') && !neg.has('train')) ev.category = 'Training'; // v3.9.2 — bare "session" is ambiguous ("drinking session" ≠ training); "training session" still matches via "training"
  if (has('nap', 'napping', 'crate', 'sleep', 'bedtime', 'den') && !neg.has('nap')) {
    const wake = has('woke', 'wake', 'woken', 'out of crate');
    ev.category = has('nap', 'napping') ? 'Nap' : 'Crate';
    // v3.9 — explicit nap start/end
    ev.crate_action = ev.category === 'Nap' ? (wake ? 'Crate_Exit' : 'Crate_Entry') : (wake ? 'Crate_Wake' : 'Crate_Entry'); // v3.9.1
    if (ev.category === 'Nap') ev.status_outcome = wake ? 'Nap ended' : 'Nap started';
  }
  const wMatch = t.match(/(\d+(?:\.\d+)?)\s*lbs?/);
  if (wMatch && has('weigh', 'weighs', 'weighed', 'weight', 'lbs')) { ev.category = 'Weight'; ev.status_outcome = `Weight: ${wMatch[1]} lbs`; }

  // --- substrate mapping ---
  if (has('carpet', 'rug')) ev.location_substrate = 'Living Room Carpet';
  else if (has('grass', 'outside', 'out', 'yard', 'lawn')) ev.location_substrate = 'Lawn Grass';
  else if (has('tile', 'kitchen')) ev.location_substrate = 'Kitchen Tile';

  // --- door tell ---
  if (/\bby the door\b/.test(t) || /\bat the door\b/.test(t) || has('waiting at', 'hovering', 'went to the door')) { ev.door_tell_observed = true; notes.push('Door tell detected'); }

  // --- stream duration "3 to 4 second" ---
  const sMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*second/);
  if (sMatch) ev.stream_duration_seconds = +(((+sMatch[1] + +sMatch[2]) / 2).toFixed(1));
  const fsMatch = t.match(/(?:fecal|stool|purina)?\s*score\s*(\d)/);
  if (fsMatch) ev.fecal_score = Math.min(7, Math.max(1, +fsMatch[1]));

  // --- explicit time: LAST time mentioned wins ("out at 7:50 … peed at 7:52" → 7:52).
  // Bare times assume the current half of the day (afternoon → PM, morning → AM);
  // explicit am/pm always wins. "4 o'clock" works too.
  const rawT = t.replace(/(\d{1,2})\s*o'?clock/gi, '$1:00'); // v3.2 — run on wordsToNum'd text so "ten o'clock" works
  const timeMatches = findTimeMatches(rawT); // v2.9: shared finder (minutes, am/pm, or explicit "at")
  if (timeMatches.length) {
    const tm = timeMatches[timeMatches.length - 1];
    const d = resolveTime(+tm[1], +(tm[2] || 0), (tm[3] || '').toLowerCase(), now, daypartOf(t));
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
  document.body.classList.toggle('on-landing', name === 'landing'); // v2.2 — chromeless landing
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'trends') renderTrends();
  if (name === 'insights') renderInsights();
  if (name === 'timeline') renderTimeline();
  if (name === 'knowledge') loadKnowledge('specialized');
  if (name === 'ask') refreshAuditEvents();
  if (name === 'chat') { renderChat(); updateKbFresh(); } // v3.17 — Ask tab
  if (name === 'meds') renderMeds();
  if (name === 'report') renderVetReport();
  if (name === 'versions') renderVersions(); // v3.10 — data versions
  if (name === 'household') renderHousehold();
  if (name === 'walk') { renderWalkCard(); renderWalkHistory(); } // v2.2 — walk is its own tab
  if (name === 'landing') maybeShowInstall(); // v2.5 — surface the install prompt
  window.scrollTo(0, 0);
}

function renderAll() { renderGreeting(); renderCockpit(); renderTimeline(); }

/* ---------- Cockpit ---------- */
function renderCockpit() {
  // Subject header
  const wks = ageWeeks(S.subject?.date_of_birth || '2026-05-31');
  const kg = S.subject?.current_weight_kg || +(localStorage.getItem('st_weight') || 3.40);
  const wt = (kg * 2.20462).toFixed(2);
  const streak = S.subject?.clean_overnight_streak_days ?? 27;
  $('subjectName').textContent = (S.subject?.name || 'SIMBA').toUpperCase();
  $('subjectMeta').textContent = `${wks} weeks · ${wt} lbs · ${streak}-day clean streak`;
  renderSubjectSwitcher();   // v2.0 multi-pet
  renderLearnBannerCockpit();// v2.0 confidence / quiet start
  renderStreaks();           // v2.0 streaks & success rates

  // v3.9 — Nap tile reflects session state (tap to start / tap to end)
  const napBtn = document.querySelector('.dock-btn[data-log="Nap"]');
  if (napBtn) {
    const ns = napInProgress(allEvents());
    napBtn.innerHTML = ns ? `💤<span>End nap</span>` : `💤<span>Nap</span>`;
    napBtn.title = ns ? `Napping since ${fmtTime(ns.logged_at)} — tap to end` : 'Start a nap';
  }

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
  const fs = S.events.filter(isFluidEvent); // v3.8 — meal water counts too
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
/* ---------- v3.12 — "Next up" action panel ----------
   Data-driven action items with time windows + live countdowns. Recomputed
   from history on every render, so each logged event refreshes the windows.
   Pure where possible — tested. */
/* ---------- v3.13 — valid-data-only trend math ----------
   Days with almost nothing logged are NOT real data: they neither dilute
   probabilities nor break streaks, and the app reminds you to backfill them.
   A day counts as valid with ≥2 logged events (a single stray event — e.g.
   one pee then a forgotten day — is not a day of data). */
function validDayKeys(events, minEvents = 2) {
  const days = dayBuckets(events);
  return Object.keys(days).filter(k => days[k].length >= minEvents);
}
/** Pure: valid awake pee-to-pee holds (minutes) from sorted pee events. Tested.
    v3.13 — cap 240m (was 360): overnight sleep is ~9.7h, so anything longer is
    sleep or a missing-data span, never a valid awake hold. */
function awakeGaps(peesSorted) {
  const gaps = [];
  for (let i = 1; i < peesSorted.length; i++) {
    const g = (new Date(peesSorted[i].logged_at) - new Date(peesSorted[i - 1].logged_at)) / 60000;
    if (g > 10 && g < 240) gaps.push(g);
  }
  return gaps;
}

/* ---------- v3.14 — contextual hold model ----------
   The overall average is one input, not the whole story. Every valid awake
   pee-to-pee gap is classified by what happened DURING it, producing
   per-scenario median holds from his own history:
     postNap      — a nap ended inside the gap (highest-risk context)
     breakfast / lunch / dinner — a meal of that slot inside the gap
     postMeal     — any meal inside the gap
     postMealBig  — a ≥3 tbsp meal inside the gap
     postWater    — fluid intake inside the gap, no meal
     postWaterBig — ≥10 tsp fluid inside the gap, no meal
     baseline     — none of the above
   predictHold() picks the most specific context with ≥5 samples and blends it
   toward the overall average when the sample is thin. holdTrend() watches
   whether holds are stretching or shrinking week-over-week, so the model and
   its copy keep up as he matures. Recomputed on every save and every 60s tick
   — the algorithm re-tunes itself from each newly logged event. Pure — tested. */
/** Pure: which meal slot a timestamp falls in. Tested. */
function mealSlot(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 15) return 'lunch';
  if (h >= 15 && h < 21.5) return 'dinner';
  return 'other';
}
function medBucket(a) { return a.length ? { med: Math.round(medianNum(a)), n: a.length } : { med: null, n: 0 }; }
/** Pure: median clock time + median tbsp per meal slot (needs ≥3 samples per slot). Tested. */
function mealTimeSuggestions(history, now = new Date()) {
  const out = {};
  ['breakfast', 'lunch', 'dinner'].forEach(slot => {
    const ms = history.filter(e => e.category === 'Food' && mealSlot(new Date(e.logged_at)) === slot);
    if (ms.length < 3) return;
    const mins = ms.map(e => { const d = new Date(e.logged_at); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
    const tb = ms.map(e => +e.kibble_consumed_tbsp || 0).filter(x => x > 0);
    out[slot] = { n: ms.length, clockMin: Math.round(medianNum(mins)), avgTbsp: tb.length ? tb.reduce((a, b) => a + b, 0) / tb.length : 0 };
  });
  return out;
}
/** Pure: per-scenario median awake holds from history. Tested. */
function contextualHolds(events) {
  const pees = events.filter(isPee).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const evs = [...events].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const B = { overall: [], baseline: [], postNap: [], postMeal: [], breakfast: [], lunch: [], dinner: [], postMealBig: [], postWater: [], postWaterBig: [] };
  let lo = 0;
  for (let i = 1; i < pees.length; i++) {
    const t0 = new Date(pees[i - 1].logged_at).getTime(), t1 = new Date(pees[i].logged_at).getTime();
    const g = (t1 - t0) / 60000;
    if (!(g > 10 && g < 240)) continue; // valid awake hold only
    B.overall.push(g);
    while (lo < evs.length && new Date(evs[lo].logged_at).getTime() <= t0) lo++;
    let hi = lo;
    while (hi < evs.length && new Date(evs[hi].logged_at).getTime() < t1) hi++;
    const between = evs.slice(lo, hi);
    const hadNap = between.some(isNapEnd);
    const meals = between.filter(e => e.category === 'Food');
    const fluidTsp = between.filter(isFluidEvent).reduce((a, e) => a + (+e.water_consumed_tsp || 0), 0);
    const mealTbsp = meals.reduce((a, e) => a + (+e.kibble_consumed_tbsp || 0), 0);
    let bucketed = false;
    if (hadNap) { B.postNap.push(g); bucketed = true; }
    if (meals.length) {
      B.postMeal.push(g); bucketed = true;
      const slot = mealSlot(new Date(meals[meals.length - 1].logged_at));
      if (B[slot]) B[slot].push(g);
      if (mealTbsp >= 3) B.postMealBig.push(g);
    } else if (fluidTsp > 0) {
      B.postWater.push(g); bucketed = true;
      if (fluidTsp >= 10) B.postWaterBig.push(g);
    }
    if (!bucketed) B.baseline.push(g);
  }
  const out = {};
  for (const k of Object.keys(B)) out[k] = medBucket(B[k]);
  if (!out.overall.n) out.overall = { med: 75, n: 0 }; // v3.10 master-log fallback
  return out;
}
/** Pure: predicted hold for the current situation + what it's based on. Tested. */
function predictHold(ctx, cur) {
  // cur: { hadNap, mealSlot, mealTbsp, waterTsp }
  const ok = b => b && b.n >= 5 && b.med != null;
  let c = null, basis = 'overall average';
  if (cur.hadNap && ok(ctx.postNap)) { c = ctx.postNap; basis = 'post-nap'; }
  else if (cur.mealSlot && cur.mealSlot !== 'other' && ok(ctx[cur.mealSlot])) { c = ctx[cur.mealSlot]; basis = 'post-' + cur.mealSlot; }
  else if (cur.mealTbsp >= 3 && ok(ctx.postMealBig)) { c = ctx.postMealBig; basis = 'big-meal'; }
  else if ((cur.mealSlot || cur.mealTbsp > 0) && ok(ctx.postMeal)) { c = ctx.postMeal; basis = 'post-meal'; }
  if (!c && cur.waterTsp >= 10 && ok(ctx.postWaterBig)) { c = ctx.postWaterBig; basis = 'big-drink'; }
  if (!c && cur.waterTsp > 0 && ok(ctx.postWater)) { c = ctx.postWater; basis = 'post-drink'; }
  if (!c && ok(ctx.baseline)) { c = ctx.baseline; basis = 'baseline'; }
  if (!c) { c = ctx.overall; basis = c.n ? 'overall average' : 'typical puppy'; }
  const w = c.n >= 10 ? 0.7 : c.n >= 5 ? 0.5 : 0;
  const hold = Math.round(w ? w * c.med + (1 - w) * ctx.overall.med : ctx.overall.med);
  return { hold, basis, n: c.n, blended: w > 0 && w < 1 };
}
/** Pure: are holds stretching or shrinking? trailing-7d median vs prior 23d. Tested. */
function holdTrend(events, now) {
  const t = now.getTime(), recent = [], older = [];
  const pees = events.filter(isPee).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  for (let i = 1; i < pees.length; i++) {
    const g = (new Date(pees[i].logged_at) - new Date(pees[i - 1].logged_at)) / 60000;
    if (!(g > 10 && g < 240)) continue;
    const ageD = (t - new Date(pees[i].logged_at).getTime()) / 86400000;
    if (ageD < 0 || ageD > 30) continue;
    (ageD <= 7 ? recent : older).push(g);
  }
  if (recent.length < 8 || older.length < 8) return null; // not enough data to call it
  const r = medianNum(recent), o = medianNum(older), pct = Math.round((r - o) / o * 100);
  return Math.abs(pct) < 10 ? { dir: 'stable', pct } : { dir: pct > 0 ? 'stretching' : 'shrinking', pct };
}
/** Pure: median meal→next-pee latency per meal slot. Tested. */
function mealLatencyBySlot(events) {
  const evs = [...events].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const B = { overall: [], breakfast: [], lunch: [], dinner: [], other: [] };
  evs.forEach((e, i) => {
    if (e.category !== 'Food') return;
    const t0 = new Date(e.logged_at).getTime(), slot = mealSlot(new Date(e.logged_at));
    for (let j = i + 1; j < evs.length; j++) {
      const dt = (new Date(evs[j].logged_at).getTime() - t0) / 60000;
      if (dt > 240) break;
      if (isPee(evs[j])) { B.overall.push(dt); B[slot].push(dt); break; }
    }
  });
  const out = {};
  for (const k of Object.keys(B)) out[k] = medBucket(B[k]);
  return out;
}
/** Pure: most recent fluid-intake timestamp at or before nowMs. Tested. */
function lastFluidBefore(hist, nowMs) {
  const ts = hist.filter(isFluidEvent).map(e => new Date(e.logged_at).getTime()).filter(t => t <= nowMs).sort((a, b) => b - a)[0];
  return ts || null;
}
/** Current situation → predicted hold + plain-English guidance.
    Single source of truth for Next-up and What-to-expect (both tabs agree). */
function holdGuidance(hist, now) {
  const nowMs = now.getTime();
  const pees = hist.filter(isPee).map(e => new Date(e.logged_at).getTime()).filter(t => t <= nowMs).sort((a, b) => a - b);
  if (!pees.length) return null;
  const lastPeeT = pees[pees.length - 1];
  const after = hist.filter(e => { const t = new Date(e.logged_at).getTime(); return t > lastPeeT && t <= nowMs; });
  const hadNap = after.some(isNapEnd);
  const mealEv = after.filter(e => e.category === 'Food').pop();
  const waterTsp = after.filter(isFluidEvent).reduce((a, e) => a + (+e.water_consumed_tsp || 0), 0);
  const mealTbsp = mealEv ? (+mealEv.kibble_consumed_tbsp || 0) : 0;
  const ctx = contextualHolds(hist);
  const pred = predictHold(ctx, { hadNap, mealSlot: mealEv ? mealSlot(new Date(mealEv.logged_at)) : null, mealTbsp, waterTsp });
  const elapsed = Math.round((nowMs - lastPeeT) / 60000);
  const ratio = pred.hold ? elapsed / pred.hold : 1;
  return { ...pred, elapsed, lastPeeT, trend: holdTrend(hist, now), verdict: ratio < 0.6 ? 'fine' : ratio < 0.85 ? 'ontrack' : 'due' };
}
/** Pure: trailing n calendar days (excluding today) with zero logged events. Tested. */
function missingDays(hist, now, n = 14) {
  const days = dayBuckets(hist), out = [];
  const keys = Object.keys(days).sort();
  const first = keys.length ? keys[0] : todayStr(now);
  for (let i = 1; i <= n; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = todayStr(d);
    if (k < first) break; // never nag about before he started logging
    if (!days[k] || !days[k].length) out.push(k);
  }
  return out;
}
function medianNum(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
/** Pure: median minutes from meal end to next pee (within 4h), from history. Tested. */
function postMealPeeLatencyMin(events) {
  const evs = [...events].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const lat = [];
  evs.forEach((e, i) => {
    if (e.category !== 'Food') return;
    const t0 = new Date(e.logged_at).getTime();
    const nxt = evs.slice(i + 1).find(x => isPee(x) && (new Date(x.logged_at).getTime() - t0) <= 4 * 3600000);
    if (nxt) lat.push((new Date(nxt.logged_at).getTime() - t0) / 60000);
  });
  return Math.round(medianNum(lat) ?? 50);
}
/** Pure: median clock-minutes of the day's 2nd poop. Tested. */
function bowel2ClockMin(events) {
  const byDay = {};
  events.forEach(e => {
    if (!['Poop', 'Pee_Poop'].includes(e.elimination_type)) return;
    const d = new Date(e.logged_at), k = d.toDateString();
    (byDay[k] = byDay[k] || []).push(d.getHours() * 60 + d.getMinutes());
  });
  const seconds = Object.values(byDay).filter(a => a.length >= 2).map(a => a.sort((x, y) => x - y)[1]);
  return Math.round(medianNum(seconds) ?? (17 * 60 + 18)); // v3.10 master-log median 5:18 PM
}
/** Pure: median clock-minutes of the day's 1st poop (null when no data). Tested. */
function bowel1ClockMin(events) {
  const byDay = {};
  events.forEach(e => {
    if (!['Poop', 'Pee_Poop'].includes(e.elimination_type)) return;
    const d = new Date(e.logged_at), k = d.toDateString();
    (byDay[k] = byDay[k] || []).push(d.getHours() * 60 + d.getMinutes());
  });
  const firsts = Object.values(byDay).map(a => a.sort((x, y) => x - y)[0]);
  return firsts.length ? Math.round(medianNum(firsts)) : null;
}
/** Pure: today's upcoming nap predictions — ideal start, typical span, predicted wake.
    A live in-progress nap comes first (predicts its wake). Tested.
    v3.18 — 30% threshold (was 50%) with ≥2 cluster days, so rarer naps (e.g. an
    evening catnap) still surface; each row shows its % of days so weaker ones
    are honest. */
function upcomingNaps(hist, today, now = new Date()) {
  const pairs = pairNaps(hist).filter(p => p.mins > 0 && p.mins < 300);
  const medDur = ms => Math.round(medianNum(ms.length ? ms : pairs.map(p => p.mins)) || 90);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startsToday = today.filter(isNapStart).map(e => { const d = new Date(e.logged_at); return d.getHours() * 60 + d.getMinutes(); });
  const out = [];
  const inProg = napInProgress(today);
  if (inProg) {
    const d = new Date(inProg.logged_at), sMin = d.getHours() * 60 + d.getMinutes();
    const dur = medDur([]);
    out.push({ kind: 'live', startMin: sMin, durMin: dur, wakeMin: sMin + dur, prob: 1, days: 0 });
  }
  learnedWindows(hist, isNapStart, 'Nap', 0.3).forEach(w => {
    if (w.clusterDays < 2) return; // v3.18 — one-off naps aren't a schedule
    const wStart = w.start * 60, wEnd = w.end * 60 + 59;
    if (wEnd <= nowMin - 30) return; // window fully past
    if (startsToday.some(m => m >= wStart - 30 && m <= wEnd)) return; // already napped in this slot
    const starts = hist.filter(isNapStart).map(e => { const d = new Date(e.logged_at); return d.getHours() * 60 + d.getMinutes(); })
      .filter(m => m >= wStart - 30 && m <= wEnd);
    if (!starts.length) return;
    const ideal = Math.round(medianNum(starts));
    const durs = pairs.filter(p => { const d = new Date(p.start.logged_at); const m = d.getHours() * 60 + d.getMinutes(); return m >= wStart - 30 && m <= wEnd; }).map(p => p.mins);
    const dur = medDur(durs);
    out.push({ kind: 'window', startMin: ideal, durMin: dur, wakeMin: ideal + dur, prob: w.prob, days: w.clusterDays });
  });
  return out;
}
/** Pure: median nap-end → next pee/poop latency in minutes (null when <3 samples). Tested. */
function postNapLatencyMin(history, elimType) {
  const evs = [...history].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const lats = [];
  evs.forEach((e, i) => {
    if (!isNapEnd(e)) return;
    const t0 = new Date(e.logged_at).getTime();
    for (let j = i + 1; j < evs.length; j++) {
      const dt = (new Date(evs[j].logged_at).getTime() - t0) / 60000;
      if (dt > 120) break;
      if (evs[j].elimination_type === elimType) { lats.push(dt); break; }
    }
  });
  return lats.length >= 3 ? Math.round(medianNum(lats)) : null;
}
/** Pure: countdown text for an action item. Tested. */
function actionCountdownText(it, nowMs) {
  if (it.done) return 'done ✓';
  const s = it.winStart.getTime(), e = it.winEnd.getTime();
  if (nowMs < s) return 'in ' + fmtDur((s - nowMs) / 60000);
  if (nowMs <= e) return 'now · ' + fmtDur((e - nowMs) / 60000) + ' left';
  return 'missed';
}
/** Pure: build the ordered action items. doneMap = {id:1} manual check-offs,
    skipMap = {id:timestamp} "didn't go" skips → next slot. Tested. */
function buildNextActions(hist, today, st, now, doneMap, avgHold, skipMap) {
  const nowMs = now.getTime();
  let items = []; // v3.17.5 — reassigned by the nap-overlap filter below
  let napSpans = []; // v3.17.5 — predicted nap spans [{s, e}] as Dates, for overlap suppression
  const atHM = (h, m, dayOff = 0) => { const d = new Date(now); d.setDate(d.getDate() + dayOff); d.setHours(h, m, 0, 0); return d; };
  const hmParts = s => s.split(':').map(Number);
  const peeAt = e => new Date(e.logged_at).getTime();
  const mk = (id, icon, label, winStart, winEnd, why, done) =>
    ({ id, icon, label, winStart, winEnd, why,
       autoDone: !!done, manualDone: !!((doneMap || {})[id]),
       done: !!(done || (doneMap || {})[id]) });
  const [wch, wcm] = hmParts(CFG.WATER_CUTOFF), wc = atHM(wch, wcm);
  const [bh, bm] = hmParts(CFG.BEDTIME), bed = atHM(bh, bm);
  // 0. meal dish pickup
  if (st.mealInProgress && st.lastMealAt) {
    const end = new Date(new Date(st.lastMealAt).getTime() + CFG.MEAL_WINDOW_MIN * 60000);
    if (end.getTime() > nowMs) items.push(mk('dish-pickup', '🍽️', 'Dish pickup', end, end, `${CFG.MEAL_WINDOW_MIN}-min food pickup rule`, false));
  }
  // 1. post-nap take-out — highest-risk window
  const lastWake = today.filter(isNapEnd).map(e => peeAt(e)).sort((a, b) => b - a)[0];
  if (!st.asleep && lastWake && (nowMs - lastWake) / 60000 <= 30 && !today.some(e => isPee(e) && peeAt(e) > lastWake))
    items.push(mk('nap-out', '⏰', 'Take out — just woke up', new Date(nowMs), new Date(nowMs + 15 * 60000),
      'post-nap = highest-risk window', false));
  // 2. post-meal potty break — v3.15: plain-words copy ("what does the intercept mean?"
  //    → it catches the post-meal bladder urge before he goes inside). Done when he
  //    peed OR pooped within 1–130 min after the meal — the outing already happened.
  const meals = today.filter(e => e.category === 'Food');
  const lastMeal = meals.length ? peeAt(meals[meals.length - 1]) : null;
  if (lastMeal && (nowMs - lastMeal) / 60000 <= 100) {
    const latBySlot = mealLatencyBySlot(hist);
    const slot = mealSlot(new Date(lastMeal));
    const slotLat = latBySlot[slot] && latBySlot[slot].n >= 5 ? latBySlot[slot] : null;
    const lat = slotLat ? slotLat.med : postMealPeeLatencyMin(hist);
    const c = lastMeal + lat * 60000;
    const outAfterMeal = today.some(e =>
      (isPee(e) || e.elimination_type === 'Poop') &&
      (peeAt(e) - lastMeal) > 60000 && (peeAt(e) - lastMeal) < 130 * 60000);
    const mealTbsp = +meals[meals.length - 1].kibble_consumed_tbsp || 0;
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    items.push(mk('meal-intercept', '🍽️', 'Post-meal potty break', new Date(c - 10 * 60000), new Date(c + 10 * 60000),
      `🍽️ ${cap(slot)} moves his bladder ~${lat}m after the meal${mealTbsp ? ` (${mealTbsp} tbsp)` : ''} — catch it before he goes inside`, outAfterMeal));
  }
  // 2b. meal windows — v3.17.2: suggested meal times from his own history
  // (median clock time per slot, ≥3 samples). Skips slots already logged today
  // and windows that fully passed.
  const loggedSlots = new Set(today.filter(e => e.category === 'Food').map(e => mealSlot(new Date(e.logged_at))));
  const sugg = mealTimeSuggestions(hist, now);
  [['breakfast', '🍳'], ['lunch', '🍽️'], ['dinner', '🌙']].forEach(([slot, icon]) => {
    const s = sugg[slot];
    if (!s || loggedSlots.has(slot)) return;
    const c = atHM(Math.floor(s.clockMin / 60), s.clockMin % 60);
    if (nowMs > c.getTime() + 45 * 60000) return;
    const label = slot.charAt(0).toUpperCase() + slot.slice(1) + ' window';
    items.push(mk('meal-' + slot, icon, label,
      new Date(c.getTime() - 10 * 60000), new Date(c.getTime() + 10 * 60000),
      `avg ${fmtTime(c)}${s.avgTbsp ? ` · ${s.avgTbsp.toFixed(1)} tbsp` : ''} (${s.n} meals, your history)`, false));
  });
  // 2c. nap schedule — v3.17.5: the row shows the WHOLE span (avg start → avg end);
  // the ±10 min drives the alert (ntfy fires 10 min before winStart), not the display.
  if (!st.asleep) {
    const naps = upcomingNaps(hist, today, now);
    const poopLat = postNapLatencyMin(hist, 'Poop');
    naps.forEach((n, i) => {
      const s = atHM(Math.floor(n.startMin / 60), n.startMin % 60);
      const w = atHM(Math.floor(n.wakeMin / 60), n.wakeMin % 60);
      napSpans.push({ s, e: w });
      const part = n.startMin < 12 * 60 ? 'Morning' : n.startMin < 17 * 60 ? 'Afternoon' : 'Evening';
      const span = `${fmtTime(s)}–${fmtTime(w)}`;
      if (n.kind === 'live') {
        items.push(mk('napwin-' + i, '😴', part + ' nap (in progress)', s, w,
          `down since ${fmtTime(s)} · up ~${fmtTime(w)} (${n.durMin}m typical)`, false));
      } else {
        const basis = `${Math.round(n.prob * 100)}% of days`;
        items.push(mk('napwin-' + i, '😴', part + ' nap', s, w,
          `avg start ${fmtTime(s)} → avg end ${fmtTime(w)} (${n.durMin}m nap, ${basis})`, false));
      }
      // v3.18 — after EVERY nap he goes out for a pee: the row is always shown.
      // With 3+ logged nap→pee latencies the timing is data-driven; until then
      // it defaults to 15 min after predicted wake and learns from his logs.
      const peeLat = postNapLatencyMin(hist, 'Pee');
      const lat = peeLat != null ? peeLat : 15;
      {
        const p = new Date(w.getTime() + lat * 60000);
        items.push(mk('nappee-' + i, '🚻', 'Post-nap pee', new Date(p.getTime() - 10 * 60000), new Date(p.getTime() + 10 * 60000),
          peeLat != null ? `~${lat}m after waking (${span} nap)` : `after every nap — take him out (~${lat}m after waking until your logs teach it better)`, false));
      }
      if (poopLat != null) {
        const p = new Date(w.getTime() + poopLat * 60000);
        items.push(mk('nappoop-' + i, '💩', 'Post-nap poop', new Date(p.getTime() - 10 * 60000), new Date(p.getTime() + 10 * 60000),
          `~${poopLat}m after waking (${span} nap)`, false));
      }
    });
  }
  // 3. general pee window — v3.14: contextual hold prediction + merged "what to expect"
  //    insight (skip/ontrack/due verdict, trend, filtration peak). Suppressed when nap-out is active.
  if (!st.asleep && !items.some(i => i.id === 'nap-out')) {
    const pees = today.filter(isPee), lastPeeT = pees.length ? peeAt(pees[pees.length - 1]) : null;
    const skipTs = (skipMap || {})['pee-window']; // v3.18 — ✕ "didn't go": re-anchor one hold after the skipped outing
    if (!lastPeeT && !skipTs) items.push(mk('pee-window', '🚻', 'Morning pee', new Date(nowMs), new Date(nowMs + 30 * 60000),
      'no pee logged yet today', false));
    else {
      const g = holdGuidance(hist, now);
      const hold = g ? g.hold : Math.round(avgHold);
      const anchor = skipTs || lastPeeT;
      const due = anchor + hold * 60000;
      const done = (nowMs - lastPeeT) < 25 * 60000;
      let why = g ? `${g.basis} hold ${g.hold}m (your history)` : `avg hold ${Math.round(avgHold)}m`;
      why += lastPeeT ? ` · last pee ${fmtTime(new Date(lastPeeT))}` : ' · no pee logged yet today';
      if (skipTs) why += ` · ⏭ didn't go at ${fmtTime(new Date(skipTs))} — next slot`;
      if (g) {
        why += g.verdict === 'fine' ? ' · ✅ skipping this trip is fine'
             : g.verdict === 'ontrack' ? ' · 🟡 on track' : ' · 🔴 due — take him out';
        if (g.trend && g.trend.dir !== 'stable')
          why += ` · ${g.trend.dir === 'stretching' ? '📈' : '📉'} holds ${g.trend.dir} (${g.trend.pct > 0 ? '+' : ''}${g.trend.pct}% this week)`;
        const fts = lastFluidBefore(hist, nowMs);
        if (fts) { const m = Math.round((nowMs - fts) / 60000); if (m > 20 && m < 50) why += ` · 💧 fluids ${m}m ago hitting now`; }
      }
      items.push(mk('pee-window', '🚻', 'Pee window', new Date(due - 15 * 60000), new Date(due + 15 * 60000), why, done));
    }
  }
  // 4. bowel #1 + #2 windows — v3.17.3: #1 predicted from median first-poop clock time
  const poops = today.filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length;
  if (poops === 0) {
    const b1 = bowel1ClockMin(hist);
    if (b1 != null) {
      const c1 = atHM(Math.floor(b1 / 60), b1 % 60);
      if (nowMs < c1.getTime() + 45 * 60000)
        items.push(mk('poop1', '💩', 'Morning bowel window', new Date(c1.getTime() - 10 * 60000), new Date(c1.getTime() + 10 * 60000),
          `bowel #1 median ${fmtTime(c1)} (your history)`, false));
    }
  }
  if (poops < 2) {
    const cmin = bowel2ClockMin(hist), c = atHM(Math.floor(cmin / 60), cmin % 60);
    if (nowMs < c.getTime() + 90 * 60000)
      items.push(mk('poop2', '💩', 'Bowel #2 window', new Date(c.getTime() - 10 * 60000), new Date(c.getTime() + 10 * 60000),
        `bowel #2 median ${fmtTime(c)} (your history)`, false));
  }
  // 5. water cutoff — v3.15: a real daily checkbox (manual check/uncheck via doneMap).
  //    The bowls-pulled flag itself is date-scoped in liveState, so yesterday's
  //    check-off never auto-completes today's item.
  if (nowMs < wc.getTime() + 30 * 60000)
    items.push(mk('water-cutoff', '💧', 'Hard water cutoff ' + fmtClock(CFG.WATER_CUTOFF), wc, wc,
      'shut down renal inflow for the night — pull the bowls', false));
  // 6. pre-bed drain + 7. crate lockdown
  const drain = new Date(bed.getTime() - CFG.PRE_BED_DRAIN_MIN * 60000);
  if (nowMs < bed.getTime())
    items.push(mk('drain', '🌙', 'Pre-bed lawn drain', drain, bed, 'reset bladder to true zero',
      today.some(e => isPee(e) && peeAt(e) > drain.getTime() - 30 * 60000)));
  if (nowMs < bed.getTime() + 20 * 60000)
    items.push(mk('crate', '💤', 'Overnight den lockdown ' + fmtClock(CFG.BEDTIME), bed, new Date(bed.getTime() + 15 * 60000),
      'covered crate + brown noise', false));
  // 8. tomorrow morning pee (evening lookahead)
  if (nowMs > bed.getTime() - 60 * 60000) {
    const morn = atHM(7, 43, 1); // v3.10 master-log median wake 7:43 AM
    items.push(mk('morning-pee', '🌅', 'Morning pee', new Date(morn.getTime() - 15 * 60000), new Date(morn.getTime() + 15 * 60000),
      'median wake 7:43 AM (your history)', false));
  }
  // v3.17.5 — a pee/poop prediction whose window falls inside a predicted nap span
  // is invalid (he's asleep — ADH suppression handles continence). Drop it; the
  // post-nap pee/poop predictions already cover the wake.
  if (napSpans.length) {
    const peePoopIds = ['pee-window', 'morning-pee', 'meal-intercept', 'poop1', 'poop2'];
    items = items.filter(a => {
      if (!peePoopIds.includes(a.id)) return true;
      const bad = napSpans.some(ns => a.winStart < ns.e && a.winEnd > ns.s);
      return !bad;
    });
  }
  // v3.15 — merge: when the meal urge and the hold-based window point at the same
  // outing (centers within 45m), show ONE "Potty break" row with both reasons
  // instead of two near-duplicate, seemingly contradictory rows.
  // v3.17.4 — same for a post-nap pee prediction overlapping the hold window.
  const center = a => (a.winStart.getTime() + a.winEnd.getTime()) / 2;
  const mergeInto = (keepId, dropId) => {
    const kI = items.findIndex(i => i.id === keepId || i.id.startsWith(keepId));
    const dI = items.findIndex(i => i.id === dropId || i.id.startsWith(dropId));
    if (kI < 0 || dI < 0) return;
    const k = items[kI], d = items[dI];
    if (!k.done && !d.done && Math.abs(center(k) - center(d)) <= 45 * 60000) {
      k.label = 'Potty break';
      k.winStart = new Date(Math.min(k.winStart.getTime(), d.winStart.getTime()));
      k.winEnd = new Date(Math.max(k.winEnd.getTime(), d.winEnd.getTime()));
      k.why = `${d.why} · ${k.why}`;
      items.splice(dI, 1);
    }
  };
  mergeInto('pee-window', 'meal-intercept');
  mergeInto('pee-window', 'nappee-');
  // v3.18 — ✕ "didn't go" skips on pee/poop rows. The hold-based pee window
  // re-anchors above; clock-based ones show greyed as skipped for today.
  const SKIP_RE = /^(pee-window|meal-intercept|nappee-\d+|nappoop-\d+|poop[12])$/;
  items.forEach(a => {
    a.skippable = SKIP_RE.test(a.id);
    a.skipped = a.skippable && a.id !== 'pee-window' && !!(skipMap || {})[a.id];
  });
  return items.sort((a, b) => a.winStart - b.winStart).slice(0, 9); // v3.17.4 — was 6; more predictions now, rows are compact
}
/* ---------- v3.13 — local action alerts (Notification API, $0, no server) ----------
   Fires as a Next-up window opens (10-min heads-up), once per item per day.
   Works while the app is open; browsers throttle background tabs, and a
   fully-closed PWA cannot wake itself — the agent check-in backstop remains
   the cover for that case (documented PWA limit). */
function ntfyOn() { return localStorage.getItem('ntfy') === '1' && 'Notification' in window && Notification.permission === 'granted'; }
function paintNtfyBtn() { const b = $('ntfyBtn'); if (!b) return; const on = ntfyOn(); b.textContent = on ? '🔔 on' : '🔔 off'; b.classList.toggle('primary', on); }
async function toggleNtfy() {
  if (!('Notification' in window)) { toast('Notifications not supported in this browser.'); return; }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { showNtfyHelp(perm); return; } // v3.14 — denied/dismissed gets a real fix-it guide, not a dead toast
  const on = localStorage.getItem('ntfy') === '1';
  localStorage.setItem('ntfy', on ? '0' : '1');
  toast(on ? 'Action alerts off.' : "Action alerts on — I'll ping you as windows open.");
  paintNtfyBtn(); renderCockpit();
}
/* v3.14 — once Chrome denies notification permission, no site can re-prompt.
   This sheet walks him to the exact toggle in Chrome Android site settings. */
function showNtfyHelp(perm) {
  closeNtfyHelp();
  const ov = document.createElement('div'); ov.id = 'ntfyHelp'; ov.className = 'ntfy-help-ov';
  const dismissed = perm === 'default';
  ov.innerHTML = `<div class="ntfy-help-card">
    <div class="ntfy-help-title">🔔 Alerts need permission</div>
    <div class="ntfy-help-body">${dismissed
      ? 'The permission prompt was dismissed. Tap <b>🔔 off</b> again and choose <b>Allow</b> when Chrome asks.'
      : 'Chrome is currently <b>blocking</b> notifications for WagWise, so I can\'t ask again from here. Fix it in 20 seconds:'}
    </div>
    ${dismissed ? '' : `<ol class="ntfy-help-steps">
      <li>Tap the <b>tune ◔ icon</b> (left of the address bar)</li>
      <li>Tap <b>Permissions</b></li>
      <li>Set <b>Notifications</b> to <b>Allow</b></li>
      <li>Come back here and tap <b>🔔 off</b> again</li>
    </ol>`}
    <div class="ntfy-help-btns">
      <button class="btn primary" id="ntfyRetry">Try again</button>
      <button class="btn" id="ntfyLater">Not now</button>
    </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) closeNtfyHelp(); });
  document.getElementById('ntfyRetry').onclick = () => { closeNtfyHelp(); toggleNtfy(); };
  document.getElementById('ntfyLater').onclick = closeNtfyHelp;
}
function closeNtfyHelp() { const o = document.getElementById('ntfyHelp'); if (o) o.remove(); }
function fireNtfy(a, win) {
  const title = `${a.icon} ${a.label}`, body = `${win} — ${a.why}`;
  const opts = { body, tag: 'nextup:' + todayStr() + ':' + a.id, icon: 'icons/icon-192.png' };
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(() => new Notification(title, opts));
    else new Notification(title, opts);
  } catch (e) { /* alerts are best-effort */ }
}
function renderCountdowns(st) {
  const box = $('countdowns'); const now = new Date(); const nowMs = now.getTime();
  const dayKey = 'actionDone:' + todayStr();
  const doneMap = JSON.parse(localStorage.getItem(dayKey) || '{}');
  const skipKey = 'actionSkip:' + todayStr(); // v3.18 — ✕ "didn't go" skips, date-scoped like check-offs
  const skipMap = JSON.parse(localStorage.getItem(skipKey) || '{}');
  const checkOff = id => { const d = JSON.parse(localStorage.getItem(dayKey) || '{}'); d[id] = 1; localStorage.setItem(dayKey, JSON.stringify(d)); renderCockpit(); };
  box.innerHTML = '';
  // v2.0 med/vax reminders keep their compact treatment
  careReminders().forEach(r => {
    const div = document.createElement('div'); div.className = 'countdown';
    div.innerHTML = `<span>${esc(r.label)}</span><span class="t">${fmtDur(r.ms / 60000)}${r.action ? ' <button class="btn small">done</button>' : ''}</span>`;
    if (r.action) div.querySelector('button').onclick = r.action;
    box.appendChild(div);
  });
  // v3.12 — data-driven action items with windows + live countdowns
  const actions = buildNextActions(eventsInDays(90), S.events, st, now, doneMap, personalAvgHold(), skipMap);
  // v3.13 — fire each alert once as its window opens (10-min heads-up)
  if (ntfyOn()) {
    const sentKey = 'ntfySent:' + todayStr(), sent = JSON.parse(localStorage.getItem(sentKey) || '{}');
    let changed = false;
    actions.forEach(a => {
      if (a.done || sent[a.id]) return;
      if (nowMs >= a.winStart.getTime() - 10 * 60000 && nowMs <= a.winEnd.getTime()) {
        const point = a.winStart.getTime() === a.winEnd.getTime();
        fireNtfy(a, point ? fmtTime(a.winStart) : `${fmtTime(a.winStart)}–${fmtTime(a.winEnd)}`);
        sent[a.id] = 1; changed = true;
      }
    });
    if (changed) localStorage.setItem(sentKey, JSON.stringify(sent));
  }
  paintNtfyBtn();
  actions.forEach(a => {
    const cd = a.skipped ? 'skipped' : actionCountdownText(a, nowMs);
    const point = a.winStart.getTime() === a.winEnd.getTime();
    const win = point ? fmtTime(a.winStart) : `${fmtTime(a.winStart)}–${fmtTime(a.winEnd)}`;
    const div = document.createElement('div');
    div.className = 'nextup' + ((a.done || a.skipped) ? ' done' : cd === 'missed' ? ' missed' : '');
    // v3.17.2 — compact rows: label · window · countdown on one line; the
    // explanation hides until you tap the row (less scrolling, info one tap away).
    // v3.18 — pee/poop rows also get ✕ ("didn't go" → next slot); skipped rows show ↩ to undo.
    div.innerHTML = `
      <div class="nu-main"><span class="nu-icon">${a.icon}</span>
        <div class="nu-body"><div class="nu-label">${esc(a.label)} <span class="nu-win">${win} · <span class="nu-count">${cd}</span></span></div>
        <div class="nu-why">${esc(a.why)}</div></div></div>
      <div class="nu-right">
        ${a.skipped ? `<button class="btn small" data-nuunskip="${a.id}" title="Undo skip">↩</button>`
          : !a.done ? `<button class="btn small" data-nu="${a.id}" title="Mark done">✓</button>${a.skippable ? ` <button class="btn small" data-nuskip="${a.id}" title="Didn't go — next slot">✕</button>` : ''}`
          : a.manualDone ? `<button class="btn small" data-nuundo="${a.id}" title="Uncheck">↩</button>` : ''}</div>`;
    div.querySelector('.nu-main').onclick = () => div.classList.toggle('open');
    const btn = div.querySelector('[data-nu]');
    if (btn) btn.onclick = () => {
      // v3.15 — date-scoped bowls flag: today's check-off never leaks into tomorrow
      if (a.id === 'water-cutoff') { localStorage.setItem('st_bowls', todayStr()); toast('Water bowls marked as pulled for today.'); }
      checkOff(a.id);
    };
    const unbtn = div.querySelector('[data-nuundo]');
    if (unbtn) unbtn.onclick = () => { // v3.13 — uncheck a mistaken tap
      const d = JSON.parse(localStorage.getItem(dayKey) || '{}'); delete d[a.id];
      localStorage.setItem(dayKey, JSON.stringify(d));
      if (a.id === 'water-cutoff') localStorage.removeItem('st_bowls'); // v3.15 — un-pull the bowls too
      renderCockpit(); toast('Unchecked.');
    };
    const skipBtn = div.querySelector('[data-nuskip]');
    if (skipBtn) skipBtn.onclick = () => { // v3.18 — ✕ didn't go: jump to the next slot
      const m = JSON.parse(localStorage.getItem(skipKey) || '{}');
      m[skipBtn.getAttribute('data-nuskip')] = Date.now();
      localStorage.setItem(skipKey, JSON.stringify(m));
      renderCockpit(); toast("Skipped — next slot's up.");
    };
    const unskipBtn = div.querySelector('[data-nuunskip]');
    if (unskipBtn) unskipBtn.onclick = () => { // v3.18 — undo a mistaken skip
      const m = JSON.parse(localStorage.getItem(skipKey) || '{}');
      delete m[unskipBtn.getAttribute('data-nuunskip')];
      localStorage.setItem(skipKey, JSON.stringify(m));
      renderCockpit(); toast('Skip undone.');
    };
    box.appendChild(div);
  });
  // v3.13 — missing-day reminder (those days are excluded from all trend math)
  const hist30 = eventsInDays(30);
  const vset = new Set(validDayKeys(hist30));
  if (vset.size >= 5) {
    const firstK = Object.keys(dayBuckets(hist30)).sort()[0];
    const miss = [];
    for (let i = 1; i <= 14 && miss.length < 14; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const k = todayStr(d);
      if (k < firstK) break; // never nag about before he started logging
      if (!vset.has(k)) miss.push(k); // zero logs OR too thin to count
    }
    if (miss.length) {
      const div = document.createElement('div'); div.className = 'nu-missing';
      const fmtD = k => new Date(k + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
      div.textContent = `📝 Skipped in trends (too little data): ${miss.slice(0, 4).map(fmtD).join(', ')}${miss.length > 4 ? ` +${miss.length - 4} more` : ''} — backfill to keep predictions sharp.`;
      box.prepend(div);
    }
  }
  if (!box.children.length) box.innerHTML = '<div class="muted">Nothing on the schedule.</div>';
}
function renderAlerts(alerts) {
  const card = $('alertCard'), list = $('alertList');
  if (!alerts.length) { card.hidden = true; return; }
  card.hidden = false;
  list.innerHTML = alerts.map(a => `<div class="alert ${a.level === 'crit' ? 'crit' : ''}">${esc(a.text)}</div>`).join('');
}

/* ---------- Quick-log dock ---------- */
const CAT_EMOJI = { Pee: '💧', Poop: '💩', Food: '🥩', Water: '🚰', Nap: '💤', Training: '🎯', Weight: '⚖️', Note: '📝', Elimination: '🚻', Crate: '💤', Snack: '🍪' };
/** Pure: quick-log-consistent icon for any event — pee/poop/accident resolve from elimination_type. Tested. */
function eventEmoji(ev) {
  const t = ev.elimination_type || '';
  if (/Accident/.test(t)) return '⚠️';
  if (/Pee/.test(t)) return '💧';
  if (/Poop/.test(t)) return '💩';
  return CAT_EMOJI[ev.category] || '•';
}

/** Pure: build an accident event from the sheet choices. Tested. */
function buildAccidentEvent(type, floor) {
  const isPee = type !== 'Poop';
  const carpet = floor === 'Carpet';
  return {
    category: 'Elimination',
    elimination_type: isPee ? 'Accident_Pee' : 'Accident_Poop',
    location_substrate: carpet ? 'Living Room Carpet' : 'Hard Floor',
    status_outcome: `Accident: ${isPee ? 'Pee' : 'Poop'} on ${carpet ? 'carpet' : 'hard floor'}`,
  };
}
/** Pure: build a poop event with fecal score. Tested. */
function buildPoopEvent(score) {
  const fs = Math.min(7, Math.max(1, parseInt(score, 10) || 4));
  return {
    category: 'Elimination', elimination_type: 'Poop',
    location_substrate: 'Lawn Grass', fecal_score: fs,
    status_outcome: `Poop (score ${fs})`,
  };
}
/* Segmented option rows inside sheets. */
function wireSeg(id, onPick) {
  const seg = $(id); if (!seg) return;
  seg.querySelectorAll('button').forEach(bt => bt.onclick = () => {
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === bt));
    if (onPick) onPick(bt.dataset.v);
  });
}
function segVal(id, fallback) {
  const b = document.querySelector(`#${id} button.active`);
  return b ? b.dataset.v : fallback;
}
/* v3.6 — food sheet helpers: each food remembers its own last-used amount (0 allowed). */
function lastFoodTbsp(fid) {
  try {
    const v = parseFloat(localStorage.getItem('st_food_tbsp_' + fid));
    if (isFinite(v) && v >= 0) return v;
  } catch (e) {}
  return foodById(fid).defaultTbsp;
}
/* v3.7 — meal-mix sheet helpers: read the three amounts, show the live total. */
function lastFoodWaterTsp() {
  try {
    const v = parseFloat(localStorage.getItem('st_food_water_tsp'));
    if (isFinite(v) && v >= 0) return v;
  } catch (e) {}
  return 0;
}
function readMixSheet() {
  return FOODS.map(f => ({ food: f, tbsp: (+($('fTbsp_' + f.id) || {}).value) || 0 }))
    .filter(c => c.tbsp > 0);
}
function refreshMixSheet() {
  const comp = readMixSheet();
  const totalTbsp = comp.reduce((s, c) => s + c.tbsp, 0);
  const egg = (+(($('fEgg') || {}).value)) || 0;
  const water = (+(($('fWaterTsp') || {}).value)) || 0;
  const rows = readTopperRows(); // v3.16 — structured toppers feed the kcal line
  const tKcal = topperKcal(rows);
  const kcal = comp.reduce((s, c) => s + c.tbsp * c.food.kcalTbsp, 0) + egg * CFG.KCAL_PER_EGG + tKcal;
  const hh = $('fMixHint');
  if (hh) hh.textContent = comp.length
    ? `Total ${+totalTbsp.toFixed(2)} tbsp (${comp.map(c => `${+c.tbsp.toFixed(2)} ${c.food.short}`).join(' + ')}) ≈ ${Math.round(kcal)} kcal incl. egg${tKcal ? ` + toppers (${Math.round(tKcal)})` : ''}${water ? ` + ${water} tsp water in food` : ''}`
    : 'Enter at least one food amount.';
}
/* v3.16 — structured topper rows (DOM). Prefills the researched puppy portion. */
function addTopperRow(snackId = 'pumpkin', amount = null) {
  const wrap = $('fTopperRows'); if (!wrap) return;
  const s0 = snackById(snackId);
  const div = document.createElement('div'); div.className = 'foodrow topperrow';
  const sel = document.createElement('select'); sel.className = 'tpPick';
  sel.innerHTML = SNACKS.map(s => `<option value="${s.id}">${s.emoji} ${esc(s.name)} · ${s.kcalPerUnit}/${s.unit}</option>`).join('');
  sel.value = s0.id;
  const amt = document.createElement('input');
  amt.type = 'number'; amt.className = 'tpAmt'; amt.min = '0'; amt.step = '0.5'; amt.inputMode = 'decimal';
  amt.placeholder = 'amt'; amt.value = amount != null ? amount : s0.puppy;
  const unit = document.createElement('span'); unit.className = 'tpUnit muted small';
  const del = document.createElement('button'); del.type = 'button'; del.className = 'btn small'; del.textContent = '✕'; del.title = 'Remove topper';
  const paint = () => { const s = snackById(sel.value); unit.textContent = (+amt.value || 0) === 1 ? s.unit : s.units; refreshMixSheet(); };
  sel.onchange = paint; amt.oninput = paint;
  del.onclick = () => { div.remove(); refreshMixSheet(); };
  div.append(sel, amt, unit, del); wrap.appendChild(div); paint();
}
function readTopperRows() {
  const rows = [];
  document.querySelectorAll('#fTopperRows .topperrow').forEach(div => {
    const pick = div.querySelector('.tpPick'), am = div.querySelector('.tpAmt');
    if (!pick || !am) return;
    const snack = snackById(pick.value), amount = +am.value || 0;
    if (amount > 0) rows.push({ snack, amount });
  });
  return rows;
}
/* v3.9 — nap start/end: the Nap tile toggles a nap session; sleep durations pair at render time. */
/** Pure: nap-start event (Nap_Start, or legacy Crate_Entry on a Nap). Tested. */
function isNapStart(e) { return e.category === 'Nap' && (e.crate_action === 'Nap_Start' || e.crate_action === 'Crate_Entry'); }
/** Pure: nap-end event (Nap_End, or legacy Crate_Exit / Crate_Wake on a Nap). Tested. */
function isNapEnd(e) { return e.category === 'Nap' && (e.crate_action === 'Nap_End' || e.crate_action === 'Crate_Exit' || e.crate_action === 'Crate_Wake'); }
/** Pure: the currently-open nap start event, or null. Tested. */
function napInProgress(evs) {
  const naps = evs.filter(e => isNapStart(e) || isNapEnd(e)).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const last = naps[naps.length - 1];
  return last && isNapStart(last) ? last : null;
}
/** Pure: pair nap starts with ends chronologically → [{start, end|null, mins}]. Tested. */
function pairNaps(evs) {
  const naps = evs.filter(e => isNapStart(e) || isNapEnd(e)).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const pairs = []; let open = null;
  for (const e of naps) {
    if (isNapStart(e)) { if (open) pairs.push({ start: open, end: null, mins: 0 }); open = e; }
    else if (open) { pairs.push({ start: open, end: e, mins: Math.max(0, Math.round((new Date(e.logged_at) - new Date(open.logged_at)) / 60000)) }); open = null; }
  }
  if (open) pairs.push({ start: open, end: null, mins: 0 });
  return pairs;
}
/** Pure: minutes slept for a nap-end event (pairs with the latest start at/before it). Tested. */
function napEndMins(endEv, evs) {
  const t = new Date(endEv.logged_at).getTime();
  const starts = evs.filter(e => isNapStart(e) && new Date(e.logged_at).getTime() <= t)
    .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
  return starts.length ? Math.max(0, Math.round((t - new Date(starts[0].logged_at).getTime()) / 60000)) : 0;
}
/** All events available locally (90-day history when synced, today's cache otherwise). */
function allEvents() { return (S.history && S.history.length ? S.history : S.events) || []; }
/* v3.9 — Nap tile toggles a nap session: tap to start, tap again to end. */
async function toggleNap() {
  const start = napInProgress(allEvents());
  if (start) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(start.logged_at).getTime()) / 60000));
    const r = await saveEvent({ category: 'Nap', crate_action: 'Crate_Exit', status_outcome: 'Nap ended' }); // v3.9.1 — nap end = crate exit
    if (r) { toast(`Nap ended — slept ${fmtDur(mins)} 💤`); await loadData(); renderCockpit(); checkNudges(); }
  } else {
    const r = await saveEvent({ category: 'Nap', crate_action: 'Crate_Entry', status_outcome: 'Nap started' }); // v3.9.1 — nap start = crate entry
    if (r) { toast('Nap started 💤 — tap Nap again to end'); await loadData(); renderCockpit(); checkNudges(); }
  }
}
function quickLog(category) {
  if (category === 'Nap') return toggleNap(); // v3.9 — start/end toggle
  if (category === 'Food' || category === 'Water') return openSheet(category);
  if (category === 'Snack') return openSheet('Snack'); // v3.11
  if (category === 'Accident') return openSheet('Accident');
  if (category === 'Poop') return openSheet('PoopScore');
  if (category === 'Weight') return openSheet('Weight');
  if (category === 'Note') return openSheet('Note');
  const ev = { category };
  if (category === 'Pee') { ev.category = 'Elimination'; ev.elimination_type = 'Pee'; ev.location_substrate = 'Lawn Grass'; }
  if (category === 'Training') { ev.status_outcome = 'Training session logged'; }
  saveEvent(ev).then(r => { if (r) { toast(`${category} logged ✓`); loadData(); checkNudges(); } });
}

/* ---------- Detail sheet (modal) ---------- */
function openSheet(kind, existing = null) {
  S.sheetCtx = { kind, existing };
  $('sheetTitle').textContent = (existing ? 'Edit ' : 'Log ') + kind;
  const b = $('sheetBody');
  if (kind === 'Food') {
    // v3.7 — meal mix: one amount per food, accumulated into a single meal event.
    // Egg + toppers apply ONCE to the whole meal, never per food.
    b.innerHTML = `
      <label class="lbl">Foods — tbsp of each</label>
      ${FOODS.map(f => `
      <div class="foodrow">
        <div class="foodrow-name"><b>${f.short}</b><span class="muted small">${esc(f.name)}</span></div>
        <input id="fTbsp_${f.id}" type="number" step="0.25" min="0" inputmode="decimal" value="${lastFoodTbsp(f.id)}">
      </div>`).join('')}
      <p class="muted small" id="fMixHint"></p>
      <label class="lbl">Egg — whole eggs, for the whole meal</label>
      <input id="fEgg" type="number" step="0.25" min="0" value="0.5">
      <label class="lbl">Water added to food (tsp) — for the whole meal</label>
      <input id="fWaterTsp" type="number" step="0.5" min="0" inputmode="decimal" value="0">
      <label class="lbl">Toppers — pick + portion <span class="hint">(kcal counted)</span></label>
      <div id="fTopperRows"></div>
      <button class="btn small" id="fAddTopper" type="button">＋ Add topper</button>
      <div class="hint" id="fTopperHint" style="margin-top:6px"></div>
      <label class="lbl">Notes (optional)</label>
      <input id="fTop" placeholder="e.g. extra notes">`;
    const updMix = () => refreshMixSheet();
    FOODS.forEach(f => { $('fTbsp_' + f.id).oninput = updMix; });
    $('fEgg').oninput = updMix; $('fWaterTsp').oninput = updMix;
    $('fWaterTsp').value = lastFoodWaterTsp();
    $('fAddTopper').onclick = () => addTopperRow(); // v3.16 — structured toppers
    // v3.17.1 — nudge the topper decision with his own recent data (option always stays)
    const taHint = topperEatingAnalysis(S.history, new Date());
    const hintEl = $('fTopperHint');
    if (hintEl) hintEl.textContent = taHint.verdict === 'eating-well' ? '💡 ' + taHint.text : '';
    refreshMixSheet();
  } else if (kind === 'Water') {
    b.innerHTML = `
      <label class="lbl">Water consumed (tsp)</label>
      <input id="wTsp" type="number" step="0.5" value="4">
      <label class="lbl">Notes</label>
      <input id="wNote" placeholder="e.g. after play">`;
  } else if (kind === 'Snack') {
    // v3.11 — snack picker: researched portions (puppy now vs adult max), capped at adult max
    b.innerHTML = `
      <label class="lbl">Snack</label>
      <select id="snPick">${SNACKS.map(s => `<option value="${s.id}">${s.emoji} ${esc(s.name)}</option>`).join('')}</select>
      <p class="muted small" id="snGuide"></p>
      <label class="lbl">Amount (<span id="snUnitLbl">tsp</span>)</label>
      <div class="foodrow"><input id="snAmt" type="number" step="0.5" min="0" inputmode="decimal">
      <button class="btn small" id="snPuppyBtn" type="button">Use puppy portion</button></div>
      <p class="muted small" id="snKcal"></p>`;
    const refreshSnackSheet = () => {
      const s = snackById($('snPick').value);
      $('snUnitLbl').textContent = s.units;
      $('snGuide').textContent = `Puppy portion now: ${s.puppy} ${s.puppy === 1 ? s.unit : s.units} · Adult max: ${s.adultMax} ${s.units} · ~${s.kcalPerUnit} kcal/${s.unit}. ${s.note}.`;
      const amt = +$('snAmt').value || 0;
      $('snKcal').textContent = amt > 0 ? `≈ ${(amt * s.kcalPerUnit).toFixed(1)} kcal` : '';
    };
    $('snPick').onchange = () => { const s = snackById($('snPick').value); $('snAmt').value = s.puppy; refreshSnackSheet(); };
    $('snAmt').oninput = refreshSnackSheet;
    $('snPuppyBtn').onclick = () => { const s = snackById($('snPick').value); $('snAmt').value = s.puppy; refreshSnackSheet(); };
    $('snAmt').value = SNACKS[0].puppy;
    refreshSnackSheet();
  } else if (kind === 'Accident') {
    // v3.0 — quick-log accident: type + floor
    $('sheetTitle').textContent = 'Log accident';
    b.innerHTML = `
      <label class="lbl">Type</label>
      <div class="seg" id="aTypeSeg"><button data-v="Pee" class="active">💧 Pee</button><button data-v="Poop">💩 Poop</button></div>
      <label class="lbl">Floor type</label>
      <div class="seg" id="aFloorSeg"><button data-v="Hard" class="active">Hard floor</button><button data-v="Carpet">Carpet</button></div>
      <p class="muted small">Saved as an indoor accident — counts against the success rate.</p>`;
    wireSeg('aTypeSeg'); wireSeg('aFloorSeg');
  } else if (kind === 'PoopScore') {
    // v3.0 — quick-log poop: fecal score picker
    $('sheetTitle').textContent = 'Log poop';
    const descs = { 1: 'Hard pellets', 2: 'Firm', 3: 'Log-shaped', 4: 'Soft log · ideal', 5: 'Soft blobs', 6: 'Mushy', 7: 'Watery' };
    b.innerHTML = `
      <label class="lbl">Fecal score (1–7)</label>
      <div class="seg" id="pScoreSeg">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button data-v="${n}"${n === 4 ? ' class="active"' : ''}>${n}</button>`).join('')}</div>
      <p class="muted small" id="pScoreHint">${descs[4]}</p>`;
    wireSeg('pScoreSeg', v => { const h = $('pScoreHint'); if (h) h.textContent = descs[v] || ''; });
  } else if (kind === 'Weight') {
    b.innerHTML = `<label class="lbl">Weight (lbs)</label><input id="wtLbs" type="number" step="0.05" placeholder="7.60">`;
  } else if (kind === 'WeightPrompt') {
    // v2.1 — monthly check-in: update or skip (either way we ask again next month)
    $('sheetTitle').textContent = 'Monthly weight check-in';
    const lbs = S.subject?.current_weight_kg ? (S.subject.current_weight_kg * 2.20462).toFixed(2) : '';
    b.innerHTML = `<p class="muted">How much does <b>${esc(S.subject?.name || 'your dog')}</b> weigh today? Update it below \u2014 or skip and we\u2019ll ask again next month.</p>
      <label class="lbl">Weight (lbs)</label>
      <input id="wpLbs" type="number" step="0.05" inputmode="decimal" value="${lbs}" placeholder="${lbs || 'e.g. 7.6'}">`;
    $('sheetSave').textContent = 'Update weight';
    $('sheetCancel').textContent = 'Skip';
    $('sheetCancel').onclick = () => { localStorage.setItem('st_weight_prompt', String(Date.now())); closeSheet(); };
  } else if (kind === 'Note') {
    b.innerHTML = `<label class="lbl">Note</label><textarea id="nText" rows="3" placeholder="Behavior, training, vet…"></textarea>`;
  } else if (kind === 'Pet') {
    // v2.0 — multi-pet profiles
    $('sheetTitle').textContent = 'Add pet';
    b.innerHTML = `
      <label class="lbl">Name</label>
      <input id="pName" placeholder="e.g. Simba" autocomplete="off">
      <label class="lbl">Breed</label>
      <input id="pBreed" placeholder="e.g. Cavapoo" autocomplete="off">
      <label class="lbl">Date of birth</label>
      <input id="pDob" type="date">
      <label class="lbl">Sex</label>
      <select id="pSex"><option>male</option><option>female</option></select>
      <label class="lbl">Weight (kg)</label>
      <input id="pKg" type="number" step="0.05" placeholder="3.40">`;
  } else if (kind === 'Edit') {
    // v2.7 — edit ANY event: time, category, type, location, numerics, notes
    const ev = existing;
    $('sheetTitle').textContent = 'Edit event';
    const cats = ['Elimination', 'Food', 'Water', 'Nap', 'Training', 'Weight', 'Note'];
    b.innerHTML = `
      <label class="lbl">Time</label>
      <input id="eAt" type="datetime-local" value="${nowLocalInput(new Date(ev.logged_at))}">
      <label class="lbl">Category</label>
      <select id="eCat">${cats.map(c => `<option${c === ev.category ? ' selected' : ''}>${c}</option>`).join('')}</select>
      <div id="eTypeWrap"><label class="lbl">Type</label><select id="eType"></select></div>
      <label class="lbl">Location</label>
      <input id="eLoc" value="${esc(ev.location_substrate || '')}" placeholder="e.g. Lawn Grass">
      <div data-enums="Food" hidden>
        ${parseMix(ev.kibble_type).length > 1
          ? `<label class="lbl">Food</label><p class="muted small">${esc(mixSummary(ev.kibble_type))} — full product names in the log.<br>To change the mix amounts, edit this event from the timeline (Food opens the meal editor).</p>`
          : `<label class="lbl">Food</label><select id="eFood">${FOODS.map(f => `<option value="${f.id}"${foodFor(ev.kibble_type).id === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`}
        <label class="lbl">kcal</label><input id="eKcal" type="number" step="1" value="${ev.event_kcal || 0}">
        <label class="lbl">Kibble (tbsp)</label><input id="eTbsp" type="number" step="0.25" value="${ev.kibble_consumed_tbsp || 0}">
        <label class="lbl">Water in food (tsp)</label><input id="eFoodTsp" type="number" step="0.5" value="${ev.water_consumed_tsp || 0}">
      </div>
      <div data-enums="Water" hidden>
        <label class="lbl">Water (tsp)</label><input id="eTsp" type="number" step="0.5" value="${ev.water_consumed_tsp || 0}">
      </div>
      <div data-enums="Elimination" hidden>
        <label class="lbl">Fecal score (1–7, poop only)</label><input id="eFecal" type="number" min="1" max="7" value="${ev.fecal_score || ''}">
      </div>
      <label class="lbl">Notes</label>
      <textarea id="eNotes" rows="3">${esc(ev.raw_input || '')}</textarea>`;
    const fillEditTypes = () => {
      const c = $('eCat').value, sel = $('eType');
      const opts = c === 'Elimination'
        ? ['Pee', 'Poop', 'Pee_Poop', 'Micro_Pee', 'Dry_Check', 'Accident_Pee', 'Accident_Poop']
        : c === 'Nap' ? ['Crate_Entry', 'Crate_Exit'] : [];
      $('eTypeWrap').style.display = opts.length ? '' : 'none';
      let cur = c === 'Elimination' ? ev.elimination_type : c === 'Nap' ? ev.crate_action : '';
      if (c === 'Nap') cur = cur === 'Nap_Start' ? 'Crate_Entry' : cur === 'Nap_End' ? 'Crate_Exit' : cur; // v3.9.1 — normalize
      sel.innerHTML = opts.map(o => `<option${o === cur ? ' selected' : ''}>${o}</option>`).join('');
      document.querySelectorAll('[data-enums]').forEach(d => d.hidden = d.dataset.enums !== c);
    };
    $('eCat').onchange = fillEditTypes;
    fillEditTypes();
  } else if (kind === 'Backdate') {
    // v2.0 — "found the puddle an hour later" case
    $('sheetTitle').textContent = 'Log past event';
    b.innerHTML = `
      <label class="lbl">Event</label>
      <select id="bCat">
        <option value="Pee">💧 Pee</option>
        <option value="Poop">💩 Poop</option>
        <option value="Food">🥩 Food</option>
        <option value="Water">🚰 Water</option>
        <option value="Nap">💤 Nap</option>
        <option value="Training">🎯 Training</option>
        <option value="Weight">⚖️ Weight</option>
        <option value="Note">📝 Note</option>
      </select>
      <label class="lbl">When did it happen?</label>
      <input id="bAt" type="datetime-local" value="${nowLocalInput()}">
      <label class="lbl">Note (optional)</label>
      <input id="bNote" placeholder="e.g. found the puddle by the door">`;
  }
  // v2.0 — back-dated entries: every manual log sheet gets a log-time picker
  // v3.6 FIX — use insertAdjacentHTML, NOT innerHTML += : re-assigning innerHTML
  // destroys every node in the sheet, silently dropping the tap handlers that
  // wireSeg() had just attached to the PoopScore/Accident/Food pickers (taps
  // did nothing and the score always saved as the default). Appending preserves them.
  if (['Food', 'Water', 'Weight', 'Note', 'Accident', 'PoopScore', 'Snack'].includes(kind)) {
    // v3.16.1 — when editing, the time defaults to the ORIGINAL entry's time
    // (not "now"); the user can still change it.
    b.insertAdjacentHTML('beforeend', `<label class="lbl">Log time <span class="hint">(${existing ? 'original entry time' : 'back-date if needed'})</span></label>
      <input id="logAt" type="datetime-local" value="${existing ? nowLocalInput(new Date(existing.logged_at)) : nowLocalInput()}">`);
  }
  if (existing) {
    if (kind === 'Food') {
      // v3.7 — restore each mix component amount (single-food events → their total)
      const parts = parseMix(existing.kibble_type);
      const total = +existing.kibble_consumed_tbsp || 0;
      FOODS.forEach(f => {
        const p = parts.find(x => x.id === f.id);
        const amt = (p && p.tbsp != null) ? p.tbsp
          : (parts.length === 1 && parts[0].id === f.id) ? total : 0;
        $('fTbsp_' + f.id).value = amt;
      });
      // v3.16 — restore structured topper rows; anything unparseable → notes
      const pt = parseToppersDetail(existing.toppers_detail || '');
      pt.rows.forEach(r => addTopperRow(r.snackId, r.amount));
      $('fTop').value = pt.notes || '';
      $('fWaterTsp').value = existing.water_consumed_tsp || 0;
      refreshMixSheet();
    }
    if (kind === 'Water') { $('wTsp').value = existing.water_consumed_tsp || 0; }
    if (kind === 'Snack') { // v3.11
      const s = SNACKS.find(x => x.name === existing.snack_name) || SNACKS[0];
      $('snPick').value = s.id;
      $('snPick').onchange(); // refreshes guide + unit label
      $('snAmt').value = existing.snack_amount || s.puppy;
      $('snAmt').oninput(); // refreshes kcal line
    }
  }
  $('sheet').hidden = false;
}
/** Pure: one-line human summary for an edited event. Tested. */
function summarizeEdit(p) {
  const bits = [];
  const tp = (p.elimination_type || p.crate_action || '').replace(/_/g, ' ');
  if (tp) bits.push(tp);
  if (p.category === 'Food' && p.kibble_type) bits.push(mixSummary(p.kibble_type)); // v3.7 — mix breakdown
  if (p.water_consumed_tsp && (p.category === 'Water' || p.category === 'Food')) bits.push(p.water_consumed_tsp + ' tsp water' + (p.category === 'Food' ? ' in food' : '')); // v3.8
  if (p.category === 'Food' && p.event_kcal) bits.push(p.event_kcal + ' kcal');
  if (p.fecal_score) bits.push('score ' + p.fecal_score);
  if (p.location_substrate) bits.push('@ ' + p.location_substrate);
  const note = (p.raw_input || '').slice(0, 80);
  if (note) bits.push('— ' + note);
  return bits.join(' ') || p.category;
}
/** Pure: build the update patch for the generic event editor. Tested. */
function buildEditPatch(prev, f) {
  const patch = {
    category: f.cat,
    logged_at: f.atISO || prev.logged_at,
    location_substrate: (f.loc || '').trim(),
    raw_input: (f.notes || '').trim(),
  };
  patch.day_number = dayNumber(patch.logged_at);
  if (f.cat === 'Elimination') { patch.elimination_type = f.type || null; patch.crate_action = null; }
  else if (f.cat === 'Nap') { patch.crate_action = f.type || null; patch.elimination_type = null; }
  else { patch.elimination_type = null; patch.crate_action = null; }
  if (f.cat === 'Food') {
    patch.event_kcal = +f.kcal || 0;
    const newTbsp = +f.tbsp || 0;
    patch.kibble_consumed_tbsp = newTbsp;
    if (f.foodTsp != null && f.foodTsp !== '') patch.water_consumed_tsp = +f.foodTsp || 0; // v3.8 — water added to food
    if (f.food) patch.kibble_type = foodById(f.food).name;
    else {
      // v3.7 — mix event edited here: re-scale components proportionally so the label never goes stale
      const parts = parseMix(prev.kibble_type);
      const oldTbsp = +prev.kibble_consumed_tbsp || 0;
      if (parts.length > 1 && parts.every(p => p.tbsp != null) && oldTbsp > 0 && newTbsp >= 0) {
        const ratio = newTbsp / oldTbsp;
        patch.kibble_type = buildMixLabel(parts.map(p => ({ food: foodById(p.id), tbsp: +(p.tbsp * ratio).toFixed(2) })));
      }
    }
  }
  if (f.cat === 'Water') { patch.water_consumed_tsp = +f.tsp || 0; }
  if (f.cat === 'Elimination') { const fs = +f.fecal; patch.fecal_score = fs >= 1 && fs <= 7 ? fs : null; }
  patch.status_outcome = summarizeEdit(patch);
  return patch;
}
/* Update one event by id — Supabase when synced, local queue/caches when offline. */
async function updateEvent(id, patch) {
  const { id: _drop, ...clean } = patch;
  if (sbReady() && !String(id).startsWith('local-')) {
    const { error } = await S.sb.from('telemetry_events').update(clean).eq('id', id);
    if (error) { toast('Update failed: ' + error.message); return false; }
    return true;
  }
  const orig = S.events.find(e => String(e.id) === String(id)) || S.history.find(e => String(e.id) === String(id));
  const sameOrig = e => orig && e.logged_at === orig.logged_at && e.category === orig.category && (e.raw_input || '') === (orig.raw_input || '');
  const q = JSON.parse(localStorage.getItem('st_queue') || '[]')
    .map(e => (String(e.id) === String(id) || sameOrig(e)) ? { ...e, ...clean } : e);
  localStorage.setItem('st_queue', JSON.stringify(q));
  for (const arr of [S.events, S.history]) {
    const i = arr.findIndex(e => String(e.id) === String(id));
    if (i >= 0) arr[i] = { ...arr[i], ...clean };
  }
  return true;
}
function closeSheet() {
  $('sheet').hidden = true; S.sheetCtx = null;
  $('sheetSave').textContent = 'Save'; $('sheetCancel').textContent = 'Cancel';
  $('sheetCancel').onclick = closeSheet; // restore default after WeightPrompt override
}
async function saveSheet() {
  const { kind, existing } = S.sheetCtx || {};
  if (!kind) return closeSheet();
  if (kind === 'WalkView') return closeSheet(); // read-only route viewer
  let ev = existing ? { ...existing } : { category: kind };
  if (kind === 'Food') {
    // v3.7 — one meal event accumulating every food entered; egg + toppers count ONCE for the whole meal
    // v3.8 — water added to the food is logged on the meal (water_consumed_tsp), feeding fluid totals + bladder model
    const comp = readMixSheet();
    if (!comp.length) { toast('Enter at least one food amount.'); return; }
    const egg = +$('fEgg').value || 0;
    const waterTsp = +$('fWaterTsp').value || 0;
    const tRows = readTopperRows(); // v3.16 — structured toppers with portions
    const tKcal = topperKcal(tRows);
    const totalTbsp = +comp.reduce((s, c) => s + c.tbsp, 0).toFixed(2);
    ev.category = 'Food'; ev.kibble_type = buildMixLabel(comp);
    ev.kibble_offered_tbsp = totalTbsp; ev.kibble_consumed_tbsp = totalTbsp;
    ev.water_consumed_tsp = waterTsp;
    ev.toppers_detail = buildToppersDetail(tRows, $('fTop').value);
    ev.event_kcal = comp.reduce((s, c) => s + c.tbsp * c.food.kcalTbsp, 0) + egg * CFG.KCAL_PER_EGG + tKcal;
    ev.status_outcome = `Ate ${totalTbsp} tbsp ${comp.length > 1 ? 'mix' : comp[0].food.short}` +
      ` (${comp.map(c => `${+c.tbsp.toFixed(2)} ${c.food.short}`).join(' + ')})` +
      (egg ? ` + ${egg} egg (whole meal)` : '') +
      (waterTsp ? ` + ${waterTsp} tsp water in food` : '') +
      (ev.toppers_detail ? ' + ' + ev.toppers_detail : '');
    try {
      FOODS.forEach(f => localStorage.setItem('st_food_tbsp_' + f.id, String((comp.find(c => c.food.id === f.id) || { tbsp: 0 }).tbsp)));
      localStorage.setItem('st_food_water_tsp', String(waterTsp));
    } catch (e) {}
  } else if (kind === 'Water') {
    ev.category = 'Water'; ev.water_consumed_tsp = +$('wTsp').value || 0;
    ev.status_outcome = `Drank ${ev.water_consumed_tsp} tsp water` + ($('wNote').value ? ' (' + $('wNote').value + ')' : '');
  } else if (kind === 'Snack') {
    // v3.11 — one snack per event; amount clamped to the researched adult max
    const built = buildSnackEvent($('snPick').value, +$('snAmt').value || 0);
    if (!built.amount) { toast('Enter an amount.'); return; }
    ev = Object.assign(ev, built.ev);
    if (built.clamped) toast(`Capped at the adult max (${built.snack.adultMax} ${built.snack.units}).`);
  } else if (kind === 'Accident') {
    ev = Object.assign(ev, buildAccidentEvent(segVal('aTypeSeg', 'Pee'), segVal('aFloorSeg', 'Hard')));
  } else if (kind === 'PoopScore') {
    ev = Object.assign(ev, buildPoopEvent(segVal('pScoreSeg', '4')));
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
  } else if (kind === 'WeightPrompt') {
    // v2.1 — monthly check-in
    const lbs = parseFloat($('wpLbs').value);
    localStorage.setItem('st_weight_prompt', String(Date.now()));
    closeSheet();
    if (isFinite(lbs) && lbs > 0) {
      const kg = +(lbs / 2.20462).toFixed(2);
      localStorage.setItem('st_weight', String(kg));
      if (S.subject && sbReady()) {
        await S.sb.from('subjects').update({ current_weight_kg: kg }).eq('id', S.subject.id);
        S.subject.current_weight_kg = kg;
      }
      await saveEvent({ category: 'Weight', status_outcome: `Weight: ${lbs} lbs` });
      await loadData(); renderCockpit();
      toast('Weight updated \u2713');
    } else toast('Skipped \u2014 we\u2019ll ask again next month.');
    return;
  } else if (kind === 'Note') {
    ev.category = 'Note'; ev.raw_input = $('nText').value; ev.status_outcome = $('nText').value.slice(0, 120);
  } else if (kind === 'Pet') {
    // v2.0 — multi-pet profiles
    const name = $('pName').value.trim();
    if (!name) { toast('Enter a name.'); return; }
    closeSheet();
    await addPet({ name, breed: $('pBreed').value.trim() || null,
      date_of_birth: $('pDob').value || null, sex: $('pSex').value,
      current_weight_kg: +$('pKg').value || null });
    return;
  } else if (kind === 'Edit') {
    // v2.7 — generic event editor: apply patch built from the form
    const f = {
      cat: $('eCat').value,
      atISO: $('eAt').value ? backdateISO($('eAt').value) : '',
      loc: $('eLoc').value, notes: $('eNotes').value,
      type: $('eType') ? $('eType').value : '',
      kcal: $('eKcal').value, tbsp: $('eTbsp').value, tsp: $('eTsp').value, fecal: $('eFecal').value,
      food: $('eFood') ? $('eFood').value : '',
      foodTsp: $('eFoodTsp') ? $('eFoodTsp').value : '',
    };
    const patch = buildEditPatch(existing, f);
    closeSheet();
    if (await updateEvent(existing.id, patch)) toast('Event updated ✓');
    await loadData(); renderCockpit(); checkNudges();
    return;
  } else if (kind === 'Backdate') {
    // v2.0 — "found the puddle an hour later" case
    ev = backdateEvent($('bCat').value, $('bNote').value.trim());
    ev.logged_at = $('bAt').value ? backdateISO($('bAt').value) : new Date().toISOString();
    ev.day_number = dayNumber(ev.logged_at);
    closeSheet();
    const r = await saveEvent(ev);
    if (r) { toast('Past event saved ✓'); await loadData(); renderCockpit(); checkNudges(); }
    return;
  }
  // v2.0 — apply the back-date picker when present
  const logAtEl = document.getElementById('logAt');
  if (logAtEl && logAtEl.value) { ev.logged_at = backdateISO(logAtEl.value); ev.day_number = dayNumber(ev.logged_at); }
  if (existing) {
    // v2.7 — update in place (Supabase when synced, local queue/caches when offline)
    if (await updateEvent(existing.id, ev)) toast('Updated ✓');
  } else {
    const r = await saveEvent(ev);
    if (r) toast(kind + ' logged ✓');
  }
  closeSheet(); await loadData(); renderCockpit(); checkNudges();
}

/* ---------- Timeline ---------- */
/** Pure: events for the timeline review range — 1=today, 2=yesterday, 7=trailing 7d. Tested. */
function timelineRangeEvents(history, range, now = new Date()) {
  if (range === 2) {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const ys = todayStr(y);
    return history.filter(e => localDay(e.logged_at) === ys);
  }
  if (range === 7) return filterLastDays(history, 7, now);
  const ts = todayStr(now);
  return history.filter(e => localDay(e.logged_at) === ts);
}
// v3.16.1 — review ranges: Today / Yesterday / Last 7 days (S.timelineRange).
function renderTimeline() {
  const range = S.timelineRange || 1;
  const now = new Date();
  let evs, label, empty;
  if (range === 2) {
    evs = timelineRangeEvents(S.history, 2);
    const y = new Date(now); y.setDate(y.getDate() - 1);
    label = y.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    empty = 'No events logged yesterday.';
  } else if (range === 7) {
    evs = timelineRangeEvents(S.history, 7);
    const a = new Date(now); a.setDate(a.getDate() - 6);
    label = `${a.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    empty = 'No events in the last 7 days.';
  } else {
    evs = timelineRangeEvents(S.history, 1);
    label = todayStr();
    empty = 'No events logged today yet.';
  }
  $('timelineDate').textContent = label;
  const list = $('timelineList');
  if (!evs.length) { list.innerHTML = `<div class="muted">${empty}</div>`; return; }
  list.innerHTML = '';
  const rows = [...evs].sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at)); // newest first, always chronological
  rows.forEach(ev => {
    const div = document.createElement('div'); div.className = 'tl-item';
    const cat = ev.elimination_type || ev.category;
    // v3.9 — nap rows show start/end with the paired sleep duration
    let sub = ev.status_outcome || ev.raw_input || '';
    if (isNapStart(ev)) sub = `Fell asleep at ${fmtTime(ev.logged_at)}`;
    else if (isNapEnd(ev)) { const m = napEndMins(ev, rows); sub = m > 0 ? `Slept ${fmtDur(m)}` : 'Woke up'; }
    div.innerHTML = `<div class="tl-time">${fmtTime(ev.logged_at)}</div>
      <div class="tl-body"><span class="tl-cat">${eventEmoji(ev)} ${esc(cat)}</span><br>
      <span class="muted">${esc(sub)}</span></div>
      <div class="tl-actions"><button data-act="edit" title="Edit">✏️</button><button data-act="del" title="Delete">🗑</button></div>`;
    div.querySelector('[data-act=del]').onclick = () => { if (confirm('Delete this event?')) deleteEvent(ev.id); };
    div.querySelector('[data-act=edit]').onclick = () => {
      // v2.7 — Food/Water/Snack keep their dedicated sheets; everything else uses the generic editor
      openSheet(ev.category === 'Food' ? 'Food' : ev.category === 'Water' ? 'Water' : ev.category === 'Snack' ? 'Snack' : 'Edit', ev);
    };
    if (ev.category === 'Walk') { // v2.0 — tap to view the GPS route
      const body = div.querySelector('.tl-body');
      body.style.cursor = 'pointer'; body.title = 'View route';
      body.onclick = () => viewWalk(ev);
    }
    list.appendChild(div);
  });
}

/* =====================================================================
   PART 5 — Trends, learned-schedule insights, predictive nudges
   ===================================================================== */
function filterLastDays(history, n, now = new Date()) {
  const cut = new Date(now); cut.setDate(cut.getDate() - n);
  return history.filter(e => new Date(e.logged_at) >= cut);
}
function eventsInDays(n) { return filterLastDays(S.history, n); }
function dayBuckets(events) {
  const m = {};
  events.forEach(e => { const d = localDay(e.logged_at); (m[d] = m[d] || []).push(e); }); // v3.0 — local days
  return m;
}
/* Pee probability per hour-of-day over the window: days with ≥1 pee in that hour / days with data */
function hourlyProb(events, matchFn) {
  const days = dayBuckets(events);
  const vkeys = validDayKeys(events); // v3.13 — stray partial days don't dilute probabilities
  const probs = new Array(24).fill(0), counts = new Array(24).fill(0);
  vkeys.forEach(d => {
    const hours = new Set();
    days[d].forEach(e => { if (matchFn(e)) hours.add(new Date(e.logged_at).getHours()); });
    hours.forEach(h => counts[h]++);
  });
  for (let h = 0; h < 24; h++) probs[h] = vkeys.length ? counts[h] / vkeys.length : 0;
  return { probs, days: vkeys.length };
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
  renderClockDial(); // v2.0 hero visualization
  const days = dayBuckets(evs), dayKeys = Object.keys(days).sort();
  // Pee probability by hour
  const { probs } = hourlyProb(evs, isPee);
  drawBars('chPee', [...Array(24).keys()].map(fmtHour), probs, // v3.9 — AM/PM hour labels
    { colorFn: v => v >= .8 ? '#35c37d' : v >= .5 ? '#f2b134' : '#2a4636' });
  // Daily kcal
  const kcalByDay = dayKeys.map(d => days[d].reduce((a, e) => a + (+e.event_kcal || 0), 0));
  drawBars('chKcal', dayKeys.map(d => d.slice(5)), kcalByDay,
    { band: [CFG.KCAL_MIN, CFG.KCAL_MAX], colorFn: v => (v >= CFG.KCAL_MIN && v <= CFG.KCAL_MAX) ? '#35c37d' : '#f2b134' });
  // Avg awake hold: pee-to-pee gaps while awake-ish (awakeGaps: valid holds only)
  const pees = evs.filter(isPee).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const gaps = awakeGaps(pees);
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
/* v2.0 — Confidence for a learned window.
   Grows with data maturity: full confidence only at ≥14 days of history
   ("Learning mode" below that). Pure — tested. */
function nudgeConfidence(prob, dataDays) {
  return Math.round(prob * 100 * Math.min(1, Math.max(0, dataDays) / 14));
}
/* v2.0 — Nudge gating rule (documented in SPEC.md §4):
   fire only when prob ≥ 80% AND the model has ≥14 days of data AND the
   cluster spans ≥3 separate days. Pure — tested. */
function shouldNudge(w) {
  return w.prob >= 0.8 && (w.dataDays || 0) >= 14 && (w.clusterDays || 0) >= 3;
}
/* Distinct days with any logged data in the window (for the Learning banner). */
function learningDataDays(events) { return Object.keys(dayBuckets(events)).length; }

function learnedWindows(events, matchFn, label, threshold = 0.8) {
  const { probs, days } = hourlyProb(events, matchFn);
  if (days < 3) return [];
  const daysWith = dayBuckets(events);
  const vkeys = new Set(validDayKeys(events)); // v3.13 — cluster needs real days too
  const clusterDaysFor = (h0, h1) => {
    let n = 0;
    for (const d of Object.keys(daysWith)) {
      if (!vkeys.has(d)) continue;
      if (daysWith[d].some(e => { const h = new Date(e.logged_at).getHours(); return matchFn(e) && h >= h0 && h <= h1; })) n++;
    }
    return n;
  };
  const wins = []; let start = -1;
  for (let h = 0; h <= 24; h++) {
    const p = h < 24 ? probs[h] : 0;
    if (p >= threshold && start < 0) start = h;
    if ((p < threshold || h === 24) && start >= 0) {
      const prob = Math.max(...probs.slice(start, h));
      const cd = clusterDaysFor(start, h - 1);
      wins.push({ start, end: h - 1, prob, label,
                  clusterDays: cd, dataDays: days,
                  confidence: nudgeConfidence(prob, days) });
      start = -1;
    }
  }
  return wins;
}
function personalAvgHold() {
  const g = S._gaps || [];
  return g.length >= 5 ? g.reduce((a, b) => a + b, 0) / g.length : 75; // v3.10 — master-log median awake hold (was 81.9 spec)
}
function renderInsights() {
  const evs = eventsInDays(90);
  const st = liveState();
  // --- What to expect right now — v3.14: same contextual engine as Next-up, both tabs agree
  const box = $('expectNow'); const cards = [];
  const g = holdGuidance(evs, new Date());
  const avg = g ? g.hold : personalAvgHold(), el = st.asleep ? 0 : (g ? g.elapsed : st.bladder.elapsedMins);
  const basisTxt = g ? `${g.hold}m ${g.basis}` : `${Math.round(avg)}m average`;
  if (st.asleep) cards.push('😴 <b>Crating.</b> ADH suppression is handling continence — no action needed.');
  else if (!g) cards.push(`🟡 <b>On track.</b> Hold ${fmtDur(el)} vs ${Math.round(avg)}m average. Next window approaching.`);
  else if (g.verdict === 'fine') cards.push(`✅ <b>No urgency.</b> Hold is ${fmtDur(el)} vs your ${basisTxt} hold — <b>skipping this trip is fine.</b>`);
  else if (g.verdict === 'ontrack') cards.push(`🟡 <b>On track.</b> Hold ${fmtDur(el)} vs ${basisTxt}. Next window approaching.`);
  else cards.push(`🔴 <b>Due soon.</b> Hold ${fmtDur(el)} is at/past your ${basisTxt} hold — take him out.`);
  if (g && g.trend && g.trend.dir !== 'stable')
    cards.push(`${g.trend.dir === 'stretching' ? '📈' : '📉'} <b>Holds ${g.trend.dir}.</b> ${g.trend.pct > 0 ? '+' : ''}${g.trend.pct}% vs the prior three weeks — the windows above already account for it.`);
  // v3.10 — post-nap vigilance: 3 of 4 instrumented accidents struck 83–125 min
  // after nap wake. Surface a take-out card for 30 min after every nap end.
  const lastWake = evs.filter(isNapEnd).map(e => new Date(e.logged_at).getTime()).sort((a, b) => b - a)[0];
  if (!st.asleep && lastWake && (Date.now() - lastWake) / 60000 <= 30)
    cards.unshift(`⏰ <b>Just woke up.</b> Post-nap is Simba's highest-risk window — take him out now, even if the hold looks short.`);
  const ts = lastFluidTs();
  if (ts) {
    const m = (Date.now() - ts) / 60000;
    if (m > 20 && m < 50) cards.push(`💧 <b>Filtration peak.</b> Fluids ${Math.round(m)}m ago are hitting the bladder now — expect a full void if you go out.`);
    else if (m >= 50) cards.push('💧 Fluids drained — bladder volume is basal only.');
  }
  if (st.poops < 2) {
    const b1m = bowel1ClockMin(evs); // v3.17.3 — was hardcoded 7:45–8:30 AM
    const b1txt = b1m != null ? `typically lands around ${fmtHM(Math.floor(b1m / 60), b1m % 60)}` : 'typically lands 7:45–8:30 AM';
    cards.push(`💩 <b>Colon quota ${st.poops}/2.</b> ${st.poops === 0 ? `Morning bowel #1 ${b1txt}.` : 'Afternoon bowel #2 typically lands 12:45–5:00 PM.'}`);
  } else cards.push('💩 <b>Colon quota met (2/2).</b> Further squats today are likely gas/false urge.');
  box.innerHTML = cards.map(c => `<div class="window-card">${c}</div>`).join('');

  // --- Learned schedule windows ---
  const wins = [
    ...learnedWindows(evs, isPee, 'Pee'),
    ...learnedWindows(evs, e => ['Poop', 'Pee_Poop'].includes(e.elimination_type), 'Poop'),
    ...learnedWindows(evs, e => e.category === 'Food', 'Meal'),
  ];
  S._windows = wins;
  const sw = $('scheduleWindows');
  const dataDays = learningDataDays(evs);
  const lb = $('learnBanner');
  if (lb) {
    if (dataDays < 14) { lb.hidden = false; lb.innerHTML = `🧠 <b>Learning mode</b> — ${dataDays}/14 days of data. High-confidence nudges activate at 14 days.`; }
    else lb.hidden = true;
  }
  sw.innerHTML = wins.length
    ? wins.map(w => `<div class="window-card"><span class="prob">${w.confidence}%</span> confident · ${Math.round(w.prob * 100)}% of days: <b>${w.label}</b> ${fmtHM(w.start, 0)}–${fmtHM(w.end, 59)} <span class="hint">(${w.clusterDays}d cluster)</span></div>`).join('')
    : '<div class="muted">Not enough history yet — windows appear after ~3 days of logging.</div>';
  // v3.17.1 — topper vs appetite: is he eating without toppers?
  const ta = topperEatingAnalysis(S.history, new Date());
  const tc = $('topperCheck');
  if (tc) tc.innerHTML = `<div class="window-card">${ta.verdict === 'eating-well' ? '✅' : ta.verdict === 'eating-less' ? '🟡' : '⚪'} ${esc(ta.text)}</div>`;
  renderNudges(wins);
}
function nudgeKey(w) { return `nudge:${todayStr()}:${w.label}:${w.start}`; }
function renderNudges(wins) {
  const now = new Date(), box = $('nudgeList');
  const dismissed = JSON.parse(localStorage.getItem(CFG.LS.DISMISSED) || '{}');
  const upcoming = [];
  for (const w of (wins || [])) {
    if (!shouldNudge(w)) continue;                                  // v2.0 gating: ≥80%, ≥14d data, ≥3d cluster
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
    ? upcoming.map(w => `<div class="nudge">🔔 <b>${w.confidence}% confident</b> — Simba ${w.label === 'Meal' ? 'eats' : w.label.toLowerCase() + 's'} around <b>${fmtHour(w.start)}</b> — take him out / prep now. <button class="btn small" data-nk="${esc(nudgeKey(w))}">dismiss</button></div>`).join('')
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
    if (!shouldNudge(w)) continue;                                  // v2.0 gating
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
        div.innerHTML = `🔔 <b>${w.confidence}% confident</b> — Simba ${w.label === 'Meal' ? 'eats' : w.label.toLowerCase() + 's'} ~${fmtHour(w.start)} — in case you forgot.`;
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

/* ---------- Ask Simba's assistant (v3.17) ---------- */
/** Pure: extract the "Last reviewed: <date>" stamp from a knowledge doc. Tested. */
function kbReviewDate(txt) {
  const m = /Last reviewed:\*{0,2}\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/.exec(txt || '');
  return m ? m[1] : '';
}
/** Pure: keyword-rank KB sections for a query; top n sections, truncated. Tested. */
function kbSearchSections(kbText, query, n = 2, maxChars = 1500) {
  const toks = [...new Set((query.toLowerCase().match(/[a-z]{3,}/g) || []))];
  if (!toks.length || !kbText) return [];
  const sections = kbText.split(/^## /m).map((s, i) => (i ? '## ' + s : s)).filter(s => s.trim().length > 40);
  return sections
    .map(s => {
      const low = s.toLowerCase();
      let score = 0;
      toks.forEach(t => { if (low.includes(t)) score += t.length > 5 ? 2 : 1; });
      return { s, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.s.length > maxChars ? x.s.slice(0, maxChars) + '…' : x.s);
}
/** Pure: compact behavior brief from event history, grounding chat answers in Simba's real data. Tested. */
function buildTelemetryBrief(history, subj, now = new Date()) {
  const L = [];
  const nm = (subj && subj.name) || 'Simba';
  const ageWk = subj && subj.date_of_birth ? Math.floor((now - new Date(subj.date_of_birth)) / 604800000) : '?';
  const wt = subj && subj.current_weight_kg ? (subj.current_weight_kg * 2.20462).toFixed(1) + ' lbs' : 'weight unknown';
  L.push(`${nm}: Cavapoo, ${ageWk} weeks old, ${wt}. Today is ${todayStr(now)}.`);
  const d7 = filterLastDays(history, 7, now);
  if (!d7.length) { L.push('No events logged in the last 7 days — lean on the knowledge base only.'); return L.join('\n'); }
  const nDays = Math.max(1, new Set(d7.map(e => localDay(e.logged_at))).size);
  const per = x => (x / nDays).toFixed(1);
  const meals = d7.filter(e => e.category === 'Food');
  const kcal = meals.reduce((a, e) => a + (+e.event_kcal || 0), 0);
  const tbsp = meals.reduce((a, e) => a + (+e.kibble_consumed_tbsp || 0), 0);
  const pees = d7.filter(e => e.elimination_type === 'Pee').sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const poops = d7.filter(e => e.elimination_type === 'Poop');
  const accs = d7.filter(e => e.category === 'Accident');
  const water = d7.filter(e => e.category === 'Water').reduce((a, e) => a + (+e.water_consumed_tsp || 0), 0);
  const fecal = poops.map(e => +e.fecal_score).filter(x => x > 0);
  const medGap = medianNum(awakeGaps(pees));
  L.push(`Last 7 days (${nDays} days with data): meals ${per(meals.length)}/day, ${per(tbsp)} tbsp/day, ~${Math.round(kcal / nDays)} kcal/day from meals; ` +
    `bowl water ${per(water)} tsp/day; pees ${per(pees.length)}/day${medGap ? `, median awake hold ${Math.round(medGap)} min` : ''}; ` +
    `poops ${per(poops.length)}/day${fecal.length ? `, avg stool score ${(fecal.reduce((a, b) => a + b, 0) / fecal.length).toFixed(1)}/7` : ''}; ` +
    `accidents: ${accs.length}; naps started: ${d7.filter(isNapStart).length}.`);
  const d3 = filterLastDays(history, 3, now);
  const loose = d3.filter(e => e.elimination_type === 'Poop' && +e.fecal_score > 0 && +e.fecal_score <= 3);
  if (loose.length) L.push(`FLAG: ${loose.length} loose stool(s) (score ≤3) in the last 3 days.`);
  if (d3.some(e => e.category === 'Accident')) L.push('FLAG: at least one accident in the last 3 days.');
  L.push(`Accident-free streak: ${accidentFreeStreak(history, now)} day(s).`);
  const ht = holdTrend(history, now);
  if (ht) L.push(`Hold trend: ${ht.dir} (${ht.pct >= 0 ? '+' : ''}${ht.pct}% vs prior weeks).`);
  const ta = topperEatingAnalysis(history, now);
  if (ta.verdict !== 'not-enough-data') L.push(`Topper check: ${ta.text}`);
  return L.join('\n');
}

/* ----- Chat state, key management, Gemini call ----- */const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// v3.17 — one shared key: the clinical-audit generator already uses CFG.LS.GEMINI ('st_gemini').
function chatKey() { return localStorage.getItem(CFG.LS.GEMINI) || ''; }
function setChatKey(k) { if (k && k.trim()) localStorage.setItem(CFG.LS.GEMINI, k.trim()); else localStorage.removeItem(CFG.LS.GEMINI); }
function chatMsgs() {
  if (!S.chat) { try { S.chat = { msgs: JSON.parse(localStorage.getItem('st_chat') || '[]'), web: localStorage.getItem('st_chat_web') !== '0' }; } catch (e) { S.chat = { msgs: [], web: true }; } }
  return S.chat;
}
function saveChat() {
  const c = chatMsgs();
  try { localStorage.setItem('st_chat', JSON.stringify(c.msgs.slice(-30))); localStorage.setItem('st_chat_web', c.web ? '1' : '0'); } catch (e) {}
}
function pushChat(role, text, sources) {
  const c = chatMsgs(); c.msgs.push({ role, text, sources: sources || [] }); saveChat(); renderChat();
}
const CHAT_SYSTEM_BASE = `You are the in-app assistant inside WagWise, a telemetry app for Ankit's Cavapoo puppy Simba. Consult sources in this order:
1. KNOWLEDGE BASE excerpts below (Cavapoo-specialized first — it wins on breed points; then general canine). This is your primary authority.
2. SIMBA'S TELEMETRY BRIEF — his actual logged data. Ground every behavior, health, food, or training answer in these numbers and quote them.
3. WEB SEARCH results (only when provided) for anything beyond the knowledge base or needing current info (products, recalls, guideline updates).
4. Your own training knowledge only as a last resort — label it clearly as general knowledge, not verified for Simba.
Rules: answer compactly — lead with the direct answer, then at most 2-4 short bullets. When the question concerns behavior, health, food, or training, end with a concrete recommendation or adjustment when the data supports one (what to change, by how much, for how long) — or say plainly that no change is warranted. Never invent data about Simba; if the brief lacks what you need, say what's missing and what to log. Flag anything you could not verify instead of guessing. You are not a vet — for red-flag symptoms (blood in stool, repeated vomiting, lethargy + not eating, bloat signs, possible toxin ingestion) say to call the vet promptly.`;
/** Build the per-question system prompt: base + KB excerpts ranked for the query + telemetry brief. */
async function buildChatSystem(query) {
  const spec = await loadKnowledgeSilent('knowledge/cavapoo-specialized.md');
  const gen = await loadKnowledgeSilent('knowledge/general-canine.md');
  let kb = '';
  const sSecs = kbSearchSections(spec, query), gSecs = kbSearchSections(gen, query);
  if (sSecs.length) kb += '\n\n--- CAVAPOO KNOWLEDGE (primary) ---\n' + sSecs.join('\n\n');
  if (gSecs.length) kb += '\n\n--- GENERAL CANINE KNOWLEDGE (secondary) ---\n' + gSecs.join('\n\n');
  const brief = buildTelemetryBrief(S.history || [], S.subject || {});
  return `${CHAT_SYSTEM_BASE}\n\n--- SIMBA'S TELEMETRY BRIEF ---${brief}${kb || '\n\n(knowledge documents unavailable)'}`;
}
/** Call Gemini from the browser (BYOK). Returns {text, sources[], webUsed, error}. */
async function callGemini(key, systemText, history, web) {
  const contents = history.slice(-10).map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: { temperature: 0.35, maxOutputTokens: 1200 },
  };
  if (web) body.tools = [{ googleSearch: {} }];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(GEMINI_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data.error && data.error.message) || `HTTP ${r.status}`;
      if (web && /tool|search|ground/i.test(msg)) {
        const retry = await callGemini(key, systemText, history, false); // grounding not allowed on this key — answer without it
        if (!retry.error) { retry.note = 'Web search is not enabled on this key — answered from knowledge + Simba\u2019s data.'; return retry; }
      }
      return { error: geminiErrText(r.status, msg) };
    }
    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('').trim();
    if (!text) return { error: 'The AI returned an empty answer. Try rephrasing.' };
    const chunks = ((cand.groundingMetadata || {}).groundingChunks || [])
      .map(c => c.web).filter(w => w && w.uri)
      .filter((w, i, a) => a.findIndex(x => x.uri === w.uri) === i).slice(0, 6);
    return { text, sources: chunks, webUsed: web && chunks.length > 0 };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'The request timed out — check your connection and try again.' : 'Network error reaching the AI service.' };
  } finally { clearTimeout(timer); }
}
function geminiErrText(status, msg) {
  if (status === 400) return 'The key was rejected (invalid key or model). Double-check the pasted key.';
  if (status === 401 || status === 403) return 'Access denied — the key may be restricted or lack Gemini API access. In Google Cloud console, allow HTTP referrers for this app\u2019s address, or create a fresh key.';
  if (status === 429) return 'Free-tier quota used up for now (or 500 web searches/day reached). Wait a bit and try again.';
  return 'AI error: ' + msg;
}
/** No-key fallback: answer from KB excerpts + Simba's data with a few intent routes. */
async function answerLocally(query) {
  const spec = await loadKnowledgeSilent('knowledge/cavapoo-specialized.md');
  const gen = await loadKnowledgeSilent('knowledge/general-canine.md');
  const brief = buildTelemetryBrief(S.history || [], S.subject || {});
  const q = query.toLowerCase();
  const secs = [...kbSearchSections(spec, query, 1, 1200), ...kbSearchSections(gen, query, 1, 1200)];
  let lead;
  if (/stool|poop|diarrhea|loose/.test(q)) lead = 'Here\u2019s what Simba\u2019s log + knowledge base say about his stools:';
  else if (/pee|potty|hold|bladder|accident|house.train/.test(q)) lead = 'Here\u2019s his potty picture from the last 7 days:';
  else if (/food|eat|meal|kibble|kcal|egg|treat|snack/.test(q)) lead = 'Here\u2019s his recent feeding data:';
  else if (/water|drink/.test(q)) lead = 'Here\u2019s his recent water intake:';
  else if (/nap|sleep|crate/.test(q)) lead = 'Here\u2019s his recent rest data:';
  else if (/weight|grow/.test(q)) lead = 'Here\u2019s his growth data:';
  else lead = 'Here\u2019s Simba\u2019s recent data plus the most relevant knowledge-base section:';
  const kbPart = secs.length ? '\n\nFrom the knowledge base:\n' + secs.join('\n\n') : '';
  return `📴 On-device answer (no AI key added yet) — from your knowledge base + Simba\u2019s logged data. Add a free Gemini key below for full AI answers with web search.\n\n${lead}\n${brief}${kbPart}`;
}
async function sendChat(text) {
  const q = (text || '').trim();
  if (!q) return;
  pushChat('user', q);
  const input = $('chatInput'); if (input) input.value = '';
  const typing = { role: 'ai', text: '…', typing: true };
  chatMsgs().msgs.push(typing); renderChat();
  const key = chatKey();
  try {
    let res;
    if (!key) {
      res = { text: await answerLocally(q) };
    } else {
      const sys = await buildChatSystem(q);
      const hist = chatMsgs().msgs.filter(m => !m.typing);
      res = await callGemini(key, sys, hist, chatMsgs().web);
    }
    chatMsgs().msgs = chatMsgs().msgs.filter(m => !m.typing);
    if (res.error) pushChat('ai', '⚠️ ' + res.error);
    else pushChat('ai', (res.note ? res.note + '\n\n' : '') + res.text, res.sources || []);
  } catch (e) {
    chatMsgs().msgs = chatMsgs().msgs.filter(m => !m.typing);
    pushChat('ai', '⚠️ Something went wrong answering that. Try again.');
  }
}
/** Render chat messages into the Ask screen. */
function renderChat() {
  const list = $('chatList'); if (!list) return;
  const c = chatMsgs();
  if (!c.msgs.length) {
    list.innerHTML = `<div class="chat-empty">Ask about Simba's behavior, health, food, or training — answers start from your knowledge base, then his actual logged data${c.web ? ', with live web search' : ''}.<br><br>Try a suggestion below, or type your own.</div>`;
    return;
  }
  list.innerHTML = c.msgs.map(m => {
    let html = esc(m.text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    let src = '';
    if (m.sources && m.sources.length) {
      src = '<div class="chat-src"><div class="chat-src-title">Sources</div>' +
        m.sources.map(s => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || s.uri)}</a>`).join('') + '</div>';
    }
    return `<div class="chat-msg ${m.role}${m.typing ? ' typing' : ''}"><div class="chat-bubble">${html}${src}</div></div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
  const webT = $('chatWeb');
  if (webT) webT.checked = c.web;
}
/** Show knowledge-base freshness in the Ask header. */
async function updateKbFresh() {
  const el = $('kbFresh'); if (!el) return;
  const spec = await loadKnowledgeSilent('knowledge/cavapoo-specialized.md');
  const gen = await loadKnowledgeSilent('knowledge/general-canine.md');
  const ds = kbReviewDate(spec), dg = kbReviewDate(gen);
  const parts = [];
  if (ds) parts.push(`Cavapoo guide · reviewed ${ds}`);
  if (dg) parts.push(`general canine · reviewed ${dg}`);
  el.textContent = parts.length ? '📚 Knowledge: ' + parts.join(' · ') + ' (refreshed monthly)' : '📚 Knowledge base loading…';
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
  const cols = ['event_code', 'logged_at', 'day_number', 'category', 'elimination_type', 'fecal_score', 'kibble_consumed_tbsp', 'kibble_type', 'water_consumed_tsp', 'snack_name', 'snack_amount', 'snack_unit', 'event_kcal', 'location_substrate', 'door_tell_observed', 'status_outcome', 'raw_input'];
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
  let md = `# WagWise — Daily Summary\n\nExported ${new Date().toLocaleString()}\n\n`;
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
      Snack_Name: r.snack_name, Snack_Amount: r.snack_amount, Snack_Unit: r.snack_unit,
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
  const gb = $('googleBtn'); if (gb) gb.hidden = inOut;
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

/* v2.1 — Google Sign-In. Requires the Google provider enabled in the
   Supabase dashboard (Authentication → Providers → Google) with a Google
   Cloud OAuth client whose authorized redirect URI is:
   https://iknfvddnevudpjtyxkbh.supabase.co/auth/v1/callback            */
async function signInWithGoogle() {
  if (!S.sb) { toast('Still connecting — try again in a moment.'); return; }
  const { error } = await S.sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) toast('Google sign-in failed: ' + error.message);
  // On return, supabase-js picks the session up from the URL automatically.
}

/* ---------- v2.1 onboarding: landing profile page ---------- */
function openOnboard(edit = false) {
  S._obEdit = edit;
  const s = edit ? S.subject : null;
  $('obTitle').textContent = edit ? 'Pet profile' : 'Welcome to WagWise';
  $('obSub').textContent = edit
    ? 'Update your dog\u2019s details \u2014 predictions, targets and reports use this.'
    : 'Tell us about your dog \u2014 this builds their profile and tunes every prediction to them.';
  $('obName').value = s?.name || '';
  $('obBreed').value = s?.breed || 'Cavapoo';
  $('obDob').value = s?.date_of_birth || '2026-05-31';
  $('obSex').value = s?.sex || 'male';
  $('obWeight').value = s?.current_weight_kg ? (s.current_weight_kg * 2.20462).toFixed(1) : '';
  $('obSave').innerHTML = edit ? 'Save changes \u2713' : 'Save &amp; continue \u2192';
  $('obStatus').textContent = '';
  $('addPetBtn2').hidden = !edit;   // v3.1 — add pets from the profile screen, not Home
  show('onboard');
}
async function saveOnboard() {
  const name = $('obName').value.trim();
  if (!name) { $('obStatus').textContent = 'Please enter your dog\u2019s name.'; return; }
  const lbs = parseFloat($('obWeight').value);
  const kg = isFinite(lbs) && lbs > 0 ? +(lbs / 2.20462).toFixed(2) : null;
  const data = { name, breed: $('obBreed').value.trim() || null,
    date_of_birth: $('obDob').value || null, sex: $('obSex').value, current_weight_kg: kg };
  $('obSave').disabled = true; $('obStatus').textContent = 'Saving\u2026';
  try {
    if (S._obEdit && S.subject) {
      const { error } = await S.sb.from('subjects').update(data).eq('id', S.subject.id);
      if (error) throw error;
      Object.assign(S.subject, data);
      toast('Profile updated \u2713');
      renderCockpit(); show('cockpit');
    } else {
      // Claim the unclaimed seed row when present, else insert fresh.
      let row = null;
      const { data: claimed, error: cErr } = await S.sb.from('subjects')
        .update({ owner_id: S.user.id, ...data }).is('owner_id', null).select();
      if (cErr) throw cErr;
      row = (claimed && claimed[0]) || null;
      if (!row) {
        const { data: created, error } = await S.sb.from('subjects')
          .insert({ owner_id: S.user.id, target_awake_hold_mins: 80, clean_overnight_streak_days: 0, ...data }).select();
        if (error) throw error;
        row = created[0];
      }
      if (kg) localStorage.setItem('st_weight', String(kg));
      await loadSubjects();
      toast(`Welcome, ${name}! \u2713`);
      show('cockpit');
    }
  } catch (e) { $('obStatus').textContent = 'Save failed: ' + e.message; }
  $('obSave').disabled = false;
}

/* ---------- v2.1 monthly weight check-in ---------- */
const WEIGHT_PROMPT_MS = 30 * 86400000;
function maybeWeightPrompt() {
  if (!sbReady() || !S.subject || S._wpShown) return;
  const last = +localStorage.getItem('st_weight_prompt') || 0;
  if (Date.now() - last < WEIGHT_PROMPT_MS) return;
  S._wpShown = true;
  openSheet('WeightPrompt');
}

/* ---------- Voice input (Web Speech API — free, no key) ---------- */
let recog = null, listening = false, micUserStop = false, micFatal = false, micSession = 0;
/* v3.4 — content-based transcript merge. Some Chrome builds deliver each new
   FINAL result as the FULL transcript-so-far (not just the new words), so
   naive appending duplicates everything ("HeHe peedHe peed at…"). Merge on
   content: extension/correction replaces, exact re-send is skipped, otherwise
   only the non-overlapping tail is appended. */
function mergeFinal(cur, add) {
  if (!add) return cur;
  if (!cur) return add;
  if (add.startsWith(cur)) return add;   // newer full text (or correction) → take it
  if (cur.endsWith(add)) return cur;     // exact re-send → skip
  let ov = 0;
  const max = Math.min(cur.length, add.length);
  for (let len = max; len > 3; len--) {  // >3 chars avoids "a"/"at" false overlaps
    if (cur.endsWith(add.slice(0, len))) { ov = len; break; }
  }
  return cur + add.slice(ov);
}
/* v2.2 — generalized voice engine: works from the Log tab mic and the global FAB */
function startVoice(btn, labelEl, statusEl, goToLog) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const setStatus = t => { if (statusEl) statusEl.textContent = t; };
  if (!SR) { setStatus('Voice not supported in this browser — type instead.'); if (goToLog) toast('Voice not supported here — use the Log tab.'); return; }
  if (listening) { micUserStop = true; if (recog) try { recog.stop(); } catch (e) {} return; } // v3.0 — tap toggles stop
  if (btn) btn.classList.add('listening');
  if (labelEl) labelEl.textContent = 'LISTENING… TAP TO STOP';
  listening = true; micUserStop = false; micFatal = false;
  const mySession = ++micSession; // v3.3 — stale resumes from an older session can never fire
  let final = '';
  const finalizeMic = () => {
    if (btn) btn.classList.remove('listening');
    if (labelEl) labelEl.textContent = 'TAP TO SPEAK TELEMETRY';
    listening = false;
    if (final.trim()) {
      $('logText').value = punctuate(cleanVoiceText(final.trim())); // v2.7 — cleaned, punctuated transcript
      if (goToLog) show('log');
      $('micStatus').textContent = 'Heard \u2713 \u2014 cleaned up, review and Parse.';
      parseAndPreview();
    }
    else setStatus('Did not catch that \u2014 try again.');
  };
  const attach = r => {
    r.lang = 'en-US'; r.interimResults = true; r.continuous = true; // stay live until the user taps stop
    r.onresult = ev => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) final = mergeFinal(final, res[0].transcript); // v3.4 — content merge, never blind append
        else interim += res[0].transcript;
      }
      setStatus((final + interim).slice(-120));
    };
    r.onend = () => {
      // manual stop: a pause must not end the session; silently resume
      // listening until the user taps stop (or a fatal mic error occurs).
      // v3.2 — resume with a FRESH recognizer: restarting the same object
      // replays stale results, which caused the word-duplication bug.
      if (listening && !micUserStop && !micFatal) {
        setTimeout(() => {
          if (listening && !micUserStop && !micFatal && micSession === mySession) {
            recog = attach(new SR());
            try { recog.start(); } catch (e) {}
          }
        }, 120);
        return;
      }
      finalizeMic();
    };
    r.onerror = e => {
      setStatus('Mic error: ' + e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') micFatal = true;
    };
    return r;
  };
  recog = attach(new SR());
  try { recog.start(); } catch (e) { setStatus('Mic error: ' + e.message); listening = false; }
}
function toggleMic() { startVoice($('micBtn'), $('micLabel'), $('micStatus'), false); }
function toggleMicFab() { startVoice($('micFab'), null, null, true); }
function parseAndPreview() {
  const raw = $('logText').value.trim();
  if (!raw) { toast('Enter or dictate something first.'); return; }
  const { events } = parseTelemetryMulti(raw); // v2.5 — one recording can hold several events
  S.parsedMulti = events;
  $('parsePreview').innerHTML = events.map((e, i) => {
    const rows = Object.entries(e.event).filter(([, v]) => v !== undefined && v !== '' && v !== 0 && v !== null)
      .map(([k, v]) => `<div><span class="k">${esc(k)}:</span> ${esc(v)}</div>`).join('');
    const head = events.length > 1 ? `<div class="k">Event ${i + 1} of ${events.length}</div>` : '';
    return `<div class="parse-one">${head}${rows}${e.notes.length ? `<div class="muted">${e.notes.map(esc).join(' · ')}</div>` : ''}</div>`;
  }).join('');
  $('parseCard').hidden = false;
}

/* ---------- v3.5: force-check for app updates ---------- */
async function checkForUpdates() {
  const st = $('updateStatus');
  const say = t => { if (st) st.textContent = t; };
  try {
    if (!('serviceWorker' in navigator)) { say('Service workers are not supported in this browser.'); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { say('No service worker registered — reload the page once.'); return; }
    say('Checking for updates…');
    await reg.update(); // bypasses HTTP cache (updateViaCache 'none')
    const w = reg.waiting || reg.installing;
    if (w) {
      say('Update found — applying…');
      try { w.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
      // the controllerchange handler reloads the page once the new worker takes over
      setTimeout(() => { const el = $('updateStatus'); if (el && el.textContent.startsWith('Update found')) el.textContent = 'Still applying — the app will reload on its own.'; }, 12000);
    } else {
      say('You are on the latest version (v' + APP_VERSION + ').');
    }
  } catch (e) { say('Update check failed: ' + (e && e.message || e)); }
}

/* ---------- v2.5 PWA install prompt ---------- */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  maybeShowInstall();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  localStorage.setItem('st_installed', '1');
  const c = $('installCard'); if (c) c.hidden = true;
  const mb = $('installMenuBtn'); if (mb) mb.hidden = true;
  toast('WagWise installed ✓');
});
function maybeShowInstall() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || localStorage.getItem('st_installed')) return;
  const mb = $('installMenuBtn'); if (mb) mb.hidden = false;
  if (localStorage.getItem('st_install_dismissed')) return;
  if (deferredInstallPrompt || /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    const c = $('installCard'); if (c) c.hidden = false;
  }
}
async function runInstallFlow() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === 'accepted') { const c = $('installCard'); if (c) c.hidden = true; }
  } else {
    const c = $('installCard'); if (c) c.hidden = false;
    const man = $('installManual'); if (man) man.hidden = false;
    else toast('iPhone: Share → Add to Home Screen · Android: ⋮ → Install app.');
  }
}
/* ---------- v2.5: multi-event voice parsing ----------
   "he peed at 4:02 and pooped at 4:30" → two separately timestamped events. */
function splitClauses(t) {
  // Protect decimal points first ("2.50" must not split into sentences)
  const prot = t.replace(/(\d)\.(\d)/g, '$1<DEC>$2');
  const strong = prot.split(/[.!?;]+|\band then\b|\bthen\b|\bafter that\b|\balso\b/i)
    .map(s => s.trim()).filter(s => s.length > 1)
    .map(s => s.replace(/<DEC>/g, '.'));
  const out = [];
  const rich = x => /(\d{1,2}:\d{2})/.test(x) ||
    /\b(pee|peed|poop|pooped|ate|eat|food|kibble|meal|breakfast|lunch|dinner|fed|drank|drink|water|train|training|nap|sleep|crate|weigh|walk)\b/.test(x);
  for (const s of strong) {
    const sides = s.split(/\band\b/i).map(x => x.trim()).filter(x => x.length > 1);
    const parts = sides.length > 1 && sides.filter(rich).length >= 2 ? sides : [s];
    for (const p of parts) out.push(...splitNowTransition(p)); // v3.9.2 — "…water. now … nap" split
  }
  return out;
}
/* v3.9.2 — a finished water drink followed by "now … nap/crate" is two events:
   "gave him 12 tsp of water … now putting him in his crate for a nap"
   → Water event + Nap event. Previously the nap branch swallowed the water
   (one Nap event with the tsp buried on it, invisible to fluid totals).
   The amount requirement guards against phantom water events
   ("the water bowl is empty now …" must not log a drink). Tested. */
function splitNowTransition(s) {
  const m = /\bnow\b/i.exec(s);
  if (!m) return [s];
  const pre = s.slice(0, m.index).trim(), post = s.slice(m.index).trim();
  const preHasWater = /\bwater\b/i.test(pre) && /\d+\s*(tsp|teaspoons?)\b/i.test(pre);
  const postHasRest = /\b(crate|nap|napping|sleep|sleeping|bedtime|den)\b/i.test(post);
  if (preHasWater && postHasRest && pre.length > 1 && post.length > 1) return [pre, post];
  return [s];
}
/* Merge adjacent same-type events close in time ("took him out to pee" @5:15
   followed by "he peed at 5:16" is ONE pee, not two). Keeps the later
   timestamp (the actual event) and folds context/notes together. */
function mergeNearDupes(list) {
  const out = [];
  const sig = e => (e.event.elimination_type || e.event.category);
  for (const cur of list) {
    const prev = out[out.length - 1];
    const pt = prev && prev.event.logged_at, ct = cur.event.logged_at;
    const mins = pt && ct ? Math.abs(new Date(ct) - new Date(pt)) / 60000 : null;
    const again = /\bagain\b/i.test(cur.event.raw_input || '') || (prev && /\bagain\b/i.test(prev.event.raw_input || ''));
    if (prev && sig(prev) === sig(cur) && !again && (mins === null || mins <= 15)) {
      const later = ct && pt ? (new Date(ct) >= new Date(pt) ? cur : prev) : cur;
      const earlier = later === cur ? prev : cur;
      later.event.raw_input = (earlier.event.raw_input + ' ' + later.event.raw_input).trim();
      later.notes.push(...earlier.notes.filter(n => !later.notes.includes(n)));
      for (const k of Object.keys(earlier.event)) {
        const lv = later.event[k], evv = earlier.event[k];
        if ((lv === undefined || lv === '' || lv === 0) && evv !== undefined && evv !== '' && evv !== 0) later.event[k] = evv;
      }
      out[out.length - 1] = later; // the merged object must replace the previous slot
      continue;
    }
    out.push(cur);
  }
  return out;
}
function parseTelemetryMulti(raw, now = new Date()) {
  let t = wordsToNum(raw); // normalize number words BEFORE splitting ("two and a half" → 2.5)
  // v3.4 — glue an orphaned bare time to the following clause:
  // "…and 10:00 pm. Was the crate entry…" → the 10pm belongs to the crate entry,
  // not stranded as its own fragment by the sentence boundary.
  t = t.replace(/\band\s+((?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\.\s*/gi, 'and $1 ');
  const events = [];
  for (const part of splitClauses(t)) {
    for (const seg of splitOnTimes(part)) { // v2.9: one clause, several timestamps → several events
      const { event, notes } = parseTelemetry(seg, now);
      const meaningful = event.category !== 'Note'
        || notes.some(n => n.includes('Negation noted'))
        || event.logged_at !== undefined;
      if (!meaningful && events.length) {
        // fragment (e.g. "3 seconds") — fold into the previous event's context
        const prev = events[events.length - 1];
        prev.event.raw_input = (prev.event.raw_input + ' ' + seg).trim();
        prev.notes.push(...notes);
      } else {
        events.push({ event, notes });
      }
    }
  }
  return { events: mergeNearDupes(events) };
}
/** Shared time-expression finder (same filter the parser uses). Tested. */
function findTimeMatches(text) {
  return [...String(text).matchAll(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi)]
    .filter(m => m[2] !== undefined || m[3] !== undefined || /^at\s+/i.test(m[0]));
}
/** Shared: does this text mention a loggable event or a negated one? Tested. */
function hasEventSignal(s) {
  return /\b(pee|peed|poop|pooped|ate|eat|food|kibble|meal|breakfast|lunch|dinner|drank|drink|water|train|nap|sleep|crate|walk|weigh|accident|did not|didn['’]t|never)\b/i.test(s);
}
/* Split a clause at time boundaries when the following segment carries its own
   event signal ("peed at 5:16 ... nap at 5:33" → separate events). The time
   expression overlaps into the previous segment so each keeps its timestamp.
   A bare time ("took out at 7:50, peed at 7:52") does NOT split — refinement. */
function splitOnTimes(clause) {
  const ms = findTimeMatches(clause);
  if (ms.length < 2) return [clause];
  const points = [0]; // indexes into ms where new segments start
  for (let i = 1; i < ms.length; i++) {
    const seg = clause.slice(ms[i].index, i + 1 < ms.length ? ms[i + 1].index : clause.length);
    if (hasEventSignal(seg)) points.push(i);
  }
  if (points.length < 2) return [clause];
  const out = [];
  for (let p = 0; p < points.length; p++) {
    const mi = points[p];
    const segStart = mi === 0 ? 0 : ms[mi].index;
    const nextMi = p + 1 < points.length ? points[p + 1] : ms.length;
    const segEnd = nextMi < ms.length ? ms[nextMi].index + ms[nextMi][0].length : clause.length;
    const seg = clause.slice(segStart, segEnd).trim();
    if (seg.length > 1) out.push(seg);
  }
  return out.length ? out : [clause];
}
/* ---------- v2.7: voice transcript cleanup ----------
   Fillers removed, self-corrections resolved ("at 5:15, actually no at 5:20"
   → "at 5:20"), common ASR typos fixed, light punctuation restored. */
function cleanVoiceText(raw) {
  let t = ' ' + String(raw).trim() + ' ';
  t = t.replace(/\bitook\b/gi, 'i took').replace(/\bbrough\b/gi, 'brought').replace(/\bcrat\b/gi, 'crate');
  t = t.replace(/\bhis grade\b/gi, 'his crate'); // ASR often hears "crate" as "grade"
  t = t.replace(/\b(um+|uh+|uhm+|er+|ah+|hmm+)\b/gi, ' ');
  t = t.replace(/\byou know\b/gi, ' ');
  // self-correction: time
  t = t.replace(/\bat (\d{1,2}(?::\d{2})?(?: ?[ap]m)?)\s*,?\s*(?:actually no|no wait|i mean|sorry|no)\b[\s,]*\bat (\d{1,2}(?::\d{2})?(?: ?[ap]m)?)/gi, ' at $2');
  // self-correction: event word ("he pooped, no wait he peed" → "he peed")
  t = t.replace(/\b(peed|pooped)\b\s*,?\s*(?:actually no|no wait|i mean|sorry)\s+(?:he\s+|she\s+)?(peed|pooped)\b/gi, '$2');
  return t.replace(/\s+/g, ' ').trim();
}
function punctuate(text) {
  const parts = String(text).split(/[.!?;]+|\band then\b|\bthen\b|\bafter that\b|\balso\b/i)
    .map(s => s.trim()).filter(s => s.length > 1);
  const rich = x => /\b(pee|peed|poop|pooped|ate|eat|food|kibble|meal|breakfast|lunch|dinner|drank|water|train|nap|sleep|crate|walk|weigh)\b/i.test(x);
  const hasNumAnd = /\b(one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\s+and\b/i;
  const out = [];
  for (const p of parts) {
    const sides = p.split(/\band\b/i).map(x => x.trim()).filter(x => x.length > 1);
    out.push(...(sides.length > 1 && !hasNumAnd.test(p) && sides.filter(rich).length >= 2 ? sides : [p]));
  }
  return out.map(s => s.replace(/\bi\b/g, 'I'))
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('. ') + '.';
}
/* ---------- v2.6: AI-ready daily digest ----------
   Short, structured, unambiguous — framed so any LLM can parse it:
   UPPER section headers, one "key: value" fact per line, explicit units,
   device-local AM/PM times, newest-first recent list. */
function buildDailyDigest({ petName, breed, ageWeeks, weightLbs, dateISO, now, events, walks, kcalMin, kcalMax, bladder }) {
  const L = [];
  const t = d => fmtTime(d);
  L.push(`WAGWISE DIGEST | ${petName} | ${dateISO} | generated ${t(now)}`);
  L.push('format: wagwise-digest-v1 | sections are UPPER headers | lines are "key: value" | times are device-local AM/PM');
  L.push(`pet: ${breed}, ${ageWeeks} weeks, ${weightLbs} lbs`);
  L.push('');
  const evs = [...events].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));
  const PEE = ['Pee', 'Pee_Poop', 'Micro_Pee', 'Dry_Check', 'Accident_Pee'];
  const POOP = ['Poop', 'Pee_Poop', 'Accident_Poop'];
  const isAcc = e => /Accident/.test(e.elimination_type || '');
  const pees = evs.filter(e => PEE.includes(e.elimination_type));
  const poops = evs.filter(e => POOP.includes(e.elimination_type));
  const accs = evs.filter(isAcc);
  const meals = evs.filter(e => e.category === 'Food');
  const kcal = Math.round(meals.reduce((s, e) => s + (+e.event_kcal || 0), 0));
  const cups = (meals.reduce((s, e) => s + (+e.kibble_consumed_tbsp || 0), 0) / 16).toFixed(2);
  // v3.8 — fluid intake = bowl water + water added to meals
  const bowlTsp = evs.filter(e => e.category === 'Water').reduce((s, e) => s + (+e.water_consumed_tsp || 0), 0);
  const foodTsp = evs.filter(e => e.category === 'Food').reduce((s, e) => s + (+e.water_consumed_tsp || 0), 0);
  const waterTsp = Math.round(bowlTsp + foodTsp);
  const scores = poops.map(e => e.fecal_score).filter(s => s >= 1 && s <= 7);
  const walkKm = (walks.reduce((s, w) => s + (+w.distance_m || 0), 0) / 1000).toFixed(2);
  const walkMin = Math.round(walks.reduce((s, w) => s + (+w.duration_mins || 0), 0));
  const trains = evs.filter(e => e.category === 'Training').length;
  // v3.9 — nap sessions with total sleep (in-progress nap counts elapsed time so far)
  const napPairs = pairNaps(evs);
  const napMin = napPairs.reduce((s, p) => s + (p.end ? p.mins : Math.max(0, Math.round((now - new Date(p.start.logged_at).getTime()) / 60000))), 0);
  L.push('TODAY');
  L.push(`pee: ${pees.length} total (outdoor ${pees.filter(e => !isAcc(e)).length}, accidents ${accs.filter(a => /Pee/.test(a.elimination_type || '')).length})`);
  L.push(`poop: ${poops.length} total${scores.length ? ` (scores ${scores.join(',')})` : ''}`);
  // v3.7 — per-food tbsp breakdown from mix labels (tracks food type + habit, not just totals)
  const byFood = {};
  const addFood = (id, tbsp) => { byFood[id] = (byFood[id] || 0) + tbsp; };
  meals.forEach(m => {
    const total = +m.kibble_consumed_tbsp || 0;
    const parts = parseMix(m.kibble_type);
    if (parts.length === 1 && parts[0].tbsp == null) addFood(parts[0].id, total); // single/legacy food
    else {
      const sum = parts.reduce((s, p) => s + (p.tbsp || 0), 0) || 1;
      parts.forEach(p => addFood(p.id, total * (p.tbsp || 0) / sum));
    }
  });
  const foodBits = Object.entries(byFood).map(([k, v]) => `${foodById(k).short} ${+v.toFixed(2)} tbsp`).join(' · ');
  L.push(`food: ${meals.length} meals, ${cups} cup, ${kcal} kcal (target ${kcalMin}-${kcalMax} kcal)${foodBits ? ' — ' + foodBits : ''}`);
  L.push(`water: ${waterTsp} tsp${foodTsp ? ` (bowl ${Math.round(bowlTsp)}, in food ${Math.round(foodTsp)})` : ''}`);
  const snacks = evs.filter(e => e.category === 'Snack'); // v3.11
  if (snacks.length) {
    const snackKcal = snacks.reduce((a, e) => a + (+e.event_kcal || 0), 0);
    L.push(`snack: ${snacks.length} (${Math.round(snackKcal)} kcal — ${snacks.map(e => e.snack_name || '').filter(Boolean).join(', ')})`);
  }
  L.push(`walk: ${walks.length} (${walkKm} km, ${walkMin} min)`);
  L.push(`nap: ${napPairs.length} (${fmtDur(napMin)} total) | training: ${trains}`);
  L.push('');
  L.push('NOW');
  L.push(`bladder_hold_min: ${bladder.elapsedMins} | est_vol_ml: ${Math.round(bladder.estimatedVolumeMl)} | risk: ${bladder.accidentRisk}`);
  L.push(`kcal_so_far: ${kcal} (target ${kcalMin}-${kcalMax})`);
  const lastPee = pees[pees.length - 1], lastPoop = poops[poops.length - 1];
  L.push(`last_pee: ${lastPee ? `${t(lastPee.logged_at)} ${isAcc(lastPee) ? 'indoors (accident)' : 'outdoor'}` : 'none today'}`);
  L.push(`last_poop: ${lastPoop ? t(lastPoop.logged_at) : 'none today'}`);
  L.push('');
  L.push('FLAGS');
  const flags = [];
  accs.forEach(a => flags.push(`accident: ${/Poop/.test(a.elimination_type || '') ? 'poop' : 'pee'} indoors ${t(a.logged_at)}`));
  if (kcal > kcalMax) flags.push(`kcal_over_target: ${kcal} > ${kcalMax}`);
  if (poops.length < 2) flags.push(`poop_below_quota: ${poops.length}/2`);
  if (!evs.some(isFluidEvent)) flags.push('no_water_logged'); // v3.8 — meal water counts too
  if (!flags.length) flags.push('none');
  flags.forEach(f => L.push(`- ${f}`));
  L.push('');
  L.push('RECENT (newest first, max 8)');
  [...evs].reverse().slice(0, 8).forEach(e => {
    const label = e.elimination_type || e.category;
    L.push(`${t(e.logged_at)} | ${label} | ${(e.status_outcome || e.raw_input || '').slice(0, 70)}`);
  });
  return L.join('\n');
}
async function todaysWalks() {
  const t = todayStr();
  let rows = [];
  if (sbReady() && S.subject) {
    try {
      const { data } = await S.sb.from('walks').select('started_at,distance_m,duration_mins')
        .eq('subject_id', S.subject.id).gte('started_at', t + 'T00:00:00');
      rows = data || [];
    } catch (e) { /* pre-migration */ }
  }
  const local = JSON.parse(localStorage.getItem('st_walks') || '[]').filter(w => isToday(w.started_at)); // v3.0 — local days
  return rows.concat(local);
}
async function buildDigestUI() {
  if (!S.subject) { toast('Finish onboarding first.'); return; }
  const now = new Date();
  const st = liveState();
  const walks = await todaysWalks();
  const kg = S.subject.current_weight_kg || 3.4;
  $('digestOut').value = buildDailyDigest({
    petName: S.subject.name || 'Simba', breed: S.subject.breed || 'Cavapoo',
    ageWeeks: ageWeeks(S.subject.date_of_birth), weightLbs: (kg * 2.20462).toFixed(2),
    dateISO: todayStr(), now, events: S.events, walks,
    kcalMin: CFG.KCAL_MIN, kcalMax: CFG.KCAL_MAX, bladder: st.bladder,
  });
  $('digestCard').hidden = false;
  toast('Digest built ✓');
}
/* ---------- Wiring + init ---------- */
function wire() {
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => show(b.dataset.screen));
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => show(b.dataset.goto));
  const obMenuBtn = document.querySelector('[data-goto="onboard"]');
  if (obMenuBtn) obMenuBtn.onclick = () => openOnboard(true); // edit mode: prefill current profile
  document.querySelectorAll('.dock-btn').forEach(b => b.onclick = () => quickLog(b.dataset.log));
  $('sheetSave').onclick = saveSheet; $('sheetCancel').onclick = closeSheet;
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });
  $('micBtn').onclick = toggleMic;
  $('parseBtn').onclick = parseAndPreview;
  $('discardParsedBtn').onclick = () => { S.parsedMulti = null; $('parseCard').hidden = true; };
  $('saveParsedBtn').onclick = async () => {
    const list = S.parsedMulti; // v2.5 — save every event the recording contained
    if (!list || !list.length) return;
    let n = 0;
    for (const { event } of list) { const r = await saveEvent(event); if (r) n++; }
    if (n) { toast(n === 1 ? 'Event saved ✓' : `${n} events saved ✓`); $('parseCard').hidden = true; $('logText').value = ''; S.parsedMulti = null; await loadData(); checkNudges(); }
  };
  document.querySelectorAll('#trendRange button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#trendRange button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); S.trendRange = +b.dataset.range; renderTrends();
  });
  // v3.16.1 — timeline review ranges (Today / Yesterday / 7 days)
  document.querySelectorAll('#timelineRange button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#timelineRange button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); S.timelineRange = +b.dataset.range; renderTimeline();
  });
  // v3.17 — Ask Simba's assistant (chat tab)
  $('chatSend').onclick = () => sendChat($('chatInput').value);
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat($('chatInput').value); });
  document.querySelectorAll('#chatChips button').forEach(b => b.onclick = () => sendChat(b.textContent));
  $('chatWeb').onchange = e => { chatMsgs().web = e.target.checked; saveChat(); renderChat(); };
  $('chatKeyBtn').onclick = () => {
    const box = $('chatKeyBox'); box.hidden = !box.hidden;
    if (!box.hidden) {
      $('chatKeyInput').value = '';
      $('chatKeyStatus').textContent = chatKey() ? '✓ Key saved on this device (shared with the clinical audit generator).' : 'No key saved yet — the chat answers from your knowledge base + Simba\u2019s data.';
    }
  };
  $('chatKeySave').onclick = () => { setChatKey($('chatKeyInput').value); $('chatKeyInput').value = ''; $('chatKeyStatus').textContent = chatKey() ? '✓ Key saved on this device.' : 'Key cleared.'; };
  $('chatKeyClear').onclick = () => { setChatKey(''); $('chatKeyStatus').textContent = 'Key removed.'; };
  $('chatKeyTest').onclick = async () => {
    const k = $('chatKeyInput').value.trim() || chatKey();
    if (!k) { $('chatKeyStatus').textContent = 'Paste a key first.'; return; }
    $('chatKeyStatus').textContent = 'Testing…';
    const r = await callGemini(k, 'Reply with exactly: OK', [{ role: 'user', text: 'Reply with exactly: OK' }], false);
    $('chatKeyStatus').textContent = r.error ? '⚠️ ' + r.error : '✓ Key works — full AI answers enabled.';
  };
  document.querySelectorAll('#kbTabs button').forEach(b => b.onclick = () => loadKnowledge(b.dataset.kb));
  $('buildDigestBtn').onclick = buildDigestUI;
  const nb = $('ntfyBtn'); if (nb) nb.onclick = toggleNtfy; // v3.13 — action alerts toggle  $('copyDigestBtn').onclick = () => { $('digestOut').select(); document.execCommand('copy'); toast('Digest copied ✓'); };
  $('buildPromptBtn').onclick = buildAuditPrompt;
  $('copyPromptBtn').onclick = () => { $('auditPrompt').select(); document.execCommand('copy'); toast('Prompt copied ✓'); };
  $('saveGeminiBtn').onclick = () => { localStorage.setItem(CFG.LS.GEMINI, $('geminiKey').value.trim()); toast('Gemini key saved on this device.'); };
  $('genGeminiBtn').onclick = generateWithGemini;
  $('expCsv').onclick = exportCSV; $('expMd').onclick = exportMD; $('expXlsx').onclick = exportXLSX;
  $('impFile').onchange = handleImportFile; $('impGo').onclick = runImport; // v2.2 — CSV/Excel import
  $('verSnap').onclick = () => createDataVersion('Manual snapshot'); // v3.10 — data versions
  $('sbTest').onclick = async () => {
    // v2.2 — Test doubles as Reconnect: clears any offline flag and retries everything
    localStorage.removeItem(CFG.LS.OFFLINE);
    S.sb = null; S.user = null;
    if (initSupabase()) {
      await refreshSession();
      renderConnStatus(true);
      if (S.user) { toast('Reconnected ✓'); show('cockpit'); }
      else { toast('Connected — please sign in.'); show('landing'); }
    } else {
      renderConnStatus(false);
      $('sbStatus').textContent = 'Could not reach Supabase — check connection and reload.';
    }
  };
  $('googleBtn').onclick = signInWithGoogle;
  $('obSave').onclick = saveOnboard;
  $('offlineBtn').onclick = goOffline;
  const ob2 = $('offlineBtn2'); if (ob2) ob2.onclick = goOffline;
  $('micFab').onclick = toggleMicFab; // v2.2 — global voice button
  $('installBtn').onclick = runInstallFlow;
  const idis = $('installDismiss'); if (idis) idis.onclick = () => { $('installCard').hidden = true; localStorage.setItem('st_install_dismissed', '1'); };
  const imb = $('installMenuBtn'); if (imb) imb.onclick = runInstallFlow;
  $('signInBtn').onclick = signIn; $('signUpBtn').onclick = signUp;
  $('signOutBtn').onclick = async () => { await S.sb.auth.signOut(); S.user = null; S.events = []; renderAuth(); renderAll(); setSync(false); show('landing'); };
  $('cfgSave').onclick = () => {
    CFG.KCAL_MIN = +$('cfgKcalMin').value || 300; CFG.KCAL_MAX = +$('cfgKcalMax').value || 330;
    CFG.BEDTIME = $('cfgBedtime').value || '21:45'; CFG.DAY_ONE = $('cfgDayOne').value || '2026-09-01';
    saveCfg(); toast('Settings saved ✓'); renderCockpit();
  };
  document.querySelectorAll('#dialSeg button').forEach(b => b.onclick = () => { // v2.0 clockface filter
    document.querySelectorAll('#dialSeg button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); S.dialType = b.dataset.dial; renderClockDial();
  });
  $('walkStartBtn').onclick = startWalk;
  $('walkStopBtn').onclick = stopWalk;
  $('backdateBtn').onclick = () => openSheet('Backdate');
  $('topSubjectPick').onchange = e => switchSubject(e.target.value);
  $('addPetBtn2').onclick = () => openSheet('Pet');
  $('medAddBtn').onclick = () => { $('medForm').hidden = !$('medForm').hidden; };
  $('medSaveBtn').onclick = saveMedForm;
  $('vaxAddBtn').onclick = () => { $('vaxForm').hidden = !$('vaxForm').hidden; };
  $('updateCheckBtn').onclick = checkForUpdates; // v3.5 — force update check
  $('vaxSaveBtn').onclick = saveVaxForm;
  $('printReportBtn').onclick = printVetReport;
  $('expReportBtn').onclick = () => show('report');
  $('hhAddBtn').onclick = addHouseholdMember;
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderCockpit(); });
}

async function init() {
  loadCfg();
  applyBrand(); // v2.2 — white-label: brand name from config.js
  $('geminiKey').value = localStorage.getItem(CFG.LS.GEMINI) || '';
  $('cfgKcalMin').value = CFG.KCAL_MIN; $('cfgKcalMax').value = CFG.KCAL_MAX;
  $('cfgBedtime').value = CFG.BEDTIME; $('cfgDayOne').value = CFG.DAY_ONE;
  wire();
  renderConnStatus(null);
  maybeShowInstall(); // v2.9 — surface the install option for signed-in users too (not just landing)
  const av = $('appVersion'); if (av) av.textContent = 'v' + APP_VERSION; // v2.9 — visible version
  const avl = $('appVersionLanding'); if (avl) avl.textContent = 'v' + APP_VERSION;
  const avt = $('appVersionTop'); if (avt) avt.textContent = 'v' + APP_VERSION; // v3.5 — version pill in the top bar
  if (localStorage.getItem(CFG.LS.OFFLINE)) { setSync(false); renderAll(); renderConnStatus(false); }
  else if (initSupabase()) {
    renderConnStatus(true);
    await refreshSession();
    if (!S.user) show('landing'); // v2.2 — landing page with login prompt
  }
  else { setSync(false); renderAll(); renderConnStatus(false); show('setup'); }
  // 60-second deterministic engine tick (spec section 5)
  S.tickTimer = setInterval(() => { renderCockpit(); checkNudges(); }, 60000);
}
/* ---------- v2.2: white-label brand + walk history ---------- */
function applyBrand() {
  const name = (window.ST_CONFIG && ST_CONFIG.APP_NAME) || 'WagWise';
  const lt = $('landingTitle'); if (lt) lt.textContent = name;
  document.title = name;
  renderGreeting();
}
/* v2.2 — once signed in with a pet profile, the top bar greets the pet */
function greetingFor(petName, hour) {
  if (!petName) return (window.ST_CONFIG && ST_CONFIG.APP_NAME) || 'WagWise';
  const tod = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${tod}, ${petName} 🐾`;
}
function renderGreeting() {
  const el = $('brandName'); if (!el) return;
  el.textContent = greetingFor(S.subject && S.subject.name, new Date().getHours());
}
/* v2.2 — past walks list on the Walk tab */
async function renderWalkHistory() {
  const box = $('walkHistory'); if (!box) return;
  let rows = [];
  if (sbReady() && S.subject) {
    try {
      const { data, error } = await S.sb.from('walks')
        .select('id,started_at,distance_m,duration_mins').eq('subject_id', S.subject.id)
        .order('started_at', { ascending: false }).limit(20);
      if (!error) rows = data || [];
    } catch (e) { /* pre-migration — local only */ }
  }
  const local = JSON.parse(localStorage.getItem('st_walks') || '[]');
  const seen = new Set(rows.map(r => String(r.id)));
  local.forEach(w => { if (!seen.has(String(w.id))) rows.push(w); });
  rows.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  rows = rows.slice(0, 20);
  if (!rows.length) { box.innerHTML = '<div class="muted">No walks yet.</div>'; return; }
  box.innerHTML = '';
  rows.forEach(w => {
    const div = document.createElement('div'); div.className = 'tl-item';
    div.innerHTML = `<div class="tl-time">${new Date(w.started_at).toLocaleDateString()}<br>${fmtTime(w.started_at)}</div>
      <div class="tl-body" style="cursor:pointer"><span class="tl-cat">🚶 ${(w.distance_m / 1000).toFixed(2)} km</span><br><span class="muted">${Math.round(w.duration_mins)} min · tap to view route</span></div>`;
    div.querySelector('.tl-body').onclick = () => viewWalk({
      walk_id: w.id, raw_input: 'GPS walk #' + w.id,
      status_outcome: `${(w.distance_m / 1000).toFixed(2)} km in ${Math.round(w.duration_mins)}m`
    });
    box.appendChild(div);
  });
}
/* ---------- v2.2: CSV / Excel import with field mapping ---------- */
const IMPORT_FIELDS = [
  { key: 'logged_at', label: 'Date / time', required: true, aliases: ['date', 'time', 'datetime', 'timestamp', 'when', 'logged_at', 'created'] },
  { key: 'event', label: 'Event type', required: true, aliases: ['event', 'type', 'category', 'activity', 'elimination_type', 'action'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'details', 'description', 'raw_input', 'comments', 'remark'] },
  { key: 'kcal', label: 'Kcal', aliases: ['kcal', 'calories', 'event_kcal', 'energy'] },
  { key: 'weight_lbs', label: 'Weight (lbs)', aliases: ['weight', 'weight_lbs', 'lbs', 'body_weight'] },
  { key: 'fecal_score', label: 'Fecal score (1–7)', aliases: ['fecal_score', 'stool_score', 'score', 'stool'] },
];
let IMP = { headers: [], rows: [], map: {}, _ok: [] };
function ensureXLSX() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Spreadsheet library failed to load — are you online?'));
    document.head.appendChild(s);
  });
}
function autoMapColumn(headers, aliases) {
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const a of aliases) { const i = headers.findIndex(h => norm(h) === norm(a)); if (i >= 0) return i; }
  for (const a of aliases) { const i = headers.findIndex(h => norm(h).includes(norm(a)) || norm(a).includes(norm(h))); if (i >= 0) return i; }
  return -1;
}
async function handleImportFile(e) {
  const file = e.target.files[0];
  const mapBox = $('impMap'), status = $('impStatus');
  if (!file) return;
  status.textContent = 'Reading…'; mapBox.hidden = true;
  try {
    await ensureXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); // handles .xlsx AND .csv
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
    if (!aoa.length) throw new Error('That file looks empty.');
    const headers = aoa[0].map(h => String(h).trim());
    const rows = aoa.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
    if (!rows.length) throw new Error('No data rows found.');
    IMP = { headers, rows, map: {}, _ok: [], fileName: file.name, masterLog: null };
    const M = detectMasterLog(headers); // v3.10 — Simba master-log preset
    if (M) {
      IMP.masterLog = M;
      IMP.map.logged_at = M.time; IMP.map.event = M.cat; IMP.map.notes = M.obs;
      IMP.map.kcal = -1; IMP.map.weight_lbs = -1; IMP.map.fecal_score = -1;
      renderImportFields(); renderImportPreview();
      mapBox.hidden = false;
      status.textContent = `📋 Master-log format detected — Date+Timestamp, Category and observations mapped automatically (${rows.length} rows). Mapping is fixed for this format; glance at the preview, then import.`;
    } else {
      IMPORT_FIELDS.forEach(f => { IMP.map[f.key] = autoMapColumn(headers, f.aliases); });
      renderImportFields(); renderImportPreview();
      mapBox.hidden = false;
      status.textContent = `${rows.length} rows detected. Check the mapping, glance at the preview, then import.`;
    }
  } catch (err) { status.textContent = '✗ ' + err.message; }
}
function renderImportFields() {
  const box = $('impFields');
  // v3.10.1 — master-log: show exactly what happens to every column of the file
  const mapTable = IMP.masterLog ? `
    <div class="card-title" style="margin-top:2px">How your file's columns map</div>
    <div class="kb-body" style="max-height:30vh">${masterLogMapRows().map(([c, u]) =>
      `<div>📄 <b>${esc(c)}</b><br><span class="hint">→ ${esc(u)}</span></div>`).join('')}</div>` : '';
  box.innerHTML = mapTable + IMPORT_FIELDS.map(f => `
    <div class="imp-row">
      <label class="lbl">${esc(f.label)}${f.required ? ' *' : ''}</label>
      <select data-imp="${f.key}">
        <option value="-1">— ignore —</option>
        ${IMP.headers.map((h, i) => `<option value="${i}"${IMP.map[f.key] === i ? ' selected' : ''}>${esc(h || '(column ' + (i + 1) + ')')}</option>`).join('')}
      </select>
    </div>`).join('');
  box.querySelectorAll('[data-imp]').forEach(s => s.onchange = () => { IMP.map[s.dataset.imp] = +s.value; renderImportPreview(); });
  if (IMP.masterLog) box.querySelectorAll('select').forEach(s => s.disabled = true); // v3.10 — fixed mapping
}
/** Pure: every master-log column → what the app does with it. */
function masterLogMapRows() {
  const M = IMP.masterLog, col = i => i >= 0 ? IMP.headers[i] : '—';
  return [
    [col(M.id), 'Duplicate detection — stamped on each event; re-importing skips these rows'],
    [`${col(M.date)} + ${col(M.time)}`, 'Event date & time'],
    [col(M.cat), 'Event type — the 100+ AI categories are classified (pee / poop / food / nap / …)'],
    [col(M.elim), 'Refines pee vs poop vs dry-check'],
    ['Target_Guideline', 'Not imported — that column is the AI\u2019s daily plan, not an observation'],
    [col(M.obs), 'Notes — amounts (tbsp / tsp), fecal scores and latencies are extracted from it'],
    [col(M.status), 'Outcome label shown on the timeline'],
    [col(M.notes), 'Saved to the telemetry-notes field'],
  ];
}
/** Pure: count mapped rows by category/elimination_type. Tested. */
function importBreakdown(ok) {
  const m = {};
  for (const ev of ok) { const k = ev.elimination_type || ev.category; m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function normalizeImportEvent(v) {
  const t = String(v || '').toLowerCase().trim();
  if (/pee|urine/.test(t)) return { category: 'Elimination', elimination_type: 'Pee' };
  if (/poop|stool|poo/.test(t)) return { category: 'Elimination', elimination_type: 'Poop' };
  if (/food|meal|kibble|fed|breakfast|lunch|dinner|\beat\b/.test(t)) return { category: 'Food' };
  if (/water|drink/.test(t)) return { category: 'Water' };
  if (/weigh/.test(t)) return { category: 'Weight' };
  if (/walk/.test(t)) return { category: 'Walk' };
  if (/train/.test(t)) return { category: 'Training' };
  if (/nap|sleep|crate/.test(t)) return { category: 'Nap' };
  return { category: 'Note' };
}
/* ---------- v3.10 — Simba master-log (Google AI) import preset ----------
   Detected by headers: Event_ID, Date, Timestamp, Category,
   Actual_Event_Observation (+ Behavioral_Telemetry_Notes). The verbose AI
   categories map to app event fields via classifyMasterLog(). Tested. */
function detectMasterLog(headers) {
  const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
  const has = a => headers.some(h => norm(h) === a);
  if (!(has('eventid') && has('date') && has('timestamp') && has('category'))) return null;
  const col = a => headers.findIndex(h => norm(h) === a || norm(h).includes(a));
  const M = {
    id: col('eventid'), date: col('date'), time: col('timestamp'), cat: col('category'),
    elim: col('eliminationtype'), status: col('statusoutcome'),
    obs: headers.findIndex(h => norm(h).includes('actualevent')),
    notes: headers.findIndex(h => norm(h).includes('behavioraltelemetry')),
  };
  if (M.id < 0 || M.date < 0 || M.time < 0 || M.cat < 0 || M.obs < 0) return null;
  return M;
}
/** Pure: "2026-08-31" + "7:30 AM" → local Date. Tolerant of US "8/31/2026",
 *  24h "19:30", and Excel serial dates. Tested. */
function parseMasterLogDate(d, t) {
  let Y, Mo, D;
  const dv = String(d ?? '').trim();
  let m = dv.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { Y = +m[1]; Mo = +m[2]; D = +m[3]; }
  else if ((m = dv.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { // US M/D/Y
    let yy = +m[3]; if (yy < 100) yy += 2000;
    Y = yy; Mo = +m[1]; D = +m[2];
  } else if (typeof d === 'number' && isFinite(d) && d > 20000 && d < 80000) { // Excel serial
    const sdt = new Date(Math.round((d - 25569) * 86400 * 1000));
    Y = sdt.getUTCFullYear(); Mo = sdt.getUTCMonth() + 1; D = sdt.getUTCDate();
  } else return null;
  const tv = String(t ?? '').trim();
  let h, mi;
  if (typeof t === 'number' && isFinite(t) && t >= 0) { // Excel time fraction: 0.3125 = 7:30 AM
    const mins = Math.round((t % 1) * 1440) % 1440;
    h = Math.floor(mins / 60); mi = mins % 60;
  } else if ((m = tv.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])\.?M\.?/i))) { h = (+m[1]) % 12; if (/p/i.test(m[3])) h += 12; mi = +m[2]; }
  else if ((m = tv.match(/(\d{1,2}):(\d{2})(?::\d{2})?/))) { h = +m[1]; mi = +m[2]; }
  else return null;
  if (h > 23 || mi > 59 || Mo < 1 || Mo > 12 || D < 1 || D > 31) return null;
  const dt = new Date(Y, Mo - 1, D, h, mi);
  return isNaN(dt) ? null : dt;
}
/** Pure: verbose AI category row → app event fields. Tested. */
function classifyMasterLog(r, M) {
  const g = i => String(r[i] ?? '').trim();
  const cat = g(M.cat), elimC = g(M.elim), obs = g(M.obs);
  const text = (cat + ' ' + elimC + ' ' + obs).toLowerCase();
  const ev = {};
  const num = (re, s = obs) => { const m = String(s).match(re); return m ? parseFloat(m[1]) : 0; };
  if (/accident|incident/.test(text)) {
    ev.category = 'Elimination';
    ev.elimination_type = /poop|stool|bowel/.test(text) ? 'Accident_Poop' : 'Accident_Pee';
  } else if (/\bwalk\b/.test(cat.toLowerCase()) && !/pee|poop|urine|stool/i.test(elimC)) {
    ev.category = 'Walk'; // decompression / perimeter walks (pee-on-walk rows keep elim)
  } else if (/potty|pee|urin|poop|stool|bowel|colonic|elimination|dry check/.test(cat.toLowerCase()) ||
             /pee|poop|urine|stool|dual/i.test(elimC)) {
    // v3.10 — pee/poop decided from the Elimination_Type COLUMN first; the
    // observation text mentions "bowel" spuriously (e.g. "Bowel #2 check").
    ev.category = 'Elimination';
    const el = elimC.toLowerCase();
    const peeW = /\bpee\b|urine|urination/.test(el), poopW = /\bpoop\b|stool/.test(el);
    if (peeW && poopW) ev.elimination_type = 'Pee_Poop';
    else if (peeW) ev.elimination_type = 'Pee';
    else if (poopW) ev.elimination_type = 'Poop';
    else {
      const c = cat.toLowerCase(), o = obs.toLowerCase();
      if (/\bdry\b/.test(c) || /did not (produce|eliminate)|no elimination produced|no urination|but did not/.test(o)) ev.elimination_type = 'Dry_Check';
      else if (/\bpoop\b|colonic|\bbowel\b/.test(c)) ev.elimination_type = 'Poop';
      else if (/\bpee\b/.test(c)) ev.elimination_type = 'Pee';
      else if (/produced a bowel movement|\bbowel movement\b/.test(o)) ev.elimination_type = 'Poop';
      else if (/bladder drain|urination|\bvoid\b/.test(o)) ev.elimination_type = 'Pee';
      else ev.elimination_type = 'Dry_Check'; // attempted check, nothing confirmed
    }
  } else if (/hydration|water/.test(cat.toLowerCase())) {
    const tbsp = num(/(\d+(?:\.\d+)?)\s*tbsp/i);
    if (tbsp > 0 && /kibble|mash|meal|food/.test(obs.toLowerCase())) {
      ev.category = 'Food'; ev.kibble_offered_tbsp = ev.kibble_consumed_tbsp = tbsp;
      const wtsp = num(/(\d+(?:\.\d+)?)\s*tsp/i); if (wtsp > 0) ev.water_consumed_tsp = wtsp; // meal water
      ev.event_kcal = Math.round(tbsp * 26.94); // Frontrunner staple estimate
    } else {
      ev.category = 'Water';
      const cm = obs.match(/consumed[^.]{0,80}?(\d+(?:\.\d+)?)\s*tsp/i);
      ev.water_consumed_tsp = cm ? parseFloat(cm[1]) : (num(/(\d+(?:\.\d+)?)\s*tsp/i) || 2);
    }
  } else if (/nutrition|meal|kibble|breakfast|lunch|dinner/.test(cat.toLowerCase())) {
    ev.category = 'Food';
    const tbsp = num(/(\d+(?:\.\d+)?)\s*tbsp/i);
    ev.kibble_offered_tbsp = ev.kibble_consumed_tbsp = tbsp;
    const wtsp = num(/(\d+(?:\.\d+)?)\s*tsp/i); if (wtsp > 0) ev.water_consumed_tsp = wtsp;
    let kcalTbsp = 26.94; // Frontrunner default
    if (/frontrunner/i.test(text)) { ev.kibble_type = 'Nulo Frontrunner Puppy — Chicken, Oats & Turkey (Ancient Grains)'; kcalTbsp = 26.94; }
    else if (/freestyle/i.test(text)) { ev.kibble_type = 'Nulo FreeStyle Small Breed — Salmon & Lentils'; kcalTbsp = 25.31; }
    else if (/medal/i.test(text)) { ev.kibble_type = 'Nulo MedalSeries Ancient Grains Small Breed — Salmon, Oats & Acadian Redfish'; kcalTbsp = 26.69; }
    if (/egg/i.test(text)) ev.toppers_detail = 'scrambled egg';
    if (/goat\s*milk/i.test(text)) ev.toppers_detail = ((ev.toppers_detail || '') + ' goat milk').trim();
    ev.event_kcal = Math.round(tbsp * kcalTbsp + (/egg/i.test(text) ? 39 : 0));
  } else if (/nap|overnight|rest & recovery|lockdown|sleep|crate|settle/.test(cat.toLowerCase())) {
    ev.category = /overnight/.test(cat.toLowerCase()) ? 'Crate' : 'Nap';
    ev.crate_action = 'Crate_Entry';
    const dur = (obs).match(/(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*-\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?/i);
    if (dur) {
      const toM = (h, m, ap) => ((+h) % 12 + (/p/i.test(ap) ? 12 : 0)) * 60 + (+m);
      let mins = toM(dur[4], dur[5], dur[6]) - toM(dur[1], dur[2], dur[3]);
      if (mins < 0) mins += 1440;
      if (mins > 0 && mins < 900) ev.sleep_duration_mins = mins;
    }
  } else if (/train|conditioning|enrichment/.test(cat.toLowerCase())) {
    ev.category = 'Training';
  } else if (/weigh/.test(cat.toLowerCase())) {
    ev.category = 'Weight';
    const w = num(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound)/i, text);
    if (w > 0) ev.status_outcome = `Weight: ${w} lbs`;
  } else {
    ev.category = 'Note';
  }
  const fs = (obs).match(/fecal score\s*(\d)/i);
  if (fs) ev.fecal_score = Math.min(7, Math.max(1, +fs[1]));
  const lat = obs.match(/latency\s*(?:<|of)?\s*(\d+)\s*min/i);
  if (lat) ev.latency_to_eliminate_mins = +lat[1];
  return ev;
}
/** Build an app event from one master-log row. Tested via classifyMasterLog. */
function mapMasterLogRow(r) {
  const M = IMP.masterLog;
  const g = i => String(r[i] ?? '').trim();
  const d = parseMasterLogDate(r[M.date], r[M.time]); // v3.10.3 — raw values: SheetJS may give Excel serials (numbers)
  if (!d) return null;
  const cls = classifyMasterLog(r, M);
  const obs = g(M.obs), note = M.notes >= 0 ? g(M.notes) : '', status = M.status >= 0 ? g(M.status) : '';
  return {
    ...cls,
    logged_at: d.toISOString(),
    day_number: dayNumber(d.toISOString()),
    raw_input: (`[master ${g(M.id)}] ` + (obs + ' ' + note).trim()).slice(0, 2000),
    status_outcome: (cls.status_outcome || status.slice(0, 200)) || null,
    behavioral_telemetry_notes: note.slice(0, 2000) || null,
  };
}
function parseImportDate(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number' && isFinite(v)) { // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  const d = new Date(String(v).trim());
  return isNaN(d) ? null : d;
}
function mapImportRow(r) {
  if (IMP.masterLog) return mapMasterLogRow(r); // v3.10 — master-log preset
  const col = k => { const i = IMP.map[k]; return i >= 0 ? r[i] : ''; };
  const d = parseImportDate(col('logged_at'));
  if (!d) return null;
  const { category, elimination_type } = normalizeImportEvent(col('event'));
  const notes = String(col('notes') || '').trim();
  const w = parseFloat(col('weight_lbs'));
  const ev = {
    category, logged_at: d.toISOString(), day_number: dayNumber(d.toISOString()),
    raw_input: notes || String(col('event') || ''),
    status_outcome: notes.slice(0, 140) || null,
  };
  if (elimination_type) ev.elimination_type = elimination_type;
  const kcal = parseFloat(col('kcal')); if (isFinite(kcal)) ev.event_kcal = kcal;
  const fs = parseInt(col('fecal_score')); if (fs >= 1 && fs <= 7) ev.fecal_score = fs;
  if (isFinite(w) && w > 0) ev.status_outcome = `Weight: ${w} lbs`;
  return ev;
}
function renderImportPreview() {
  const ok = IMP.rows.map(mapImportRow).filter(Boolean);
  IMP._ok = ok;
  let txt = ok.slice(0, 5).map(ev =>
    `${ev.logged_at.slice(0, 16).replace('T', ' ')} · ${ev.elimination_type || ev.category}` +
    (ev.event_kcal ? ` · ${ev.event_kcal} kcal` : '') +
    (ev.status_outcome ? ` · ${ev.status_outcome.slice(0, 60)}` : '')
  ).join('\n') || '(no rows map cleanly — check the Date and Event columns)';
  if (IMP.masterLog && ok.length) // v3.10.1 — full breakdown so the classification can be eyeballed
    txt += '\n\nBreakdown: ' + importBreakdown(ok).map(([k, n]) => `${n}× ${k}`).join(', ');
  if (IMP.masterLog && !ok.length && IMP.rows.length) { // v3.10.2 — say WHY nothing parsed
    const M = IMP.masterLog, r0 = IMP.rows[0];
    txt = `⚠ 0 of ${IMP.rows.length} rows parsed.\nFirst row: Date="${String(r0[M.date] ?? '')}" Timestamp="${String(r0[M.time] ?? '')}".\nCheck the file's date/time format and re-upload, or send me the file.`;
  }
  $('impPreview').textContent = txt;
  $('impGo').textContent = `Import ${ok.length} rows`;
}
async function runImport() {
  let ok = IMP._ok || [];
  const status = $('impStatus');
  if (!ok.length) { status.textContent = 'Nothing to import.'; return; }
  if (!S.subject) { status.textContent = 'Sign in and finish onboarding first.'; return; }
  // v3.10 — master-log: skip rows already imported (exact, via [master LOG-xxx] tag)
  let skipped = 0;
  if (IMP.masterLog) {
    const seen = new Set();
    (S.events || []).forEach(e => { const m = String(e.raw_input || '').match(/\[master (LOG-\d+)\]/); if (m) seen.add(m[1]); });
    ok = ok.filter(ev => {
      const m = String(ev.raw_input || '').match(/\[master (LOG-\d+)\]/);
      if (m && seen.has(m[1])) { skipped++; return false; }
      if (m) seen.add(m[1]);
      return true;
    });
  }
  if (!ok.length) { status.textContent = skipped ? `Nothing new — all ${skipped} rows already imported.` : 'Nothing to import.'; return; }
  // v3.10 — auto-snapshot before import so a bad import can be rolled back (More → Data versions)
  if (sbReady()) { status.textContent = 'Snapshotting current data…'; try { await createDataVersion('Before import · ' + (IMP.fileName || 'file')); } catch (e) {} }
  // v3.10 — the master log starts on Simba's true Day 1; align the app's Day 1
  if (IMP.masterLog) {
    const first = ok.map(ev => ev.logged_at.slice(0, 10)).sort()[0];
    if (first && first < CFG.DAY_ONE) { CFG.DAY_ONE = first; saveCfg(); }
  }
  status.textContent = `Importing ${ok.length}…`;
  const rows = ok.map(ev => ({ ...ev, subject_id: S.subject.id, owner_id: S.user ? S.user.id : null }));
  if (sbReady()) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await S.sb.from('telemetry_events').insert(rows.slice(i, i + 200));
      if (error) { status.textContent = '✗ Import failed: ' + error.message; return; }
      status.textContent = `Importing… ${Math.min(rows.length, i + 200)}/${rows.length}`;
    }
  } else {
    rows.forEach(ev => { ev.id = 'local-' + Date.now() + Math.random().toString(16).slice(2); localSave(ev); });
  }
  status.textContent = `✓ Imported ${rows.length} events.` + (skipped ? ` (${skipped} duplicates skipped)` : '');
  toast(`Imported ${rows.length} events ✓`);
  await loadData(); renderAll();
}

/* ---------- v3.10 — Data versions: snapshots + admin global rollback ----------
   Snapshots live server-side (simba_telemetry.data_versions) so a rollback
   applies globally — every household member sees the restored history.
   Snapshots: any household member. Rollback: pet owner only (the admin),
   enforced again inside the restore_data_version() SQL function. */
async function createDataVersion(label) {
  const status = $('verStatus');
  if (!sbReady() || !S.subject) { if (status) status.textContent = 'Sign in to snapshot.'; return null; }
  try {
    if (status) status.textContent = 'Snapshotting…';
    const { data: rows, error } = await S.sb.from('telemetry_events').select('*').eq('subject_id', S.subject.id).order('logged_at');
    if (error) throw error;
    const { data, error: e2 } = await S.sb.from('data_versions').insert({
      subject_id: S.subject.id,
      created_by: S.user ? S.user.id : null,
      created_by_email: S.user && S.user.email ? S.user.email : null,
      label: label || 'Manual snapshot',
      event_count: rows.length,
      snapshot: rows,
    }).select('id').single();
    if (e2) throw e2;
    try { // prune to the latest 20 (owner-only delete; members skip silently)
      const { data: all } = await S.sb.from('data_versions').select('id').eq('subject_id', S.subject.id).order('created_at', { ascending: false });
      if (all && all.length > 20) await S.sb.from('data_versions').delete().in('id', all.slice(20).map(x => x.id));
    } catch (e) { /* best-effort */ }
    if (status) status.textContent = `✓ Snapshot saved (${rows.length} events).`;
    await renderVersions();
    return data.id;
  } catch (e) { if (status) status.textContent = '✗ Snapshot failed: ' + e.message; return null; }
}
async function renderVersions() {
  const box = $('verList'); if (!box) return;
  if (!sbReady() || !S.subject) { box.innerHTML = '<div class="muted">Sign in to use data versions.</div>'; return; }
  let rows = null;
  try {
    const { data, error } = await S.sb.from('data_versions')
      .select('id,label,event_count,created_by_email,created_at')
      .eq('subject_id', S.subject.id).order('created_at', { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    box.innerHTML = '<div class="muted">Run <b>migration_v3.sql</b> in the Supabase SQL editor to enable data versions.</div>';
    return;
  }
  const admin = isSubjectOwner();
  box.innerHTML = rows.length ? rows.map((v, i) => `
    <div class="tl-item"><div class="tl-body"><b>v${rows.length - i}</b> · ${esc(v.label)}<br>
    <span class="hint">${new Date(v.created_at).toLocaleString()} · ${v.event_count} events${v.created_by_email ? ' · by ' + esc(v.created_by_email) : ''}</span></div>
    ${admin ? `<div class="tl-actions"><button data-restore="${v.id}" title="Roll back to this version">↩ Restore</button></div>` : ''}</div>`).join('')
    : '<div class="muted">No snapshots yet. One is taken automatically before every import.</div>';
  if (!admin && rows.length) box.innerHTML += '<div class="muted small" style="margin-top:6px">Only the pet owner can roll back a version.</div>';
  box.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => restoreVersion(b.dataset.restore, b));
}
async function restoreVersion(id, btn) {
  const status = $('verStatus');
  if (!isSubjectOwner()) { toast('Only the pet owner can roll back.'); return; }
  if (!confirm('Roll back ALL of Simba\u2019s events to this version?\n\nThis replaces the entire event history for everyone (global). A safety snapshot of the current data is taken first.')) return;
  try {
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Rolling back…';
    await createDataVersion('Auto: before rollback'); // safety net
    const { data, error } = await S.sb.rpc('restore_data_version', { _version_id: id });
    if (error) throw error;
    if (status) status.textContent = `✓ Rolled back — ${data} events restored for everyone.`;
    toast('Rolled back ✓');
    await loadData(); renderAll(); await renderVersions();
  } catch (e) { if (status) status.textContent = '✗ Rollback failed: ' + e.message; }
  finally { if (btn) btn.disabled = false; }
}
document.addEventListener('DOMContentLoaded', init);

/* =====================================================================
   PART 7 — v2.0 features
   Clockface dial · streaks · multi-pet · learning banner · GPS walks ·
   meds & vaccinations · vet report · household sharing · back-dated entries
   ===================================================================== */

/* ---------- Back-dated entries ---------- */
function nowLocalInput(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Pure: datetime-local value → ISO string. Tested. */
function backdateISO(val) { return new Date(val).toISOString(); }
/** Build a minimal event for the manual back-date form. */
function backdateEvent(cat, note) {
  const ev = { category: cat };
  if (note) { ev.status_outcome = note.slice(0, 120); ev.raw_input = note; }
  if (cat === 'Pee') { ev.category = 'Elimination'; ev.elimination_type = 'Pee'; ev.location_substrate = 'Lawn Grass'; }
  if (cat === 'Poop') { ev.category = 'Elimination'; ev.elimination_type = 'Poop'; ev.location_substrate = 'Lawn Grass'; }
  if (cat === 'Nap') { ev.category = 'Nap'; ev.crate_action = 'Crate_Entry'; }
  return ev;
}

/* ---------- 24-hour clockface pattern dial (Trends hero) ---------- */
function renderClockDial() {
  const box = $('clockDial'); if (!box) return;
  const type = S.dialType || 'All';
  const evs = eventsInDays(90);
  const match = type === 'Pee' ? isPee
    : type === 'Poop' ? (e => ['Poop', 'Pee_Poop'].includes(e.elimination_type))
    : (e => isPee(e) || ['Poop', 'Pee_Poop'].includes(e.elimination_type));
  const { probs, days } = hourlyProb(evs, match);
  const size = 320, cx = 160, cy = 160, r = 112;
  let s = `<svg viewBox="0 0 320 320" class="dial" role="img" aria-label="24-hour event pattern dial">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r + 22}" fill="#0e1a14" stroke="#1d3128"/>`;
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((h + 1) / 24) * Math.PI * 2 - Math.PI / 2;
    const p = probs[h];
    const w = 2.5 + p * 15; // repeated times render as thickened bands
    const col = p >= 0.8 ? '#35c37d' : p >= 0.5 ? '#f2b134' : p > 0 ? '#2a6b4a' : '#223a2e';
    const x1 = (cx + r * Math.cos(a)).toFixed(1), y1 = (cy + r * Math.sin(a)).toFixed(1);
    const x2 = (cx + r * Math.cos(a2)).toFixed(1), y2 = (cy + r * Math.sin(a2)).toFixed(1);
    s += `<path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${col}" stroke-width="${w.toFixed(1)}" fill="none" stroke-linecap="round" opacity="${p > 0 ? 0.95 : 0.45}"/>`;
    if (h % 3 === 0) {
      const lx = (cx + (r + 34) * Math.cos(a)).toFixed(1), ly = (cy + (r + 34) * Math.sin(a)).toFixed(1);
      s += `<text x="${lx}" y="${(+ly + 4).toFixed(1)}" fill="#9db3a7" font-size="11" text-anchor="middle">${fmtHour(h)}</text>`;
    }
  }
  // hands pointing at the two strongest hours
  const ranked = probs.map((p, h) => [p, h]).sort((a, b) => b[0] - a[0]).slice(0, 2);
  s += `<text x="${cx}" y="${cy - 4}" fill="#eef5f0" font-size="15" text-anchor="middle" font-weight="700">${type === 'All' ? 'Pee + Poop' : type}</text>`;
  s += `<text x="${cx}" y="${cy + 16}" fill="#9db3a7" font-size="11" text-anchor="middle">${days} days of data</text>`;
  if (ranked[0][0] > 0) s += `<text x="${cx}" y="${cy + 34}" fill="#35c37d" font-size="11" text-anchor="middle">peak ${fmtHour(ranked[0][1])}${ranked[1][0] > 0 ? ' · ' + fmtHour(ranked[1][1]) : ''}</text>`;
  s += `</svg>`;
  box.innerHTML = s;
  const note = $('dialNote');
  if (note) note.textContent = days < 3
    ? 'Log a few days — repeated times will thicken into visible bands.'
    : 'Thick green bands = times that repeat most days. Move a walk to cover them.';
}

/* ---------- Streaks & success rates (pure + cockpit) ---------- */
/** Consecutive accident-free days with logged events, anchored at today (or
    yesterday if today is unlogged). A day with zero events breaks the counted
    streak — conservative by design. Pure — tested. */
function accidentFreeStreak(history, now = new Date()) {
  const days = dayBuckets(history);
  if (!Object.keys(days).length) return 0;
  const t = todayStr(now), y = todayStr(new Date(now.getTime() - 86400000));
  const anchor = days[t] ? t : (days[y] ? y : null);
  if (!anchor) return 0;
  // v3.13 — a day with no logged data is skipped, not a streak-breaker:
  // only real data counts.
  let streak = 0; const d = new Date(anchor + 'T12:00:00');
  for (let guard = 0; guard < 3650; guard++) {
    const k = todayStr(d), evs = days[k];
    if (evs && evs.length) {
      if (evs.some(e => /Accident/.test(e.elimination_type || ''))) break;
      streak++;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
/** Outdoor pees / (outdoor pees + accidents) over trailing n days, %. Null when no data. Pure — tested. */
function outdoorSuccessRate(history, n = 7, now = new Date()) {
  const evs = filterLastDays(history, n, now);
  const out = evs.filter(e => ['Pee', 'Pee_Poop', 'Micro_Pee'].includes(e.elimination_type)).length;
  const acc = evs.filter(e => /Accident/.test(e.elimination_type || '')).length;
  return (out + acc) ? Math.round(out / (out + acc) * 100) : null;
}
/** % of logged days in trailing n with ≥2 poops (the 2/day circadian quota). Pure — tested. */
function poopQuotaCompliance(history, n = 7, now = new Date()) {
  const days = dayBuckets(filterLastDays(history, n, now));
  const keys = Object.keys(days).filter(k => days[k].length);
  if (!keys.length) return null;
  const ok = keys.filter(k => days[k].filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length >= 2).length;
  return Math.round(ok / keys.length * 100);
}
function renderStreaks() {
  const el = $('streakRow'); if (!el) return;
  const s = accidentFreeStreak(S.history);
  const o = outdoorSuccessRate(S.history);
  const q = poopQuotaCompliance(S.history);
  el.innerHTML = `
    <div class="stat"><div class="stat-label">🔥 Accident-free streak</div><div class="stat-value">${s}<span class="unit"> days</span></div></div>
    <div class="stat"><div class="stat-label">🎯 Outdoor success · 7d</div><div class="stat-value">${o === null ? '—' : o + '<span class="unit"> %</span>'}</div></div>
    <div class="stat"><div class="stat-label">💩 Poop quota · 7d</div><div class="stat-value">${q === null ? '—' : q + '<span class="unit"> %</span>'}</div></div>`;
}

/* ---------- Multi-pet subject switcher (v3.1 — lives in the top header) ---------- */
function renderSubjectSwitcher() {
  const sel = $('topSubjectPick'); if (!sel) return;
  const multi = sbReady() && S.subjects.length > 1;
  sel.hidden = !multi;
  if (!multi) return;
  sel.innerHTML = S.subjects.map(s =>
    `<option value="${s.id}"${S.subject && String(s.id) === String(S.subject.id) ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
}
async function addPet(data) {
  if (!sbReady()) { toast('Connect Supabase to add pets.'); return; }
  const { data: rows, error } = await S.sb.from('subjects')
    .insert({ owner_id: S.user.id, target_awake_hold_mins: 80, clean_overnight_streak_days: 0, ...data }).select();
  if (error) { toast('Add pet failed: ' + error.message); return; }
  toast(`${data.name} added ✓`);
  await loadSubjects();
  if (rows && rows[0]) { S.subject = rows[0]; localStorage.setItem('st_active_pet', String(rows[0].id)); }
  await loadData();
}

/* ---------- Learning-mode banner (cockpit) ---------- */
function renderLearnBannerCockpit() {
  const el = $('learnBannerCockpit'); if (!el) return;
  const d = learningDataDays(filterLastDays(S.history, 90));
  if (d >= 14 || !S.history.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `🧠 <b>Learning mode</b> — ${d}/14 days of data. High-confidence schedule nudges activate at 14 days.`;
}

/* ---------- GPS walk tracking (offline-first, no map tiles) ---------- */
/** Great-circle distance in meters. Pure — tested. */
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/** Total route length in meters. Pure — tested. */
function routeDistanceM(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++)
    d += haversineM(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  return d;
}
function startWalk() {
  if (S.walk) { toast('Walk already in progress.'); return; }
  if (!navigator.geolocation) { toast('Geolocation not available on this device.'); return; }
  S.walk = { points: [], startTs: Date.now(), distM: 0, watchId: null };
  S.walk.watchId = navigator.geolocation.watchPosition(pos => {
    if (!S.walk) return;
    const { latitude: lat, longitude: lon } = pos.coords;
    const pts = S.walk.points, last = pts[pts.length - 1];
    if (last) {
      const d = haversineM(last.lat, last.lon, lat, lon);
      if (d < 3) return;                       // GPS jitter guard
      S.walk.distM += d;
    }
    pts.push({ lat, lon, t: Date.now() });
    renderWalkLive();
  }, err => toast('GPS error: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  renderWalkCard();
  toast('Walk started — GPS tracking…');
}
async function stopWalk() {
  const w = S.walk;
  if (!w) return;
  if (w.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(w.watchId);
  const mins = (Date.now() - w.startTs) / 60000;
  const route = w.points;
  const distM = Math.round(routeDistanceM(route));
  S.walk = null;
  const rec = {
    subject_id: S.subject?.id || null, owner_id: S.user?.id || null,
    started_at: new Date(w.startTs).toISOString(), ended_at: new Date().toISOString(),
    distance_m: distM, duration_mins: Math.round(mins * 10) / 10, route,
  };
  let walkId = null;
  if (sbReady() && rec.subject_id) {
    try { const { data } = await S.sb.from('walks').insert(rec).select('id'); walkId = data?.[0]?.id || null; }
    catch (e) { console.warn('walks table unavailable (run migration_v2.sql)', e); }
  }
  if (!walkId) { // local fallback — the route is never lost
    const stash = JSON.parse(localStorage.getItem('st_walks') || '[]');
    rec.id = walkId = 'local-' + Date.now();
    stash.push(rec); localStorage.setItem('st_walks', JSON.stringify(stash));
  }
  const ev = { category: 'Walk',
    status_outcome: `Walk ${(distM / 1000).toFixed(2)} km in ${Math.round(mins)}m (${route.length} pts)`,
    raw_input: 'GPS walk #' + walkId };
  if (!String(walkId).startsWith('local-')) ev.walk_id = walkId; // column exists post-migration
  await saveEvent(ev);
  renderWalkCard();
  if (route.length > 1) drawRoute($('walkRoute'), route);
  toast(`Walk saved: ${(distM / 1000).toFixed(2)} km ✓`);
  await loadData();
}
function renderWalkCard() {
  const card = $('walkCard'); if (!card) return;
  if (S.walk) {
    $('walkStartBtn').hidden = true; $('walkStopBtn').hidden = false;
    renderWalkLive();
  } else {
    $('walkStartBtn').hidden = false; $('walkStopBtn').hidden = true;
    $('walkLive').innerHTML = '<span class="muted">Track distance, time & route — works offline.</span>';
  }
}
function renderWalkLive() {
  const w = S.walk; if (!w) return;
  const mins = (Date.now() - w.startTs) / 60000;
  $('walkLive').innerHTML = `🚶 <b>${(w.distM / 1000).toFixed(2)} km</b> · ${fmtDur(mins)} · ${w.points.length} pts`;
  if (w.points.length > 1) drawRoute($('walkRoute'), w.points);
}
/** Draw a GPS route as a polyline on a plain canvas (no map tiles — $0, offline). */
function drawRoute(cv, points) {
  if (!cv || !points || points.length < 2) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = 140;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
  const lo = { lat: Math.min(...lats), lon: Math.min(...lons) };
  const hi = { lat: Math.max(...lats), lon: Math.max(...lons) };
  const pad = 14, spanLat = (hi.lat - lo.lat) || 1e-6, spanLon = (hi.lon - lo.lon) || 1e-6;
  const X = lon => pad + ((lon - lo.lon) / spanLon) * (W - 2 * pad);
  const Y = lat => pad + (1 - (lat - lo.lat) / spanLat) * (H - 2 * pad);
  ctx.strokeStyle = '#4fa8e4'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(X(p.lon), Y(p.lat)) : ctx.moveTo(X(p.lon), Y(p.lat)));
  ctx.stroke();
  ctx.fillStyle = '#35c37d'; ctx.beginPath(); ctx.arc(X(points[0].lon), Y(points[0].lat), 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#e4574f';
  const l = points[points.length - 1];
  ctx.beginPath(); ctx.arc(X(l.lon), Y(l.lat), 5, 0, 7); ctx.fill();
}
async function viewWalk(ev) {
  S.sheetCtx = { kind: 'WalkView' };
  $('sheetTitle').textContent = 'Walk route';
  const m = (ev.raw_input || '').match(/#(\S+)/);
  const wid = ev.walk_id || (m ? m[1] : null);
  let points = null;
  if (wid && !String(wid).startsWith('local-') && sbReady()) {
    try {
      const { data } = await S.sb.from('walks').select('route').eq('id', wid).single();
      if (data && data.route) points = data.route;
    } catch (e) { /* ignore */ }
  }
  if (!points && wid) {
    const stash = JSON.parse(localStorage.getItem('st_walks') || '[]');
    const rec = stash.find(r => String(r.id) === String(wid));
    if (rec) points = rec.route;
  }
  $('sheetBody').innerHTML = points && points.length > 1
    ? `<div class="muted small">${esc(ev.status_outcome || '')}</div><canvas id="walkViewCv" height="140" style="margin-top:8px"></canvas>`
    : `<div class="muted">Route not available for this walk.</div>`;
  $('sheet').hidden = false;
  if (points && points.length > 1) drawRoute($('walkViewCv'), points);
}

/* ---------- Medications & vaccinations (v2.0) ---------- */
function careGet(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
function careSet(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
/* Merge server rows with local-only rows (id starts with "local-") so offline
   entries are never clobbered by a reload. */
function careMerge(key, serverRows) {
  const local = careGet(key).filter(r => String(r.id || '').startsWith('local-'));
  careSet(key, [...(serverRows || []), ...local]);
}
async function loadCareTables() {
  S.meds = careGet('st_meds'); S.medLogs = careGet('st_medlogs'); S.vax = careGet('st_vax');
  if (!sbReady() || !S.subject) return;
  for (const [tbl, key] of [['medications', 'st_meds'], ['vaccinations', 'st_vax']]) {
    try {
      const { data, error } = await S.sb.from(tbl).select('*').eq('subject_id', S.subject.id).order('created_at');
      if (!error) careMerge(key, data);
    } catch (e) { /* pre-migration — local fallback stands */ }
  }
  try {
    const { data, error } = await S.sb.from('med_logs').select('*').eq('subject_id', S.subject.id)
      .order('given_at', { ascending: false }).limit(200);
    if (!error) careMerge('st_medlogs', data);
  } catch (e) { /* pre-migration */ }
  S.meds = careGet('st_meds'); S.medLogs = careGet('st_medlogs'); S.vax = careGet('st_vax');
}
/** Next due timestamp for a frequency + time-of-day, from `from`. */
function nextDueFrom(freq, timeOfDay, from = new Date()) {
  const d = new Date(from);
  const applyTime = () => { if (timeOfDay) { const [h, m] = timeOfDay.split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); } };
  switch (freq) {
    case 'twice_daily': applyTime(); if (d <= from) d.setHours(d.getHours() + 12); break;
    case 'daily':       applyTime(); if (d <= from) d.setDate(d.getDate() + 1); break;
    case 'weekly':      d.setDate(d.getDate() + 7); applyTime(); break;
    case 'monthly':     d.setMonth(d.getMonth() + 1); applyTime(); break;
    default:            applyTime(); // once | as_needed → today at time, or now
  }
  return d.toISOString();
}
function medsForSubject() {
  return (S.meds || []).filter(m => !S.subject || !m.subject_id || String(m.subject_id) === String(S.subject.id));
}
function vaxForSubject() {
  return (S.vax || []).filter(v => !S.subject || !v.subject_id || String(v.subject_id) === String(S.subject.id));
}
async function saveMedForm() {
  const name = $('medName').value.trim();
  if (!name) { toast('Enter a medication name.'); return; }
  const freq = $('medFreq').value, tod = $('medTime').value;
  const rec = { subject_id: S.subject?.id || null, owner_id: S.user?.id || null,
    name, dose: $('medDose').value.trim() || null, frequency: freq,
    time_of_day: tod || null, next_due_at: nextDueFrom(freq, tod), active: true,
    notes: $('medNote').value.trim() || null };
  let saved = false;
  if (sbReady() && rec.subject_id) {
    try { const { error } = await S.sb.from('medications').insert(rec); if (error) throw error; saved = true; }
    catch (e) { console.warn('medications table unavailable', e); }
  }
  if (!saved) { const a = careGet('st_meds'); rec.id = 'local-' + Date.now(); a.push(rec); careSet('st_meds', a); }
  $('medForm').hidden = true;
  ['medName', 'medDose', 'medTime', 'medNote'].forEach(id => { $(id).value = ''; });
  await loadCareTables(); renderMeds(); renderCockpit();
  toast('Medication saved ✓');
}
async function saveVaxForm() {
  const vaccine = $('vaxName').value.trim();
  if (!vaccine) { toast('Enter a vaccine / visit name.'); return; }
  const rec = { subject_id: S.subject?.id || null, owner_id: S.user?.id || null,
    vaccine, given_at: $('vaxGiven').value ? new Date($('vaxGiven').value).toISOString() : new Date().toISOString(),
    next_due_at: $('vaxDue').value ? new Date($('vaxDue').value).toISOString() : null,
    vet: $('vaxVet').value.trim() || null, note: $('vaxNote').value.trim() || null };
  let saved = false;
  if (sbReady() && rec.subject_id) {
    try { const { error } = await S.sb.from('vaccinations').insert(rec); if (error) throw error; saved = true; }
    catch (e) { console.warn('vaccinations table unavailable', e); }
  }
  if (!saved) { const a = careGet('st_vax'); rec.id = 'local-' + Date.now(); a.push(rec); careSet('st_vax', a); }
  $('vaxForm').hidden = true;
  ['vaxName', 'vaxGiven', 'vaxDue', 'vaxVet', 'vaxNote'].forEach(id => { $(id).value = ''; });
  await loadCareTables(); renderMeds(); renderCockpit();
  toast('Vaccination saved ✓');
}
async function markMedGiven(id) {
  const med = (S.meds || []).find(m => String(m.id) === String(id));
  if (!med) return;
  const log = { medication_id: med.id, subject_id: S.subject?.id || null, owner_id: S.user?.id || null,
    given_at: new Date().toISOString(), note: null };
  const next = nextDueFrom(med.frequency, med.time_of_day, new Date());
  let saved = false;
  if (sbReady() && !String(med.id).startsWith('local-')) {
    try {
      const { error: e1 } = await S.sb.from('med_logs').insert(log); if (e1) throw e1;
      const { error: e2 } = await S.sb.from('medications').update({ next_due_at: next }).eq('id', med.id); if (e2) throw e2;
      saved = true;
    } catch (e) { console.warn('med dose sync failed', e); }
  }
  if (!saved) {
    const a = careGet('st_medlogs'); log.id = 'local-' + Date.now(); a.push(log); careSet('st_medlogs', a);
    const ms = careGet('st_meds'); const i = ms.findIndex(m => String(m.id) === String(med.id));
    if (i >= 0) { ms[i] = { ...ms[i], next_due_at: next }; careSet('st_meds', ms); }
  }
  await loadCareTables(); renderMeds(); renderCockpit();
  toast(`${med.name} dose logged ✓`);
}
async function deleteCareRow(table, key, id) {
  if (!confirm('Delete this record?')) return;
  if (sbReady() && !String(id).startsWith('local-')) {
    const { error } = await S.sb.from(table).delete().eq('id', id);
    if (error) { toast('Delete failed: ' + error.message); return; }
  }
  careSet(key, careGet(key).filter(r => String(r.id) !== String(id)));
  await loadCareTables(); renderMeds(); renderCockpit();
}
function fmtDue(iso) {
  if (!iso) return '—';
  const ms = new Date(iso) - new Date();
  if (ms < 0) return `<span style="color:var(--danger);font-weight:700">OVERDUE ${fmtDur(-ms / 60000)} ago</span>`;
  return `in ${fmtDur(ms / 60000)}`;
}
function renderMeds() {
  const ml = $('medList'), vl = $('vaxList');
  if (!ml || !vl) return;
  const meds = medsForSubject();
  ml.innerHTML = meds.length ? meds.map(m => `
    <div class="tl-item"><div class="tl-body"><b>💊 ${esc(m.name)}</b> <span class="hint">${esc(m.dose || '')} · ${esc(m.frequency || '')}</span><br>
    <span class="muted">Next due: ${fmtDue(m.next_due_at)}</span></div>
    <div class="tl-actions"><button data-give="${m.id}" title="Mark dose given">✓</button><button data-delmed="${m.id}" title="Delete">🗑</button></div></div>`).join('')
    : '<div class="muted">No medications tracked.</div>';
  ml.querySelectorAll('[data-give]').forEach(b => b.onclick = () => markMedGiven(b.dataset.give));
  ml.querySelectorAll('[data-delmed]').forEach(b => b.onclick = () => deleteCareRow('medications', 'st_meds', b.dataset.delmed));
  const vax = vaxForSubject();
  vl.innerHTML = vax.length ? vax.map(v => `
    <div class="tl-item"><div class="tl-body"><b>💉 ${esc(v.vaccine)}</b><br>
    <span class="muted">Given ${v.given_at ? v.given_at.slice(0, 10) : '—'}${v.vet ? ' · ' + esc(v.vet) : ''} · Next due: ${v.next_due_at ? v.next_due_at.slice(0, 10) : '—'}</span></div>
    <div class="tl-actions"><button data-delvax="${v.id}" title="Delete">🗑</button></div></div>`).join('')
    : '<div class="muted">No vaccinations recorded.</div>';
  vl.querySelectorAll('[data-delvax]').forEach(b => b.onclick = () => deleteCareRow('vaccinations', 'st_vax', b.dataset.delvax));
}
/** Due-soon care items surface as cockpit countdowns. */
function careReminders() {
  const out = [], now = new Date();
  medsForSubject().forEach(m => {
    if (m.active === false || !m.next_due_at) return;
    const ms = new Date(m.next_due_at) - now;
    if (ms < 3 * 3600000) out.push({ label: `💊 ${m.name}${ms < 0 ? ' OVERDUE' : ' due'}`, ms, action: () => markMedGiven(m.id) });
  });
  vaxForSubject().forEach(v => {
    if (!v.next_due_at) return;
    const ms = new Date(v.next_due_at) - now;
    if (ms < 14 * 86400000 && ms > -30 * 86400000)
      out.push({ label: `💉 ${v.vaccine}${ms < 0 ? ' OVERDUE' : ' due ' + new Date(v.next_due_at).toLocaleDateString()}`, ms });
  });
  return out;
}

/* ---------- Vet-ready report (print → Save as PDF) ---------- */
async function renderVetReport() {
  const box = $('vetReport'); if (!box) return;
  const rows = await allHistory();
  const evs30 = filterLastDays(rows, 30);
  const s = S.subject || {};
  const kg = s.current_weight_kg || +(localStorage.getItem('st_weight') || 3.40);
  const wks = ageWeeks(s.date_of_birth || '2026-05-31');
  const pees = evs30.filter(isPee).length;
  const poops = evs30.filter(e => ['Poop', 'Pee_Poop'].includes(e.elimination_type)).length;
  const acc = evs30.filter(e => /Accident/.test(e.elimination_type || '')).length;
  const kcalDays = dayBuckets(evs30);
  const kcalAvg = Object.keys(kcalDays).length
    ? Math.round(Object.values(kcalDays).reduce((a, d) => a + d.reduce((x, e) => x + (+e.event_kcal || 0), 0), 0) / Object.keys(kcalDays).length) : 0;
  const meds = medsForSubject(), vax = vaxForSubject();
  box.innerHTML = `
    <div class="vet-head">
      <h2>🐾 ${esc(s.name || 'Simba')} — Veterinary Summary</h2>
      <div class="muted">${esc(s.breed || 'Cavapoo')} · ${s.sex || 'male'} · DOB ${esc(s.date_of_birth || '2026-05-31')} (${wks} weeks) · ${(kg * 2.20462).toFixed(2)} lbs (${kg} kg)</div>
      <div class="muted small">Generated ${new Date().toLocaleString()} · trailing 30 days · WagWise v2.2</div>
    </div>
    <h3>Weight</h3>
    <canvas id="chVetWeight" height="110"></canvas>
    <h3>Vaccinations & vet visits (${vax.length})</h3>
    ${vax.length ? `<table class="vet-table"><tr><th>Vaccine / visit</th><th>Given</th><th>Next due</th><th>Vet</th></tr>` +
      vax.map(v => `<tr><td>${esc(v.vaccine)}</td><td>${v.given_at ? v.given_at.slice(0, 10) : '—'}</td><td>${v.next_due_at ? v.next_due_at.slice(0, 10) : '—'}</td><td>${esc(v.vet || '—')}</td></tr>`).join('') + `</table>`
      : '<p class="muted">None recorded.</p>'}
    <h3>Medications (${meds.length})</h3>
    ${meds.length ? `<table class="vet-table"><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Next due</th></tr>` +
      meds.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose || '—')}</td><td>${esc(m.frequency || '—')}</td><td>${m.next_due_at ? new Date(m.next_due_at).toLocaleString() : '—'}</td></tr>`).join('') + `</table>`
      : '<p class="muted">None tracked.</p>'}
    <h3>30-day event summary</h3>
    <table class="vet-table">
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total events logged</td><td>${evs30.length}</td></tr>
      <tr><td>Pees (outdoor)</td><td>${pees}</td></tr>
      <tr><td>Poops</td><td>${poops}</td></tr>
      <tr><td>Accidents (pee + poop)</td><td><b>${acc}</b></td></tr>
      <tr><td>Avg daily kcal</td><td>${kcalAvg} (target ${CFG.KCAL_MIN}–${CFG.KCAL_MAX})</td></tr>
      <tr><td>Accident-free streak</td><td>${accidentFreeStreak(rows)} days</td></tr>
      <tr><td>Outdoor success (7d)</td><td>${outdoorSuccessRate(rows) ?? '—'}%</td></tr>
    </table>`;
  const wts = evs30.filter(e => e.category === 'Weight').map(e => {
    const m = (e.status_outcome || '').match(/([\d.]+)\s*lbs/); return m ? { d: e.logged_at.slice(5, 10), v: +m[1] } : null;
  }).filter(Boolean);
  if (wts.length > 1) {
    const vs = wts.map(w => w.v), lo = Math.min(...vs) - 0.1;
    drawBars('chVetWeight', wts.map(w => w.d), vs.map(v => v - lo), { colorFn: () => '#4fa8e4' });
  }
}
function printVetReport() {
  document.body.classList.add('printing-report');
  window.print();
}

/* ---------- Household sharing ---------- */
async function renderHousehold() {
  const box = $('hhList'); if (!box) return;
  if (!sbReady() || !S.subject) { box.innerHTML = '<div class="muted">Connect Supabase and sign in to share.</div>'; return; }
  let rows = null;
  try {
    const { data, error } = await S.sb.from('household_members').select('*').eq('subject_id', S.subject.id).order('created_at');
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    box.innerHTML = '<div class="muted">Run <b>migration_v2.sql</b> in the Supabase SQL editor to enable household sharing.</div>';
    $('hhAddRow').hidden = true;
    return;
  }
  const owner = isSubjectOwner();
  $('hhSubjectName').textContent = S.subject?.name || '';
  box.innerHTML = rows.length ? rows.map(m => `
    <div class="tl-item"><div class="tl-body"><b>${esc(m.email)}</b> <span class="hint">${esc(m.role)}${m.user_id ? '' : ' · invited — signs in to join'}</span></div>
    ${owner && m.role !== 'owner' ? `<div class="tl-actions"><button data-hhdel="${m.id}" title="Remove">🗑</button></div>` : ''}</div>`).join('')
    : '<div class="muted">Just you so far — invite family below and everyone logs into the same record.</div>';
  box.querySelectorAll('[data-hhdel]').forEach(b => b.onclick = () => removeHouseholdMember(b.dataset.hhdel));
  $('hhAddRow').hidden = !owner;
}
async function addHouseholdMember() {
  const email = $('hhEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) { toast('Enter a valid email.'); return; }
  if (!isSubjectOwner()) { toast('Only the pet owner can invite members.'); return; }
  try {
    const { error } = await S.sb.from('household_members').insert({ subject_id: S.subject.id, email, role: 'member' });
    if (error) throw error;
    $('hhEmail').value = '';
    toast(`Invited ${email} ✓ — they sign in on their device to join.`);
    renderHousehold();
  } catch (e) { toast('Invite failed: ' + e.message); }
}
async function removeHouseholdMember(id) {
  if (!confirm('Remove this member?')) return;
  const { error } = await S.sb.from('household_members').delete().eq('id', id);
  if (error) toast('Remove failed: ' + error.message); else renderHousehold();
}
