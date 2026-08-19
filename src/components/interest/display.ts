import { formatApr } from "@/lib/campaigns"
import { homeDayIso } from "@/lib/config"
import { INTEREST_COPY, type InterestStatus } from "@/lib/constants/interest"
import { daysUntil } from "@/lib/interest"
import type { InterestPosition } from "@/types/database"

/**
 * Component 16 — render-side wording. Kept out of the components (which carry
 * no copy of their own) and out of `lib/interest.ts` (which stays pure logic
 * with no phrasing in it). Every literal comes from `INTEREST_COPY`.
 */

/** "Aug 19, 2026" from a `YYYY-MM-DD` day. */
export function formatInterestDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function statusLabel(status: InterestStatus): string {
  return INTEREST_COPY.statusLabels[status]
}

/** "5.25% variable" — reuses the campaigns rate formatter. Null when unrated. */
export function formatPositionRate(
  position: Pick<InterestPosition, "apr" | "apr_kind">,
): string | null {
  return formatApr(position.apr, position.apr_kind)
}

/** "3 days" / "1 day". */
function dayCount(days: number): string {
  const unit = days === 1 ? INTEREST_COPY.dayUnit : INTEREST_COPY.daysUnit
  return `${days} ${unit}`
}

/**
 * How the end date reads next to a position: "12 days left",
 * "Expired 3 days ago", "Flexible". Today is *ends soon*, never expired.
 */
export function expiryPhrase(
  position: Pick<InterestPosition, "expires_at">,
  today: string = homeDayIso(),
): string {
  const days = daysUntil(position.expires_at, today)
  if (days === null) return INTEREST_COPY.statusLabels.flexible
  if (days < 0) {
    return `${INTEREST_COPY.statusLabels.expired} ${dayCount(-days)}${INTEREST_COPY.expiredPhraseSuffix}`
  }
  if (days === 0) return INTEREST_COPY.endsTodayPhrase
  return `${dayCount(days)}${INTEREST_COPY.daysLeftSuffix}`
}

/**
 * The dashboard sentence: "Your BTC position on OKX TR expired 3 days ago" /
 * "…ends in 5 days". Names the asset and the platform, because that is what the
 * user needs to act on.
 */
export function alertSentence(
  position: Pick<InterestPosition, "expires_at">,
  assetTicker: string,
  platformName: string,
  today: string = homeDayIso(),
): string {
  const days = daysUntil(position.expires_at, today)
  const subject = `${INTEREST_COPY.alertSentencePrefix}${assetTicker}${INTEREST_COPY.alertSentenceMiddle}${platformName} `

  if (days === null) return `${subject}${INTEREST_COPY.statusLabels.flexible}`
  if (days < 0) {
    return `${subject}${INTEREST_COPY.expiredPhrasePrefix}${dayCount(-days)}${INTEREST_COPY.expiredPhraseSuffix}`
  }
  if (days === 0) return `${subject}${INTEREST_COPY.endsTodayPhrase}`
  return `${subject}${INTEREST_COPY.endsPhrasePrefix}${dayCount(days)}`
}
