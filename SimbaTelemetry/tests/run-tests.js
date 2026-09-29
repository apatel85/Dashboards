/* Simba Telemetry v2.0 — Node test harness.
   Loads app.js with stubbed browser globals and asserts the pure engines:
   v1 (bladder model, contingency triggers, telemetry parser) + v2 (streaks,
   confidence/gating, haversine, back-dating, med scheduling).
   Run: node tests/run-tests.js */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- minimal browser stubs (app.js touches DOM only inside UI functions) ----
const _store = {};
global.localStorage = {
  getItem: k => (_store[k] ?? null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};
global.window = { devicePixelRatio: 1 };
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {}, get textContent() { return ''; } }),
  hidden: false,
  body: { classList: { add() {}, remove() {} } },
};
try { Object.defineProperty(global, 'navigator', { value: {}, configurable: true }); } catch (e) { /* node>=21 has one */ }

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const api = 'calculateBladderState,evaluateContingencyTriggers,parseTelemetry,wordsToNum,' +
  'hourlyProb,dayBuckets,learnedWindows,nudgeConfidence,shouldNudge,filterLastDays,' +
  'accidentFreeStreak,outdoorSuccessRate,poopQuotaCompliance,haversineM,routeDistanceM,' +
  'backdateISO,backdateEvent,nextDueFrom,todayStr';
eval(src + `\n;globalThis.__T = { ${api} };`);
const T = globalThis.__T;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', name); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }
// local ISO string (no TZ suffix) so getHours()/slice(0,10) behave like the app
function isoLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
function mkEv(dateObj, type, cat) {
  return { logged_at: isoLocal(dateObj), elimination_type: type, category: cat || 'Elimination' };
}
function atDaysAgo(base, n, h, m) {
  const d = new Date(base); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d;
}

console.log('— v1 engines —');

// calculateBladderState
{
  const now = Date.now();
  const fresh = T.calculateBladderState(now - 10 * 60000, now, false, 0, 999);
  ok(fresh.accidentRisk === 'LOW', 'bladder: fresh void is LOW');
  const elev = T.calculateBladderState(now - 65 * 60000, now, false, 0, 999);
  ok(elev.accidentRisk === 'ELEVATED', 'bladder: 65m awake hold is ELEVATED');
  const crit = T.calculateBladderState(now - 80 * 60000, now, false, 0, 999);
  ok(crit.accidentRisk === 'CRITICAL', 'bladder: 80m awake hold is CRITICAL');
  const asleep = T.calculateBladderState(now - 500 * 60000, now, true, 0, 999);
  ok(asleep.accidentRisk === 'LOW', 'bladder: long sleep hold stays LOW (ADH)');
  // fluid bolus peak: 35 min after 100 mL → fraction .62 → ~65.6 mL > 18 → CRITICAL
  const bolus = T.calculateBladderState(now - 35 * 60000, now, false, 100, 35);
  ok(bolus.accidentRisk === 'CRITICAL', 'bladder: fluid peak + volume is CRITICAL');
  ok(bolus.estimatedVolumeMl > 18, 'bladder: bolus volume math sane');
  const boundary = T.calculateBladderState(now - 74 * 60000, now, false, 0, 999);
  ok(boundary.accidentRisk === 'ELEVATED', 'bladder: 74m is ELEVATED, not CRITICAL');
}

// evaluateContingencyTriggers
{
  const none = T.evaluateContingencyTriggers({ elapsedAwakeHoldMins: 10, minsSinceFluid: 999, currentSubstrate: 'Lawn Grass', minsSinceLastPee: 999, dailyPoopsCompleted: 0, doorTellFlag: false, lastMealTexture: 'Wet_Topped', mealInProgress: false, mealElapsedMins: 999, currentTimeStr: '12:00', waterBowlsPulled: true });
  ok(none.length === 0, 'triggers: quiet state produces no alerts');
  const meal = T.evaluateContingencyTriggers({ elapsedAwakeHoldMins: 10, minsSinceFluid: 999, currentSubstrate: 'Lawn Grass', minsSinceLastPee: 999, dailyPoopsCompleted: 0, doorTellFlag: false, lastMealTexture: 'Wet_Topped', mealInProgress: true, mealElapsedMins: 16, currentTimeStr: '12:00', waterBowlsPulled: true });
  ok(meal.some(a => /pickup/i.test(a.text)), 'triggers: 15-min dish pickup fires');
  const cutoff = T.evaluateContingencyTriggers({ elapsedAwakeHoldMins: 10, minsSinceFluid: 999, currentSubstrate: 'Lawn Grass', minsSinceLastPee: 999, dailyPoopsCompleted: 0, doorTellFlag: false, lastMealTexture: 'Wet_Topped', mealInProgress: false, mealElapsedMins: 999, currentTimeStr: '20:30', waterBowlsPulled: false });
  ok(cutoff.some(a => /cutoff/i.test(a.text)), 'triggers: water cutoff fires after 20:15');
  const crit = T.evaluateContingencyTriggers({ elapsedAwakeHoldMins: 80, minsSinceFluid: 35, currentSubstrate: 'Living Room Carpet', minsSinceLastPee: 999, dailyPoopsCompleted: 0, doorTellFlag: false, lastMealTexture: 'Wet_Topped', mealInProgress: false, mealElapsedMins: 999, currentTimeStr: '12:00', waterBowlsPulled: true });
  ok(crit.some(a => a.level === 'crit'), 'triggers: carpet + hold + fluid peak is crit');
}

// parseTelemetry
{
  const r1 = T.parseTelemetry('Simba peed at 7:52, 3 to 4 second squat');
  ok(r1.event.elimination_type === 'Pee', 'parser: pee detected');
  ok(r1.event.stream_duration_seconds === 3.5, 'parser: stream duration averaged');
  const r2 = T.parseTelemetry('ate 3 tbsp chicken kibble with half egg');
  ok(r2.event.category === 'Food' && r2.event.kibble_consumed_tbsp === 3, 'parser: food + tbsp');
  ok(approx(r2.event.event_kcal, 3 * 26.94 + 0.5 * 70, 0.01), 'parser: kcal = kibble + egg');
  const r3 = T.parseTelemetry('poop accident on the carpet');
  ok(r3.event.elimination_type === 'Accident_Poop', 'parser: accident poop');
  const r4 = T.parseTelemetry('drank two and a half tsp water');
  ok(r4.event.water_consumed_tsp === 2.5, 'parser: fraction words → 2.5');
  const r5 = T.parseTelemetry('took him out at 7:50 as he was by the door, peed at 7:52');
  ok(r5.event.door_tell_observed === true, 'parser: door tell');
  ok(r5.event.logged_at && new Date(r5.event.logged_at).getHours() === 7 && new Date(r5.event.logged_at).getMinutes() === 52, 'parser: last time in text wins (7:52)');
}

console.log('— v2 learned-schedule confidence —');

// nudgeConfidence + shouldNudge
{
  ok(T.nudgeConfidence(0.9, 14) === 90, 'confidence: full at 14 days');
  ok(T.nudgeConfidence(0.9, 28) === 90, 'confidence: capped past 14 days');
  ok(T.nudgeConfidence(0.9, 7) === 45, 'confidence: half at 7 days');
  ok(T.nudgeConfidence(0.85, 7) === 43, 'confidence: 0.85 × 7/14 rounds to 43');
  ok(T.nudgeConfidence(0.9, 0) === 0, 'confidence: zero with no data');
  ok(T.shouldNudge({ prob: 0.85, dataDays: 20, clusterDays: 5 }) === true, 'gating: mature confident cluster nudges');
  ok(T.shouldNudge({ prob: 0.85, dataDays: 7, clusterDays: 5 }) === false, 'gating: <14 days → quiet start');
  ok(T.shouldNudge({ prob: 0.85, dataDays: 20, clusterDays: 2 }) === false, 'gating: <3 cluster days → no nudge');
  ok(T.shouldNudge({ prob: 0.79, dataDays: 20, clusterDays: 5 }) === false, 'gating: <80% prob → no nudge');
}

// learnedWindows end-to-end on synthetic history
{
  const base = new Date(2026, 8, 29, 12, 0, 0); // Sep 29 2026 local
  const hist = [];
  for (let d = 0; d < 20; d++) hist.push(mkEv(atDaysAgo(base, d, 8, 15 + (d % 3)), 'Pee'));
  for (let d = 0; d < 20; d++) hist.push(mkEv(atDaysAgo(base, d, 18, 5), 'Poop'));
  const isPee = e => ['Pee', 'Pee_Poop', 'Micro_Pee'].includes(e.elimination_type);
  const wins = T.learnedWindows(hist, isPee, 'Pee');
  ok(wins.length === 1 && wins[0].start === 8, 'windows: 20-day 8am pee pattern found');
  ok(wins[0].prob === 1 && wins[0].clusterDays === 20 && wins[0].dataDays === 20, 'windows: prob/cluster/dataDays correct');
  ok(wins[0].confidence === 100 && T.shouldNudge(wins[0]), 'windows: mature window nudges at 100%');
  const young = hist.filter(e => new Date(e.logged_at) >= atDaysAgo(base, 6, 0, 0));
  const yw = T.learnedWindows(young, isPee, 'Pee');
  ok(yw.length === 1 && yw[0].confidence < 100 && !T.shouldNudge(yw[0]), 'windows: 6-day history stays in learning mode');
  const sparse = T.learnedWindows(hist.slice(0, 2), isPee, 'Pee');
  ok(sparse.length === 0, 'windows: <3 days of data → no windows');
}

console.log('— v2 streaks & success —');

// accidentFreeStreak / outdoorSuccessRate / poopQuotaCompliance
{
  const base = new Date(2026, 8, 29, 18, 0, 0);
  const hist = [];
  for (let d = 0; d < 5; d++) { hist.push(mkEv(atDaysAgo(base, d, 8, 0), 'Pee')); hist.push(mkEv(atDaysAgo(base, d, 9, 0), 'Poop')); }
  ok(T.accidentFreeStreak(hist, base) === 5, 'streak: 5 clean days → 5');
  const withAcc = [...hist, mkEv(atDaysAgo(base, 0, 20, 0), 'Accident_Pee')];
  ok(T.accidentFreeStreak(withAcc, base) === 0, 'streak: accident today → 0');
  const older = [...hist, mkEv(atDaysAgo(base, 2, 21, 0), 'Accident_Poop')];
  ok(T.accidentFreeStreak(older, base) === 2, 'streak: accident 2 days ago → 2');
  ok(T.accidentFreeStreak([], base) === 0, 'streak: no history → 0');
  // gap: no events yesterday → counted streak breaks at the gap
  const gap = hist.filter(e => new Date(e.logged_at).getDate() !== atDaysAgo(base, 1, 0, 0).getDate() || new Date(e.logged_at).getMonth() !== 8 || true);
  const gapHist = hist.filter(e => { const dd = new Date(e.logged_at); return !(dd.getDate() === atDaysAgo(base, 1, 0, 0).getDate()); });
  ok(T.accidentFreeStreak(gapHist, base) === 1, 'streak: unlogged yesterday breaks counted streak (conservative)');
  // today unlogged, yesterday clean → anchor at yesterday
  const noToday = hist.filter(e => new Date(e.logged_at).getDate() !== 29);
  ok(T.accidentFreeStreak(noToday, base) === 4, 'streak: unlogged today anchors at yesterday → 4');

  ok(T.outdoorSuccessRate(withAcc, 7, base) === 83, 'success: 5 pees + 1 accident → 83%');
  ok(T.outdoorSuccessRate([], 7, base) === null, 'success: no data → null');
  const allAcc = [mkEv(atDaysAgo(base, 0, 8, 0), 'Accident_Pee')];
  ok(T.outdoorSuccessRate(allAcc, 7, base) === 0, 'success: only accidents → 0%');

  const quota = [];
  for (let d = 0; d < 7; d++) {
    quota.push(mkEv(atDaysAgo(base, d, 8, 0), 'Poop'));
    if (d < 5) quota.push(mkEv(atDaysAgo(base, d, 15, 0), 'Poop'));
  }
  ok(T.poopQuotaCompliance(quota, 7, base) === 71, 'quota: 5/7 days with 2 poops → 71%');
  ok(T.poopQuotaCompliance([], 7, base) === null, 'quota: no data → null');
}

console.log('— v2 walks / back-date / meds —');

// haversineM + routeDistanceM
{
  ok(approx(T.haversineM(0, 0, 0, 1), 111194.93, 1), 'haversine: 1° lon at equator ≈ 111195m');
  ok(T.haversineM(40.3, -74.5, 40.3, -74.5) === 0, 'haversine: same point → 0');
  const pts = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0.001, lon: 0.001 }];
  const d = T.routeDistanceM(pts);
  ok(approx(d, 2 * 111.19493, 0.5), 'route: two 0.001° legs ≈ 222m');
  ok(T.routeDistanceM([{ lat: 1, lon: 1 }]) === 0, 'route: single point → 0');
}

// backdateISO + backdateEvent
{
  const iso = T.backdateISO('2026-09-29T08:30');
  const d = new Date(iso);
  ok(d.getFullYear() === 2026 && d.getMonth() === 8 && d.getDate() === 29 && d.getHours() === 8 && d.getMinutes() === 30,
    'backdateISO: datetime-local round-trips to the same local time');
  const be = T.backdateEvent('Pee', 'found the puddle');
  ok(be.category === 'Elimination' && be.elimination_type === 'Pee', 'backdateEvent: Pee shape');
  ok(be.status_outcome === 'found the puddle', 'backdateEvent: note kept');
  const bn = T.backdateEvent('Note', '');
  ok(bn.category === 'Note' && !bn.status_outcome, 'backdateEvent: empty note → no outcome');
}

// nextDueFrom
{
  const from1 = new Date(2026, 8, 29, 10, 0, 0);
  const n1 = new Date(T.nextDueFrom('daily', '08:00', from1));
  ok(n1.getDate() === 30 && n1.getHours() === 8, 'meds: daily 08:00 from 10:00 → tomorrow 08:00');
  const from2 = new Date(2026, 8, 29, 7, 0, 0);
  const n2 = new Date(T.nextDueFrom('daily', '08:00', from2));
  ok(n2.getDate() === 29 && n2.getHours() === 8, 'meds: daily 08:00 from 07:00 → today 08:00');
  const n3 = new Date(T.nextDueFrom('weekly', '09:00', from1));
  ok(n3.getDate() === 6 && n3.getMonth() === 9, 'meds: weekly → +7 days');
  const n4 = new Date(T.nextDueFrom('twice_daily', '08:00', from1));
  ok(n4.getHours() === 20 && n4.getDate() === 29, 'meds: twice-daily 08:00 from 10:00 → 20:00 today');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
