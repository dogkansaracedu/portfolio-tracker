import { Fragment } from "react"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PortfolioGroupHeader } from "@/components/portfolio/PortfolioGroupHeader"
import { useGroupFigures } from "@/hooks/useGroupFigures"
import { PortfolioRow, PortfolioRowCard } from "@/components/portfolio/PortfolioRow"
import { formatSignedPercent, gainLossToneClass } from "@/lib/prices"
import type { AssetGroup, ReturnMode } from "@/hooks/usePortfolio"
import {
  DAILY_RETURN_LABEL,
  UNREALIZED_LABEL,
} from "@/lib/constants/returns"

interface PortfolioTableProps {
  groups: AssetGroup[]
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}

export function PortfolioTable({
  groups,
  returnMode,
  dailyReturnAvailable,
}: PortfolioTableProps) {
  if (groups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No assets match your filters.
      </p>
    )
  }

  return (
    <>
      {/* The table needs ~990px of its own. With the sidebar taking 240px
          that is only true from 1280px up, so cards carry every width below
          it — between 640 and 1279 the table used to push Value / P&L / Alloc
          off the right edge, while the cards show every figure. */}
      <div className="hidden xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Bought</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">
                {returnMode === "daily"
                  ? DAILY_RETURN_LABEL
                  : UNREALIZED_LABEL}
              </TableHead>
              <TableHead className="text-right">Alloc.</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                returnMode={returnMode}
                dailyReturnAvailable={dailyReturnAvailable}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card list (every width below 1280px) */}
      <div className="flex flex-col gap-2 xl:hidden">
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <MobileGroupHeader
              group={group}
              returnMode={returnMode}
              dailyReturnAvailable={dailyReturnAvailable}
            />
            {group.assets.map((asset) => (
              <Fragment key={asset.id}>
                <PortfolioRowCard
                  asset={asset}
                  returnMode={returnMode}
                  dailyReturnAvailable={dailyReturnAvailable}
                />
                {asset.children?.map((child) => (
                  <div key={child.id} className="pl-4">
                    <PortfolioRowCard
                      asset={child}
                      returnMode={returnMode}
                      dailyReturnAvailable={dailyReturnAvailable}
                    />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Group section (desktop table) ──────────────────────────────────

function GroupSection({
  group,
  returnMode,
  dailyReturnAvailable,
}: {
  group: AssetGroup
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}) {
  return (
    <>
      <PortfolioGroupHeader
        group={group}
        returnMode={returnMode}
        dailyReturnAvailable={dailyReturnAvailable}
      />
      {group.assets.map((asset) => (
        <PortfolioRow
          key={asset.id}
          asset={asset}
          returnMode={returnMode}
          dailyReturnAvailable={dailyReturnAvailable}
        />
      ))}
    </>
  )
}

// ─── Group header (card list) ───────────────────────────────────────

/** The same subtotal and return the desktop header puts in its columns, on one
 *  line — without them the card list can't answer "what moved in this group?". */
function MobileGroupHeader({
  group,
  returnMode,
  dailyReturnAvailable,
}: {
  group: AssetGroup
  returnMode: ReturnMode
  dailyReturnAvailable: boolean
}) {
  const f = useGroupFigures(group, returnMode, dailyReturnAvailable)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        {group.color && (
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: group.color }}
          />
        )}
        <span className="truncate text-sm font-semibold">{group.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {group.assets.length} asset{group.assets.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs tabular-nums">
        <span className="font-medium">{f.value}</span>
        {f.showReturn ? (
          <span className={gainLossToneClass(f.returnUsd)}>
            {f.returnText}
            {f.returnPct !== null && ` ${formatSignedPercent(f.returnPct)}`}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}
