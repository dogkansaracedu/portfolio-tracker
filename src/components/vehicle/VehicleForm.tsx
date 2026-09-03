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
import { useVehicleContext } from "@/contexts/VehicleContext"
import { bn, homeDayIso } from "@/lib/config"
import {
  VEHICLE_COPY,
  VEHICLE_DEFAULT_CURRENCY,
} from "@/lib/constants/vehicle"
import {
  SUPPORTED_FIAT_CURRENCIES,
  isFiatCurrency,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import type { Vehicle } from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The car being edited; omit to add. */
  vehicle?: Vehicle | null
  /** Seed the plan with the Turkish defaults after creating. */
  onCreated?: (vehicleId: string) => void
}

interface FormState {
  name: string
  plate: string
  make: string
  model: string
  modelYear: string
  purchasedOn: string
  purchasePrice: string
  purchaseCurrency: FiatCurrency
  purchaseOdometer: string
  currentValue: string
}

function emptyForm(): FormState {
  return {
    name: "",
    plate: "",
    make: "",
    model: "",
    modelYear: "",
    purchasedOn: homeDayIso(),
    purchasePrice: "",
    purchaseCurrency: VEHICLE_DEFAULT_CURRENCY,
    purchaseOdometer: "",
    currentValue: "",
  }
}

function formFromVehicle(vehicle: Vehicle): FormState {
  return {
    name: vehicle.name,
    plate: vehicle.plate ?? "",
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    modelYear: vehicle.model_year === null ? "" : String(vehicle.model_year),
    purchasedOn: vehicle.purchased_on,
    purchasePrice: String(vehicle.purchase_price),
    purchaseCurrency: isFiatCurrency(vehicle.purchase_currency)
      ? vehicle.purchase_currency
      : VEHICLE_DEFAULT_CURRENCY,
    purchaseOdometer: String(vehicle.purchase_odometer),
    currentValue:
      vehicle.current_value === null ? "" : String(vehicle.current_value),
  }
}

/**
 * Add or edit the car itself.
 *
 * The purchase trio (date, price, odometer) is what every derived figure hangs
 * off: the price is the capital side of cost of ownership, the date is the
 * span the fixed-cost-per-month denominator uses, and the odometer is the
 * baseline for distance driven — a used car does not start at zero, and
 * treating it as though it did would inflate every per-km figure.
 *
 * The current value shares the purchase currency: a car bought in lira is
 * valued in lira, and offering two currency pickers for one asset invites a
 * mismatch that would silently corrupt depreciation.
 */
export function VehicleForm({ open, onOpenChange, vehicle, onCreated }: Props) {
  const { addVehicle, editVehicle } = useVehicleContext()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!vehicle

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(vehicle ? formFromVehicle(vehicle) : emptyForm())
      setError(null)
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError(VEHICLE_COPY.errorNameRequired)
    if (!form.purchasedOn) return setError(VEHICLE_COPY.errorDateRequired)

    const price = bn(form.purchasePrice)
    if (!price.isFinite() || price.isNegative()) {
      return setError(VEHICLE_COPY.errorPriceRequired)
    }

    const odometer =
      form.purchaseOdometer.trim() === "" ? bn(0) : bn(form.purchaseOdometer)
    if (!odometer.isFinite() || odometer.isNegative()) {
      return setError(VEHICLE_COPY.errorOdometerInvalid)
    }

    const hasValue = form.currentValue.trim() !== ""
    const value = hasValue ? bn(form.currentValue) : null
    if (value && (!value.isFinite() || value.isNegative())) {
      return setError(VEHICLE_COPY.errorAmountInvalid)
    }

    const year = form.modelYear.trim() === "" ? null : Number(form.modelYear)

    setSubmitting(true)
    setError(null)
    try {
      // The value's own date matters — it is what the depreciation figure
      // converts at — so a value typed here is stamped today.
      const valueFields =
        value === null
          ? {
              current_value: null,
              current_value_currency: null,
              current_value_at: null,
            }
          : {
              current_value: value.toFixed(),
              current_value_currency: form.purchaseCurrency,
              current_value_at: homeDayIso(),
            }

      const payload = {
        name: form.name.trim(),
        plate: form.plate.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        model_year: year !== null && Number.isFinite(year) ? year : null,
        purchased_on: form.purchasedOn,
        purchase_price: price.toFixed(),
        purchase_currency: form.purchaseCurrency,
        purchase_odometer: odometer.toFixed(),
        ...valueFields,
      }

      if (vehicle) {
        await editVehicle(vehicle.id, payload)
      } else {
        // A new car starts with no standalone reading — the purchase odometer
        // is the baseline until the owner updates it.
        const created = await addVehicle({
          ...payload,
          odometer: null,
          odometer_at: null,
          note: null,
        })
        onCreated?.(created.id)
      }
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
            {isEditing ? VEHICLE_COPY.editVehicle : VEHICLE_COPY.addVehicle}
          </DialogTitle>
          <DialogDescription>{VEHICLE_COPY.valueSourceHint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v-name">{VEHICLE_COPY.fieldVehicleName}</Label>
                <Input
                  id="v-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-plate">{VEHICLE_COPY.fieldPlate}</Label>
                <Input
                  id="v-plate"
                  value={form.plate}
                  onChange={(e) => set("plate", e.target.value)}
                />
              </div>
            </div>

            {/* Make / model / year: three short fields, so they share a row
                from `sm` and stack on a phone. */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-make">{VEHICLE_COPY.fieldMake}</Label>
                <Input
                  id="v-make"
                  value={form.make}
                  onChange={(e) => set("make", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-model">{VEHICLE_COPY.fieldModel}</Label>
                <Input
                  id="v-model"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-year">{VEHICLE_COPY.fieldModelYear}</Label>
                <Input
                  id="v-year"
                  type="number"
                  inputMode="numeric"
                  value={form.modelYear}
                  onChange={(e) => set("modelYear", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v-date">{VEHICLE_COPY.fieldPurchasedOn}</Label>
                <Input
                  id="v-date"
                  type="date"
                  value={form.purchasedOn}
                  onChange={(e) => set("purchasedOn", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-odometer">
                  {VEHICLE_COPY.fieldPurchaseOdometer}
                </Label>
                <Input
                  id="v-odometer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.purchaseOdometer}
                  onChange={(e) => set("purchaseOdometer", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v-price">
                  {VEHICLE_COPY.fieldPurchasePrice}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="v-price"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={form.purchasePrice}
                    onChange={(e) => set("purchasePrice", e.target.value)}
                    required
                  />
                  <Select
                    value={form.purchaseCurrency}
                    onValueChange={(v) =>
                      set("purchaseCurrency", v as FiatCurrency)
                    }
                  >
                    <SelectTrigger
                      className="w-24 shrink-0"
                      aria-label={VEHICLE_COPY.fieldCurrency}
                    >
                      <SelectValue>{form.purchaseCurrency}</SelectValue>
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
                <Label htmlFor="v-value">
                  {VEHICLE_COPY.fieldCurrentValue}
                </Label>
                <Input
                  id="v-value"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={form.currentValue}
                  onChange={(e) => set("currentValue", e.target.value)}
                  placeholder={form.purchaseCurrency}
                />
              </div>
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
