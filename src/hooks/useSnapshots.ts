import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  fetchSnapshots,
  createSnapshot,
  deleteSnapshot,
} from "@/lib/queries/snapshots"
import type { Snapshot, Asset, PriceCache, ExchangeRate } from "@/types/database"

interface AssetWithPlatform extends Asset {
  platforms: { name: string; color: string }
}

export function useSnapshots() {
  const { user } = useAuth()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSnapshots(user.id)
      setSnapshots(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snapshots")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const takeSnapshot = useCallback(
    async (
      assets: AssetWithPlatform[],
      prices: Record<string, PriceCache>,
      latestRates: ExchangeRate | null,
    ) => {
      if (!user) throw new Error("Not authenticated")
      const snapshot = await createSnapshot(user.id, assets, prices, latestRates)
      await load()
      return snapshot
    },
    [user, load],
  )

  const removeSnapshot = useCallback(
    async (id: string) => {
      await deleteSnapshot(id)
      await load()
    },
    [load],
  )

  return {
    snapshots,
    loading,
    error,
    takeSnapshot,
    removeSnapshot,
    refetch: load,
  }
}
