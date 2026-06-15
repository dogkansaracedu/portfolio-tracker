import { HOME_TIMEZONE } from "@/lib/config"
import type { IntradaySnapshot } from "@/types/database"

/** A single 1D-view chart point. Mirrors the fields the hero chart reads off
 *  HeroPoint, but is computed purely (no React) so it can be unit-tested. */
export interface IntradayHeroPoint {
  /** captured_at ISO (or the now timestamp for the live anchor). */
  date: string
  /** Epoch ms — the chart's numeric/time X value. */
  dateMs: number
  /** "HH:mm" in the home timezone; the final point is "Şimdi". */
  label: string
  valueUsd: number
  valueTry: number
  /** Cumulative % change from the window's first point (the P&L-mode line). */
  twrPct: number
}

export interface IntradayHeroResult {
  points: IntradayHeroPoint[]
  /** One tick per point (the window is small — ≤25 points). */
  xTicks: number[]
  twrEnd: number
  deltaUsd: number
  deltaTry: number
  deltaPct: number
}

interface BuildArgs {
  /** Ascending by captured_at, already bounded to the last 24h. */
  intraday: IntradaySnapshot[]
  /** Live current value (the right-edge "now" anchor). */
  nowUsd: number
  nowTry: number
  /** "now" epoch ms — passed in so the function stays pure/testable. */
  nowMs: number
}

const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: HOME_TIMEZONE,
})

/**
 * Build the dashboard hero's 1D series from intraday (hourly) totals plus the
 * live "now" anchor. Points are positioned by their real capture timestamp
 * (time-of-day axis), and `twrPct` is the cumulative % change from the window's
 * first point — a simple intraday "today's change" line (intraday cash flows are
 * rare and not modelled here; daily+ ranges handle flows via computeTWRSeries).
 */
export function buildIntradaySeries({
  intraday,
  nowUsd,
  nowTry,
  nowMs,
}: BuildArgs): IntradayHeroResult {
  const raw: Array<{ date: string; dateMs: number; valueUsd: number; valueTry: number }> =
    intraday.map((s) => ({
      date: s.captured_at,
      dateMs: new Date(s.captured_at).getTime(),
      valueUsd: s.total_usd ?? 0,
      valueTry: s.total_try ?? 0,
    }))

  // Append the live "now" anchor; drop the last historical point if it lands on
  // the same instant (avoids a duplicate X position).
  if (raw.length > 0 && raw[raw.length - 1].dateMs === nowMs) {
    raw.pop()
  }
  raw.push({ date: "now", dateMs: nowMs, valueUsd: nowUsd, valueTry: nowTry })

  const startUsd = raw[0]?.valueUsd ?? 0

  const points: IntradayHeroPoint[] = raw.map((p, i) => ({
    date: p.date,
    dateMs: p.dateMs,
    label: i === raw.length - 1 ? "Şimdi" : timeFmt.format(new Date(p.dateMs)),
    valueUsd: p.valueUsd,
    valueTry: p.valueTry,
    twrPct: startUsd > 0 ? (p.valueUsd / startUsd - 1) * 100 : 0,
  }))

  const xTicks = points.map((p) => p.dateMs)

  const endUsd = points[points.length - 1]?.valueUsd ?? 0
  const endTry = points[points.length - 1]?.valueTry ?? 0
  const startTry = points[0]?.valueTry ?? 0
  const deltaUsd = endUsd - startUsd
  const deltaTry = endTry - startTry
  const deltaPct = startUsd > 0 ? (deltaUsd / startUsd) * 100 : 0
  const twrEnd = points[points.length - 1]?.twrPct ?? 0

  return { points, xTicks, twrEnd, deltaUsd, deltaTry, deltaPct }
}
