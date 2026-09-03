import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import {
  formatAmount,
  formatSignedPercent,
  gainLossToneClass,
  obfuscate,
} from "@/lib/prices"
import { COST_BASIS_LABEL, UNREALIZED_LABEL } from "@/lib/constants/returns"
import type { AssetPlatformSlice } from "@/hooks/useAssetDetail"

interface Props {
  slices: AssetPlatformSlice[]
  category: string
}

/** Per-platform breakdown — each row is that platform's own FIFO slice. */
export function AssetPlatformTable({ slices, category }: Props) {
  // Cost basis, value and P&L are USD-anchored but render in the display
  // currency — a platform row must not mix ₺ and $.
  const { money, signedMoney, obfuscated } = useDisplayMoney()
  const o = (v: string) => obfuscate(v, obfuscated)

  if (slices.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">By platform</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Phone: stacked rows. The five columns compress to the point where
            Value clips and P&L — the reason to read this card — falls off the
            side, so below `sm` each platform is a two-line block instead. */}
        <div className="flex flex-col divide-y sm:hidden">
          {slices.map((s) => (
            <div key={s.platformId} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
              <div className="flex items-center gap-1.5 text-sm">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: s.platformColor }}
                />
                {s.platformName}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs tabular-nums">
                <span className="text-muted-foreground">
                  {o(formatAmount(s.balance, category))}
                </span>
                <span className="font-semibold">{money(s.currentValueUsd)}</span>
                <span className={gainLossToneClass(s.unrealizedPnlUsd)}>
                  {signedMoney(s.unrealizedPnlUsd)}
                  {s.unrealizedPnlPct !== null && (
                    <> ({formatSignedPercent(s.unrealizedPnlPct)})</>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>

        <Table className="hidden sm:table">
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">{COST_BASIS_LABEL}</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">{UNREALIZED_LABEL}</TableHead>
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
                  {money(s.costBasisUsd)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {money(s.currentValueUsd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={gainLossToneClass(s.unrealizedPnlUsd)}>
                    {signedMoney(s.unrealizedPnlUsd)}
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
