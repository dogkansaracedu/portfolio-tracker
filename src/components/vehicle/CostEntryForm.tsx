import { useState } from "react"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { HintPopover } from "@/components/common/HintPopover"
import { useVehicleContext } from "@/contexts/VehicleContext"
import { bn, homeDayIso } from "@/lib/config"
import {
  FUEL_CATEGORY,
  VEHICLE_COPY,
  VEHICLE_COST_CATEGORIES,
  VEHICLE_COST_CATEGORY_LABELS,
  VEHICLE_DEFAULT_CURRENCY,
  type VehicleCostCategory,
} from "@/lib/constants/vehicle"
import {
  SUPPORTED_FIAT_CURRENCIES,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import type { VehicleCostEntry, VehicleMaintenanceItem } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicleId: string
  /** The plan, so a visit can tick off the items it covered. */
  items: VehicleMaintenanceItem[]
  /** The row being edited; omit to add. */
  entry?: VehicleCostEntry | null
  /** Seed the item checkboxes — used by "log this item as done". */
  prefillItemIds?: string[]
}

/** The dialog's own string-shaped state — inputs never hold numbers. */
interface FormState {
  date: string
  category: VehicleCostCategory
  amount: string
  currency: FiatCurrency
  odometer: string
  litres: string
  isFullTank: boolean
  note: string
  itemIds: string[]
}

function emptyForm(prefillItemIds: string[] = []): FormState {
  return {
    date: homeDayIso(),
    // A row that closes maintenance items is a service visit, not a fill —
    // "Log this visit" arrives with items already ticked, and leaving the
    // category on fuel filed it wrongly and showed the litres fields.
    category: prefillItemIds.length > 0 ? "maintenance" : FUEL_CATEGORY,
    amount: "",
    // Every cost of running a car in Turkey is paid in lira; still editable.
    currency: VEHICLE_DEFAULT_CURRENCY,
    odometer: "",
    litres: "",
    isFullTank: false,
    note: "",
    itemIds: prefillItemIds,
  }
}

function formFromEntry(entry: VehicleCostEntry): FormState {
  return {
    date: entry.date,
    category: entry.category as VehicleCostCategory,
    amount: entry.amount === null ? "" : String(entry.amount),
    currency: (SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(
      entry.currency,
    )
      ? (entry.currency as FiatCurrency)
      : VEHICLE_DEFAULT_CURRENCY,
    odometer: entry.odometer === null ? "" : String(entry.odometer),
    litres: entry.litres === null ? "" : String(entry.litres),
    isFullTank: entry.is_full_tank,
    note: entry.note ?? "",
    itemIds: entry.item_ids,
  }
}

/**
 * Add or edit one cost entry — the single ledger for everything the car costs.
 *
 * Two things here are load-bearing:
 *
 *  - **The amount is optional.** Leaving it empty records that work was done
 *    at a price no longer remembered, and the interval it closes still resets.
 *    ("Belt changed at 130,000 km" is exactly this row.) Drivvo cannot even
 *    log a zero-cost fill, which is a standing one-star complaint.
 *  - **Ticking an item is what resets its interval**, and only the ticked ones.
 *    That is the exact-match rule Fuelly had to ship a fix for, and it is why
 *    one visit to the servis is one row rather than several.
 */
export function CostEntryForm({
  open,
  onOpenChange,
  vehicleId,
  items,
  entry,
  prefillItemIds,
}: Props) {
  const { addEntry, editEntry } = useVehicleContext()
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!entry

  // Re-seed on the closed→open transition, during render — the same instance
  // serves "add", "add with these items ticked" and "edit that row" in turn.
  // An effect keyed on `prefillItemIds` would re-seed every render, since
  // callers build the array inline.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(entry ? formFromEntry(entry) : emptyForm(prefillItemIds ?? []))
      setError(null)
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleItem = (id: string) =>
    setForm((prev) => ({
      ...prev,
      itemIds: prev.itemIds.includes(id)
        ? prev.itemIds.filter((x) => x !== id)
        : [...prev.itemIds, id],
    }))

  const isFuel = form.category === FUEL_CATEGORY

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date) return setError(VEHICLE_COPY.errorDateRequired)

    const hasAmount = form.amount.trim() !== ""
    const amount = hasAmount ? bn(form.amount) : null
    if (amount && (!amount.isFinite() || amount.isNegative())) {
      return setError(VEHICLE_COPY.errorAmountInvalid)
    }

    const hasOdometer = form.odometer.trim() !== ""
    const odometer = hasOdometer ? bn(form.odometer) : null
    if (odometer && (!odometer.isFinite() || odometer.isNegative())) {
      return setError(VEHICLE_COPY.errorOdometerInvalid)
    }

    const hasLitres = isFuel && form.litres.trim() !== ""
    const litres = hasLitres ? bn(form.litres) : null
    if (litres && (!litres.isFinite() || !litres.isGreaterThan(0))) {
      return setError(VEHICLE_COPY.errorLitresInvalid)
    }

    setSubmitting(true)
    setError(null)
    try {
      // Numeric columns take `toFixed()` strings so precision survives
      // Postgres `numeric`. Litres and the full-tank flag are cleared off a
      // non-fuel row — the table's CHECK enforces the same thing.
      const payload = {
        vehicle_id: vehicleId,
        date: form.date,
        category: form.category,
        amount: amount === null ? null : amount.toFixed(),
        currency: form.currency,
        odometer: odometer === null ? null : odometer.toFixed(),
        litres: litres === null ? null : litres.toFixed(),
        is_full_tank: isFuel ? form.isFullTank : false,
        note: form.note.trim() || null,
      }

      if (entry) await editEntry(entry.id, payload, form.itemIds)
      else await addEntry(payload, form.itemIds)

      onOpenChange(false)
    } catch (err) {
      // The dialog stays open with what was typed — a write that fails says so.
      setError(err instanceof Error ? err.message : VEHICLE_COPY.writeFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? VEHICLE_COPY.editCost : VEHICLE_COPY.addCost}
          </DialogTitle>
          <DialogDescription>
            {VEHICLE_COPY.costAmountOptional}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4">
            {/* Date + category share a row from `sm`; stacked on a phone so
                neither field gets squeezed below a usable width. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cost-date">{VEHICLE_COPY.fieldDate}</Label>
                <Input
                  id="cost-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost-category">{VEHICLE_COPY.fieldCategory}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    set("category", v as VehicleCostCategory)
                  }
                >
                  {/* Base UI renders the raw value unless given children —
                      the app-wide convention is to resolve the label. */}
                  <SelectTrigger id="cost-category" className="w-full">
                    <SelectValue>
                      {VEHICLE_COST_CATEGORY_LABELS[form.category]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_COST_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount + its currency, then the odometer. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cost-amount">{VEHICLE_COPY.fieldAmount}</Label>
                <div className="flex gap-2">
                  <Input
                    id="cost-amount"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                  <Select
                    value={form.currency}
                    onValueChange={(v) => set("currency", v as FiatCurrency)}
                  >
                    <SelectTrigger
                      className="w-24 shrink-0"
                      aria-label={VEHICLE_COPY.fieldCurrency}
                    >
                      <SelectValue>{form.currency}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_FIAT_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost-odometer">{VEHICLE_COPY.fieldOdometer}</Label>
                <Input
                  id="cost-odometer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.odometer}
                  onChange={(e) => set("odometer", e.target.value)}
                />
              </div>
            </div>

            {/* Fuel-only fields. Shown for fuel rows only — the columns are
                meaningless elsewhere and the table's CHECK rejects them. */}
            {isFuel && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cost-litres">{VEHICLE_COPY.fieldLitres}</Label>
                  <Input
                    id="cost-litres"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={form.litres}
                    onChange={(e) => set("litres", e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={form.isFullTank}
                      onChange={(e) => set("isFullTank", e.target.checked)}
                    />
                    {VEHICLE_COPY.fieldFullTank}
                    <HintPopover
                      label={VEHICLE_COPY.fieldFullTank}
                      text={VEHICLE_COPY.economyUnavailable}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* What this visit closed. */}
            {items.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{VEHICLE_COPY.closesItems}</Label>
                  <HintPopover
                    label={VEHICLE_COPY.closesItems}
                    text={VEHICLE_COPY.closesItemsHint}
                  />
                </div>
                {/* The dialog body is the one scroller (the form is
                    `display: contents`, so DialogBody's overflow applies) — a
                    nested scroller here would trap the wheel. */}
                <div className="space-y-1 rounded-md border p-2">
                  {items.map((item) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-primary"
                        checked={form.itemIds.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                      />
                      <span className="min-w-0">{item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cost-note">{VEHICLE_COPY.fieldNote}</Label>
              <Textarea
                id="cost-note"
                rows={2}
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {VEHICLE_COPY.cancel}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? VEHICLE_COPY.saving : VEHICLE_COPY.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
