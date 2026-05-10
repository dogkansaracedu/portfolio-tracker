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
import { useTransactionModal } from "@/contexts/TransactionContext"
import {
  fetchSnapshots,
  createSnapshot,
  deleteSnapshot,
} from "@/lib/queries/snapshots"
import type { Snapshot, PriceCache, ExchangeRate } from "@/types/database"

/**
 * Burst-coalescing window for the auto-snapshot effect. On a normal page
 * load, prices reload from cache (`lastUpdated` set), then a stale-refresh
 * fetch runs and updates `lastUpdated` again seconds later. Without
 * debouncing, both events would each write a snapshot. 5s gives the burst
 * time to settle into a single canonical write.
 */
const AUTO_REFRESH_DEBOUNCE_MS = 5000

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
  const { txVersion } = useTransactionModal()
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

  // ── Auto-refresh today's snapshot ──────────────────────────────────
  //
  // The dashboard reads aggregations exclusively from the latest snapshot
  // (Option 1 architecture). For the chart to reflect "now" we keep
  // today's snapshot trailing two event sources:
  //
  //   1. `lastUpdated` from prices — a price refresh arrives, the
  //      portfolio's USD/TRY values change, snapshot needs to follow.
  //   2. `txVersion` from the transaction modal context — a transaction
  //      add/edit/delete changes balances, snapshot needs to follow even
  //      when prices haven't moved.
  //
  // We dedupe price-driven writes by `lastUpdated` so a refresh that
  // produces no newer price doesn't burn an extra round-trip. We dedupe
  // tx-driven writes by `txVersion` so the same effect doesn't loop on
  // its own snapshot writes (which trigger `load()` and don't bump
  // txVersion). `user` flips reset both refs so a new login still gets
  // a snapshot on first event.
  //
  // Burst coalescing: a typical page load sets `lastUpdated` from cache,
  // then sets it again ~seconds later when stale-refresh completes. We
  // delay the actual write by AUTO_REFRESH_DEBOUNCE_MS and clear the
  // pending timer when either trigger changes again, so the burst
  // collapses to one canonical write.
  const lastTriggeredPriceRef = useRef<string | null>(null)
  const lastTriggeredTxVersionRef = useRef<number | null>(null)
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (userIdRef.current !== (user?.id ?? null)) {
      userIdRef.current = user?.id ?? null
      lastTriggeredPriceRef.current = null
      lastTriggeredTxVersionRef.current = null
    }
  }, [user])

  useEffect(() => {
    if (!user || !lastUpdated) return
    if (Object.keys(prices).length === 0) return

    const priceUnseen = lastTriggeredPriceRef.current !== lastUpdated
    const txUnseen = lastTriggeredTxVersionRef.current !== txVersion
    if (!priceUnseen && !txUnseen) return

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      lastTriggeredPriceRef.current = lastUpdated
      lastTriggeredTxVersionRef.current = txVersion
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
    }, AUTO_REFRESH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [user, prices, rates, lastUpdated, txVersion, load])

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
