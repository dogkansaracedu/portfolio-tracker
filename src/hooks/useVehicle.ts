import { useMemo } from "react"
import { homeDayIso } from "@/lib/config"
import { computeLifetimeXirrPct } from "@/lib/mwr"
import {
  computeFuelEconomy,
  computeOpportunityCost,
  estimateMonthlyFuel,
  computeOwnershipCost,
  dueItems,
  maintenancePlanState,
  lastServiceSummary,
  nextServiceBundle,
  nextServiceState,
  nextUpItem,
  planItems,
  odometerView,
  type FuelEconomy,
  type LastServiceSummary,
  type MonthlyFuelEstimate,
  type MaintenanceItemState,
  type NextServiceBundle,
  type OdometerView,
  type OpportunityCost,
  type OwnershipCost,
} from "@/lib/vehicle"
import { useVehicleContext } from "@/contexts/VehicleContext"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import { usePnLSummary } from "@/hooks/usePnLSummary"
import {
  ASSUMED_CONSUMPTION,
  DEFAULT_FUEL_PRICE,
  MAINTENANCE_STATUS,
} from "@/lib/constants/vehicle"
import { normalizeToUsd } from "@/lib/pnl/currency"
import type {
  Vehicle,
  VehicleCostEntry,
  VehicleMaintenanceItem,
} from "@/types/database"

export interface VehicleView {
  /** Every vehicle, so the page can offer a switcher when there are several. */
  vehicles: Vehicle[]
  /** The one being viewed; null when the user has no vehicle yet. */
  vehicle: Vehicle | null
  /** This vehicle's plan and ledger, newest cost first. */
  items: VehicleMaintenanceItem[]
  entries: VehicleCostEntry[]

  odometer: OdometerView | null
  /** The parts, loudest first — the service visit is not one of them. */
  plan: MaintenanceItemState[]
  /** The periodic service itself; null when the car has no cadence set. */
  service: MaintenanceItemState | null
  /** What the next service should cover, and what to ask about. */
  serviceBundle: NextServiceBundle
  /** What the last one covered — and what it skipped, which is the deduction
   *  an owner actually makes. Null until one has been recorded. */
  lastService: LastServiceSummary | null
  /** The closest item not due by the next service — what to say when that
   *  service is otherwise a plain one. */
  nextUp: MaintenanceItemState | null

  cost: OwnershipCost | null
  /** Null when the portfolio has no annualizable rate yet. */
  opportunity: OpportunityCost | null
  fuel: FuelEconomy | null
  /** Roughly what fuel costs a month. Null until the car's pace is known. */
  monthlyFuel: MonthlyFuelEstimate | null

  loading: boolean
  error: string | null
}

/**
 * Composes Component 17's stored rows with the historical exchange rates and
 * the portfolio's own return rate into everything the Vehicle page renders.
 *
 * Rates come from `TransactionDataContext` (already loaded for the budget and
 * P&L surfaces) so every cost converts at its own date without a new fetch.
 * The portfolio rate is read through `usePnLSummary` + `computeLifetimeXirrPct`
 * — read-only, the same way Component 13's planner reads current value and
 * never writes P&L. The pure module underneath still knows nothing about the
 * portfolio: it takes the rate as a plain percentage.
 */
export function useVehicle(vehicleId?: string): VehicleView {
  const { vehicles, items, entries, loading, error } = useVehicleContext()
  const { transactions, rates, loading: txLoading } = useTransactionData()
  const { totalValueUsd, loading: pnlLoading } = usePnLSummary()

  const today = homeDayIso()

  const vehicle = useMemo(() => {
    if (vehicles.length === 0) return null
    if (vehicleId) return vehicles.find((v) => v.id === vehicleId) ?? null
    return vehicles.find((v) => v.is_active) ?? vehicles[0]
  }, [vehicles, vehicleId])

  const scopedItems = useMemo(
    () =>
      vehicle ? items.filter((i) => i.vehicle_id === vehicle.id) : [],
    [items, vehicle],
  )

  const scopedEntries = useMemo(
    () =>
      vehicle ? entries.filter((e) => e.vehicle_id === vehicle.id) : [],
    [entries, vehicle],
  )

  const odometer = useMemo(
    () => (vehicle ? odometerView(vehicle, scopedEntries) : null),
    [vehicle, scopedEntries],
  )

  const allStates = useMemo(
    () =>
      vehicle && odometer
        ? maintenancePlanState(
            scopedItems,
            vehicle,
            scopedEntries,
            odometer,
            today,
          )
        : [],
    [scopedItems, vehicle, scopedEntries, odometer, today],
  )

  const service = useMemo(() => nextServiceState(allStates), [allStates])
  const plan = useMemo(() => planItems(allStates), [allStates])
  const serviceBundle = useMemo(
    () => nextServiceBundle(allStates, service),
    [allStates, service],
  )
  const lastService = useMemo(
    () => lastServiceSummary(allStates, scopedEntries, service),
    [allStates, scopedEntries, service],
  )

  const cost = useMemo(
    () =>
      vehicle
        ? computeOwnershipCost(
            vehicle,
            scopedEntries,
            rates,
            odometer?.km ?? null,
            today,
          )
        : null,
    [vehicle, scopedEntries, rates, odometer, today],
  )

  const opportunity = useMemo(() => {
    if (!vehicle || !cost) return null
    // Null under a year of portfolio history — the figure is then withheld
    // rather than guessed, and the page says why.
    const ratePct = computeLifetimeXirrPct(
      transactions,
      rates,
      totalValueUsd,
      today,
    )
    return computeOpportunityCost(cost, vehicle, ratePct, today)
  }, [vehicle, cost, transactions, rates, totalValueUsd, today])

  const fuel = useMemo(
    () => (vehicle ? computeFuelEconomy(scopedEntries, rates) : null),
    [vehicle, scopedEntries, rates],
  )

  const monthlyFuel = useMemo(() => {
    if (!odometer) return null
    // The stored pump price is in lira on a stated day, so it converts at THAT
    // day's rate like every other figure here — not today's. It is a fallback
    // only: the owner's own fills replace it the moment one records both
    // litres and an amount.
    const defaultPriceUsd = normalizeToUsd(
      DEFAULT_FUEL_PRICE.tryPerLitre,
      "TRY",
      DEFAULT_FUEL_PRICE.asOf,
      rates,
    ).toNumber()
    return estimateMonthlyFuel({
      kmPerDay: odometer.kmPerDay,
      measuredConsumption: fuel?.average ?? null,
      assumedConsumption: ASSUMED_CONSUMPTION,
      measuredPricePerLitreUsd: fuel?.avgPricePerLitreUsd ?? null,
      defaultPricePerLitreUsd: defaultPriceUsd,
    })
  }, [odometer, fuel, rates])

  // The ledger reads newest first; the engines above take it in any order.
  const ledger = useMemo(
    () => [...scopedEntries].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [scopedEntries],
  )

  return {
    vehicles,
    vehicle,
    items: scopedItems,
    entries: ledger,
    odometer,
    plan,
    service,
    serviceBundle,
    lastService,
    nextUp: nextUpItem(plan),
    cost,
    opportunity,
    fuel,
    monthlyFuel,
    loading: loading || txLoading || pnlLoading,
    error,
  }
}

export interface VehicleAlerts {
  overdue: { vehicle: Vehicle; state: MaintenanceItemState }[]
  dueSoon: { vehicle: Vehicle; state: MaintenanceItemState }[]
}

/**
 * The dashboard banner's data, across **every** active vehicle.
 *
 * Deliberately separate from {@link useVehicle}: the schedule needs no
 * exchange rates and no P&L, so the banner costs nothing beyond the rows the
 * provider already holds — no rate table, no XIRR solve, no P&L engine.
 */
export function useVehicleAlerts(): VehicleAlerts {
  const { vehicles, items, entries } = useVehicleContext()
  const today = homeDayIso()

  return useMemo(() => {
    const overdue: VehicleAlerts["overdue"] = []
    const dueSoon: VehicleAlerts["dueSoon"] = []

    for (const vehicle of vehicles) {
      if (!vehicle.is_active) continue
      const scopedEntries = entries.filter((e) => e.vehicle_id === vehicle.id)
      const scopedItems = items.filter((i) => i.vehicle_id === vehicle.id)
      const view = odometerView(vehicle, scopedEntries)
      const states = maintenancePlanState(
        scopedItems,
        vehicle,
        scopedEntries,
        view,
        today,
      )
      for (const state of dueItems(states)) {
        const bucket =
          state.status === MAINTENANCE_STATUS.overdue ? overdue : dueSoon
        bucket.push({ vehicle, state })
      }
    }

    return { overdue, dueSoon }
  }, [vehicles, items, entries, today])
}
