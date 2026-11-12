/**
 * Congress deep link — lets the Daily Brief's "New developments" section
 * jump straight to one trade in the Congress & Gov tab.
 *
 * The Daily Brief sets the link and then switches tabs; the Congress tab
 * mounts fresh on every tab switch, so it takes (and clears) the link on
 * mount and applies it: branch + Trades view + search query + row highlight.
 * Plain module state, no URL or App changes needed — the tab is only ever
 * entered from the brief when a link is pending.
 */

export interface CongressDeepLink {
  branch: 'congress' | 'executive';
  /** Ticker (or member name) to put in the tab's search box. */
  query: string;
  /** Exact trade row to highlight/scroll to (see tradeKey in CongressGov). */
  key: string;
}

let pending: CongressDeepLink | null = null;

export function requestCongressDeepLink(link: CongressDeepLink): void {
  pending = link;
}

/** Returns the pending link once, then clears it. */
export function takeCongressDeepLink(): CongressDeepLink | null {
  const link = pending;
  pending = null;
  return link;
}
