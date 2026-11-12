# TradeDesk V2

A cleaner, easier-to-follow front end for TradeDesk. Same data, same login, same
invite list — new navigation and layout. The original app in `../TradeDesk/` is
untouched and keeps working.

Live: `https://apatel85.github.io/Dashboards/TradeDeskV2/`

## What changed from V1

| V1 | V2 |
|---|---|
| 10 flat tabs | 7 pages grouped by purpose: Today · Options · Stock ideas · Lookup · Earnings · Smart money · Track record (+ Admin) |
| Daily Brief opened on Congress disclosures | **Today** opens on the market read, ES/NQ gamma levels and the best setups, each with a link to the full view |
| Gamma + playbook buried in Signals | **Options** owns gamma levels, 0DTE/1DTE focus, lotto scanner and playbook as sub-tabs |
| Signals, Research and breakouts on three tabs | **Stock ideas** holds all three as sub-tabs with counts |
| Deep Dive and Screener separate | **Lookup**, plus a ticker search in the top bar on every page |
| A paragraph of explanation on top of every tab | One collapsed "How to read this" line |
| Screener rendered all 1,114 rows (328,000px tall on a phone) | 25 rows + Show more |
| Research ideas fully expanded | Verdict, trigger and stop up front; full analysis one tap away |
| "Invalid Date" on Signals, Performance, gamma alerts | Fixed (`parseDay` now accepts full timestamps) |
| No way to tell if data was stale | **Today → Data status** lists every dataset with age and Fresh / Aging / Stale |
| Phone bottom bar reached 3 of 10 tabs | Today · Options · Ideas · Lookup · More (full menu) |
| Smart money downloaded the 15 MB White House file on every visit | Fetched only when the White House view is opened |
| Three "Fundamentals" buttons, one floating over content | One Glossary entry in the menu |

Old links (`#options`, `#congress`, …) still resolve to the right new page.

## How it gets data

V2 ships **no data of its own**. `src/lib/dataBase.ts` points every fetch at the
original app's published folder (`/Dashboards/TradeDesk/dist/data/`), so the
existing pipeline and workflows feed both apps and nothing new needs scheduling.
In local dev, Vite serves `../TradeDesk/public` instead.

## Develop

```bash
cd TradeDeskV2
npm install
npm run dev      # http://localhost:5173/Dashboards/TradeDeskV2/dist/
npx tsc --noEmit # type check (clean)
npm run build    # writes dist/ — commit it, GitHub Pages serves it
```

## One-time setup before first login

Supabase → Authentication → URL Configuration → Redirect URLs: add
`https://apatel85.github.io/Dashboards/TradeDeskV2/dist/`. Without it, Google
and magic-link sign-in return to the Site URL instead of this app.

## Structure

```
src/App.tsx          shell: grouped sidebar, top bar with ticker search, phone bottom bar
src/lib/route.ts     hash routes (#/page/sub?t=TICKER) + legacy hash mapping
src/pages/           Today, Options, Ideas, Lookup — the new compositions
src/tabs/            Earnings, CongressGov, Performance, Admin, and the views pages reuse
src/components/      SubTabs, HowTo/ShowMore (new) + the V1 cards
src/styles.css       V1 component styles
src/v2.css           tokens, shell, sub-tabs, Today overview
```
