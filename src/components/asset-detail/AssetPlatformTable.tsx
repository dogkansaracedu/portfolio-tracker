import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import {
  formatCurrency,
  formatAmount,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClass,
  obfuscate,
} from "@/lib/prices"
import type { AssetPlatformSlice } from "@/hooks/useAssetDetail"

interface Props {
  slices: AssetPlatformSlice[]
  category: string
}

/** Per-platform breakdown — each row is that platform's own FIFO slice. */
export function AssetPlatformTable({ slices, category }: Props) {
  const { obfuscated } = useDisplayCurrency()
  const o = (v: string) => obfuscate(v, obfuscated)

  if (slices.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">By platform</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Cost Basis</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slices.map((s) => (
              <TableRow key={s.platformId}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: s.platformColor }}
                    />
                    {s.platformName}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {o(formatAmount(s.balance, category))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {o(formatCurrency(s.costBasisUsd, "USD"))}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {o(formatCurrency(s.currentValueUsd, "USD"))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={gainLossClass(s.unrealizedPnlUsd >= 0)}>
                    {o(formatSignedCurrency(s.unrealizedPnlUsd, "USD"))}
                    {s.unrealizedPnlPct !== null && (
                      <span className="ml-1 text-xs">
                        ({formatSignedPercent(s.unrealizedPnlPct)})
                      </span>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
