import { Suspense, useMemo } from "react"
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
import { RetirementCompareChart } from "@/components/charts/LazyChart"
import RouteSkeleton from "@/components/layout/RouteSkeleton"
import { useTheme } from "@/contexts/ThemeContext"
import {
  monthsToRetirement as monthsToRetirementOf,
  PROJECTION_BAND,
  runComparison,
  type ComparisonResult,
  type RetirementScenarioInputs,
} from "@/lib/retirement"
import {
  GLOSSARY_HINTS,
  OPTION_SERIES_COLORS,
  INDEXATION_EFFECT_CAPTION,
  TAX_ESTIMATE_CAPTION,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import type { RetirementDisplay } from "./display"
import { Hint } from "./RetirementControls"

/**
 * Compare — one contribution plan through every option, after Turkish tax.
 * The after-tax column is the headline; every tax figure carries the rule note
 * that produced it and the estimate caveat.
 */

interface Props {
  inputs: RetirementScenarioInputs
  startingAmountUsd: BigNumber
  display: RetirementDisplay
}

interface Row {
  id: string
  name: string
  color: string
  grossUsd: BigNumber
  taxUsd: BigNumber
  taxNote: string
  afterTaxUsd: BigNumber
  afterTaxRealUsd: BigNumber
}

export function CompareTab({ inputs, startingAmountUsd, display }: Props) {
  const { theme } = useTheme()
  const palette = OPTION_SERIES_COLORS[theme]
  const monthsToRetirement = monthsToRetirementOf(inputs)

  const results = useMemo<ComparisonResult[]>(
    () => runComparison(inputs, { startingAmountUsd }),
    [inputs, startingAmountUsd],
  )

  const rows = useMemo<Row[]>(
    () =>
      results.map((result, index) => {
        const band = result.results[PROJECTION_BAND.base]
        return {
          id: result.option.id,
          name: result.option.name,
          color: palette[index % palette.length],
          grossUsd: band.grossFinalValueUsd,
          taxUsd: band.taxEstimate.taxUsd,
          taxNote: band.taxEstimate.note,
          afterTaxUsd: band.afterTaxFinalValueUsd,
          afterTaxRealUsd: band.afterTaxRealFinalValueUsd,
        }
      }),
    [results, palette],
  )

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This scenario has no comparison options.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            At age {inputs.retirementAge}, per option
          </CardTitle>
          <p className="text-xs text-muted-foreground">{TAX_ESTIMATE_CAPTION}</p>
          <p className="text-xs text-muted-foreground">
            {INDEXATION_EFFECT_CAPTION}
          </p>
        </CardHeader>
        <CardContent>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Option</TableHead>
                  <TableHead className="text-right">Final value (gross)</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      Retirement tax estimate
                      <Hint
                        text={GLOSSARY_HINTS.retirementTaxEstimate}
                        label="the retirement tax estimate"
                      />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">After tax</TableHead>
                  <TableHead className="text-right">
                    After tax, {TODAYS_PURCHASING_POWER}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {display.money(row.grossUsd, monthsToRetirement)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-1">
                        {display.money(row.taxUsd, monthsToRetirement)}
                        <Hint text={row.taxNote} label="this tax estimate" />
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {display.money(row.afterTaxUsd, monthsToRetirement)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {display.money(row.afterTaxRealUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.name}
                  </span>
                  <span className="text-base font-semibold tabular-nums">
                    {display.money(row.afterTaxUsd, monthsToRetirement)}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                  <dt>Final value (gross)</dt>
                  <dd className="text-right tabular-nums">
                    {display.money(row.grossUsd, monthsToRetirement)}
                  </dd>
                  <dt className="inline-flex items-center gap-1">
                    Retirement tax estimate
                    <Hint text={row.taxNote} label="this tax estimate" />
                  </dt>
                  <dd className="text-right tabular-nums">
                    {display.money(row.taxUsd, monthsToRetirement)}
                  </dd>
                  <dt>After tax, {TODAYS_PURCHASING_POWER}</dt>
                  <dd className="text-right tabular-nums">
                    {display.money(row.afterTaxRealUsd)}
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={<RouteSkeleton />}>
        <RetirementCompareChart
          results={results}
          currentAge={inputs.currentAge}
          startingAmountUsd={startingAmountUsd}
          display={display}
        />
      </Suspense>
    </div>
  )
}
