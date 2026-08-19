import BigNumber from "bignumber.js"
import { BN_HUNDRED, bn, homeDayIso } from "@/lib/config"
import {
  APR_DISPLAY_DECIMALS,
  APR_KIND_PREFIX,
  APR_KIND_SUFFIX,
  CAMPAIGN_STALENESS_DAYS,
  DEADLINE_SOON_DAYS,
} from "@/lib/constants/campaigns"
import type { Campaign } from "@/types/database"

/**
 * Component 15 — Campaigns: the pure read-time logic. The stored rows are
 * global and impersonal; everything personal (which bucket a row lands in, the
 * "$/yr on what you hold" estimate) is derived here, so it stays testable and
 * the page keeps no math of its own.
 *
 * Money math goes through BigNumber (repo rule) — an estimate multiplies a
 * crypto quantity by a USD price, which is exactly where float drift shows.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Parse a `YYYY-MM-DD` day into UTC-midnight ms. NaN for anything else.
 *
 * Exported (with {@link daysBetweenIsoDays}) as the app's one implementation of
 * ISO-day arithmetic — Component 16's interest logic builds its status ladder
 * and end-date maths on these rather than restating them.
 */
export function isoDayToUtcMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative = `to` is past. */
export function daysBetweenIsoDays(from: string, to: string): number {
  return (isoDayToUtcMs(to) - isoDayToUtcMs(from)) / MS_PER_DAY
}

export interface CampaignGroups {
  /** Campaigns for coins the user holds, richest yearly estimate first. */
  held: Campaign[]
  /** Remaining stablecoin rows, in the order they arrived. */
  stablecoin: Campaign[]
  /** Everything else, APR desc with rate-less rows last. */
  considering: Campaign[]
}

/**
 * A row's yearly reward in USD: `qty × price × apr/100`.
 *
 * Returns `null` — not zero — whenever the estimate would be meaningless: a
 * missing/unparseable input, or a zero quantity, price or rate. The UI shows
 * the reward description instead in that case, never "≈ $0/yr".
 */
export function estimateYearlyUsd(
  qty: BigNumber.Value | null | undefined,
  priceUsd: BigNumber.Value | null | undefined,
  aprPct: BigNumber.Value | null | undefined,
): BigNumber | null {
  const quantity = toPositiveBn(qty)
  const price = toPositiveBn(priceUsd)
  const apr = toPositiveBn(aprPct)
  if (!quantity || !price || !apr) return null

  return quantity.times(price).times(apr.dividedBy(BN_HUNDRED))
}

/**
 * A non-zero, finite BigNumber or `null`. Campaign rows are free text from the
 * web, so a value can be absent or junk; `bn()` throws on junk (bignumber.js
 * v10 rejects unparseable input), hence the guard.
 */
function toPositiveBn(value: BigNumber.Value | null | undefined): BigNumber | null {
  if (value === null || value === undefined || value === "") return null
  try {
    const parsed = bn(value)
    return parsed.isFinite() && !parsed.isZero() ? parsed : null
  } catch {
    return null
  }
}

/** A campaign whose deadline has passed. Rows without a deadline never expire. */
export function isExpired(
  campaign: Campaign,
  today: string = homeDayIso(),
): boolean {
  if (!campaign.deadline) return false
  return campaign.deadline < today
}

/**
 * The "ends soon" cue: a deadline inside the next {@link DEADLINE_SOON_DAYS}
 * days (today counts). An already-expired row is not "soon" — it's expired.
 */
export function isDeadlineSoon(
  campaign: Campaign,
  today: string = homeDayIso(),
): boolean {
  if (!campaign.deadline) return false
  const days = daysBetweenIsoDays(today, campaign.deadline)
  if (Number.isNaN(days)) return false
  return days >= 0 && days <= DEADLINE_SOON_DAYS
}

/**
 * Whether the latest successful run is old enough to warn about — strictly
 * older than {@link CAMPAIGN_STALENESS_DAYS}. `ranAt` is a full timestamp.
 */
export function isRunStale(
  ranAt: string | null | undefined,
  today: Date = new Date(),
): boolean {
  if (!ranAt) return false
  const ran = Date.parse(ranAt)
  if (Number.isNaN(ran)) return false
  return (today.getTime() - ran) / MS_PER_DAY > CAMPAIGN_STALENESS_DAYS
}

/**
 * Split a run's rows into live and expired. Expired rows are hidden behind a
 * toggle rather than dropped, so the page needs both sides (and the count).
 */
export function partitionExpired(
  campaigns: Campaign[],
  today: string = homeDayIso(),
): { active: Campaign[]; expired: Campaign[] } {
  const active: Campaign[] = []
  const expired: Campaign[] = []
  for (const campaign of campaigns) {
    if (isExpired(campaign, today)) expired.push(campaign)
    else active.push(campaign)
  }
  return { active, expired }
}

/** Descending compare that always sorts `null` last, whatever the direction. */
function compareDescNullsLast(
  a: BigNumber | number | null,
  b: BigNumber | number | null,
): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return bn(b).comparedTo(bn(a)) ?? 0
}

/**
 * The three groups of the Campaigns page, in spec order:
 *
 * 1. `held` — ticker is one the user holds (balance > 0), sorted by the
 *    estimated yearly USD reward, highest first; rows with no estimate last.
 * 2. `stablecoin` — of what's left, the rows flagged stablecoin.
 * 3. `considering` — the rest, APR desc, rate-less rows last.
 *
 * A held stablecoin lands in bucket 1, never twice: the buckets are a
 * partition. Sorting is stable, so equal keys keep the input order.
 *
 * `estimateFor` supplies the per-row estimate (the page closes over holdings
 * and cached prices); omit it and bucket 1 falls back to APR order.
 */
export function groupCampaigns(
  campaigns: Campaign[],
  heldTickers: Set<string>,
  estimateFor?: (campaign: Campaign) => BigNumber | null,
): CampaignGroups {
  const held: Campaign[] = []
  const stablecoin: Campaign[] = []
  const considering: Campaign[] = []

  for (const campaign of campaigns) {
    if (heldTickers.has(campaign.asset_ticker.toUpperCase())) held.push(campaign)
    else if (campaign.is_stablecoin) stablecoin.push(campaign)
    else considering.push(campaign)
  }

  const estimate = estimateFor ?? ((c: Campaign) => (c.apr === null ? null : bn(c.apr)))
  const estimates = new Map<string, BigNumber | null>()
  for (const campaign of held) estimates.set(campaign.id, estimate(campaign))

  held.sort((a, b) =>
    compareDescNullsLast(estimates.get(a.id) ?? null, estimates.get(b.id) ?? null),
  )
  considering.sort((a, b) => compareDescNullsLast(a.apr, b.apr))

  return { held, stablecoin, considering }
}

/**
 * Render a rate with its kind: `12%`, `up to 12%`, `12% variable`. Trailing
 * zeros are trimmed so a flat 5% doesn't read as "5.00%".
 */
export function formatApr(
  apr: number | null,
  kind: Campaign["apr_kind"],
): string | null {
  if (apr === null) return null
  const value = bn(apr)
  if (!value.isFinite()) return null
  const percent = `${value.decimalPlaces(APR_DISPLAY_DECIMALS).toFixed()}%`
  if (!kind) return percent
  return `${APR_KIND_PREFIX[kind]}${percent}${APR_KIND_SUFFIX[kind]}`
}
