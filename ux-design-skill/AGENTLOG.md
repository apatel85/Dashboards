# AGENTLOG — UX Design Skill

## 2026-11-13 — v1.2.0: split into core plus references; contradictions resolved; gaps filled

- **Request:** Update the skill with the gaps and improvements from the 2026-11-13 review (Ankit, Claude Code session, model switched to Haiku 5.5 for this change).
- **What:**
  - `SKILL.md` rewritten as the core (about 19KB, down from 29KB). Frontmatter `description` added with trigger phrases.
  - Moved to `references/`: `navigation.md` (N1–N12 verbatim), `mock-b.md` (portable structure split from TradeDesk instance values), `product-profiles.md` (Quixera, KRCA, TradeDesk, WagWise, plus a template for new profiles).
  - Removed the "what the current draft section gets wrong" critique from the skill body. It described a draft that no longer exists; the history lives here.
  - Removed `muse.*` connector and `/opt/muse/...` references. The skill now has no dependency on a particular connector.
- **Decisions made in this version (mine, for Ankit to confirm or reverse):**
  - Breakpoints: one canonical set for all products, phone below 768, tablet 768–1023, desktop 1024 and up. Mock B's TradeDesk split at 920px is kept only as a TradeDesk instance value, and products must not mix the two sets.
  - Verification widths: 320, 390, 768, 1024, 1280px (plus 1440 where a desktop max-width applies). The N12 text is unchanged; the 390/768/1280 test it names is covered.
  - Feedback: acknowledge within 100ms; show progress past 400ms. One rule replaces the two thresholds.
  - Hick's Law seven-item cap applies to desktop rails only. Phone uses N4's 3–5 slots.
  - Tap targets: 44px for controls. WCAG's 24px floor is allowed only as a documented exception; the Mock B 32px chart pill is listed as one.
  - Control borders need 3:1 via a separate token. The `line` token is decorative.
  - Status tints need a dark-mode contrast check; the light tints fail on dark surfaces.
  - Phase 0 gate: explicit user waiver is allowed for prototypes and small changes.
  - Added the full Nielsen set (consistency, flexibility, help), forms, destructive actions, stale and offline data, text resilience, touch and hover equivalents, data visualization, review-mode severity format, and a manual theme toggle rule.
  - Pre-flight and definition of done merged into one checklist.
  - Mock B's dark token values are not duplicated in prose. The source of truth is `TradeDesk/src/mockb-tokens.css`.
- **Known open items:**
  - WagWise has no brand tokens yet; the profile says ask or propose styles.
  - Mock B's dark mode is still unverified by rendering.
  - The local working copy (`~/workspace/custom-skills/ux-design/`) is not reachable from this session, so it must be synced by hand from this folder.
- **Version:** v1.2.0 — core plus references, contradictions resolved, gaps filled, 2026-11-13.
- **Verification:** Structure only. Navigation text N1–N12 checked byte-identical to v1.1.0. `SKILL.md` frontmatter and `skill.yaml` parse. Referenced paths resolve (`TradeDesk/src/mockb-tokens.css`, `AppSprints/`). Control-border and status-tint contrast figures were computed from the token values in this skill's earlier version and the TradeDesk light and dark pairs. **Not verified:** the skill has not yet been used on a real product brief, and no rendered output was checked against the new rules. Treat the rules as unproven until the next UX review uses them.

## 2026-11-12 — v1.1.0: Navigation section replaced with N1–N12 decision

- **Request:** Run the navigation debate and update the skill file with the decision (Ankit, App Sprints chat, 2026-11-12).
- **What:** The Navigation section is now the twelve rules N1–N12 from the Nov 12 navigation debate, lifted verbatim, plus the critique subsection. README.md version bumped to v1.1.0. Local SKILL.md copied VERBATIM — no content edits.
- **Version:** v1.1.0 — Navigation section replaced with the N1–N12 decision from the Nov 12 navigation debate, dated 2026-11-12.
- **Verification:** SKILL.md verified byte-identical to the local file (sha256 605d7a04126af360f350573e506a96560c15da81ec7df0ce76b20ef5c655d9e8); GitHub copy returns HTTP 200.

## 2026-11-12 — v1.0.0: First versioned GitHub copy

- **Request:** Publish the ux-design skill to GitHub with version control (Ankit, App Sprints chat, 2026-11-12).
- **What:** Copied `SKILL.md` and `skill.yaml` VERBATIM from `~/workspace/custom-skills/ux-design/` into `ux-design-skill/` at the root of `apatel85/Dashboards`; added this `README.md` and `AGENTLOG.md`.
- **Version:** v1.0.0 — first versioned GitHub copy, dated 2026-11-12.
- **Standing rule:** GitHub is the main file for this skill; the local workspace copy is the working copy; every skill change gets pushed to GitHub.
- **Verification:** All four files verified loading on GitHub.
