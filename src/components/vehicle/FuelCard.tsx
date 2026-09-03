import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDisplayMoney } from "@/hooks/useDisplayMoney"
import { VEHICLE_COPY } from "@/lib/constants/vehicle"
import type { FuelEconomy } from "@/lib/vehicle"
import {
  NO_DATA,
  formatConsumption,
  formatLitres,
} from "@/components/vehicle/display"

interface Props {
  fuel: FuelEconomy
}

/**
 * Fuel: consumption between full tanks, and what the fuel cost.
 *
 * When there is no measurable segment the card says **why** rather than
 * printing a bare dash. Drivvo gets the arithmetic right and the
 * communication wrong — suppressing the average whenever the full-tank flag
 * is missing, with no inline explanation, which its users read as a broken
 * feature ("I get a zero for mpg. What's up with that?"). The honest blank is
 * correct; the silence is what costs trust.
 */
export function FuelCard({ fuel }: Props) {
  const { money } = useDisplayMoney()

  // No fills at all — nothing to say yet, so the card stays off the page
  // rather than rendering an empty shell.
  if (fuel.totalLitres === 0 && fuel.totalFuelUsd === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {VEHICLE_COPY.fuelHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fuel.average === null ? (
          <p className="text-xs text-muted-foreground">
            {VEHICLE_COPY.economyUnavailable}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {VEHICLE_COPY.economyAverage}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {formatConsumption(fuel.average)}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {VEHICLE_COPY.economyBest}
              </p>
              <p className="text-sm font-medium tabular-nums">
                {formatConsumption(fuel.best?.consumption ?? null)}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {VEHICLE_COPY.economyWorst}
              </p>
              <p className="text-sm font-medium tabular-nums">
                {formatConsumption(fuel.worst?.consumption ?? null)}
              </p>
            </div>
          </div>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          {VEHICLE_COPY.totalLitres}: {formatLitres(fuel.totalLitres)}
          {" · "}
          {VEHICLE_COPY.pricePerLitre}:{" "}
          {fuel.avgPricePerLitreUsd === null
            ? NO_DATA
            : money(fuel.avgPricePerLitreUsd)}
          {fuel.segments.length > 0 && (
            <>
              {" · "}
              {fuel.segments.length}{" "}
              {fuel.segments.length === 1 ? "tank measured" : "tanks measured"}
            </>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
