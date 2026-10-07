> 📁 Moved to `review/SCORECARD.md` (was at root)

# pl-dashboard-v8 — Health Scorecard

**Review date:** 2026-05-13  
**File version:** v8 (4,190 lines)  
**Reviewed by:** Claude Opus 4.7

---

## Overall Grade: F

**7 Critical issues found → Grade F**

The dashboard has a solid feature set and thoughtful backup architecture, but seven unmitigated XSS vectors and the absence of a Content Security Policy mean arbitrary JavaScript can be injected via CSV import. These must be resolved before the app handles production data.

---

## Category Scores (0–100)

| Category | Score | Summary |
|---|---|---|
| Security | 32 | 6 XSS injection points, no CSP, no SRI, formula injection in CSV export |
| Data Integrity | 58 | Float money (drift confirmed), ambiguous date parsing, accounting-negative not handled |
| Reliability | 72 | Strong 3-layer backup; quota failure silent |
| Performance | 78 | Memory footprint 61.7 MB exceeds 50 MB target |
| Accessibility | 45 | Toast missing role; icon-only buttons lack aria-label |
| Code Quality | 55 | Multiple 100+ LOC functions; duplicate render logic; magic strings |
| Browser Compatibility | 75 | IndexedDB failure has no user-visible error |

**Weighted overall: 59 / 100**

---

## Performance Numbers

| Metric | Measured | Budget | Status |
|---|---|---|---|
| Parse 100k-row CSV | 713 ms | < 2,000 ms | ✓ PASS |
| Aggregate 100k rows (KPI) | 12.68 ms | < 500 ms | ✓ PASS |
| Export 100k rows to CSV | 132 ms | < 2,000 ms | ✓ PASS |
| Memory footprint (100k txns) | **61.7 MB** | < 50 MB | ✗ FAIL |
| Float drift (10,000 × $0.01) | 1.4 × 10⁻¹¹ | exactly $100.00 | ✗ FAIL |
| Snapshot size (10k txns × 5) | ~35,320 KB | < 5,120 KB | ✗ FAIL |

---

## Top 5 Risks

1. **ISSUE-001/002/003** — XSS via renderRecentEntries / renderRevTable / renderExpTable
2. **ISSUE-007** — No Content Security Policy
3. **ISSUE-008** — CSV formula injection in export
4. **ISSUE-010/011** — No pagination in Revenue/Expense tables
5. **ISSUE-012** — Snapshot quota overflow (silent)

---

## Recommended Remediation Order

| Tier | Fixes | Action |
|---|---|---|
| Tier 1 — Critical | FIX-001 to FIX-004 | Add escapeHtml, fix catPillHTML, add CSP |
| Tier 2 — High | FIX-005 to FIX-009 | CSV sanitize, pagination, backup warning |
| Tier 3 — Medium | FIX-010 to FIX-018 | Data accuracy, UX fixes |
| Tier 4 — Low | FIX-019 to FIX-020 | Accessibility |

*Full details in `review/FIXES.md` and `review/ISSUES_LOG.md`.*
