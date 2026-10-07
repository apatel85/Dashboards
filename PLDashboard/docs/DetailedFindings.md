> 📁 This file has moved to `docs/DetailedFindings.md`

See [DetailedFindings.md](../docs/DetailedFindings.md) — or you are already in the right place!

# PL Dashboard — Detailed Findings Report

**Review Date:** May 14, 2026  
**Reviewed By:** Independent AI Review (Perplexity / Claude)  
**App URL:** https://apatel85.github.io/pl-dashboard/  
**Version Reviewed:** v8 (pl-dashboard-v8.html, 4,190 lines)  
**Overall Grade:** F (7 Critical Issues)  
**Overall Health Score:** 59 / 100

---

## Quick Summary

The PL Dashboard is a well-intentioned, zero-backend Profit & Loss tracker. It works offline, syncs to Google Sheets, and supports CSV/Excel import. However, it has **7 critical security vulnerabilities**, several **usability problems that would confuse non-technical users**, and **performance issues** that cause browser freezes with large data sets. It should NOT be shared with real users until the Critical issues below are fixed.

---

## Score by Category

| Category | Score | What It Means |
|---|---|---|
| Security | 32 / 100 | 6 XSS attack points, no browser safety policy, formula injection in exports |
| Data Integrity | 58 / 100 | Numbers can drift slightly, dates parse incorrectly, backups fail silently |
| Reliability | 72 / 100 | Strong 3-layer backup system; some edge cases not handled |
| Performance | 78 / 100 | Fast for normal use; crashes browser with 100k+ rows |
| Accessibility | 45 / 100 | Screen readers can't read notifications or icon buttons |
| Code Quality | 55 / 100 | Large messy functions, repeated code, developer shortcuts |
| Browser Compatibility | 75 / 100 | Works best in Chrome/Edge; Firefox/Safari have gaps |

---

## Section 1 — Usability Findings

- **FIND-U1:** No welcome screen or onboarding
- **FIND-U2:** Confusing URL structure (versioned filenames)
- **FIND-U3:** "Layer 1/2/3" backup terminology confuses users
- **FIND-U4:** No in-app help or tooltips
- **FIND-U5:** No visual feedback on failed inline edits
- **FIND-U6:** "Clear All Data" only asks once (should be double-confirm)
- **FIND-U7:** No install prompt inside the app

---

## Section 2 — Security Findings (Critical)

> ⚠️ These must be fixed before sharing this app with anyone.

- **FIND-S1:** XSS in transaction display (renderRecentEntries) — Line ~2834
- **FIND-S2:** XSS in Revenue Table (renderRevTable) — Line ~2925
- **FIND-S3:** XSS in Expense Table (renderExpTable) — Line ~2933
- **FIND-S4:** XSS in CSV Import Preview (openMappingModal) — Lines ~3034-3035
- **FIND-S5:** XSS in Category Pills (catPillHTML) — Lines ~4039-4047
- **FIND-S6:** XSS in Notification Toasts (toast function) — Line ~3783
- **FIND-S7:** No Content Security Policy (CSP)
- **FIND-S8:** CSV Export Formula Injection
- **FIND-S9:** No integrity check on external libraries (CDN)

---

## Section 3 — Data & Functional Findings

- **FIND-D1:** Silent backup failure for large datasets
- **FIND-D2:** Accounting number format not supported `(500.00)`
- **FIND-D3:** European number format causes wrong amounts
- **FIND-D4:** Date format confusion (DD/MM vs MM/DD)
- **FIND-D5:** Monthly table shows inconsistent profit numbers
- **FIND-D6:** Small rounding errors in totals
- **FIND-D7:** CSV quotes not handled correctly (RFC 4180)

---

## Section 4 — Performance Findings

- **FIND-P1:** Revenue and expense tables freeze browser with large data
- **FIND-P2:** Memory usage too high for large datasets

---

## Section 5 — Accessibility Findings

- **FIND-A1:** Notifications not read aloud by screen readers
- **FIND-A2:** Icon buttons have no labels

---

## Section 6 — Comparison to Leading Apps

| Feature | PL Dashboard | Wave | QuickBooks | Zoho Books |
|---|---|---|---|---|
| Onboarding Wizard | ❌ None | ✅ Yes | ✅ Yes | ✅ Yes |
| Offline Support | ✅ Full | ❌ Online only | ❌ Online only | ❌ Online only |
| Data Privacy | ✅ Best-in-class | ❌ Server-stored | ❌ Server-stored | ❌ Server-stored |
| Security (XSS) | ❌ Not applied yet | ✅ Enterprise-grade | ✅ Enterprise-grade | ✅ Enterprise-grade |
| Price | Free | Free | $30–$200/mo | $15–$240/mo |

---

## Issue Count Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 7 |
| 🟠 High | 5 |
| 🟡 Medium | 9 |
| 🔵 Low | 2 |
| ℹ️ Info | 4 |
| **Total** | **27** |

*See `review/ISSUES_LOG.md` for the full technical issue log. See `docs/SuggestedFix.md` for the step-by-step remediation plan.*
