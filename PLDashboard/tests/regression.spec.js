/**
 * regression.spec.js — guards the fixes from the 2026-07 security & stress review.
 *
 * Run:  npx playwright test tests/regression.spec.js
 *       (headless Chromium; opens the app over file://)
 *
 * Covers, by driving the app's REAL functions (not copies):
 *   1. Accounting-negative amounts keep their decimal: "(99.00)" → 99.00, not 9900.
 *   2. CSV export cells are RFC 4180 quoted: a description with a " round-trips.
 *   3. The IndexedDB store carries no secondary indexes (they were unused and made
 *      large imports ~5x slower).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const APP_URL = `file://${path.resolve(__dirname, '../pl-dashboard-v8.html')}`;

async function open(page) {
  await page.goto(APP_URL);
  await page.waitForFunction(() => typeof window.applyMapping === 'function' && typeof window.dbGetAll === 'function');
  await page.waitForTimeout(300);
}

test('accounting-negative amounts preserve the decimal point', async ({ page }) => {
  await open(page);
  const stored = await page.evaluate(async () => {
    await dbClear();
    const header = ['date', 'type', 'category', 'amount'];
    const rows = [
      ['2025-01-01', 'expense', 'X', '(99.00)'],
      ['2025-01-01', 'expense', 'X', '(1,234.56)'],
      ['2025-01-01', 'revenue', 'X', '$1,234.56'],
    ];
    finishCsvImport([header, ...rows]); // sets real parsedCSV/csvHeaders + opens modal
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('map-date', 0); set('map-type', 1); set('map-category', 2); set('map-amount', 3);
    set('map-description', ''); set('map-num-fmt', 'auto'); set('map-date-fmt', 'auto');
    await applyMapping();
    return (await dbGetAll()).map(t => t.amount); // stored as magnitude
  });
  expect(stored[0]).toBeCloseTo(99.00, 2);    // was 9900 before the fix
  expect(stored[1]).toBeCloseTo(1234.56, 2);  // was 123456 before the fix
  expect(stored[2]).toBeCloseTo(1234.56, 2);
});

test('CSV export cell is RFC 4180 quoted (embedded quote round-trips)', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const desc = 'He said "hi", ok';
    const cell = csvCell(desc);          // the shared export helper
    const back = parseCSV('h\n' + cell); // parse it back
    return { one: back[1].length === 1, value: back[1][0] };
  });
  expect(r.one).toBe(true);              // stays a single field, not split on the comma
  expect(r.value).toBe('He said "hi", ok');
});

test('transactions store has no secondary indexes', async ({ page }) => {
  await open(page);
  const idx = await page.evaluate(() => {
    const tx = db.transaction('transactions', 'readonly');
    return Array.from(tx.objectStore('transactions').indexNames);
  });
  expect(idx).toEqual([]);
});

test('license verification goes through the RPC, not a direct table read', async ({ page }) => {
  await open(page);
  // The public anon key must never SELECT pl_licensed_users directly.
  const src = await page.content();
  expect(src).not.toMatch(/pl_licensed_users\?email/);
  expect(src).toContain('/rest/v1/rpc/verify_license');
});

test('browser refresh returns to the last tab, fresh session opens overview', async ({ page }) => {
  await open(page);
  await page.evaluate(() => showView('reports-view'));
  await page.reload();
  await page.waitForFunction(() => typeof window.bootApp === 'function');
  const restored = await page.evaluate(async () => {
    await bootApp(); // simulate an authenticated boot
    return document.querySelector('[id$="-view"].active')?.id;
  });
  expect(restored).toBe('reports-view');
  const fresh = await page.evaluate(async () => {
    sessionStorage.removeItem('pl_active_view');
    await bootApp();
    return document.querySelector('[id$="-view"].active')?.id;
  });
  expect(fresh).toBe('dashboard-view');
});

test('add-transaction categories are ordered by the selected Type', async ({ page }) => {
  await open(page);
  const labels = await page.evaluate(async (type) => {
    await updateCatDatalist();
    currentEntryType = type;
    renderCatPicker(window._catList || []);
    return [...document.getElementById('qa-cat-popover').children]
      .filter(n => n.classList.contains('cat-picker-group'))
      .map(n => n.textContent);
  }, 'revenue');
  expect(labels).toEqual(['Revenue', 'Expense']); // revenue group first

  const labelsExp = await page.evaluate(async (type) => {
    currentEntryType = type;
    renderCatPicker(window._catList || []);
    return [...document.getElementById('qa-cat-popover').children]
      .filter(n => n.classList.contains('cat-picker-group'))
      .map(n => n.textContent);
  }, 'expense');
  expect(labelsExp).toEqual(['Expense', 'Revenue']); // expense group first
});
