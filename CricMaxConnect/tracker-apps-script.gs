/**
 * Ankit x Arpit Task Tracker — Apps Script bridge.
 *
 * SETUP (one time, by a sheet editor):
 * 1. Open the tracker sheet → Extensions → Apps Script. Paste this whole file.
 * 2. Edit RECIPIENTS below (daily digest email addresses).
 * 3. Optional: set a shared secret — Script Properties → BRIDGE_TOKEN.
 *    If set, the dashboard must send the same token (it is stored only in the
 *    browser's localStorage after you paste the URL; the token itself is NOT
 *    in the dashboard code). If unset, the bridge accepts requests without one.
 * 4. Deploy → New deployment → Web app → Execute as: Me, Who has access:
 *    Anyone. Paste the /exec URL into the dashboard's About & Setup tab.
 * 5. Daily email digest: Triggers → Add trigger → sendDailyDigest →
 *    Time-driven → Day timer → 8am–9am.
 *
 * ENDPOINTS (called by the dashboard, no Google sign-in needed):
 * - GET  ?action=ping&callback=fn        → JSONP {ok:true} (bridge health check)
 * - POST {action:'updateStatus', taskId, status, token?}
 * - POST {action:'updateDue', taskId, due, token?}
 * - POST {action:'addTask', workstream, title, owner, priority, due, details, token?}
 * Writes go to the workstream tab AND to Master Tracker when a matching clean
 * row exists there (new tasks are appended to both). Edits are visible in the
 * sheet's version history. Due dates are free text (e.g. "31 Oct 2026");
 * only real dates power the dashboard's overdue / due-soon reminders.
 */

var SHEET_ID = '1JL8nit7_f-Xp_F9Pa0R8te56h8HZvG0IMdQoANd3h2A';
var RECIPIENTS = ['arpit13@gmail.com', 'REPLACE_WITH_ANKIT_EMAIL'];
var TASK_TABS = ['Social Media', 'Quixera', 'CricMax Connect'];
var PREFIX_TO_TAB = { S: 'Social Media', Q: 'Quixera', C: 'CricMax Connect' };
var STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Done'];

function sheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function checkToken(data) {
  var expected = PropertiesService.getScriptProperties().getProperty('BRIDGE_TOKEN');
  if (!expected) return true;
  return data && data.token === expected;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var cb = (e && e.parameter && e.parameter.callback) || null;
  var payload = JSON.stringify({ ok: true, service: 'krca-tracker-bridge' });
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOut({ ok: true, service: 'krca-tracker-bridge' });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!checkToken(data)) return jsonOut({ ok: false, error: 'bad token' });
    if (data.action === 'updateStatus') return jsonOut(updateStatus(data));
    if (data.action === 'updateDue') return jsonOut(updateDue(data));
    if (data.action === 'addTask') return jsonOut(addTask(data));
    return jsonOut({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function findRowById(tab, taskId) {
  var values = tab.getDataRange().getValues();
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0]).trim() === taskId) return r + 1; // 1-based row
  }
  return -1;
}

function updateStatus(data) {
  if (STATUSES.indexOf(data.status) === -1) return { ok: false, error: 'bad status' };
  var ss = sheet();
  var updated = [];
  var tabName = PREFIX_TO_TAB[String(data.taskId).split('-')[0].toUpperCase()];
  var targets = [];
  if (tabName) targets.push(tabName);
  targets.push('Master Tracker');
  targets.forEach(function (name) {
    var tab = ss.getSheetByName(name);
    if (!tab) return;
    var row = findRowById(tab, data.taskId);
    if (row > 0) {
      tab.getRange(row, 6).setValue(data.status); // column F = Status
      updated.push(name);
    }
  });
  return { ok: updated.length > 0, updated: updated, taskId: data.taskId, status: data.status };
}

function updateDue(data) {
  var ss = sheet();
  var updated = [];
  var tabName = PREFIX_TO_TAB[String(data.taskId).split('-')[0].toUpperCase()];
  var targets = [];
  if (tabName) targets.push(tabName);
  targets.push('Master Tracker');
  targets.forEach(function (name) {
    var tab = ss.getSheetByName(name);
    if (!tab) return;
    var row = findRowById(tab, data.taskId);
    if (row > 0) {
      tab.getRange(row, 7).setValue(data.due || ''); // column G = Due / Timing
      updated.push(name);
    }
  });
  return { ok: updated.length > 0, updated: updated, taskId: data.taskId, due: data.due || '' };
}

function nextId(tab, prefix) {
  var values = tab.getDataRange().getValues();
  var max = 0;
  values.forEach(function (row) {
    var m = String(row[0]).trim().match(new RegExp('^' + prefix + '-(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + '-' + ('0' + (max + 1)).slice(-2);
}

function addTask(data) {
  var ss = sheet();
  var tabName = TASK_TABS.indexOf(data.workstream) !== -1 ? data.workstream : 'CricMax Connect';
  var tab = ss.getSheetByName(tabName);
  var prefix = tabName === 'Social Media' ? 'S' : tabName === 'Quixera' ? 'Q' : 'C';
  var id = nextId(tab, prefix);
  var row = [id, data.title || '', data.details || '', data.owner || '', data.priority || '', 'Not Started', data.due || '', ''];
  tab.appendRow(row);
  var master = ss.getSheetByName('Master Tracker');
  if (master) master.appendRow(row);
  return { ok: true, taskId: id, updated: [tabName, 'Master Tracker'] };
}

/* ---------------- Daily reminder digest (time-driven trigger) ---------------- */

function parseDeadline(due) {
  if (!due) return null;
  var months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  var re = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/g;
  var m, last = null;
  while ((m = re.exec(due)) !== null) last = m;
  if (!last) return null;
  return new Date(parseInt(last[3], 10), months[last[2]], parseInt(last[1], 10));
}

function readTasks() {
  var ss = sheet();
  var tasks = [];
  TASK_TABS.forEach(function (name) {
    var tab = ss.getSheetByName(name);
    if (!tab) return;
    tab.getDataRange().getValues().forEach(function (row) {
      if (/^[A-Za-z]+-\d+$/.test(String(row[0]).trim())) {
        tasks.push({ id: String(row[0]).trim(), ws: name, task: row[1], owner: row[3], priority: row[4], status: row[5], due: row[6] });
      }
    });
  });
  return tasks;
}

function sendDailyDigest() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var soonEnd = new Date(today);
  soonEnd.setDate(soonEnd.getDate() + 7);
  var overdue = [], dueSoon = [];
  readTasks().forEach(function (t) {
    if (t.status === 'Done') return;
    var d = parseDeadline(t.due);
    if (d && d < today) overdue.push({ t: t, d: d });
    else if (d && d <= soonEnd) dueSoon.push({ t: t, d: d });
  });
  if (!overdue.length && !dueSoon.length) return; // quiet days stay quiet
  var fmt = function (d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'd MMM yyyy'); };
  var body = 'Ankit x Arpit Task Tracker — daily reminder\n\n';
  if (overdue.length) {
    body += 'OVERDUE (' + overdue.length + '):\n';
    overdue.forEach(function (x) { body += '- ' + x.t.id + ' — ' + x.t.task + ' (was due ' + fmt(x.d) + ', ' + x.t.owner + ')\n'; });
    body += '\n';
  }
  if (dueSoon.length) {
    body += 'DUE WITHIN 7 DAYS (' + dueSoon.length + '):\n';
    dueSoon.forEach(function (x) { body += '- ' + x.t.id + ' — ' + x.t.task + ' (due ' + fmt(x.d) + ', ' + x.t.owner + ')\n'; });
    body += '\n';
  }
  body += 'Open the tracker: https://apatel85.github.io/Dashboards/CricMaxConnect/task-tracker.html\n';
  MailApp.sendEmail({
    to: RECIPIENTS.join(','),
    subject: 'Task reminders: ' + overdue.length + ' overdue, ' + dueSoon.length + ' due soon',
    body: body
  });
}
