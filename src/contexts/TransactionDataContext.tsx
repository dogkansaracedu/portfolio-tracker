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

  useEffect(() => {
    refresh()
  }, [refresh])

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
