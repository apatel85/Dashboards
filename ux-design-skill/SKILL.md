---
name: ux_design
description: Global UX and design standard for reviews, redesigns, clickable mockups and design decisions across all products. Use when the user asks for a UX review, redesign, mockup, layout, navigation, design tokens, accessibility check, or any design decision, and before building any app or website screen.
---

# UX Design

Use this skill whenever the user asks for a UX review, a redesign, a mockup, or a design decision. It is the global design standard for all design work, adopted from the user's Lead UX and Product Designer brief on 2026-11-11. It applies to every product.

Load the reference files when the work needs them:

- `references/navigation.md` — the N1–N12 navigation decision. Standing decision: apply as written, do not re-debate per product.
- `references/mock-b.md` — the Mock B baseline: portable structure, plus the TradeDesk instance values.
- `references/product-profiles.md` — personas, brand tokens, and content rules per product.

Precedence: the user's explicit instructions, then the product's existing system and conventions, then the defaults in this file.

## 1. App-create gate

- When the user asks to create an app or website, check first for a Phase 0 Research Receipt for it (App Sprints: `AppSprints/sprints/<name>/research-receipt.md`, or in the conversation).
- If none exists, do not start designing. Tell the user Phase 0 is missing and suggest the research sprint (intake app at `https://apatel85.github.io/Dashboards/AppSprints/`, or a brief in the App Sprints side chat).
- **Waiver:** the user may explicitly waive Phase 0 for a prototype or a small change. Record the waiver in the work's first message and continue.
- A redesign of an existing app with live data still gets a Phase 0 pass before the revamp build, unless waived.

## 2. Ground the design in the brief

- Extract the subject, audience, mood, and constraints from the brief before designing.
- Write the inferred direction as one line. State three settings up front: how varied the sections are, how much motion there is, and how dense the page is.
- Commit to one design system that fits the direction (editorial, Swiss grid, brutalist, soft rounded, dark technical, magazine collage) and execute it well. Do not mix systems.
- **Suggest styles before committing.** Name two or three popular styles that fit this app type, one line each on why it fits and one trade-off each. Recommend one and let the user pick, or accept "you pick". Starting points: a daily briefing or finance app leans editorial ledger; a pet-care or household app leans soft rounded with large touch targets; a coaching app leans bold, high-contrast, phone-first; a content or marketing site leans magazine collage or Swiss grid. Never present one style as the only option when the brief leaves style open.
- A choice the brief pins down is never replaced by a generic default.

## 3. Plan before building

- Two passes: draft a short plan (color tokens, typefaces, layout concept, principles, navigation map), then review it against the brief before writing code.
- Navigation comes first: write the destination map (N1) before any layout.
- If any part of the plan reads like the output you would produce for any similar prompt, revise it and say what changed and why.
- Spend boldness in one place. Keep everything around it quiet and cut decoration that does not serve the brief.
- After building, list the two or three laws that drove the key decisions, naming each decision and its law.

## 4. Named laws (apply as design rules)

- **Hick's Law:** at most five primary actions on one screen. Split complex setup into a wizard, tabs, or accordion. Keep *desktop* navigation rails to about seven items; phone navigation follows N4.
- **Fitts's Law:** primary actions sit in predictable zones (bottom third on a phone). Keep destructive actions large and far from their frequent non-destructive neighbors.
- **Miller's Law:** group related fields and links into chunks of three to five. Never show more than seven ungrouped items.
- **Jakob's Law:** match conventions users know (logo top left, search top right, familiar icons) unless the brief gives a stated reason to diverge.
- **Peak-End Rule:** put disproportionate craft into error states, empty states, and the final success moment.
- **Doherty Threshold:** acknowledge every action within 100ms (see feedback rule below).
- **Von Restorff Effect:** one high-contrast accent per screen for the primary action. If everything is emphasized, nothing is.
- **Paradox of Choice:** at most three parallel options, one clearly marked and preselected.
- **Postel's Law:** accept forgiving input. Strip spaces and dashes from phone and card numbers, trim whitespace, never show a raw error.
- **Tesler's Law:** absorb complexity with defaults and derived values. Never make the user configure raw technical identifiers.
- **Cognitive load budget:** every screen has exactly one job. Cut anything that does not serve it.

### Feedback timing (one rule)

- Acknowledge every action within **100ms** (visible press state, spinner, or optimistic update).
- If the result takes longer than **400ms**, show progress: a skeleton or a labelled spinner.
- Never leave the screen frozen with no signal.

## 5. Nielsen heuristics as build rules

1. **Visibility of system status:** acknowledge per the feedback timing rule above.
2. **Match between system and the real world:** use the user's own vocabulary, never database field names or internal jargon.
3. **User control and freedom:** every multi-step or destructive flow has a visible way out: cancel, back, or undo.
4. **Consistency and standards:** same concept, same component, same wording, same location. Never invent a second pattern for something that already has one. Follow platform conventions.
5. **Error prevention:** constrain bad input before submission with input types, masks, and disabled invalid options.
6. **Recognition rather than recall:** show available options; never make the user remember a code or value from earlier screens.
7. **Flexibility and efficiency of use:** offer shortcuts for frequent users (saved filters, keyboard shortcuts, recent items) without hiding the basic path.
8. **Aesthetic and minimalist design:** remove first and add reluctantly. Every element must earn its place.
9. **Help users recognize, diagnose, and recover from errors:** say what happened, why, and the specific next action, in plain language, never a bare error code.
10. **Help and documentation:** put short, contextual help beside the thing it explains. Searchable long-form help is optional and never a substitute for clear labels.

## 6. Understand the user first

- Name the user goals, the context they work in, and the friction points before proposing any visual change.
- Name personas in order of daily use and design for the most frequent first.
- On phone-first products: mobile first, one-thumb, primary actions in the bottom third, the daily job before theory.
- The non-technical user is a first-class persona. Pair every product term with a plain explanation on first use.

## 7. Design tokens and system

- Use a 4px and 8px spacing grid and a real type scale with one fixed ratio (1.25, 1.333, or 1.5). Never introduce arbitrary dimensions.
- Use one or two typefaces plus one monospace for data. Keep body copy at 45 to 75 characters per line.
- Use semantic color roles. Take brand tokens from the product profile; never invent a brand color.
- Keep semantic color (success, error, info) and brand color as separate systems so they never collide.
- **Control borders:** the `line` token used for dividers is decorative (about 1.5:1). Inputs, checkboxes, and buttons need a control border that meets **3:1** against its surface. Define a separate token for it.
- **Status pills:** text on a status tint must meet 4.5:1 in both themes. The light tints fail on dark surfaces. Use the dark tint values from the token source, and check them.
- Motion durations are tokens too: transitions 150–300ms, larger spatial moves up to 500ms.
- Never hardcode a color, spacing, or size that duplicates an existing token.
- The token source of truth for the Mock B system is `TradeDesk/src/mockb-tokens.css` in this repository.
- Never edit a live app. Design work lives in a demo replica. Check the product profile for which apps are read-only.

### Color scheme

- Switch light and dark only by `prefers-color-scheme`, unless the product profile or the user asks for a manual toggle.
- A manual toggle, when requested, must store the choice, default to the system setting, and be keyboard operable.
- Dark mode is never called verified until it has been rendered and checked.

## 8. Information architecture

- Detail every screen from macro structure down to micro components: containers, hierarchy, inputs, calls to action, status badges.
- Prefer group, expand, drill in. A landing that expands into detail beats a flat table.
- Keep create, edit, and publish in the same shared shell. Never give one object a different create or edit pattern.
- Keep configuration-time and runtime on separate surfaces.
- Let real content set the rhythm. Do not force a symmetric three-column card grid onto content that does not have three equal things to say.

## 9. Navigation

Follow `references/navigation.md` (N1–N12). Summary of the key checks:

- The destination map comes before any screen (N1).
- Destinations switch views; content scrolls within one destination (N2).
- Phone: bottom tab bar with 3–5 slots, a center action counting as one (N4, N11).
- Tablet and desktop: the same map as a labeled rail (N9).

## 10. Responsive layouts

Canonical breakpoints for every product, unless the product profile states otherwise:

- **Phone:** below 768px. Single column, bottom navigation.
- **Tablet:** 768–1023px. Two-column or split views where content fits; narrow labeled rail (N9).
- **Desktop:** 1024px and up. Full multi-column layout, full labeled rail.

Rules:

- Change the structure at each breakpoint, not just the scale. A layout that only stretches across widths is unfinished.
- Tables become cards below the width where their columns stop fitting.
- Keep the content identical across widths. Smaller screens collapse and disclose progressively; they never delete information.
- Sticky bars and floating actions reposition for their width. Never use a sticky top bar for primary actions.
- **Verify at 320, 390, 768, 1024, and 1280px** (and 1440px where a desktop max-width applies). No horizontal scrolling on the page body at any width. Verify by rendering, not by reading the CSS.
- Products with their own shipped breakpoints (for example Mock B's TradeDesk split) follow the product profile. Do not mix two breakpoint sets in one product.

## 11. Interaction and content states

- Every interactive element works by keyboard alone, with a visible focus state. Focus is never hidden behind a sticky bar (WCAG 2.2 "focus not obscured").
- Design empty, loading, and error states for everything that can load, be empty, or fail.
- Error copy says what happened, that nothing was lost, and what to try next.
- **Forms:** show the label above the input, validate on blur or submit (not on each keystroke), show the error beside the field and announce it, use the right input type and autocomplete, and keep the entered data after an error.
- **Destructive actions:** prefer undo when it is safe to reverse. Use a confirmation only when undo is impossible, and name the object and the consequence in the confirmation.
- **Stale and offline data:** show when data was last updated, and mark cached or outdated data plainly. Never show old numbers as current.
- **Text resilience:** test long names, very large numbers, and translated strings. Truncate with a way to see the full value, never by clipping silently.
- **Touch and hover:** every hover-only control has a tap or keyboard equivalent. Gestures such as swipe have a visible button alternative.
- **Data visualization:** chart type matches the question. Never use color as the only signal. Give every chart a text summary or a data table alternative.

## 12. Accessibility

- Tap targets: **44 by 44px** minimum for controls. WCAG 2.2 AA requires only 24px, so a smaller target is allowed only as a documented exception with spacing around it and no single-route function (the Mock B chart pill is one such exception).
- WCAG 2.2 AA contrast: state the ratio for text on its background. Never claim AAA without computing it. Boundaries that carry meaning need 3:1 (see control borders).
- Never use color as the only signal. Pair it with an icon, a label, or a shape.
- Specify the keyboard path for each screen: focus order, shortcuts, visible focus rings, Escape to go back.
- Every icon-only control has an `aria-label`. Every image has alt text.
- Every input has a programmatically associated label. Mark required fields in visible text.
- Never flash more than three times per second.
- Respect `prefers-reduced-motion`.
- Verify by doing: a keyboard-only pass, 200% and 400% browser zoom, and the 320px check.

## 13. Motion

- Use motion to show a state change or a spatial relationship, never as decoration.
- One orchestrated moment per page (one page-load sequence or one reveal), not scattered effects.
- No fade-and-slide-up entrances on every section. No hover scale on every card.
- Motion answers the user's action: opening, expanding, confirming.
- Desktop-only flourishes stay off phone-first screens.

## 14. Performance

- Core Web Vitals budget: LCP at or under 2.5s, INP at or under 200ms, CLS at or under 0.1.
- Reserve space for images and embeds with explicit dimensions or an aspect ratio. Never inject content above existing content after the first render.
- Do not hide the largest above-the-fold element behind a fetch that must resolve before anything paints.
- Ship less: split code by route, lazy-load below-the-fold content, serve images at the size the layout needs, and question any dependency a few lines of code could replace.

## 15. Plain language

- Write copy the least technical reader can follow. Split expert words from everyday words where a product has both audiences.
- A new term gets its plain meaning beside it the first time it appears.
- Buttons say what happens next, not "Submit" or "Continue" alone.
- Name things by what users understand, and keep the same name for the same action through the whole flow.
- Never write "redefined", "seamless", "powerful", "the future of", or "scalable".

## 16. Anti-slop

Avoid these defaults unless the brief asks for them:

- Centered hero with everything stacked in the middle.
- Three or four equal-width feature cards in a row.
- Identical section padding and rhythm throughout.
- Violet-to-pink-to-blue gradients, indigo as a default primary, glassmorphism without a brand reason.
- Inter alone with no variation; gradient-clipped headlines.
- Tracked-out all-caps eyebrows on every section; meta strings joined with middle dots; an arrow appended to every link.
- Emoji as icons. Use real SVG icons or custom marks.
- Warm cream with serif and terracotta; near-black with one acid accent; identical rounded cards with the same soft shadow.

## 17. Deliverables

Structure the design output in four sections:

1. Problem statement and user context.
2. Interaction flow and wireframe hierarchy, including the navigation map.
3. Component specs with copy and microcopy.
4. Accessibility, edge cases, and empty, error, and loading states.

Other rules:

- A clickable mockup is an interactive page with sample data that proves the product's real cases (for Quixera: the multi-sport case).
- Bracket every unconfirmed fact as a placeholder. Never present a guess as a decided value.
- Before delivery, check every demo claim against a source. Do not let an unconfirmed claim reach the user.
- Run a scored self-review: rank findings from blocking to polish, fix every blocking item, and list what remains open.

### Review mode (UX reviews)

When the user asks for a UX review of an existing product, report findings in this format:

- **Severity:** Blocking (users cannot complete a core job or fail an accessibility requirement), Major (users succeed with real friction), Minor (polish or consistency).
- **Each finding:** the screen and state, the rule or heuristic it breaks, the evidence (the rendered view, the measured value, or the steps), and one concrete fix.
- Order by severity. Then list what remains open and what was not checked.

## 18. When the user pushes back

- "Make it pop", "more modern", or "cooler" does not mean gradients or motion. Ask one specific question, such as which site they like, or whether the feel should be calm or loud.
- Or change one concrete lever: the type scale, the color, the density, or the asymmetry.
- Show the change and name what changed. Vague feedback becomes one visual decision, never more effects.

## 19. Pre-flight and definition of done

Run this checklist before delivery. Fix every "no" before shipping.

**Brief and plan**
- Phase 0 receipt exists, or is explicitly waived.
- Direction, three settings, and style options are stated.
- Navigation map exists (N1) and follows N1–N12.
- Each choice can be defended out loud with a reason.

**Visual**
- The hero is not centered without a brief reason.
- No three equal cards that should be broken, merged, or staggered.
- No gradient without a brand reason. Inter is not the only typeface.
- No emoji as icons. No all-caps eyebrow on every section.
- Sections do not all share the same height and padding.
- No hardcoded value duplicates an existing token.

**Responsive**
- Structure changes at each breakpoint, not just the scale.
- No horizontal scroll at 320, 390, 768, 1024, or 1280px.
- The same content is reachable at every width.

**Accessibility**
- Every control works by keyboard with a visible focus state, and is not hidden behind a sticky bar.
- Text contrast is stated and met. Control borders meet 3:1.
- Targets are 44px, or a documented exception.
- Color is never the only signal. Icon-only controls have labels.
- Reduced motion is respected.

**States and copy**
- Loading, empty, and error states exist for everything that loads, can be empty, or can fail.
- Feedback follows the 100ms and 400ms rule.
- Copy is plain, names the next action, and avoids banned words.
- Removing any single element would make the result worse.

**Verified by doing**
- The rendered page was looked at on a real screen, not only read back from source.
- Layout checked at the five widths above, at 200% and 400% zoom.
- Dark mode is marked unverified unless rendered.
- The user has confirmed the layout on their device before it is called done.

## 20. Sources and portability

- Adapted from Anthropic frontend-design, Taste Skill design-taste-frontend, 20-ui-ux-laws, overseek944 frontend-ui-ux-skill, Impeccable, and UI Verify. The user's brief and product profiles take precedence over all of them.
- Source repos: github.com/anthropics/skills, github.com/Leonxlnx/taste-skill, github.com/davepartner/20-ui-ux-laws, github.com/overseek944/frontend-ui-ux-skill, github.com/pbakaus/impeccable, uiverify.ai.
- This skill has no dependency on any particular connector. If a connector or a demo-claim check is needed, use whichever one the environment provides, and say so when it is missing.
