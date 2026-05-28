import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
} from "@/lib/prices"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Info } from "lucide-react"
import type { CategoryAttributionRow } from "@/lib/performance"

const categoryLabels: Record<string, string> = {
  fiat: "Fiat",
  crypto: "Crypto",
  gold: "Gold",
  stock_us: "US Stocks",
  stock_bist: "BIST Stocks",
}

interface Props {
  data: CategoryAttributionRow[]
}

export function CategoryAttribution({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Category Attribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Category Attribution</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Cost Basis</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  Total P&L
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="What does Total P&L include?"
                          className="inline-flex cursor-help text-muted-foreground"
                        />
                      }
                    >
                      <Info className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Unrealized (Value − Cost Basis) + realized gains from
                      past sells
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              <TableHead className="text-right">Contribution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.category}>
                <TableCell className="font-medium">
                  {categoryLabels[row.category] ?? row.category}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.costBasisUsd, "USD")}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(row.valueUsd, "USD")}
                </TableCell>
                <TableCell
                  className={`text-right ${gainLossClass(row.pnlUsd >= 0)}`}
                >
                  {formatSignedCurrency(row.pnlUsd, "USD")}
                </TableCell>
                <TableCell
                  className={`text-right ${gainLossClass(
                    row.contributionPct >= 0
                  )}`}
                >
                  {formatSignedPercent(row.contributionPct, 1)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
