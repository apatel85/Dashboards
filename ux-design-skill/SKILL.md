# UX Design

Use this skill whenever the user asks for a UX review, a redesign, a mockup, or a design decision. It is the global design standard for all design work in this chat, adopted from the user's Lead UX and Product Designer brief on 2026-11-11 with product-specific profiles at the end and rules borrowed from the best public design skills. It applies to every product, not just Quixera.

## App-create gate

- Whenever the user asks to create an app or website, in any chat, check first whether a Phase 0 Research Receipt exists for it — in App Sprints (Dashboards/AppSprints/sprints/<name>/research-receipt.md) or in the conversation.
- If no Receipt exists, do not start designing. Tell the user plainly that Phase 0 is missing and suggest running the research sprint first (intake app at https://apatel85.github.io/Dashboards/AppSprints/ or paste a brief in the App Sprints side chat).
- Never silently skip Phase 0 for a new app. A redesign of an existing app with live data still gets a Phase 0 pass before the revamp build.

## Ground the design in the brief

- Extract the subject, the audience, the mood, and the constraints from the brief before you design anything.

- Write the inferred direction as one line before you start, and state three settings up front: how varied the sections are, how much motion there is, and how dense the page is.

- Commit to one design system that fits the direction, such as editorial, Swiss grid, brutalist, soft rounded, dark technical, or magazine collage, and execute that one well instead of mixing systems.

- **Suggest popular styles for the app type before committing.** Name two or three popular styles that fit this kind of app or website, one line each on why it fits and one trade-off each, then recommend one and let the user pick (or say "you pick"). Starting points, not a fixed menu: a daily briefing or finance app → editorial ledger (Mock B); a pet-care or household app → soft rounded, warm, large touch targets; a coaching app → bold, high-contrast, phone-first; a content or marketing site → magazine collage or Swiss grid. Never present a single style as the only option when the brief leaves style open, and never default to the same style for every app.

- Follow this precedence order: the user's explicit instructions first, then the project's existing system and conventions, then the defaults in this skill.

- Never let a generic default win over a choice the brief pins down, and never spend a free choice on a look you would produce for any brief.

## Plan before building

- Work in two passes: draft a short plan with color tokens, typefaces, layout concept, and principles, then review that plan against the brief before you write any code.

- If any part of the plan reads like the generic output you would produce for a similar prompt, revise that part and say what you changed and why.

- Spend your boldness in one place, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief.

- After building, list the two or three laws that drove your key decisions, naming the decision and the law behind it.

- Critique your own work as you build, and inspect the built artifact rendered on a real screen before you call it done.

## Named laws

- Keep at most five primary actions on one screen and split complex setup into a wizard, tabs, or accordion (Hick's Law).

- Keep primary navigation within about seven items and use progressive disclosure instead of showing every option up front (Hick's Law).

- Place primary actions in predictable zones, such as the bottom third on a phone, and keep destructive actions large and far from their frequent non-destructive neighbors (Fitts's Law).

- Group related fields and links into chunks of three to five with clear visual separation, and never show more than seven ungrouped items (Miller's Law).

- Match the conventions users already know from other products, such as logo top left, search top right, and familiar icons, unless the brief gives a stated reason to diverge (Jakob's Law).

- Put disproportionate craft into error states, empty states, and the final success moment, because people judge an experience by its peak and its ending (Peak-End Rule).

- Show feedback within 400 milliseconds of any action, using optimistic updates, spinners, or skeletons, and never leave the screen frozen with no signal (Doherty Threshold).

- Make the primary action visually distinct with a single high-contrast accent, and if everything is emphasized nothing is (Von Restorff Effect).

- Present at most three primary options in parallel, such as pricing tiers, with one clearly marked and preselected default (Paradox of Choice).

- Accept forgiving input, strip spaces and dashes from phone and card numbers, trim whitespace, and never show a raw error to the user (Postel's Law).

- Absorb complexity yourself with sensible defaults and derived values, and never force the user to configure raw technical identifiers (Tesler's Law).

- Give every screen exactly one job and cut anything that does not serve it (cognitive load budgeting).

## Nielsen heuristics as build rules

- Give every action visible feedback within about 100 milliseconds, even if the real result takes longer, because silence reads as broken (visibility of system status).

- Use the user's own vocabulary in labels, never database field names or internal jargon (match between system and the real world).

- Give every multi-step or destructive flow a visible way out, such as cancel, back, or undo (user control and freedom).

- Constrain bad input before submission with input types, masks, and disabled invalid options instead of only validating after (error prevention).

- Show the available options instead of making the user remember a code or value from three screens back (recognition rather than recall).

- Remove first and add reluctantly, since every element on screen must earn its place (aesthetic and minimalist design).

- Write error messages that state what happened, why, and the specific next action, in plain language and never as a bare error code (help users recognize, diagnose, and recover from errors).

## Understand the user first

- Name the user goals, the context they work in, and the friction points before proposing any visual change.

- Name the personas for the product in order of daily use, and design for the most frequent user first. For the persona order of each product, see the product profiles.

- On phone-first products, screens are mobile first and one-thumb: big tap targets, primary actions in the bottom third, and the daily job before theory.

- Treat the non-technical user as a first-class persona. Never assume they know product jargon. Pair every product term with a plain explanation on first use.

- Apply Nielsen Norman Group heuristics to every proposal and name the heuristic when a choice rests on one.

## Design tokens and system

- Use a 4px and 8px spacing grid and a real type scale with one fixed ratio, such as 1.25, 1.333, or 1.5, and never introduce arbitrary dimensions.

- Use one or two typefaces plus one monospace for data, chosen for the product's character, and keep body copy near 45 to 75 characters per line.

- Use semantic color roles. Take brand tokens from the product profile and never invent a brand color.

- Keep semantic color and brand color as two separate systems that never collide, so a success green next to a brand green never reads as a bug.

- Keep motion durations as tokens too, with typical transitions at 150 to 300 milliseconds and larger spatial moves up to 500 milliseconds.

- Reuse one component for one concept everywhere. Same concept, same component. Never invent a second pattern for something that already has one.

- Never touch a live app. Design work lives in a demo replica only.

## Mock B baseline (the default design system)

Mock B (TradeDesk revamp, Nov 12, 2026) is the standing baseline for how designs are built. The style may change per brief — the newspaper/editorial-ledger look is one style, not the system — but the structure below stays unless the brief gives a stated reason to depart from it.

- **Type: three roles, never one family.** Display serif (Newsreader 600/700 in Mock B; an equivalent serif may be swapped in): H1 34px/700, detail H2 28px/700, mood verdict 23px/600, summary 21px/600. Body sans (Libre Franklin 400–800; an equivalent clean sans may be swapped in): body 15px/1.5, section H2 19px/800, tabs 14px/700, body copy 13.5px. Data mono (IBM Plex Mono 500–700, tabular-nums): tickers 19px/700, scores 21px/700, ranks and labels 11–12px. The "multiple options" are the three-role system itself — swap a family for an equivalent, never collapse to a single family, never Inter alone, and no in-product font picker.
- **Spacing: fixed px, reflowed by breakpoint, never scaled.** Radii 6/10/14px; motion 200ms ease; shell max-width 1140px, padding 24px 20px 40px — these do not change across widths. H1 34px, body 15px, shell padding, and section-head margins do not scale either. What changes with the device is the layout, at breakpoints 430/560/640/720/760/919/920px: score and Chart pill hidden at 640px and below, tabs 3-per-row at 560px and below, earnings grid collapses at 760px and below, stats stack at 430px and below. Tap targets: 44px minimum everywhere (48px for tabs and primary buttons; the 32px chart-pill is the one exception).
- **Layout map (from the Receipt's screen map, breakpoint-derived — verify by rendering at 360, 768, and 1024px before treating as confirmed).** Below 920px: single column. Phone (360px): one column, 3-per-row tabs, score and Chart pill hidden, sticky bottom bar visible. Tablet (768px): still single column, bottom bar visible, full 6-column earnings grid, ledger as a real table. Desktop (1024px and up): two-column grid, 348px sticky rail (top 20px) + fluid main column, gap 28px, no bottom bar; key-value grid 4 columns, fundamentals grid 3 columns.
- **Sticky chrome: rail on desktop, bottom call on phone, never a sticky top bar.** The rail is sticky only at 920px and above; below that the same content stacks in normal flow. The sticky bottom call exists only at 919px and below: fixed, 10px inset plus safe-area, body padding-bottom 84px to clear it, dark desk background, amber button.
- **Components (bubbles and rows).** Every pill is radius 999px: pill, chip, chart-pill, count-pill, status-pill, role-pill, mood-pill, jump-link. Numbered index rows: mono 01/02… index number, title plus subtitle, count pill, chevron that rotates 180° when open. Idea rows: rank badge, mono ticker and price, risk box on the down background, 58px score block (number plus bar plus SCORE label). Every card starts collapsed; opening animates a 200ms rise and flips aria-expanded; prefers-reduced-motion disables animation.
- **Color: full light and dark token sets, switch by prefers-color-scheme only.** Light: bg #edf0f3, panel #ffffff, panel-2 #f2f5f8, panel-3 #e9edf2, ink #0f1620, muted #44546a, faint #5b6c82, line #ccd4de, line-soft #dde3ea, up #0b7a4a / up-bg #e2f3ea, down #bc3524 / down-bg #fbe9e5, info #1c5cb4 / info-bg #e4edfa, signal #f2a71b, signal-ink #211300, signal-soft #fdf0d3, desk #10161f, desk-ink #eef3f9, desk-muted #b3c0d1, desk-line #2c3949, focus #1c5cb4. Dark: bg #080b0f, panel #10161f, panel-2 #151e2a, panel-3 #0b1119, ink #e9eef5, muted #a7b4c6, faint #8798ad, line #2a3646, line-soft #1e2938, up #3ed08d, down #ff7d68, info #7db1ff, desk #131c28, focus #7db1ff (signal, desk-ink, desk-muted, desk-line not redefined in dark). The dark desk block is used for both the mood card and the sticky bottom bar in both themes. Dark tokens are from source only — no dark-mode screenshot was verified.
- **How it was built:** one style block, single self-contained file, tokens as CSS variables, layout from the Receipt's screen map, verified by rendering at 390px and 1440px with zero horizontal overflow. The CSS is the spec — there is no separate design document.

## Information architecture

- Detail every screen from macro structure down to micro components: containers, layout hierarchy, inputs, calls to action, status badges.

- Prefer the pattern the user already knows: group, expand, drill in. A landing that expands into a detail page beats a flat table.

- Keep create, edit, and publish in the same shared shells the rest of the product uses. Never give one object a different create or edit pattern.

- Keep configuration-time and runtime on separate surfaces. Coaches suggest from a session, they never edit the library from one.

- Let real content set the rhythm and resist a symmetric three-column card grid when the content does not have three equal things to say.

## Navigation (choosing how people move)

The leaders' debate covered evidence, heuristics, simplicity, mobile-first, and research — it did not structure navigation. This section closes that gap. Navigation is decided before layout, not after.

- **Decide navigation before layout.** Count the destinations, rank them by frequency, then pick the pattern. Never let a page grow into a long scroll of sections and call the scroll the navigation.
- **One tap to any primary destination.** The daily job's destinations are always visible and one tap away. No primary destination hides behind a scroll, a menu, or a second tap.
- **Bottom tab bar on phone (up to 5 primaries + More).** Phone-first apps with multiple sections get a persistent bottom tab bar: at most five primary destinations, thumb-reachable, with a visible active state. Everything else goes under More (a sheet or list), reachable in two taps at most. Never more than five tabs; never a scrolling tab strip on phone.
- **Rail on desktop, tabs on phone — same destinations.** At 1024px and up the rail (Mock B baseline: 348px sticky) lists the destinations; on phone the same destinations live in the bottom bar + More. Same content, same destinations at every width — the pattern changes, the map doesn't.
- **Top tabs only for a small set of peer views.** Top tabs fit 2–5 sibling views of one thing (e.g., day/week/month). They are not the app's main navigation when there are more than five destinations.
- **Drawers hide; don't hide the daily job.** A hamburger/drawer is for secondary and settings destinations only. If the user needs it daily, it is a tab, not a drawer item.
- **Name tabs by the job, not the data.** "Timeline" and "Meds" beat "Records" and "Data". The active tab is always visibly marked (not by color alone).
- **Switching views replaces the scroll.** Tapping a tab switches the main view; it never jumps the user down a long page. A long page with collapsed sections is a workbench, not navigation — give the workbench tabs (or a rail) too.
- **Deep-link every destination.** Every tab and More item is a real destination the user can return to; back goes to the previous destination, never to the top of a long page.
- **A core action may sit in the bar.** When one action is the job itself (log it, capture it, check in), it gets a prominent button in the bottom bar so it is one tap from any tab — never buried on one screen.

## Responsive layouts

- Every design must work on phone, tablet, and desktop — and the layout itself must change with the screen, not just shrink. A design that looks right on one width and merely stretches to the others is unfinished.

- Define the breakpoints up front, in the plan, and design each one: phone below 768px, tablet 768–1023px, desktop 1024px and up. Name what changes at each step — what stacks, what sits side by side, what moves, what hides behind progressive disclosure.

- Change the structure per width, not just the scale: single-column stack on a phone; two-column or split views on a tablet; full multi-column, sidebar, or side-rail layouts on desktop. Tables become cards below the width where their columns stop fitting. Bottom navigation on a phone becomes side navigation on desktop. Sticky bars and floating actions reposition for the width they are on.

- Keep the content identical across widths. A smaller screen shows less at once through collapsing and progressive disclosure — never by deleting information the wider layout shows.

- Tap targets stay at least 44 by 44 pixels at every width, and text stays readable without pinching or zooming.

- Verify by doing, not by reasoning: check the layout at 320px, 390px, 768px, 1024px, and 1280px, with no horizontal scrolling on the page body at any of them. A layout that only fits the width it was drawn at fails the check.

## Anti-slop

- Never ship a centered hero with everything stacked in the middle, three or four equal-width feature cards in a row, or identical section padding and rhythm throughout.

- Never use a violet to pink to blue gradient, indigo as a default primary, or glassmorphism over a blurry blob without a brand reason.

- Never use Inter alone with no variation, gradient-clipped headlines, or an uppercase tracking-widest eyebrow on every section.

- Never use emoji as icons. Use real SVG icons or custom marks.

- Never use a warm cream background with a serif display and a terracotta accent, a near-black background with one acid accent, or the SaaS card kit of identical rounded cards with the same soft shadow, unless the brief asks for that exact look.

- Never use template chrome that appears whatever the subject, such as a tracked-out all-caps label above every heading, meta strings joined with middle dots, labels built as one word plus a spaced dash plus a fragment, or an arrow appended to every link.

- Never write copy that says the future of something, or strings empty adjectives such as powerful, seamless, and scalable.

### Pre-flight check

- Did I center the hero when the brief never asked for a centered hero.

- Are there three equal cards that should be broken, merged, or staggered.

- Is there a gradient with no brand reason behind it.

- Is Inter the only typeface with nothing to break it up.

- Did I use emoji as icons anywhere.

- Is every section the same height and padding.

- Are there all-caps eyebrows on every section.

- Does the copy say redefined, seamless, or powerful.

- Is there a fade-in-up on things that do not need it.

- Does the layout change with the screen, or is it one layout stretched across widths.

- Did I drift from the Mock B baseline — three-role type, pill system, collapsed-by-default cards, sticky rail on desktop, sticky bottom call on phone — without a brief reason.

- Did I offer style options for the app type, or default to one look without asking.

- Is every section reachable by tab in one or two taps, or must the user scroll to find it.

- Fix every yes above, then ship.

## Motion

- Use motion to communicate a state change or a spatial relationship, never as decoration.

- Keep to one orchestrated moment per page, such as one page-load sequence or one reveal, instead of scattered effects on every section.

- Never put a fade-and-slide-up entrance on every section or a hover scale on every card.

- Make motion answer the user's action, such as opening, expanding, or confirming, so it shows what changed.

- Respect prefers-reduced-motion and keep desktop-only flourishes off phone-first screens.

## Accessibility

- Give every interactive element a minimum tap target of 44 by 44 pixels.

- Meet WCAG 2.2 AA contrast. State the ratio for text on its background and never claim AAA without computing it.

- Never use color as the only signal. Pair it with an icon, a label, or a shape.

- Specify the keyboard path for every screen: focus order, shortcuts, visible focus rings, and Escape to go back.

- Give every icon-only control an aria-label and every image an alt text.

- Design every empty, loading, and error state. Error copy says what happened, that nothing was lost, and what to try next.

- Give every input a real programmatically associated label, announce errors instead of conveying them by color alone, and mark required fields in visible text.

- Never let anything flash more than three times per second.

- Verify by doing, not by reasoning: run a keyboard-only pass, test at 200 percent and 400 percent browser zoom, and check the layout holds at 320 pixels wide without horizontal scrolling on the page body.

## Performance

- Hold Core Web Vitals as the budget: largest contentful paint at or under 2.5 seconds, interaction to next paint at or under 200 milliseconds, and cumulative layout shift at or under 0.1.

- Reserve space for images and embeds with explicit dimensions or an aspect ratio before they load, and never inject content above existing content after the first render.

- Prioritize the largest above-the-fold element and do not hide it behind a fetch that must resolve before anything paints.

- Ship less: split code by route, lazy-load below-the-fold content, serve images at the size the layout needs, and question any dependency that a few lines of code could replace.

## Plain language

- Write copy the least technical reader can follow. Split expert words from everyday words where a product has both audiences.

- Never ship a bare jargon label. A new term gets its plain meaning beside it the first time it appears.

- Keep microcopy short and specific. A button says what happens next, not "Submit" or "Continue" alone.

- Write from the end user's perspective and name things by what users understand, keeping the same name for the same action through the whole flow.

## Deliverables

- Structure design output in four sections: problem statement and user context, interaction flow and wireframe hierarchy, component specs with copy and microcopy, accessibility and edge cases with empty, error, and loading states.

- When the deliverable is a clickable mockup, build it as an interactive page the user can click through, with sample data that proves the product's real cases.

- Bracket every unconfirmed fact as a placeholder. Never present a guess as a decided value.

- For demo copy, run the demo claim audit skill before delivery so no unconfirmed claim reaches the user.

- Run a scored self-review before delivery: rank findings from blocking to polish, fix every blocking item, and list what remains open.

### Definition of done

- Every interactive element works by keyboard alone with a visible focus state.

- Every text pairing meets contrast, and every meaningful boundary meets 3 to 1.

- The layout holds at 320 pixels wide and at 400 percent zoom without horizontal scrolling on the page body.

- The layout adapts at phone, tablet, and desktop widths — structure changes at each breakpoint, checked at 390, 768, and 1280 pixels — and the same content is reachable at every width.

- Loading, empty, and error states exist for everything that can load, be empty, or fail.

- Removing any single element on screen would make the result worse.

- No hardcoded color, spacing, or size duplicates a token that already exists.

- Every visual choice can be defended out loud with a reason.

- You have actually looked at the rendered page yourself, not just read the source back.

- Verify on the user's device before calling a design done. Never declare a layout fixed until the user confirms it on their phone or tablet.

## When the user pushes back

- If the user says make it pop, more modern, or cooler, do not reach for gradients and motion.

- Ask one specific question, such as which site they like or whether it should feel calm or loud, or change one concrete lever such as the type scale, the color, the density, or the asymmetry.

- Show the change and name what you changed. Vague feedback becomes one concrete visual decision, never more effects.

## Product profiles

### Quixera

- Personas in order are the pitch-side coach on a phone, the non-technical admin, and the parent.

- Coach screens are mobile first and one-thumb with primary actions in the bottom third and drills before theory.

- Brand primary is #0D7C66 with DM Sans. Never use the old #1D6B45.

- Plain language is tied to the product glossary, coach content uses coaching points, and family content uses one "I can" sentence.

- Sample data proves the multi-sport case, not cricket only.

- Design work lives in a demo replica only and never touches the live app.

### KRCA

- Brand is KKR purple #1c0837 and gold #e6c22d.

- The audience is US South Asian diaspora parents and expats.

- Visuals are photoreal fictional youth players in US settings.

- Never use photos of real identifiable children in public posts.

- The call to action is a free trial class.

### TradeDesk

- Research and education only, never financial advice.

- The reader has no finance background, so every term gets a plain-English definition and the verdict comes first.

- Baseline is the Mock B system in this skill; the editorial-ledger style may vary per brief, but the three-role type, pill system, collapsed-by-default cards, and breakpoint-gated layout stay.

### WagWise

- Household dog-care app.

- Guidance is compact action items with countdown-style windows from actual and historical data.

- Trends come from entered data only.

## Sources

- Rules here are adapted from Anthropic frontend-design, Taste Skill design-taste-frontend, 20-ui-ux-laws, overseek944 frontend-ui-ux-skill, Impeccable, and UI Verify, with the user's own Nov 11 brief and Quixera additions taking precedence over all of them.

- Source repos: github.com/anthropics/skills, github.com/Leonxlnx/taste-skill, github.com/davepartner/20-ui-ux-laws, github.com/overseek944/frontend-ui-ux-skill, github.com/pbakaus/impeccable, and uiverify.ai.

## Available connectors

- Use `muse.connector_search` to find other connectors and `muse.skill_search` to find related skills.

- If nothing here fits, look on the web for a maintained API or MCP server and set it up with [Custom Connectors and MCPs](/opt/muse/skills/custom-connector-setup/SKILL.md), or build a custom connector.
