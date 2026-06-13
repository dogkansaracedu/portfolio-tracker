import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { normalizeToUsd } from "@/lib/pnl/currency"
import type { Snapshot, Transaction, ExchangeRate } from "@/types/database"
import type { AssetPnL } from "@/lib/pnl/types"

export type TimeRange =
  | "1D"
  | "1W"
  | "1M"
  | "3M"
  | "6M"
  | "YTD"
  | "1Y"
  | "2Y"
  | "ALL"

export interface PnLPoint {
  date: string
  totalUsd: number
  investedUsd: number
  pnlUsd: number
}

export interface MonthlyReturn {
  month: string // "2026-03"
  label: string // "Mar 2026"
  returnPct: number
  returnUsd: number
}

export interface PerformanceMetrics {
  monthlyReturns: MonthlyReturn[]
  ytdReturnPct: number | null
  allTimeReturnPct: number | null
  cagr: number | null
  maxDrawdownPct: number
  bestMonth: MonthlyReturn | null
  worstMonth: MonthlyReturn | null
  drawdownSeries: { date: string; drawdownPct: number }[]
}

const monthLabels = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${monthLabels[d.getMonth()]} ${d.getFullYear()}`
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

/** Local-date "YYYY-MM-DD" string (avoids timezone drift from toISOString). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Defensive ascending-by-date copy. The metrics functions assume ASC order
 * (fetchSnapshots provides it) but sort locally so a future or unsorted caller
 * can't silently corrupt drawdown peaks, period pairing, or the YTD anchor.
 */
function sortSnapshotsAsc(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) =>
    a.snapshot_date < b.snapshot_date ? -1 : a.snapshot_date > b.snapshot_date ? 1 : 0,
  )
}

export function filterByTimeRange(
  snapshots: Snapshot[],
  range: TimeRange,
): Snapshot[] {
  if (range === "ALL" || snapshots.length === 0) return snapshots

  const now = new Date()
  let cutoff: Date

  switch (range) {
    case "1D":
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      break
    case "1W":
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
      break
    case "1M":
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      break
    case "3M":
      cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      break
    case "6M":
      cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
      break
    case "YTD":
      cutoff = new Date(now.getFullYear(), 0, 1)
      break
    case "1Y":
      cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      break
    case "2Y":
      cutoff = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())
      break
  }

  const cutoffStr = localIso(cutoff)
  const inRange = snapshots.filter((s) => s.snapshot_date >= cutoffStr)

  // For ranges of 1 month or longer, include the latest snapshot strictly
  // before the cutoff as a "start anchor". This keeps the chart populated
  // when snapshot granularity is monthly (e.g. monthly snapshots and a "1M"
  // window where the closest snapshot is just outside the window). We do
  // NOT do this for 1D / 1W because extending those back to a month-ago
  // snapshot would misrepresent the requested range.
  const supportsAnchor =
    range === "1M" ||
    range === "3M" ||
    range === "6M" ||
    range === "YTD" ||
    range === "1Y" ||
    range === "2Y"

  if (supportsAnchor) {
    let anchorIdx = -1
    for (let i = 0; i < snapshots.length; i++) {
      if (snapshots[i].snapshot_date < cutoffStr) {
        anchorIdx = i
      } else {
        break
      }
    }
    if (anchorIdx >= 0) {
      return [snapshots[anchorIdx], ...inRange]
    }
  }

  return inRange
}

/**
 * Buy/sell parent transaction ids that have a paired cash child
 * (cash_credit/cash_debit, linked via linked_tx_id). Such buys/sells are
 * internal asset↔cash swaps for cash-flow purposes — the offsetting cash leg
 * keeps the value inside the tracked portfolio (snapshot total_usd includes
 * on-platform cash). Mirrors the netting applyTxToInvested already performs.
 */
function collectPairedParentIds(transactions: Transaction[]): Set<string> {
  const ids = new Set<string>()
  for (const tx of transactions) {
    if (
      (tx.type === "cash_credit" || tx.type === "cash_debit") &&
      tx.linked_tx_id
    ) {
      ids.add(tx.linked_tx_id)
    }
  }
  return ids
}

/**
 * External cash flow signed value for Modified Dietz, in USD (BigNumber).
 *
 * "External" means value crossing the tracked-portfolio boundary — not a
 * reallocation inside it. snapshot total_usd INCLUDES on-platform cash (fiat
 * holdings are priced and summed), so an asset↔cash trade is INTERNAL:
 *   - a sell whose proceeds stay as a paired cash_credit, and
 *   - a buy funded by a paired cash_debit
 * move no value across the boundary → contribute 0. Counting them would tell
 * Modified Dietz that capital left/entered when it merely changed form (e.g. a
 * value-neutral BTC→USD sell would otherwise print a large phantom return).
 * Only genuinely external events count: an externally-funded buy (no
 * cash_debit) is capital in; a legacy sell with no cash_credit is proceeds
 * out; transfers carry cost basis across the boundary. Dividends, interest and
 * standalone fees are internal income/cost and must not skew the period return
 * (transaction-fee drag surfaces naturally in V_end). `internalParentIds` is
 * the set of buy/sell parents that have a paired cash child.
 *
 * Sign convention: positive = inflow into the portfolio (capital deployed).
 */
function externalCashFlowUsd(
  tx: Transaction,
  rates: ExchangeRate[],
  internalParentIds: Set<string>,
): ReturnType<typeof bn> {
  const totalUsd = normalizeToUsd(
    tx.total_cost ?? 0,
    tx.price_currency,
    tx.date,
    rates,
  )
  const feeUsd = tx.fee
    ? normalizeToUsd(
        tx.fee,
        tx.fee_currency ?? tx.price_currency,
        tx.date,
        rates,
      )
    : BN_ZERO
  switch (tx.type) {
    case "buy":
      // Funded from on-platform cash (paired cash_debit) → internal swap.
      return internalParentIds.has(tx.id) ? BN_ZERO : totalUsd.plus(feeUsd)
    case "sell":
      // Proceeds stay as on-platform cash (paired cash_credit) → internal swap.
      return internalParentIds.has(tx.id)
        ? BN_ZERO
        : totalUsd.minus(feeUsd).negated()
    case "transfer_in":
      return totalUsd
    case "transfer_out":
      return totalUsd.negated()
    default:
      // dividend / interest / fee / cash_credit / cash_debit → internal
      return BN_ZERO
  }
}

export interface SubPeriodReturn {
  /** Period Modified-Dietz return as a fraction (e.g. 0.1 = +10%); null when the
   *  capital base ≤ 0 (degenerate ~empty period). */
  returnFraction: ReturnType<typeof bn> | null
  /** Period gain in USD (numerator: vEnd − vStart − net external flow). */
  returnUsd: ReturnType<typeof bn>
  /** True if any external cash flow landed inside this period. */
  hadExternalFlow: boolean
  /** Calendar length of the period in days (≥ 1). */
  spanDays: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Money-weighted (Modified Dietz) return for one snapshot-to-snapshot period,
 * with external cash flows removed and time-weighted within the period. Shared
 * by `computeMonthlyReturns` (labelled monthly returns) and `computeTWRSeries`
 * (geometric linking → TWR). Internal asset↔cash swaps are excluded via
 * `internalParentIds` (see `externalCashFlowUsd`).
 */
export function subPeriodReturn(
  prevSnap: Snapshot,
  currSnap: Snapshot,
  sortedTxs: Transaction[],
  rates: ExchangeRate[],
  internalParentIds: Set<string>,
): SubPeriodReturn {
  const vStart = bn(prevSnap.total_usd ?? 0)
  const vEnd = bn(currSnap.total_usd ?? 0)
  const periodStart = new Date(`${prevSnap.snapshot_date}T00:00:00Z`).getTime()
  const periodEnd = new Date(`${currSnap.snapshot_date}T00:00:00Z`).getTime()
  const spanDays = Math.max(1, (periodEnd - periodStart) / MS_PER_DAY)

  let netCashFlow = BN_ZERO
  let weightedCashFlow = BN_ZERO
  let hadExternalFlow = false
  for (const tx of sortedTxs) {
    const txDate = new Date(`${tx.date.slice(0, 10)}T00:00:00Z`).getTime()
    if (txDate <= periodStart || txDate > periodEnd) continue
    const c = externalCashFlowUsd(tx, rates, internalParentIds)
    if (c.isZero()) continue
    hadExternalFlow = true
    const t = (txDate - periodStart) / MS_PER_DAY
    const w = (spanDays - t) / spanDays
    netCashFlow = netCashFlow.plus(c)
    weightedCashFlow = weightedCashFlow.plus(c.times(w))
  }

  const denom = vStart.plus(weightedCashFlow)
  const numer = vEnd.minus(vStart).minus(netCashFlow)
  return {
    returnFraction: denom.isLessThanOrEqualTo(0) ? null : numer.div(denom),
    returnUsd: numer,
    hadExternalFlow,
    spanDays,
  }
}

export interface TWRPoint {
  date: string
  /** Cumulative TWR % since the window's first point (0 at that first point). */
  cumulativePct: number
}

export interface TWRSeries {
  points: TWRPoint[]
  /** Cumulative TWR % at the last point. */
  endPct: number
  /** True if any sub-period that contained an external flow spanned > 1 day
   *  (i.e. relied on non-daily snapshots — Modified-Dietz approximation). */
  approximate: boolean
}

/**
 * Portfolio time-weighted return (gold-standard, daily-valued where snapshots
 * are daily): geometrically link the per-snapshot money-weighted returns,
 * removing external cash flows at each boundary. Value-weighting across holdings
 * is automatic because each period reads the snapshot TOTAL. Rebased to 0% at
 * the window's first snapshot. See docs/return-metrics.md.
 */
export function computeTWRSeries(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): TWRSeries {
  const snaps = sortSnapshotsAsc(snapshots)
  if (snaps.length === 0) return { points: [], endPct: 0, approximate: false }

  const sortedTxs = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  const internalParentIds = collectPairedParentIds(transactions)

  let factor = bn(1)
  let approximate = false
  const points: TWRPoint[] = [
    { date: snaps[0].snapshot_date, cumulativePct: 0 },
  ]

  for (let i = 1; i < snaps.length; i++) {
    const sp = subPeriodReturn(
      snaps[i - 1],
      snaps[i],
      sortedTxs,
      rates,
      internalParentIds,
    )
    if (sp.returnFraction !== null) {
      factor = factor.times(bn(1).plus(sp.returnFraction))
    }
    if (sp.hadExternalFlow && sp.spanDays > 1) approximate = true
    points.push({
      date: snaps[i].snapshot_date,
      cumulativePct: factor.minus(1).times(BN_HUNDRED).toNumber(),
    })
  }

  return {
    points,
    endPct: factor.minus(1).times(BN_HUNDRED).toNumber(),
    approximate,
  }
}

/**
 * Modified Dietz monthly returns.
 *
 * R = (V_end − V_start − C) / (V_start + Σ C_i · w_i),  w_i = (T − t_i) / T
 *
 * Without daily granularity, "monthly" here means "between consecutive
 * snapshots". Cash flows that happened inside the period are weighted by
 * the time they were exposed to market movement, so depositing $1k mid-period
 * doesn't masquerade as +X% return.
 */
export function computeMonthlyReturns(
  snapshots: Snapshot[],
  transactions: Transaction[] = [],
  rates: ExchangeRate[] = [],
): MonthlyReturn[] {
  const returns: MonthlyReturn[] = []
  const snaps = sortSnapshotsAsc(snapshots)
  const sortedTxs = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  // Buy/sell parents with a paired cash child are internal asset↔cash swaps,
  // not external flows (see externalCashFlowUsd).
  const internalParentIds = collectPairedParentIds(transactions)

  for (let i = 1; i < snaps.length; i++) {
    const prevSnap = snaps[i - 1]
    const currSnap = snaps[i]
    const sp = subPeriodReturn(
      prevSnap,
      currSnap,
      sortedTxs,
      rates,
      internalParentIds,
    )
    if (sp.returnFraction === null) continue
    returns.push({
      month: currSnap.snapshot_date.slice(0, 7),
      label: formatMonthLabel(currSnap.snapshot_date),
      returnPct: sp.returnFraction.times(BN_HUNDRED).toNumber(),
      returnUsd: sp.returnUsd.toNumber(),
    })
  }

  return returns
}

export function computeYTDReturn(snapshots: Snapshot[]): number | null {
  if (snapshots.length < 2) return null

  const sorted = sortSnapshotsAsc(snapshots)
  const yearStart = `${new Date().getFullYear()}-01-01`
  // Earliest snapshot on/after Jan 1 of the current year — NOT a literal
  // January row. The daily cron may have missed January, or the portfolio may
  // have started mid-year; any later first-of-year snapshot is a valid anchor.
  const startSnap = sorted.find((s) => s.snapshot_date >= yearStart)
  const latest = sorted[sorted.length - 1]

  if (!startSnap || !latest) return null

  const start = bn(startSnap.total_usd)
  if (start.isZero()) return null

  return bn(latest.total_usd).minus(start).div(start).times(BN_HUNDRED).toNumber()
}

/**
 * All-time return = total P&L / total invested capital. Anchors on the user's
 * actual money in (not the first snapshot we happened to take).
 */
export function computeAllTimeReturn(
  totalPnlUsd: number,
  totalInvestedUsd: number,
): number | null {
  const investedAbs = Math.abs(totalInvestedUsd)
  if (investedAbs === 0) return null
  return (totalPnlUsd / investedAbs) * 100
}

/**
 * CAGR anchored on the user's first transaction (not first snapshot).
 *
 * For simple deposits with no withdrawals this is a fair approximation. With
 * irregular cash flows the rigorous metric is XIRR (money-weighted return);
 * we keep CAGR as a friendly summary and note the tradeoff.
 */
export function computeCAGR(
  currentValueUsd: number,
  totalInvestedUsd: number,
  firstTransactionDate: string | null,
): number | null {
  if (!firstTransactionDate) return null
  if (totalInvestedUsd <= 0 || currentValueUsd <= 0) return null

  const startDate = new Date(firstTransactionDate)
  const endDate = new Date()
  const years =
    (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (years < 0.08) return null // Less than ~1 month

  const ratio = currentValueUsd / totalInvestedUsd
  return (Math.pow(ratio, 1 / years) - 1) * 100
}

export function computeDrawdown(
  snapshots: Snapshot[],
): { date: string; drawdownPct: number }[] {
  const series: { date: string; drawdownPct: number }[] = []
  let peak = BN_ZERO

  for (const snap of sortSnapshotsAsc(snapshots)) {
    const val = bn(snap.total_usd)
    if (val.isGreaterThan(peak)) peak = val

    const drawdownPct = peak.isGreaterThan(0)
      ? val.minus(peak).div(peak).times(BN_HUNDRED).toNumber()
      : 0
    series.push({ date: snap.snapshot_date, drawdownPct })
  }

  return series
}

export interface CategoryAttributionRow {
  category: string
  costBasisUsd: number
  valueUsd: number
  pnlUsd: number
  /** Share of total portfolio P&L attributable to this category. */
  contributionPct: number
}

/**
 * Per-category attribution computed from FIFO cost basis (not snapshots).
 *
 * "Cost Basis" = what you actually invested in that category (fee-inclusive).
 * "Value" = current market value. "Total P&L" = unrealized (Value − Cost
 * Basis) + realized gains from past sells in the category — so it does NOT
 * equal Value − Cost Basis once a category has realized P&L. "Contribution"
 * = this category's share of total portfolio P&L.
 *
 * Anchored on real transactions, so it doesn't lie about the starting point
 * when snapshots happen to begin after the first deposit.
 */
export function computeCategoryAttribution(
  assetPnLs: AssetPnL[],
): CategoryAttributionRow[] {
  if (assetPnLs.length === 0) return []

  type Bucket = {
    costBasis: ReturnType<typeof bn>
    value: ReturnType<typeof bn>
    pnl: ReturnType<typeof bn>
  }
  const buckets = new Map<string, Bucket>()
  let totalPnl = BN_ZERO

  for (const a of assetPnLs) {
    if (a.category === "fiat") continue // fiat has no meaningful P&L

    const existing = buckets.get(a.category) ?? {
      costBasis: BN_ZERO,
      value: BN_ZERO,
      pnl: BN_ZERO,
    }
    existing.costBasis = existing.costBasis.plus(a.costBasisUsd)
    existing.value = existing.value.plus(a.currentValueUsd)
    const assetPnl = a.unrealizedPnlUsd.plus(a.realizedPnlUsd)
    existing.pnl = existing.pnl.plus(assetPnl)
    totalPnl = totalPnl.plus(assetPnl)
    buckets.set(a.category, existing)
  }

  const totalPnlAbs = totalPnl.abs()
  const rows: CategoryAttributionRow[] = []
  for (const [category, b] of buckets) {
    const contributionPct = totalPnlAbs.isZero()
      ? 0
      : b.pnl.div(totalPnlAbs).times(BN_HUNDRED).toNumber()
    rows.push({
      category,
      costBasisUsd: b.costBasis.toNumber(),
      valueUsd: b.value.toNumber(),
      pnlUsd: b.pnl.toNumber(),
      contributionPct,
    })
  }
  return rows.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd))
}

export interface PerformanceMetricsInput {
  snapshots: Snapshot[]
  transactions: Transaction[]
  rates: ExchangeRate[]
  totalInvestedUsd: number
  totalPnlUsd: number
  currentValueUsd: number
}

export function computePerformanceMetrics(
  input: PerformanceMetricsInput,
): PerformanceMetrics {
  const {
    snapshots,
    transactions,
    rates,
    totalInvestedUsd,
    totalPnlUsd,
    currentValueUsd,
  } = input

  const monthlyReturns = computeMonthlyReturns(snapshots, transactions, rates)
  const ytdReturnPct = computeYTDReturn(snapshots)
  const allTimeReturnPct = computeAllTimeReturn(totalPnlUsd, totalInvestedUsd)
  const firstTxDate = transactions.length > 0
    ? transactions
        .map((t) => t.date.slice(0, 10))
        .reduce((min, d) => (d < min ? d : min))
    : null
  const cagr = computeCAGR(currentValueUsd, totalInvestedUsd, firstTxDate)
  const drawdownSeries = computeDrawdown(snapshots)
  const maxDrawdownPct =
    drawdownSeries.length > 0
      ? Math.min(...drawdownSeries.map((d) => d.drawdownPct))
      : 0

  const bestMonth =
    monthlyReturns.length > 0
      ? monthlyReturns.reduce((a, b) =>
          a.returnPct > b.returnPct ? a : b,
        )
      : null

  const worstMonth =
    monthlyReturns.length > 0
      ? monthlyReturns.reduce((a, b) =>
          a.returnPct < b.returnPct ? a : b,
        )
      : null

  return {
    monthlyReturns,
    ytdReturnPct,
    allTimeReturnPct,
    cagr,
    maxDrawdownPct,
    bestMonth,
    worstMonth,
    drawdownSeries,
  }
}

/**
 * Apply a single transaction's impact on cumulative net invested capital (USD).
 *
 * Convention used here:
 *   buy            -> +total + fee   (real cash deployed for an asset)
 *   sell           -> -total + fee   (cash returned, fee still consumed)
 *   transfer_in    -> +total         (cost basis carried in — opening
 *                                     balance or platform-to-platform move)
 *   transfer_out   -> -total         (cost basis carried out — symmetric)
 *   dividend       -> 0  (income: neutral to net invested; +total only under
 *   interest       -> 0   treatIncomeAsCapital, for a fiat holding's cost basis)
 *   fee            -> +fee || +total (standalone fee — pure cost)
 *   cash_credit    -> +total         (auto-paired sell-side cash; cancels
 *                                     the parent sell's "-total" so the
 *                                     proceeds are correctly counted as
 *                                     staying inside the tracked portfolio
 *                                     instead of leaving as withdrawn cash)
 *   cash_debit     -> -total         (auto-paired platform-funded-buy cash;
 *                                     cancels the parent buy's "+total +fee"
 *                                     so a buy funded from on-platform cash
 *                                     doesn't double-count as new external
 *                                     capital)
 *
 * For genuine platform-to-platform transfers (a transfer_out paired with a
 * transfer_in of equal cost basis), the two cancel and the net invested
 * stays unchanged. For "loading event" / opening-balance entries (a lone
 * transfer_in with no matching out), the cost basis recorded on the
 * transaction is added to invested capital — so the asset doesn't appear
 * to be "free" relative to its current value. The cash_credit / cash_debit
 * cases follow the same cancellation pattern, but for the cash-flow linkage
 * feature: legacy sells without a paired cash_credit still subtract proceeds
 * (cash implicitly left the system); modern sells get a paired cash_credit
 * that cancels the subtraction (cash stays on-platform).
 */
interface InvestedOptions {
  /**
   * When true, dividend/interest income ADDS to the figure at its received USD
   * value. Used for a fiat holding's "deployed cash" cost basis, so earned
   * foreign cash (EUR/TRY) isn't later mislabeled as an FX gain. When false
   * (the global net-invested = external-capital sense), income is neutral.
   */
  treatIncomeAsCapital?: boolean
}

function applyTxToInvested(
  tx: Transaction,
  rates: ExchangeRate[],
  cum: ReturnType<typeof bn>,
  opts: InvestedOptions = {},
): ReturnType<typeof bn> {
  const totalUsd = normalizeToUsd(
    tx.total_cost ?? 0,
    tx.price_currency,
    tx.date,
    rates,
  )
  const feeUsd = tx.fee
    ? normalizeToUsd(tx.fee, tx.fee_currency ?? tx.price_currency, tx.date, rates)
    : bn(0)

  switch (tx.type) {
    case "buy":
      return cum.plus(totalUsd).plus(feeUsd)
    case "sell":
      return cum.minus(totalUsd).plus(feeUsd)
    case "transfer_in":
      return cum.plus(totalUsd)
    case "transfer_out":
      return cum.minus(totalUsd)
    case "dividend":
    case "interest":
      // Income, not external capital → neutral to net invested. The fiat
      // cost-basis caller opts in to absorb the received cash so it doesn't
      // surface as a phantom FX gain.
      return opts.treatIncomeAsCapital ? cum.plus(totalUsd) : cum
    case "fee":
      return cum.plus(feeUsd.isZero() ? totalUsd : feeUsd)
    case "cash_credit":
      return cum.plus(totalUsd)
    case "cash_debit":
      return cum.minus(totalUsd)
    default:
      return cum
  }
}

/**
 * Compute a P&L time series from snapshots and transactions.
 *
 * P&L at time T is defined as `total_value(T) - net_invested_capital(T)`.
 * Net invested capital is the cumulative cost basis deployed: buys plus
 * fees minus sells minus dividends/interest received, with `transfer_in`
 * adding and `transfer_out` subtracting the recorded cost basis. Real
 * platform-to-platform transfers cancel out (out + in net to zero);
 * opening-balance entries (lone `transfer_in`s) correctly add their cost
 * basis so the asset isn't treated as zero-cost.
 *
 * Transactions must be sortable by date. Rates are used to normalize
 * non-USD totals to USD.
 */
export function computePnLTimeSeries(
  snapshots: Snapshot[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): PnLPoint[] {
  if (snapshots.length === 0) return []

  const snaps = sortSnapshotsAsc(snapshots)
  const txs = [...transactions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )

  const series: PnLPoint[] = []
  let cumInvested = bn(0)
  let txIdx = 0

  for (const snap of snaps) {
    const cutoff = snap.snapshot_date

    // tx.date carries a time component (e.g. "2026-05-03 21:00:00+00")
    // while snap.snapshot_date is date-only ("2026-05-03"). String-comparing
    // the two with `<=` excludes same-day deposits because the longer
    // timestamp sorts after the bare date. Slice to YYYY-MM-DD so a deposit
    // recorded on snapshot day counts toward that day's invested capital.
    while (
      txIdx < txs.length &&
      txs[txIdx].date.slice(0, 10) <= cutoff
    ) {
      cumInvested = applyTxToInvested(txs[txIdx], rates, cumInvested)
      txIdx++
    }

    const totalUsd = bn(snap.total_usd ?? 0)
    const pnl = totalUsd.minus(cumInvested)

    series.push({
      date: snap.snapshot_date,
      totalUsd: totalUsd.toNumber(),
      investedUsd: cumInvested.toNumber(),
      pnlUsd: pnl.toNumber(),
    })
  }

  return series
}

/**
 * Compute the current cumulative net invested capital in USD across all
 * transactions (treats all transactions as "applied" through "now"). Used
 * to anchor the live "now" point in the P&L series.
 */
export function computeCurrentInvestedUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
  opts: InvestedOptions = {},
): number {
  let cum = bn(0)
  for (const tx of transactions) {
    cum = applyTxToInvested(tx, rates, cum, opts)
  }
  return cum.toNumber()
}

/**
 * Peak net invested capital in USD — the running maximum of the net-invested
 * ledger over the transaction timeline. "The most external capital ever at work
 * at once."
 *
 * This is the denominator for the all-time Total P&L % (lib/pnl/totals.ts).
 * Because it's the max of the SAME pairing-aware fold `computeCurrentInvestedUsd`
 * uses, it never shrinks when you withdraw — so withdrawing your own money can't
 * change your return %, and a sell reads the same % whether its proceeds are
 * withdrawn or kept as cash. Returns a BigNumber; the caller decides the % and
 * renders "—" when peak ≤ 0 (nothing was ever deployed).
 */
export function computePeakInvestedUsd(
  transactions: Transaction[],
  rates: ExchangeRate[],
  opts: InvestedOptions = {},
): ReturnType<typeof bn> {
  let cum = bn(0)
  let peak = bn(0)
  for (const tx of transactions) {
    cum = applyTxToInvested(tx, rates, cum, opts)
    if (cum.gt(peak)) peak = cum
  }
  return peak
}
