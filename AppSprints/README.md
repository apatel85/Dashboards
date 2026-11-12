# App Sprints

## What App Sprints is

App Sprints is a small, plain-language pipeline for turning an idea for an app into a real design — with research first, building second.

You describe the idea in the intake form. We research it before anyone designs or builds anything. You get the findings back in writing. Only then does design start.

## The pipeline

1. **Intake** — Fill in `index.html` (open it in any browser; no build step, no sign-in). It asks three quick sorting questions, then five short questions, then follow-ups that only appear when they apply to your answers. On submit it creates a brief — as structured data and as plain text — for you to paste into the App Sprints side chat.
2. **Phase 0 research sprint** — We check what already exists, who the app is really for, and what could go wrong. No building yet.
3. **Research Receipt** — A short, plain summary of the findings, with a clear go or no-go. It lives next to the intake, as `research-receipt.md`.
4. **Design** — If the receipt says go, design starts from the research, not from a blank page.

## The watcher

A watcher checks the `sprints/` folder daily at about 8am ET.

It is token-efficient on purpose: it lists the `sprints/` folder and only acts when an intake has status `"new"`. If nothing is new, it stays silent — no message, no work.

When it finds a new intake, it runs the Phase 0 research sprint for it and writes the Research Receipt into that intake's folder.

## How to request a sprint manually

If you do not want to wait for the daily run:

1. Fill in the intake form and copy the brief (JSON or plain text — either works).
2. Paste it in the App Sprints side chat.
3. Ask for a manual run.

## Folder structure

One folder per request, under `sprints/`. Each intake lives at `sprints/<intake-name>/` and holds `intake.json` and `research-receipt.md`:

```
AppSprints/
  index.html          Intake form (this app)
  README.md           This file
  AGENTLOG.md         Change log, newest first
  sprints/
    <intake-name>/
      intake.json           The brief, as structured data
      research-receipt.md   The Phase 0 findings (added by the sprint)
```

Every intake has its own kebab-case name, suggested from the one-sentence description in the form and editable before submit. The folder is `sprints/<name>/`.

## Where apps are actually built

Actual apps are built under the main Dashboards folder, never inside AppSprints. AppSprints holds only intakes, briefs, and Research Receipts.

## Version

1.0.0
