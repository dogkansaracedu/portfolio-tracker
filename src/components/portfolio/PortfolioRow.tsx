import { Plus } from "lucide-react"
import { Link } from "react-router"
import { TableRow, TableCell } from "@/components/ui/table"
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
import type { EnrichedAsset, ReturnMode } from "@/hooks/usePortfolio"
import { assetNativeCurrency } from "@/lib/constants/assets"
import { AssetIcon } from "@/components/common/AssetIcon"

interface PortfolioRowProps {
  asset: EnrichedAsset
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
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

// Current per-unit price in the asset's native currency (TRY natives also show
// the USD equivalent in parentheses). Shared by the desktop row and the mobile
// card so the two never drift. We only have USD + TRY price columns, so non-TRY
// natives (EUR) fall back to USD.
function CurrentPrice({ asset }: { asset: EnrichedAsset }) {
  const showNative = assetNativeCurrency(asset) === "TRY"
  return (
    <>
      {showNative
        ? formatCurrency(asset.currentPriceTry, "TRY")
        : formatCurrency(asset.currentPriceUsd, "USD")}
      {showNative && (
        <span className="ml-1 text-xs text-muted-foreground">
          (~{formatCurrency(asset.currentPriceUsd, "USD")})
        </span>
      )}
    </>
  )
}

// ─── Desktop Table Row ──────────────────────────────────────────────

export function PortfolioRow({
  asset,
  returnMode,
  dailyReturnAvailable,
}: PortfolioRowProps) {
  const { currency, obfuscated } = useDisplayCurrency()
  const { openTransactionModal } = useTransactionModal()
  const o = (v: string) => obfuscate(v, obfuscated)

  // Per-unit price and cost render in the asset's OWN currency (TUPRS in ₺,
  // gram gold in ₺) with the USD equivalent in parentheses — price at today's
  // rate, cost at the purchase-date rate (so a flat-₺ / weaker-lira position
  // reads as a USD loss). Value, P&L and totals stay in USD / the toggle.
  // We only have USD + TRY price columns, so non-TRY natives (EUR) show USD.
  const showNative = assetNativeCurrency(asset) === "TRY"
  const costUsdPerUnit =
    asset.totalBalance > 0 ? asset.costBasisUsd / asset.totalBalance : null
  const costNativePerUnit =
    showNative &&
    asset.costBasisNative != null &&
    asset.nativeCurrency === "TRY" &&
    asset.totalBalance > 0
      ? asset.costBasisNative / asset.totalBalance
      : null

  const displayValue =
    currency === "USD" ? asset.currentValueUsd : asset.currentValueTry
  const isDaily = returnMode === "daily"
  const showReturn = !isDaily || dailyReturnAvailable
  const returnUsd = isDaily ? asset.dailyReturnUsd : asset.unrealizedPnlUsd
  const returnPct = isDaily ? asset.dailyReturnPct : asset.unrealizedPnlPct

  // Net (after-tax) applies only in Total mode — daily return stays gross since
  // tax is on the cumulative gain. Untaxed assets render exactly as gross.
  const taxed = !isDaily && asset.taxAccrualUsd > 0
  const netUsd = taxed ? returnUsd - asset.taxAccrualUsd : returnUsd
  const netPct =
    taxed && asset.costBasisUsd > 0 ? (netUsd / asset.costBasisUsd) * 100 : returnPct
  const netIsPositive = netUsd >= 0

  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/transactions/edit/${asset.id}`}
          className="flex items-center gap-2 text-left hover:underline focus:outline-none focus-visible:underline"
          title="View / edit transactions"
        >
          <AssetIcon asset={asset} size="sm" />
          <span className="font-medium">{asset.ticker}</span>
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
        {costUsdPerUnit == null ? (
          "—"
        ) : costNativePerUnit != null ? (
          <>
            {formatCurrency(costNativePerUnit, "TRY")}
            <span className="ml-1 text-xs">
              (~{formatCurrency(costUsdPerUnit, "USD")})
            </span>
          </>
        ) : (
          formatCurrency(costUsdPerUnit, "USD")
        )}
      </TableCell>

      <TableCell className="text-right tabular-nums">
        <CurrentPrice asset={asset} />
      </TableCell>

      <TableCell className="text-right tabular-nums font-semibold">
        {o(formatCurrency(displayValue, currency))}
      </TableCell>

      <TableCell className="text-right">
        {showReturn ? (
          <div className="flex flex-col items-end">
            <span className={gainLossClass(netIsPositive)}>
              {o(formatSignedCurrency(netUsd, "USD"))}
            </span>
            {netPct !== null && (
              <span className={`text-xs ${gainLossClass(netIsPositive)}`}>
                {formatSignedPercent(netPct)}
              </span>
            )}
            {taxed && (
              <span className="text-xs text-muted-foreground">
                gross {o(formatSignedCurrency(returnUsd, "USD"))} ·{" "}
                −{o(formatCurrency(asset.taxAccrualUsd, "USD"))} tax
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
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

export function PortfolioRowCard({
  asset,
  returnMode,
  dailyReturnAvailable,
}: PortfolioRowProps) {
  const { currency } = useDisplayCurrency()
  const { openTransactionModal } = useTransactionModal()

  const displayValue =
    currency === "USD" ? asset.currentValueUsd : asset.currentValueTry
  const isDaily = returnMode === "daily"
  const showReturn = !isDaily || dailyReturnAvailable
  const returnUsd = isDaily ? asset.dailyReturnUsd : asset.unrealizedPnlUsd
  const returnPct = isDaily ? asset.dailyReturnPct : asset.unrealizedPnlPct

  // Net (after-tax) applies only in Total mode — daily return stays gross.
  const taxed = !isDaily && asset.taxAccrualUsd > 0
  const netUsd = taxed ? returnUsd - asset.taxAccrualUsd : returnUsd
  const netPct =
    taxed && asset.costBasisUsd > 0 ? (netUsd / asset.costBasisUsd) * 100 : returnPct
  const netIsPositive = netUsd >= 0

  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between">
        <Link
          to={`/transactions/edit/${asset.id}`}
          className="flex flex-col items-start gap-0.5 text-left focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <AssetIcon asset={asset} size="sm" />
            <span className="font-medium">{asset.ticker}</span>
          </div>
          <span className="tabular-nums text-sm">
            <CurrentPrice asset={asset} />
          </span>
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
          {showReturn ? (
            <span className={`text-xs ${gainLossClass(netIsPositive)}`}>
              {formatSignedCurrency(netUsd, "USD")}
              {netPct !== null && (
                <>
                  {" "}
                  ({formatSignedPercent(netPct)})
                </>
              )}
              {taxed && (
                <span className="text-muted-foreground">
                  {" · "}
                  gross {formatSignedCurrency(returnUsd, "USD")}
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
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
