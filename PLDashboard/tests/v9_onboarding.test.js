#!/usr/bin/env node
// v9 test suite: onboarding (Phase 4).
// Extracts the CURRENT code from ../index.html at runtime, so the tests always
// run against the real implementation. Run: node tests/v9_onboarding.test.js
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
const __fns = ['maybeShowOnboarding','dismissOnboarding'].map(extract).join('\n');
const src = __fns + "\n" + "// Mocks\nconst __store = new Map();\nvar localStorage = {\n  getItem: k => (__store.has(k) ? __store.get(k) : null),\n  setItem: (k, v) => __store.set(k, String(v)),\n  removeItem: k => __store.delete(k),\n};\nlet __dbCount = 0;\nasync function dbCount() { return __dbCount; }\nconst __els = {};\nvar document = {\n  getElementById: id => {\n    if (!__els[id]) __els[id] = { style: {} };\n    return __els[id];\n  }\n};\n\nlet pass = 0, fail = 0;\nfunction eq(a, b, name) {\n  const ok = JSON.stringify(a) === JSON.stringify(b);\n  if (ok) pass++;\n  else { fail++; console.log('FAIL - ' + name + '\\n  expected: ' + JSON.stringify(b) + '\\n  actual:   ' + JSON.stringify(a)); }\n}\nfunction reset() { __store.clear(); for (const k of Object.keys(__els)) delete __els[k]; __dbCount = 0; }\n\nasync function run() {\n  // 1. already onboarded -> never shown\n  reset();\n  __store.set('pl_onboarded_v1', '1');\n  await maybeShowOnboarding();\n  eq(document.getElementById('onboard-modal').style.display, undefined, 'onboard: skipped when flag set');\n\n  // 2. existing data -> flag set silently, no modal\n  reset();\n  __dbCount = 42;\n  await maybeShowOnboarding();\n  eq(__store.get('pl_onboarded_v1'), '1', 'onboard: existing users marked without modal');\n  eq(document.getElementById('onboard-modal').style.display, undefined, 'onboard: no modal for existing data');\n\n  // 3. fresh account -> modal shown\n  reset();\n  await maybeShowOnboarding();\n  eq(document.getElementById('onboard-modal').style.display, 'flex', 'onboard: shown for fresh account');\n  eq(localStorage.getItem('pl_onboarded_v1'), null, 'onboard: flag not set until dismissed');\n\n  // 4. dismiss -> flag set, modal hidden, never shown again\n  dismissOnboarding();\n  eq(__store.get('pl_onboarded_v1'), '1', 'onboard: dismiss sets flag');\n  eq(document.getElementById('onboard-modal').style.display, 'none', 'onboard: dismiss hides modal');\n  await maybeShowOnboarding();\n  eq(document.getElementById('onboard-modal').style.display, 'none', 'onboard: stays dismissed');\n\n  console.log(`\\n${pass} passed, ${fail} failed`);\n  process.exit(fail ? 1 : 0);\n}\nrun();\n";
(0,eval)(src);
