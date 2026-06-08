import { bn, BN_ZERO } from "@/lib/config"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import { buildRealizedByTx } from "@/lib/pnl/realized"
import { computeUnrealizedPnL } from "@/lib/pnl/unrealized"
import { computeIncomeUsd } from "@/lib/pnl/income"
import {
  computeCurrentInvestedUsd,
  computePeakInvestedUsd,
} from "@/lib/performance"
import type {
  Transaction,
  PriceCache,
  Snapshot,
  ExchangeRate,
} from "@/types/database"
import type { AssetPnL, HoldingPnL, PortfolioPnL } from "@/lib/pnl/types"
import type { HoldingWithDetails } from "@/lib/queries/holdings"

/** Group transactions by composite key `asset_id|platform_id`. */
function groupByAssetPlatform(
  transactions: Transaction[],
): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {}
  for (const tx of transactions) {
    const key = `${tx.asset_id}|${tx.platform_id}`
    if (!groups[key]) groups[key] = []
    groups[key].push(tx)
  }
  return groups
}

export interface PortfolioPnLInput {
  holdings: HoldingWithDetails[]
  prices: Record<string, PriceCache>
  transactions: Transaction[]
  rates: ExchangeRate[]
  /** Latest snapshot supplies per-(ticker, platform) prices; [] → use live. */
  snapshots: Snapshot[]
}

export const EMPTY_PNL: PortfolioPnL = {
  assetPnLs: [],
  holdingPnLs: [],
  totalCostBasisUsd: BN_ZERO,
  totalCurrentValueUsd: BN_ZERO,
  totalUnrealizedPnlUsd: BN_ZERO,
  totalTaxAccrualUsd: BN_ZERO,
  totalRealizedPnlUsd: BN_ZERO,
  totalIncomeUsd: BN_ZERO,
  totalInvestedUsd: BN_ZERO,
  totalPeakInvestedUsd: BN_ZERO,
}

/**
 * The P&L engine, as a pure function. Composes the per-(asset, platform) FIFO
 * cost basis + unrealized, aggregates to asset level, and computes the canonical
 * portfolio totals: value, unrealized (held), realized & income (FULL history,
 * so sold-out positions count), net invested, and peak net invested.
 *
 * This is the single source of truth `usePnL` wraps — no other code path
 * re-derives portfolio P&L, so the Dashboard and Portfolio can never diverge.
 * The reconciliation invariant `value − netInvested == unrealized + realized +
 * income` holds for the returned totals (usePnL asserts it).
 *
 * `currentValueUsd` per holding prefers the latest snapshot's per-(ticker,
 * platform) price × live balance, falling back to live price — so a quantity
 * change shows immediately while the snapshot stays the price source of truth.
 */
export function computePortfolioPnL(input: PortfolioPnLInput): PortfolioPnL {
  const { holdings, prices, transactions, rates, snapshots } = input
  if (holdings.length === 0) {
    // Income/realized can still be non-zero with no current holdings (fully
    // sold-out book), so compute the full-history terms even on the empty path.
    const totalRealizedPnlUsd = sumRealized(transactions, rates)
    const totalIncomeUsd = computeIncomeUsd(transactions, rates)
    const totalInvestedUsd = bn(computeCurrentInvestedUsd(transactions, rates))
    const totalPeakInvestedUsd = computePeakInvestedUsd(transactions, rates)
    return {
      ...EMPTY_PNL,
      totalRealizedPnlUsd,
      totalIncomeUsd,
      totalInvestedUsd,
      totalPeakInvestedUsd,
    }
  }

  const latest = snapshots[snapshots.length - 1]
  const snapshotPriceByTickerPlatform = new Map<string, number>()
  if (latest?.breakdown?.by_asset) {
    for (const entry of latest.breakdown.by_asset) {
      snapshotPriceByTickerPlatform.set(
        `${entry.ticker}|${entry.platform}`,
        entry.price_usd,
      )
    }
  }

  const grouped = groupByAssetPlatform(transactions)

  // ── Per-(asset, platform) P&L ──────────────────────────────────────
  const holdingPnLs: HoldingPnL[] = []

  for (const h of holdings) {
    const ticker = h.assets.ticker
    const category = h.assets.category
    const platformName = h.platforms.name
    const priceKey = h.assets.price_id ?? ticker
    const livePrice = prices[priceKey]?.price_usd ?? 0
    const key = `${h.asset_id}|${h.platform_id}`
    const snapshotKey = `${ticker}|${platformName}`
    const snapshotPriceUsd =
      snapshotPriceByTickerPlatform.get(snapshotKey) ?? livePrice
    const liveBalanceBn = bn(h.balance)

    if (h.assets.is_currency) {
      // Fiat: USD value = balance × price. Cost basis = net USD deployed to
      // build this cash pile (income absorbed at received value so earned
      // foreign cash isn't mislabeled as FX gain). The gap value − deployed is
      // real FX P&L, surfaced as unrealized so the money-weighted total
      // reconciles with the per-asset breakdown.
      const currentValueUsd = liveBalanceBn.times(bn(snapshotPriceUsd))
      const fiatCostBasisUsd = bn(
        computeCurrentInvestedUsd(grouped[key] ?? [], rates, {
          treatIncomeAsCapital: true,
        }),
      )
      holdingPnLs.push({
        assetId: h.asset_id,
        platformId: h.platform_id,
        platformName,
        ticker,
        category,
        costBasisUsd: fiatCostBasisUsd,
        costBasisNative: liveBalanceBn,
        nativeCurrency: ticker,
        currentValueUsd,
        unrealizedPnlUsd: currentValueUsd.minus(fiatCostBasisUsd),
        realizedPnlUsd: BN_ZERO,
        taxAccrualUsd: BN_ZERO,
      })
      continue
    }

    const holdingTxs = grouped[key] ?? []
    const { lots, realized } = computeFIFOLots(holdingTxs, rates)

    const unrealized = computeUnrealizedPnL(lots, snapshotPriceUsd, h.balance)

    const nativeCurrency: string | null = lots[0]?.priceCurrency ?? null
    const nativeConsistent =
      lots.length > 0 && lots.every((l) => l.priceCurrency === nativeCurrency)
    const costBasisNative = nativeConsistent
      ? lots.reduce(
          (sum: ReturnType<typeof bn>, lot) =>
            sum.plus(lot.amount.times(lot.unitPriceOriginal)),
          BN_ZERO,
        )
      : null

    const totalRealized = realized.reduce(
      (sum, r) => sum.plus(r.realizedPnlUsd),
      BN_ZERO,
    )

    // At-source tax accrual: rate × the POSITIVE native gain (held + realized).
    // Additive overlay — gross unrealized/realized are untouched, so the
    // money-weighted invariant is preserved. Convert the native (TRY) tax to USD
    // using the asset's own price pair (price_usd / price_try), which is the FX
    // implied by the same quote, so no separate rate lookup is needed.
    const taxRate = h.assets.at_source_tax_rate
    let taxAccrualUsd = BN_ZERO
    if (
      taxRate != null &&
      taxRate > 0 &&
      nativeConsistent &&
      nativeCurrency &&
      costBasisNative !== null
    ) {
      const pc = prices[priceKey]
      // Uses the live price-cache (price_try/price_usd), not the snapshot price
      // used for the gross value above — an accepted minor divergence.
      const nativeUnitPrice =
        nativeCurrency === "TRY" ? bn(pc?.price_try ?? 0) : bn(pc?.price_usd ?? 0)
      const currentValueNative = liveBalanceBn.times(nativeUnitPrice)
      const unrealizedNativeGain = currentValueNative.minus(costBasisNative)
      const posUnrealized = unrealizedNativeGain.gt(0)
        ? unrealizedNativeGain
        : BN_ZERO
      // Realized native gains are summed only over THIS held position's sells.
      // A fully sold-out at-source-taxed asset has no holdings row, so its
      // realized tax is not accrued here — deferred (rare for a held-and-growing
      // PPF; revisit if a closed-position after-tax figure is ever needed).
      const realizedNativeGain = realized.reduce(
        (s, rz) =>
          rz.nativePnl &&
          rz.nativeCurrency === nativeCurrency &&
          rz.nativePnl.gt(0)
            ? s.plus(rz.nativePnl)
            : s,
        BN_ZERO,
      )
      const taxNative = posUnrealized.plus(realizedNativeGain).times(bn(taxRate))
      if (nativeCurrency === "TRY") {
        const usdPrice = bn(pc?.price_usd ?? 0)
        const tryPrice = bn(pc?.price_try ?? 0)
        taxAccrualUsd = tryPrice.isZero()
          ? BN_ZERO
          : taxNative.times(usdPrice).div(tryPrice)
      } else {
        taxAccrualUsd = taxNative
      }
    }

    holdingPnLs.push({
      assetId: h.asset_id,
      platformId: h.platform_id,
      platformName,
      ticker,
      category,
      costBasisUsd: unrealized.costBasisUsd,
      costBasisNative,
      nativeCurrency: nativeConsistent ? nativeCurrency : null,
      currentValueUsd: unrealized.currentValueUsd,
      unrealizedPnlUsd: unrealized.unrealizedPnlUsd,
      realizedPnlUsd: totalRealized,
      taxAccrualUsd,
    })
  }

  // ── Aggregate to asset level ───────────────────────────────────────
  const assetMap = new Map<
    string,
    {
      ticker: string
      category: string
      costBasisUsd: ReturnType<typeof bn>
      costBasisNative: ReturnType<typeof bn> | null
      nativeCurrency: string | null
      currentValueUsd: ReturnType<typeof bn>
      unrealizedPnlUsd: ReturnType<typeof bn>
      realizedPnlUsd: ReturnType<typeof bn>
      taxAccrualUsd: ReturnType<typeof bn>
    }
  >()

  for (const hp of holdingPnLs) {
    const existing = assetMap.get(hp.assetId)
    if (existing) {
      existing.costBasisUsd = existing.costBasisUsd.plus(hp.costBasisUsd)
      existing.currentValueUsd = existing.currentValueUsd.plus(hp.currentValueUsd)
      existing.unrealizedPnlUsd = existing.unrealizedPnlUsd.plus(hp.unrealizedPnlUsd)
      existing.realizedPnlUsd = existing.realizedPnlUsd.plus(hp.realizedPnlUsd)
      existing.taxAccrualUsd = existing.taxAccrualUsd.plus(hp.taxAccrualUsd)
      if (
        existing.costBasisNative !== null &&
        hp.costBasisNative !== null &&
        existing.nativeCurrency === hp.nativeCurrency
      ) {
        existing.costBasisNative = existing.costBasisNative.plus(hp.costBasisNative)
      } else {
        existing.costBasisNative = null
        existing.nativeCurrency = null
      }
    } else {
      assetMap.set(hp.assetId, {
        ticker: hp.ticker,
        category: hp.category,
        costBasisUsd: hp.costBasisUsd,
        costBasisNative: hp.costBasisNative,
        nativeCurrency: hp.nativeCurrency,
        currentValueUsd: hp.currentValueUsd,
        unrealizedPnlUsd: hp.unrealizedPnlUsd,
        realizedPnlUsd: hp.realizedPnlUsd,
        taxAccrualUsd: hp.taxAccrualUsd,
      })
    }
  }

  const assetPnLs: AssetPnL[] = []
  for (const [assetId, data] of assetMap) {
    const unrealizedPnlPct = data.costBasisUsd.isZero()
      ? BN_ZERO
      : data.unrealizedPnlUsd.div(data.costBasisUsd).times(100)

    assetPnLs.push({
      assetId,
      ticker: data.ticker,
      category: data.category,
      costBasisUsd: data.costBasisUsd,
      costBasisNative: data.costBasisNative,
      nativeCurrency: data.nativeCurrency,
      currentValueUsd: data.currentValueUsd,
      unrealizedPnlUsd: data.unrealizedPnlUsd,
      unrealizedPnlPct,
      realizedPnlUsd: data.realizedPnlUsd,
      taxAccrualUsd: data.taxAccrualUsd,
      lots: [],
    })
  }

  const totalCostBasisUsd = assetPnLs.reduce(
    (s, a) => s.plus(a.costBasisUsd),
    BN_ZERO,
  )
  const totalCurrentValueUsd = assetPnLs.reduce(
    (s, a) => s.plus(a.currentValueUsd),
    BN_ZERO,
  )
  const totalUnrealizedPnlUsd = assetPnLs.reduce(
    (s, a) => s.plus(a.unrealizedPnlUsd),
    BN_ZERO,
  )
  const totalTaxAccrualUsd = assetPnLs.reduce(
    (s, a) => s.plus(a.taxAccrualUsd),
    BN_ZERO,
  )

  // Realized & income over the FULL history (incl. sold-out positions, which
  // have no holdings row) — not the held-only per-asset sum.
  const totalRealizedPnlUsd = sumRealized(transactions, rates)
  const totalIncomeUsd = computeIncomeUsd(transactions, rates)
  const totalInvestedUsd = bn(computeCurrentInvestedUsd(transactions, rates))
  const totalPeakInvestedUsd = computePeakInvestedUsd(transactions, rates)

  return {
    assetPnLs,
    holdingPnLs,
    totalCostBasisUsd,
    totalCurrentValueUsd,
    totalUnrealizedPnlUsd,
    totalTaxAccrualUsd,
    totalRealizedPnlUsd,
    totalIncomeUsd,
    totalInvestedUsd,
    totalPeakInvestedUsd,
  }
}

function sumRealized(
  transactions: Transaction[],
  rates: ExchangeRate[],
): ReturnType<typeof bn> {
  let sum = BN_ZERO
  for (const entry of buildRealizedByTx(transactions, rates).values()) {
    sum = sum.plus(entry.realizedPnlUsd)
  }
  return sum
}
