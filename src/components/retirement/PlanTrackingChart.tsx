import { Fragment, useMemo } from "react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useTheme } from "@/contexts/ThemeContext"
import { homeDayIso } from "@/lib/config"
import {
  planMonthDate,
  PROJECTION_BAND,
  valueAtMonthsFromNow,
  wholeMonthsBetween,
  type PlanTracking,
  type ProjectionBand,
} from "@/lib/retirement"
import { floorForDisplay, sampleMonthsFromNow } from "./chartSeries"
import {
  BAND_LABELS,
  TODAYS_PURCHASING_POWER,
  TRACKING_ACTUAL_COLOR,
  TRACKING_CHART_CAPTION,
  TRACKING_LABELS,
} from "./constants"
import { formatPlanDay, type RetirementDisplay } from "./display"
import { CHART_TOOLTIP_CONTENT_STYLE } from "@/lib/constants/charts"
import { DISPLAY_LOCALE } from "@/lib/constants/app"

/**
 * "Am I on track?" drawn: the frozen plan's band and base line from the plan
 * start forward, with the portfolio's own recorded history laid over it and
 * today marked. The x axis is the calendar, not an age — this is the one
 * retirement chart that looks backwards, and the question it answers is "where
 * am I *now* against what I committed to".
 */

/** How far past today the frozen plan is drawn, and the floor for a plan
 *  started days ago — a window of two points would not read as a plan. */
const MONTHS_AHEAD = 12
const MIN_WINDOW_MONTHS = 24

interface Props {
  tracking: PlanTracking
  display: RetirementDisplay
}

/** One x position: the frozen plan's band there, and the actual value when a
 *  snapshot (or today's live total) lands on it. */
interface TrackingPoint {
  /** Epoch ms — the axis is a real calendar, so the spacing is real too. */
  t: number
  /** "YYYY-MM-DD", kept so the tooltip needs no reverse conversion. */
  day: string
  base: number
  /** [pessimistic, optimistic] — Recharts draws a tuple dataKey as a range area. */
  range: [number, number]
  actual?: number
}

type PlanPoint = Omit<TrackingPoint, "actual">

/** "YYYY-MM-DD" → epoch ms, parsed as UTC so the axis never shifts a day. */
function dayMs(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime()
}

/**
 * "Sep '26". The apostrophe is what keeps a two-digit year from reading as a
 * day of the month (the ambiguity the dashboard hero avoids by spelling the
 * year out); a two-to-three-year window needs the shorter form to fit a phone.
 */
function formatMonthTick(ms: number): string {
  const date = new Date(ms)
  const month = date.toLocaleDateString(DISPLAY_LOCALE, {
    month: "short",
    timeZone: "UTC",
  })
  const year = date.toLocaleDateString(DISPLAY_LOCALE, {
    year: "2-digit",
    timeZone: "UTC",
  })
  return `${month} '${year}`
}

/**
 * The plan's band is defined at month ends only, so a snapshot between two of
 * them takes the value on the straight segment the chart already draws between
 * them — the same pixel, just named. Plain-number geometry, deliberately: this
 * is where a point sits on a line, not an amount of money.
 */
function interpolateBand(a: PlanPoint, b: PlanPoint, t: number, day: string): PlanPoint {
  const span = b.t - a.t
  const fraction = span > 0 ? (t - a.t) / span : 0
  const at = (from: number, to: number) => from + (to - from) * fraction
  return {
    t,
    day,
    base: at(a.base, b.base),
    range: [at(a.range[0], b.range[0]), at(a.range[1], b.range[1])],
  }
}

export function PlanTrackingChart({ tracking, display }: Props) {
  const { theme } = useTheme()
  const actualColor = TRACKING_ACTUAL_COLOR[theme]

  const points = useMemo<TrackingPoint[]>(() => {
    const { startedAt, elapsedMonths, projections, startingAmountUsd } = tracking
    const todayIso = homeDayIso()
    const windowMonths = Math.max(elapsedMonths + MONTHS_AHEAD, MIN_WINDOW_MONTHS)

    // The frozen plan, one point per plan month. Real terms deflate against
    // TODAY, not against the plan start, so the months already behind us carry
    // a negative offset — which is exactly what makes a past nominal amount
    // read larger in today's purchasing power.
    const planPoints: PlanPoint[] = []
    for (let month = 0; month <= windowMonths; month++) {
      const day = planMonthDate(startedAt, month)
      const relativeMonths = month - elapsedMonths
      const at = (band: ProjectionBand) =>
        display.chartValue(
          valueAtMonthsFromNow(projections[band], month, startingAmountUsd),
          relativeMonths,
        )
      const low = at(PROJECTION_BAND.pessimistic)
      const high = at(PROJECTION_BAND.optimistic)
      planPoints.push({
        t: dayMs(day),
        day,
        base: floorForDisplay(at(PROJECTION_BAND.base)),
        range: [
          floorForDisplay(Math.min(low, high)),
          floorForDisplay(Math.max(low, high)),
        ],
      })
    }

    // Daily snapshots, so a two-year-old plan is ~730 points on a phone-width
    // plot. Sampled through the same `CHART_MAX_POINTS` stride every other
    // retirement chart uses — by index here rather than by month, and today's
    // point is the series' last, so the stride always keeps it.
    const series = tracking.actualSeries
    const actualPoints = sampleMonthsFromNow(
      Math.max(0, series.length - 1),
    ).map((index) => {
      const point = series[index]
      return {
        t: dayMs(point.date),
        day: point.date,
        actual: display.chartValue(
          point.valueUsd,
          wholeMonthsBetween(todayIso, point.date),
        ),
      }
    })

    // One array, not two: Recharts can give a series its own `data`, but then
    // the shared tooltip resolves the hovered point by INDEX into the chart's
    // own data and reads the wrong row off the other series. Both sequences
    // are ascending, so a single merge walk interleaves them.
    const merged: TrackingPoint[] = []
    let next = 0
    for (let i = 0; i < planPoints.length; i++) {
      const planPoint = planPoints[i]
      while (next < actualPoints.length && actualPoints[next].t < planPoint.t) {
        const actual = actualPoints[next]
        const previous = planPoints[i - 1] ?? planPoint
        merged.push({
          ...interpolateBand(previous, planPoint, actual.t, actual.day),
          actual: actual.actual,
        })
        next++
      }
      if (next < actualPoints.length && actualPoints[next].t === planPoint.t) {
        merged.push({ ...planPoint, actual: actualPoints[next].actual })
        next++
      } else {
        merged.push({ ...planPoint })
      }
    }
    return merged
  }, [tracking, display])

  /** Today: the last actual point, and the one place the two lines are read
   *  against each other, so it is marked rather than left to the eye. */
  const todayPoint = points.findLast((point) => point.actual !== undefined)

  const renderTooltip = (props: {
    active?: boolean
    payload?: ReadonlyArray<{ payload?: TrackingPoint }>
  }) => {
    const point = props.payload?.[0]?.payload
    if (!props.active || !point) return null
    const rows: { label: string; value: string; emphasis: boolean }[] = [
      ...(point.actual === undefined
        ? []
        : [
            {
              label: TRACKING_LABELS.actualSeries,
              value: display.moneyFromChartValue(point.actual),
              emphasis: true,
            },
          ]),
      {
        label: TRACKING_LABELS.basePlanSeries,
        value: display.moneyFromChartValue(point.base),
        emphasis: false,
      },
      {
        label: `${BAND_LABELS.pessimistic} – ${BAND_LABELS.optimistic}`,
        value: `${display.moneyFromChartValue(point.range[0])} – ${display.moneyFromChartValue(point.range[1])}`,
        emphasis: false,
      },
    ]
    return (
      <div
        className="px-2.5 py-2"
        // Capped and wrapping, like the plan chart's: a band row alone is two
        // money figures, which otherwise renders wider than the chart.
        style={{
          ...CHART_TOOLTIP_CONTENT_STYLE,
          maxWidth: 240,
          whiteSpace: "normal",
        }}
      >
        <p className="mb-1.5 font-medium text-muted-foreground">
          {formatPlanDay(point.day)}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
          {rows.map((row) => (
            <Fragment key={row.label}>
              <span className="text-muted-foreground">{row.label}</span>
              <span
                className={
                  row.emphasis
                    ? "text-right font-semibold tabular-nums"
                    : "text-right tabular-nums text-muted-foreground"
                }
              >
                {row.value}
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
          {TRACKING_LABELS.chartTitle}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {TRACKING_CHART_CAPTION}
          {display.isReal && ` Shown in ${TODAYS_PURCHASING_POWER}.`}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={points}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 11 }}
              tickFormatter={formatMonthTick}
              axisLine={false}
              tickLine={false}
              // A month label is wider than an age, and a phone has ~330px of
              // plot: the gap is what drops ticks instead of overprinting them.
              minTickGap={32}
            />
            <YAxis
              {...display.axisLabels}
              axisLine={false}
              tickLine={false}
              tickFormatter={display.axisTick}
            />
            <Tooltip content={renderTooltip} />
            {/* Two named lines, so they are named on the chart and not only in
                a tooltip a finger cannot open (the `CoastChart` convention). */}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              dataKey="range"
              stroke="none"
              fill="color-mix(in oklch, var(--primary) 12%, transparent)"
              legendType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="base"
              name={TRACKING_LABELS.basePlanSeries}
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {/* The actual line only covers the plan's elapsed months, so it is
                null on every plan-grid point between two snapshots. */}
            <Line
              type="monotone"
              dataKey="actual"
              name={TRACKING_LABELS.actualSeries}
              stroke={actualColor}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {todayPoint?.actual !== undefined && (
              <ReferenceDot
                x={todayPoint.t}
                y={todayPoint.actual}
                r={5}
                fill={actualColor}
                stroke="var(--background)"
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
