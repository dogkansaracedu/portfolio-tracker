import { Percent } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useInterestContext } from "@/contexts/InterestContext"
import { homeDayIso } from "@/lib/config"
import {
  INTEREST_COPY,
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
 * its open positions, with the per-position detail on hover.
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
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={`${INTEREST_COPY.badgeAriaPrefix} ${rate ?? ""}`.trim()}
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium tabular-nums",
              INTEREST_STATUS_CLASSES[summary.status],
            )}
          >
            <Percent className="size-2.5" />
            {rate ?? INTEREST_COPY.badgeNoRate}
            {extra > 0 && (
              <span className="opacity-70">
                {INTEREST_COPY.badgeTooltipMorePrefix}
                {extra}
              </span>
            )}
          </span>
        }
      />
      <TooltipContent>
        <div className="flex flex-col gap-1">
          {summary.positions.map((p) => {
            const status = positionStatus(p, today)
            return (
              <div key={p.id} className="whitespace-nowrap">
                {formatPositionRate(p) ?? INTEREST_COPY.noRate}
                {" · "}
                {p.expires_at
                  ? `${formatInterestDay(p.expires_at)} · ${expiryPhrase(p, today)}`
                  : statusLabel(status)}
              </div>
            )
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
