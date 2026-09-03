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
import { formatCurrency, obfuscate } from "@/lib/prices"
import {
  VEHICLE_COPY,
  VEHICLE_COST_CATEGORY_LABELS,
} from "@/lib/constants/vehicle"
import { isFiatCurrency } from "@/lib/constants/currencies"
import type { VehicleCostEntry, VehicleMaintenanceItem } from "@/types/database"
import {
  NO_DATA,
  formatKm,
  formatVehicleDay,
} from "@/components/vehicle/display"

const DEFAULT_VISIBLE_ENTRIES = 12

interface Props {
  /** Newest first. */
  entries: VehicleCostEntry[]
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
export function CostLedger({ entries, items, onEdit, onDelete }: Props) {
  const { obfuscated } = useDisplayCurrency()
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
      <CardContent>
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
                    <div>{formatVehicleDay(entry.date)}</div>
                    {entry.odometer !== null && (
                      <div className="text-xs text-muted-foreground">
                        {obfuscate(formatKm(Number(entry.odometer)), obfuscated)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
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
                        {Number(entry.litres).toFixed(1)} L
                        {entry.is_full_tank ? " · full" : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex justify-end gap-0.5">
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
