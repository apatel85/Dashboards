> 📁 Moved to `review/REVIEW_PLAN.md` (was at root)

# P&L Dashboard v8 — AI-Driven Review, Testing & Auto-Fix Plan (v2)

This is the master review plan used to conduct the AI-driven audit of pl-dashboard-v8.html.

## Context

`pl-dashboard-v8.html` (4,190 lines) is a single-file, zero-backend P&L tracker. Because it stores a user's financial data client-side, defects in any layer (XSS via category names, CSV formula injection, IndexedDB upgrade dropping data, floating-point money drift, Sheets sync overwrites) can silently destroy or leak data.

This plan shifts testing to **AI-driven**: the AI performs all review, functional simulation, and stress testing by:
1. Statically analyzing the HTML/JS for defects.
2. Extracting JavaScript and simulating core logic in a sandbox.
3. Generating and replaying stress datasets (100 → 100,000 rows).
4. Producing machine-readable outputs (`ISSUES_LOG.md` + `FIXES.md`) for autonomous patching.
5. Producing a human-readable scorecard (`SCORECARD.md`).

## Key Output Files

| File | Location | Role |
|---|---|---|
| ISSUES_LOG.md | `review/` | Every defect found |
| FIXES.md | `review/` | Auto-applyable patches |
| SCORECARD.md | `review/` | Health scorecard |
| AI_REVIEW_PROMPT.md | `review/` | Prompt to re-run this review |
| DetailedFindings.md | `docs/` | Plain-English findings for non-devs |
| SuggestedFix.md | `docs/` | Plain-English fix plan for non-devs |

## Plan Structure

- **Part A** — Static Code Review
- **Part B** — Logic Simulation Testing
- **Part C** — Mock Dataset Specifications
- **Part D** — Stress & Performance Testing
- **Part E** — Issue Logging Format
- **Part F** — Fix-Ready Output Format
- **Part G** — Scorecard & Performance Report
- **Part H** — AI-Tool Execution Notes

*Full plan contents are in the original REVIEW_PLAN.md committed to this repo.*
