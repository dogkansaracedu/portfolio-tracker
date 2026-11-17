/**
 * Paribu public web endpoints (no auth): crypto in TL, US stocks in USD, BIST
 * stocks in TL. The parse functions are pure and fixture-tested
 * (`paribu_test.ts`); the fetchers never throw.
 *
 * - crypto: one bulk list of every TL pair.
 * - us / bist: the bulk list only covers the most popular ~300 (pages 1–3 of
 *   100), so symbols not in it are asked one by one (≤ 4 at a time).
 */
import { errorMessage, fail, ok, type SourceFetcher, type SourceResult } from "./types.ts"

const BASE = "https://web.paribu.com"
const TIMEOUT_MS = 8_000
const STOCK_PAGE_SIZE = 100
const STOCK_MAX_PAGES = 3
const SINGLE_CONCURRENCY = 4

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "application/json",
}

export type ParibuMarket = "crypto" | "us" | "bist"

/** The currency each market's prices come in (crypto is asked for TL pairs). */
const MARKET_CURRENCY: Record<ParibuMarket, string> = { crypto: "TRY", us: "USD", bist: "TRY" }

const PAIR_CURRENCY: Record<string, string> = { "₺": "TRY", TL: "TRY", TRY: "TRY", $: "USD", USD: "USD" }

export const CRYPTO_LIST_URL =
  `${BASE}/v2/markets/crypto/assets?category=all&pairSymbol=TL&includeDefi=false&page=1&pageSize=300`

export const stockListUrl = (market: "us" | "bist", page: number) =>
  `${BASE}/v1/markets/${market}/assets?page=${page}&pageSize=${STOCK_PAGE_SIZE}&category=all&sort=popular`

export const singleUrl = (market: "us" | "bist", id: string) =>
  `${BASE}/v1/markets/public/assets/${encodeURIComponent(id)}?marketType=${market}&pairSymbol=${market === "us" ? "USD" : "TL"}`

interface ParibuAssetJson {
  id?: unknown
  price?: unknown
  pairSymbol?: unknown
}

/** Symbols are matched case-insensitively (Paribu ids are lower case). */
export const normalizeSymbol = (s: string) => s.trim().toLowerCase()

/** One listed asset → a quote, or null when the price is missing / not
 *  positive, or the pair is in a currency the market shouldn't have. */
export function parseParibuAsset(
  a: ParibuAssetJson,
  market: ParibuMarket,
): { id: string; price: number; currency: string } | null {
  if (typeof a.id !== "string" || !a.id) return null
  const price = Number(a.price)
  if (a.price == null || a.price === "" || !Number.isFinite(price) || price <= 0) return null
  const expected = MARKET_CURRENCY[market]
  const pair = typeof a.pairSymbol === "string" ? PAIR_CURRENCY[a.pairSymbol] : undefined
  if (pair && pair !== expected) return null
  return { id: normalizeSymbol(a.id), price, currency: expected }
}

/** A bulk list page → quotes by id + whether another page exists. */
export function parseParibuList(
  json: unknown,
  market: ParibuMarket,
): { quotes: Map<string, { price: number; currency: string }>; hasMore: boolean } {
  const payload = (json as { payload?: { data?: unknown; hasMore?: unknown } } | null)?.payload
  const quotes = new Map<string, { price: number; currency: string }>()
  const data = Array.isArray(payload?.data) ? payload.data : []
  for (const raw of data) {
    const q = parseParibuAsset(raw as ParibuAssetJson, market)
    if (q) quotes.set(q.id, { price: q.price, currency: q.currency })
  }
  return { quotes, hasMore: payload?.hasMore === true }
}

/** The single-asset page → a quote, or null. */
export function parseParibuSingle(
  json: unknown,
  market: "us" | "bist",
): { price: number; currency: string } | null {
  const asset = (json as { payload?: { asset?: unknown } } | null)?.payload?.asset
  if (!asset || typeof asset !== "object") return null
  const q = parseParibuAsset(asset as ParibuAssetJson, market)
  return q ? { price: q.price, currency: q.currency } : null
}

async function getJson(url: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    await res.body?.cancel()
    return { status: res.status, json: null }
  }
  return { status: res.status, json: await res.json() }
}

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** Crypto: one bulk TL list; a symbol not in it is "not listed". The list is
 *  fetched once per fetcher (= once per fetch-prices run). */
export function paribuCryptoFetcher(): SourceFetcher {
  let list: Promise<Map<string, { price: number; currency: string }> | string> | null = null
  const load = () =>
    (list ??= getJson(CRYPTO_LIST_URL)
      .then(({ status, json }) => (json ? parseParibuList(json, "crypto").quotes : `HTTP ${status}`))
      .catch((err) => `list request failed: ${errorMessage(err)}`))

  return async (symbols) => {
    const out = new Map<string, SourceResult>()
    const quotes = await load()
    for (const s of symbols) {
      if (typeof quotes === "string") out.set(s, fail(quotes))
      else {
        const q = quotes.get(normalizeSymbol(s))
        out.set(s, q ? ok(q) : fail("not listed"))
      }
    }
    return out
  }
}

/** US / BIST: popular pages 1–3 in bulk (stop when `hasMore` is false), then
 *  the single-asset endpoint for what the bulk list didn't have. A failed bulk
 *  page just sends more symbols down the single path. */
export function paribuStockFetcher(market: "us" | "bist"): SourceFetcher {
  let list: Promise<Map<string, { price: number; currency: string }>> | null = null
  const load = () =>
    (list ??= (async () => {
      const quotes = new Map<string, { price: number; currency: string }>()
      for (let page = 1; page <= STOCK_MAX_PAGES; page++) {
        try {
          const { json } = await getJson(stockListUrl(market, page))
          if (!json) break
          const parsed = parseParibuList(json, market)
          for (const [id, q] of parsed.quotes) quotes.set(id, q)
          if (!parsed.hasMore) break
        } catch {
          break
        }
      }
      return quotes
    })())

  return async (symbols) => {
    const out = new Map<string, SourceResult>()
    const bulk = await load()
    const missing: string[] = []
    for (const s of symbols) {
      const q = bulk.get(normalizeSymbol(s))
      if (q) out.set(s, ok(q))
      else missing.push(s)
    }
    await mapLimit(missing, SINGLE_CONCURRENCY, async (s) => {
      try {
        const { status, json } = await getJson(singleUrl(market, normalizeSymbol(s)))
        if (!json) {
          out.set(s, fail(status === 404 ? "not listed" : `HTTP ${status}`))
          return
        }
        const q = parseParibuSingle(json, market)
        out.set(s, q ? ok(q) : fail("no price in response"))
      } catch (err) {
        out.set(s, fail(`request failed: ${errorMessage(err)}`))
      }
    })
    return out
  }
}
