import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import type { Asset, AssetInsert, AssetUpdate } from "@/types/database"
import {
  fetchAssets,
  createAsset,
  updateAsset,
  deactivateAsset,
} from "@/lib/queries/assets"

export function useAssets() {
  const { user } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAssets(user.id)
      setAssets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch assets")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addAsset = useCallback(
    async (data: Omit<AssetInsert, "user_id">) => {
      if (!user) throw new Error("Not authenticated")
      const asset = await createAsset({ ...data, user_id: user.id })
      await refetch()
      return asset
    },
    [user, refetch],
  )

  const editAsset = useCallback(
    async (id: string, data: AssetUpdate) => {
      const asset = await updateAsset(id, data)
      await refetch()
      return asset
    },
    [refetch],
  )

  const deactivateAssetById = useCallback(
    async (id: string) => {
      await deactivateAsset(id)
      await refetch()
    },
    [refetch],
  )

  return {
    assets,
    loading,
    error,
    addAsset,
    editAsset,
    deactivateAsset: deactivateAssetById,
    refetch,
  }
}
