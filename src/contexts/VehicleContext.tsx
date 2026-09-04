import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import { ensureHistoricalRate } from "@/lib/queries/exchangeRates"
import {
  createCostEntry,
  createMaintenanceItem,
  createVehicle,
  deleteCostEntry,
  deleteMaintenanceItem,
  deleteVehicle,
  fetchCostEntries,
  fetchMaintenanceItems,
  fetchVehicles,
  seedMaintenancePlan,
  updateCostEntry,
  updateMaintenanceItem,
  updateVehicle,
} from "@/lib/queries/vehicle"
import type {
  Vehicle,
  VehicleCostEntry,
  VehicleCostEntryInsert,
  VehicleCostEntryUpdate,
  VehicleInsert,
  VehicleMaintenanceItem,
  VehicleMaintenanceItemInsert,
  VehicleMaintenanceItemUpdate,
  VehicleUpdate,
} from "@/types/database"

interface VehicleContextValue {
  vehicles: Vehicle[]
  items: VehicleMaintenanceItem[]
  entries: VehicleCostEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>

  addVehicle: (data: Omit<VehicleInsert, "user_id">) => Promise<Vehicle>
  editVehicle: (id: string, data: VehicleUpdate) => Promise<Vehicle>
  removeVehicle: (id: string) => Promise<void>

  addItem: (
    data: Omit<VehicleMaintenanceItemInsert, "user_id">,
  ) => Promise<VehicleMaintenanceItem>
  editItem: (
    id: string,
    data: VehicleMaintenanceItemUpdate,
  ) => Promise<VehicleMaintenanceItem>
  removeItem: (id: string) => Promise<void>
  seedPlan: (vehicleId: string) => Promise<VehicleMaintenanceItem[]>

  addEntry: (
    data: Omit<VehicleCostEntryInsert, "user_id">,
    itemIds?: string[],
  ) => Promise<VehicleCostEntry>
  editEntry: (
    id: string,
    data: VehicleCostEntryUpdate,
    itemIds?: string[],
  ) => Promise<VehicleCostEntry>
  removeEntry: (id: string) => Promise<void>
}

const VehicleContext = createContext<VehicleContextValue | null>(null)

/**
 * Ensure `exchange_rates` carries the TCMB rate for each day this component
 * will convert a non-USD amount at.
 *
 * The vehicle tables store dates the transaction tables never saw — a purchase
 * from before the portfolio existed, a valuation read last month, a fuel fill
 * on a day nothing was traded — and the rate table is backfilled **on demand**,
 * so those days are routinely absent. Without this, `getExchangeRateForDate`
 * walks back to the nearest earlier day and the figure is quietly wrong: a real
 * case had a purchase date 18 days past the last known rate, worth a $713 error
 * on the capital half of cost of ownership, with nothing on screen to say so.
 *
 * Non-fatal by construction (same contract as the transaction path): the row is
 * already saved, and a failed backfill just leaves the nearest-rate fallback in
 * place.
 */
async function ensureRatesFor(
  entries: { currency?: string | null; date?: string | null }[],
): Promise<void> {
  await Promise.allSettled(
    entries.map(({ currency, date }) =>
      ensureHistoricalRate(currency, null, date),
    ),
  )
}

/**
 * Single shared fetch of the user's vehicle data (Component 17). Two surfaces
 * read it — the Vehicle page and the dashboard maintenance banner — so it
 * follows the house rule and loads once per session rather than fetching on
 * mount at each call site.
 *
 * All three tables load together: the schedule cannot say what is due without
 * both the plan and the cost entries that closed its items, so splitting them
 * would only buy two round-trips and a partial render.
 *
 * Writes patch the local lists in place rather than refetching. Nothing here
 * touches holdings, transactions, prices or P&L — the component's boundary
 * rule, enforced by there being no such import in the module.
 */
export function VehicleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [items, setItems] = useState<VehicleMaintenanceItem[]>([])
  const [entries, setEntries] = useState<VehicleCostEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // Per-user rows behind RLS; skip the guaranteed-empty round-trip while
    // signed out.
    if (!user) {
      setVehicles([])
      setItems([])
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [v, i, e] = await Promise.all([
        fetchVehicles(user.id),
        fetchMaintenanceItems(user.id),
        fetchCostEntries(user.id),
      ])
      setVehicles(v)
      setItems(i)
      setEntries(e)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch vehicle data",
      )
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ─── Vehicles
  const addVehicle = useCallback(
    async (data: Omit<VehicleInsert, "user_id">) => {
      if (!user) throw new Error("Not signed in")
      const row = await createVehicle({ ...data, user_id: user.id })
      await ensureRatesFor([
        { currency: row.purchase_currency, date: row.purchased_on },
        { currency: row.current_value_currency, date: row.current_value_at },
      ])
      setVehicles((prev) => [...prev, row])
      return row
    },
    [user],
  )

  const editVehicle = useCallback(async (id: string, data: VehicleUpdate) => {
    const row = await updateVehicle(id, data)
    await ensureRatesFor([
      { currency: row.purchase_currency, date: row.purchased_on },
      { currency: row.current_value_currency, date: row.current_value_at },
    ])
    setVehicles((prev) => prev.map((v) => (v.id === id ? row : v)))
    return row
  }, [])

  const removeVehicle = useCallback(async (id: string) => {
    await deleteVehicle(id)
    // The database cascades items and entries; mirror that locally so the page
    // does not render orphans until the next refresh.
    setVehicles((prev) => prev.filter((v) => v.id !== id))
    setItems((prev) => prev.filter((i) => i.vehicle_id !== id))
    setEntries((prev) => prev.filter((e) => e.vehicle_id !== id))
  }, [])

  // ─── Maintenance items
  const addItem = useCallback(
    async (data: Omit<VehicleMaintenanceItemInsert, "user_id">) => {
      if (!user) throw new Error("Not signed in")
      const row = await createMaintenanceItem({ ...data, user_id: user.id })
      setItems((prev) => [...prev, row])
      return row
    },
    [user],
  )

  const editItem = useCallback(
    async (id: string, data: VehicleMaintenanceItemUpdate) => {
      const row = await updateMaintenanceItem(id, data)
      setItems((prev) => prev.map((i) => (i.id === id ? row : i)))
      return row
    },
    [],
  )

  const removeItem = useCallback(async (id: string) => {
    await deleteMaintenanceItem(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    // The join rows cascade, so any entry that closed this item loses the
    // reference — drop it locally too or the schedule would keep anchoring on
    // an item that no longer exists.
    setEntries((prev) =>
      prev.map((e) =>
        e.item_ids.includes(id)
          ? { ...e, item_ids: e.item_ids.filter((x) => x !== id) }
          : e,
      ),
    )
  }, [])

  const seedPlan = useCallback(
    async (vehicleId: string) => {
      if (!user) throw new Error("Not signed in")
      const rows = await seedMaintenancePlan(user.id, vehicleId)
      setItems((prev) => [...prev, ...rows])
      return rows
    },
    [user],
  )

  // ─── Cost entries
  const addEntry = useCallback(
    async (
      data: Omit<VehicleCostEntryInsert, "user_id">,
      itemIds: string[] = [],
    ) => {
      if (!user) throw new Error("Not signed in")
      const row = await createCostEntry({ ...data, user_id: user.id }, itemIds)
      await ensureRatesFor([{ currency: row.currency, date: row.date }])
      setEntries((prev) => [...prev, row])
      return row
    },
    [user],
  )

  const editEntry = useCallback(
    async (
      id: string,
      data: VehicleCostEntryUpdate,
      itemIds?: string[],
    ) => {
      const row = await updateCostEntry(id, data, itemIds)
      await ensureRatesFor([{ currency: row.currency, date: row.date }])
      setEntries((prev) => prev.map((e) => (e.id === id ? row : e)))
      return row
    },
    [],
  )

  const removeEntry = useCallback(async (id: string) => {
    await deleteCostEntry(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  return (
    <VehicleContext.Provider
      value={{
        vehicles,
        items,
        entries,
        loading,
        error,
        refresh,
        addVehicle,
        editVehicle,
        removeVehicle,
        addItem,
        editItem,
        removeItem,
        seedPlan,
        addEntry,
        editEntry,
        removeEntry,
      }}
    >
      {children}
    </VehicleContext.Provider>
  )
}

export function useVehicleContext(): VehicleContextValue {
  const context = useContext(VehicleContext)
  if (context === null) {
    throw new Error("useVehicleContext must be used within a VehicleProvider")
  }
  return context
}
