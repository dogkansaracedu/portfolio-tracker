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
import { useHoldings } from "@/hooks/useHoldings"
import { usePrices } from "@/hooks/usePrices"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { bn } from "@/lib/config"
import {
  fetchSnapshots,
  fetchIntradaySnapshots,
  createSnapshot,
  buildSnapshotInsert,
  persistSnapshot,
  deleteSnapshot,
} from "@/lib/queries/snapshots"
import type { Snapshot, IntradaySnapshot, PriceCache, ExchangeRate } from "@/types/database"

/**
 * Debounce windows for the auto-snapshot effect.
 *
 * - PRICE: a normal page load loads prices from cache (sets `lastUpdated`),
 *   then the stale-refresh fetch runs and updates `lastUpdated` again
 *   seconds later. 5s gives the burst time to settle into a single
 *   canonical write.
 * - TX: a transaction add/edit/delete is a discrete user action — there
 *   is no burst to coalesce. We still use a small window so e.g. a CSV
 *   import that fires a dozen tx-saves in succession doesn't write a
 *   dozen snapshots, but it's small enough to feel instant in normal use.
 *
 * When both triggers fire at once we use the shorter window so the user
 * doesn't wait 5 seconds for the dashboard total to update after editing.
 */
const PRICE_REFRESH_DEBOUNCE_MS = 5000
const TX_REFRESH_DEBOUNCE_MS = 200

interface SnapshotsContextValue {
  snapshots: Snapshot[]
  intradaySnapshots: IntradaySnapshot[]
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
  const { holdings } = useHoldings()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [intradaySnapshots, setIntradaySnapshots] = useState<IntradaySnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setSnapshots([])
      setIntradaySnapshots([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [data, intraday] = await Promise.all([
        fetchSnapshots(user.id),
        fetchIntradaySnapshots(user.id),
      ])
      setSnapshots(data)
      setIntradaySnapshots(intraday)
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
  // delay the actual write and clear the pending timer when either
  // trigger changes again, so the burst collapses to one canonical write.
  // Tx-driven writes use a much shorter window because they're discrete
  // user actions — see the constants above.
  //
  // Write path splits by trigger:
  //   tx   → balances changed, so read holdings fresh from the server
  //          (post-recalc) via createSnapshot and always write.
  //   price→ balances are unchanged, so value the in-memory holdings and
  //          skip the upsert entirely when today's total hasn't actually
  //          moved (a cache re-read, tab refocus, or stale market window).
  //          This is what stops the per-tick `snapshots` upsert + holdings
  //          re-read that fired on every price poll.
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

    // Pick the shorter window when tx is the trigger so the dashboard
    // total catches up to a fresh edit in ~200ms instead of 5s.
    const delay = txUnseen
      ? TX_REFRESH_DEBOUNCE_MS
      : PRICE_REFRESH_DEBOUNCE_MS

    const markSeen = () => {
      lastTriggeredPriceRef.current = lastUpdated
      lastTriggeredTxVersionRef.current = txVersion
    }

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      void (async () => {
        try {
          if (txUnseen) {
            // A transaction changed balances — fetch fresh holdings and write.
            markSeen()
            await createSnapshot(user.id, prices, rates)
          } else {
            // Price-only change. Don't write a zero snapshot if holdings
            // haven't loaded yet — leave the trigger unseen so a later
            // holdings update re-evaluates.
            if (holdings.length === 0) return
            markSeen()
            const insert = buildSnapshotInsert(user.id, holdings, prices, rates)
            const todays = snapshots.find(
              (s) => s.snapshot_date === insert.snapshot_date,
            )
            const unchanged =
              todays != null &&
              bn(insert.total_usd).eq(bn(todays.total_usd)) &&
              bn(insert.total_try).eq(bn(todays.total_try))
            if (unchanged) return
            await persistSnapshot(insert)
          }
          if (!cancelled) await load()
        } catch (err) {
          // Non-fatal: the dashboard will fall back to the previous
          // snapshot. Surface in the console for debugging.
          console.warn("Auto-refresh today's snapshot failed:", err)
        }
      })()
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [user, prices, rates, lastUpdated, txVersion, load, holdings, snapshots])

  return (
    <SnapshotsContext.Provider
      value={{
        snapshots,
        intradaySnapshots,
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
