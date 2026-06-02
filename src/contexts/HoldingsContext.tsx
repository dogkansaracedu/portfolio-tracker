import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { bn, BN_ZERO } from "@/lib/config"
import { fetchHoldings, type HoldingWithDetails } from "@/lib/queries/holdings"

interface HoldingsContextValue {
  holdings: HoldingWithDetails[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  getHoldingsForAsset: (assetId: string) => HoldingWithDetails[]
  getTotalBalance: (assetId: string) => number
}

const HoldingsContext = createContext<HoldingsContextValue | null>(null)

/**
 * Single shared holdings fetch for the whole tree. Previously `AppLayout`, the
 * always-mounted add-transaction modal, the funding-source picker and per-page
 * consumers each called `useHoldings` and fired their own
 * `holdings?select=*,assets(...),platforms(...)` on mount — 2-4 identical
 * fetches per page. Lifting the state here dedupes them to one, and the
 * snapshot auto-refresh reuses these in-memory rows for price-only writes.
 */
export function HoldingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { txVersion } = useTransactionModal()
  const [holdings, setHoldings] = useState<HoldingWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHoldings(user.id)
      setHoldings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch holdings")
    } finally {
      setLoading(false)
    }
  }, [user])

  // Re-fetch on user change AND whenever any tx mutation bumps txVersion —
  // recalculateBalance writes to holdings server-side, so the cached state
  // is stale until we re-pull.
  useEffect(() => {
    refetch()
  }, [refetch, txVersion])

  /** Filter already-loaded holdings for a specific asset. */
  const getHoldingsForAsset = useCallback(
    (assetId: string): HoldingWithDetails[] =>
      holdings.filter((h) => h.asset_id === assetId),
    [holdings],
  )

  /** Sum balance across all platforms for an asset. */
  const getTotalBalance = useCallback(
    (assetId: string): number => {
      let total = BN_ZERO
      for (const h of holdings) {
        if (h.asset_id === assetId) {
          total = total.plus(bn(h.balance))
        }
      }
      return total.toNumber()
    },
    [holdings],
  )

  return (
    <HoldingsContext.Provider
      value={{
        holdings,
        loading,
        error,
        refetch,
        getHoldingsForAsset,
        getTotalBalance,
      }}
    >
      {children}
    </HoldingsContext.Provider>
  )
}

export function useHoldingsContext(): HoldingsContextValue {
  const v = useContext(HoldingsContext)
  if (!v) {
    throw new Error("useHoldingsContext must be used inside HoldingsProvider")
  }
  return v
}
