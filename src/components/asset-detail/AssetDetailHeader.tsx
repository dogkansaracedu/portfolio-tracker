import { Link } from "react-router"
import { ArrowLeft, Plus, TableIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AssetIcon } from "@/components/common/AssetIcon"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { formatCurrency } from "@/lib/prices"
import { assetNativeCurrency, CATEGORY_LABELS } from "@/lib/constants/assets"
import { ADD_TRANSACTION_LABEL } from "@/lib/constants/transaction-types"
import type { Asset } from "@/types/database"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

interface Props {
  asset: Asset
  enriched: EnrichedAsset
}

export function AssetDetailHeader({ asset, enriched }: Props) {
  const { openTransactionModal } = useTransactionModal()
  // Same convention as the Portfolio row: native price with the USD equivalent
  // in parentheses for TRY natives; we only have USD + TRY price columns.
  const showNative = assetNativeCurrency(asset) === "TRY"

  return (
    <div className="space-y-3">
      <Link
        to="/portfolio"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Portfolio
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AssetIcon asset={asset} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{asset.ticker}</h1>
              <Badge variant="secondary">
                {CATEGORY_LABELS[asset.category] ?? asset.category}
              </Badge>
              {(asset.tags ?? []).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground">{asset.name}</p>
            <p className="mt-1 tabular-nums text-sm">
              {showNative
                ? formatCurrency(enriched.currentPriceTry, "TRY")
                : formatCurrency(enriched.currentPriceUsd, "USD")}
              {showNative && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (~{formatCurrency(enriched.currentPriceUsd, "USD")})
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={`/transactions/edit/${asset.id}`} />}
          >
            <TableIcon className="size-4" />
            Edit transactions
          </Button>
          <Button onClick={() => openTransactionModal({ assetId: asset.id })}>
            <Plus className="size-4" />
            {ADD_TRANSACTION_LABEL}
          </Button>
        </div>
      </div>
    </div>
  )
}
