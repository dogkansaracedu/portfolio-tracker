import { useMemo } from "react"
import { bn, BN_ZERO, BN_HUNDRED } from "@/lib/config"
import { useAssets } from "@/hooks/useAssets"
import { usePrices } from "@/hooks/usePrices"
import { useSnapshots } from "@/hooks/useSnapshots"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { computeFIFOLots } from "@/lib/pnl/fifo"
import type {
  Asset,
  ExchangeRate,
  Snapshot,
  SnapshotBreakdown,
  Transaction,
} from "@/types/database"

// ─── Types ──────────────────────────────────────────────────────────

export interface CategoryAllocation {
  category: string
  valueUsd: number
  valueTry: number
  percentage: number
}

export interface PlatformAllocation {
  platformName: string
  color: string
  valueUsd: number
  valueTry: number
  percentage: number
}

export interface TagAllocation {
  tag: string
  valueUsd: number
  valueTry: number
  percentage: number
}

export interface TopMover {
  assetId: string
  ticker: string
  name: string
  unrealizedPnlUsd: number
  unrealizedPnlPct: number
  currentValueUsd: number
}

export interface DashboardData {
  totalValueUsd: number
  totalValueTry: number
  byCategory: CategoryAllocation[]
  byPlatform: PlatformAllocation[]
  byTag: TagAllocation[]
  topMovers: TopMover[]
  snapshots: Snapshot[]
  /** Latest USD/TRY rate, or 1 if unavailable. */
  usdTry: number
  loading: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Compute top movers from the snapshot's per-asset values + FIFO cost basis.
 *
 * Per-asset breakdown in the snapshot is per (asset, platform). We aggregate
 * to the asset level, then pair with FIFO cost basis (deterministic from
 * transactions) to derive unrealized P&L. Same source of truth as the
 * snapshot total — no holdings × prices recomputation on the frontend.
 */
function deriveTopMovers(
  byAsset: SnapshotBreakdown["by_asset"],
  assets: Asset[],
  transactions: Transaction[],
  rates: ExchangeRate[],
): TopMover[] {
  if (byAsset.length === 0) return []

  // ticker → aggregated current value (sum across platforms)
  const valueByTicker = new Map<string, number>()
  for (const entry of byAsset) {
    const cur = valueByTicker.get(entry.ticker) ?? 0
    valueByTicker.set(entry.ticker, cur + entry.value_usd)
  }

  // ticker → asset (for id, name, category)
  const assetByTicker = new Map<string, Asset>()
  for (const a of assets) assetByTicker.set(a.ticker, a)

  // assetId → transactions (for FIFO)
  const txsByAssetId = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const list = txsByAssetId.get(tx.asset_id) ?? []
    list.push(tx)
    txsByAssetId.set(tx.asset_id, list)
  }

  const movers: TopMover[] = []
  for (const [ticker, currentValueUsd] of valueByTicker) {
    const asset = assetByTicker.get(ticker)
    if (!asset) continue
    if (asset.category === "fiat") continue // fiat has no meaningful P&L

    const txs = txsByAssetId.get(asset.id) ?? []
    const { lots } = computeFIFOLots(txs, rates)
    const costBasisUsd = lots.reduce(
      (sum, lot) => sum.plus(lot.amount.times(lot.unitPriceUsd)),
      BN_ZERO,
    )
    const cv = bn(currentValueUsd)
    const unrealizedPnlUsd = cv.minus(costBasisUsd)
    const unrealizedPnlPct = costBasisUsd.isZero()
      ? BN_ZERO
      : unrealizedPnlUsd.div(costBasisUsd).times(BN_HUNDRED)

    movers.push({
      assetId: asset.id,
      ticker,
      name: asset.name,
      unrealizedPnlUsd: unrealizedPnlUsd.toNumber(),
      unrealizedPnlPct: unrealizedPnlPct.toNumber(),
      currentValueUsd,
    })
  }

  movers.sort((a, b) => Math.abs(b.unrealizedPnlUsd) - Math.abs(a.unrealizedPnlUsd))
  return movers.slice(0, 5)
}

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Dashboard data derived entirely from the latest snapshot's breakdown.
 *
 * Every aggregation (totals, by_category, by_platform, by_tag) is read from
 * the snapshot — never re-computed from `holdings × prices` on the client.
 * This eliminates the duplicated math that produced bugs like the dashboard
 * P&L disagreeing with the portfolio P&L (commit 3a3cc45). The snapshot is
 * the single source of truth; freshness is the responsibility of whatever
 * keeps it written (cron + on-load refresh).
 *
 * FIFO-based cost basis stays on the client because it's a pure function of
 * `transactions` — no second source to drift against.
 */
export function useDashboard(): DashboardData {
  const { assets, loading: assetsLoading } = useAssets()
  const { rates, loading: pricesLoading } = usePrices()
  const { snapshots, loading: snapshotsLoading } = useSnapshots()
  const { transactions, rates: txRates, loading: txLoading } =
    useTransactionData()

  const loading =
    assetsLoading || pricesLoading || snapshotsLoading || txLoading
  const usdTry = rates?.usd_try ?? 1

  const latest: Snapshot | undefined = snapshots[snapshots.length - 1]

  const result = useMemo((): Omit<
    DashboardData,
    "snapshots" | "usdTry" | "loading"
  > => {
    const empty = {
      totalValueUsd: 0,
      totalValueTry: 0,
      byCategory: [],
      byPlatform: [],
      byTag: [],
      topMovers: [],
    }

    if (!latest || !latest.breakdown) return empty

    const breakdown = latest.breakdown
    const totalValueUsd = Number(latest.total_usd ?? 0)
    const totalValueTry = Number(latest.total_try ?? 0)

    const byCategory: CategoryAllocation[] = Object.entries(breakdown.by_category)
      .map(([category, vals]) => ({
        category,
        valueUsd: vals.usd,
        valueTry: vals.try,
        percentage: vals.pct,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    const byPlatform: PlatformAllocation[] = Object.entries(breakdown.by_platform)
      .map(([platformName, vals]) => ({
        platformName,
        color: vals.color,
        valueUsd: vals.usd,
        valueTry: vals.try,
        percentage: vals.pct,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    const byTag: TagAllocation[] = Object.entries(breakdown.by_tag)
      .map(([tag, vals]) => ({
        tag,
        valueUsd: vals.usd,
        valueTry: vals.try,
        percentage: vals.pct,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd)

    const topMovers = deriveTopMovers(
      breakdown.by_asset,
      assets,
      transactions,
      txRates,
    )

    return {
      totalValueUsd,
      totalValueTry,
      byCategory,
      byPlatform,
      byTag,
      topMovers,
    }
  }, [latest, assets, transactions, txRates])

  return { ...result, snapshots, usdTry, loading }
}
