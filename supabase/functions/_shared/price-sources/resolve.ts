/**
 * Priority/fallback resolution over the injected fetchers. No IO of its own,
 * so it is unit-tested with fake fetchers (`resolve_test.ts`).
 *
 * Round n tries every still-unpriced key's n-th source. Within a round each
 * source family is asked once, for all its symbols together (that is what
 * makes Paribu's bulk lists pay off), and the families run concurrently. A
 * (source, symbol) answered in an earlier round is not asked again.
 */
import type { PriceSourceName, SourceFetcher, SourceQuote, SourceResult } from "./types.ts"

/** One `asset_price_sources` row. */
export interface SourceRow {
  id: string
  priority: number
  source: PriceSourceName
  symbol: string
}

/** A price_cache key to price and its sources, any order (sorted here). */
export interface PriceTarget {
  key: string
  sources: SourceRow[]
}

export interface Attempt {
  key: string
  row: SourceRow
  error: string
}

export interface Resolution<T> {
  /** key → the converted price + the row that produced it. */
  priced: Map<string, { value: T; row: SourceRow }>
  /** Every failed attempt, in order. A key may have failures and still be priced. */
  failures: Attempt[]
  /** Keys no source could price. */
  unpriced: string[]
}

/**
 * Walk each target's sources by priority until one yields a usable price.
 * `convert` turns a quote into the stored value, or returns an error string
 * (e.g. an unsupported currency) — that counts as the source failing.
 */
export async function resolvePrices<T>(
  targets: PriceTarget[],
  fetchers: Partial<Record<PriceSourceName, SourceFetcher>>,
  convert: (quote: SourceQuote, row: SourceRow) => T | string,
): Promise<Resolution<T>> {
  const chains = targets.map((t) => ({
    key: t.key,
    sources: [...t.sources].sort((a, b) => a.priority - b.priority),
  }))
  const priced = new Map<string, { value: T; row: SourceRow }>()
  const failures: Attempt[] = []
  const answered = new Map<string, SourceResult>() // `${source}\u0000${symbol}`
  const id = (row: SourceRow) => `${row.source}\u0000${row.symbol}`

  let pending = chains.filter((c) => c.sources.length > 0)
  for (let round = 0; pending.length > 0; round++) {
    const current = pending.filter((c) => round < c.sources.length)
    if (current.length === 0) break

    // Ask each source family once for the symbols it hasn't answered yet.
    const bySource = new Map<PriceSourceName, Set<string>>()
    for (const c of current) {
      const row = c.sources[round]
      if (answered.has(id(row))) continue
      const set = bySource.get(row.source) ?? new Set<string>()
      set.add(row.symbol)
      bySource.set(row.source, set)
    }
    await Promise.all(
      [...bySource].map(async ([source, symbols]) => {
        const fetcher = fetchers[source]
        const list = [...symbols]
        let results: Map<string, SourceResult>
        try {
          results = fetcher ? await fetcher(list) : new Map()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          results = new Map(list.map((s) => [s, { ok: false, error: msg } as SourceResult]))
        }
        for (const s of list) {
          answered.set(
            `${source}\u0000${s}`,
            results.get(s) ?? { ok: false, error: fetcher ? "no result" : "unknown source" },
          )
        }
      }),
    )

    for (const c of current) {
      const row = c.sources[round]
      const result = answered.get(id(row))!
      if (!result.ok) {
        failures.push({ key: c.key, row, error: result.error })
        continue
      }
      const value = convert(result.quote, row)
      if (typeof value === "string") failures.push({ key: c.key, row, error: value })
      else priced.set(c.key, { value, row })
    }
    pending = current.filter((c) => !priced.has(c.key))
  }

  const unpriced = chains.filter((c) => !priced.has(c.key)).map((c) => c.key)
  return { priced, failures, unpriced }
}
