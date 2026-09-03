export const APP_NAME = "Portfolio Tracker"

/** The bulk transaction editor (Component 4's import surface). */
export const BULK_ADD_ROUTE = "/transactions/edit"

/** Copy owned by the Settings page. */
export const SETTINGS_COPY = {
  importHeading: "Import transactions",
  importLink: "Bulk add",
} as const

/**
 * The app's display locale. Every date and every non-currency number renders
 * through it — the UI is English, so a chart axis must not be the one Turkish
 * surface in it. (Currency AMOUNTS follow their own currency's locale for
 * grouping — see `CURRENCY_CONFIG` in `lib/config.ts`.)
 */
export const DISPLAY_LOCALE = "en-US"

/** The right edge of a live series — the "now" point's label. */
export const NOW_LABEL = "Now"
