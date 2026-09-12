import { useMemo, useState } from "react"
import { Link } from "react-router"
import { ArrowRight, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  alertSentence,
  formatPositionRate,
} from "@/components/interest/display"
import { useAssetsContext } from "@/contexts/AssetsContext"
import { useInterestContext } from "@/contexts/InterestContext"
import { usePlatformsContext } from "@/contexts/PlatformsContext"
import { homeDayIso } from "@/lib/config"
import {
  INTEREST_ALERT_CLASSES,
  INTEREST_ALERT_DISMISS_KEY,
  INTEREST_ALERT_NAMED_LIMIT,
  INTEREST_COPY,
  INTEREST_ROUTE,
  INTEREST_STATUS,
} from "@/lib/constants/interest"
import { openPositions, positionStatus, sortPositions } from "@/lib/interest"
import { formatAmount } from "@/lib/prices"
import { cn } from "@/lib/utils"
import type { Asset, InterestPosition } from "@/types/database"

/**
 * The dashboard warnings (Component 16, surface 4): one compact banner per loud
 * status, above the fold. Expired is the louder of the two — the money may be
 * idle or have auto-renewed at a worse rate; ends-soon is the "decide before it
 * rolls" nudge.
 *
 * Dismissal is session-scoped on purpose: this is a nudge, not a task list, so
 * it must come back on the next visit if nothing was done. The flag is read
 * once in a `useState` initializer, so it survives navigation and dies with the
 * tab.
 */
export function InterestAlerts() {
  const { positions } = useInterestContext()
  const { assets } = useAssetsContext()
  const { platforms } = usePlatformsContext()

  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(INTEREST_ALERT_DISMISS_KEY) === "true",
  )

  const today = homeDayIso()

  const { expired, endsSoon } = useMemo(() => {
    const live = sortPositions(openPositions(positions), today)
    return {
      expired: live.filter(
        (p) => positionStatus(p, today) === INTEREST_STATUS.expired,
      ),
      endsSoon: live.filter(
        (p) => positionStatus(p, today) === INTEREST_STATUS.ends_soon,
      ),
    }
  }, [positions, today])

  if (dismissed || (expired.length === 0 && endsSoon.length === 0)) return null

  function dismiss() {
    sessionStorage.setItem(INTEREST_ALERT_DISMISS_KEY, "true")
    setDismissed(true)
  }

  const assetOf = (p: InterestPosition) =>
    assets.find((a) => a.id === p.asset_id)
  const platformOf = (p: InterestPosition) =>
    platforms.find((pl) => pl.id === p.platform_id)?.name ?? "—"

  return (
    <div className="space-y-2">
      <AlertBanner
        title={INTEREST_COPY.alertExpiredTitle}
        guidance={INTEREST_COPY.alertExpiredGuidance}
        tone="expired"
        positions={expired}
        today={today}
        assetOf={assetOf}
        platformOf={platformOf}
        onDismiss={dismiss}
      />
      <AlertBanner
        title={INTEREST_COPY.alertEndsSoonTitle}
        guidance={INTEREST_COPY.alertEndsSoonGuidance}
        tone="ends_soon"
        positions={endsSoon}
        today={today}
        assetOf={assetOf}
        platformOf={platformOf}
        onDismiss={dismiss}
      />
    </div>
  )
}

interface AlertBannerProps {
  title: string
  guidance: string
  tone: keyof typeof INTEREST_ALERT_CLASSES
  positions: InterestPosition[]
  today: string
  assetOf: (p: InterestPosition) => Asset | undefined
  platformOf: (p: InterestPosition) => string
  onDismiss: () => void
}

function AlertBanner({
  title,
  guidance,
  tone,
  positions,
  today,
  assetOf,
  platformOf,
  onDismiss,
}: AlertBannerProps) {
  if (positions.length === 0) return null

  const named = positions.slice(0, INTEREST_ALERT_NAMED_LIMIT)
  const rest = positions.length - named.length

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        INTEREST_ALERT_CLASSES[tone],
      )}
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-0.5">
          <p className="font-medium">{title}</p>
          <p className="text-xs opacity-80">{guidance}</p>
        </div>
        <ul className="divide-y divide-current/10">
          {named.map((position) => {
            const asset = assetOf(position)
            const ticker = asset?.ticker ?? "—"
            const platform = platformOf(position)
            const rate = formatPositionRate(position)

            return (
              <li
                key={position.id}
                className="grid gap-2 py-2 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p>
                    {alertSentence(position, ticker, platform, today)}
                  </p>
                  <p className="text-xs opacity-80">
                    {INTEREST_COPY.alertCommittedPrefix}{" "}
                    <span className="tabular-nums">
                      {formatAmount(position.quantity, asset?.category ?? "")}{" "}
                      {ticker}
                    </span>
                    {rate ? ` · ${rate}` : ""}
                    {position.label ? ` · ${position.label}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link
                      to={INTEREST_ROUTE.assetDetail(position.asset_id)}
                      aria-label={`${INTEREST_COPY.alertReviewAction}: ${ticker} on ${platform}`}
                    />
                  }
                  className="w-full bg-background/60 sm:w-auto"
                >
                  {INTEREST_COPY.alertReviewAction}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            )
          })}
          {rest > 0 && (
            <li className="pt-2 text-xs opacity-80">
              {INTEREST_COPY.alertAndMorePrefix}
              {rest}
              {INTEREST_COPY.alertAndMoreSuffix}
            </li>
          )}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label={INTEREST_COPY.alertDismiss}
        className="-mt-2 -mr-2"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
