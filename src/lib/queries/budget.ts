import { supabase } from "@/lib/supabase";
import type {
  CashflowEntry,
  CashflowEntryInsert,
  CashflowEntryUpdate,
  IncomeDefault,
  IncomeDefaultInsert,
} from "@/types/database";

const ENTRIES_TABLE = "cashflow_entries";
const DEFAULTS_TABLE = "income_defaults";

export async function fetchCashflowEntries(
  userId: string
): Promise<CashflowEntry[]> {
  const { data, error } = await supabase
    .from(ENTRIES_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch cash-flow entries: ${error.message}`);
  }
  return data;
}

export async function createCashflowEntry(
  data: CashflowEntryInsert
): Promise<CashflowEntry> {
  const { data: entry, error } = await supabase
    .from(ENTRIES_TABLE)
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create cash-flow entry: ${error.message}`);
  }
  return entry;
}

export async function updateCashflowEntry(
  id: string,
  data: CashflowEntryUpdate
): Promise<CashflowEntry> {
  const { data: entry, error } = await supabase
    .from(ENTRIES_TABLE)
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update cash-flow entry: ${error.message}`);
  }
  return entry;
}

export async function deleteCashflowEntry(id: string): Promise<void> {
  const { error } = await supabase.from(ENTRIES_TABLE).delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete cash-flow entry: ${error.message}`);
  }
}

export async function fetchIncomeDefaults(
  userId: string
): Promise<IncomeDefault[]> {
  const { data, error } = await supabase
    .from(DEFAULTS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("effective_from", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch income defaults: ${error.message}`);
  }
  return data;
}

export async function createIncomeDefault(
  data: IncomeDefaultInsert
): Promise<IncomeDefault> {
  const { data: row, error } = await supabase
    .from(DEFAULTS_TABLE)
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create income default: ${error.message}`);
  }
  return row;
}

export async function deleteIncomeDefault(id: string): Promise<void> {
  const { error } = await supabase.from(DEFAULTS_TABLE).delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete income default: ${error.message}`);
  }
}
