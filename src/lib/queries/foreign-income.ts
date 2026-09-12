import { supabase } from "@/lib/supabase"
import type {
  ForeignIncomeReconciliation,
  ForeignIncomeReconciliationInsert,
} from "@/types/database"

const TABLE = "foreign_income_reconciliations"

export async function fetchForeignIncomeReconciliations(
  userId: string,
  taxYear: number,
): Promise<ForeignIncomeReconciliation[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("tax_year", taxYear)
    .order("reconciled_at", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Failed to load foreign-income reconciliation: ${error.message}`)
  }
  return data ?? []
}

export async function insertForeignIncomeReconciliation(
  data: ForeignIncomeReconciliationInsert,
): Promise<ForeignIncomeReconciliation> {
  const { data: row, error } = await supabase
    .from(TABLE)
    .insert(data)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to save foreign-income reconciliation: ${error.message}`)
  }
  return row
}
