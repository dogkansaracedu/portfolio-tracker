/**
 * Display vocabulary for the price engine's staleness indicator.
 *
 * Staleness is a STATUS, never a gain or a loss, so these are the engine's own
 * tones and never the gain/loss palette: fresh is quiet, warning is the app's
 * one amber deadline tone, stale is the destructive tone.
 */
export type StalenessLevel = "fresh" | "warning" | "stale"

export const PRICE_STALENESS_TONE_CLASS: Record<StalenessLevel, string> = {
  fresh: "text-muted-foreground",
  // The same amber as `ENDS_SOON_TONE_CLASS` (its text half — this indicator
  // has no border) — one warning colour app-wide.
  warning: "text-amber-700 dark:text-amber-300",
  stale: "text-red-600 dark:text-red-400",
}

/** Shown on the phone header, where there is no room for "Updated 2m ago". */
export const NO_PRICE_DATA_AGE = "—"
