import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { PriceCache, ExchangeRate } from "@/types/database"
import { fetchPrices } from "@/lib/queries/prices"
import { fetchLatestRates } from "@/lib/queries/exchangeRates"
import { isStale, priceMapsEqual, ratesEqual } from "@/lib/prices"
import { PRICE_POLL } from "@/lib/config"
import { useAuth } from "@/hooks/useAuth"
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
  const { user } = useAuth()
  const [prices, setPrices] = useState<Record<string, PriceCache>>({})
  const [rates, setRates] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const loadPrices = useCallback(async () => {
    try {
      const [priceMap, latestRates] = await Promise.all([
        fetchPrices(),
        fetchLatestRates(),
      ])
      // The poll re-reads the cache every `readMs`; most reads return the same
      // rows. Bail out of the setState when the data is value-identical so an
      // unchanged re-read doesn't churn a new object reference through every
      // consumer (which rebuilds the portfolio memo chain and flickers the
      // table). Functional updates keep the old reference on a no-op change.
      setPrices((prev) => (priceMapsEqual(prev, priceMap) ? prev : priceMap))
      setRates((prev) => (ratesEqual(prev, latestRates) ? prev : latestRates))

      const timestamps = Object.values(priceMap)
        .map((p) => p.updated_at)
        .filter(Boolean)
      if (timestamps.length > 0) {
        timestamps.sort()
        const newest = timestamps[timestamps.length - 1]
        setLastUpdated((prev) => (prev === newest ? prev : newest))
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

  // Background refresh for the auto-poll: pings `fetch-prices` (which decides
  // per-asset what's actually due) then re-reads the cache. Unlike
  // `refreshPrices` it doesn't toggle `refreshing`, so the manual-refresh
  // spinner doesn't blink every cycle.
  const backgroundRefresh = useCallback(async () => {
    try {
      await supabase.functions.invoke("fetch-prices")
      await loadPrices()
    } catch (err) {
      console.error("Background price refresh failed:", err)
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

  // Live polling. While a tab is visible and a user is signed in:
  //   - re-read the cache every `readMs` (cheap SELECT) so figures stay current
  //   - ping `fetch-prices` every `triggerMs`; the function self-throttles per
  //     asset, so most pings cost nothing upstream
  // Both pause when the tab is hidden, and we refresh immediately on regaining
  // focus (and once on mount), so a backgrounded or logged-out app never burns
  // Supabase or Yahoo calls. This replaces the old one-shot stale-refresh.
  useEffect(() => {
    if (!user) return
    const isVisible = () => document.visibilityState === "visible"

    const readId = setInterval(() => {
      if (isVisible()) void loadPrices()
    }, PRICE_POLL.readMs)

    const triggerId = setInterval(() => {
      if (isVisible()) void backgroundRefresh()
    }, PRICE_POLL.triggerMs)

    const onVisibility = () => {
      if (isVisible()) void backgroundRefresh()
    }
    document.addEventListener("visibilitychange", onVisibility)
    if (isVisible()) void backgroundRefresh()

    return () => {
      clearInterval(readId)
      clearInterval(triggerId)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [user, loadPrices, backgroundRefresh])

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
