import { useMemo } from "react"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { AssetIcon } from "@/components/common/AssetIcon"
import { formatSettlementAmount } from "@/components/transactions/settlementAmount"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { isFiatCurrency } from "@/lib/constants/currencies"
import { FOREIGN_INCOME_THRESHOLD_SOURCE_URL } from "@/lib/constants/tax"
import {
  foreignIncomePayerAssetId,
  type ForeignIncomeEntry,
} from "@/lib/pnl/foreign-income"
import { formatCurrency } from "@/lib/prices"
import type { Asset, Platform } from "@/types/database"

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function originalAmount(amount: number, currency: string) {
  return `${formatSettlementAmount(amount, currency)}${
    isFiatCurrency(currency) ? "" : ` ${currency}`
  }`
}

function reviewLink(transaction: ForeignIncomeEntry["transaction"]) {
  const day = transaction.date.slice(0, 10)
  const params = new URLSearchParams({
    assetId: transaction.asset_id,
    platformId: transaction.platform_id,
    dateFrom: day,
    dateTo: day,
  })
  params.append("types", transaction.type)
  return `/transactions?${params.toString()}`
}

interface Props {
  entries: ForeignIncomeEntry[]
  assets: Asset[]
  platforms: Platform[]
  year: number
  thresholdTry: number | null
}

export function IncomeLedger({
  entries,
  assets,
  platforms,
  year,
  thresholdTry,
}: Props) {
  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  )
  const platformById = useMemo(
    () => new Map(platforms.map((platform) => [platform.id, platform])),
    [platforms],
  )
  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.transaction.date < b.transaction.date ? 1 : -1,
      ),
    [entries],
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Included payments</CardTitle>
            <CardDescription>
              The transaction-level trail behind the recorded TRY total.
              Thresholds are informational; verify them with{" "}
              <a
                href={FOREIGN_INCOME_THRESHOLD_SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                GİB
              </a>
              .
            </CardDescription>
          </div>
          <Badge variant="outline">
            {thresholdTry === null
              ? "Threshold not configured"
              : `Threshold ${formatCurrency(thresholdTry, "TRY")}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sortedEntries.length === 0 ? (
          <div className="space-y-3 px-6 pb-6">
            <p className="text-sm text-muted-foreground">
              No included dividend or interest payments were found for {year}.
            </p>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/transactions" />}
            >
              Review transactions
            </Button>
          </div>
        ) : (
          <>
            <div className="divide-y lg:hidden">
              {sortedEntries.map(({ transaction, amountTry }) => {
                const asset = assetById.get(
                  foreignIncomePayerAssetId(transaction),
                )
                const platform = platformById.get(transaction.platform_id)
                return (
                  <Link
                    key={transaction.id}
                    to={reviewLink(transaction)}
                    className="flex min-h-20 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    {asset && <AssetIcon asset={asset} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {asset?.ticker ?? "Unknown"}
                        </span>
                        <span className="text-xs capitalize text-muted-foreground">
                          {transaction.type}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDay(transaction.date)} ·{" "}
                        {platform?.name ?? "Unknown platform"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {originalAmount(
                          transaction.total_cost ?? 0,
                          transaction.price_currency,
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">
                        {formatCurrency(amountTry.toNumber(), "TRY")}
                      </p>
                      <ArrowRight className="ml-auto mt-1 size-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                )
              })}
            </div>

            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">TRY equivalent</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEntries.map(({ transaction, amountTry }) => {
                    const asset = assetById.get(
                      foreignIncomePayerAssetId(transaction),
                    )
                    const platform = platformById.get(transaction.platform_id)
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>{formatDay(transaction.date)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            {asset && <AssetIcon asset={asset} size="sm" />}
                            <span>
                              <span className="block font-medium">
                                {asset?.ticker ?? "Unknown"}
                              </span>
                              <span className="block max-w-44 truncate text-xs text-muted-foreground">
                                {asset?.name}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          {platform?.name ?? "Unknown platform"}
                        </TableCell>
                        <TableCell className="capitalize">
                          {transaction.type}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {originalAmount(
                            transaction.total_cost ?? 0,
                            transaction.price_currency,
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(amountTry.toNumber(), "TRY")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            nativeButton={false}
                            render={
                              <Link
                                to={reviewLink(transaction)}
                                aria-label={`Review ${asset?.ticker ?? "income"} transaction`}
                              />
                            }
                          >
                            <ArrowRight />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
