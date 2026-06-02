import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import type {
  Platform,
  PlatformInsert,
  PlatformUpdate,
} from "@/types/database"
import {
  fetchPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
} from "@/lib/queries/platforms"

interface PlatformsContextValue {
  platforms: Platform[]
  loading: boolean
  error: string | null
  addPlatform: (data: Omit<PlatformInsert, "user_id">) => Promise<Platform>
  editPlatform: (id: string, data: PlatformUpdate) => Promise<Platform>
  removePlatform: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

const PlatformsContext = createContext<PlatformsContextValue | null>(null)

/**
 * Single shared platforms fetch for the whole tree. Previously `AppLayout`,
 * the transaction filters, the bulk-edit page and the settings list each
 * called `usePlatforms` and fired their own `platforms?select=*` on mount.
 * Lifting the state here dedupes them to one request.
 */
export function PlatformsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlatforms(user.id)
      setPlatforms(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch platforms")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refetch()
  }, [refetch])

  const addPlatform = useCallback(
    async (data: Omit<PlatformInsert, "user_id">) => {
      if (!user) throw new Error("Not authenticated")
      const platform = await createPlatform({ ...data, user_id: user.id })
      setPlatforms((prev) => [...prev, platform])
      return platform
    },
    [user],
  )

  const editPlatform = useCallback(
    async (id: string, data: PlatformUpdate) => {
      const platform = await updatePlatform(id, data)
      setPlatforms((prev) => prev.map((p) => (p.id === id ? platform : p)))
      return platform
    },
    [],
  )

  const removePlatform = useCallback(async (id: string) => {
    await deletePlatform(id)
    setPlatforms((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return (
    <PlatformsContext.Provider
      value={{
        platforms,
        loading,
        error,
        addPlatform,
        editPlatform,
        removePlatform,
        refetch,
      }}
    >
      {children}
    </PlatformsContext.Provider>
  )
}

export function usePlatformsContext(): PlatformsContextValue {
  const v = useContext(PlatformsContext)
  if (!v) {
    throw new Error("usePlatformsContext must be used inside PlatformsProvider")
  }
  return v
}
