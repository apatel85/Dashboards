/**
 * The single source of truth for every plain-English definition in the app.
 * Shown ONLY in the global "Understanding Fundamentals" drawer (side menu,
 * header shortcut, floating pill). No per-panel legends anywhere — the
 * per-card "What do these mean?" toggle was removed 2026-11-10 (v2026-11-10g).
 */
export interface DefinitionGroup {
  title: string;
  items: [string, string][];
}

export const DEFINITIONS: DefinitionGroup[] = [
  {
    title: 'Score & levels',
    items: [
      ['Score', '0–100. How many bullish signals line up — higher is stronger. 70+ is worth a look.'],
      ['Trigger', 'The price a breakout needs to clear. Above it, the setup is on; below it, nothing to do.'],
      ['Stop', 'The price where the idea is wrong. If it falls below the stop, get out.'],
      ['50-day average', 'The average price over the last 50 days. Above it = uptrend; below it = downtrend.'],
      ['Relative strength', 'How much the stock beat the S&P 500 over the last 3 months. Positive = leading the market.'],
      ['Volume ×', 'Recent trading volume vs its 50-day average. Over 1.5× = unusually heavy interest.'],
    ],
  },
  {
    title: 'Company numbers',
    items: [
      ['P/E (TTM)', 'Price ÷ the last 12 months of earnings. Lower = cheaper for the profit you get. Under ~15 is cheap, over ~30 is pricey.'],
      ['Fwd P/E', 'Same as P/E, but using next year’s expected earnings instead of last year’s.'],
      ['PEG', 'P/E ÷ expected earnings growth. Under 1 = cheap for how fast it is growing; over 2 = pricey for its growth.'],
      ['P/B', 'Price ÷ book value (what the company owns minus what it owes). Under 1 = selling for less than its net assets.'],
      ['P/S', 'Price ÷ yearly sales. Lower = cheaper for the sales the company brings in.'],
      ['ROE', 'Profit ÷ shareholder equity. How hard the company works its owners’ money. Over 15% is strong.'],
      ['Profit margin', 'Profit kept from each $1 of sales. Higher = the business keeps more of what it earns.'],
      ['Debt/Equity', 'Debt ÷ equity. Under 1 = light debt; over 2 = heavily indebted.'],
      ['Rev growth YoY', 'Sales vs a year ago. Positive = the business is growing.'],
      ['Rev 3Y CAGR', 'Average yearly sales growth over the last 3 years.'],
      ['EPS growth (est)', 'How much analysts expect earnings per share to grow. Positive = more profit ahead.'],
      ['Beta', 'How much the stock swings vs the market. 1 = moves with the market; 2 = twice as jumpy; 0.5 = half as jumpy.'],
      ['Div yield', 'Yearly dividend ÷ price. What the stock pays you each year just for holding it.'],
      ['Mkt cap', 'Total value of all shares. Bigger = bigger company.'],
      ['Graham number', 'A deep-value floor from earnings × book value. Price below it = potentially cheap.'],
      ['Peer fair value', 'What the stock would be worth if it traded at its sector’s typical P/E.'],
    ],
  },
  {
    title: 'Options',
    items: [
      ['IV', 'Implied volatility — how big a move the options market expects. Higher = bigger expected swings.'],
      ['IV rank', 'Where today’s implied volatility sits vs the last year. 0 = cheapest ever, 100 = most expensive ever. Low rank = options are cheap.'],
      ['Delta', 'How much an option’s price moves when the stock moves $1. A 0.50 delta ≈ $0.50 per $1 move.'],
      ['Gamma', 'How fast delta changes as the stock moves. High gamma = the option’s sensitivity changes quickly near expiry.'],
      ['P/C ratio', 'Put volume ÷ call volume. Over 1 = more puts than calls (fear or hedging); under 0.7 = more calls (greed).'],
      ['Expected move', 'How far the stock is expected to move by expiry, based on option prices. The market’s best guess, not a promise.'],
      ['Vol / OI', 'Today’s option volume ÷ open interest. High = unusually busy trading in that contract.'],
      ['Max pain', 'The strike where the most options expire worthless. Stocks often drift toward it into expiry.'],
      ['Call wall', 'The strike with the most call open interest. Acts like a ceiling — hard to push through.'],
      ['Put wall', 'The strike with the most put open interest. Acts like a floor — hard to fall through.'],
      ['VIX', 'The market’s fear gauge. Under 15 = calm; over 25 = nervous; over 30 = panic.'],
    ],
  },
];

export const DEFINITION_COUNT = DEFINITIONS.reduce((n, g) => n + g.items.length, 0);
