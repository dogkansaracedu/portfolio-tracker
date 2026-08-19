import type BigNumber from "bignumber.js"
import {
  daysBetweenIsoDays,
  estimateYearlyUsd,
  isoDayToUtcMs,
} from "@/lib/campaigns"
import { bn, homeDayIso } from "@/lib/config"
import { PROGRAM_TYPE_LABELS } from "@/lib/constants/campaigns"
import {
  INTEREST_DAYS_PER_YEAR,
  INTEREST_ENDS_SOON_DAYS,
  INTEREST_STATUS,
  INTEREST_STATUS_RANK,
  INTEREST_WARNING_STATUSES,
  type AprKind,
  type InterestStatus,
} from "@/lib/constants/interest"
import type { Campaign, InterestPosition, Platform } from "@/types/database"

/**
 * Component 16 — Interest Positions: the pure read-time logic.
 *
 * Status is derived from the end date on every read and never stored (a stored
 * status is wrong the morning after it was written). Estimates are BigNumber
 * throughout and delegate to the campaigns module's `estimateYearlyUsd`, so
 * "qty × price × apr/100" and the "null, never $0" rule have one implementation.
 *
 * Nothing here imports the P&L engine, `usePnL` or holdings: an interest
 * position is a note, never a ledger entry. That boundary is enforced by
 * construction.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** The end-date-bearing slice of a position — lets the helpers take literals. */
export interface PositionTerm {
  started_at: string
  expires_at: string | null
}

/**
 * Whole days from today until `day`. `null` for a missing date **and for an
 * unparseable one**: an unreadable date must never masquerade as a deadline.
 * Negative = the day is in the past.
 */
export function daysUntil(
  day: string | null | undefined,
  today: string = homeDayIso(),
): number | null {
  if (!day) return null
  const days = daysBetweenIsoDays(today, day)
  return Number.isFinite(days) ? days : null
}

/**
 * The status ladder, from the end date alone:
 *
 * | flexible | no end date (also the safe answer for an unreadable one) |
 * | expired  | the end date is in the past |
 * | ends soon| today, or within the next {@link INTEREST_ENDS_SOON_DAYS} days |
 * | active   | anything further out |
 */
export function positionStatus(
  position: Pick<InterestPosition, "expires_at">,
  today: string = homeDayIso(),
): InterestStatus {
  const days = daysUntil(position.expires_at, today)
  if (days === null) return INTEREST_STATUS.flexible
  if (days < 0) return INTEREST_STATUS.expired
  if (days <= INTEREST_ENDS_SOON_DAYS) return INTEREST_STATUS.ends_soon
  return INTEREST_STATUS.active
}

/** The two statuses the dashboard warns about. */
export function isWarningStatus(status: InterestStatus): boolean {
  return INTEREST_WARNING_STATUSES.includes(status)
}

/** `YYYY-MM-DD`, `days` after `day`. Empty string for an unparseable input. */
export function addDays(day: string, days: number): string {
  const ms = isoDayToUtcMs(day)
  if (Number.isNaN(ms)) return ""
  return new Date(ms + days * MS_PER_DAY).toISOString().slice(0, 10)
}

// ─── Estimates ──────────────────────────────────────────────────────

/**
 * What the position pays in a year: `quantity × price × apr/100`. Null — never
 * zero — when the rate, the price or the quantity is missing, junk or zero.
 * A display-time projection: never booked, never accrued, never in any P&L.
 */
export function estimatePositionYearlyUsd(
  position: Pick<InterestPosition, "quantity" | "apr">,
  priceUsd: number | null | undefined,
): BigNumber | null {
  return estimateYearlyUsd(position.quantity, priceUsd, position.apr)
}

/**
 * The same figure prorated over `started_at → expires_at`. Null for a flexible
 * position (no term), a zero/negative-length term, or whenever the yearly
 * estimate itself is null.
 */
export function estimatePositionTermUsd(
  position: Pick<InterestPosition, "quantity" | "apr"> & PositionTerm,
  priceUsd: number | null | undefined,
): BigNumber | null {
  const yearly = estimatePositionYearlyUsd(position, priceUsd)
  if (!yearly) return null
  const termDays = positionTermDays(position)
  if (termDays === null || termDays <= 0) return null
  return yearly.times(bn(termDays).dividedBy(INTEREST_DAYS_PER_YEAR))
}

/** Whole days the term runs for. Null when flexible or unparseable. */
export function positionTermDays(position: PositionTerm): number | null {
  if (!position.expires_at) return null
  const days = daysBetweenIsoDays(position.started_at, position.expires_at)
  return Number.isFinite(days) ? days : null
}

// ─── Selection & ordering ───────────────────────────────────────────

/** Live positions only. Closed ones are history: never listed by default,
 *  never warned about. */
export function openPositions(positions: InterestPosition[]): InterestPosition[] {
  return positions.filter((p) => !p.is_closed)
}

/**
 * Display order everywhere: expired first, then ends-soon, then by end date
 * ascending, flexible last. Stable, so equal keys keep the input order — which
 * is why {@link summarizeAssetInterest} can take the head of the sorted list as
 * both the loudest status and the position to lead with.
 */
export function sortPositions(
  positions: InterestPosition[],
  today: string = homeDayIso(),
): InterestPosition[] {
  return [...positions].sort((a, b) => {
    const rankDiff =
      INTEREST_STATUS_RANK[positionStatus(a, today)] -
      INTEREST_STATUS_RANK[positionStatus(b, today)]
    if (rankDiff !== 0) return rankDiff
    if (a.expires_at === b.expires_at) return 0
    if (!a.expires_at) return 1
    if (!b.expires_at) return -1
    return a.expires_at < b.expires_at ? -1 : 1
  })
}

export interface AssetInterestSummary {
  /** This asset's open positions, in display order. Never empty. */
  positions: InterestPosition[]
  /** The loudest status among them — what tints the portfolio-row badge. */
  status: InterestStatus
  /** The head of the sorted list: the one the badge names. */
  leading: InterestPosition
}

/**
 * What the Portfolio row's badge needs for one asset, or null when the asset
 * has no open position (the row then shows nothing at all).
 */
export function summarizeAssetInterest(
  positions: InterestPosition[],
  assetId: string,
  today: string = homeDayIso(),
): AssetInterestSummary | null {
  const mine = openPositions(positions).filter((p) => p.asset_id === assetId)
  if (mine.length === 0) return null
  const sorted = sortPositions(mine, today)
  return {
    positions: sorted,
    status: positionStatus(sorted[0], today),
    leading: sorted[0],
  }
}

// ─── Campaign → position prefill ────────────────────────────────────

/** Everything the shared dialog can be seeded with. All optional: a campaign
 *  card knows the platform/rate/term but not the asset; the asset-detail
 *  section knows only the asset. */
export interface PositionPrefill {
  assetId?: string
  platformId?: string
  quantity?: string
  apr?: string
  aprKind?: AprKind
  label?: string
  startedAt?: string
  expiresAt?: string
  campaignId?: string
  note?: string
}

/** Lower-case alphanumerics only — "OKX TR" and "okx-tr" must compare equal. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * The user's platform whose name resembles a campaign's free-text platform.
 * Exact match first; otherwise the **shortest** containment match either way,
 * so a campaign on "OKX" resolves to "OKX" over "OKX TR" when both exist.
 * Null when nothing resembles it — the dialog then asks.
 */
export function matchPlatformByName(
  name: string | null | undefined,
  platforms: Platform[],
): Platform | null {
  const target = normalizeName(name ?? "")
  if (!target) return null

  let best: { platform: Platform; length: number } | null = null
  for (const platform of platforms) {
    const candidate = normalizeName(platform.name)
    if (!candidate) continue
    if (candidate === target) return platform
    if (!candidate.includes(target) && !target.includes(candidate)) continue
    if (!best || candidate.length < best.length) {
      best = { platform, length: candidate.length }
    }
  }
  return best?.platform ?? null
}

/**
 * Seed a new position from a campaign card. The end date comes from
 * `lock_days` (today + lock days) in preference to the campaign's `deadline` —
 * a deadline is when you may *join*, not when the money comes back.
 *
 * The asset and quantity are deliberately absent: a campaign row's ticker is
 * free text that may not exist in the catalog at all, so the user supplies both.
 */
export function buildPositionPrefill(
  campaign: Campaign,
  platforms: Platform[],
  today: string = homeDayIso(),
): PositionPrefill {
  const lockDays = campaign.lock_days
  const expiresAt =
    lockDays && lockDays > 0
      ? addDays(today, lockDays)
      : (campaign.deadline ?? undefined)

  return {
    platformId: matchPlatformByName(campaign.platform, platforms)?.id,
    apr: campaign.apr === null ? undefined : String(campaign.apr),
    aprKind: campaign.apr_kind ?? undefined,
    label: `${campaign.platform} ${PROGRAM_TYPE_LABELS[campaign.program_type]}`,
    startedAt: today,
    expiresAt: expiresAt || undefined,
    campaignId: campaign.id,
  }
}
