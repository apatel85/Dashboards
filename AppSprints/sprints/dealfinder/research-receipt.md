# Research Receipt — DealFinder

Sprint: `dealfinder` · Date: 2026-11-12 · Status: receipt-ready

Intake: GitHub issue #23 ("Sprint intake: dealfinder", created 2026-11-12 23:55 UTC) · Filed: `AppSprints/sprints/dealfinder/intake.json`

## The job (one line)

"Find the best price for what my household needs — milk, eggs, groceries — by item name or barcode."

## Words to use

best deal · best price · cheapest · near me · milk · eggs · juice · breakfast · lunch · dinner · groceries · barcode / UPC · scan · flyer · weekly deals · save money · per unit · in stock · this week

## Jargon — never bare (each needs a plain line on first use)

UPC — the barcode number on a package · unit price — price per ounce / per pound, so different sizes can be compared fairly · price match — a store selling it at a competitor's lower price · loyalty price — the lower price for members of the store's free card · circular / flyer — the store's weekly deals paper · rebate · cashback · store brand vs name brand

## The household today (what DealFinder replaces)

Paper flyers in the mail · one store app per store · Google searches ("milk price ShopRite") · memory ("I think eggs were $3.99 last week") · spreadsheets / notes · coupon apps · asking family. None of them answers one list across stores in one place; none says whether today's price is actually a deal.

## Competitor audit (from published reviews, Nov 2026; 30-min cap)

1. **Flipp** — weekly flyers from 800+ retailers in one app, smart lists matched to deals, price matching, digital coupons. Free; 4.8★ from ~401,000–412,629 ratings; 10M+ installs (26M per AppBrain). Does well: all local flyers in one place; the list auto-matched to current offers; flyer proof for price matching at checkout. Confuses: no price-history diary — no way to tell whether today's price is actually a deal vs what you paid before; no price-drop alerts; flyers expire weekly so saved items revert to full price; smaller, ethnic, and specialty stores may not participate; price matching depends on the retailer's own policy, not the app. Sources: mobexer.com/flipp-shop-grocery-deals/com.wishabi.flipp; usdollarpantry.com/flipp-app-review/; mylinovar.com/cow-long-rec-flipp-app-grocery-savings; appbrain.com/app/flipp-weekly-shopping/com.wishabi.flipp.

2. **Basket** — the closest to the job, and it is gone. Built a list, showed totals by store (one 15-item test: $62 Walmart, $71 Kroger, $58 Aldi); 100+ chains; prices usually within a dollar or two of checkout. But: no longer on the US App Store, checked Oct 30, 2026. Its prices were crowdsourced from shoppers — only as fresh as the last shopper who reported, and it thinned out the moment people stopped reporting. Coverage was already spotty outside major US metros, and every comparison was a one-time snapshot with no history. The lesson for DealFinder: never build on crowdsourced prices; prices must come from retailer / flyer data checked at search time. Sources: groceriestracker.com/blog/best-grocery-price-comparison-apps-2026; groceryroutes.com/alternatives/basket/.

3. **ShopSavvy** — barcode scan + multi-retailer price comparison. Free with in-app purchases; 4.0–4.2★ from ~110,000–114,000 ratings; 10–17M installs. Does well: fast in-store scan, prices from many retailers in seconds, price history, price-drop alerts, price-match guidance at checkout. Confuses: no quality or value score — it tells you the cheapest price, not whether the item is worth buying; weak on loose produce and anything without a barcode; recent user reviews report black screens, ad overload, and scans returning nothing; no scan history; results skew online rather than local shelf prices. Sources: mobexer.com/shopsavvy-barcode-scanner/com.biggu.shopsavvy; withguava.io/post/grocery-price-comparison-apps-which-one-saves-the-most-at-the-register; appbrain.com/app/shopsavvy-barcode-scanner/com.biggu.shopsavvy; play.google.com (com.biggu.shopsavvy).

## The gap

None of the three does the whole household job. Flipp browses flyers but never judges whether a price is a deal; ShopSavvy looks up one barcode at a time but never prices a whole list; Basket priced the whole list and died because its prices were crowdsourced. None ties the weekly shop together (breakfast / lunch / dinner planning), none keeps a household list, and none answers "cheapest where, right now, per unit — and is it actually cheaper than what I paid last time?" DealFinder's edge is the whole list, priced live from retailer data, with a per-unit verdict and a household list — no account, no personal information.

## Screen map

- **360px, one column:** search bar + big Scan button → best-price rows (item, cheapest store + price, per-unit, next-cheapest gap) → "cheapest basket" total by store → list dock at the bottom. One job per screen.
- **768px, two columns:** search + results side by side; store totals as a row of cards; list beside the results.
- **1024px+, Mock B baseline:** 348px sticky rail (this week's top deals, my list, stores near me) + fluid main column, gap 28px; no bottom bar; same content at every width, reached by collapsing, never by deleting.

## Pattern Router

DealFinder is a public utility website, search-first — not an app shell. Daily return, but no account, no sign-up, no personal information by design (the intake's never-do), so there is no saved user data to shell around; lists live in the browser only. The front door is search ("milk" → cheapest where, right now); the workbench is the list, flyers, and store totals. One job per screen; the deal before the catalogue.

## Navigation map (N1)

Destinations, by frequency: Search (daily) · Scan (daily, in-store) · Deals / flyers (daily) · My list (daily) · Stores near me (weekly) · Saved / history (occasional). Phone bottom bar, 3–5 slots: Search, Deals, Scan (center core action — scanning is the dominant verb, N11), List, More. More is a grouped index (Stores near me, Saved / history). Tablet: narrow labeled rail; desktop: full rail, all destinations visible, More dissolves (N9).

## Style options (per the skill rule — Ankit picks)

1. **Bright supermarket, value-first** — bold price-led rows, big green "best price" tags, clean white cards, fresh-produce colors. Fit: the price is the hero; it must read as "cheapest here" in 3 seconds in a store aisle. Trade-off: can feel loud and busy; needs discipline to keep the price hierarchy readable. **Recommended.**
2. **Clean price-comparison (Google Shopping-like)** — white, one accent, dense comparison rows, mono prices. Fit: comparison tables and per-unit math; trust through clarity. Trade-off: can feel cold and spreadsheet-like for a household app; risks looking like a tool, not a daily helper.
3. **Warm household, friendly market** — soft rounded, warm cream + green, big friendly type. Fit: household daily use; feels like a helper, not a bargain bin. Trade-off: warmth can soften the price signal — the "best price" must still shout.

## Assumptions (Ankit's to correct)

- US stores to start (NJ household — ShopRite, Walmart, Target, Aldi, Costco and similar); prices from public flyer / retailer data checked at search time, never crowdsourced (the Basket lesson).
- No account, no sign-up, no personal information — by the intake's own never-do; lists live in the browser only.
- Packaged goods by barcode (UPC); loose produce and deli by item name.
- Groceries first (milk, eggs, juice, breakfast / lunch / dinner items); expansion to other items later, as the intake says.
- Trust line from the intake: "It is real and saves money" — every price shows its store and its freshness (when it was checked).

## Done-test

Ankit opens the mockup on his phone, types "milk", and answers "where is it cheapest right now" in 10 seconds — and scans a barcode to compare it in one tap.
