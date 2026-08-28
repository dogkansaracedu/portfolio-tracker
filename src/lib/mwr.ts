import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import {
  collectPairedParentIds,
  externalCashFlowUsd,
  sortSnapshotsAsc,
} from "@/lib/performance"
import {
  deannualizeLog1p,
  solveXirr,
  solveXirrLog1p,
  yearsBetween,
} from "@/lib/xirr"
import type { XirrFlow } from "@/lib/xirr"
import type {
  BenchmarkPrice,
  ExchangeRate,
  Snapshot,
  Transaction,
} from "@/types/database"

/**
 * Money-weighted return (MWR / XIRR) engine — pure, no React.
 *
 * Companion to the time-weighted engine in `lib/performance.ts`: same inputs
 * (window snapshots + transactions + rates), same external-flow semantics
 * (imported, never re-derived), same solver (`lib/xirr.ts`), different question.
 * TWR chains the per-period money-weighted returns so deposits cancel out and
 * only the strategy shows; MWR solves ONE XIRR over the whole window, so the
 * investor's actual dollars — deposit size and timing — count.
 *
 * The solver itself lives in the leaf module `lib/xirr.ts` so `lib/performance`
 * can use it too without an import cycle; it is re-exported here because that
 * is where callers and tests have always found it.
 *
 * See docs/components/GLOSSARY.md#money-weighted-return-xirr-formula and
 * docs/components/technical/07-dashboard.md.
 */

export { solveXirr } from "@/lib/xirr"
export type { XirrFlow } from "@/lib/xirr"

// ─── Conventions ────────────────────────────────────────────────────

/** Windows shorter than this never annualize (a 2-month rate × 6 is noise). */
export const MIN_ANNUALIZATION_YEARS = 1

type Money = ReturnType<typeof bn>

// ─── Types ──────────────────────────────────────────────────────────

export interface MWRPoint {
  date: string
  /** Cumulative money-weighted return % since the window's first point (0 there). */
  cumulativePct: number
}

export interface MWRSeries {
  points: MWRPoint[]
  /** Cumulative MWR % at the last point. */
  endPct: number
  /** Annualized rate % at the last point; null when the window spans < 1 year
   *  (or the solver found no rate there). */
  annualizedEndPct: number | null
}

const EMPTY_SERIES: MWRSeries = { points: [], endPct: 0, annualizedEndPct: null }

// ─── Date helpers ───────────────────────────────────────────────────

function byDateAsc<T extends { date: string }>(a: T, b: T): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
}

// ─── Shared flow extraction ─────────────────────────────────────────

/**
 * The portfolio's external cash flows as dated USD amounts, ascending.
 * Semantics are imported wholesale from the TWR engine — internal asset↔cash
 * swaps (a buy funded by a paired `cash_debit`, a sell whose proceeds stay as a
 * paired `cash_credit`), dividends, interest and standalone fees contribute
 * nothing, exactly as in `subPeriodReturn`.
 */
function externalFlows(
  transactions: Transaction[],
  rates: ExchangeRate[],
): XirrFlow[] {
  const internalParentIds = collectPairedParentIds(transactions)
  const flows: XirrFlow[] = []
  for (const tx of transactions) {
    const amountUsd = externalCashFlowUsd(tx, rates, internalParentIds)
    if (amountUsd.isZero()) continue
    flows.push({ date: tx.date.slice(0, 10), amountUsd })
  }
  return flows.sort(byDateAsc)
}

// ─── Windowed series core ───────────────────────────────────────────

interface ValuePoint {
  date: string
  valueUsd: Money
}

/**
 * The windowed MWR mechanics, over any dated value series (the portfolio's
 * snapshots, or the what-if index's synthetic values).
 *
 * Point *i* solves the XIRR of [window start → point *i*]: the first point's
 * value is an opening inflow at the window start, the point's value is the
 * terminal amount, and the flows in between use the same `(start, point]`
 * boundary as `subPeriodReturn` — a flow dated exactly on the window-start date
 * belongs to the opening value, a flow on the point's own date counts.
 *
 * A point whose solve fails carries the previous point's cumulative %, the same
 * neutral treatment TWR gives a skipped period. The first point is 0 by
 * construction.
 */
function mwrSeriesFromValues(
  values: ValuePoint[],
  flows: XirrFlow[],
): MWRSeries {
  if (values.length === 0) return EMPTY_SERIES

  const startDate = values[0].date
  const openingFlow: XirrFlow = { date: startDate, amountUsd: values[0].valueUsd }
  const points: MWRPoint[] = [{ date: startDate, cumulativePct: 0 }]

  let cumulativePct = 0
  let endLogGrowth: number | null = null

  for (let i = 1; i < values.length; i++) {
    const { date, valueUsd } = values[i]
    const windowFlows: XirrFlow[] = [openingFlow]
    for (const f of flows) {
      if (f.date > startDate && f.date <= date) windowFlows.push(f)
    }

    const logGrowth = solveXirrLog1p(windowFlows, valueUsd, date)
    if (logGrowth !== null) {
      // (1+r)^Y − 1: de-annualize the rate back over the window.
      cumulativePct = deannualizeLog1p(logGrowth, yearsBetween(startDate, date))
        .times(BN_HUNDRED)
        .toNumber()
    }
    endLogGrowth = logGrowth
    points.push({ date, cumulativePct })
  }

  const spanYears = yearsBetween(startDate, values[values.length - 1].date)
  const annualizedEndPct =
    endLogGrowth !== null && spanYears >= MIN_ANNUALIZATION_YEARS
      ? bn(Math.expm1(endLogGrowth)).times(BN_HUNDRED).toNumber()
      : null

  return { points, endPct: cumulativePct, annualizedEndPct }
}

// ─── Public engine ──────────────────────────────────────────────────

/**
 * Portfolio money-weighted return over the window, as a cumulative series
 * rebased to 0% at the window's first snapshot.
 *
 * Same call shape and window semantics as `computeTWRSeries` — pass the
 * window's snapshots plus the live "now" pseudo-snapshot; only `snapshot_date`
 * and `total_usd` are read. Unlike TWR it needs no intermediate valuations to
 * be exact, so weekly-sampled history carries no "approximate" caveat.
 */
export function computeMWRSeries(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): MWRSeries {
  const snaps = sortSnapshotsAsc(snapshots)
  if (snaps.length === 0) return EMPTY_SERIES

  return mwrSeriesFromValues(
    snaps.map((s) => ({
      date: s.snapshot_date,
      valueUsd: bn(s.total_usd ?? 0),
    })),
    externalFlows(transactions, rates),
  )
}

/**
 * Lifetime cumulative money-weighted return % — the Portfolio page's headline
 * companion to the Total P&L dollars. The same solve as `computeLifetimeXirrPct`
 * (every external flow at its real date, V_start = 0, live value as terminal),
 * de-annualized back over the book's own span so it reads as a total earned,
 * not a rate. Same convention as the per-asset headline %
 * (`computeAssetReturnRates.mwrCumulativePct`), over the portfolio boundary.
 *
 * NOT gated on history length — a cumulative figure is exact at any age; the
 * 1-year gate guards only annualized readouts. Null when there are no external
 * flows, the span is zero, or the solver has no answer.
 */
export function computeLifetimeMwrCumulativePct(
  transactions: Transaction[],
  rates: ExchangeRate[],
  currentValueUsd: number,
  todayIso: string,
): number | null {
  const flows = externalFlows(transactions, rates)
  if (flows.length === 0) return null

  const today = todayIso.slice(0, 10)
  const years = yearsBetween(flows[0].date, today)
  if (!(years > 0)) return null

  const logGrowth = solveXirrLog1p(flows, bn(currentValueUsd), today)
  if (logGrowth === null) return null
  return deannualizeLog1p(logGrowth, years).times(BN_HUNDRED).toNumber()
}

/**
 * Lifetime annualized XIRR % — every external flow at its real date against the
 * live value today, with no opening value (V_start = 0). This is the "%/yr"
 * chip.
 *
 * Null when the history spans less than a year (annualizing a short book is
 * noise) or the solver finds no rate.
 */
export function computeLifetimeXirrPct(
  transactions: Transaction[],
  rates: ExchangeRate[],
  currentValueUsd: number,
  todayIso: string,
): number | null {
  const flows = externalFlows(transactions, rates)
  if (flows.length === 0) return null

  const today = todayIso.slice(0, 10)
  if (yearsBetween(flows[0].date, today) < MIN_ANNUALIZATION_YEARS) return null

  const rate = solveXirr(flows, bn(currentValueUsd), today)
  return rate === null ? null : rate.times(BN_HUNDRED).toNumber()
}

// ─── What-if index (same-flows benchmark) ───────────────────────────

/**
 * For each target date (ascending), the benchmark close on or before it; null
 * when no close precedes it. Linear in the larger of the two lists — beats
 * N × O(log N) binary searches when both are dense.
 *
 * Exported so the dashboard hero's overlay can share one lookup convention
 * instead of keeping a private twin.
 */
export function closesAtOrBefore(
  series: BenchmarkPrice[],
  targets: string[],
): Array<number | null> {
  const out: Array<number | null> = new Array(targets.length).fill(null)
  if (series.length === 0) return out
  let i = 0
  let lastClose: number | null = null
  for (let t = 0; t < targets.length; t++) {
    while (i < series.length && series[i].date <= targets[t]) {
      lastClose = series[i].close_usd
      i++
    }
    out[t] = lastClose
  }
  return out
}

/**
 * The what-if index: the same external flows placed into the benchmark on the
 * same dates, measured the same money-weighted way — the fair opponent for
 * `computeMWRSeries` (both sides then carry identical flow timing).
 *
 * Each flow buys (or sells) index units at the close at-or-before its date;
 * flows dated before the index has any close participate at its **first**
 * available close rather than being dropped. The synthetic value at each
 * snapshot date is units-held-through-that-date × the close at-or-before it,
 * and that series then runs through the same windowed MWR mechanics with the
 * same flows. Only the snapshots' DATES are read here — their totals belong to
 * the portfolio, not to the what-if.
 *
 * An empty/absent `benchmarkSeries` yields a zero series (points present, all
 * 0) so the caller can draw a flat line or hide it, rather than a hole.
 */
export function computeWhatIfIndexMWRSeries(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
  benchmarkSeries: BenchmarkPrice[],
): MWRSeries {
  const snaps = sortSnapshotsAsc(snapshots)
  if (snaps.length === 0) return EMPTY_SERIES

  const flatZero: MWRSeries = {
    points: snaps.map((s) => ({ date: s.snapshot_date, cumulativePct: 0 })),
    endPct: 0,
    annualizedEndPct: null,
  }
  if (benchmarkSeries.length === 0) return flatZero

  const closes = [...benchmarkSeries].sort(byDateAsc)
  const firstClose = closes[0].close_usd
  const flows = externalFlows(transactions, rates)

  const snapDates = snaps.map((s) => s.snapshot_date)
  const closeAtSnap = closesAtOrBefore(closes, snapDates)
  const closeAtFlow = closesAtOrBefore(
    closes,
    flows.map((f) => f.date),
  )

  const values: ValuePoint[] = []
  let units = BN_ZERO
  let flowIdx = 0
  for (let i = 0; i < snaps.length; i++) {
    const date = snapDates[i]
    // Units are cumulative through the snapshot date INCLUSIVE — mirroring a
    // portfolio snapshot, which already contains that day's deposit.
    while (flowIdx < flows.length && flows[flowIdx].date <= date) {
      const close = closeAtFlow[flowIdx] ?? firstClose
      if (close > 0) units = units.plus(flows[flowIdx].amountUsd.div(close))
      flowIdx++
    }
    const close = closeAtSnap[i] ?? firstClose
    values.push({ date, valueUsd: units.times(close) })
  }

  return mwrSeriesFromValues(values, flows)
}
