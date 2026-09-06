import { Fragment, useMemo } from "react"
import type BigNumber from "bignumber.js"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PROJECTION_BAND,
  PROJECTION_PHASE,
  WITHDRAWAL_STRATEGY,
  type Projection,
  type ProjectionBand,
  type WithdrawalStrategy,
} from "@/lib/retirement"
import { useTheme } from "@/contexts/ThemeContext"
import { buildBandPoints, depletionAge, type BandPoint } from "./chartSeries"
import { coastMarkerLines } from "./coastMarkers"
import {
  AGE_LABEL,
  BAND_CAPTION,
  BAND_DEPLETED_LABEL,
  BAND_LABELS,
  CHART_TOOLTIP_AGE_PHASE,
  COAST_CURVE_COLOR,
  EARLIEST_RETIREMENT_LINE_LABEL,
  PLANNED_HORIZON_LABEL,
  PROJECTION_PHASE_LABELS,
  RETIREMENT_AGE_LINE_LABEL,
  RETIREMENT_TARGET_LINE_LABEL,
  TODAYS_PURCHASING_POWER,
} from "./constants"
import {
  formatAge,
  formatAgeLabel,
  wholeAge,
  type RetirementDisplay,
} from "./display"
import { CHART_TOOLTIP_CONTENT_STYLE } from "@/lib/constants/charts"

/** Pessimistic → base → optimistic: the reading order of the tooltip's rows and
 *  of the depletion markers' label rows. */
const BANDS: ProjectionBand[] = [
  PROJECTION_BAND.pessimistic,
  PROJECTION_BAND.base,
  PROJECTION_BAND.optimistic,
]

/** Every depletion marker is bad news of the same kind — one tone, so the base
 *  case running out never borrows the base line's own colour and reads calmer
 *  than the pessimistic one. The label names the band. */
const DEPLETION_MARKER_COLOR = "var(--destructive)"

interface Props {
  projections: Record<ProjectionBand, Projection>
  currentAge: number
  retirementAge: number
  /** Marked only when it is short of retirement — i.e. the plan coasts. */
  contributionEndAge: number
  /** The coast date as an age; marked alongside the planned one when it differs. */
  earliestCoastAge?: number | null
  /** "When can I retire?" only: where the answer falls on this same projection. */
  earliestRetirementAge?: number | null
  startingAmountUsd: BigNumber
  targetUsd: BigNumber
  monthsToRetirement: number
  /** Only under capital depletion is the horizon an age the plan is DESIGNED to
   *  reach; under preservation it is a chart horizon and stays unnamed. */
  withdrawalStrategy?: WithdrawalStrategy
  /** The depletion-age input — the age the plan is planned to last to. */
  plannedDepletionAge?: number
  display: RetirementDisplay
}

/**
 * The plan projection: base line inside the pessimistic–optimistic band, over
 * shaded coasting and retirement phases, with the retirement age, the
 * retirement target, every band that runs out — each naming itself and the age
 * — and, when the plan coasts, both the age contributions stop and the earliest
 * age they could have. Both withdrawal strategies run past retirement: the line
 * carries on through the drawdown, down to zero at the depletion age when
 * depleting, typically still rising when the SWR sustains it under preservation.
 */
export function PlanChart({
  projections,
  currentAge,
  retirementAge,
  contributionEndAge,
  earliestCoastAge = null,
  earliestRetirementAge = null,
  startingAmountUsd,
  targetUsd,
  monthsToRetirement,
  withdrawalStrategy,
  plannedDepletionAge,
  display,
}: Props) {
  const { theme } = useTheme()
  const points = useMemo(
    () =>
      buildBandPoints({
        projections,
        currentAge,
        startingAmountUsd,
        chartValue: display.chartValue,
        keep: [monthsToRetirement],
      }),
    [projections, currentAge, startingAmountUsd, display, monthsToRetirement],
  )

  const targetValue = display.chartValue(targetUsd, monthsToRetirement)
  // Compact ("$1.88M") — cents on a 25-year projection are false precision, and
  // the label has to fit a phone. Null while amounts are hidden: the line still
  // says what it is, without the figure.
  const targetLabel = RETIREMENT_TARGET_LINE_LABEL(
    display.compactMoneyFromChartValue(targetValue),
  )

  /** The chart's right edge — the last age the projection is drawn to. */
  const horizonAge = points.at(-1)?.age ?? retirementAge

  // Every band that runs out is marked, each naming itself: "which case is
  // this?" is exactly what a bare zero-crossing leaves open. `depletionAge`
  // stays month-precise for the milestones table; the label floors to whole
  // years, because "runs out at 61.5" claims a precision a projection lacks.
  const depletionMarkers = useMemo(
    () =>
      BANDS.flatMap((band) => {
        const age = depletionAge(projections[band], currentAge)
        return age === null ? [] : [{ band, age }]
      }),
    [projections, currentAge],
  )

  // A horizontal reference line's label follows the LINE, not the chart, so
  // the target's label sits wherever the target value falls — often right on
  // the baseline. Every vertical marker therefore labels at the TOP, and the
  // ones that can be near each other are pushed onto their own rows. Two years
  // is ~10px of chart on a phone, so proximity can never be what separates
  // two labels. Rows, top down: the retirement age, the earliest-retirement
  // answer (only in the question that has one — its row is not left empty
  // otherwise), one per depleted band, then the phase names.
  const stackedLabelOffset = 16
  const depletionLabelRow = earliestRetirementAge === null ? 1 : 2
  const phaseLabelRow = depletionLabelRow + depletionMarkers.length

  // Right-anchored labels grow LEFTWARD from their line: a marker in the left
  // half of the chart would run its label off the plot into the axis gutter,
  // so those flip to the other side of their own line instead.
  const midAge = (currentAge + horizonAge) / 2

  // The phases label at the TOP, because the bottom is the coast pair's: the
  // coasting shade lands exactly on "Planned coast: 50". They also take a row
  // each — a one-year coasting window centres its name a few pixels from the
  // retirement one on a phone.
  const phaseLabel = (value: string, row: number) => ({
    value,
    position: "insideTop" as const,
    dy: stackedLabelOffset * row,
    fontSize: 11,
    fill: "var(--muted-foreground)",
  })

  // A plan that coasts shades the window its contributions have stopped in.
  // Both shades start no earlier than today, the chart's own left edge, so a
  // window already behind the user is not drawn at all.
  const coastingFrom = Math.max(contributionEndAge, currentAge)
  const retirementFrom = Math.max(retirementAge, currentAge)
  const showsCoastingPhase = coastingFrom < retirementFrom
  const showsRetirementPhase = retirementFrom < horizonAge

  // The band is ONE series carrying a [low, high] tuple, so the default tooltip
  // can only print it as a single "$a – $b" row — while the three cases side by
  // side are the whole reason the band is drawn. The hovered point carries them
  // all, so the tooltip reads them off it directly.
  const renderTooltip = (props: {
    active?: boolean
    payload?: ReadonlyArray<{ payload?: BandPoint }>
  }) => {
    const point = props.payload?.[0]?.payload
    if (!props.active || !point) return null
    const ageLabel = formatAgeLabel(wholeAge(point.age))
    const rows: { band: ProjectionBand; value: number }[] = [
      { band: PROJECTION_BAND.pessimistic, value: point.range[0] },
      { band: PROJECTION_BAND.base, value: point.base },
      { band: PROJECTION_BAND.optimistic, value: point.range[1] },
    ]
    return (
      <div
        className="px-2.5 py-2"
        // Capped and wrapping: three money figures otherwise render a tooltip
        // wider than the chart they sit in.
        style={{
          ...CHART_TOOLTIP_CONTENT_STYLE,
          maxWidth: 240,
          whiteSpace: "normal",
        }}
      >
        <p className="mb-1.5 font-medium text-muted-foreground">
          {point.phase
            ? CHART_TOOLTIP_AGE_PHASE(
                ageLabel,
                PROJECTION_PHASE_LABELS[point.phase],
              )
            : ageLabel}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
          {rows.map(({ band, value }) => (
            <Fragment key={band}>
              <span className="text-muted-foreground">{BAND_LABELS[band]}</span>
              <span
                className={
                  band === PROJECTION_BAND.base
                    ? "whitespace-nowrap text-right font-semibold tabular-nums"
                    : "whitespace-nowrap text-right tabular-nums text-muted-foreground"
                }
              >
                {display.moneyFromChartValue(value)}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Projected portfolio value
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {BAND_CAPTION}
          {display.isReal && ` Shown in ${TODAYS_PURCHASING_POWER}.`}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={points}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="age"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              {...display.axisLabels}
              axisLine={false}
              tickLine={false}
              tickFormatter={display.axisTick}
            />
            <Tooltip content={renderTooltip} />
            {/* Ground, not markers: the phase SHADES are drawn before the plot
                so the line and the band stay on top of them. Their names come
                after it (below) — 11px muted text read through the band's own
                wash, crossed by the base line, is the least legible thing on a
                phone. Faint, but a step apart from each other and above the
                grid: at 4%/8% the difference between the two was ~2% lightness,
                quieter than the dashes drawn over them. */}
            {showsCoastingPhase && (
              <ReferenceArea
                x1={coastingFrom}
                x2={retirementFrom}
                stroke="none"
                fill="color-mix(in oklch, var(--muted-foreground) 8%, transparent)"
              />
            )}
            {showsRetirementPhase && (
              <ReferenceArea
                x1={retirementFrom}
                x2={horizonAge}
                stroke="none"
                fill="color-mix(in oklch, var(--muted-foreground) 14%, transparent)"
              />
            )}
            {/* Unnamed series: this chart has no legend, and the tooltip reads
                the hovered point rather than the payload's series names. */}
            <Area
              dataKey="range"
              stroke="none"
              fill="color-mix(in oklch, var(--primary) 12%, transparent)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="base"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              y={targetValue}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: targetLabel,
                position: "insideTopLeft",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
            {/* The phase names, painted after the series so nothing crosses
                them, and label-only: their shading is drawn above, as ground. */}
            {showsCoastingPhase && (
              <ReferenceArea
                x1={coastingFrom}
                x2={retirementFrom}
                fill="none"
                stroke="none"
                label={phaseLabel(
                  PROJECTION_PHASE_LABELS[PROJECTION_PHASE.coasting],
                  phaseLabelRow,
                )}
              />
            )}
            {showsRetirementPhase && (
              <ReferenceArea
                x1={retirementFrom}
                x2={horizonAge}
                fill="none"
                stroke="none"
                label={phaseLabel(
                  PROJECTION_PHASE_LABELS[PROJECTION_PHASE.retirement],
                  phaseLabelRow + (showsCoastingPhase ? 1 : 0),
                )}
              />
            )}
            {depletionMarkers.map(({ band, age }, index) => (
              <ReferenceLine
                key={band}
                x={age}
                stroke={DEPLETION_MARKER_COLOR}
                strokeDasharray="4 4"
                label={{
                  value: BAND_DEPLETED_LABEL(
                    BAND_LABELS[band],
                    formatAge(wholeAge(age)),
                  ),
                  position: age < midAge ? "insideTopLeft" : "insideTopRight",
                  dy: stackedLabelOffset * (depletionLabelRow + index),
                  fontSize: 11,
                  fill: DEPLETION_MARKER_COLOR,
                }}
              />
            ))}
            {coastMarkerLines({
              plannedCoastAge:
                contributionEndAge < retirementAge ? contributionEndAge : null,
              earliestCoastAge:
                contributionEndAge < retirementAge ? earliestCoastAge : null,
              earliestColor: COAST_CURVE_COLOR[theme],
            })}
            {earliestRetirementAge !== null && (
              <ReferenceLine
                x={earliestRetirementAge}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                label={{
                  value: EARLIEST_RETIREMENT_LINE_LABEL(
                    formatAge(earliestRetirementAge),
                  ),
                  position: "insideTopLeft",
                  dy: stackedLabelOffset,
                  fontSize: 11,
                  fill: "var(--primary)",
                }}
              />
            )}
            <ReferenceLine
              x={retirementAge}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: RETIREMENT_AGE_LINE_LABEL(formatAge(retirementAge)),
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
            {/* Under capital depletion the right edge is the age the plan was
                asked to last to — said at the BOTTOM, away from the depletion
                labels, but one row up: the bottom row itself belongs to the
                coast pair, whose "Could coast at" label grows rightward into
                exactly this corner. */}
            {withdrawalStrategy === WITHDRAWAL_STRATEGY.depletion &&
              plannedDepletionAge !== undefined && (
                <ReferenceLine
                  x={horizonAge}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: PLANNED_HORIZON_LABEL(
                      formatAge(plannedDepletionAge),
                    ),
                    position: "insideBottomRight",
                    dy: -stackedLabelOffset,
                    fontSize: 11,
                    fill: "var(--muted-foreground)",
                  }}
                />
              )}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {AGE_LABEL}
        </p>
      </CardContent>
    </Card>
  )
}
