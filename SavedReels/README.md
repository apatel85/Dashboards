# SavedReels

A static dashboard of Ankit's Facebook saved Reels — watched, categorized, and
rewritten in plain English. Live at
https://apatel85.github.io/Dashboards/SavedReels/

## Counts (refresh Nov 24, 2026)

- **99 distinct Reels** saved Sep 28 – Nov 23, 2026, of 426 total saves on the account
- **85 consolidated concepts** after merging repeats — 82 in the main tabs, 5 repos in Potential fake
- **14 repeat saves merged** into shared concepts
- **17 new concepts in the main tabs** (saved Nov 17–23, 2026); 2 more new concepts flagged in Potential fake

Categories (re-derived from the caption/transcript text, not the rough
keyword labels in the export):

| Category | Reels |
|---|---|
| AI | 50 |
| Finance | 21 |
| Pets & Simba | 7 |
| Education & Math | 6 |
| Wellness | 2 |
| Lifestyle | 2 |
| Design & Web | 4 |
| Other | 7 |

## The concept_key rule (dedupe / consolidation)

`concept_key` = normalized title + creator + core concept. Examples:
`karpathy-skills`, `hallmark`, `cloudflare-security-audit`, `tradingagents`,
`omniroute`, `ai-job-search`, `sma200-rsi10`, `vwap`, `gex-orderflow`,
`expert-council`.

- Reels with the same `concept_key` are **one entry** in the app: one summary,
  all Reel permalinks listed with dates and creators, a count, and first/last
  seen dates.
- Distinct Reels stay distinct. In the main list, same-concept duplicates
  never appear as separate rows.
- The dedupe registry is `data/seen.json`: permalink →
  `{first_seen_date, concept_key}`. Every one of the 99 permalinks is
  listed there and inside its concept's `reels` array in `data/reels.json`.

Merges in this refresh (14 saves folded into 8 concepts):

- `omniroute` — 3 saves → 1 entry: 2026-10-14 (Unknown — see reel), 2026-10-27 (Unknown — see reel), 2026-11-18 (Scale by Sarthak)
- `rea` — 4 saves → 1 entry: 2026-10-11 (Unknown — see reel), 2026-10-12 (Unknown — see reel), 2026-10-21 (Unknown — see reel), 2026-11-16 (Unknown — see reel)
- `kushal-lodha` — 2 saves → 1 entry: 2026-11-10 (Kushal Lodha), 2026-11-10 (Kushal Lodha)
- `gex-orderflow` — 2 saves → 1 entry: 2026-10-10 (TC Trades Tyler), 2026-10-25 (Leah Farnsworth)
- `oracle-free-cloud` — 2 saves → 1 entry: 2026-10-25 (Unknown — see reel), 2026-10-25 (Unknown — see reel)
- `harvey` — 2 saves → 1 entry: 2026-10-18 (Unknown — see reel), 2026-10-22 (Unknown — see reel)
- `tradingagents` — 5 saves → 1 entry: 2026-10-10 (David Delaney), 2026-10-10 (David Delaney), 2026-10-11 (David Delaney), 2026-10-13 (Coding Simplified Space), 2026-10-21 (David Delaney)
- `dont-forecast` — 2 saves → 1 entry: 2026-10-10 (Market Moves), 2026-10-12 (Market Moves)

Note: the v1 dashboard kept the four "Trading Research Team in Claude Code"
saves as separate rows because they were saved separately. v1.0.0 consolidates
them (plus the TradingAgents repo Reel) under `tradingagents`, per the rule
above. The v1 dashboard also counted 100 distinct items; the 100th was the
TheoTrade checklist link, which is preserved here as Finance strategy #12 but
is not a Reel and is not counted in the 99.

## What's New

Definition (v1): items saved in the 7 days before the refresh date
(Nov 24, 2026), i.e. `saved_date >= 2026-11-17`. They are marked NEW in the
app, with first-seen date, category, and a 1–2 line summary each. The
definition and the refresh date are stated in the What's New tab itself.

## Tabs

All · AI · Finance · What's New · Consolidated · Potential fake. Search filters titles,
summaries, creators and concept names. Cards start collapsed. No external
JavaScript; the data is embedded in the page and `data/reels.json` is kept as
the source file. Google Fonts are used with system fallbacks, so the page
still renders offline.

## Dates

The Facebook export records when a Reel was **saved**, not when it was
published. `published_date` in `data/reels.json` is the real publication date
only where it is known (the 10 Reels with post records, plus dates stated in
the v1 dashboard); everywhere else it falls back to the saved date and
`published_known` is `false`. No dates were invented.

## Repo audit (Nov 24, 2026)

45 items audited against GitHub (see `repo-audit.md` and
`data/repo-audit.json`): **33 kept in the main tabs** (8 useful, 25 with a
stated limitation on their card), **5 moved to Potential fake** (FAKE:
AgriciDaniel/claude-ads, Deft; UNCERTAIN: The-Swarm-Corporation/AutoHedge,
cheaper-inference/OmniRoute, Jev AI / TypeSafe AI), **7 unresolved** (the
Reel names no repo to check — their cards carry a "repo not verified" note).

- Flagged concepts in `data/reels.json` carry `"audit": "potential-fake"`
  (omniroute, deft-team-skills, jev-ai) and are excluded from every main tab
  by the page's filter. AutoHedge and Claude Ads have no standalone concept
  (they were named inside the 10-repo Reel), so their entries live only in
  the Potential fake tab's own list, and the 10-repo card no longer names or
  links them. No Reel was deleted: all 99 permalinks are still in
  `data/reels.json` and `data/seen.json`.
- Kept repos carry a one-line limitation in `"audit_note"`, rendered on the
  card — e.g. TradingAgents is research-only and the current repo is a
  rebuilt CLI, not the original LangGraph framework; Fincept's "Bloomberg
  replacement" is overstated; the AI Job Search 69/20/1 funnel is the
  author's unverified claim and its quick-start fork is public.
- Main-tab counts after the audit: All 82, AI 40, Finance 15, What's New 17,
  Consolidated 7; Potential fake 5. The tab counts are also computed live
  from the data by the page script.

## Data sources

- `~/workspace/facebook-saved/categorized.json` — 99 unique Reels, saved
  2026-09-28 to 2026-11-23 (total saves reported: 426)
- `~/workspace/facebook-saved/posts/*.json` — 10 Reels with post records
  (creator + publication date)
- `~/workspace/your_files/facebook-saved-reels-dashboard/facebook-saved-reels-dashboard.html`
  — v1 dashboard; its categories, per-category summaries, 13 Finance
  strategies and AI repo verdict are preserved in this app
- `repo-audit.md` + `data/repo-audit.json` — Nov 24, 2026 repo audit (45 items: verdicts, star counts, evidence as observed that day)
- Summaries are plain-English rewrites of each video's own caption/transcript
  material. Return claims, star counts and token figures are the creators'
  claims unless a source says otherwise.

## Privacy

No secrets, API keys, passwords, Facebook credentials, or account data are in
this repo. Creators are named only where the Reel itself names them; otherwise
the card says "Unknown — see reel". Nothing here sends data anywhere.
