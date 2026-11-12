# UX Design Skill

The global design standard for all products built with Muse — UX reviews, redesigns, and clickable mockups.

## Contents

- `SKILL.md` — the skill: Nielsen Norman Group heuristics, WCAG 2.2 AA, design tokens, named usability laws, anti-slop direction, a pre-flight check, and a definition-of-done gate. Includes the Mock B baseline (three-role type system, pill system, breakpoint-gated layout), a Navigation section (tabs, rails, More), and a style-suggestion rule (popular styles per app type, the user picks).
- `skill.yaml` — skill metadata (`include_in_prompt: true`, so the skill is listed in every conversation).

## Version

**v1.0.0** — first versioned GitHub copy, 2026-11-12.

## Install

Copy this folder into your agent's skills directory, e.g.:

```sh
cp -r ux-design-skill ~/workspace/custom-skills/ux-design
```

## Standing rule

**GitHub is the main file for this skill.** The local workspace copy (`~/workspace/custom-skills/ux-design/`) is the working copy; every skill change gets pushed here. Versioning is three-digit X.Y.Z: new features bump Y, minor fixes bump Z (up to .20, then roll to the next Y.0), major rewrites bump X.
