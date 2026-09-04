import { supabase } from "@/lib/supabase";
import {
  DEFAULT_MAINTENANCE_PLAN,
  VEHICLES_TABLE,
  VEHICLE_COST_ENTRIES_TABLE,
  VEHICLE_COST_ENTRY_ITEMS_TABLE,
  VEHICLE_MAINTENANCE_ITEMS_TABLE,
} from "@/lib/constants/vehicle";
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
} from "@/types/database";

/**
 * Component 17 — Vehicle CRUD. Plain per-user rows behind the four
 * `auth.uid() = user_id` RLS policies; no edge function, no service role,
 * no cron. Nothing here writes a transaction, a holding or a price.
 *
 * Numeric columns are written as strings (repo rule) — callers hand over
 * `BigNumber.toFixed()` output so an odometer or a lira amount keeps its
 * precision through Postgres `numeric`.
 */

// ─── Vehicles ───────────────────────────────────────────────────────

export async function fetchVehicles(userId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from(VEHICLES_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch vehicles: ${error.message}`);
  return data ?? [];
}

export async function createVehicle(data: VehicleInsert): Promise<Vehicle> {
  const { data: row, error } = await supabase
    .from(VEHICLES_TABLE)
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to create vehicle: ${error.message}`);
  return row;
}

export async function updateVehicle(
  id: string,
  data: VehicleUpdate
): Promise<Vehicle> {
  const { data: row, error } = await supabase
    .from(VEHICLES_TABLE)
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update vehicle: ${error.message}`);
  return row;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from(VEHICLES_TABLE).delete().eq("id", id);
  if (error) throw new Error(`Failed to delete vehicle: ${error.message}`);
}

// ─── Maintenance items ──────────────────────────────────────────────

export async function fetchMaintenanceItems(
  userId: string
): Promise<VehicleMaintenanceItem[]> {
  const { data, error } = await supabase
    .from(VEHICLE_MAINTENANCE_ITEMS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error)
    throw new Error(`Failed to fetch maintenance items: ${error.message}`);
  return data ?? [];
}

export async function createMaintenanceItem(
  data: VehicleMaintenanceItemInsert
): Promise<VehicleMaintenanceItem> {
  const { data: row, error } = await supabase
    .from(VEHICLE_MAINTENANCE_ITEMS_TABLE)
    .insert(data)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create maintenance item: ${error.message}`);
  return row;
}

export async function updateMaintenanceItem(
  id: string,
  data: VehicleMaintenanceItemUpdate
): Promise<VehicleMaintenanceItem> {
  const { data: row, error } = await supabase
    .from(VEHICLE_MAINTENANCE_ITEMS_TABLE)
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update maintenance item: ${error.message}`);
  return row;
}

export async function deleteMaintenanceItem(id: string): Promise<void> {
  const { error } = await supabase
    .from(VEHICLE_MAINTENANCE_ITEMS_TABLE)
    .delete()
    .eq("id", id);
  if (error)
    throw new Error(`Failed to delete maintenance item: ${error.message}`);
}

/**
 * Seed the default Turkish plan for a vehicle in one insert.
 *
 * The template exists because there is no free source of manufacturer service
 * intervals — Edmunds' API closed to new keys in 2018, MOTOR and ALLDATA are
 * commercial, and the one buyable dataset is $1,000 and mileage-only. So these
 * are typical Turkish intervals the owner then corrects against their own
 * bakım kitabı, not a factory schedule for their specific car.
 */
export async function seedMaintenancePlan(
  userId: string,
  vehicleId: string
): Promise<VehicleMaintenanceItem[]> {
  const rows: VehicleMaintenanceItemInsert[] = DEFAULT_MAINTENANCE_PLAN.map(
    (t, index) => ({
      user_id: userId,
      vehicle_id: vehicleId,
      name: t.name,
      item_group: t.group,
      item_kind: t.kind,
      cost_category: t.costCategory,
      every_n_services: t.everyNServices,
      interval_km: t.intervalKm,
      interval_months: t.intervalMonths,
      sort_order: index,
      note: t.note,
    })
  );

  const { data, error } = await supabase
    .from(VEHICLE_MAINTENANCE_ITEMS_TABLE)
    .insert(rows)
    .select();

  if (error)
    throw new Error(`Failed to seed maintenance plan: ${error.message}`);
  return data ?? [];
}

// ─── Cost entries ───────────────────────────────────────────────────

/** The join rows Supabase nests under a cost entry when asked for them. */
interface NestedItemRow {
  item_id: string;
}

/** Flatten the nested join rows into the `item_ids` array the pure schedule
 *  engine takes, so nothing downstream knows a join table exists. */
function withItemIds(row: Record<string, unknown>): VehicleCostEntry {
  const nested = (row[VEHICLE_COST_ENTRY_ITEMS_TABLE] ??
    []) as NestedItemRow[];
  const entry = { ...row } as Record<string, unknown>;
  delete entry[VEHICLE_COST_ENTRY_ITEMS_TABLE];
  return {
    ...(entry as unknown as Omit<VehicleCostEntry, "item_ids">),
    item_ids: nested.map((n) => n.item_id),
  };
}

export async function fetchCostEntries(
  userId: string
): Promise<VehicleCostEntry[]> {
  // One round-trip for the entries and the items each one closed — the
  // schedule engine needs both to anchor an interval.
  const { data, error } = await supabase
    .from(VEHICLE_COST_ENTRIES_TABLE)
    .select(`*, ${VEHICLE_COST_ENTRY_ITEMS_TABLE}(item_id)`)
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error)
    throw new Error(`Failed to fetch vehicle costs: ${error.message}`);
  return (data ?? []).map(withItemIds);
}

/** Replace a cost entry's closed-item set. Delete-then-insert rather than a
 *  diff: the set is at most a handful of rows and correctness beats cleverness
 *  when what is at stake is whether an interval reset. */
async function setEntryItems(
  costEntryId: string,
  itemIds: string[]
): Promise<void> {
  const { error: delError } = await supabase
    .from(VEHICLE_COST_ENTRY_ITEMS_TABLE)
    .delete()
    .eq("cost_entry_id", costEntryId);
  if (delError)
    throw new Error(`Failed to clear closed items: ${delError.message}`);

  if (itemIds.length === 0) return;

  const { error } = await supabase
    .from(VEHICLE_COST_ENTRY_ITEMS_TABLE)
    .insert(itemIds.map((item_id) => ({ cost_entry_id: costEntryId, item_id })));
  if (error) throw new Error(`Failed to link closed items: ${error.message}`);
}

export async function createCostEntry(
  data: VehicleCostEntryInsert,
  itemIds: string[] = []
): Promise<VehicleCostEntry> {
  const { data: row, error } = await supabase
    .from(VEHICLE_COST_ENTRIES_TABLE)
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to add cost entry: ${error.message}`);

  await setEntryItems(row.id, itemIds);
  return { ...row, item_ids: itemIds };
}

export async function updateCostEntry(
  id: string,
  data: VehicleCostEntryUpdate,
  itemIds?: string[]
): Promise<VehicleCostEntry> {
  const { data: row, error } = await supabase
    .from(VEHICLE_COST_ENTRIES_TABLE)
    .update(data)
    .eq("id", id)
    .select(`*, ${VEHICLE_COST_ENTRY_ITEMS_TABLE}(item_id)`)
    .single();

  if (error) throw new Error(`Failed to update cost entry: ${error.message}`);

  // `undefined` means "leave the links alone"; an empty array clears them.
  if (itemIds === undefined) return withItemIds(row);

  await setEntryItems(id, itemIds);
  return { ...withItemIds(row), item_ids: itemIds };
}

export async function deleteCostEntry(id: string): Promise<void> {
  // The join rows go with it (ON DELETE CASCADE).
  const { error } = await supabase
    .from(VEHICLE_COST_ENTRIES_TABLE)
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Failed to delete cost entry: ${error.message}`);
}
