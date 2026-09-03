import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { HintPopover } from "@/components/common/HintPopover"
import { useReportedWrite } from "@/hooks/useReportedWrite"
import { useVehicleContext } from "@/contexts/VehicleContext"
import { bn, homeDayIso } from "@/lib/config"
import { formatCurrency } from "@/lib/prices"
import { useDisplayCurrency } from "@/contexts/DisplayContext"
import { obfuscate } from "@/lib/prices"
import {
  TSB_KASKO_VALUE_URL,
  VEHICLE_COPY,
  VEHICLE_DEFAULT_CURRENCY,
} from "@/lib/constants/vehicle"
import { isFiatCurrency, type FiatCurrency } from "@/lib/constants/currencies"
import type { OdometerView } from "@/lib/vehicle"
import type { Vehicle } from "@/types/database"
import {
  NO_DATA,
  formatKm,
  formatVehicleDay,
} from "@/components/vehicle/display"

interface Props {
  vehicle: Vehicle
  odometer: OdometerView
}

const WRITE_FAILED = "Could not save. Try again."

/**
 * The two figures the owner keeps current: the odometer and the car's market
 * value. Both update in place, both stamped with today's date.
 *
 * They share a card because they share a job — everything else on the page is
 * derived from them, and a stale reading quietly degrades every projected due
 * date and the whole capital half of the cost. Neither is ever inferred: the
 * value in particular has to be typed, because no free Turkish valuation API
 * exists (TSB's list is a monthly file download, arabam.com disallows bots,
 * sahibinden.com returns 403), which is why the card links to the free
 * reference instead of pretending to fetch it.
 *
 * A backwards reading is warned about, never rejected — Carfax's hard block
 * ("odometer reading cannot be lower than the last reported odometer") makes a
 * single typo permanent and backfilling impossible.
 */
export function VehicleReadingsCard({ vehicle, odometer }: Props) {
  const { editVehicle } = useVehicleContext()
  const { obfuscated } = useDisplayCurrency()
  const { error, reported } = useReportedWrite(WRITE_FAILED)
  const [kmDraft, setKmDraft] = useState("")
  const [valueDraft, setValueDraft] = useState("")

  const valueCurrency: FiatCurrency =
    vehicle.current_value_currency &&
    isFiatCurrency(vehicle.current_value_currency)
      ? vehicle.current_value_currency
      : VEHICLE_DEFAULT_CURRENCY

  const saveOdometer = async () => {
    const value = Number(kmDraft.trim())
    if (!kmDraft.trim() || !Number.isFinite(value) || value < 0) return
    const ok = await reported(
      editVehicle(vehicle.id, {
        odometer: bn(value).toFixed(),
        odometer_at: homeDayIso(),
      }),
    )
    if (ok) setKmDraft("")
  }

  const saveValue = async () => {
    const value = Number(valueDraft.trim())
    if (!valueDraft.trim() || !Number.isFinite(value) || value < 0) return
    const ok = await reported(
      editVehicle(vehicle.id, {
        current_value: bn(value).toFixed(),
        current_value_currency: valueCurrency,
        current_value_at: homeDayIso(),
      }),
    )
    if (ok) setValueDraft("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {VEHICLE_COPY.odometerHeading} &amp; {VEHICLE_COPY.valueHeading.toLowerCase()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Odometer. Input and button sit on one row and stay side by side at
            every width — a number field plus a short verb fits 320px. */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            {/* Not masked: an odometer is not money, and the maintenance chart
                below prints ~30 km figures that cannot be masked without
                destroying the schedule. One rule, applied consistently. */}
            <span className="text-lg font-semibold tabular-nums">
              {formatKm(odometer.km)}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {VEHICLE_COPY.odometerAsOf} {formatVehicleDay(odometer.asOf)}
              <HintPopover
                label={VEHICLE_COPY.odometerHeading}
                text={VEHICLE_COPY.odometerHint}
              />
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={kmDraft}
              onChange={(e) => setKmDraft(e.target.value)}
              placeholder={String(Math.round(odometer.km))}
              aria-label={VEHICLE_COPY.updateOdometer}
              className="h-9"
            />
            <Button
              variant="outline"
              className="h-9 shrink-0"
              onClick={saveOdometer}
              disabled={kmDraft.trim() === ""}
            >
              {VEHICLE_COPY.updateOdometer}
            </Button>
          </div>
          {odometer.kmPerDay !== null && (
            <p className="text-xs text-muted-foreground">
              {odometer.kmPerDay.toFixed(1)} {VEHICLE_COPY.perDay}{" "}
              {VEHICLE_COPY.averageSuffix}
            </p>
          )}
          {odometer.hasBackwardsReading && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {VEHICLE_COPY.odometerBackwards}
            </p>
          )}
        </div>

        {/* Value. */}
        <div className="space-y-1.5 border-t pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold tabular-nums">
              {vehicle.current_value === null
                ? NO_DATA
                : obfuscate(
                    formatCurrency(Number(vehicle.current_value), valueCurrency),
                    obfuscated,
                  )}
            </span>
            <span className="text-xs text-muted-foreground">
              {vehicle.current_value_at
                ? `${VEHICLE_COPY.valueStale} ${formatVehicleDay(vehicle.current_value_at)}`
                : ""}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              placeholder={`${VEHICLE_COPY.valuePlaceholder} ${valueCurrency}`}
              aria-label={VEHICLE_COPY.updateValue}
              className="h-9"
            />
            <Button
              variant="outline"
              className="h-9 shrink-0"
              onClick={saveValue}
              disabled={valueDraft.trim() === ""}
            >
              {VEHICLE_COPY.updateValue}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {VEHICLE_COPY.valueSourceHint}{" "}
            <a
              href={TSB_KASKO_VALUE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              TSB Kasko Değer Listesi
            </a>
          </p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}
