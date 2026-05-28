import { Plus } from "lucide-react"
import { Link } from "react-router"
import { TableRow, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useTransactionModal } from "@/contexts/TransactionContext"
import {
  formatCurrency,
  formatCryptoAmount,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

interface PortfolioRowProps {
  asset: EnrichedAsset
}

function formatQuantity(balance: number, category: string): string {
  if (category === "crypto") return formatCryptoAmount(balance)
  if (category === "fiat")
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(balance)
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance)
}

// ─── Desktop Table Row ──────────────────────────────────────────────

export function PortfolioRow({ asset }: PortfolioRowProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const { openTransactionModal } = useTransactionModal()
  const o = (v: string) => obfuscate(v, obfuscated)

  const displayPrice =
    currency === "USD" ? asset.currentPriceUsd : asset.currentPriceTry
  const displayValue =
    currency === "USD" ? asset.currentValueUsd : asset.currentValueTry
  const pnlIsPositive = asset.unrealizedPnlUsd >= 0

  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/transactions/edit/${asset.id}`}
          className="flex flex-col items-start text-left hover:underline focus:outline-none focus-visible:underline"
          title="View / edit transactions"
        >
          <span className="font-medium">{asset.name}</span>
          <span className="text-xs text-muted-foreground">{asset.ticker}</span>
        </Link>
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-0.5">
          {asset.holdings.map((h) => (
            <div key={h.platformId} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: h.platformColor }}
              />
              <span className="text-xs">{h.platformName}</span>
            </div>
          ))}
          {asset.holdings.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>

      <TableCell className="text-right tabular-nums">
        {o(formatQuantity(asset.totalBalance, asset.category))}
      </TableCell>

      <TableCell className="text-right tabular-nums text-muted-foreground">
        {asset.totalBalance > 0
          ? formatCurrency(asset.costBasisUsd / asset.totalBalance, "USD")
          : "—"}
      </TableCell>

      <TableCell className="text-right tabular-nums">
        {formatCurrency(displayPrice, currency)}
      </TableCell>

      <TableCell className="text-right tabular-nums font-semibold">
        {o(formatCurrency(displayValue, currency))}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span className={gainLossClass(pnlIsPositive)}>
            {o(formatSignedCurrency(asset.unrealizedPnlUsd, "USD"))}
          </span>
          <span className={`text-xs ${gainLossClass(pnlIsPositive)}`}>
            {formatSignedPercent(asset.unrealizedPnlPct)}
          </span>
        </div>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-sm tabular-nums">
            {asset.allocationPct.toFixed(1)}%
          </span>
          <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(asset.allocationPct, 100)}%` }}
            />
          </div>
        </div>
      </TableCell>

      <TableCell>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => openTransactionModal({ assetId: asset.id })}
        >
          <Plus className="size-3.5" />
          <span className="sr-only">Add Transaction</span>
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ─── Mobile Card ────────────────────────────────────────────────────

export function PortfolioRowCard({ asset }: PortfolioRowProps) {
  const { currency } = useDisplayCurrency()
  const { openTransactionModal } = useTransactionModal()

  const displayValue =
    currency === "USD" ? asset.currentValueUsd : asset.currentValueTry
  const pnlIsPositive = asset.unrealizedPnlUsd >= 0

  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between">
        <Link
          to={`/transactions/edit/${asset.id}`}
          className="flex flex-col items-start gap-0.5 text-left focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{asset.name}</span>
            <Badge variant="secondary">{asset.ticker}</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {asset.holdings.map((h) => (
              <span key={h.platformId} className="flex items-center gap-1">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: h.platformColor }}
                />
                {h.platformName}
              </span>
            ))}
          </div>
        </Link>

        <div className="flex flex-col items-end gap-0.5">
          <span className="font-semibold">
            {formatCurrency(displayValue, currency)}
          </span>
          <span className={`text-xs ${gainLossClass(pnlIsPositive)}`}>
            {formatSignedCurrency(asset.unrealizedPnlUsd, "USD")}
            {" "}
            ({formatSignedPercent(asset.unrealizedPnlPct)})
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openTransactionModal({ assetId: asset.id })}
            className="mt-1"
          >
            <Plus className="size-3" />
            Add Tx
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
