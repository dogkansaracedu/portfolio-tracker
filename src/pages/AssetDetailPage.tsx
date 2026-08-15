import { Suspense, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { Button } from "@/components/ui/button"
import { useAssetDetail } from "@/hooks/useAssetDetail"
import { useTransactions } from "@/hooks/useTransactions"
import { useRealizedPnL } from "@/hooks/useRealizedPnL"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { AssetDetailHeader } from "@/components/asset-detail/AssetDetailHeader"
import { AssetPositionSummary } from "@/components/asset-detail/AssetPositionSummary"
import { AssetPlatformTable } from "@/components/asset-detail/AssetPlatformTable"
import { AssetIncomeCosts } from "@/components/asset-detail/AssetIncomeCosts"
import { AssetHistoryChart } from "@/components/charts/LazyChart"
import { TransactionList } from "@/components/transactions/TransactionList"
import {
  fetchLinkedChildrenForParents,
  type TransactionWithDetails,
} from "@/lib/queries/transactions"

export default function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const detail = useAssetDetail(assetId)
  const { currency } = useDisplayCurrency()
  const realizedByTx = useRealizedPnL()

  // Same composition as TransactionsPage, server-filtered to this asset.
  const txFilters = useMemo(() => ({ assetId }), [assetId])
  const { transactions, loading: txLoading } = useTransactions(txFilters)
  const [childMap, setChildMap] = useState<Map<string, TransactionWithDetails>>(
    new Map(),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const parentIds = transactions
        .filter((t) => t.linked_tx_id == null)
        .map((t) => t.id)
      if (parentIds.length === 0) {
        if (!cancelled) setChildMap(new Map())
        return
      }
      const next = await fetchLinkedChildrenForParents(parentIds)
      if (!cancelled) setChildMap(next)
    })()
    return () => {
      cancelled = true
    }
  }, [transactions])

  if (detail.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading asset...
      </div>
    )
  }

  if (detail.notFound || !detail.asset || !detail.enriched) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-muted-foreground">
          This asset doesn't exist or has no activity yet.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link to="/portfolio" />}>
          Back to Portfolio
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AssetDetailHeader asset={detail.asset} enriched={detail.enriched} />

      <AssetPositionSummary
        enriched={detail.enriched}
        held={detail.held}
        realizedPnlUsd={detail.realizedPnlUsd}
        realizedPnlPct={detail.realizedPnlPct}
        totalReturnUsd={detail.totalReturnUsd}
        totalReturnPct={detail.totalReturnPct}
        mwrCumulativePct={detail.mwrCumulativePct}
        mwrAnnualizedPct={detail.mwrAnnualizedPct}
        dailyReturnAvailable={detail.dailyReturnAvailable}
      />

      <Suspense fallback={<div className="h-[300px]" />}>
        <AssetHistoryChart history={detail.history} currency={currency} />
      </Suspense>

      <AssetIncomeCosts
        incomeUsd={detail.incomeUsd}
        taxesUsd={detail.taxesUsd}
        feesUsd={detail.feesUsd}
      />

      {detail.held && (
        <AssetPlatformTable
          slices={detail.platformSlices}
          category={detail.asset.category}
        />
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">Transactions</h2>
        <TransactionList
          transactions={transactions}
          loading={txLoading}
          currency={currency}
          childMap={childMap}
          realizedByTx={realizedByTx}
        />
      </div>
    </div>
  )
}
