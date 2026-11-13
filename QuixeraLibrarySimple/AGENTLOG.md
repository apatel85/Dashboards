# AGENTLOG — QuixeraLibrarySimple
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Design-only mockup in a demo folder. The live Quixera app is read-only and is never touched.
- Colours and type come from the attached Program_Creation_V3 board (rail green #1D6B45, Figtree), because the user asked for "the same color theme". The ux-design-skill Quixera profile says #0D7C66 and DM Sans and calls #1D6B45 old. **Open: user to confirm which is current.**
- Vocabulary stays as in the board (skill area, skill family, sub-skill) so it matches Programs. Plain-language help sits beside the first use instead.

## 2026-11-13 — v0.1.0 — Simpler library creation mockup
- **Request:** use the UX skill to make a mockup app from the attached design. Too many steps and confusing for a non-technical user. Simplify and cut clicks.
- **Note on the brief:** the attachment is named "Program_Creation" but its 88 screens are the **Library** creation flow (start pop-up, 4 wizard steps, side drawer, access, suggestions, age-group settings). The mockup covers that flow. Programs themselves are not mocked.
- **Change:** `index.html`, one self-contained file, sample data only.
  - Create is one page with three preselected choices (sport, how to start, name). Ready-made start is recommended.
  - Build is one editor: type a name and press Enter to add a skill area, skill family or sub-skill. Drills, homework and age/level tags are optional and live in a drawer.
  - Publish is always visible, says in plain words what is missing, and opens a check with non-blocking warnings.
  - Edit uses the same editor. Published libraries are edited as a copy; the publish check lists changes and the programs that will be asked to update.
  - Removing anything gives Undo; there is no Save draft or Next/Back.
- **Navigation map (N1):** Library list (weekly) → Create (once per sport) → Editor (weekly) → Published. Phone: bottom tabs Home, Schedule, Academy, Inbox, More. Tablet: narrow labelled rail. Desktop: full rail as in the board. Task screens hide the phone tab bar and show a sticky Publish bar.
- **Version:** v0.1.0.
- **Verified (by driving it in Chromium):** no console errors; ready-made path = 4 clicks and no typing; empty path = 5 clicks plus typing three names; edit path (drawer, validation, drill add/undo, tag chips, publish check with 5 programs, v4 to v5) passes; Esc closes overlays and focus returns; focus is trapped in dialogs; no horizontal scroll at 320, 390, 768, 1024, 1280 in light and dark; every visible control is at least 44px. Contrast figures were computed from the token values (text 4.5:1 or more, control borders 3:1 or more, both themes).
- **Not verified:** the "about 12 clicks before" figure is counted from the attached screens, not measured in the live app. Not tested on a real phone. Not tested with a screen reader. 200% and 400% zoom not checked. Phase 0 research receipt does not exist for this work; treated as a prototype and **the waiver is not yet confirmed by the user**.
- **Open decisions for the user:**
  - Age and level tags are two multi-select chip rows. In the board a tag is an exact pair (e.g. "U9 · White"). Chips mean "any of these ages and any of these levels". Confirm that is acceptable.
  - Not built: Suggestions, Library settings (age groups, skill levels), drag to reorder, drill video/image upload, assessments, loading and error states for save and publish. Buttons for the first two show a "not part of this mockup" message.
  - The board's nav has 10 top-level items on desktop. Kept as is; the skill's rail cap is about seven.
