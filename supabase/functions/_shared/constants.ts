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

/**
 * A `price_cache` row older than this is treated as MISSING. price_cache is
 * upserted in place (keyed on ticker) and never expires, so a multi-day
 * upstream outage would otherwise leave yesterday's price masquerading as
 * today's net worth. 36h tolerates a normal daily refresh cycle (incl.
 * weekends, since updated_at tracks the last fetch, not the last market move)
 * while still catching a real outage. Shared by take-snapshots and
 * take-intraday-snapshots via _shared/valuation.ts.
 */
export const STALE_PRICE_MS = 36 * 60 * 60 * 1000
