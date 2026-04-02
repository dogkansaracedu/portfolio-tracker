import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PortfolioGroupHeader } from "@/components/portfolio/PortfolioGroupHeader"
import { PortfolioRow, PortfolioRowCard } from "@/components/portfolio/PortfolioRow"
import type { AssetGroup } from "@/hooks/usePortfolio"

interface PortfolioTableProps {
  groups: AssetGroup[]
}

const COL_COUNT = 9

export function PortfolioTable({ groups }: PortfolioTableProps) {
  if (groups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No assets match your filters.
      </p>
    )
  }

  return (
    <>
      {/* Desktop table (hidden below 640px) */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Bought</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead className="text-right">Alloc.</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <GroupSection key={group.key} group={group} />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list (visible below 640px) */}
      <div className="flex flex-col gap-2 sm:hidden">
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            {/* Simplified mobile group header */}
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                {group.color && (
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span className="text-sm font-semibold">{group.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {group.assets.length} asset
                {group.assets.length !== 1 ? "s" : ""}
              </span>
            </div>
            {group.assets.map((asset) => (
              <PortfolioRowCard key={asset.id} asset={asset} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Group section (desktop table) ──────────────────────────────────

function GroupSection({ group }: { group: AssetGroup }) {
  return (
    <>
      <PortfolioGroupHeader group={group} colSpan={COL_COUNT} />
      {group.assets.map((asset) => (
        <PortfolioRow key={asset.id} asset={asset} />
      ))}
    </>
  )
}
