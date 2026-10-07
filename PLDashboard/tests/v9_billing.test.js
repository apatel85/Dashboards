#!/usr/bin/env node
// v9 test suite: billing / monetization wiring (Phase 3).
// Extracts the CURRENT code from ../index.html at runtime, so the tests always
// run against the real implementation. Run: node tests/v9_billing.test.js
'use strict';
const fs = require('fs'), path = require('path');
const __src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
const lines = __src.split('\n');
function extract(name) {
  const re = new RegExp('^(async )?function ' + name + '\\(');
  const start = lines.findIndex(l => re.test(l));
  if (start < 0) throw new Error('not found: ' + name);
  let end = start + 1;
  while (end < lines.length && lines[end] !== '}') end++;
  if (end >= lines.length) throw new Error('no end: ' + name);
  return lines.slice(start, end + 1).join('\n');
}
function extractConstBlock(name) {
  const re = new RegExp('^(const|let) ' + name + '\\b');
  const i = lines.findIndex(l => re.test(l));
  if (i < 0) throw new Error('const not found: ' + name);
  const text = lines.slice(i).join('\n');
  const bi = text.indexOf('{');
  let depth = 0, instr = null, j = bi;
  while (j < text.length) {
    const c = text[j];
    if (instr) { if (c === '\\') j++; else if (c === instr) instr = null; }
    else { if ('"\'`'.includes(c)) instr = c; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; } }
    j++;
  }
  return lines[i].split('{')[0] + text.slice(bi, j + 1) + ';';
}
function extractConst(n) {
  const re = new RegExp('^(const|let) ' + n + '\\b');
  const line = lines.find(l => re.test(l)) || '';
  return /\{/.test(line) ? extractConstBlock(n) : line;
}
const __consts = ['BILLING', 'PRO_REPORT_TYPES'].map(extractConst).join('\n');
const __fns = ['currentTier','isPro','requirePro','showUpgradeNudge','renderPricingView',
  'renderSettingsPlanRow','buyPro','planCard','signOutToRedeem'].map(extract).join('\n');
const src = __consts + "\n" + __fns + "\n" + "// v9 billing/monetization unit tests (Phase 3).\n// Mocks: tier state, minimal DOM, navigation, toasts.\nvar authUser = null;\nvar __signedOut = false;\nconst __store = new Map();\nglobal.sessionStorage = {\n  getItem: k => (__store.has(k) ? __store.get(k) : null),\n  setItem: (k, v) => __store.set(k, String(v)),\n  removeItem: k => __store.delete(k),\n};\nglobal.window = { open: (u) => __opened.push(u) };\nconst __els = {};\nfunction __el(id) {\n  if (!__els[id]) __els[id] = { id, style: {}, textContent: '', innerHTML: '', value: '', disabled: false,\n    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },\n    _handlers: {}, appendChild(c) { (this.children = this.children || []).push(c); },\n    set onclick(f) { this._handlers.click = f; }, get onclick() { return this._handlers.click; } };\n  return __els[id];\n}\nfunction __makeEl(tag) { return __el('__dyn_' + tag + '_' + Math.random()); }\nconst __shownViews = [];\nconst __toasts = [];\nconst __opened = [];\n\nfunction escapeHtml(s) { return String(s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }\nfunction toast(msg, kind, opts) { __toasts.push({ msg, kind }); }\nfunction closeConfirm() { __el('confirm-modal').classList = { remove() {}, add() {} }; __el('confirm-modal')._closed = true; }\nfunction showView(v) { __shownViews.push(v); }\nglobal.document = {\n  getElementById: id => __el(id),\n  createElement: tag => __makeEl(tag),\n};\nfunction signOutFromPin() { authUser = null; __signedOut = true; }\n\nlet pass = 0, fail = 0;\nfunction eq(a, b, name) {\n  const ok = JSON.stringify(a) === JSON.stringify(b);\n  if (ok) pass++;\n  else { fail++; console.log('FAIL - ' + name + '\\n  expected: ' + JSON.stringify(b) + '\\n  actual:   ' + JSON.stringify(a)); }\n}\nfunction reset() {\n  for (const k of Object.keys(__els)) delete __els[k];\n  __shownViews.length = 0; __toasts.length = 0; __opened.length = 0;\n  authUser = null; __signedOut = false; __store.clear();\n}\n\nasync function run() {\n  // currentTier / isPro\n  reset();\n  eq(currentTier(), 'free', 'tier: defaults to free with no user');\n  eq(isPro(), false, 'tier: not pro by default');\n  authUser = { email: 'a@b.c', tier: 'free' };\n  eq(isPro(), false, 'tier: free user is not pro');\n  authUser = { email: 'a@b.c', tier: 'pro' };\n  eq(currentTier(), 'pro', 'tier: pro recognized');\n  eq(isPro(), true, 'tier: isPro true for pro');\n\n  // requirePro gate\n  reset();\n  authUser = { email: 'a@b.c', tier: 'pro' };\n  eq(requirePro('X'), true, 'gate: pro passes without nudge');\n  eq(__shownViews.length, 0, 'gate: no nudge shown for pro');\n  authUser = { email: 'a@b.c', tier: 'free' };\n  eq(requirePro('PDF export'), false, 'gate: free blocked');\n  eq(__el('confirm-title').textContent, 'Upgrade to Pro', 'gate: nudge title');\n  eq(__el('confirm-ok-btn').textContent, 'See plans', 'gate: nudge CTA');\n  eq(/PDF export/.test(__el('confirm-msg').textContent), true, 'gate: nudge names the feature');\n  eq(/\\$79/.test(__el('confirm-msg').textContent), true, 'gate: nudge shows the price');\n  __el('confirm-ok-btn').onclick();\n  eq(__shownViews[0], 'pricing-view', 'gate: CTA navigates to pricing');\n\n  // BILLING config sanity\n  eq(BILLING.pro.price, 79, 'config: pro launch price $79');\n  eq(BILLING.pro.billing, 'one-time', 'config: pro is one-time');\n  eq(BILLING.free.price, 0, 'config: free is $0');\n  eq(BILLING.pro.features.some(f => /PDF/i.test(f)) && BILLING.pro.features.some(f => /priority support/i.test(f)), true, 'config: pro lists PDF + priority support');\n  eq(PRO_REPORT_TYPES.includes('pl'), false, 'config: core P&L stays free');\n  eq(PRO_REPORT_TYPES.length, 6, 'config: six advanced report types are pro');\n\n  // renderPricingView\n  reset();\n  authUser = { email: 'a@b.c', tier: 'free' };\n  renderPricingView();\n  eq(/Free plan/.test(__el('pricing-current-plan').textContent), true, 'pricing: free user sees free status');\n  const cardsHtml = __el('pricing-cards').innerHTML;\n  eq(cardsHtml.includes('$79'), true, 'pricing: pro card shows $79');\n  eq(cardsHtml.includes('Buy Pro'), true, 'pricing: free user gets Buy CTA');\n  reset();\n  authUser = { email: 'a@b.c', tier: 'pro' };\n  renderPricingView();\n  eq(/Pro/.test(__el('pricing-current-plan').textContent), true, 'pricing: pro user sees pro status');\n  eq(__el('pricing-cards').innerHTML.includes('Buy Pro'), false, 'pricing: pro user gets no Buy CTA');\n\n  // buyPro: no checkout URL -> note, no dead link\n  reset();\n  authUser = { email: 'a@b.c', tier: 'free' };\n  buyPro();\n  eq(__opened.length, 0, 'buy: no checkout URL -> opens nothing');\n  eq(__el('pricing-checkout-note').style.display, 'block', 'buy: shows \"opens soon\" note');\n  eq(__toasts.length, 1, 'buy: toast explains the wait');\n\n  // signOutToRedeem\n  reset();\n  authUser = { email: 'a@b.c', tier: 'free' };\n  signOutToRedeem();\n  eq(__signedOut, true, 'redeem: signs out');\n\n  console.log(`\\n${pass} passed, ${fail} failed`);\n  process.exit(fail ? 1 : 0);\n}\nrun();\n";
(0,eval)(src);
