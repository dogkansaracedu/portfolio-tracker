import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HintPopover } from "@/components/common/HintPopover"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { VEHICLE_COPY } from "@/lib/constants/vehicle"
import {
  DEFAULT_CURRENCY,
  isFiatCurrency,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import { formatCurrency, obfuscate } from "@/lib/prices"
import type { Vehicle } from "@/types/database"
import type { OpportunityCost, OwnershipCost } from "@/lib/vehicle"
import { DECIMALS } from "@/lib/config"
import { NO_DATA, formatKm, formatMonths } from "@/components/vehicle/display"

interface Props {
  cost: OwnershipCost
  opportunity: OpportunityCost | null
  /** The car, for the two hand-typed facts (purchase price, current value)
   *  that render in their OWN recorded currency rather than the display one —
   *  the same rule the ledger follows for a single entry's amount. Converting
   *  them here made the current value disagree with the readings card. */
  vehicle: Vehicle
  /** True when the car has no recorded current value — the reason the capital
   *  half of every figure is missing. */
  valueMissing: boolean
}

/** One label-over-figure cell. `muted` marks a derived or secondary reading. */
function Figure({
  label,
  value,
  hint,
  note,
  strong = false,
}: {
  label: string
  value: string
  hint?: string
  /** A qualifier under the figure — what it excludes, or why it is partial. */
  note?: string
  strong?: boolean
}) {
  return (
    <div className="space-y-0.5">
      {/* EVERY label row reserves the height of the tallest one: a
          `HintPopover` trigger is a 40px tap target on a phone against a bare
          label's 16px, so matching only the bare rows still left the figures
          in a row off their shared baseline — in the one card whose argument
          is that cash and depreciation are comparable halves. */}
      <div className="flex min-h-6 items-center gap-1 text-xs text-muted-foreground max-sm:min-h-10">
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
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
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
export function CostOfOwnershipCard({
  cost,
  opportunity,
  vehicle,
  valueMissing,
}: Props) {
  const { money, obfuscated } = useDisplayMoney()

  /** Whether an anchored equivalent is worth printing beside a stored amount —
   *  it says nothing when the amount is already in the anchor. */
  const isForeign = (currency: string | null) =>
    (currency ?? DEFAULT_CURRENCY) !== DEFAULT_CURRENCY

  /** A stored amount in the currency it was actually recorded in. */
  const own = (amount: number, currency: string | null) =>
    obfuscate(
      formatCurrency(
        amount,
        isFiatCurrency(currency ?? "")
          ? (currency as FiatCurrency)
          : DEFAULT_CURRENCY,
      ),
      obfuscated,
    )

  /** Quoted per 100 km, not per km: at 2dp a per-km figure printed
   *  "$0.01 / km", which is indistinguishable from $0.005 or $0.014 — a
   *  threefold range in one printed digit, for one of the two denominators the
   *  whole card rests on. 100 km is also the unit the fuel card already uses. */
  const perKm = (usd: number | null) =>
    usd === null ? NO_DATA : `${money(usd * 100)} ${VEHICLE_COPY.per100km}`
  const perMonth = (usd: number | null) =>
    usd === null ? NO_DATA : `${money(usd)} ${VEHICLE_COPY.perMonthSuffix}`

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
          <Figure
            label={VEHICLE_COPY.cashCost}
            value={money(cost.cashUsd)}
            /* A total that quietly omits three entries looks complete. */
            note={
              cost.unpricedEntries > 0
                ? `${cost.unpricedEntries} ${VEHICLE_COPY.unpricedNote}`
                : undefined
            }
          />
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

        {/* The two denominators and the capital block below both fit in one
            band from `xl`, where each was previously a full-width row holding
            three figures. */}
        <div className="grid gap-x-8 gap-y-4 border-t pt-3 xl:grid-cols-2">
          <div className="space-y-2">
            {/* Only earns its place at `xl`, where it is what aligns this
                block's first figure row with the capital block's beside it.
                Below `xl` the two are stacked and separated by a rule, so the
                heading is redundant — and it cost 28px of a phone screen. */}
            <div className="hidden min-h-6 items-center gap-1 text-xs font-medium xl:flex">
              {VEHICLE_COPY.runningCostHeading}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Figure
                label={VEHICLE_COPY.perMonth}
                value={perMonth(cost.fixedPerMonthUsd)}
              />
              <Figure
                label={VEHICLE_COPY.perKm}
                value={perKm(cost.variablePerKmUsd)}
                hint={VEHICLE_COPY.perKmHint}
              />
              <Figure
                label={VEHICLE_COPY.blendedPerKm}
                value={perKm(cost.blendedPerKmUsd)}
                hint={VEHICLE_COPY.blendedPerKmHint}
              />
            </div>

            {/* The denominators themselves, stated — a per-km figure without its
            distance is the number AAA warns about. */}
            <p className="text-xs text-muted-foreground">
              {VEHICLE_COPY.kmDriven}: {formatKm(cost.kmDriven)}
              {" · "}
              {VEHICLE_COPY.monthsOwned} {formatMonths(cost.monthsOwned)}
              {/* Fixed + variable no longer covers every outlay: a tow, a fine
              and a car-park fee are in neither rate, because dividing a
              one-off by the months owned would print it as something that
              recurs. Said out loud rather than left as a gap between the two
              rates and the total — the blended figure does include it. */}
              {cost.incidentalUsd > 0 && (
                <>
                  {" · "}
                  {VEHICLE_COPY.incidental} {money(cost.incidentalUsd)} (
                  {VEHICLE_COPY.incidentalNote})
                </>
              )}
              {" · "}
              {VEHICLE_COPY.purchasePrice.toLowerCase()}{" "}
              {own(Number(vehicle.purchase_price), vehicle.purchase_currency)}
              {/* The anchored equivalent, at the rate on that day. Without it the
              depreciation figure above cannot be checked against the two
              numbers printed under it: the operands are lira and the
              difference is dollars, which is the whole point but reads as an
              error when only one side is shown. */}
              {isForeign(vehicle.purchase_currency) && (
                <>
                  {" "}
                  ({money(cost.purchaseUsd)} {VEHICLE_COPY.atTheTime})
                </>
              )}
              {vehicle.current_value !== null && (
                <>
                  {" · "}
                  {VEHICLE_COPY.currentValue.toLowerCase()}{" "}
                  {own(
                    Number(vehicle.current_value),
                    vehicle.current_value_currency,
                  )}
                  {isForeign(vehicle.current_value_currency) &&
                    cost.currentValueUsd !== null && (
                      <>
                        {" "}
                        ({money(cost.currentValueUsd)} {VEHICLE_COPY.atTheTime})
                      </>
                    )}
                </>
              )}
            </p>
          </div>

          {/* Capital tied up. Kept visually apart because it is not money spent —
            it is money not made, and merging it into the total above would
            overstate what left the bank account. */}
          <div className="space-y-2 border-t pt-3 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
            {/* Same weight and same reserved height as the running-cost
                heading opposite: at `xl` these two sit in one visual row, and
                a lighter, shorter heading here made this read as a fourth
                denominator label whose value had gone missing — and left its
                figures 8px off the ones beside them. */}
            <div className="flex min-h-6 items-center gap-1 text-xs font-medium">
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
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
                    /* Deliberately NOT `strong`. "Total cost" is the card's one
                       headline; this figure is larger but it is not a property
                       of the car — it moves with the portfolio's return, and it
                       shifted by a dollar between two page loads minutes apart.
                       Two competing answers to "what did this car cost me?",
                       with the market-dependent one shouting, is the wrong
                       hierarchy. */
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  At your lifetime{" "}
                  {opportunity.ratePct.toFixed(DECIMALS.percentageRate)}%/yr
                  over {formatMonths(opportunity.years * 12)} on{" "}
                  {money(opportunity.capitalUsd)}.
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
