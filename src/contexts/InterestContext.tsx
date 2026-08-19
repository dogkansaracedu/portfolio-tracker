import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import {
  closeInterestPosition,
  createInterestPosition,
  deleteInterestPosition,
  fetchInterestPositions,
  updateInterestPosition,
} from "@/lib/queries/interest"
import type {
  InterestPosition,
  InterestPositionInsert,
  InterestPositionUpdate,
} from "@/types/database"

interface InterestContextValue {
  /** **All** rows, open and closed. Consumers that want live ones filter
   *  through `openPositions` — the badge and the dashboard banners both do. */
  positions: InterestPosition[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addPosition: (
    data: Omit<InterestPositionInsert, "user_id">,
  ) => Promise<InterestPosition>
  updatePosition: (
    id: string,
    data: InterestPositionUpdate,
  ) => Promise<InterestPosition>
  closePosition: (id: string, isClosed?: boolean) => Promise<InterestPosition>
  deletePosition: (id: string) => Promise<void>
}

const InterestContext = createContext<InterestContextValue | null>(null)

/**
 * Single shared fetch of the user's interest positions (Component 16). Three
 * surfaces read them — the dashboard banners, the portfolio row badge and the
 * asset-detail section — so this follows the house rule and loads once per
 * session instead of fetching on mount at every call site.
 *
 * It deliberately loads closed rows too: the asset-detail history toggle then
 * costs no second round-trip, and the set is small (hand-entered notes).
 * Writes patch the local list in place rather than refetching.
 */
export function InterestProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [positions, setPositions] = useState<InterestPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // Per-user rows behind RLS; skip the guaranteed-empty round-trip while
    // signed out.
    if (!user) {
      setPositions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInterestPositions(user.id, { includeClosed: true })
      setPositions(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch interest positions",
      )
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addPosition = useCallback(
    async (data: Omit<InterestPositionInsert, "user_id">) => {
      if (!user) throw new Error("Not authenticated")
      const position = await createInterestPosition({
        ...data,
        user_id: user.id,
      })
      setPositions((prev) => [...prev, position])
      return position
    },
    [user],
  )

  const updatePosition = useCallback(
    async (id: string, data: InterestPositionUpdate) => {
      const position = await updateInterestPosition(id, data)
      setPositions((prev) => prev.map((p) => (p.id === id ? position : p)))
      return position
    },
    [],
  )

  // An archive, not a removal: the row stays in the local list with the flag
  // flipped, so the closed-history toggle can show it immediately.
  const closePosition = useCallback(async (id: string, isClosed = true) => {
    const position = await closeInterestPosition(id, isClosed)
    setPositions((prev) => prev.map((p) => (p.id === id ? position : p)))
    return position
  }, [])

  const deletePosition = useCallback(async (id: string) => {
    await deleteInterestPosition(id)
    setPositions((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return (
    <InterestContext.Provider
      value={{
        positions,
        loading,
        error,
        refresh,
        addPosition,
        updatePosition,
        closePosition,
        deletePosition,
      }}
    >
      {children}
    </InterestContext.Provider>
  )
}

export function useInterestContext(): InterestContextValue {
  const v = useContext(InterestContext)
  if (!v) {
    throw new Error("useInterestContext must be used inside InterestProvider")
  }
  return v
}
