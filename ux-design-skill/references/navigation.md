# Navigation (choosing how people move)

Decided by the navigation debate (Nov 12, 2026) — a synthesis of the five leaders' published frameworks, not recorded quotes. These twelve rules are a standing decision: carry them as written, do not re-debate them per product. Navigation is decided before layout and style — a style applied to an unmapped app produces a beautiful corridor.

- **N1 — Map before screens.** Before any layout work, write the destination map: every destination, named, grouped, with its expected frequency (daily / weekly / occasional). No map, no mockup.
- **N2 — Destinations switch; content scrolls.** Moving between destinations is a view switch — instant, fixed position, current destination visibly marked. Scrolling is only for one continuous read inside a destination. Never ship multiple destinations as one long scroll with collapsed sections.
- **N3 — One tap to any primary.** From anywhere in the app, every primary destination is exactly one tap away, from a persistent navigation surface that never scrolls out of view.
- **N4 — Phone: bottom tab bar, 3–5 slots.** Primary phone navigation is a persistent bottom tab bar (thumb zone). Three to five slots total — and a center core action, if present, counts as one of the five.
- **N5 — Primaries are earned by frequency.** Bar slots go to the destinations used most often, counted from the job — not by feature importance or stakeholder seniority. If six destinations claim daily use, fix the map (merge or split jobs), don't widen the bar.
- **N6 — More is an index, not a drawer of leftovers.** Overflow goes in a grouped, labeled More index whose groups users can predict. Everything in More is reachable in ≤2 taps from anywhere. A daily-used destination found living in More is a defect: promote it, demote the least-used primary.
- **N7 — No primary hides behind a hamburger.** Drawers and hamburger menus hold account, settings, and app-level material only. Any destination used weekly gets a visible door.
- **N8 — Top tabs are for peer views of one thing.** Top tabs (2–5) switch views of the same object — Days/Weeks/Months, Quotes/Chart/News. They never carry primary jobs and never compete with the main navigation.
- **N9 — Tablet and desktop: the rail is the same map, drawn bigger.** Tablet gets a narrow labeled rail; desktop a full left rail, icon + label, all destinations visible — More dissolves because everything fits. Same names, same order, same grouping at every size.
- **N10 — Name tabs by the job, in the user's words.** Labels are the words users would say out loud asking for the destination. Icon + label together on primaries; never icon-only, never internal jargon or brand names. Test: a first-time user predicts at least 4 of 5 bar destinations before tapping.
- **N11 — At most one core action in the bar.** Only an app whose dominant verb is performed many times a day (logging, scanning, timing) may place it as a distinct center action. It must look like an action, complete or open-and-return, and leave the user where they were. Reading apps get none.
- **N12 — State and stability are part of navigation.** Each destination keeps its own scroll and state; re-tapping the current destination returns it to the top. Bar order and labels are stable across sessions and versions — changes are deliberate redesigns, never silent updates. Verify with the 10-second test: a user can name where they are, and reach any primary in one tap, on phone, tablet, and desktop.

## Where the bar stops and the rail starts

- Phone (below 768px): bottom tab bar, N4.
- Tablet (768–1023px): narrow labeled rail, N9.
- Desktop (1024px and up): full labeled left rail, N9.
- A product that applies a different split for its own shipped layout (see `mock-b.md`) must still follow N1–N12 for names, order, and grouping.
