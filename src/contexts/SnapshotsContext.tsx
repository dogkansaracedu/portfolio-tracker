import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/hooks/useAuth"
import { usePrices } from "@/hooks/usePrices"
import {
  fetchSnapshots,
  createSnapshot,
  deleteSnapshot,
} from "@/lib/queries/snapshots"
import type { Snapshot, PriceCache, ExchangeRate } from "@/types/database"

interface SnapshotsContextValue {
  snapshots: Snapshot[]
  loading: boolean
  error: string | null
  takeSnapshot: (
    prices: Record<string, PriceCache>,
    latestRates: ExchangeRate | null,
  ) => Promise<Snapshot>
  removeSnapshot: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

const SnapshotsContext = createContext<SnapshotsContextValue | null>(null)

export function SnapshotsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { prices, rates, lastUpdated } = usePrices()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setSnapshots([])
      setLoading(false)
      return
    }
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
      pricesArg: Record<string, PriceCache>,
      latestRates: ExchangeRate | null,
    ) => {
      if (!user) throw new Error("Not authenticated")
      const snapshot = await createSnapshot(user.id, pricesArg, latestRates)
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

  // ── Auto-refresh today's snapshot whenever prices update ───────────
  //
  // The dashboard reads aggregations exclusively from the latest snapshot
  // (Option 1 architecture). Without this trigger, a morning page load
  // would show yesterday's 23:55 UTC cron snapshot indefinitely — even
  // after `usePrices` quietly fetches today's prices. Tying the snapshot
  // refresh to `lastUpdated` keeps the snapshot trailing the freshest
  // price the client has seen, so the dashboard reflects "now" without
  // each consumer needing to wire up its own refresh.
  //
  // We dedupe by `lastUpdated` (the latest price's `updated_at`): when a
  // refresh produces no newer price than the snapshot we already wrote
  // for that timestamp, we skip the round-trip. `user` flips re-arm the
  // ref so a new login still gets a snapshot on first price load.
  const lastTriggeredRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (userIdRef.current !== (user?.id ?? null)) {
      userIdRef.current = user?.id ?? null
      lastTriggeredRef.current = null
    }
  }, [user])

  useEffect(() => {
    if (!user || !lastUpdated) return
    if (Object.keys(prices).length === 0) return
    if (lastTriggeredRef.current === lastUpdated) return
    lastTriggeredRef.current = lastUpdated

    let cancelled = false
    void (async () => {
      try {
        await createSnapshot(user.id, prices, rates)
        if (!cancelled) await load()
      } catch (err) {
        // Non-fatal: the dashboard will fall back to the previous
        // snapshot. Surface in the console for debugging.
        console.warn("Auto-refresh today's snapshot failed:", err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, prices, rates, lastUpdated, load])

  return (
    <SnapshotsContext.Provider
      value={{
        snapshots,
        loading,
        error,
        takeSnapshot,
        removeSnapshot,
        refetch: load,
      }}
    >
      {children}
    </SnapshotsContext.Provider>
  )
}

export function useSnapshotsContext(): SnapshotsContextValue {
  const v = useContext(SnapshotsContext)
  if (!v) {
    throw new Error("useSnapshotsContext must be used inside SnapshotsProvider")
  }
  return v
}
