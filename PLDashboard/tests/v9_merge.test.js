#!/usr/bin/env node
// v9 test suite: pull-merge: last-write-wins, soft-delete propagation, conflicts (Phase 2)
// Extracts the CURRENT code from ../index.html at runtime, so the tests always
// run against the real implementation. Run: node tests/v9_merge.test.js
'use strict';
const fs = require('fs'), path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8').split('\n');
function extract(name) {
  const re = new RegExp('^(async )?function ' + name + '\\(');
  const start = lines.findIndex(l => re.test(l));
  if (start < 0) throw new Error('not found: ' + name);
  let end = start + 1;
  while (end < lines.length && lines[end] !== '}') end++;
  if (end >= lines.length) throw new Error('no end: ' + name);
  return lines.slice(start, end + 1).join('\n');
}
function extractConst(name) {
  const re = new RegExp('^(const|let) ' + name + '\\b');
  const i = lines.findIndex(l => re.test(l));
  if (i < 0) throw new Error('const not found: ' + name);
  return lines[i];
}
const __consts = [].map(extractConst).join('\n');
const __fns = ['txnHash', 'stampNewTxn', 'touchTxnMeta', 'mergeIncomingSheetRows'].map(extract).join('\n');
const src = __consts + "\n" + __fns + "\n" + "let __local = [];\nconst __deleted = [];\nlet __put = [];\nconst _flaggedSyncConflicts = new Set();\nconst pendingSyncConflicts = [];\nasync function dbGetAll(){ return __local; }\nasync function dbDeleteLocal(id){ __deleted.push(id); __local = __local.filter(t => String(t.id) !== String(id)); }\nasync function dbBulkPutLocal(txns){ __put = __put.concat(txns); for (const t of txns) { const i = __local.findIndex(x => String(x.id)===String(t.id)); if (i>=0) __local[i]=t; else __local.push(t); } }\nlet pass = 0, fail = 0;\nfunction eq(a, b, name) {\n  const ok = JSON.stringify(a) === JSON.stringify(b);\n  if (ok) pass++;\n  else { fail++; console.log('FAIL - ' + name + '\\n  expected: ' + JSON.stringify(b) + '\\n  actual:   ' + JSON.stringify(a)); }\n}\nfunction reset(local) { __local = local; __deleted.length = 0; __put = []; _flaggedSyncConflicts.clear(); pendingSyncConflicts.length = 0; }\n\nasync function run() {\n  // 1. Soft-deleted sheet rows propagate to local cache\n  reset([{ id:'a1', date:'2026-10-01', type:'revenue', category:'S', description:'x', amount:100, month:'October', year:2026 }]);\n  await mergeIncomingSheetRows([], ['a1']);\n  eq(__deleted, ['a1'], 'merge: sheet soft-delete removes local row');\n  eq(__local.length, 0, 'merge: local cache no longer has it');\n\n  // 2. Last-write-wins: newer LOCAL edit survives the pull\n  reset([{ id:'b1', date:'2026-10-01', type:'revenue', category:'S', description:'local edit', amount:100,\n           month:'October', year:2026, modifiedAt:'2026-10-06T05:00:00.000Z' }]);\n  const r2 = await mergeIncomingSheetRows(\n    [{ id:'b1', date:'2026-10-01', type:'revenue', category:'S', description:'old sheet', amount:100,\n       month:'October', year:2026, modifiedAt:'2026-10-06T01:00:00.000Z' }], []);\n  eq(r2.applied, 0, 'merge: newer local edit not overwritten');\n  eq(__local[0].description, 'local edit', 'merge: local newer version kept');\n\n  // 3. Last-write-wins: newer SHEET version updates local\n  reset([{ id:'c1', date:'2026-10-01', type:'revenue', category:'S', description:'old local', amount:100,\n           month:'October', year:2026, modifiedAt:'2026-10-06T01:00:00.000Z' }]);\n  const r3 = await mergeIncomingSheetRows(\n    [{ id:'c1', date:'2026-10-01', type:'revenue', category:'S', description:'new sheet', amount:100,\n       month:'October', year:2026, source:'manual', modifiedAt:'2026-10-06T05:00:00.000Z' }], []);\n  eq(r3.applied, 1, 'merge: newer sheet version applied');\n  eq(__local[0].description, 'new sheet', 'merge: sheet newer version wins');\n  eq(__local[0].source, 'manual', 'merge: source carried from sheet');\n\n  // 4. New sheet row inserts locally\n  reset([]);\n  const r4 = await mergeIncomingSheetRows(\n    [{ id:'d1', date:'2026-10-01', type:'expense', category:'R', description:'new', amount:50,\n       month:'October', year:2026, modifiedAt:'2026-10-06T05:00:00.000Z' }], []);\n  eq(r4.applied, 1, 'merge: brand-new sheet row inserted');\n\n  // 5. Duplicate content with different id -> conflict queue, not silent dup\n  reset([{ id:'e1', date:'2026-10-01', type:'revenue', category:'S', description:'same', amount:100,\n           month:'October', year:2026 }]);\n  const r5 = await mergeIncomingSheetRows(\n    [{ id:'e2', date:'2026-10-01', type:'revenue', category:'S', description:'same', amount:100,\n       month:'October', year:2026 }], []);\n  eq(r5.applied, 0, 'merge: same-content different-id not auto-inserted');\n  eq(r5.conflicts, 1, 'merge: flagged as reviewable conflict');\n\n  console.log(`\\n${pass} passed, ${fail} failed`);\n  process.exit(fail ? 1 : 0);\n}\nrun();\n";
(0,eval)(src);
