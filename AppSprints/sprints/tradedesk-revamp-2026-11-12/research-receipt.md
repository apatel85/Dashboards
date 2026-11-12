# Research Receipt — TradeDesk revamp

**Sprint:** `tradedesk-revamp-2026-11-12` · **Date:** 2026-11-12 · **Status:** receipt-ready — waiting for Ankit to confirm or correct

**One-line brief:** Revamp TradeDesk so a person with no finance background understands "what should I look at today" in 10 seconds.

## 1. The job, in the user's own words

> "Tell me what to look at today — in plain words, in 10 seconds — and let me dig deeper only if I want to."

Evidence: Ankit's own words for the redesign were "easy to navigate, self-explaining, and gets to the point right away — a person with no finance background must understand it in 10 seconds." Retail investors phrase the same job as "what stocks to buy today," "which stocks to look at each day," and, from working traders, "why are we in this stock today?" — with the warning that "interesting is not a trading criteria." The job is a daily shortlist with a reason attached to each name, not a data dump.

## 2. User language — words to use, jargon to avoid

**Words real users use:** what to look at today · is this stock cheap / healthy / growing · what's moving today and why · buy / sell / hold · how much could I lose · what's the trigger · what's the stop (the point where I get out).

**Jargon that must never appear bare — every one needs a plain line beside it:** 0DTE / 1DTE (options that expire today / tomorrow) · IV and Greeks, e.g. delta (how much the option price moves when the stock moves $1) · GEX / gamma · put / call · relative strength · PEG, P/E, Graham number · regime (whether the market is trending, choppy, or falling) · breakout · accumulation.

TradeDesk already does this in the Mock B design (a "How to read the numbers" legend). The revamp keeps that rule on every screen, not just the Daily Brief.

## 3. How people solve it today without TradeDesk

- **Broker apps (Schwab, Fidelity):** watchlists, price alerts, screeners. They show prices; they do not give a verdict.
- **Yahoo Finance:** watchlists + news + screeners. The default home for "check my stocks."
- **Seeking Alpha:** articles + Quant Ratings. The deep-reading option.
- **Reddit, X, newsletters, finfluencers:** "what to look at" as social proof and tips.
- **Morning scanner routines:** working traders run a checklist every morning — relative volume, a catalyst (earnings, news, FDA decision, macro print), and a volatility check — then build a short watchlist for the day.
- **Spreadsheets:** the hand-rolled version of the same checklist.

None of these gives the whole job in one place: a daily verdict in plain words, with the numbers behind it one tap away.

## 4. Competitor audit — 3 closest products

Audited 2026-11-12 from published reviews (quantroutine.com, dollarscout.net, matchmybroker.com, financer.com, finloom.org). 30-minute cap observed.

### Simply Wall St — the plain-language benchmark
- **First screen:** the Snowflake — one five-sided visual scoring a company on Value, Future growth, Past performance, Financial health, Dividend — plus a plain-language report.
- **Core task flow:** pick a stock → read the Snowflake in seconds → expand the report only if interested. A full stock check from a phone takes under two minutes.
- **One strength:** the best plain-language translation of fundamentals in the space. "You can tell within seconds whether a stock is cheap, growing, financially healthy." Narrative reports explain *why* a score is what it is, not just the number.
- **One confusion point:** the automated fair-value number looks more precise than its assumptions are — a clean visual can feel like a recommendation when it is only a model output. Also: no price charts, no technical analysis, and no daily "what to look at" list.
- **Price:** free tier limited; Premium ~$120–131/year.

### Seeking Alpha — the deep-research benchmark
- **First screen:** news feed + Quant Ratings (Strong Buy to Strong Sell across five factors: Value, Growth, Profitability, Momentum, EPS Revisions).
- **Core task flow:** search a ticker → read the Quant Rating and factor grades → read contributor articles and earnings transcripts for the why.
- **One strength:** Quant Ratings have independent academic validation (2024 University of Kentucky study) and a strong backtested record; earnings-call transcripts for 7,000+ companies are among the most complete available to retail investors.
- **One confusion point:** overwhelming for a beginner — the volume of articles, the paywall (Premium $299/year, most content gated), and uneven article quality. No options tools at all (no chains, no Greeks), so an options trader still needs a second platform.
- **Price:** free tier heavily gated; Premium $299/year.

### Yahoo Finance — the default home benchmark
- **First screen:** watchlist + market movers + news. The most familiar finance home page on the web.
- **Core task flow:** check watchlist → read news on a mover → open the stock page for financials, estimates, and charts.
- **One strength:** familiar, free, broad coverage; watchlists and portfolios sync between phone and desktop, so research started at a desk continues away from it.
- **One confusion point:** it shows data but never gives a verdict — nothing tells you what to look at today. Free tier is ad-heavy; real research depth sits behind tiered paywalls (Bronze $95/yr, Silver $239/yr, Gold $479/yr).
- **Price:** free with ads; paid tiers $95–$479/year.

### The gap TradeDesk fills
None of the three gives a daily verdict ("look at these today, here's why, in plain words") plus options-lotto ideas, Congress trades, and earnings in one place, free, on live data. That is the revamp's job — and the revamp must not copy their failure modes: no false precision (Simply Wall St), no overwhelm and no paywall (Seeking Alpha), no verdict-free data dump (Yahoo).

## 5. Screen-size map — core task: "what to look at today"

Same verdict, same numbers, same 10 tabs at every size. Only the layout transforms (content parity).

- **360px phone:** one column. Market mood in one plain sentence at the top. Top 3 ideas as rows with one-line verdicts. Sticky bottom bar carries today's top call (AIZ: break above $322.93, stop $268.92). Detail tabs collapse; search at the top. Primary action in the bottom third.
- **768px tablet:** two-column ideas. Mood block + search in a top band or short sticky rail. Detail sections as accordions, collapsed by default.
- **1024px+ desktop:** sticky rail (Deep Dive search + mood block) beside the ideas column. Fundamentals widen to 3–4 across. Numbered index rows (01 Options, 02 Congress, 03 Earnings, 04 Reference).

## 6. Pattern Router — which UI this gets

- **Daily Brief = task app pattern.** Daily return, one job, dashboard-first, one-thumb on the phone, bottom nav. Verdict first, detail one tap away.
- **Detail tabs = workbench / reference pattern.** Dense, scannable, filters + drill-in, everything collapsed by default, expand only what you open.
- **App vs website rule:** daily return + own data (live Schwab quotes, invite-only allow-list) → app shell, not a marketing site.
- **Industry adjustments (finance):** trust signals on every screen — data-source labels, "research and education only, never financial advice" stated plainly; plain definitions beside every term; extra error forgiveness (no destructive actions; stops and limits shown in plain words); no invented precision — unconfirmed figures bracketed, never presented as fact.

## Assumptions — please correct any that are wrong

1. The reader checks daily, mostly on a phone. (From Ankit's own use and his phone checks.)
2. The audience stays invite-only and small (Ankit + invited readers). New invitees still arrive cold, so first-use rules apply.
3. The revamp is design-only: the live data pipeline, Schwab connection, and 10-tab structure stay as they are.
4. Mock B (Command center, editorial-ledger layout), chosen Nov 12, is the design direction for the Daily Brief, with detail tabs linked from it.

## What happens next

If this Receipt looks right, say so and the revamp build starts under `Dashboards/TradeDesk` (never in App Sprints), using this Receipt + the chosen Mock B layout as its brief. If anything above is wrong, correct that line and the Receipt is updated before design starts.

**Real-user test for "done":** Ankit opens the revamp mockup on his phone and answers "what should I look at today" in 10 seconds. If he cannot, the design is not done.

---
*Phase 0 Research Sprint — App Sprints · Sources: quantroutine.com (Simply Wall St reviews), dollarscout.net, matchmybroker.com, financer.com, finloom.org (Yahoo Finance review), americachandreamtrading.com, monkeytrade.com, velotrade.com (retail screening routines). TradeDesk facts from the live app and Ankit's Nov 10–12 briefs.*
