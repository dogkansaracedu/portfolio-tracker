import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HintPopover } from "@/components/common/HintPopover"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { VEHICLE_COPY } from "@/lib/constants/vehicle"
import type { OpportunityCost, OwnershipCost } from "@/lib/vehicle"
import { DECIMALS } from "@/lib/config"
import {
  NO_DATA,
  formatKm,
  formatMonths,
} from "@/components/vehicle/display"

interface Props {
  cost: OwnershipCost
  opportunity: OpportunityCost | null
  /** True when the car has no recorded current value — the reason the capital
   *  half of every figure is missing. */
  valueMissing: boolean
}

/** One label-over-figure cell. `muted` marks a derived or secondary reading. */
function Figure({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        {hint && <HintPopover label={label} text={hint} />}
      </div>
      <p
        className={
          strong
            ? "text-xl font-semibold tabular-nums"
            : "text-sm font-medium tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  )
}

/**
 * The headline: what the car has really cost, split cash vs capital and
 * quoted in two denominators.
 *
 * Three deliberate choices, each answering something the comparators get
 * wrong:
 *
 *  - **Depreciation leads, beside cash.** Edmunds buries it sixth of seven
 *    rows despite it being a third of the total; here the two halves sit side
 *    by side, which is KBB's one clear advantage (out-of-pocket vs loss in
 *    value) kept without hiding the sum.
 *  - **Fixed per month, variable per km** (AAA's split), with the blended
 *    per-km figure last and never without the distance it assumes.
 *  - **A missing current value goes dark rather than optimistic.** With no
 *    value there is no depreciation, so there is no total — and a zero would
 *    understate the largest component of ownership cost.
 *
 * Every figure is USD-anchored internally and rendered through the app-wide
 * display currency; spending is not a loss, so no gain/loss palette here.
 */
export function CostOfOwnershipCard({ cost, opportunity, valueMissing }: Props) {
  const { money, obfuscated } = useDisplayMoney()

  const perKm = (usd: number | null) =>
    usd === null ? NO_DATA : `${money(usd)} / km`
  const perMonth = (usd: number | null) =>
    usd === null ? NO_DATA : `${money(usd)} / mo`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {VEHICLE_COPY.costHeading}
          <HintPopover
            label={VEHICLE_COPY.costHeading}
            text={VEHICLE_COPY.denominatorHint}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The two halves of the cost, then the sum. Two columns on a phone so
            cash and depreciation stay side by side — the comparison is the
            point — and three from `sm` up. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Figure label={VEHICLE_COPY.cashCost} value={money(cost.cashUsd)} />
          <Figure
            label={VEHICLE_COPY.depreciation}
            value={
              cost.depreciationUsd === null
                ? NO_DATA
                : money(cost.depreciationUsd)
            }
            hint={VEHICLE_COPY.depreciationHint}
          />
          <Figure
            label={VEHICLE_COPY.totalCost}
            value={cost.totalUsd === null ? NO_DATA : money(cost.totalUsd)}
            strong
          />
        </div>

        {valueMissing && (
          <p className="text-xs text-muted-foreground">
            {VEHICLE_COPY.valueMissing}
          </p>
        )}

        {/* The two denominators. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-3">
          <Figure
            label={VEHICLE_COPY.perMonth}
            value={perMonth(cost.fixedPerMonthUsd)}
          />
          <Figure
            label={VEHICLE_COPY.perKm}
            value={perKm(cost.variablePerKmUsd)}
          />
          <Figure
            label={VEHICLE_COPY.blendedPerKm}
            value={perKm(cost.blendedPerKmUsd)}
          />
        </div>

        {/* The denominators themselves, stated — a per-km figure without its
            distance is the number AAA warns about. */}
        <p className="text-xs text-muted-foreground">
          {VEHICLE_COPY.kmDriven}: {formatKm(cost.kmDriven)}
          {" · "}
          {VEHICLE_COPY.monthsOwned} {formatMonths(cost.monthsOwned)}
          {" · "}
          {VEHICLE_COPY.purchasePrice.toLowerCase()}{" "}
          {money(cost.purchaseUsd)}
          {cost.currentValueUsd !== null && (
            <>
              {" · "}
              {VEHICLE_COPY.currentValue.toLowerCase()}{" "}
              {money(cost.currentValueUsd)}
            </>
          )}
        </p>

        {/* Capital tied up. Separated by a rule because it is not money spent —
            it is money not made, and merging it into the total above would
            overstate what left the bank account. */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{VEHICLE_COPY.opportunityHeading}</span>
            <HintPopover
              label={VEHICLE_COPY.opportunityHeading}
              text={VEHICLE_COPY.opportunityHint}
            />
          </div>
          {opportunity === null ? (
            <p className="text-xs text-muted-foreground">
              {VEHICLE_COPY.opportunityUnavailable}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Figure
                  label={VEHICLE_COPY.opportunityCost}
                  value={money(opportunity.foregoneUsd)}
                />
                <Figure
                  label={VEHICLE_COPY.trueCost}
                  value={
                    opportunity.trueCostUsd === null
                      ? NO_DATA
                      : money(opportunity.trueCostUsd)
                  }
                  strong
                />
              </div>
              <p className="text-xs text-muted-foreground">
                At your lifetime{" "}
                {opportunity.ratePct.toFixed(DECIMALS.percentageRate)}%/yr over{" "}
                {opportunity.years.toFixed(1)} years
                {obfuscated ? "" : ` on ${money(opportunity.capitalUsd)}`}.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
