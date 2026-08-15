import { useMemo } from "react"
import BigNumber from "bignumber.js"
import { bn } from "@/lib/config"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { gainLossClass } from "@/lib/prices"
import { cn } from "@/lib/utils"
import {
  computeCoastOutlook,
  projectScenario,
  solveEarliestRetirementAge,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import {
  BASE_CASE_CAPTION,
  EMPTY_FIGURE,
  SUGGESTION_COLUMN_LABELS,
  SUGGESTION_MULTIPLIERS,
  SUGGESTION_REACHES_LABELS,
  SUGGESTION_ROUNDING_USD,
  SUGGESTION_SMALL_ROUNDING_USD,
  SUGGESTION_SMALL_THRESHOLD_USD,
  SUGGESTIONS_CAPTION,
  SUGGESTIONS_TITLE,
} from "./constants"
import { formatAge, formatAgeLabel, type RetirementDisplay } from "./display"

/**
 * "How much should I contribute?" answered as a menu rather than a single
 * figure: round monthly amounts around the required one, each carrying what it
 * buys — the earliest age it could retire at, the age it could stop paying in,
 * and whether it clears the target at the retirement age in the plan.
 *
 * Every column is the same solver the headline modes run
 * (`solveEarliestRetirementAge`, `computeCoastOutlook`, `projectScenario`), so
 * a row and a headline can never disagree. Four rows is the cap on the work:
 * behind its own component boundary the pass is interruptible, but it is still
 * a dozen projections that must not grow without a reason.
 */

interface Props {
  /** The planner's deferred draft — same object every other Plan figure runs on. */
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  targetUsd: BigNumber
  /** The solved answer above the table; null = not reachable, so no menu either. */
  requiredContributionUsd: BigNumber | null
  display: RetirementDisplay
}

interface SuggestionRow {
  monthlyContributionUsd: BigNumber
  earliestRetirementAge: number | null
  coastAge: number | null
  reachesTarget: boolean
}

/**
 * Round numbers a person would actually choose: $250 steps, dropping to $50
 * when the amounts are small enough that $250 would collapse the rows into
 * each other. Never rounds down to zero — the smallest suggestion is one step.
 */
function suggestedContributionsUsd(anchorUsd: BigNumber): BigNumber[] {
  const stepUsd = bn(
    anchorUsd.isLessThan(SUGGESTION_SMALL_THRESHOLD_USD)
      ? SUGGESTION_SMALL_ROUNDING_USD
      : SUGGESTION_ROUNDING_USD,
  )
  const seen = new Set<string>()
  const amounts: BigNumber[] = []
  for (const multiplier of SUGGESTION_MULTIPLIERS) {
    const rounded = BigNumber.maximum(
      anchorUsd
        .times(multiplier)
        .dividedBy(stepUsd)
        .integerValue(BigNumber.ROUND_HALF_UP)
        .times(stepUsd),
      stepUsd,
    )
    const key = rounded.toString()
    if (seen.has(key)) continue
    seen.add(key)
    amounts.push(rounded)
  }
  return amounts
}

export function ContributionSuggestions({
  inputs,
  startingAmountUsd,
  targetUsd,
  requiredContributionUsd,
  display,
}: Props) {
  const rows = useMemo<SuggestionRow[]>(() => {
    // The required figure anchors the menu; when the plan is already covered
    // (a zero requirement) the plan's own contribution does instead, so the
    // table still says something rather than listing four times nothing.
    const anchorUsd =
      requiredContributionUsd !== null && requiredContributionUsd.isGreaterThan(0)
        ? requiredContributionUsd
        : bn(inputs.monthlyContributionUsd)
    if (!anchorUsd.isGreaterThan(0)) return []

    return suggestedContributionsUsd(anchorUsd).map((monthlyContributionUsd) => {
      const options = { startingAmountUsd, monthlyContributionUsd }
      const outlook = computeCoastOutlook(inputs, options)
      return {
        monthlyContributionUsd,
        earliestRetirementAge: solveEarliestRetirementAge(inputs, options),
        coastAge: outlook.coastAge,
        reachesTarget: projectScenario(
          inputs,
          options,
        ).finalValueUsd.isGreaterThanOrEqualTo(targetUsd),
      }
    })
  }, [inputs, startingAmountUsd, targetUsd, requiredContributionUsd])

  if (rows.length === 0) return null

  const reachesLabel = SUGGESTION_COLUMN_LABELS.reachesTarget(
    formatAge(inputs.retirementAge),
  )
  const planned = bn(inputs.monthlyContributionUsd)

  const contribution = (row: SuggestionRow) => display.money(row.monthlyContributionUsd)
  const earliest = (row: SuggestionRow) =>
    row.earliestRetirementAge === null
      ? EMPTY_FIGURE
      : formatAgeLabel(row.earliestRetirementAge)
  const coast = (row: SuggestionRow) =>
    row.coastAge === null ? EMPTY_FIGURE : formatAgeLabel(row.coastAge)
  const reaches = (row: SuggestionRow) => (
    <span className={gainLossClass(row.reachesTarget)}>
      {row.reachesTarget
        ? SUGGESTION_REACHES_LABELS.yes
        : SUGGESTION_REACHES_LABELS.no}
    </span>
  )
  /** The row that matches what the scenario already contributes. */
  const isPlanned = (row: SuggestionRow) =>
    row.monthlyContributionUsd.isEqualTo(planned)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{SUGGESTIONS_TITLE}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {SUGGESTIONS_CAPTION} {BASE_CASE_CAPTION}
        </p>
      </CardHeader>
      <CardContent>
        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{SUGGESTION_COLUMN_LABELS.contribution}</TableHead>
                <TableHead className="text-right">
                  {SUGGESTION_COLUMN_LABELS.earliestRetirement}
                </TableHead>
                <TableHead className="text-right">
                  {SUGGESTION_COLUMN_LABELS.coastAge}
                </TableHead>
                <TableHead className="text-right">{reachesLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.monthlyContributionUsd.toString()}>
                  <TableCell
                    className={cn(
                      "tabular-nums",
                      isPlanned(row) ? "font-semibold" : "font-medium",
                    )}
                  >
                    {contribution(row)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {earliest(row)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {coast(row)}
                  </TableCell>
                  <TableCell className="text-right">{reaches(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {rows.map((row) => (
            <div
              key={row.monthlyContributionUsd.toString()}
              className="rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold tabular-nums">
                  {contribution(row)}
                </span>
                {reaches(row)}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                <dt>{SUGGESTION_COLUMN_LABELS.earliestRetirement}</dt>
                <dd className="text-right tabular-nums">{earliest(row)}</dd>
                <dt>{SUGGESTION_COLUMN_LABELS.coastAge}</dt>
                <dd className="text-right tabular-nums">{coast(row)}</dd>
              </dl>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
