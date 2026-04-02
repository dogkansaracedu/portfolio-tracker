import { Plus } from "lucide-react"
import { TableRow, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { formatCurrency, formatCryptoAmount, obfuscate } from "@/lib/prices"
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
        <div className="flex flex-col">
          <span className="font-medium">{asset.name}</span>
          <span className="text-xs text-muted-foreground">{asset.ticker}</span>
        </div>
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
          <span
            className={pnlIsPositive ? "text-emerald-600" : "text-red-500"}
          >
            {pnlIsPositive ? "+" : ""}
            {o(formatCurrency(asset.unrealizedPnlUsd, "USD"))}
          </span>
          <span
            className={`text-xs ${
              pnlIsPositive ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {pnlIsPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(2)}%
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
          onClick={() => openTransactionModal(asset.id)}
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
        <div className="flex flex-col gap-0.5">
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
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <span className="font-semibold">
            {formatCurrency(displayValue, currency)}
          </span>
          <span
            className={`text-xs ${
              pnlIsPositive ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {pnlIsPositive ? "+" : ""}
            {formatCurrency(asset.unrealizedPnlUsd, "USD")}
            {" "}
            ({pnlIsPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(2)}%)
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openTransactionModal(asset.id)}
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
