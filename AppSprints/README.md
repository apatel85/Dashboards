# App Sprints

One pipeline for every new app or website: research first, design second. No design starts until a short, bounded research pass has written down the non-technical user's job and mental model — and no design is done until one real person has tried the core task. That rule is the unanimous outcome of the five-leader UX debate (Norman, Nielsen, Krug, Wroblewski, Hall): "Evidence Before Pixels."

Live intake app: https://apatel85.github.io/Dashboards/AppSprints/

## What this is

App Sprints is the intake and research front door. It does not build apps. It collects the brief, runs the Phase 0 research, and hands the design step a one-page Research Receipt to approve first. Real apps are built under the main Dashboards folder, never here.

## How a sprint works

1. **Intake.** Open the intake app above and answer a few questions (about 2 minutes). It starts with a sprint name — one name per request — then three classifiers that change the follow-up questions: who uses it (just me / my team / public), how many kinds of users (one type / several roles), and how often (daily / once in a while). Then the five questions: what are we building, who is the non-technical user, the one core task, what it should never do or show, and where it will be used. "Don't know" is a valid answer everywhere; the agent fills gaps from research and flags them as assumptions.
2. **Brief.** The app builds a structured brief (JSON + plain text). Press **Send to GitHub**: it opens a prefilled issue in `apatel85/Dashboards` (title `Sprint intake: <name>`, label `sprint-intake`) — submit it under your own GitHub login and the watcher picks it up. Copying the brief and pasting it in the App Sprints chat still works any time as the fallback.
3. **Filing.** The watcher files the brief at `sprints/<sprint-name>/intake.json` with `status: "new"` (for briefs pasted in the chat, the agent files it the same way). One folder per request, so every sprint stays organized.
4. **Phase 0 research.** The agent runs the six steps, each bounded:
   - (1) The job in the user's own words.
   - (2) User-language harvest — words real users use, and jargon to avoid.
   - (3) How people solve it today without the product.
   - (4) Competitor audit — 3 closest products, first screen, core-task flow, one strength, one confusion point each. 30-minute cap.
   - (5) Screen-size map of the core task at 360 / 768 / 1024px+.
   - (6) Pattern Router — the job type picks the UI pattern, the app-vs-website rule applies, industry adjustments added.
5. **Research Receipt.** The agent writes a one-page `research-receipt.md` in the sprint folder and posts it in the App Sprints chat. Status becomes `receipt-ready`.
6. **Confirm or correct.** You say "looks right" or correct one line. Status becomes `confirmed`. Only then does design start — and the revamp or new app is built under the main Dashboards folder, using the Receipt as its brief.
7. **The real-user test.** Before any design is called done, one real person tries the core task on a real device.

## The daily watcher

A scheduled check runs every morning around 08:24 ET. It is token-efficient by design: it first lists the `sprints/` folder and compares it against its local state file, and lists open issues titled `Sprint intake: ...` in the repo. If no intake with `status: "new"` has appeared or changed and no new intake issue exists, it stops silently and says nothing. If a new intake exists, it processes only that named intake — runs Phase 0, writes the Receipt, sets status to `receipt-ready`, and posts the Receipt in the App Sprints chat. For a new intake issue, it files the brief from the issue body into `sprints/<name>/intake.json` first, then runs the same Phase 0 flow. Processed issue numbers are recorded in the state file so each issue is handled once. Note: the stored GitHub token cannot comment on or close issues (no Issues write scope), so filed issues stay open until closed by hand; the `sprint-intake` label also does not exist yet and is ignored by GitHub until someone creates it in repo Settings → Labels — the watcher matches issues by title, so neither blocks the flow.

Manual requests in the App Sprints chat work any time and do not wait for the watcher.

## The app-create gate

Whenever anyone asks to create an app or website, the agent first checks whether a Phase 0 Research Receipt exists for it. If it is missing, the agent says so plainly and suggests running a research sprint before designing. Phase 0 is never silently skipped for a new app. See the "App-create gate" section in the global ux-design skill.

## Folder layout

```
AppSprints/
  index.html            Intake app (v1.1.0, single file, no external dependencies)
  README.md             This file
  AGENTLOG.md           Change log, newest first
  sprints/
    README.md           Folder convention, intake.json schema, status values
    <sprint-name>/
      intake.json           Structured brief + status
      research-receipt.md   One-page Receipt, once Phase 0 is done
```

## Sprint statuses

- `new` — brief filed, research not started yet.
- `in-research` — Phase 0 is running.
- `receipt-ready` — Receipt written, waiting for the user to confirm or correct.
- `confirmed` — user approved the Receipt; design may start.

## Sprints so far

- `tradedesk-revamp-2026-11-12` — first sprint. Revamp of TradeDesk (live stock-research app) under the new UX/UI skill, Mock B command-center layout already chosen for the Daily Brief. Receipt ready, awaiting confirmation.
