/** Constants shared across the price / snapshot edge functions. */

/**
 * The portfolio's home timezone. `snapshot_date` is stamped in this zone (not
 * UTC) so a snapshot's calendar day matches the user's local day, and BIST
 * market hours are evaluated in it. Mirrors HOME_TIMEZONE in src/lib/config.ts
 * (a separate runtime — keep the two in sync).
 */
export const HOME_TIMEZONE = "Europe/Istanbul"

/** Grams in a troy ounce — converts Yahoo gold futures (USD/oz) to USD/gram. */
export const TROY_OZ_GRAMS = 31.1035
