import { useState } from "react"
import { Plus, ChevronRight, ChevronDown } from "lucide-react"
import { Link } from "react-router"
import { TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import {
  formatCurrency,
  formatCryptoAmount,
  formatSignedPercent,
  gainLossToneClass,
  obfuscate,
} from "@/lib/prices"
import type { EnrichedAsset, ReturnMode } from "@/hooks/usePortfolio"
import { assetNativeCurrency } from "@/lib/constants/assets"
import { AssetIcon } from "@/components/common/AssetIcon"
import { InterestBadge } from "@/components/interest/InterestBadge"

interface PortfolioRowProps {
  asset: EnrichedAsset
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
  /** True when rendered as a nested child (a fund under its fiat currency). */
  nested?: boolean
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
function CurrentPrice({
  asset,
  stacked = false,
}: {
  asset: EnrichedAsset
  /** Desktop table: the USD equivalent drops to its own line so the column
   *  stays inside the 1280px width budget. The mobile card keeps it inline. */
  stacked?: boolean
}) {
  const showNative = assetNativeCurrency(asset) === "TRY"
  if (!showNative) return <>{formatCurrency(asset.currentPriceUsd, "USD")}</>
  const approx = `(~${formatCurrency(asset.currentPriceUsd, "USD")})`
  return (
    <>
      {formatCurrency(asset.currentPriceTry, "TRY")}
      {stacked ? (
        <div className="text-xs text-muted-foreground">{approx}</div>
      ) : (
        <span className="ml-1 text-xs text-muted-foreground">{approx}</span>
      )}
    </>
  )
}

// ─── Desktop Table Row ──────────────────────────────────────────────

export function PortfolioRow({
  asset,
  returnMode,
  dailyReturnAvailable,
  nested = false,
}: PortfolioRowProps) {
  const { currency, money, signedMoney, display, obfuscated } = useDisplayMoney()
  const { openTransactionModal } = useTransactionModal()
  const o = (v: string) => obfuscate(v, obfuscated)
  const childRows = asset.children ?? []
  const hasChildren = childRows.length > 0
  const [open, setOpen] = useState(hasChildren)

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

  return (
    <>
    <TableRow>
      <TableCell>
        <div className={`flex items-center gap-1 ${nested ? "pl-6" : ""}`}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Collapse" : "Expand"}
              className="rounded p-0.5 hover:bg-muted"
            >
              {open ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
            </button>
          ) : nested ? (
            <span className="inline-block size-3.5" />
          ) : null}
          <Link
            to={`/assets/${asset.id}`}
            className="flex items-center gap-2 text-left hover:underline focus:outline-none focus-visible:underline"
            title="View asset details"
          >
            <AssetIcon asset={asset} size="sm" />
            <span className="font-medium">{asset.ticker}</span>
          </Link>
          {/* A status cue only (Component 16): "something of this is earning".
              Never the gain/loss palette — the return column owns that. */}
          <InterestBadge assetId={asset.id} />
        </div>
      </TableCell>

      {/* Platform names truncate rather than widen the table — the dot keeps
          the platform identifiable once the name is clipped. */}
      <TableCell className="max-w-[7rem]">
        <div className="flex flex-col gap-0.5">
          {asset.holdings.map((h) => (
            <div key={h.platformId} className="flex min-w-0 items-center gap-1.5">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: h.platformColor }}
              />
              <span className="truncate text-xs">{h.platformName}</span>
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
            <div className="text-xs">
              (~{formatCurrency(costUsdPerUnit, "USD")})
            </div>
          </>
        ) : (
          formatCurrency(costUsdPerUnit, "USD")
        )}
      </TableCell>

      <TableCell className="text-right tabular-nums">
        <CurrentPrice asset={asset} stacked />
      </TableCell>

      <TableCell className="text-right tabular-nums font-semibold">
        {display(displayValue)}
      </TableCell>

      <TableCell className="text-right">
        {showReturn ? (
          <div className="flex flex-col items-end">
            <span className={gainLossToneClass(netUsd)}>
              {signedMoney(netUsd)}
            </span>
            {netPct !== null && (
              <span className={`text-xs ${gainLossToneClass(netPct)}`}>
                {formatSignedPercent(netPct)}
              </span>
            )}
            {taxed && (
              <span className="text-xs text-muted-foreground">
                gross {signedMoney(returnUsd)} ·{" "}
                −{money(asset.taxAccrualUsd)} tax
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
      {hasChildren &&
        open &&
        childRows.map((child) => (
          <PortfolioRow
            key={child.id}
            asset={child}
            returnMode={returnMode}
            dailyReturnAvailable={dailyReturnAvailable}
            nested
          />
        ))}
    </>
  )
}

// ─── Mobile Card ────────────────────────────────────────────────────

export function PortfolioRowCard({
  asset,
  returnMode,
  dailyReturnAvailable,
}: PortfolioRowProps) {
  const { currency, signedMoney, display } = useDisplayMoney()
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

  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between">
        <Link
          to={`/assets/${asset.id}`}
          className="flex flex-col items-start gap-0.5 text-left focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <AssetIcon asset={asset} size="sm" />
            <span className="font-medium">{asset.ticker}</span>
            <InterestBadge assetId={asset.id} />
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
          <span className="font-semibold">{display(displayValue)}</span>
          {showReturn ? (
            <span className={`text-xs ${gainLossToneClass(netUsd)}`}>
              {signedMoney(netUsd)}
              {netPct !== null && (
                <>
                  {" "}
                  ({formatSignedPercent(netPct)})
                </>
              )}
              {taxed && (
                <span className="text-muted-foreground">
                  {" · "}
                  gross {signedMoney(returnUsd)}
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
