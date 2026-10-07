> 📁 Moved to `review/AI_REVIEW_PROMPT.md` (was at root)

# AI Review Prompt — P&L Dashboard v8

Use this prompt with **ChatGPT (Code Interpreter)**, **Gemini (AI Studio)**, or **Claude**.

## Files to upload before pasting the prompt
1. `pl-dashboard-v8.html` — the application under review
2. `review/REVIEW_PLAN.md` — the full plan

## Prompt to paste

```
You are a senior software engineer + QA automation engineer.

I have uploaded:
- `pl-dashboard-v8.html`: a 4,190-line single-file P&L dashboard (vanilla JS, Chart.js, XLSX.js, IndexedDB, localStorage, File System Access API, Google Sheets API).
- `REVIEW_PLAN.md`: the complete plan you will execute.

Follow REVIEW_PLAN.md end-to-end. Perform ALL testing using your code-execution sandbox. Do not ask a human to run a browser.

Produce these deliverables:
1. `ISSUES_LOG.md` — every defect found
2. `FIXES.md` — auto-applyable patches (OLD_STRING / NEW_STRING format)
3. `SCORECARD.md` — health scorecard
4. `tests/e2e.spec.js` — Playwright stub for browser-only checks
5. Cover note (≤ 200 words)
```

## Applying the fixes

**With Claude Code:** "Apply every FIX-NNN in FIXES.md to pl-dashboard-v8.html using the Edit tool."

**With ChatGPT / Gemini:** Upload `pl-dashboard-v8.html` + `FIXES.md` and say:
> "For every FIX-NNN: find OLD_STRING and replace with NEW_STRING. Output the patched HTML."
