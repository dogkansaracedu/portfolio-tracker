import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { PriceCache, ExchangeRate } from "@/types/database"
import { fetchPrices } from "@/lib/queries/prices"
import { fetchLatestRates } from "@/lib/queries/exchangeRates"
import { isStale } from "@/lib/prices"
import { supabase } from "@/lib/supabase"

const STALE_THRESHOLD_MINUTES = 30

interface PricesContextValue {
  prices: Record<string, PriceCache>
  rates: ExchangeRate | null
  loading: boolean
  refreshing: boolean
  lastUpdated: string | null
  refreshPrices: () => Promise<void>
  staleAssets: string[]
}

const PricesContext = createContext<PricesContextValue | null>(null)

/**
 * App-wide prices store. Hoists what was a per-call `usePrices` hook into a
 * single shared instance so:
 *
 * - The header's "Refresh prices" button shares state with the rest of the
 *   tree (without this, each consumer had its own state and a manual refresh
 *   touched only the button's instance — `SnapshotsProvider` and friends
 *   stayed stale until their own staleness check fired).
 * - The "auto-refresh once on stale prices" guard fires exactly once per app
 *   lifetime instead of per consumer.
 * - `lastUpdated` becomes a true app-wide event source that
 *   `SnapshotsProvider` can watch to keep today's snapshot trailing the
 *   freshest prices.
 */
export function PricesProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Record<string, PriceCache>>({})
  const [rates, setRates] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const hasAutoRefreshed = useRef(false)

  const loadPrices = useCallback(async () => {
    try {
      const [priceMap, latestRates] = await Promise.all([
        fetchPrices(),
        fetchLatestRates(),
      ])
      setPrices(priceMap)
      setRates(latestRates)

      const timestamps = Object.values(priceMap)
        .map((p) => p.updated_at)
        .filter(Boolean)
      if (timestamps.length > 0) {
        timestamps.sort()
        setLastUpdated(timestamps[timestamps.length - 1])
      }
    } catch (err) {
      console.error("Failed to load prices:", err)
    }
  }, [])

  const refreshPrices = useCallback(async () => {
    setRefreshing(true)
    try {
      const { error } = await supabase.functions.invoke("fetch-prices")
      if (error) {
        console.error("Price refresh error:", error)
      }
      await loadPrices()
    } catch (err) {
      console.error("Failed to refresh prices:", err)
    } finally {
      setRefreshing(false)
    }
  }, [loadPrices])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      await loadPrices()
      if (!cancelled) setLoading(false)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [loadPrices])

  // Auto-refresh once if cached prices are stale. Skipped when there are no
  // prices yet (avoids hitting the edge function on a brand-new empty DB).
  useEffect(() => {
    if (loading || hasAutoRefreshed.current) return
    const hasPrices = Object.keys(prices).length > 0
    const shouldRefresh =
      hasPrices && (!lastUpdated || isStale(lastUpdated, STALE_THRESHOLD_MINUTES))
    if (shouldRefresh) {
      hasAutoRefreshed.current = true
      void refreshPrices()
    }
  }, [loading, lastUpdated, refreshPrices, prices])

  // Keys are price_ids now (the prices map is keyed by price_id). This list is
  // only used internally (no UI consumer surfaces it as a label), so keeping it
  // as price_id keys is fine; map back through assets to ticker if it ever
  // becomes user-facing.
  const staleAssets = Object.entries(prices)
    .filter(([, p]) => isStale(p.updated_at, STALE_THRESHOLD_MINUTES))
    .map(([priceId]) => priceId)

  return (
    <PricesContext.Provider
      value={{
        prices,
        rates,
        loading,
        refreshing,
        lastUpdated,
        refreshPrices,
        staleAssets,
      }}
    >
      {children}
    </PricesContext.Provider>
  )
}

export function usePricesContext(): PricesContextValue {
  const v = useContext(PricesContext)
  if (!v) {
    throw new Error("usePricesContext must be used inside PricesProvider")
  }
  return v
}
