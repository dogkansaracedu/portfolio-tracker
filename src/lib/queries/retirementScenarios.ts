import { supabase } from "@/lib/supabase";
import type {
  RetirementScenario,
  RetirementScenarioInsert,
  RetirementScenarioUpdate,
} from "@/types/database";

const TABLE = "retirement_scenarios";

export async function fetchRetirementScenarios(
  userId: string
): Promise<RetirementScenario[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch retirement scenarios: ${error.message}`);
  }
  return data;
}

export async function createRetirementScenario(
  data: RetirementScenarioInsert
): Promise<RetirementScenario> {
  const { data: scenario, error } = await supabase
    .from(TABLE)
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create retirement scenario: ${error.message}`);
  }
  return scenario;
}

export async function updateRetirementScenario(
  id: string,
  data: RetirementScenarioUpdate
): Promise<RetirementScenario> {
  const { data: scenario, error } = await supabase
    .from(TABLE)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update retirement scenario: ${error.message}`);
  }
  return scenario;
}

export async function deleteRetirementScenario(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete retirement scenario: ${error.message}`);
  }
}

/**
 * Move the default flag onto one scenario. Two statements, in this order: the
 * partial unique index on (user_id) WHERE is_default rejects a second default
 * row, so the old default must be cleared *before* the new one is set. The
 * reverse order fails; a combined statement would too. If the second write
 * fails the user is briefly left with no default — recoverable (the client
 * falls back to the first scenario) and safer than two defaults, which the
 * index would reject outright.
 */
export async function setDefaultRetirementScenario(
  userId: string,
  id: string
): Promise<void> {
  const timestamp = new Date().toISOString();

  const { error: clearError } = await supabase
    .from(TABLE)
    .update({ is_default: false, updated_at: timestamp })
    .eq("user_id", userId)
    .eq("is_default", true)
    .neq("id", id);

  if (clearError) {
    throw new Error(
      `Failed to clear the previous default scenario: ${clearError.message}`
    );
  }

  const { error: setError } = await supabase
    .from(TABLE)
    .update({ is_default: true, updated_at: timestamp })
    .eq("id", id);

  if (setError) {
    throw new Error(`Failed to set the default scenario: ${setError.message}`);
  }
}
