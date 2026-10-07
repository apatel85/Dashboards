# PL Dashboard — Suggested Fix Plan

**Based on:** DetailedFindings.md independent review  
**Date:** May 14, 2026  
**Goal:** Make the app safe, usable, and production-ready  
**Total Issues to Fix:** 27 (7 Critical, 5 High, 9 Medium, 2 Low, 4 Info)

> 📁 This file has moved to `docs/SuggestedFix.md`

---

## How to Use This Document

Fixes are organized into 4 tiers. **Do Tier 1 first — stop there and verify before moving on.**

---

## 🔴 TIER 1 — Critical Security (Do These First)

- **FIX-01:** Add `escapeHtml()` and use in all tables — stops XSS (FIND-S1, S2, S3)
- **FIX-02:** Escape CSV preview headers and data — stops import XSS (FIND-S4)
- **FIX-03:** Fix category pill — change `name` → `safe` (one word, FIND-S5)
- **FIX-04:** Fix toast() to use textContent not innerHTML (FIND-S6)
- **FIX-05:** Add Content Security Policy `<meta>` tag (FIND-S7)

---

## 🟠 TIER 2 — High Priority

- **FIX-06:** Add `csvSanitize()` to prevent formula injection in exports
- **FIX-07:** Add pagination to Revenue table (50 rows/page)
- **FIX-08:** Add pagination to Expense table (50 rows/page)
- **FIX-09:** Show toast error when backup snapshot fails silently

---

## 🟡 TIER 3 — Medium Priority (Data Accuracy)

- **FIX-10:** Support accounting `(500.00)` and EU `1.234,56` number formats
- **FIX-11:** Add date format selector in CSV import wizard
- **FIX-12:** Fix monthly table total row (gross vs net inconsistency)
- **FIX-13:** Fix rounding display for dollar amounts
- **FIX-14:** Fix CSV quote handling (RFC 4180 `""`)
- **FIX-15:** Show error toast when inline edit fails
- **FIX-16:** Use double-confirm for "Clear All Data"
- **FIX-17:** Show user-friendly error when browser blocks storage

---

## 🔵 TIER 4 — Usability Polish

- **FIX-18:** Add welcome / onboarding screen
- **FIX-19:** Rename backup layers to plain English
- **FIX-20:** Add accessibility labels (ARIA)
- **FIX-21:** Add in-app help button
- **FIX-22:** Add PWA install prompt inside app

---

## Recommended Week-by-Week Plan

| Week | What to Do |
|---|---|
| Week 1 | FIX-01 through FIX-05 (all security) |
| Week 2 | FIX-06 through FIX-09 (performance + backup) |
| Week 3 | FIX-10 through FIX-13 (data accuracy) |
| Week 4 | FIX-14 through FIX-17 (UX fixes) |
| Week 5+ | FIX-18 through FIX-22 (polish) |

---

## ⚡ Quick Wins (< 30 Minutes Each)

- ✅ **FIX-03** — Change one word (`name` → `safe`) to fix category XSS
- ✅ **FIX-16** — One function call change to enable double-confirm
- ✅ **FIX-15** — 2 lines to show error on inline edit failure
- ✅ **FIX-12** — Fix one line in the monthly table
- ✅ **FIX-20** — Add ARIA labels (text changes only)
- ✅ **FIX-19** — Rename Layer 1/2/3 labels (text changes only)

---

*For full code patches with OLD_STRING/NEW_STRING, see `review/FIXES.md`.*  
*For the full issue list, see `review/ISSUES_LOG.md`.*
