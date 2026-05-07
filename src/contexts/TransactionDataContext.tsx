import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  fetchTransactionsForAllAssets,
  fetchAllExchangeRates,
} from "@/lib/queries/pnl"
import { useAuth } from "@/hooks/useAuth"
import type { Transaction, ExchangeRate } from "@/types/database"

interface TransactionDataValue {
  transactions: Transaction[]
  rates: ExchangeRate[]
  loading: boolean
  refresh: () => Promise<void>
}

const TransactionDataContext = createContext<TransactionDataValue | null>(null)

export function TransactionDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)

  // External (mutation-driven) refresh. Mutation flows are user-initiated
  // single events, so cancellation is unnecessary here.
  const refresh = useCallback(async () => {
    if (!user) {
      setTransactions([])
      setRates([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [tx, rt] = await Promise.all([
        fetchTransactionsForAllAssets(user.id),
        fetchAllExchangeRates(),
      ])
      setTransactions(tx)
      setRates(rt)
    } catch (err) {
      console.error("TransactionDataProvider load failed:", err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Mount/auth-change load. Uses a cancellation flag so a logout (or user
  // switch) mid-fetch can't clobber the new state with the previous user's
  // data once the in-flight Promise.all settles.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!user) {
        if (!cancelled) {
          setTransactions([])
          setRates([])
          setLoading(false)
        }
        return
      }
      if (!cancelled) setLoading(true)
      try {
        const [tx, rt] = await Promise.all([
          fetchTransactionsForAllAssets(user.id),
          fetchAllExchangeRates(),
        ])
        if (!cancelled) {
          setTransactions(tx)
          setRates(rt)
        }
      } catch (err) {
        console.error("TransactionDataProvider load failed:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <TransactionDataContext.Provider value={{ transactions, rates, loading, refresh }}>
      {children}
    </TransactionDataContext.Provider>
  )
}

export function useTransactionData() {
  const v = useContext(TransactionDataContext)
  if (!v) {
    throw new Error("useTransactionData must be used inside TransactionDataProvider")
  }
  return v
}
