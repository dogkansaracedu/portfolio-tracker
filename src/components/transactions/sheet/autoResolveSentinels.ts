import type { Asset } from "@/types/database"
import {
  createAsset,
  fetchAssets,
  resolveTickers,
  type UnresolvedReason,
} from "@/lib/queries/assets"
import { tickerFromSentinel } from "./sentinel"

/** Enough of the resolved asset to recover both its id and its native price
 *  currency (via `assetNativeCurrency`) at the call site. */
export interface ResolvedAsset {
  id: string
  category: string
  ticker: string
}

export interface AutoResolveResult {
  resolvedMap: Map<string, ResolvedAsset>
  unresolved: Array<{ sentinel: string; reason: UnresolvedReason }>
  createdAny: boolean
}

interface Args {
  userId: string
  sentinels: string[]
  assets: Asset[]
  refetchAssets: () => Promise<void>
}

function findExisting(assets: Asset[], ticker: string): Asset | undefined {
  const lower = ticker.toLowerCase()
  return assets.find((a) => a.ticker.toLowerCase() === lower)
}

function isDuplicateTickerError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("duplicate key") && msg.includes("ticker")
}

export async function autoResolveSentinels({
  userId,
  sentinels,
  assets,
  refetchAssets,
}: Args): Promise<AutoResolveResult> {
  const resolvedMap = new Map<string, ResolvedAsset>()
  const unresolved: Array<{ sentinel: string; reason: UnresolvedReason }> = []
  let createdAny = false

  const remaining: string[] = []
  for (const s of sentinels) {
    const t = tickerFromSentinel(s)
    const existing = findExisting(assets, t)
    if (existing) {
      resolvedMap.set(s, {
        id: existing.id,
        category: existing.category,
        ticker: existing.ticker,
      })
    } else {
      remaining.push(s)
    }
  }

  if (remaining.length === 0) {
    return { resolvedMap, unresolved, createdAny }
  }

  let result: Awaited<ReturnType<typeof resolveTickers>>
  try {
    const tickers = remaining.map(tickerFromSentinel)
    result = await resolveTickers(tickers)
  } catch {
    for (const s of remaining) {
      unresolved.push({ sentinel: s, reason: "http_error" })
    }
    return { resolvedMap, unresolved, createdAny }
  }

  const sentinelByLowerTicker = new Map<string, string>()
  for (const s of remaining) {
    sentinelByLowerTicker.set(tickerFromSentinel(s).toLowerCase(), s)
  }

  for (const r of result.resolved) {
    const sentinel = sentinelByLowerTicker.get(r.ticker.toLowerCase())
    if (!sentinel) continue
    try {
      const asset = await createAsset({
        user_id: userId,
        category: r.category,
        ticker: r.ticker,
        name: r.name,
        tags: [],
        price_source: r.price_source,
        is_currency: false,
        is_active: true,
      })
      resolvedMap.set(sentinel, {
        id: asset.id,
        category: r.category,
        ticker: r.ticker,
      })
      createdAny = true
    } catch (err) {
      // Race: another tab/session inserted the same ticker between
      // resolve and create. Refetch and look up the existing row.
      if (isDuplicateTickerError(err)) {
        try {
          const fresh = await fetchAssets()
          const existing = findExisting(fresh, r.ticker)
          if (existing) {
            resolvedMap.set(sentinel, {
              id: existing.id,
              category: existing.category,
              ticker: existing.ticker,
            })
            continue
          }
        } catch {
          // fall through
        }
        unresolved.push({ sentinel, reason: "create_failed" })
      } else {
        unresolved.push({ sentinel, reason: "create_failed" })
      }
    }
  }

  for (const u of result.unresolved) {
    const sentinel = sentinelByLowerTicker.get(u.ticker.toLowerCase())
    if (!sentinel) continue
    unresolved.push({ sentinel, reason: u.reason })
  }

  if (createdAny) {
    await refetchAssets()
  }

  return { resolvedMap, unresolved, createdAny }
}
