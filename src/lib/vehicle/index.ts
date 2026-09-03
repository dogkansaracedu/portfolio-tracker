/**
 * Vehicle (Component 17) — cost of ownership and the periodic maintenance
 * schedule. Barrel, matching `lib/budget` and `lib/retirement`.
 *
 * Everything here is pure and derives on read. Nothing in this module imports
 * the P&L engine, `usePnL` or `HoldingsContext`: the boundary rule (no
 * transaction, no holding, no balance, no net worth, no P&L) is enforced by
 * construction, exactly as Component 16 enforces its own. The one number that
 * comes from outside — the portfolio's annualized rate for the opportunity
 * cost — is passed IN as a plain percentage by the hook, so the maths here
 * still knows nothing about the portfolio.
 */

export {
  addDaysIso,
  addMonthsIso,
  odometerReadings,
  odometerView,
  maintenanceItemState,
  maintenancePlanState,
  dueItems,
  nextUpItem,
  type OdometerReading,
  type OdometerView,
  type MaintenanceItemState,
} from "./schedule"

export {
  computeOwnershipCost,
  computeOpportunityCost,
  type OwnershipCost,
  type OpportunityCost,
  type CategoryTotal,
} from "./costs"

export {
  computeFuelEconomy,
  type FuelEconomy,
  type FuelSegment,
} from "./fuel"
