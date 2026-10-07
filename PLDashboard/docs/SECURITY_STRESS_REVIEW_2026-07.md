# P&L Dashboard — Security, Gaps & Stress Review (July 2026)

**Reviewed version:** v8.4.0 (`index.html` / `pl-dashboard-v8.html`, identical)
**Method:** source audit + empirical testing in headless Chromium (Playwright),
driving the app's real functions and importing the repo's mock datasets.
**Lens:** ponytail — smallest correct fix at the root cause; security and data
integrity are never skimped.

This review is deliberately *not* a re-run of the May 2026 `DetailedFindings.md`.
Most of that report's Tier-1 items are already fixed in v8.4: `escapeHtml()` wraps
every table/report render, the `toast()` builds nodes with `textContent`, a
Content-Security-Policy meta tag is present, `csvSanitize()` guards formula
injection on export, and the big tables paginate. This pass looks for what is
**still** broken and what the newer auth/licensing surface introduced.

---

## 1. Fixed in this change (code-level, verified)

Each fix ships with a regression test in `tests/regression.spec.js`.

### 1.1 Accounting-negative amounts lost their decimal — 100× overstatement (HIGH, data integrity)
`applyMapping()` parsed US accounting negatives by stripping *all* `.` and `,`:

```
(99.00)     → -9900      (expected -99.00)
(1,234.56)  → -123456    (expected -1234.56)
```

The stored magnitude was 100× too large, silently corrupting every imported
statement that uses parentheses for negatives (the standard bank/QuickBooks
export style). **Root cause:** the accounting branch stripped the decimal point
along with the thousands separator. **Fix:** strip the parentheses first, then
run the *same* decimal-preserving normalization used for normal amounts (and
apply EU detection to the inner number too, so `(1.234,56)` also works).
Verified via the real `applyMapping()` import path.

### 1.2 CSV export was not RFC 4180 quoted — export corruption (MEDIUM, data integrity)
Export wrapped free-text cells in quotes but never doubled an embedded `"`:

```
He said "hi", ok   →   "He said "hi", ok"   (breaks: parses back as 2 fields)
```

Any description/category containing a `"` shifted every downstream column in the
exported file — and this is the file users hand to their accountant or re-import.
**Fix:** one shared `csvCell()` helper that is both formula-injection safe
(reuses `csvSanitize`) *and* doubles inner quotes; used by both export paths
(`exportCSV`, `syncToFile`). Round-trip verified.

### 1.3 Import of large files was ~5× slower than necessary (HIGH, performance)
The IndexedDB store carried five secondary indexes (`date, type, month, year,
category`). A repo-wide grep confirms **nothing ever calls `store.index()`** —
every read is `dbGetAll()` + a JS filter. The indexes were pure write-time cost,
and because three of them are very low-cardinality (2 types, 12 months, a handful
of years) their maintenance during bulk insert degraded **superlinearly**.

Measured, 100k-row import (headless Chromium, this sandbox's disk):

| | bulk insert | render revenue tab | JS heap |
|---|--:|--:|--:|
| before (5 indexes) | **99.4 s** | 1.6 s | 150 MB |
| after (0 indexes)  | **~22 s** | 1.0 s | ~75 MB |

**Fix:** `DB_VERSION` 1 → 2; the store is created without indexes and the upgrade
path deletes any left over from v1. Migration verified: **existing users keep all
rows, indexes are dropped.** (Absolute times are inflated by the sandbox disk; the
~5× *relative* win is the real, portable result. Rendering was never the
bottleneck — pagination already caps painted rows at 25–50.)

### 1.4 Unescaped `e.message` in the restore-failed banner (LOW, XSS hardening)
`auth-restore-msg` interpolated a caught error's `.message` via `innerHTML`. Low
reachability, but the one remaining unescaped `innerHTML` sink among the render
code. Wrapped in `escapeHtml()` to match every other sink in the file.

---

## 2. Gaps that need the project owner / server — not fixable in the static file

These are the real security risks. They cannot be closed by editing the HTML;
they require Supabase configuration. **Verify each in the Supabase dashboard.**

### 2.1 Confirm Row-Level Security actually hides `license_key` (HIGH — verify now)
The client reads licenses directly with the public anon key:

```
GET /rest/v1/pl_licensed_users?email=eq...&license_key=eq...&select=email,name,plan,status,expires_at,license_key
```

The anon key is public *by design* — safe **only if RLS is correctly configured**.
If anon `SELECT` is allowed on `pl_licensed_users`, anyone can page through the
table and harvest **every customer's email and license key** → license theft and
account impersonation. I could not test this from the review environment (outbound
network is restricted). **Check it yourself:**

```bash
curl "https://iknfvddnevudpjtyxkbh.supabase.co/rest/v1/pl_licensed_users?select=email,license_key&limit=5" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

- Returns rows → **critical misconfiguration, fix immediately.**
- Returns `[]` / permission error → RLS is doing its job.

**Recommended hardening regardless:** move verification into a `SECURITY DEFINER`
RPC (like the PIN RPCs already are) that takes `email` + `license_key` and returns
only `{ok, plan, status}` — never selecting `license_key` back to the client — and
set the table's anon policy to deny-all. That way a leaked/guessed anon key can
never enumerate customers.

### 2.2 PIN verification needs server-side rate limiting (MEDIUM)
`verify_user_pin` checks a 4-digit PIN (10,000 combinations) keyed on an email.
If the RPC has no attempt throttling / lockout, it is brute-forceable. Add a
per-email attempt counter with backoff/lockout inside the RPC.

### 2.3 `pl_access_log` accepts anonymous writes (LOW)
Any holder of the anon key can `POST` arbitrary rows (spoofed emails, log
flooding). Restrict inserts (RPC-only, or a rate-limited policy) if the log is
used for anything trust-bearing.

### 2.4 The auth/PIN gate is cosmetic, by construction (INFO — set expectations)
This is a single static HTML file: the whole app ships to the browser before any
check runs, so the license/PIN screen can be bypassed from the devtools console.
That is acceptable **as long as it is understood as a convenience lock, not access
control** — the actual protection is that all financial data is local (IndexedDB)
and the server enforces licensing on the data it holds. Don't market the PIN as
securing data against someone who already has the device.

### 2.5 CSP relies on `'unsafe-inline'` for scripts (INFO)
Forced by the single-inline-script architecture, so it can't be removed without a
build step. It weakens the CSP's XSS mitigation, which is why the `escapeHtml()`
discipline at every sink (section 1.4) is the real defense. Keep that invariant.

---

## 3. Known functional gap left as-is (documented, low priority)

**`parseCSV` cannot handle newlines inside quoted fields.** It splits on `\r?\n`
before parsing quotes, so a quoted cell containing a line break is torn into two
rows. Bank CSVs almost never embed newlines, and the `.xlsx` import path (SheetJS)
handles them correctly, so this is a real but narrow limitation. Fixing it means a
character-level state machine over the whole text — deferred as not worth the diff
until a user actually hits it. Flagged here so it isn't mistaken for a regression.

---

## 4. What was tested

- **User flows (headless Chromium):** app boots clean over `file://` with zero
  page errors (the only console errors are the two Google SDN scripts, blocked
  offline — expected). Import → map → dashboard/revenue/expense/reports render.
- **CSV correctness:** embedded commas ✓, escaped quotes ✓, multiline ✗ (§3).
- **Amount parsing:** accounting `(…)`, `$1,234.56`, EU `1.234,56`, tiny `0.001`,
  signed negatives — all correct after the §1.1 fix.
- **Stress:** 100k-row import + render, timings and heap in §1.3; pagination caps
  painted rows so no render freeze.
- **Migration:** v1→v2 DB upgrade preserves all rows and drops the indexes.

Reproduce: `npx playwright test tests/regression.spec.js`.
