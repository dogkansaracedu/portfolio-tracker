import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import { bn, BN_ZERO } from "@/lib/config"
import {
  fetchHoldings,
  type HoldingWithDetails,
} from "@/lib/queries/holdings"

export function useHoldings() {
  const { user } = useAuth()
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
      setError(
        err instanceof Error ? err.message : "Failed to fetch holdings",
      )
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refetch()
  }, [refetch])

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

  return {
    holdings,
    loading,
    error,
    refetch,
    getHoldingsForAsset,
    getTotalBalance,
  }
}
