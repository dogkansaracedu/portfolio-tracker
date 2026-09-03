import type BigNumber from "bignumber.js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PROJECTION_BAND,
  valueAtMonthsFromNow,
  type PlanMilestone,
  type Projection,
  type ProjectionBand,
} from "@/lib/retirement"
import { BN_ZERO } from "@/lib/config"
import { depletionAge } from "./chartSeries"
import {
  BAND_LABELS,
  BAND_CAPTION,
  DEPLETED_AT_LABEL,
  MILESTONE_COLUMN_LABELS,
  MILESTONES_CAPTION,
  MILESTONES_TITLE,
  PROJECTION_PHASE_LABELS,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import { formatAge, type RetirementDisplay } from "./display"

/**
 * The Plan chart's figures as a table: what the portfolio is worth at the ages
 * that frame the plan, without hovering the line. Values are read out of the
 * SAME three band projections the chart drew — nothing is re-projected here.
 */

const BANDS: ProjectionBand[] = [
  PROJECTION_BAND.pessimistic,
  PROJECTION_BAND.base,
  PROJECTION_BAND.optimistic,
]

interface Props {
  milestones: PlanMilestone[]
  projections: Record<ProjectionBand, Projection>
  startingAmountUsd: BigNumber
  /** Needed to name the age a depleted band ran out at. */
  currentAge: number
  display: RetirementDisplay
}

export function PlanMilestones({
  milestones,
  projections,
  startingAmountUsd,
  currentAge,
  display,
}: Props) {
  if (milestones.length === 0) return null

  // Displayed values are floored at zero (a portfolio is never worth a
  // negative amount); a band that has run out says so by age instead.
  const cell = (milestone: PlanMilestone, band: ProjectionBand) => {
    const value = valueAtMonthsFromNow(
      projections[band],
      milestone.monthsFromNow,
      startingAmountUsd,
    )
    if (value.lte(0)) {
      const age = depletionAge(projections[band], currentAge)
      return age === null ? display.money(BN_ZERO) : DEPLETED_AT_LABEL(formatAge(age))
    }
    return display.money(value, milestone.monthsFromNow)
  }
  const money = cell

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{MILESTONES_TITLE}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {MILESTONES_CAPTION} {BAND_CAPTION}
          {display.isReal && ` Shown in ${TODAYS_PURCHASING_POWER}.`}
        </p>
      </CardHeader>
      <CardContent>
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{MILESTONE_COLUMN_LABELS.age}</TableHead>
                <TableHead>{MILESTONE_COLUMN_LABELS.phase}</TableHead>
                {BANDS.map((band) => (
                  <TableHead key={band} className="text-right">
                    {BAND_LABELS[band]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((milestone) => (
                <TableRow key={milestone.age}>
                  <TableCell className="font-medium tabular-nums">
                    {formatAge(milestone.age)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {PROJECTION_PHASE_LABELS[milestone.phase]}
                  </TableCell>
                  {BANDS.map((band) => (
                    <TableCell
                      key={band}
                      className={
                        band === PROJECTION_BAND.base
                          ? "text-right font-semibold tabular-nums"
                          : "text-right tabular-nums text-muted-foreground"
                      }
                    >
                      {money(milestone, band)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {milestones.map((milestone) => (
            <div key={milestone.age} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {MILESTONE_COLUMN_LABELS.age} {formatAge(milestone.age)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {PROJECTION_PHASE_LABELS[milestone.phase]}
                  </span>
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {money(milestone, PROJECTION_BAND.base)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                <dt>{BAND_LABELS[PROJECTION_BAND.pessimistic]}</dt>
                <dd className="text-right tabular-nums">
                  {money(milestone, PROJECTION_BAND.pessimistic)}
                </dd>
                <dt>{BAND_LABELS[PROJECTION_BAND.optimistic]}</dt>
                <dd className="text-right tabular-nums">
                  {money(milestone, PROJECTION_BAND.optimistic)}
                </dd>
              </dl>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
