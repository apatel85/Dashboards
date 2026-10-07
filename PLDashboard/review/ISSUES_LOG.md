> 📁 Moved to `review/ISSUES_LOG.md` (was at root)

# ISSUES_LOG.md — pl-dashboard-v8.html

**Generated:** 2026-05-13  
**Reviewed by:** Claude Sonnet 4.6  
**Method:** Static analysis + logic simulation + stress testing per REVIEW_PLAN.md  
**File:** pl-dashboard-v8.html (4,190 lines)

---

## Summary Table

| Issue | Severity | Type | Short Title |
|---|---|---|---|
| ISSUE-001 | Critical | Security | XSS: renderRecentEntries — date/category/description unescaped |
| ISSUE-002 | Critical | Security | XSS: renderRevTable — category/description unescaped |
| ISSUE-003 | Critical | Security | XSS: renderExpTable — category/description unescaped |
| ISSUE-004 | Critical | Security | XSS: openMappingModal — CSV headers raw in innerHTML |
| ISSUE-005 | Critical | Security | XSS: openMappingModal — CSV data cells raw in innerHTML |
| ISSUE-006 | Critical | Security | XSS: catPillHTML — name rendered raw, `safe` var unused |
| ISSUE-007 | Critical | Security | No Content-Security-Policy meta tag |
| ISSUE-008 | High | Security | CSV formula injection not sanitized on export |
| ISSUE-009 | High | Security | No SRI integrity attribute on Chart.js and XLSX.js CDN scripts |
| ISSUE-010 | High | Performance | renderRevTable renders ALL rows with no pagination |
| ISSUE-011 | High | Performance | renderExpTable renders ALL rows with no pagination |
| ISSUE-012 | High | Data-loss | Snapshot localStorage overflow with >10k transactions |
| ISSUE-013 | Medium | Functional | Accounting-negative amounts `(99.00)` not parsed |
| ISSUE-014 | Medium | Functional | Ambiguous DD/MM/YYYY date format |
| ISSUE-015 | High | Security | XSS: toast() uses innerHTML with msg parameter |
| ISSUE-016 | Medium | Data-loss | Float arithmetic drift in KPI sums |
| ISSUE-017 | Medium | Functional | RFC 4180 escaped quotes not handled in parseCSV |
| ISSUE-018 | Medium | Functional | EU number format 1.234,56 silently miscoerces |
| ISSUE-019 | Medium | Functional | Monthly table col-4 mismatch (net vs gross) |
| ISSUE-020 | Medium | UX | inlineEdit error path: console.warn only, no user toast |
| ISSUE-021 | Medium | UX | Clear All Data uses single confirmation |
| ISSUE-022 | Medium | Data-loss | IndexedDB DB_VERSION=1 with no upgrade path |
| ISSUE-023 | Medium | Functional | No user-facing fallback if IndexedDB unavailable |
| ISSUE-024 | Medium | Performance | 100k row memory footprint ~61.7 MB |
| ISSUE-025 | Low | Accessibility | Toast container missing role and aria-live |
| ISSUE-026 | Low | Accessibility | Icon-only buttons missing aria-label |
| ISSUE-027 | Info | Security | Supabase anon key hardcoded (verify RLS) |
| ISSUE-028 | Info | Code-quality | Multiple functions >80 LOC |
| ISSUE-029 | Info | Code-quality | Magic strings repeated throughout |
| ISSUE-030 | Info | Code-quality | Duplicate rendering patterns |

**Severity counts:** Critical: 7 | High: 5 | Medium: 9 | Low: 2 | Info: 4  
**Total issues: 30**

*Full details for each issue (evidence, steps to reproduce, line numbers) are documented in the original ISSUES_LOG.md. See `review/FIXES.md` for the auto-applyable patches.*
