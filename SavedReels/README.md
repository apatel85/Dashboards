# SavedReels

A static dashboard of Ankit's Facebook saved Reels — watched, categorized, and
rewritten in plain English. Live at
https://apatel85.github.io/Dashboards/SavedReels/

## Counts (refresh Nov 24, 2026)

- **99 distinct Reels** saved Sep 28 – Nov 23, 2026, of 426 total saves on the account
- **85 consolidated concepts** after merging repeats
- **14 repeat saves merged** into shared concepts
- **19 Reels saved in the last 7 days** (Nov 17–23, 2026), across 19 concepts

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

All · AI · Finance · What's New · Consolidated. Search filters titles,
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

## Data sources

- `~/workspace/facebook-saved/categorized.json` — 99 unique Reels, saved
  2026-09-28 to 2026-11-23 (total saves reported: 426)
- `~/workspace/facebook-saved/posts/*.json` — 10 Reels with post records
  (creator + publication date)
- `~/workspace/your_files/facebook-saved-reels-dashboard/facebook-saved-reels-dashboard.html`
  — v1 dashboard; its categories, per-category summaries, 13 Finance
  strategies and AI repo verdict are preserved in this app
- Summaries are plain-English rewrites of each video's own caption/transcript
  material. Return claims, star counts and token figures are the creators'
  claims unless a source says otherwise.

## Privacy

No secrets, API keys, passwords, Facebook credentials, or account data are in
this repo. Creators are named only where the Reel itself names them; otherwise
the card says "Unknown — see reel". Nothing here sends data anywhere.
