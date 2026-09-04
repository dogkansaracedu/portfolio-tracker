import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { formatCurrency, obfuscate } from "@/lib/prices"
import {
  VEHICLE_COPY,
  VEHICLE_COST_CATEGORY_LABELS,
} from "@/lib/constants/vehicle"
import { isFiatCurrency } from "@/lib/constants/currencies"
import type { GroupTotal } from "@/lib/vehicle"
import type { VehicleCostEntry, VehicleMaintenanceItem } from "@/types/database"
import {
  NO_DATA,
  formatKm,
  formatLitres,
  formatShortDay,
  formatVehicleDay,
} from "@/components/vehicle/display"

const DEFAULT_VISIBLE_ENTRIES = 12

interface Props {
  /** Newest first. */
  entries: VehicleCostEntry[]
  /** Cash spend in the four buckets, largest first. */
  byGroup: GroupTotal[]
  /** Entries recorded without a price — the totals exclude them. */
  unpricedEntries: number
  items: VehicleMaintenanceItem[]
  onEdit: (entry: VehicleCostEntry) => void
  onDelete: (entry: VehicleCostEntry) => void
}

/**
 * The cost ledger: every outlay, newest first.
 *
 * Amounts render in **the currency each entry was actually paid in**, never
 * re-denominated — the same rule the budget page's salary rows follow, because
 * a single entry's amount is a fact about that payment and converting it makes
 * it a derived figure. The aggregate figures above the table are where
 * normalization belongs.
 *
 * An entry with no amount shows a dash, not a zero: it records that work was
 * done at a price no longer known.
 */
export function CostLedger({
  entries,
  byGroup,
  unpricedEntries,
  items,
  onEdit,
  onDelete,
}: Props) {
  const { obfuscated } = useDisplayCurrency()
  const { money } = useDisplayMoney()
  const [showAll, setShowAll] = useState(false)

  if (entries.length === 0) return null

  const visible = showAll ? entries : entries.slice(0, DEFAULT_VISIBLE_ENTRIES)
  const itemName = (id: string) =>
    items.find((i) => i.id === id)?.name ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {VEHICLE_COPY.ledgerHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Where the money went, in four buckets. Plain figures, no bars: the
            earlier nine-category version was cut partly because its bars used
            the app's gain colour on a chart of money spent, and partly because
            nine rows of spend is a table nobody reads. Four is the question
            being asked.

            Cash only — depreciation is not an outlay and leads the cost card
            instead. Wraps to two rows on a phone rather than shrinking. */}
        {byGroup.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b pb-3">
            {byGroup.map((row) => (
              <div key={row.group} className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="text-sm font-medium tabular-nums">
                  {money(row.usd)}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {row.pct.toFixed(0)}%
                  </span>
                </p>
              </div>
            ))}
            {unpricedEntries > 0 && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {VEHICLE_COPY.unpricedNote}
                </p>
                <p className="text-sm font-medium tabular-nums text-muted-foreground">
                  {unpricedEntries}
                </p>
              </div>
            )}
          </div>
        )}

        {/* `Table` brings its own overflow container. Below `sm` the cells lose
            their side padding and may wrap, which is what lets the four
            columns fit a 320px screen without the page scrolling sideways.
            The odometer rides under the date as a caption there rather than
            taking a column of its own. */}
        <Table className="max-sm:text-xs max-sm:[&_td]:px-1 max-sm:[&_th]:px-1 max-sm:[&_td]:whitespace-normal max-sm:[&_th]:whitespace-normal">
          <TableHeader>
            <TableRow>
              <TableHead>{VEHICLE_COPY.fieldDate}</TableHead>
              <TableHead>{VEHICLE_COPY.fieldCategory}</TableHead>
              <TableHead className="text-right">{VEHICLE_COPY.columnAmount}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((entry) => {
              const currency = isFiatCurrency(entry.currency)
                ? entry.currency
                : null
              const closed = entry.item_ids
                .map(itemName)
                .filter((n): n is string => n !== null)
              return (
                <TableRow key={entry.id}>
                  <TableCell className="align-top">
                    {/* The date must not wrap (it broke into four lines at
                        320px) but the full form is wide enough to push the row
                        actions past the edge — so it is short below `sm` and
                        full from there up. */}
                    <div className="whitespace-nowrap max-sm:hidden">
                      {formatVehicleDay(entry.date)}
                    </div>
                    <div className="whitespace-nowrap sm:hidden">
                      {formatShortDay(entry.date)}
                    </div>
                    {/* Not masked — same rule as the readings card: an
                        odometer is not money, and the plan above prints dozens
                        of km figures that cannot be masked. */}
                    {entry.odometer !== null && (
                      <div className="text-xs text-muted-foreground">
                        {formatKm(Number(entry.odometer))}
                      </div>
                    )}
                  </TableCell>
                  {/* This cell is prose, not a figure. The table primitive
                      sets `whitespace-nowrap` on every cell above `sm`, and
                      "Resets: Engine oil & filter, Air filter, …" plus a note
                      gave the column 535px of unwrappable width — enough to
                      push the row's own actions outside the scroll container
                      at 1024 and 768. It wraps at every width. */}
                  <TableCell className="align-top whitespace-normal">
                    <div>
                      {VEHICLE_COST_CATEGORY_LABELS[entry.category] ??
                        entry.category}
                    </div>
                    {/* What this visit reset — the reason the row matters to
                        the schedule, not just to the total. */}
                    {closed.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {VEHICLE_COPY.closesItems}: {closed.join(", ")}
                      </div>
                    )}
                    {entry.note && (
                      <div className="text-xs text-muted-foreground">
                        {entry.note}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums">
                    {entry.amount === null || currency === null
                      ? NO_DATA
                      : obfuscate(
                          formatCurrency(Number(entry.amount), currency),
                          obfuscated,
                        )}
                    {entry.litres !== null && (
                      <div className="text-xs text-muted-foreground">
                        {formatLitres(Number(entry.litres))}
                        {entry.is_full_tank
                          ? ` · ${VEHICLE_COPY.fullTankSuffix}`
                          : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {/* Stacked below `sm`: two 32px buttons side by side made
                        the action column 74px, which pushed the table's
                        intrinsic minimum to 280px against 256px available at
                        320px wide — the delete button sat 20px outside its own
                        scroll container. One column of icons is 36px. */}
                    <div className="flex justify-end gap-0.5 max-sm:flex-col max-sm:items-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`${VEHICLE_COPY.editCost}: ${formatVehicleDay(entry.date)}`}
                        onClick={() => onEdit(entry)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        aria-label={`${VEHICLE_COPY.delete}: ${formatVehicleDay(entry.date)}`}
                        onClick={() => onDelete(entry)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {entries.length > DEFAULT_VISIBLE_ENTRIES && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll
              ? VEHICLE_COPY.showLess
              : `${VEHICLE_COPY.showAll} ${entries.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
