import { useState, useEffect, useCallback, useRef } from "react"
import type { PriceCache, ExchangeRate } from "@/types/database"
import { fetchPrices } from "@/lib/queries/prices"
import { fetchLatestRates } from "@/lib/queries/exchangeRates"
import { isStale } from "@/lib/prices"
import { supabase } from "@/lib/supabase"

const STALE_THRESHOLD_MINUTES = 30

interface UsePricesReturn {
  prices: Record<string, PriceCache>
  rates: ExchangeRate | null
  loading: boolean
  refreshing: boolean
  lastUpdated: string | null
  refreshPrices: () => Promise<void>
  staleAssets: string[]
}

export function usePrices(): UsePricesReturn {
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

      // Determine the most recent update timestamp across all prices
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
      // Reload from cache after edge function completes
      await loadPrices()
    } catch (err) {
      console.error("Failed to refresh prices:", err)
    } finally {
      setRefreshing(false)
    }
  }, [loadPrices])

  // Load prices on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      await loadPrices()
      if (!cancelled) {
        setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [loadPrices])

  // Auto-refresh if stale (runs once after initial load)
  useEffect(() => {
    if (loading || hasAutoRefreshed.current) return

    const shouldRefresh =
      !lastUpdated || isStale(lastUpdated, STALE_THRESHOLD_MINUTES)

    if (shouldRefresh) {
      hasAutoRefreshed.current = true
      refreshPrices()
    }
  }, [loading, lastUpdated, refreshPrices])

  // Compute stale asset tickers
  const staleAssets = Object.entries(prices)
    .filter(([, p]) => isStale(p.updated_at, STALE_THRESHOLD_MINUTES))
    .map(([ticker]) => ticker)

  return {
    prices,
    rates,
    loading,
    refreshing,
    lastUpdated,
    refreshPrices,
    staleAssets,
  }
}
