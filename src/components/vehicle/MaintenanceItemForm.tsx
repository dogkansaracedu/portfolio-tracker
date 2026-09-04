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
import { HintPopover } from "@/components/common/HintPopover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useVehicleContext } from "@/contexts/VehicleContext"
import { bn } from "@/lib/config"
import {
  DEFAULT_MAINTENANCE_GROUP,
  MAINTENANCE_GROUPS,
  OBLIGATIONS_GROUP,
  MAINTENANCE_GROUP_LABELS,
  VEHICLE_COPY,
  type MaintenanceGroup,
} from "@/lib/constants/vehicle"
import type { VehicleMaintenanceItem } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicleId: string
  /** The row being edited; omit to add. */
  item?: VehicleMaintenanceItem | null
  /** Where to place a new item in the plan's order. */
  nextSortOrder: number
}

interface FormState {
  name: string
  group: MaintenanceGroup
  intervalKm: string
  intervalMonths: string
  note: string
}

function emptyForm(): FormState {
  return {
    name: "",
    group: DEFAULT_MAINTENANCE_GROUP,
    intervalKm: "",
    intervalMonths: "",
    note: "",
  }
}

function formFromItem(item: VehicleMaintenanceItem): FormState {
  return {
    name: item.name,
    group: (MAINTENANCE_GROUPS.some((g) => g.value === item.item_group)
      ? item.item_group
      : DEFAULT_MAINTENANCE_GROUP) as MaintenanceGroup,
    intervalKm: item.interval_km === null ? "" : String(item.interval_km),
    intervalMonths:
      item.interval_months === null ? "" : String(item.interval_months),
    note: item.note ?? "",
  }
}

/**
 * Add or edit one maintenance item.
 *
 * Both interval boxes are **free numeric entry, and both are optional** —
 * empty means "don't track this dimension", which is how a distance-only belt
 * and a time-only muayene are expressed without a `track_by` field. Carfax
 * offers tire rotation at only 5,000 or 7,500 miles from a picker, so it
 * cannot represent what a given owner's mechanic actually told them; a
 * schedule engine less expressive than reality gets abandoned.
 */
export function MaintenanceItemForm({
  open,
  onOpenChange,
  vehicleId,
  item,
  nextSortOrder,
}: Props) {
  const { addItem, editItem } = useVehicleContext()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!item

  // Re-seed on the closed→open transition, during render — one instance serves
  // both add and edit in turn.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(item ? formFromItem(item) : emptyForm())
      setError(null)
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const isObligation = form.group === OBLIGATIONS_GROUP

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError(VEHICLE_COPY.errorNameRequired)

    // Forced null for an obligation even if a km figure was typed before the
    // group was switched — the field it came from is no longer shown.
    const hasKm = !isObligation && form.intervalKm.trim() !== ""
    const km = hasKm ? bn(form.intervalKm) : null
    if (km && (!km.isFinite() || !km.isGreaterThan(0))) {
      return setError(VEHICLE_COPY.errorIntervalInvalid)
    }

    const hasMonths = form.intervalMonths.trim() !== ""
    const months = hasMonths ? bn(form.intervalMonths) : null
    if (months && (!months.isFinite() || !months.isGreaterThan(0))) {
      return setError(VEHICLE_COPY.errorIntervalInvalid)
    }

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        vehicle_id: vehicleId,
        name: form.name.trim(),
        item_group: form.group,
        interval_km: km === null ? null : km.toFixed(),
        interval_months: months === null ? null : months.toFixed(),
        note: form.note.trim() || null,
      }
      if (item) await editItem(item.id, payload)
      else await addItem({ ...payload, sort_order: nextSortOrder })
      onOpenChange(false)
    } catch (err) {
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
            {isEditing ? VEHICLE_COPY.editItem : VEHICLE_COPY.addItem}
          </DialogTitle>
          <DialogDescription>
            {VEHICLE_COPY.intervalBothBlankHint}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-name">{VEHICLE_COPY.fieldName}</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="item-group">{VEHICLE_COPY.fieldGroup}</Label>
                <HintPopover
                  label={VEHICLE_COPY.fieldGroup}
                  text={VEHICLE_COPY.fieldGroupHint}
                />
              </div>
              <Select
                value={form.group}
                onValueChange={(v) => set("group", v as MaintenanceGroup)}
              >
                <SelectTrigger id="item-group" className="w-full">
                  <SelectValue>
                    {MAINTENANCE_GROUP_LABELS[form.group]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_GROUPS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* The two intervals side by side from `sm`, stacked on a phone.
                An obligation gets only the time box: insurance, tax and
                inspection recur on a calendar and do not care how far the car
                was driven, so offering a km interval invites a figure that can
                only mislead. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {!isObligation && (
                <div className="space-y-1.5">
                  <Label htmlFor="item-km">
                    {VEHICLE_COPY.fieldIntervalKm}
                  </Label>
                  <Input
                    id="item-km"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.intervalKm}
                    onChange={(e) => set("intervalKm", e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="item-months">
                  {VEHICLE_COPY.fieldIntervalMonths}
                </Label>
                <Input
                  id="item-months"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.intervalMonths}
                  onChange={(e) => set("intervalMonths", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-note">{VEHICLE_COPY.fieldNote}</Label>
              <Textarea
                id="item-note"
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
