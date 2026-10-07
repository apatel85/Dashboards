#!/usr/bin/env node
// v9 test suite: Supabase Auth magic-link license redesign (Phase 1d).
// Extracts the CURRENT auth functions from ../index.html at runtime, so the
// tests always run against the real code. Run: node tests/v9_auth.test.js
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
// const block just above the auth fns (SUPA_URL/SUPA_KEY/keys/grace)
let cstart = lines.findIndex(l => l.includes("const SUPA_URL"));
let cend = lines.findIndex((l, i) => i > cstart && l.includes('OFFLINE_GRACE_MS'));
const consts = lines.slice(cstart, cend + 1).join('\n');
// Transitive closure: seed with the public auth API, then pull in every
// top-level function those bodies reference (retry helpers, UI stubs, …).
const seed = ['handleAuthRedirect','supaAuthFetch','validateAuthSession','refreshAuthSession',
  'getValidAuthSession','checkLicenseTier','v9BootAuth','authSendMagicLink','authRedeemKey',
  'saveAuthTokens','loadAuthTokens','clearAuthTokens','saveCachedSession','loadCachedSession'];
const pulled = new Map();
const queue = [...seed];
while (queue.length) {
  const name = queue.shift();
  if (pulled.has(name)) continue;
  let body;
  try { body = extract(name); } catch (e) { continue; } // UI-only or mocked
  pulled.set(name, body);
  const refs = body.match(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g) || [];
  for (const r of refs) {
    const callee = r.replace(/\s*\($/, '');
    if (!pulled.has(callee) && !queue.includes(callee)) queue.push(callee);
  }
}
const src = consts + '\n' + [...pulled.values()].join('\n');
// ── Mocks ──
const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};
global.location = { hash: '', origin: 'http://localhost:8077', pathname: '/index.html', search: '' };
global.history = { replaced: null, replaceState(a, b, url) { this.replaced = url; } };
global._authLoadingTimer = null;
global._lkLoadingTimer = null;

// DOM stub
const __els = {};
function __el(id) {
  if (!__els[id]) __els[id] = { id, style: {}, textContent: '', value: '', };
  return __els[id];
}
global.document = { getElementById: id => __el(id) };

// Programmable fetch mock
let __routes = [];
function mockFetch(routes) { __routes = routes; }
function resp(ok, status, body) {
  return { ok, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}
global.fetch = async (url, opts = {}) => {
  for (const r of __routes) {
    if (r.match(url, opts)) return r.respond(url, opts);
  }
  throw new Error('UNMOCKED FETCH: ' + url);
};
const calls = [];
function trackFetch(routes) {
  mockFetch(routes.map(r => ({
    match: r.match,
    respond: (url, opts) => { calls.push({ url, opts }); return r.respond(url, opts); },
  })));
}

// ── Assertions ──
let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; /* console.log('ok -', name); */ }
  else { fail++; console.log(`FAIL - ${name}\n  expected: ${e}\n  actual:   ${a}`); }
}
function reset() { store.clear(); calls.length = 0; for (const k of Object.keys(__els)) delete __els[k]; global.location.hash = ''; global.history.replaced = null; }

// auth endpoints
const AUTH_USER = 'https://iknfvddnevudpjtyxkbh.supabase.co/auth/v1/user';
const AUTH_TOKEN = 'https://iknfvddnevudpjtyxkbh.supabase.co/auth/v1/token?grant_type=refresh_token';
const AUTH_OTP = 'https://iknfvddnevudpjtyxkbh.supabase.co/auth/v1/otp';
const RPC_VERIFY = 'https://iknfvddnevudpjtyxkbh.supabase.co/rest/v1/rpc/verify_license';
const RPC_REDEEM = 'https://iknfvddnevudpjtyxkbh.supabase.co/rest/v1/rpc/redeem_license_key';
const ACCESS_LOG = 'https://iknfvddnevudpjtyxkbh.supabase.co/rest/v1/pl_access_log';
const netErr = () => { throw new TypeError('Failed to fetch'); };


(0,eval)(src);
async function run() {

// 1. handleAuthRedirect
reset();
global.location.hash = '#access_token=AAA&refresh_token=RRR&expires_in=3600&token_type=bearer';
eq(handleAuthRedirect(), true, 'redirect: returns true with tokens');
eq(JSON.parse(store.get('pl_auth_tokens_v1')).access_token, 'AAA', 'redirect: tokens stored');
eq(global.history.replaced, '/index.html', 'redirect: URL scrubbed');
reset();
global.location.hash = '';
eq(handleAuthRedirect(), false, 'redirect: false with no hash');

// 2. getValidAuthSession — happy path
reset();
saveAuthTokens({ access_token: 'GOOD', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
trackFetch([
  { match: u => u === AUTH_USER, respond: () => resp(true, 200, { id: 'u1', email: 'a@b.c' }) },
]);
let s = await getValidAuthSession();
eq(s && s.user.email, 'a@b.c', 'session: valid token -> user');

// 3. expired access token, refresh succeeds
reset();
saveAuthTokens({ access_token: 'OLD', refresh_token: 'R', expires_at: 1 });
trackFetch([
  { match: (u, o) => u === AUTH_USER && o.headers.Authorization === 'Bearer OLD', respond: () => resp(false, 401, { msg: 'expired' }) },
  { match: u => u === AUTH_TOKEN, respond: () => resp(true, 200, { access_token: 'NEW', refresh_token: 'R2', expires_in: 3600 }) },
  { match: (u, o) => u === AUTH_USER && o.headers.Authorization === 'Bearer NEW', respond: () => resp(true, 200, { id: 'u1', email: 'a@b.c' }) },
]);
s = await getValidAuthSession();
eq(s && s.user.email, 'a@b.c', 'session: refresh recovers expired token');
eq(JSON.parse(store.get('pl_auth_tokens_v1')).access_token, 'NEW', 'session: new tokens persisted');

// 4. both tokens dead -> null + cleared (THE security property)
reset();
saveAuthTokens({ access_token: 'OLD', refresh_token: 'R', expires_at: 1 });
trackFetch([
  { match: u => u === AUTH_USER, respond: () => resp(false, 401, {}) },
  { match: u => u === AUTH_TOKEN, respond: () => resp(false, 401, {}) },
]);
s = await getValidAuthSession();
eq(s, null, 'session: dead tokens -> null');
eq(localStorage.getItem('pl_auth_tokens_v1'), null, 'session: dead tokens cleared');

// 5. network failure -> throws (caller goes to offline grace)
reset();
saveAuthTokens({ access_token: 'X', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
mockFetch([{ match: () => true, respond: netErr }]);
let threw = false;
try { await getValidAuthSession(); } catch (e) { threw = /Failed to fetch/.test(e.message); }
eq(threw, true, 'session: network failure throws');

// 6. v9BootAuth — forged cache alone must NOT unlock (no tokens, online)
reset();
store.set('pl_auth_session_v1', JSON.stringify({ email: 'mallory@evil.c', tier: 'pro', cachedAt: Date.now() }));
trackFetch([{ match: () => true, respond: () => { throw new Error('should not call network'); } }]);
// getValidAuthSession returns null without tokens and without network use
const r6 = await v9BootAuth();
eq(r6.ok, false, 'boot: forged cache + no tokens -> denied');
eq(r6.reason, 'no-session', 'boot: reason is no-session');

// 7. v9BootAuth — valid session + pro license
reset();
saveAuthTokens({ access_token: 'GOOD', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
trackFetch([
  { match: u => u === AUTH_USER, respond: () => resp(true, 200, { id: 'u1', email: 'Pro@B.c' }) },
  { match: u => u === RPC_VERIFY, respond: () => resp(true, 200, [{ email: 'pro@b.c', tier: 'pro', plan: 'lifetime', status: 'active' }]) },
  { match: u => u === ACCESS_LOG, respond: () => resp(true, 201, '') },
]);
const r7 = await v9BootAuth();
eq(r7.ok, true, 'boot: pro license -> ok');
eq(r7.user.tier, 'pro', 'boot: tier resolved');
eq(r7.user.email, 'pro@b.c', 'boot: email lowercased');
eq(r7.offline, false, 'boot: online');
eq(JSON.parse(store.get('pl_auth_session_v1')).tier, 'pro', 'boot: grace cache saved');

// 8. valid session, no license row -> free tier
reset();
saveAuthTokens({ access_token: 'GOOD', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
trackFetch([
  { match: u => u === AUTH_USER, respond: () => resp(true, 200, { id: 'u1', email: 'new@b.c' }) },
  { match: u => u === RPC_VERIFY, respond: () => resp(true, 200, []) },
  { match: u => u === ACCESS_LOG, respond: () => resp(true, 201, '') },
]);
const r8 = await v9BootAuth();
eq(r8.ok && r8.user.tier, 'free', 'boot: no license row -> free tier');

// 9. suspended / expired
for (const [row, reason] of [
  [{ email: 's@b.c', tier: 'pro', status: 'suspended' }, 'suspended'],
  [{ email: 'e@b.c', tier: 'pro', status: 'active', expires_at: '2020-01-01' }, 'expired'],
]) {
  reset();
  saveAuthTokens({ access_token: 'GOOD', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
  trackFetch([
    { match: u => u === AUTH_USER, respond: () => resp(true, 200, { id: 'u1', email: row.email }) },
    { match: u => u === RPC_VERIFY, respond: () => resp(true, 200, [row]) },
  ]);
  const r = await v9BootAuth();
  eq(r.ok, false, `boot: ${reason} -> denied`);
  eq(r.reason, reason, `boot: reason ${reason}`);
}

// 10. offline + fresh cache -> grace unlock
reset();
saveAuthTokens({ access_token: 'X', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
store.set('pl_auth_session_v1', JSON.stringify({ email: 'a@b.c', name: 'A', tier: 'pro', plan: 'lifetime', cachedAt: Date.now() }));
mockFetch([{ match: () => true, respond: netErr }]);
const r10 = await v9BootAuth();
eq(r10.ok && r10.offline, true, 'boot: offline + fresh cache -> grace');
eq(r10.user.tier, 'pro', 'boot: grace preserves tier');

// 11. offline + no cache -> offline-no-cache
reset();
saveAuthTokens({ access_token: 'X', refresh_token: 'R', expires_at: Date.now() + 3600e3 });
mockFetch([{ match: () => true, respond: netErr }]);
const r11 = await v9BootAuth();
eq(r11.reason, 'offline-no-cache', 'boot: offline, no cache -> gate with message');

// 12. authSendMagicLink — invalid email
reset();
__el('auth-email').value = 'not-an-email';
await authSendMagicLink();
eq(__el('auth-error').textContent, 'Enter a valid email address.', 'magiclink: invalid email rejected');

// 13. authSendMagicLink — valid email sends OTP
reset();
__el('auth-email').value = 'User@B.c ';
trackFetch([{ match: u => u === AUTH_OTP, respond: () => resp(true, 200, {}) }]);
await authSendMagicLink();
const otpCall = calls.find(c => c.url === AUTH_OTP);
eq(!!otpCall, true, 'magiclink: POST /otp called');
eq(JSON.parse(otpCall.opts.body).email, 'user@b.c', 'magiclink: email normalized');
eq(JSON.parse(otpCall.opts.body).options.email_redirect_to, 'http://localhost:8077/index.html', 'magiclink: redirect_to is app URL');
eq(__el('auth-checkemail').style.display, 'block', 'magiclink: check-inbox shown');
eq(__el('auth-checkemail-addr').textContent, 'user@b.c', 'magiclink: address echoed safely');

// 14. authRedeemKey — success -> magic link sent
reset();
__el('auth-lk-email').value = 'buyer@b.c';
__el('auth-lk-key').value = 'XXXX-YYYY';
trackFetch([
  { match: u => u === RPC_REDEEM, respond: () => resp(true, 200, { success: true, tier: 'pro', email: 'buyer@b.c' }) },
  { match: u => u === ACCESS_LOG, respond: () => resp(true, 201, '') },
  { match: u => u === AUTH_OTP, respond: () => resp(true, 200, {}) },
]);
await authRedeemKey();
eq(calls.some(c => c.url === AUTH_OTP), true, 'redeem: magic link sent after redeem');
eq(__el('auth-lk-error').textContent.includes('License activated'), true, 'redeem: success message shown');
eq(localStorage.getItem('pl_auth_session_v1'), null, 'redeem: NO local grant written (server flow only)');

// 15. authRedeemKey — bad key
reset();
__el('auth-lk-email').value = 'buyer@b.c';
__el('auth-lk-key').value = 'BADKEY12';
trackFetch([
  { match: u => u === RPC_REDEEM, respond: () => resp(true, 200, { success: false, error: 'invalid_key' }) },
  { match: u => u === ACCESS_LOG, respond: () => resp(true, 201, '') },
]);
await authRedeemKey();
eq(__el('auth-lk-error').textContent.length > 0, true, 'redeem: bad key shows error');
eq(calls.some(c => c.url === AUTH_OTP), false, 'redeem: no magic link on bad key');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
