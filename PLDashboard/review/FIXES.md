> 📁 Moved to `review/FIXES.md` (was at root)

# FIXES.md — Auto-applyable patches for pl-dashboard-v8.html

**Generated:** 2026-05-13  
**Covers:** ISSUE-001 through ISSUE-021

## Apply Instructions

Upload `pl-dashboard-v8.html` and this file to any AI tool, then prompt:

> "Apply every FIX-NNN block below to pl-dashboard-v8.html in order. Each block specifies a unique OLD_STRING to find and a NEW_STRING to replace it with. If OLD_STRING is not found, skip the fix and report it. After all fixes are applied, output the complete patched file."

---

## FIX-001: Add escapeHtml helper + fix XSS in renderRecentEntries, renderRevTable, renderExpTable

**Resolves:** ISSUE-001, ISSUE-002, ISSUE-003 | **Severity:** Critical

Add after the MONTHS constant:
```javascript
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
```
Then wrap all user fields in renderRecentEntries, renderRevTable, renderExpTable with `escapeHtml()`.

---

## FIX-002: Escape CSV preview in openMappingModal
**Resolves:** ISSUE-004, ISSUE-005 | **Severity:** Critical

Wrap `h` and `c` with `escapeHtml()` in the thead/tbody innerHTML assignments.

---

## FIX-003: Fix catPillHTML — change `name` to `safe`
**Resolves:** ISSUE-006 | **Severity:** Critical | **Difficulty:** Trivial (2 min)

```javascript
// Change:
<span class="cat-name">${name}</span>
// To:
<span class="cat-name">${safe}</span>
```

---

## FIX-004: Add Content-Security-Policy meta tag
**Resolves:** ISSUE-007 | **Severity:** Critical

Add in `<head>` after charset meta:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://accounts.google.com https://sheets.googleapis.com; img-src 'self' data:;">
```

---

## FIX-005 through FIX-020

See the full `FIXES.md` in git history (was at root before 2026-05-14 reorganization) for complete OLD_STRING / NEW_STRING patches for all 20 fixes.

*Key remaining fixes cover: CSV formula injection (FIX-005), SRI on CDN scripts (FIX-006), table pagination (FIX-007/008), snapshot quota warning (FIX-009), number format parsing (FIX-010), date format picker (FIX-011), toast XSS (FIX-012), rounding (FIX-013), RFC 4180 CSV (FIX-014), monthly table (FIX-015), inline edit error (FIX-016), double-confirm (FIX-017), IndexedDB fallback (FIX-018), ARIA accessibility (FIX-019/020).*
