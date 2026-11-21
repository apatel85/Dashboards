/**
 * fundamentals.test.mjs — point-in-time inputs (plan §4.4).
 * Quarters are { filed, eps, sales, opMargin }; `asOf` filters by
 * filed date — a filing dated AFTER asOf must be ignored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { epsSurprise, sue, growthYoY, acceleration, marginTrend } from '../fundamentals.mjs';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('epsSurprise: (actual − consensus) / |consensus|, as a fraction', () => {
  assert.ok(approx(epsSurprise(1.1, 1.0), 0.1));
  assert.ok(approx(epsSurprise(0.9, 1.0), -0.1));
  assert.equal(epsSurprise(1.1, 0), null);
  assert.equal(epsSurprise(1.1, null), null);
});

test('sue: latest YoY EPS change / stddev of that change over 8 quarters', () => {
  // eps by quarter; YoY changes (q[i] - q[i-4]): 0.10, 0.20, 0.20, 0.20, 0.25, 0.20, 0.20, 0.20
  // last 8 changes: mean 0.19375; population sd = 0.03897; SUE = 0.20 / 0.03897 = 5.13
  const dated = [1.0, 1.1, 1.05, 1.2, 1.1, 1.3, 1.25, 1.4, 1.35, 1.5, 1.45, 1.6]
    .map((eps, i) => ({ filed: `202${Math.floor(i / 4)}-0${(i % 4) * 3 + 1}-15`, eps, sales: 100, opMargin: 0.2 }));
  const s = sue(dated, '2023-12-31');
  assert.ok(approx(s, 5.13, 0.02), `SUE ${s}`);
  assert.equal(sue(dated.slice(0, 8), '2023-12-31'), null); // fewer than 9 quarters
  // a filing dated AFTER asOf is ignored: add a huge outlier quarter in 2024
  const withFuture = [...dated, { filed: '2024-03-15', eps: 99, sales: 100, opMargin: 0.2 }];
  assert.ok(approx(sue(withFuture, '2023-12-31'), 5.13, 0.02));
});

test('growthYoY: latest quarter vs the same quarter last year', () => {
  const qs = [
    { filed: '2023-01-15', eps: 1.6, sales: 80 }, { filed: '2023-04-15', eps: 1.7, sales: 85 },
    { filed: '2023-07-15', eps: 1.8, sales: 90 }, { filed: '2023-10-15', eps: 1.9, sales: 95 },
    { filed: '2024-01-15', eps: 2.0, sales: 100 },
  ];
  const g = growthYoY(qs, '2024-01-31');
  assert.ok(approx(g.epsYoY, 0.25)); // (2.0-1.6)/1.6
  assert.ok(approx(g.salesYoY, 0.25)); // (100-80)/80
  const future = [...qs, { filed: '2024-04-15', eps: 9.9, sales: 999 }];
  assert.deepEqual(growthYoY(future, '2024-01-31'), g); // future filing ignored
});

test('acceleration: YoY growth for the last 3 quarters, rising each quarter', () => {
  // YoY EPS growths: q4 +10% (1.10 vs 1.00), q5 +20% (1.20 vs 1.00), q6 +30% (1.30 vs 1.00)
  const qs = [1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.3]
    .map((eps, i) => ({ filed: `202${Math.floor(i / 4)}-0${(i % 4) * 3 + 1}-15`, eps, sales: 100 }));
  const a = acceleration(qs, '2023-12-31');
  assert.deepEqual(a.eps.map((x) => +x.toFixed(4)), [0.1, 0.2, 0.3]);
  assert.equal(a.accelerating, true);
  const flat = [1.0, 1.0, 1.0, 1.0, 1.3, 1.2, 1.1]
    .map((eps, i) => ({ filed: `202${Math.floor(i / 4)}-0${(i % 4) * 3 + 1}-15`, eps, sales: 100 }));
  assert.equal(acceleration(flat, '2023-12-31').accelerating, false);
});

test('marginTrend: operating margin vs the same quarter last year', () => {
  const qs = [
    { filed: '2023-01-15', eps: 1, sales: 100, opMargin: 0.15 },
    { filed: '2023-04-15', eps: 1, sales: 100, opMargin: 0.16 },
    { filed: '2023-07-15', eps: 1, sales: 100, opMargin: 0.17 },
    { filed: '2023-10-15', eps: 1, sales: 100, opMargin: 0.18 },
    { filed: '2024-01-15', eps: 1, sales: 100, opMargin: 0.2 },
  ];
  const m = marginTrend(qs, '2024-01-31');
  assert.ok(approx(m.margin, 0.2));
  assert.ok(approx(m.marginYoY, 5)); // (0.20-0.15)*100 = +5pp
  assert.equal(m.trend, 'up');
});
