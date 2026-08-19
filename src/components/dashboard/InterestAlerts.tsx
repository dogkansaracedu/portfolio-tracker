import { useMemo, useState } from "react"
import { Link } from "react-router"
import { TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { alertSentence } from "@/components/interest/display"
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
import { cn } from "@/lib/utils"
import type { InterestPosition } from "@/types/database"

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

  const tickerOf = (p: InterestPosition) =>
    assets.find((a) => a.id === p.asset_id)?.ticker ?? "—"
  const platformOf = (p: InterestPosition) =>
    platforms.find((pl) => pl.id === p.platform_id)?.name ?? "—"

  return (
    <div className="space-y-2">
      <AlertBanner
        title={INTEREST_COPY.alertExpiredTitle}
        tone="expired"
        positions={expired}
        today={today}
        tickerOf={tickerOf}
        platformOf={platformOf}
        onDismiss={dismiss}
      />
      <AlertBanner
        title={INTEREST_COPY.alertEndsSoonTitle}
        tone="ends_soon"
        positions={endsSoon}
        today={today}
        tickerOf={tickerOf}
        platformOf={platformOf}
        onDismiss={dismiss}
      />
    </div>
  )
}

interface AlertBannerProps {
  title: string
  tone: keyof typeof INTEREST_ALERT_CLASSES
  positions: InterestPosition[]
  today: string
  tickerOf: (p: InterestPosition) => string
  platformOf: (p: InterestPosition) => string
  onDismiss: () => void
}

function AlertBanner({
  title,
  tone,
  positions,
  today,
  tickerOf,
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
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <ul className="space-y-0.5">
          {named.map((position) => (
            <li key={position.id}>
              <Link
                to={INTEREST_ROUTE.assetDetail(position.asset_id)}
                className="underline-offset-4 hover:underline"
              >
                {alertSentence(
                  position,
                  tickerOf(position),
                  platformOf(position),
                  today,
                )}
              </Link>
            </li>
          ))}
          {rest > 0 && (
            <li className="opacity-80">
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
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
