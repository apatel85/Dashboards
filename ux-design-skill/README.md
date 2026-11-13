# UX Design Skill

The global design standard for all products built with Muse — UX reviews, redesigns, and clickable mockups.

## Contents

- `SKILL.md` — the core skill: app-create gate, planning, usability laws, Nielsen heuristics, tokens, responsive rules, states, accessibility, review format, pre-flight, and definition of done.
- `references/navigation.md` — the N1–N12 navigation decision (standing; apply as written).
- `references/mock-b.md` — the Mock B baseline: portable structure, plus the TradeDesk instance values.
- `references/product-profiles.md` — personas, brand tokens, and content rules per product.
- `skill.yaml` — skill metadata (`include_in_prompt: true`, so the skill is listed in every conversation).
- `AGENTLOG.md` — the change log.

## Version

**v1.2.0** — split into core plus references; contradictions resolved (one breakpoint set, one feedback rule, one checklist); gaps filled (full Nielsen set, forms, destructive actions, stale data, review format, control-border contrast, dark status tints); portable with no connector dependency. 2026-11-13.

**v1.1.0** — Navigation section replaced with the N1–N12 decision from the Nov 12 navigation debate, 2026-11-12.

**v1.0.0** — first versioned GitHub copy, 2026-11-12.

## Install

Copy this folder into your agent's skills directory, e.g.:

```sh
cp -r ux-design-skill ~/workspace/custom-skills/ux-design
```

## Standing rule

**GitHub is the main file for this skill.** The local workspace copy (`~/workspace/custom-skills/ux-design/`) is the working copy; every skill change gets pushed here. Versioning is three-digit X.Y.Z: new features bump Y, minor fixes bump Z (up to .20, then roll to the next Y.0), major rewrites bump X.
