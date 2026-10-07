# CLAUDE.md — P&L Dashboard project memory

This file is auto-loaded at the start of every Claude Code session in this
repo. Read it before starting work. Keep it updated — append to the "Recent
work log" at the end of every session so the next session (even months
later) doesn't have to re-derive context from scratch.

## What this is

A single-file, zero-build P&L (Profit & Loss) dashboard for small
businesses. `index.html` (~1.6MB) is the entire app — HTML/CSS/JS in one
file, Chart.js and SheetJS inlined, no npm build step, no bundler.
`pl-dashboard-v8.html` is a **byte-identical mirror** of `index.html` kept
for the download/offline-file use case (see README.md for why both exist).
**Every change to `index.html` must be copied to `pl-dashboard-v8.html`
before committing** (`cp index.html pl-dashboard-v8.html`) — they must stay
byte-identical.

- **Hosting**: GitHub Pages, served from `main`, repo `apatel85/pl-dashboard`.
- **Data storage**: IndexedDB in the browser (hand-rolled `dbGetAll`/
  `dbPut`/`dbBulkPut`/`dbDelete` layer, no ORM). Nothing is sent to a server
  by default.
- **Auth**: Supabase (`SUPA_URL`/`SUPA_KEY` in `index.html`), used only for
  license verification (`verify_license` RPC — SECURITY DEFINER, so the
  anon key never reads `pl_licensed_users` directly) and access logging.
  Supabase does **not** store transaction data.
- **Cross-device sync**: Google Sheets, used as the sync backend (push/pull
  a per-user spreadsheet). See "Sync architecture" below.
- **Supabase schema**: `supabase/migrations/*.sql`. A GitHub Action
  (`.github/workflows/supabase-keepalive.yml`) pings Supabase every 3 days
  so the free-tier project doesn't auto-pause from inactivity.

## Repo layout

```
index.html                  The app. All feature work happens here.
pl-dashboard-v8.html         Byte-identical mirror — sync after every change.
version.json                 Changelog + latest_version, read by the in-app
                              "What's New" / update-check UI. Bump on every
                              user-facing change; this is the authoritative
                              detailed changelog — don't duplicate it here.
supabase/migrations/         SQL migrations for the Supabase auth backend.
docs/                        Deeper design docs (FEATURE_BLUEPRINT.md is
                              large/historical; SUPABASE_SECURITY_GUIDE.md
                              and SECURITY_STRESS_REVIEW_2026-07.md cover a
                              past security audit).
review/                      Artifacts from a past security-hardening pass
                              (ISSUES_LOG.md, FIXES.md, SCORECARD.md).
tests/                       Playwright specs (e2e.spec.js,
                              regression.spec.js) — check these exist and
                              run (`npx playwright test`) before assuming a
                              fresh headless script is the only option.
mock-data/                   Sample CSVs of various sizes for import testing.
archive/                     Old versions (v5/v6/v7) — historical, not live.
.github/workflows/           supabase-keepalive.yml (see above).
```

## Workflow rules — read before editing

1. **Branch-restart discipline.** This repo gets worked on across many
   sessions, each on the same long-lived feature branch. Before starting
   new work: `git fetch origin main`, check whether the branch's last
   commit is an ancestor of `origin/main` (already merged). If so, `git
   diff <lastCommit> origin/main` to confirm no *other* unexpected
   divergence, then `git checkout -B <branch> origin/main` to reset onto
   latest `main` before making new edits. Skipping this risks reverting
   another session's merged work.
2. **Sync the mirror file.** `cp index.html pl-dashboard-v8.html` before
   every commit that touches `index.html`.
3. **Validate JS parses** before testing in a browser — much faster than a
   full Playwright run for catching syntax errors:
   ```js
   const fs = require('fs');
   const html = fs.readFileSync('index.html', 'utf8');
   const scriptRe = /<script>([\s\S]*?)<\/script>/g;
   let m, i=0, errors=0;
   while((m = scriptRe.exec(html))){
     i++;
     const code = m[1];
     if(code.includes('/* Chart.js 4.4.1 (inlined') || code.includes('/* SheetJS xlsx')) continue;
     try { new Function(code); } catch(e) { errors++; console.log('Block', i, e.message); }
   }
   ```
4. **Test with headless Playwright** for real behavior (`playwright-core` +
   the pre-installed Chromium at `/opt/pw-browsers/chromium-*/chrome-linux/
   chrome`). Pattern: spin up a local `http.createServer` serving the repo
   root, navigate, `document.getElementById('auth-gate').style.display =
   'none'` + `await openDB()` to skip the login gate in tests, then drive
   the app via `page.evaluate()`. Scratchpad test scripts don't persist
   between sessions (fresh container each time) — `npm install
   playwright-core --no-save` if `node_modules` is missing.
5. **Gotcha**: `const`/`let` top-level declarations in a classic `<script>`
   tag do **not** become `window.*` properties (only `var`/function
   declarations do). `page.waitForFunction(() => typeof window.FOO)` will
   hang forever for a `const`-declared global — check bare `typeof FOO`
   instead.
6. **Version bump + changelog** on every user-facing change: bump
   `APP_VERSION` in `index.html` and add an entry to `version.json`'s
   `release_notes` (and update `latest_version`). This is what the in-app
   "What's New" modal and update-check read.
7. Open a PR when the work is ready to review (don't push straight to
   `main`). Follow whatever the session's own instructions say about PR
   creation and attribution.

## Architecture decisions worth knowing before touching these areas

- **Category type classification**: categories are a flat string array
  (`CATEGORIES`, localStorage `pl_categories_v1`), NOT objects with a type
  field. Revenue/Expense classification is resolved by `guessType(name)`,
  which checks an explicit override map (`pl_category_types_v1`,
  `loadCategoryTypes()`/`saveCategoryTypes()`) first, falling back to a
  keyword heuristic (`EXPENSE_KEYWORDS`) for categories created before that
  map existed. Every "+ Add new category" entry point (All Transactions
  dropdown, Review Categories, Quick Add typing an unrecognized name) opens
  the same modal (`openQuickAddCategoryModal`) that asks for a type and
  persists it — don't reintroduce a bare `prompt()` for new categories.
- **Category prediction** (`predictCategoryFromRules` /
  `scoreCategoryFromHistory`, in `index.html` near `guessMerchantCategory`):
  QuickBooks-style — normalizes descriptions (`normalizeVendorText`, strips
  dates/store numbers/ACH-POS boilerplate) to match the same vendor across
  noisy bank/card text, then majority-votes across that vendor's past
  categorizations. Falls back to industry-keyword merchant rules
  (`EXPENSE_MERCHANT_RULES`/`REVENUE_MERCHANT_RULES`) when there's no
  history. Predictions are never written as final — they set
  `categoryConfirmed:false` and land on the **Review Categories** page for
  the user to confirm/correct.
- **Duplicate detection**: every transaction gets a `contentHash` (derived
  from date/amount/description/type via `txnHash()`, stamped by
  `stampNewTxn()`/`touchTxnMeta()`), plus `createdAt`/`modifiedAt`
  timestamps. `contentHash` is a *separate* field from `id` — `id` stays
  the stable IndexedDB primary key an edit never changes; `contentHash` is
  what lets two devices that independently created "the same" transaction
  (different random `id`s, identical content) recognize each other.
  `findDuplicateTxn()` does the lookup; `showDuplicateModal()` (single
  pair, used by Quick Add) and `showDupReviewModal()` (bulk, used by CSV
  import and sync-conflict review) are the two comparison UIs — reuse them
  rather than building a third.
- **Sync architecture**: Google Sheets, not a real-time backend. On Google
  sign-in, `authSignIn()` requests Sheets/Drive scope in the *same* OAuth
  consent as login (not a separate later step) so `gsheetsToken` is
  available immediately; `autoSetupGSheetsSync()` then auto-creates a
  spreadsheet if none exists and turns on auto-sync by default (respecting
  an explicit prior opt-out). The sync engine itself
  (`gsheetsPushSilent`/`gsheetsPullSilent`/`startAutoSync`) debounces
  pushes 3s after any change, pulls every 60s while the tab is visible,
  pulls on tab-focus, pushes before tab-close, and retries on reconnect —
  it is near-instant, not literally real-time. `gsheetsPullSilent()` merges
  incoming rows by `id` (preserving local-only fields the sheet doesn't
  carry, like `source`) and flags `contentHash` matches with a different
  `id` as conflicts in `pendingSyncConflicts`, surfaced via a "Review
  Possible Duplicates" button in Backup & Restore (not a blocking modal
  from a background sync) — resolved through `reviewSyncConflicts()`. The
  Sheets export schema (ID/Date/Type/Category/Description/Amount/Month/
  Year) does **not** include `source`, `contentHash`, or timestamps, so
  those fields don't round-trip through the sheet itself — only through the
  id-match merge path's local-copy preservation. `fetchIncomingSheetRows()`
  (GET+parse) and `mergeIncomingSheetRows()` (the merge/conflict logic) are
  shared by all three entry points — `gsheetsPullSilent`, `gsheetsPush`, and
  `gsheetsPull` — so there's one merge implementation, not three.
  **Push pulls first.** A push is a full clear-and-rewrite of the sheet;
  without pulling and merging remote changes in before committing, two
  devices each auto-pushing their own independently-evolved local state
  would silently overwrite each other's unsynced edits on every push —
  this was the actual root cause of two devices showing very different
  totals despite "auto-sync" being on. Both `gsheetsPushSilent()` and the
  manual `gsheetsPush()` now pull-merge first, and union in the incoming
  side of any still-unresolved `pendingSyncConflicts` before building the
  push payload, so a push can't accidentally delete a conflicting row from
  the sheet just because the user hasn't resolved it locally yet.
- **License-key sign-in** (no Google account) can't get automatic Sheets
  sync — there's no Google identity to request the scope from. This is
  expected, not a bug; those users still have Quick Save (IndexedDB
  snapshots) and manual local-file backup.
- **Supabase calls must have a timeout.** `supaFetch()` wraps every call in
  `AbortSignal.timeout()` (default 20s) — a bare `fetch()` with no timeout
  was the root cause of a real "login hangs forever" bug (free-tier
  Supabase cold-start / any transient slowness just hung with no error,
  since the promise never rejected). `supaFetchWithRetry()` adds one
  automatic retry for the sign-in-blocking `verify_license` call
  specifically, since the first request is often what wakes a paused
  project. Don't add a new direct Supabase `fetch()` without going through
  `supaFetch`.
- **Dashboard Year/Month filters are multi-select**, not single-value.
  `activeYears`/`activeMonths` are each either `null` ("All" — nothing
  narrowed) or a `Set` of selected values, OR'd together within a dimension
  and ANDed across dimensions (e.g. {2024,2025} years AND {Jan,Feb} months).
  `activeYears` additionally starts at the sentinel `undefined` (not yet
  initialized this session → auto-picks the most recent year that actually
  has data) before ever becoming `null` or a `Set`. This is deliberate: the
  dashboard used to default to `settings.fiscalYear` (a cosmetic,
  independently-editable Settings field defaulting to the real current
  calendar year), which caused the header to claim e.g. "2026" while all
  loaded data was 2024/2025. Don't reintroduce `settings.fiscalYear` as the
  dashboard's default period. The dropdowns themselves
  (`renderFilterDropdown`/`onMsOptionToggle`/`onMsAllToggle`) are a small
  reusable multi-select component — reuse it rather than building another
  one if a third dashboard filter dimension is ever needed. A `Set` can
  never end up empty (unchecking everything snaps back to "All" instead) —
  don't assume `null` is the only "nothing narrowed" state without also
  checking `.size===0`.
- **Dashboard charts are clickable.** Clicking a bar/point in Revenue vs
  Expenses or Net Profit Trend sets `activeMonths` to that single month
  (click again to clear). Clicking a slice in Revenue by Category or
  Expense Breakdown sets `activeCategoryFilter` (single-select, not a Set —
  it's a chart-driven drill-down, not a standing filter like Year/Month).
  The category breakdown doughnuts themselves are deliberately scoped by
  Year+Month but NOT by `activeCategoryFilter`, so every category stays
  visible/clickable even while one is selected — only the KPI tiles and
  monthly bar/line charts narrow to the selected category.
- **KPI tiles auto-shrink to fit.** `.kpi-value` has a CSS default
  font-size per breakpoint, but a formatted amount can be far wider than
  the card at any fixed size (hundreds of millions+). `fitKpiValueText()`
  resets to the CSS default then shrinks in 1px steps (via inline
  `style.fontSize`) until the text fits its card, called after every
  `refreshDashboard()` and on window resize. This only works because none
  of the `.kpi-value` breakpoint rules use `!important` on `font-size` —
  `!important` always beats an inline style, so re-adding it to any
  `.kpi-value` font-size rule would silently break the auto-fit for
  everyone at that breakpoint. Other `.kpi-value` properties (padding,
  label size, etc.) can still safely use `!important`.
- **Mobile KPI grid is a wrapping 2-column grid**, not a horizontal
  swipe carousel. An earlier version used `display:flex; overflow-x:auto;
  scroll-snap-type:x` so only ~1-2 of the 6 tiles were visible at once
  without swiping — this was intentionally replaced because it failed
  "see your tiles without scrolling/swiping." If mobile KPI tiles ever
  seem to disappear or require horizontal scroll again, check that
  `.kpi-grid` still has `display:grid` at the relevant breakpoint and
  nothing re-introduced `display:flex` without `flex-wrap:wrap`.
- **Chart resize**: `.chart-card` (the CSS Grid item) needs `min-width: 0`.
  CSS Grid items default to `min-width: auto`, which refuses to shrink
  below the canvas's current content size — without this, Chart.js's own
  `responsive: true` ResizeObserver can never actually shrink the chart
  when the window narrows, because its grid cell won't shrink either. If a
  future chart container doesn't resize properly, check this first.
- **Popovers must be `position:fixed`, not `absolute`, to survive mobile.**
  `#main-content` has `overflow-x:hidden` at mobile breakpoints (needed to
  stop horizontal page scroll), which silently clips any `position:absolute`
  descendant that would render outside its bounds — e.g. the Year/Month
  filter dropdown (`.ms-dd-popover`) was unopenable on phones until this was
  found. The fix pattern (already established earlier by the Quick Add
  category picker, `.cat-picker-popover`, and now mirrored by
  `toggleMsDropdown()`): compute the trigger button's `getBoundingClientRect()`
  and set `position:fixed` + explicit `top`/`left`/`width` inline via JS at
  open time, instead of relying on CSS `position:absolute` positioning
  relative to an ancestor. Any new dropdown/popover component should follow
  this pattern from the start rather than rediscovering the clipping bug.
- **Google Sheets token re-auth happens on every cached-session load, not
  just on sign-in.** `gsheetsToken` is only kept in `sessionStorage`, which
  is cleared when the browser/tab closes. `bootApp()`'s own token restore
  (step 3b) only covers same-tab refreshes. The `window.addEventListener
  ('load', ...)` bootloader's cached-session branch (`loadCachedSession()`
  returns truthy → skip the auth gate) calls `attemptGSheetsSilentReauth()`
  right after `bootApp()` on **every** such load — without this, a device
  that signed in once, closed the browser, and reopened later would never
  re-request Sheets access again and would silently stop syncing with other
  devices after its first session. `attemptGSheetsSilentReauth()` itself is
  a no-op whenever `gsheetsToken` is already set, so this is safe to call
  unconditionally on every load.
- **Duplicate detection runs proactively on every app load**, not only when
  a sync pull happens to find a conflict. `scanAllDataForDuplicates()`
  (called from `bootApp()`, deferred ~1.2s so it never delays perceived
  boot time) groups every local transaction by `contentHash` (falling back
  to `txnHash()` for pre-contentHash-era records) and flags any group with
  more than one member into `pendingLocalDuplicates`, deduped via
  `_flaggedLocalDuplicates` so repeat scans don't re-flag the same pair.
  This is a **separate queue from `pendingSyncConflicts`** on purpose: for a
  sync conflict, the "incoming" side isn't in the local DB yet (resolving it
  means deciding whether to add it), but for a local-scan duplicate, *both*
  sides already exist locally (resolving it means deciding whether to
  delete the extra one) — mixing the two into one array would make
  `reviewSyncConflicts()`'s "add as new row" resolution silently create a
  *third* duplicate out of a local-scan pair. `reviewLocalDuplicates()`
  mirrors `reviewSyncConflicts()`'s structure but with that inverted
  resolution (default-excluded row → `dbDelete()`, not `dbBulkPut()`).
  `reviewAllDuplicates()` runs whichever of the two queues is non-empty, so
  callers needing "resolve everything" don't have to care which queue an
  item came from. Both queues are surfaced together: a "Possible
  Duplicates" card on the **Review Categories** page (`#review-dup-card`,
  rendered by `renderDuplicatesSection()`, called from both
  `updateSyncConflictUI()` and `renderReviewCategoriesView()`) shows the
  combined count with a single "Review Duplicates" button
  (`reviewAllDuplicates()`), and the `#nav-review-badge` sidebar count
  (`updateReviewCategoryBadge()`) now adds both queues' lengths on top of
  the unconfirmed-category count. `showDupReviewModal()` (the shared bulk
  compare UI used by CSV import, sync conflicts, and local-scan duplicates)
  takes an optional 3rd `opts` argument (`subtitle`, `selectAllLabel`,
  `cancelLabel`, `confirmLabel`) so each caller can word the modal for its
  own context instead of always saying "being imported" — pass `opts` for
  any new caller rather than reusing the CSV-import-flavored defaults.
  Whenever a sync pull (silent or manual) finds conflicts, the toast now
  includes a "Review" action button (`toast()`'s `opts.action`) that jumps
  straight to `review-categories-view`, instead of just naming a tab in
  text for the user to find themselves.
- **The service worker (`service-worker.js`) is network-first for the app
  shell, not stale-while-revalidate.** This app is installable as a PWA, and
  the SW's `fetch` handler controls what code a device actually runs on
  each load — this is a *separate* staleness source from the Google Sheets
  sync bugs above, and easy to confuse with them. The previous
  stale-while-revalidate strategy always served whatever was cached
  *instantly*, updating the cache only in the background for the *next*
  load — so a real behavior fix deployed to GitHub Pages could sit
  invisible on a device for one or more app opens, and a device that closed
  the app before that background revalidation finished (common on mobile)
  could stay stuck on an old build indefinitely, with no warning (the
  in-app "new version available" toast only fires when `service-worker.js`
  itself changes bytes — a content-only `index.html` change never triggers
  it). Confirmed via Playwright: after "deploying" a new version mid-test,
  a stale-while-revalidate SW served the old version in a single-page test
  — network-first served the new one immediately on the next load. Fixed
  by rewriting the `fetch` handler to always try the network first,
  falling back to the cache only when the request itself fails (true
  offline), and bumping `CACHE_VERSION` to purge old caches on update.
  **Gotcha found via testing**: the background cache write after a
  network-first fetch must be `await`ed *inside* the promise passed to
  `respondWith()`, not fired via a separate `event.waitUntil()` call from
  inside a `.then()` — the latter is spec-legal but proved unreliable in
  practice (a cache write raced losing against the SW being torn down,
  verified by going offline immediately after an online fetch and getting
  a stale/empty cache). `respondWith()`'s own promise already extends the
  worker's lifetime until it settles, so an `async () => { await ... }`
  IIFE passed directly to it is the reliable pattern — don't revert to the
  `.then()` + `waitUntil()` split. Any future change to the SW's caching
  strategy should be verified the same way (a Playwright test that swaps
  server content mid-run and checks what the next load actually renders,
  not just that the file parses), since this class of bug is invisible to
  every other kind of test in this repo — the app itself works fine in any
  single test run; the bug only shows up as "whatever was last deployed
  before this device's cache last refreshed," which is exactly what the
  user reported as "3 devices, 3 different sets of data."

## Recent work log

Keep this short — a few bullets per session, newest first. Full detail
lives in `version.json`'s `release_notes` and PR descriptions; this is just
enough for a future session to know where to look.

- **2026-10-03 (4)**: After merging 2026-10-03 (3)'s sync-reauth fix (PR
  #39), the user reported devices still showed different data — turned out
  to be a *second, separate* cause: the PWA's service worker
  (`service-worker.js`) served the app shell stale-while-revalidate (cache
  instantly, refresh in background for next time), so devices could keep
  running old app *code* — including old sync bugs — for a long time after
  a fix was deployed, independent of any actual data sync issue. Rewrote
  the SW's `fetch` handler to network-first (always fetch live when online,
  cache fallback only when offline), bumped `CACHE_VERSION`, and made the
  "new version available" toast include a one-tap Reload button. See
  "Architecture decisions" above for the `event.waitUntil()`-vs-`await`
  gotcha hit while fixing this, and why it needed its own kind of test
  (swap server content mid-test, check what the *next* load renders).
- **2026-10-03 (3)**: Fixed the Year/Month filter dropdown not opening on
  mobile — `.ms-dd-popover` was `position:absolute` and got clipped by
  `#main-content`'s mobile `overflow-x:hidden`; converted it to
  `position:fixed` with JS-computed coordinates (`toggleMsDropdown()`),
  mirroring the existing `.cat-picker-popover` fix pattern (see
  "Architecture decisions" above). Put the Year and Month dropdowns on the
  same row (`.page-actions` inline style change). Fixed the real remaining
  cause of sync going stale between devices: a cached-session app load
  never re-requested Google Sheets access, so `gsheetsToken` was only ever
  set on a fresh sign-in or a same-tab refresh — `attemptGSheetsSilentReauth()`
  is now also called from the `window.load` bootloader's cached-session
  path. Made duplicate detection proactive instead of sync-pull-only:
  `scanAllDataForDuplicates()` now runs on every app load against all local
  data (not just incoming sync rows), surfaced via a new "Possible
  Duplicates" section on the Review Categories page
  (`reviewAllDuplicates()`/`reviewLocalDuplicates()`, separate queue from
  `pendingSyncConflicts` — see above for why) plus a toast with a "Review"
  button pointing there whenever either queue gains entries.
- **2026-10-03 (2)**: Fixed KPI tiles clipping large dollar amounts
  (JS auto-fit font sizing — see above; also had to strip `!important`
  from several mobile `.kpi-value` font-size rules that were silently
  defeating it). Made the dashboard charts clickable to drill down by
  month or category. Fixed real cross-device sync divergence: a push was
  a destructive full-sheet overwrite with no pull-merge first, so two
  devices each auto-pushing their own locally-evolved state could
  silently stomp each other's unsynced edits — `gsheetsPushSilent()`,
  `gsheetsPush()`, and `gsheetsPull()` now share one merge implementation
  (`fetchIncomingSheetRows`/`mergeIncomingSheetRows`) and push pull-merges
  first. Replaced the Year/Month chip rows with multi-select dropdowns
  (saves significant vertical space and supports selecting more than one
  year/month at once) and replaced the mobile KPI tile horizontal swipe
  carousel with a proper wrapping 2-column grid, so all 6 tiles are
  visible without swiping or scrolling.
- **2026-10-03 (1)**: Fixed login hanging indefinitely for some users (missing
  timeout on Supabase calls — see `supaFetch` above). Added a Year filter
  to the Dashboard and fixed its period label defaulting to the wrong
  (real-world current) year instead of the data's actual year. Fixed chart
  resize on tablet/desktop (CSS Grid `min-width` issue). Added
  `contentHash`/`createdAt`/`modifiedAt` to the transaction model plus a
  duplicate-detection + comparison-modal system (manual entry, CSV import,
  and sync-pull conflicts all share it). Made new-category creation always
  ask Revenue/Expense type instead of guessing from the name, and fixed
  that type actually being persisted (it wasn't, previously). Made Google
  Sheets sync activate automatically on Google sign-in instead of requiring
  a separate manual "Connect" step. Created this file.
- **8.9.1**: Category-type prompts on create, smarter QuickBooks-style
  category prediction (vendor normalization + majority vote), Add
  Transaction layout fix.
- **8.9.0**: Category prediction engine (merchant keywords + history
  matching) + Review Categories confirmation page — predictions from CSV
  import are never written as final until the user confirms them.
- **8.8.0 and earlier**: see `version.json` — whole-file CSV header
  detection, Balance Sheet account types (Equity/Liability/Asset) with
  correct P&L exclusion, credit-card-payment transfer offsetting, source/
  account tracking, messy-file import detection, refund color semantics,
  Reports tab (P&L statement, YoY, PDF export), configurable auto
  sign-out, license-key sign-in, security hardening (RLS, CSP, XSS
  escaping, formula-injection-safe CSV export).

## Note on `CLAUD.md`

There's a separate `CLAUD.md` (missing the E) in the repo root with generic
AI-collaboration workflow preferences (not project-specific, and not
auto-loaded by Claude Code due to the filename). It was left as-is when
this file was created — unclear if it's still wanted; ask before
deleting/renaming it.
