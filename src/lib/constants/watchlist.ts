/**
 * Component 19 — Watchlist (Takip listesi). Route, table, timings and every
 * string the page renders; the components carry no copy of their own.
 */

export const WATCHLIST_ROUTE = "/watchlist"
export const WATCHLIST_TABLE = "watchlist_items"

/** `resolve-tickers` serves the symbol search when sent `{ query }`. */
export const SYMBOL_SEARCH_FUNCTION = "resolve-tickers"

/** Wait this long after the last keystroke before searching — each search is
 *  a handful of upstream quote fetches. */
export const SYMBOL_SEARCH_DEBOUNCE_MS = 500
export const SYMBOL_SEARCH_MIN_CHARS = 2

export const WATCHLIST_COPY = {
  /** The owner's name for it, shared with the home-screen widget ("Takip"). */
  navLabel: "Takip listesi",
  pageTitle: "Takip listesi",
  pageSubtitle: "Symbols you follow without holding them.",

  add: "Add",
  edit: "Edit",
  done: "Done",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",

  searchTitle: "Add to Takip listesi",
  searchPlaceholder: "AAPL, THYAO, BTC, altın, USDTRY, TEFAS code…",
  searching: "Searching…",
  noResults: "No symbol found.",
  alreadyAdded: "Added",

  /** Today's change before the symbol's first day rollover — no baseline. */
  noChange: "—",
  noPrice: "—",
  writeFailed: "Couldn't save the Takip listesi change.",
  searchFailed: "Search failed — try again.",
} as const
