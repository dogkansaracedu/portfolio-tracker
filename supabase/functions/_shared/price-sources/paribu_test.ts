// deno test supabase/functions/_shared/price-sources/
// Fixtures are trimmed real responses from the public endpoints (2026-11-17).
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert/strict"
import cryptoList from "./fixtures/paribu-crypto.json" with { type: "json" }
import usPage from "./fixtures/paribu-us-page.json" with { type: "json" }
import bistPage from "./fixtures/paribu-bist-page.json" with { type: "json" }
import singleUs from "./fixtures/paribu-single-us.json" with { type: "json" }
import singleMissing from "./fixtures/paribu-single-missing.json" with { type: "json" }
import {
  normalizeSymbol,
  paribuCryptoFetcher,
  paribuStockFetcher,
  parseParibuAsset,
  parseParibuList,
  parseParibuSingle,
  singleUrl,
  stockListUrl,
} from "./paribu.ts"

Deno.test("crypto list: TL prices keyed by lower-case id, last page", () => {
  const { quotes, hasMore } = parseParibuList(cryptoList, "crypto")
  assertEquals(hasMore, false)
  assertEquals(quotes.get("btc"), { price: 3215963, currency: "TRY" })
  assertEquals(quotes.get("usdt"), { price: 50.37, currency: "TRY" })
  assertEquals(quotes.size, 5)
})

Deno.test("us page: USD prices, more pages", () => {
  const { quotes, hasMore } = parseParibuList(usPage, "us")
  assertEquals(hasMore, true)
  assertEquals(quotes.get("nvda"), { price: 154.504, currency: "USD" })
})

Deno.test("bist page: TL prices", () => {
  const { quotes } = parseParibuList(bistPage, "bist")
  assertEquals(quotes.get("asels"), { price: 341.5, currency: "TRY" })
})

Deno.test("single asset: dotted id, USD", () => {
  assertEquals(parseParibuSingle(singleUs, "us"), { price: 591.451, currency: "USD" })
  assertEquals(parseParibuSingle(singleMissing, "bist"), null)
})

Deno.test("asset: missing / zero / garbage price and wrong pair are rejected", () => {
  assertEquals(parseParibuAsset({ id: "x", price: "0" }, "crypto"), null)
  assertEquals(parseParibuAsset({ id: "x", price: "" }, "crypto"), null)
  assertEquals(parseParibuAsset({ id: "x", price: "abc" }, "crypto"), null)
  assertEquals(parseParibuAsset({ id: "x" }, "crypto"), null)
  assertEquals(parseParibuAsset({ price: "1" }, "crypto"), null)
  assertEquals(parseParibuAsset({ id: "x", price: "1", pairSymbol: "$" }, "bist"), null)
  assertEquals(parseParibuAsset({ id: "X", price: "1.5" }, "us"), { id: "x", price: 1.5, currency: "USD" })
})

Deno.test("garbage payloads parse to nothing", () => {
  assertEquals(parseParibuList(null, "crypto").quotes.size, 0)
  assertEquals(parseParibuList({ payload: { data: "nope" } }, "us").quotes.size, 0)
  assertEquals(parseParibuSingle({ payload: null }, "us"), null)
})

Deno.test("urls + symbol normalization", () => {
  assertEquals(normalizeSymbol(" BRK.B "), "brk.b")
  assertEquals(
    singleUrl("us", "brk.b"),
    "https://web.paribu.com/v1/markets/public/assets/brk.b?marketType=us&pairSymbol=USD",
  )
  assertEquals(
    stockListUrl("bist", 2),
    "https://web.paribu.com/v1/markets/bist/assets?page=2&pageSize=100&category=all&sort=popular",
  )
})

// ── fetchers with a stubbed global fetch ───────────────────────────────

function withFetch(handler: (url: string) => Response, fn: (calls: string[]) => Promise<void>) {
  return async () => {
    const original = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      calls.push(url)
      return Promise.resolve(handler(url))
    }) as typeof fetch
    try {
      await fn(calls)
    } finally {
      globalThis.fetch = original
    }
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

Deno.test(
  "crypto fetcher: one list request per run, case-insensitive, unlisted fails",
  withFetch(() => json(cryptoList), async (calls) => {
    const f = paribuCryptoFetcher()
    const a = await f(["BTC", "nope"])
    const b = await f(["eth"])
    assertEquals(calls.length, 1)
    assertEquals(a.get("BTC"), { ok: true, quote: { price: 3215963, currency: "TRY" } })
    assertEquals(a.get("nope"), { ok: false, error: "not listed" })
    assert(b.get("eth")?.ok)
  }),
)

Deno.test(
  "crypto fetcher: list HTTP error fails every symbol",
  withFetch(() => json({}, 503), async () => {
    const r = await paribuCryptoFetcher()(["btc"])
    assertEquals(r.get("btc"), { ok: false, error: "HTTP 503" })
  }),
)

Deno.test(
  "stock fetcher: bulk pages until hasMore=false, singles for the rest, 404 = not listed",
  withFetch((url) => {
    if (url.includes("/v1/markets/us/assets?page=1")) return json(usPage)
    if (url.includes("/v1/markets/us/assets?page=2")) {
      return json({ payload: { data: [{ id: "zzz", price: "2", pairSymbol: "$" }], hasMore: false } })
    }
    if (url.includes("/public/assets/brk.b")) return json(singleUs)
    return json(singleMissing, 404)
  }, async (calls) => {
    const r = await paribuStockFetcher("us")(["NVDA", "zzz", "BRK.B", "gone"])
    assertEquals(r.get("NVDA"), { ok: true, quote: { price: 154.504, currency: "USD" } })
    assertEquals(r.get("zzz"), { ok: true, quote: { price: 2, currency: "USD" } })
    assertEquals(r.get("BRK.B"), { ok: true, quote: { price: 591.451, currency: "USD" } })
    assertEquals(r.get("gone"), { ok: false, error: "not listed" })
    assertEquals(calls.filter((u) => u.includes("/markets/us/assets")).length, 2)
    assertEquals(calls.filter((u) => u.includes("/public/assets/")).length, 2)
  }),
)

Deno.test(
  "stock fetcher: never more than 3 bulk pages",
  withFetch((url) => {
    if (url.includes("/markets/bist/assets")) return json(bistPage) // hasMore: true forever
    return json(singleMissing, 404)
  }, async (calls) => {
    await paribuStockFetcher("bist")(["asels"])
    assertEquals(calls.filter((u) => u.includes("/markets/bist/assets")).length, 3)
  }),
)
