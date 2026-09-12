import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchForeignIncomeReconciliations,
  insertForeignIncomeReconciliation,
} from "@/lib/queries/foreign-income"
import type {
  ForeignIncomeReconciliation,
  ForeignIncomeReconciliationInsert,
} from "@/types/database"

export function useForeignIncomeReconciliation(taxYear: number) {
  const { user } = useAuth()
  const [reconciliations, setReconciliations] = useState<
    ForeignIncomeReconciliation[]
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const loadRequest = useRef(0)

  const load = useCallback(async () => {
    const request = ++loadRequest.current
    if (!user) {
      setReconciliations([])
      setLoading(false)
      setLoadError(null)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const rows = await fetchForeignIncomeReconciliations(user.id, taxYear)
      if (request === loadRequest.current) setReconciliations(rows)
    } catch (err) {
      if (request === loadRequest.current) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "Failed to load foreign-income comparisons",
        )
      }
    } finally {
      if (request === loadRequest.current) setLoading(false)
    }
  }, [taxYear, user])

  useEffect(() => {
    void load()
    return () => {
      loadRequest.current += 1
    }
  }, [load])

  const save = useCallback(
    async (
      data: Omit<
        ForeignIncomeReconciliationInsert,
        "user_id" | "tax_year"
      >,
    ) => {
      if (!user) throw new Error("Not authenticated")
      setSaving(true)
      setSaveError(null)
      try {
        const row = await insertForeignIncomeReconciliation({
          ...data,
          user_id: user.id,
          tax_year: taxYear,
        })
        setReconciliations((current) => [row, ...current])
        return row
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to save foreign-income comparison"
        setSaveError(message)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [taxYear, user],
  )

  return {
    reconciliation: reconciliations[0] ?? null,
    reconciliations,
    loading,
    saving,
    loadError,
    saveError,
    retry: load,
    save,
  }
}
