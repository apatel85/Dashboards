# Mock B baseline

Mock B (TradeDesk revamp, Nov 12, 2026) is the standing baseline for how designs are built. Its structure is portable; its values are a TradeDesk instance. The style may change per brief — the editorial-ledger look is one style, not the system.

The source of truth for every token value is `TradeDesk/src/mockb-tokens.css` in this repository. Read that file rather than copying hex values from here. This document lists roles, not values, except where a value is needed to explain a rule.

## Portable structure (keep unless the brief gives a stated reason)

- **Type: three roles, never one family.**
  - Display serif for headings and verdicts (Newsreader 600/700 in Mock B; an equivalent serif may be swapped in).
  - Body sans for copy, section heads and tabs (Libre Franklin 400–800 in Mock B; an equivalent clean sans may be swapped in).
  - Data mono for tickers, scores and ranks, with tabular numerals (IBM Plex Mono 500–700 in Mock B).
  - Swap a family for an equivalent; never collapse to a single family, never Inter alone, and no in-product font picker.
- **Sizes are fixed px, reflowed by layout, not scaled.** Headings, body size and shell padding do not scale with width. What changes is the layout at each breakpoint.
- **Radii:** three steps (6, 10, 14px) plus a full pill radius (999px) for chips and status items.
- **Motion:** one duration token (200ms ease in Mock B).
- **Pill system.** Every chip, count, status, role, mood and jump-link is a pill (999px radius), one component per concept.
- **Index rows.** Numbered rows with a mono index, title and subtitle, count pill, and a chevron that rotates when open.
- **Collapsed by default.** Every card starts collapsed. Opening animates a short rise (200ms in Mock B) and flips `aria-expanded`. `prefers-reduced-motion` disables it.
- **Sticky chrome.** A sticky side rail on desktop; a sticky bottom action on phone. Never a sticky top bar. The rail is sticky only at desktop widths; below that it stacks in normal flow.
- **Color.** Full light and dark token sets, switched by `prefers-color-scheme` (see the color section of `SKILL.md` for the override rule). Semantic roles: background, panel, ink, muted, faint, line, up, down, info, signal, focus, and a dark "desk" block for the sticky bottom call and the mood card.

## Breakpoint note

Mock B shipped with TradeDesk's own split at 920px (rail at 920px and up; bottom call at 919px and below), with tabs changing at 560px and stats at 430px. These are TradeDesk instance values. For any other product, use the generic breakpoints in `SKILL.md` (768 and 1024). Do not mix the two in one product.

## TradeDesk instance values (do not carry into other products)

- Shell max-width 1140px, padding 24px 20px 40px.
- Score and chart pill hidden at 640px and below.
- Tabs three per row at 560px and below.
- Earnings grid collapses at 760px and below.
- Stats stack at 430px and below.
- Key-value grid four columns and fundamentals grid three columns at desktop.
- Sticky bottom call: fixed, 10px inset plus safe-area, body bottom padding 84px to clear it, amber button.
- Idea rows: rank badge, mono ticker and price, risk box, 58px score block.
- The 32px chart pill is the one control under the 44px target rule. It is a deliberate exception: it has 8px spacing around it and is never the only route to a function.

## How it was built

One style block, a single self-contained file, tokens as CSS variables, layout from the receipt's screen map, verified by rendering. Dark tokens in the TradeDesk file are from source only; no dark-mode screenshot has been verified.
