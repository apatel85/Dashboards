# AGENTLOG — SavedReels

## 2026-11-24 — v1.1.0 — SavedReels: repo audit applied — Potential fake tab, limitations stated

- **User request:** apply the Nov 24 repo audit (45 items) to the live
  dashboard — move FAKE/UNCERTAIN repos out of the main tabs, state the
  limitation on every LEGIT_LIMITED card, re-derive all counts.
- **What changed:**
  - `index.html` — new "Potential fake" tab with all 5 moved repos
    (OmniRoute, Claude Ads, Deft, AutoHedge, Jev AI / TypeSafe AI), each with
    the naming Reel(s), the Reel's claim, why it is fake/uncertain, and what
    would confirm it. The OmniRoute caution card was removed from the main
    view (its content moved to the fake tab). The AI category summary, the
    "Also in your saves" list, and the Finance strategy #09 / AI verdict #2
    cards now state the TradingAgents rebuilt-CLI limitation; verdict #1 now
    says Karpathy Skills is by multica-ai, not Karpathy; verdict #3 no longer
    calls the cybersecurity skills Anthropic's. Tab counts are computed live
    from the data as well as hardcoded.
  - `data/reels.json` — 3 concepts flagged `"audit": "potential-fake"`
    (omniroute, deft-team-skills, jev-ai); the 10-repo card no longer names
    or links AutoHedge / Claude Ads; 23 cards carry an `audit_note`
    (16 kept-repo limitations + 7 "repo not verified" notes). No Reel
    deleted — still 99 permalinks in `data/reels.json` / `data/seen.json`.
  - `repo-audit.md` + `data/repo-audit.json` — the audit itself, now also
    published in the repo so the verdicts are checkable.
  - `README.md` — counts + new Repo audit section.
  - Counts re-derived from the edited data: All 82, AI 40, Finance 15,
    What's New 17, Consolidated 7, Potential fake 5; 99 distinct Reels,
    85 concepts, 14 merged.
- **Verification status:** embedded JSON verified identical to
  `data/reels.json`; HTML parsed with no unclosed tags; page JS passes
  `node --check`; the page's own filter logic was executed in Node against
  the shipped data — tab counts 82/40/15/17/7/5, and searching OmniRoute,
  AutoHedge, Deft, Jev, or Claude Ads returns 0 in the main tabs and 1 in
  Potential fake. GitHub contents + SHAs read back after push; live URL
  fetched (see commit message / parent report for status). Phone check by
  Ankit is the final gate — layout at 390px not verified on a real device.


## 2026-11-24 — v1.0.0 — SavedReels: Facebook saved reels dashboard, consolidated + What's New

- **User request:** build and push the SavedReels GitHub Pages app from the
  Facebook saved-Reels export (99 unique Reels, Sep 28 – Nov 23, 2026).
- **What changed (new app, first release):**
  - `index.html` — static Mock B dashboard (Newsreader / Libre Franklin /
    IBM Plex Mono, #edf0f3, 1140px shell, pills, collapsed cards), tabs All /
    AI / Finance / What's New / Consolidated, search + category filter, no
    external JS. Embeds the data and keeps `data/reels.json` as the source.
  - `data/reels.json` — 85 consolidated concept entries; every one
    of the 99 Reel permalinks preserved inside its concept's `reels`
    array, with first/last seen dates, creator, summary, and repo/strategy
    links where relevant.
  - `data/seen.json` — dedupe registry: permalink → first_seen_date +
    concept_key (99 entries).
  - `README.md` — concept_key rule, categories, What's New definition,
    refresh date, data sources, privacy note.
  - Content carried over from the v1 dashboard: 8 per-category summaries,
    13 Finance strategies, AI repo verdict (Karpathy #1, TradingAgents #2,
    Browser Use #3, Find Skills #4, OmniRoute caution) plus the adopted-setup
    note (Karpathy → Hallmark → Cloudflare security-audit gate).
  - Consolidation: 14 repeat saves merged into 8 multi-save
    concepts (tradingagents x5, rea x4, omniroute x3, oracle-free-cloud,
    harvey, gex-orderflow, dont-forecast, kushal-lodha x2 each).
  - What's New: 19 Reels saved Nov 17–23, 2026 across
    19 concepts.
  - Categories re-derived from caption/transcript text (rough keyword labels
    not reused as final): AI 50, Finance
    21, Pets & Simba 7,
    Education & Math 6, Wellness
    2, Lifestyle 2,
    Design & Web 4, Other 7.
- **Verification status:** counts re-derived from `categorized.json` and
  cross-checked (99 ids + saved dates match exactly); HTML/JS syntax-checked
  locally; GitHub contents + SHAs read back after push; live URL fetched
  (see commit message / parent report for status and size). Hallmark review
  done as a checklist against the skill's pre-flight list (no centered hero,
  no three equal cards, no gradient, no emoji icons, Mock B tokens kept);
  sloplint run not performed in this sandbox. Phone check by Ankit is the
  final gate — layout at 390px not verified on a real device.
