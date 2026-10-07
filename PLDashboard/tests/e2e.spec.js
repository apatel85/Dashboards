/**
 * e2e.spec.js — Playwright test stub for pl-dashboard-v8.html
 *
 * Covers browser-only features that the AI simulation could not test:
 *   - UI rendering and navigation
 *   - IndexedDB transactions (open, write, read, upgrade)
 *   - File System Access API (Layer-2 backup)
 *   - Google OAuth flow (Layer-3 Sheets sync)
 *   - Toast notifications and ARIA
 *   - XSS regression (post-fix validation)
 *
 * Prerequisites:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *
 * Run:
 *   npx playwright test tests/e2e.spec.js --headed
 *
 * Note: Google OAuth tests require a real test account and GOOGLE_TEST_TOKEN env var.
 *       File System Access tests require --headed (Chromium only).
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const APP_URL = `file://${path.resolve(__dirname, '../pl-dashboard-v8.html')}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openApp(page) {
  await page.goto(APP_URL);
  // Wait for IndexedDB init and first render
  await page.waitForFunction(() => typeof window.db !== 'undefined' || document.querySelector('#tab-dashboard'));
}

async function importCSV(page, csvPath) {
  const fileChooser = page.waitForEvent('filechooser');
  await page.click('#import-btn, [data-action="import"], button:has-text("Import")');
  const fc = await fileChooser;
  await fc.setFiles(csvPath);
}

// ---------------------------------------------------------------------------
// T01 — App loads without JS errors
// ---------------------------------------------------------------------------

test('T01 — app loads without uncaught errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await openApp(page);
  await page.waitForTimeout(500);

  expect(errors).toHaveLength(0);
  await expect(page.locator('#tab-dashboard, [data-tab="dashboard"]')).toBeVisible();
});

// ---------------------------------------------------------------------------
// T02 — Tab navigation renders each section
// ---------------------------------------------------------------------------

test('T02 — tab navigation renders all sections', async ({ page }) => {
  await openApp(page);

  const tabs = ['dashboard', 'revenue', 'expenses', 'monthly', 'transactions', 'import', 'settings', 'backup'];

  for (const tab of tabs) {
    const tabBtn = page.locator(`[data-tab="${tab}"], #tab-${tab}, button:has-text("${tab}")`).first();
    if (await tabBtn.count() === 0) continue;
    await tabBtn.click();
    await page.waitForTimeout(200);
    // Each tab should not throw and should show some content
    const errors = [];
    page.once('pageerror', e => errors.push(e));
    await page.waitForTimeout(100);
    expect(errors).toHaveLength(0);
  }
});

// ---------------------------------------------------------------------------
// T03 — Quick-add transaction writes to IndexedDB and appears in table
// ---------------------------------------------------------------------------

test('T03 — quick-add transaction persists and renders', async ({ page }) => {
  await openApp(page);

  // Navigate to transactions tab
  const txnTab = page.locator('[data-tab="transactions"], #tab-transactions').first();
  if (await txnTab.count() > 0) await txnTab.click();

  // Fill quick-add form
  await page.fill('#quick-date, input[name="date"]', '2025-06-15');
  await page.selectOption('#quick-type, select[name="type"]', 'revenue');
  await page.fill('#quick-amount, input[name="amount"]', '1500.00');
  await page.fill('#quick-desc, input[name="description"]', 'Test sale');

  await page.click('#quick-add-btn, button:has-text("Add"), button[type="submit"]');
  await page.waitForTimeout(500);

  // Row should appear in table
  await expect(page.locator('td:has-text("Test sale")')).toBeVisible({ timeout: 2000 });
});

// ---------------------------------------------------------------------------
// T04 — CSV import smoke test (10-row file)
// ---------------------------------------------------------------------------

test('T04 — CSV import processes 10-row smoke file', async ({ page }) => {
  await openApp(page);

  // Navigate to import tab
  const importTab = page.locator('[data-tab="import"], #tab-import').first();
  if (await importTab.count() > 0) await importTab.click();

  const csvPath = path.resolve(__dirname, '../mock-data/mock-10-rev2500-exp1000.csv');

  // Trigger file input — may need adjustment based on actual button selector
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(csvPath);
  await page.waitForTimeout(500);

  // Mapping modal or preview should appear
  const mappingModal = page.locator('#mapping-modal, .mapping-modal, [id*="mapping"]').first();
  const previewTable = page.locator('table.preview, #preview-table').first();
  const someModal = page.locator('.modal, dialog[open]').first();

  const visible = (await mappingModal.isVisible()) || (await previewTable.isVisible()) || (await someModal.isVisible());
  expect(visible).toBe(true);
});

// ---------------------------------------------------------------------------
// T05 — XSS regression: imported description with <script> does not execute
// ---------------------------------------------------------------------------

test('T05 — XSS regression: script in description is escaped, not executed', async ({ page }) => {
  await openApp(page);

  let xssTriggered = false;
  await page.exposeFunction('__xssDetected', () => { xssTriggered = true; });

  // Inject XSS probe via quick-add (simulates post-fix state)
  const txnTab = page.locator('[data-tab="transactions"], #tab-transactions').first();
  if (await txnTab.count() > 0) await txnTab.click();

  await page.fill('#quick-date, input[name="date"]', '2025-06-15');
  await page.selectOption('#quick-type, select[name="type"]', 'revenue');
  await page.fill('#quick-amount, input[name="amount"]', '1.00');
  await page.fill('#quick-desc, input[name="description"]', '<img src=x onerror="window.__xssDetected && window.__xssDetected()">');

  await page.click('#quick-add-btn, button:has-text("Add"), button[type="submit"]');
  await page.waitForTimeout(500);

  // Navigate to dashboard to trigger renderRecentEntries
  const dashTab = page.locator('[data-tab="dashboard"], #tab-dashboard').first();
  if (await dashTab.count() > 0) await dashTab.click();
  await page.waitForTimeout(300);

  expect(xssTriggered).toBe(false);

  // Confirm the raw string is present but as text, not parsed HTML
  const cell = page.locator('td, .entry-desc').filter({ hasText: '<img src=x' }).first();
  if (await cell.count() > 0) {
    // It rendered as visible text — good (means it was escaped)
    const html = await cell.innerHTML();
    expect(html).toContain('&lt;img');
  }
});

// ---------------------------------------------------------------------------
// T06 — IndexedDB: database opens and survives page reload
// ---------------------------------------------------------------------------

test('T06 — IndexedDB persists data across page reload', async ({ page }) => {
  await openApp(page);

  // Add a transaction
  const txnTab = page.locator('[data-tab="transactions"], #tab-transactions').first();
  if (await txnTab.count() > 0) await txnTab.click();

  await page.fill('#quick-date, input[name="date"]', '2025-07-01');
  await page.selectOption('#quick-type, select[name="type"]', 'expense');
  await page.fill('#quick-amount, input[name="amount"]', '250.00');
  await page.fill('#quick-desc, input[name="description"]', 'Persistence test txn');

  await page.click('#quick-add-btn, button:has-text("Add"), button[type="submit"]');
  await page.waitForTimeout(800);

  // Reload
  await page.reload();
  await page.waitForTimeout(1000);

  // Navigate to transactions
  const txnTab2 = page.locator('[data-tab="transactions"], #tab-transactions').first();
  if (await txnTab2.count() > 0) await txnTab2.click();
  await page.waitForTimeout(300);

  await expect(page.locator('td:has-text("Persistence test txn")')).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// T07 — IndexedDB unavailable in private mode (simulated)
// ---------------------------------------------------------------------------

test('T07 — IndexedDB failure shows user-facing error (post-fix)', async ({ page }) => {
  // Block IndexedDB by overriding the open call before page load
  await page.addInitScript(() => {
    const origOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function(...args) {
      const req = origOpen(...args);
      // Immediately trigger onerror
      setTimeout(() => {
        if (req.onerror) req.onerror(new Event('error'));
      }, 50);
      return req;
    };
  });

  await openApp(page);
  await page.waitForTimeout(1000);

  // Post-fix: a user-visible error message should appear (not silent)
  const errorEl = page.locator(
    '[role="alert"], .error-banner, #db-error, .toast, [class*="error"]'
  ).first();
  // This test will FAIL before FIX-018 is applied (no user-visible error shown)
  await expect(errorEl).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// T08 — Layer-1 snapshot: Snapshot Now creates entry
// ---------------------------------------------------------------------------

test('T08 — Layer-1 snapshot creates localStorage entry', async ({ page }) => {
  await openApp(page);

  const backupTab = page.locator('[data-tab="backup"], #tab-backup').first();
  if (await backupTab.count() === 0) {
    test.skip(true, 'Backup tab not found — adjust selector');
    return;
  }
  await backupTab.click();
  await page.waitForTimeout(300);

  const snapBtn = page.locator('button:has-text("Snapshot"), button:has-text("snapshot"), #snapshot-btn').first();
  if (await snapBtn.count() === 0) {
    test.skip(true, 'Snapshot button not found');
    return;
  }
  await snapBtn.click();
  await page.waitForTimeout(500);

  // Confirm localStorage has at least one snapshot key
  const hasSnapshot = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i).includes('snapshot') || localStorage.key(i).includes('Snapshot')) {
        return true;
      }
    }
    return false;
  });

  expect(hasSnapshot).toBe(true);
});

// ---------------------------------------------------------------------------
// T09 — Layer-1 snapshot: quota overflow shows toast (post-fix)
// ---------------------------------------------------------------------------

test('T09 — snapshot quota overflow surfaces error toast (post-fix)', async ({ page }) => {
  await openApp(page);

  // Fill localStorage nearly full to trigger QuotaExceededError
  await page.evaluate(() => {
    const huge = 'x'.repeat(4 * 1024 * 1024); // 4 MB
    try { localStorage.setItem('__fill__', huge); } catch(e) {}
  });

  const backupTab = page.locator('[data-tab="backup"], #tab-backup').first();
  if (await backupTab.count() > 0) await backupTab.click();
  await page.waitForTimeout(300);

  const snapBtn = page.locator('button:has-text("Snapshot"), #snapshot-btn').first();
  if (await snapBtn.count() > 0) await snapBtn.click();
  await page.waitForTimeout(800);

  // Post-fix: a toast error must be visible (not just console.warn)
  const toast = page.locator('#toast, .toast, [role="status"]').first();
  await expect(toast).toBeVisible({ timeout: 2000 });

  // Cleanup
  await page.evaluate(() => localStorage.removeItem('__fill__'));
});

// ---------------------------------------------------------------------------
// T10 — File System Access API: feature-detected, graceful on Firefox
// ---------------------------------------------------------------------------

test('T10 — File System Access API gracefully falls back when unavailable', async ({ page }) => {
  // Remove the API to simulate Firefox/Safari
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showSaveFilePicker;
  });

  await openApp(page);

  const backupTab = page.locator('[data-tab="backup"], #tab-backup').first();
  if (await backupTab.count() > 0) await backupTab.click();

  // Attempt to trigger File System link
  const linkBtn = page.locator('button:has-text("Link"), button:has-text("link file"), #link-file-btn').first();
  if (await linkBtn.count() === 0) {
    test.skip(true, 'Link file button not found — adjust selector');
    return;
  }

  const errors = [];
  page.once('pageerror', e => errors.push(e.message));
  await linkBtn.click();
  await page.waitForTimeout(400);

  // Should NOT throw a JS error — should show a friendly message
  expect(errors.filter(e => e.includes('showOpenFilePicker'))).toHaveLength(0);

  const fallbackMsg = page.locator(':has-text("not supported"), :has-text("unavailable"), .toast').first();
  await expect(fallbackMsg).toBeVisible({ timeout: 2000 });
});

// ---------------------------------------------------------------------------
// T11 — Google OAuth: token expiry shows re-auth prompt
// ---------------------------------------------------------------------------

test('T11 — expired Google token triggers re-auth UI (not silent failure)', async ({ page }) => {
  await openApp(page);

  // Inject an expired token into sessionStorage
  await page.evaluate(() => {
    const fakeToken = { access_token: 'expired-token', expires_at: Date.now() - 1000 };
    sessionStorage.setItem('gsheets_token', JSON.stringify(fakeToken));
  });

  // Navigate to Sheets/Backup and trigger a Sheets action
  const backupTab = page.locator('[data-tab="backup"], #tab-backup').first();
  if (await backupTab.count() > 0) await backupTab.click();

  const sheetsBtn = page.locator('button:has-text("Sheets"), button:has-text("Google"), #sheets-btn').first();
  if (await sheetsBtn.count() === 0) {
    test.skip(true, 'Sheets button not found — adjust selector');
    return;
  }

  await sheetsBtn.click();
  await page.waitForTimeout(500);

  // Must show re-auth prompt or error — not silently fail
  const authPrompt = page.locator(':has-text("sign in"), :has-text("re-auth"), :has-text("connect"), .toast').first();
  await expect(authPrompt).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// T12 — CSV export does not include formula injection payloads (post-fix)
// ---------------------------------------------------------------------------

test('T12 — CSV export sanitizes formula-injection cells (post-fix)', async ({ page }) => {
  await openApp(page);

  // Add a transaction with a formula-injection description
  const txnTab = page.locator('[data-tab="transactions"], #tab-transactions').first();
  if (await txnTab.count() > 0) await txnTab.click();

  await page.fill('#quick-date, input[name="date"]', '2025-08-01');
  await page.selectOption('#quick-type, select[name="type"]', 'revenue');
  await page.fill('#quick-amount, input[name="amount"]', '1.00');
  await page.fill('#quick-desc, input[name="description"]', '=SUM(A1:A10)');

  await page.click('#quick-add-btn, button:has-text("Add"), button[type="submit"]');
  await page.waitForTimeout(500);

  // Trigger CSV export and intercept download
  const [ download ] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.locator('button:has-text("Export"), button:has-text("export"), #export-btn').first().click().catch(() => {}),
  ]);

  if (!download) {
    test.skip(true, 'Export download not triggered — adjust selector');
    return;
  }

  const content = await (await download.createReadStream()).read();
  const csv = content.toString();

  // Post-fix: formula cells must be prefixed with a single quote
  expect(csv).not.toMatch(/^=SUM/m);
  expect(csv).toMatch(/'=SUM/);
});

// ---------------------------------------------------------------------------
// T13 — Toast has correct ARIA attributes (post-fix)
// ---------------------------------------------------------------------------

test('T13 — toast element has role="status" and aria-live (post-fix)', async ({ page }) => {
  await openApp(page);

  const toast = page.locator('#toast').first();
  if (await toast.count() === 0) {
    test.skip(true, '#toast element not found');
    return;
  }

  const role = await toast.getAttribute('role');
  const ariaLive = await toast.getAttribute('aria-live');

  expect(role).toBe('status');
  expect(['polite', 'assertive']).toContain(ariaLive);
});

// ---------------------------------------------------------------------------
// T14 — Category pill escapes HTML in category name (post-fix)
// ---------------------------------------------------------------------------

test('T14 — category pill renders HTML-escaped name (post-fix)', async ({ page }) => {
  await openApp(page);

  // Add a category with an XSS payload via Settings tab
  const settingsTab = page.locator('[data-tab="settings"], #tab-settings').first();
  if (await settingsTab.count() > 0) await settingsTab.click();

  const catInput = page.locator('#new-cat-input, input[placeholder*="category"], input[name="category"]').first();
  if (await catInput.count() === 0) {
    test.skip(true, 'Category input not found — adjust selector');
    return;
  }

  await catInput.fill('<script>window.__catXss=1</script>');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  // Confirm the script tag was NOT executed
  const xssRan = await page.evaluate(() => window.__catXss);
  expect(xssRan).toBeFalsy();
});

// ---------------------------------------------------------------------------
// T15 — Revenue and Expense tables paginate at 50 rows (post-fix)
// ---------------------------------------------------------------------------

test('T15 — Revenue table paginates (post-fix)', async ({ page }) => {
  await openApp(page);

  // Inject 60 revenue rows directly into IndexedDB via page.evaluate
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('PLDashboard', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });

    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');

    const puts = [];
    for (let i = 0; i < 60; i++) {
      puts.push(new Promise((res, rej) => {
        const r = store.add({
          date: '2025-09-01', type: 'revenue',
          category: 'Sales', description: `Rev-row-${i}`,
          amount: 10.00
        });
        r.onsuccess = res; r.onerror = rej;
      }));
    }
    await Promise.all(puts);
    await new Promise(res => { tx.oncomplete = res; });
  });

  // Navigate to Revenue tab and count visible rows
  const revTab = page.locator('[data-tab="revenue"], #tab-revenue').first();
  if (await revTab.count() === 0) {
    test.skip(true, 'Revenue tab not found');
    return;
  }
  await revTab.click();
  await page.waitForTimeout(500);

  const rows = await page.locator('table tbody tr').count();

  // Post-fix: should show ≤ 50 rows per page, not all 60
  expect(rows).toBeLessThanOrEqual(50);

  // Pagination controls should be visible
  const pager = page.locator('.pagination, [class*="pager"], button:has-text("Next")').first();
  await expect(pager).toBeVisible({ timeout: 2000 });
});
