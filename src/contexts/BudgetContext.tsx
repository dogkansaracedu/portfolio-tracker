import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  fetchCashflowEntries,
  createCashflowEntry,
  updateCashflowEntry,
  deleteCashflowEntry,
  fetchIncomeDefaults,
  createIncomeDefault,
  deleteIncomeDefault,
} from "@/lib/queries/budget"
import { useAuth } from "@/hooks/useAuth"
import type {
  CashflowEntry,
  CashflowEntryInsert,
  CashflowEntryUpdate,
  IncomeDefault,
  IncomeDefaultInsert,
} from "@/types/database"

interface BudgetContextValue {
  entries: CashflowEntry[]
  incomeDefaults: IncomeDefault[]
  loading: boolean
  createEntry: (data: Omit<CashflowEntryInsert, "user_id">) => Promise<CashflowEntry>
  updateEntry: (id: string, data: CashflowEntryUpdate) => Promise<CashflowEntry>
  removeEntry: (id: string) => Promise<void>
  createDefault: (
    data: Omit<IncomeDefaultInsert, "user_id">,
  ) => Promise<IncomeDefault>
  removeDefault: (id: string) => Promise<void>
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

/**
 * Single shared fetch of the budgeting rows (Component 14): income entries and
 * the salary schedule. The Budget page reads from here rather than firing its
 * own requests on mount; everything else the page shows is derived client-side
 * from TransactionDataContext via `computeMonthlyBudget`.
 */
export function BudgetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<CashflowEntry[]>([])
  const [incomeDefaults, setIncomeDefaults] = useState<IncomeDefault[]>([])
  const [loading, setLoading] = useState(true)

  // Mount/auth-change load. Cancellation flag so a logout mid-fetch can't
  // clobber the new state with the previous user's rows.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!user) {
        if (!cancelled) {
          setEntries([])
          setIncomeDefaults([])
          setLoading(false)
        }
        return
      }
      if (!cancelled) setLoading(true)
      try {
        const [entryRows, defaultRows] = await Promise.all([
          fetchCashflowEntries(user.id),
          fetchIncomeDefaults(user.id),
        ])
        if (!cancelled) {
          setEntries(entryRows)
          setIncomeDefaults(defaultRows)
        }
      } catch (err) {
        console.error("BudgetProvider load failed:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const createEntry = useCallback(
    async (data: Omit<CashflowEntryInsert, "user_id">) => {
      if (!user) throw new Error("Not authenticated")
      const entry = await createCashflowEntry({ ...data, user_id: user.id })
      setEntries((prev) =>
        [...prev, entry].sort((a, b) => (a.date < b.date ? -1 : 1)),
      )
      return entry
    },
    [user],
  )

  const updateEntry = useCallback(
    async (id: string, data: CashflowEntryUpdate) => {
      const entry = await updateCashflowEntry(id, data)
      setEntries((prev) => prev.map((e) => (e.id === id ? entry : e)))
      return entry
    },
    [],
  )

  const removeEntry = useCallback(async (id: string) => {
    await deleteCashflowEntry(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const createDefault = useCallback(
    async (data: Omit<IncomeDefaultInsert, "user_id">) => {
      if (!user) throw new Error("Not authenticated")
      const row = await createIncomeDefault({ ...data, user_id: user.id })
      setIncomeDefaults((prev) =>
        [...prev, row].sort((a, b) =>
          a.effective_from < b.effective_from ? -1 : 1,
        ),
      )
      return row
    },
    [user],
  )

  const removeDefault = useCallback(async (id: string) => {
    await deleteIncomeDefault(id)
    setIncomeDefaults((prev) => prev.filter((d) => d.id !== id))
  }, [])

  return (
    <BudgetContext.Provider
      value={{
        entries,
        incomeDefaults,
        loading,
        createEntry,
        updateEntry,
        removeEntry,
        createDefault,
        removeDefault,
      }}
    >
      {children}
    </BudgetContext.Provider>
  )
}

export function useBudgetContext(): BudgetContextValue {
  const v = useContext(BudgetContext)
  if (!v) {
    throw new Error("useBudgetContext must be used inside BudgetProvider")
  }
  return v
}
