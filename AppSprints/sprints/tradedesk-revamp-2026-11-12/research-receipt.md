# Research Receipt — TradeDesk Revamp

**Sprint:** tradedesk-revamp-2026-11-12
**Date:** 2026-11-12
**Status:** receipt-ready — waiting for Ankit to confirm or correct
**Intake:** sprints/tradedesk-revamp-2026-11-12/intake.json

This is the Phase 0 Research Receipt for revamping TradeDesk with the new global UX/UI skill. No design has started yet. Confirm this receipt (or correct a line) and the revamp build starts from it.

---

## 1. The job, in the user's own words

> "Tell me what to look at today — 3 to 5 names, one line each on why, and what could go wrong — in the time it takes to read a morning newspaper list."

The reader's mental model is a **morning newspaper list, not a terminal**. Discovery is passive: they scan a brief as part of a morning routine, and if something sparks an idea, they dig deeper. Research itself is "lazy" — a quick search, a few tabs, a watchlist check. They have 5–10 minutes before the open.

## 2. Words to use, words to avoid

**Use (observed in the wild):** "stocks to watch today", "what to look at today", "what's moving today", "why it's moving", "what changed since yesterday", "worth a closer look", "up / down X% today" (always with the company name beside the ticker), "reporting earnings today / tomorrow", "people in Congress bought/sold", "how risky is this", "what could go wrong".

**Avoid or always define on first use:** options Greeks, 0DTE/1DTE, IV, delta/gamma; P/E, forward P/E, EV/EBITDA, PEG; Quant Rating / quant score; breakout, accumulation, Stage-2, relative volume, float, gap-up; bullish/bearish (only paired with "going up / going down" the first time); "conviction", "catalyst", "thesis", "alpha", "moat", "guidance"; "Buy / Sell" as a label — prefer "worth a look" / "watch" / "on the list today" (TradeDesk is research/education only).

**Highest-value line on each idea card:** "what could go wrong." FINRA's Oct 5, 2026 research (2024 National Financial Capability Study, n=2,861 investors) found only 18% demonstrate advanced investment literacy and the gap is risk comprehension — diversification, interest-rate risk, margin, option payoffs — not vocabulary.

## 3. How people solve this today (without TradeDesk)

- **Morning email newsletters:** Finimize Daily Brief ("two or three most important finance stories into plain English… in under five minutes"), Seeking Alpha Wall Street Breakfast (one-page premarket rundown before 7:30am ET), Yahoo Finance Morning Brief (weekdays by 6:30am ET).
- **Free research portals:** Yahoo Finance, Seeking Alpha (Basic), Finviz (free screener), TradingView — no single site does everything; investors combine a data source + a screener + primary-source verification.
- **Social / community:** Reddit, X/Threads/Instagram "stocks to watch" posts, StockTwits. 74% of low-literacy investors rely on informal sources (friends/family) vs 51% of advanced (FINRA).
- **Broker apps and watchlists:** Robinhood/Fidelity/Schwab — but watchlists become "a graveyard of stock ideas" for time-poor investors (Finimize).
- **Screeners:** Finviz, TradingView — day traders scan, then cut ~30 candidates to 3–5.
- **Paid idea services:** Motley Fool Stock Advisor, Seeking Alpha Premium ($299/yr), Morningstar ($249/yr).
- **AI morning-scan tools (emerging, 2026):** pre-market scans dropping a ranked brief with a plain-English reason and confidence level — the closest existing analogue to TradeDesk's job.

**The gap TradeDesk fills that no single competitor does:** one short ranked list + plain-English "why" + "what could go wrong" + earnings + Congress trades + a graded track record, in one place, free, without a paywall or a 40-tab research session.

## 4. Competitor audit — 3 closest products (visited live 2026-11-12)

### Seeking Alpha (seekingalpha.com)
- **First screen:** index ticker strip, "Latest News" headlines, then a table of analyst-rated ideas with headlines like "Micron's Selloff Is A Once-In-A-Decade Opportunity". Below: Undercovered Stocks, Editors' Picks, Day Watch, Upcoming Earnings.
- **Core-task flow:** land on homepage → scan the analyst-ideas table or "Day Watch" → click a headline → read a long contributor article → paywall for full Quant Ratings, screeners, and most analysis (Premium $299/yr).
- **Strength:** sheer idea volume and two-sided debate — 1,000+ articles/week plus Quant Ratings, so a reader can find a bull and a bear case on the same stock.
- **Confusion point:** headlines are hype-dense and jargon-dense ("2.9x Forward 2028 P/E", "20% Short") with no plain definitions; article quality varies; there is **no single "today's list"** — the reader assembles it from a news firehose. The Quant Rating is a black-box score.

### Finviz (finviz.com)
- **First screen:** the homepage *is* the screener — dense tables, heatmap, insider-trading tables. No editorial brief, no "today's ideas" list, no orientation.
- **Core-task flow:** land on screener → set filters → scan the results table / heatmap → click a ticker for charts.
- **Strength:** fastest visual scan in retail investing — the heatmap gives an instant read on which sectors and names are moving, free and quick to load.
- **Confusion point:** assumes the user already knows what to filter for — dozens of filter dropdowns (P/E, PEG, RSI, SMA, float, short %) with no guidance, no plain-English "why this stock", no daily brief. It answers "screen", not "what should I look at today."

### MarketBeat (marketbeat.com)
- **First screen:** sector performance map, a long Live Earnings Calls list, Stock Ideas article cards, Stock Lists, MarketBeat TV videos, Most Followed Stocks, Today's Top Gainers and Top Losers tables, free-account signup pitch.
- **Core-task flow:** land on homepage → skim Top Gainers/Losers or Stock Ideas → click an idea or ticker → company page with ratings/insider/earnings → sign up free for the daily ratings email.
- **Strength:** the closest free analogue to TradeDesk's breadth in one place — earnings calls, analyst ratings, insider trades, gainers/losers, daily email — and "Today's Top Gainers/Losers" is the most glanceable "what moved today" list of the three.
- **Confusion point:** no ranking, no verdict, no "why" in one line — gainers/losers are raw tables with no explanation of *why* a stock moved; headlines are clickbait-styled; the page is long and noisy. A beginner gets *what moved*, not *what to look at and why*.

**Audit takeaway:** none of the three gives a non-expert a short, ranked, plain-English "today's list" with a reason and a risk on each item. That gap is TradeDesk's design brief.

## 5. Screen-size map — the core task at 360 / 768 / 1024px+

**Same at every size:** one job per screen, verdict first — a short ranked list (3–5 ideas), each with company name + ticker, price + % change, one-line "why", one-line "what could go wrong". Plain language, definitions inline, no bare jargon, "research and education only, not financial advice" visible, freshness timestamp ("updated 6:00 AM ET") on every view. Same idea-card component everywhere; only layout and how much detail is expanded changes.

**360px — phone (design here first):** single column, one idea per row, full-width cards. Top: market mood in one line + date/time stamp, then the ranked list. Each card shows only rank, company + ticker, price + % today, one-line why, one-line risk. Everything else (signals detail, earnings, Congress trades, chart) sits behind a clearly labeled tap ("Why this made the list"). Primary action in the bottom third / thumb zone; tab bar max 5 tabs with icon + label; 44px+ tap targets; no horizontal scrolling; layout must hold at 320px. Tables become stacked key-value rows.

**768px — tablet:** two columns where content earns it — the ranked list stays a single readable column (45–75 characters per line); the second column carries the "why" detail for the selected idea or a compact market-overview strip. Detail tabs can show side-by-side (idea detail + earnings/Congress context). Touch targets stay 44px+; nothing hover-only.

**1024px+ — desktop:** three-zone command-center layout (Mock B, already chosen): left = the ranked Daily Brief list; center/right = the selected idea's full detail; slim market strip across the top (indices, market mood, freshness timestamp). Content max width ~1440px. Detail tabs show all available details — only the Daily Brief stays focused on key items. Tables are acceptable here with plain column headers and a one-line plain-English summary above each. Keyboard path matters: visible focus rings, tab order through the list then into detail, Escape to go back. The Daily Brief list itself stays short (3–5), ranked, plain-language, verdict-first — desktop adds breadth *beside* the list, never more items *in* it.

## 6. Pattern Router decision

**Job type: workbench-reference tool with a content-site front door.** Not a task app (no multi-step workflow to complete — the user reads, compares, and decides elsewhere, in their broker). Not a persuasion site (nothing is sold; no conversion funnel). The reader returns to consult a living reference — today's list, earnings calendar, Congress trades, the performance tracker grading past picks. The Daily Brief behaves like a daily briefing/newspaper — a short, dated, editorial list with a clear finish line ("read in 2 minutes"). So: **brief (content) on top, workbench (reference) underneath — one screen, two speeds.**

**App vs website: responsive website (installable PWA), not a native app.** Daily return + own data would normally argue for an app, but TradeDesk's "own data" is a watchlist and read-state, not device data or offline-critical workflows — and the reader must arrive via a link on any device. A website with PWA installability gives the daily-return habit (home-screen icon, fast load) without app-store friction or a second codebase. Revisit native only if a push-alert habit (e.g., pre-market brief notification) becomes a requirement.

**Finance-industry adjustments:**
- **Trust signals:** data freshness + source on every number ("as of 11:44 AM ET"); a methodology page explaining how the score/ranking is computed in plain English; the graded Performance Tracker kept prominent and honest, including misses; plainly state "We are not a registered investment adviser or broker-dealer."
- **Plain definitions:** every first-use term gets its meaning beside it; define risk terms first.
- **Error forgiveness:** stale-data state says so in plain language and never silently shows yesterday's list as today's; forgiving ticker search (trims whitespace, lowercase OK, company names work — "apple" → AAPL), no raw error codes; empty states with a next action ("No big earnings today — here's what's reporting tomorrow"); up/down shown with color + arrow + word ("up 2.1%"), never color alone.

## 7. What I assumed (correct me on the Receipt)

- The reader persona is one non-expert investor; admin/member is an access distinction, not a design persona.
- The core task is the 10-second "what to look at today" — deeper research is a second step, not the first screen.
- The Daily Brief stays short (3–5 ideas) at every screen size; desktop adds detail beside the list, not more items in it.
- [Yahoo Finance homepage was not visited live — text fetch is blocked in this environment; its role here rests on secondary sources. A live-browser check is still open if a fourth audit entry is wanted.]
- [No direct user interviews were conducted — the "user's own words" come from published research (FINRA, Finimize) and observed public posts, not from TradeDesk's reader. A 5-question reader survey is the next step if first-party language is wanted.]

## Sources (all checked 2026-11-12)

- FINRA Investor Education Foundation + Stanford IFDM, Oct 5, 2026 — https://www.finra.org/media-center/newsreleases/2026/new-research-finds-most-investors-lack-advanced-investment-knowledge
- Finimize community research — https://finimize.com/business/resources/insights/how-retail-investors-make-decisions
- Day-trading watchlist guides — https://daytradingtoolkit.com/beginners-guide/how-to-build-day-trading-watchlist ; https://travelingtrading.com/how-to-build-a-trading-watchlist/
- Newsletter comparisons — https://hark.news/best-investing-newsletters ; https://bestinvestmentnewsletters.com/best/daily/ ; https://bestinvestmentnewsletters.com/awards/2026/
- Research-site comparisons — https://www.gate.com/learn/articles/best-stock-research-sites ; https://www.mymillennialguide.com/free-stock-analysis-software-tools/ ; https://stocknear.com/learning-center/article/best-stock-research-websites-for-2026 ; https://www.dombey.capital/blog/the-12-best-stock-research-tools-for-individual-investors
- Competitors visited live: https://seekingalpha.com/ ; https://finviz.com/ ; https://www.marketbeat.com/
- Responsive breakpoints — https://github.com/eneryleen/ai-web-design-codex/blob/HEAD/02-responsive-adaptive/breakpoints-devices-mobile-first.md ; https://copyprogramming.com/howto/what-is-the-standard-width-for-a-website-in-pixels
- Dashboard design — https://fuselabcreative.com/how-to-design-a-mobile-dashboard/ ; https://ssicevs.com/blog/good-dashboard-design-vs-ai-slop ; https://www.orbix.studio/blogs/progressive-disclosure-in-ux
- Finance content trust — https://privacyterms.io/disclaimer-for-finance-investment-content ; https://stridec.com/blog/aeo-for-fintech/

---

*Next step: Ankit confirms or corrects this Receipt in the App Sprints side chat. Then the revamp build starts from it — Mock B layout, all 10 tabs, detail tabs showing all available details, Daily Brief focused on key items only. The live TradeDesk app is never touched; the revamp is built as a mockup/demo first.*
