/**
 * Component 19 — Watchlist (Takip listesi). Route, table and every
 * string the page renders; the components carry no copy of their own.
 */

export const WATCHLIST_ROUTE = "/watchlist"
export const WATCHLIST_TABLE = "watchlist_items"

export const WATCHLIST_COPY = {
  /** The owner's name for it, shared with the home-screen widget ("Takip"). */
  navLabel: "Takip listesi",
  pageTitle: "Takip listesi",
  pageSubtitle: "Assets you follow without holding them.",

  add: "Add",
  edit: "Edit",
  done: "Done",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",

  searchTitle: "Add to Takip listesi",
  searchPlaceholder: "Ticker or name",
  /** The add flow only offers catalog assets; say so when nothing matches. */
  noResults: "No asset in the catalog matches.",

  /** Today's change before the symbol's first day rollover — no baseline. */
  noChange: "—",
  noPrice: "—",
  writeFailed: "Couldn't save the Takip listesi change.",
} as const
