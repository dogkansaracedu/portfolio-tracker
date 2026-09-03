import { Percent } from "lucide-react"
import { Link } from "react-router"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useInterestContext } from "@/contexts/InterestContext"
import { homeDayIso } from "@/lib/config"
import {
  INTEREST_COPY,
  INTEREST_SECTION_ANCHOR,
  INTEREST_STATUS_CLASSES,
} from "@/lib/constants/interest"
import { positionStatus, summarizeAssetInterest } from "@/lib/interest"
import { cn } from "@/lib/utils"
import {
  expiryPhrase,
  formatInterestDay,
  formatPositionRate,
  statusLabel,
} from "./display"

/**
 * The Portfolio page's per-row glance (Component 16, surface 1): a small pill
 * saying this asset has something earning, tinted by the loudest status among
 * its open positions, with the per-position detail behind it.
 *
 * The detail is a `Popover`, not a `Tooltip`: the badge sits inside the row's
 * link, so on a phone a hover-only panel is unreachable — a tap would just
 * navigate. The trigger is a real `<button>` that stops the event before the
 * link sees it, and the panel offers the deliberate way in ("View", straight to
 * the asset's Earning section).
 *
 * The tint is a STATUS cue and deliberately not `gainLossClass` — an interest
 * position is neither a gain nor a loss, and the row's own return column owns
 * that meaning. Rows with no open position render nothing at all.
 */
export function InterestBadge({ assetId }: { assetId: string }) {
  const { positions } = useInterestContext()
  const today = homeDayIso()
  const summary = summarizeAssetInterest(positions, assetId, today)
  if (!summary) return null

  const rate = formatPositionRate(summary.leading)
  const extra = summary.positions.length - 1

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${INTEREST_COPY.badgeAriaPrefix} ${rate ?? ""}`.trim()}
            // The row is a link: keep the tap here instead of navigating.
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            className={cn(
              // The one control on this row that *must* be tapped, so it carries
              // the same 40px box the rest of the pass got — pulled back
              // with a negative margin so the pill itself stays a pill.
              "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium tabular-nums",
              "max-sm:-my-2.5 max-sm:min-h-10",
              INTEREST_STATUS_CLASSES[summary.status],
            )}
          />
        }
      >
        <Percent className="size-2.5" />
        {rate ?? INTEREST_COPY.badgeNoRate}
        {extra > 0 && (
          <span className="opacity-70">
            {INTEREST_COPY.badgeTooltipMorePrefix}
            {extra}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-64 gap-1.5 text-xs">
        <div className="flex flex-col gap-1">
          {summary.positions.map((p) => {
            const status = positionStatus(p, today)
            return (
              <div key={p.id} className="whitespace-nowrap">
                {formatPositionRate(p) ?? INTEREST_COPY.noRate}
                {" \u00b7 "}
                {p.expires_at
                  ? `${formatInterestDay(p.expires_at)} \u00b7 ${expiryPhrase(p, today)}`
                  : statusLabel(status)}
              </div>
            )
          })}
        </div>
        <Link
          to={`/assets/${assetId}#${INTEREST_SECTION_ANCHOR}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {INTEREST_COPY.badgeViewLink}
        </Link>
      </PopoverContent>
    </Popover>
  )
}
