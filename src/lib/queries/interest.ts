import { supabase } from "@/lib/supabase";
import { INTEREST_POSITIONS_TABLE } from "@/lib/constants/interest";
import type {
  InterestPosition,
  InterestPositionInsert,
  InterestPositionUpdate,
} from "@/types/database";

/**
 * Component 16 — Interest Positions CRUD. Plain per-user rows behind the four
 * `auth.uid() = user_id` RLS policies; no edge function and no service role.
 *
 * Numeric columns are written as strings (repo rule) — the callers hand over
 * `BigNumber.toFixed()` output so a quantity keeps its precision through
 * Postgres `numeric`.
 */

export interface FetchInterestOptions {
  /** Include soft-archived rows. The provider passes true so the asset-detail
   *  history toggle costs no second round-trip. */
  includeClosed?: boolean;
}

export async function fetchInterestPositions(
  userId: string,
  { includeClosed = false }: FetchInterestOptions = {}
): Promise<InterestPosition[]> {
  let query = supabase
    .from(INTEREST_POSITIONS_TABLE)
    .select("*")
    .eq("user_id", userId);

  if (!includeClosed) query = query.eq("is_closed", false);

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch interest positions: ${error.message}`);
  }
  return data ?? [];
}

export async function createInterestPosition(
  data: InterestPositionInsert
): Promise<InterestPosition> {
  const { data: position, error } = await supabase
    .from(INTEREST_POSITIONS_TABLE)
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create interest position: ${error.message}`);
  }
  return position;
}

export async function updateInterestPosition(
  id: string,
  data: InterestPositionUpdate
): Promise<InterestPosition> {
  const { data: position, error } = await supabase
    .from(INTEREST_POSITIONS_TABLE)
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update interest position: ${error.message}`);
  }
  return position;
}

/**
 * Soft archive (or un-archive). Not a delete: a matured position is history the
 * user may want to look back at, so the row stays and only `is_closed` moves.
 */
export async function closeInterestPosition(
  id: string,
  isClosed = true
): Promise<InterestPosition> {
  return updateInterestPosition(id, { is_closed: isClosed });
}

export async function deleteInterestPosition(id: string): Promise<void> {
  const { error } = await supabase
    .from(INTEREST_POSITIONS_TABLE)
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete interest position: ${error.message}`);
  }
}
