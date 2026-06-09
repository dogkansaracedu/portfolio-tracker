import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import type { Asset, AssetInsert, AssetUpdate } from "@/types/database"
import {
  fetchAssets,
  createAsset,
  updateAsset,
  deactivateAsset,
} from "@/lib/queries/assets"

interface AssetsContextValue {
  assets: Asset[]
  loading: boolean
  error: string | null
  addAsset: (data: Omit<AssetInsert, "user_id">) => Promise<Asset>
  editAsset: (id: string, data: AssetUpdate) => Promise<Asset>
  deactivateAsset: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

const AssetsContext = createContext<AssetsContextValue | null>(null)

/**
 * Single shared assets fetch for the whole tree. Previously every consumer
 * (`AppLayout`, page hooks, filters, the bulk sheet) called `useAssets`
 * independently and each fired its own `assets?select=*` request on mount —
 * 2-3 identical fetches per page. Lifting the state here dedupes them to one.
 */
export function AssetsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAssets()
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

  return (
    <AssetsContext.Provider
      value={{
        assets,
        loading,
        error,
        addAsset,
        editAsset,
        deactivateAsset: deactivateAssetById,
        refetch,
      }}
    >
      {children}
    </AssetsContext.Provider>
  )
}

export function useAssetsContext(): AssetsContextValue {
  const v = useContext(AssetsContext)
  if (!v) {
    throw new Error("useAssetsContext must be used inside AssetsProvider")
  }
  return v
}
