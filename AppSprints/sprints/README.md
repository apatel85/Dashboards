# sprints/

One folder per request. Each folder is named after its sprint: kebab-case, plus the date, e.g. `tradedesk-revamp-2026-11-12`. The name comes from the intake form and never changes once filed.

## What lives in a sprint folder

- `intake.json` — the structured brief from the intake app (or written by the agent from a chat request). Created at filing time with `status: "new"`.
- `research-receipt.md` — the one-page Research Receipt, written once Phase 0 finishes. Status becomes `receipt-ready`, then `confirmed` when the user approves it.

## intake.json schema

```json
{
  "sprint": "tradedesk-revamp-2026-11-12",
  "created": "2026-11-12",
  "status": "new",
  "source": "App Sprints intake app v1.0.0",
  "classifiers": {
    "audience": "just-me | my-team | public",
    "user_types": "one | several",
    "frequency": "daily | once-in-a-while"
  },
  "answers": {
    "what_are_we_building": "one sentence",
    "non_technical_user": "one line, plain words",
    "core_task": "the single most important thing",
    "never_do_or_show": "brand rules and must-avoids",
    "where_used": "phone | tablet | desktop | all"
  },
  "branching": {
    "internal": {
      "replaces": "what it replaces today",
      "device_already_used": "device in use now",
      "login_needed": "yes | no | not-sure"
    },
    "public": {
      "how_people_find_it": "link, search, social, word of mouth",
      "trust_in_first_5_seconds": "what they must trust at first sight",
      "money_or_signup_involved": "yes | no"
    },
    "roles": [
      { "role": "name", "does": "the one thing this role does", "must_not_see": "the one thing this role must never see" }
    ]
  }
}
```

Only the branches that apply are present. Any field may be `null` ("don't know") — the agent fills it from research and flags it as an assumption in the Receipt.

## Status values

- `new` — brief filed, research not started. The daily watcher picks these up.
- `in-research` — Phase 0 is running.
- `receipt-ready` — Receipt written, waiting for the user to confirm or correct.
- `confirmed` — user approved the Receipt; design may start. The actual app is built under the main Dashboards folder, never in App Sprints.

## How the watcher finds work

The daily watcher lists this folder, reads each `intake.json` `status`, and compares against its local state file (`~/workspace/app-sprints/watcher-state.json`). It acts only on folders whose status is `new` (or whose status changed since the last check). If there is nothing new, it stops silently.
