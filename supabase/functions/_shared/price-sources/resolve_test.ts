// deno test supabase/functions/_shared/price-sources/
import { deepStrictEqual as assertEquals } from "node:assert/strict"
import { type PriceTarget, resolvePrices, type SourceRow } from "./resolve.ts"
import type { PriceSourceName, SourceFetcher, SourceQuote } from "./types.ts"

const row = (id: string, priority: number, source: PriceSourceName, symbol: string): SourceRow => ({
  id,
  priority,
  source,
  symbol,
})

/** A fake fetcher answering from a table; records each call's symbols. */
function fake(table: Record<string, number | string>, calls: string[][]): SourceFetcher {
  return (symbols) => {
    calls.push(symbols)
    return Promise.resolve(
      new Map(
        symbols.map((s) => {
          const v = table[s]
          return [
            s,
            typeof v === "number"
              ? { ok: true as const, quote: { price: v, currency: "TRY" } }
              : { ok: false as const, error: v ?? "not listed" },
          ]
        }),
      ),
    )
  }
}

const identity = (q: SourceQuote) => q.price

Deno.test("first source by priority wins; later ones are not asked", async () => {
  const paribu: string[][] = []
  const yahoo: string[][] = []
  const targets: PriceTarget[] = [
    { key: "BTC-USD", sources: [row("y", 2, "yahoo", "BTC-USD"), row("p", 1, "paribu_crypto", "btc")] },
  ]
  const r = await resolvePrices(
    targets,
    { paribu_crypto: fake({ btc: 100 }, paribu), yahoo: fake({ "BTC-USD": 1 }, yahoo) },
    identity,
  )
  assertEquals(r.priced.get("BTC-USD"), { value: 100, row: targets[0].sources[1] })
  assertEquals(r.failures, [])
  assertEquals(yahoo.length, 0)
})

Deno.test("failure falls back to the next source and is recorded", async () => {
  const targets: PriceTarget[] = [
    { key: "PAXG-USD", sources: [row("p", 1, "paribu_crypto", "paxg"), row("y", 2, "yahoo", "PAXG-USD")] },
  ]
  const r = await resolvePrices(
    targets,
    { paribu_crypto: fake({}, []), yahoo: fake({ "PAXG-USD": 7 }, []) },
    identity,
  )
  assertEquals(r.priced.get("PAXG-USD")?.value, 7)
  assertEquals(r.priced.get("PAXG-USD")?.row.id, "y")
  assertEquals(r.failures, [{ key: "PAXG-USD", row: targets[0].sources[0], error: "not listed" }])
  assertEquals(r.unpriced, [])
})

Deno.test("one call per source per round, with every symbol of that round", async () => {
  const paribu: string[][] = []
  const yahoo: string[][] = []
  const targets: PriceTarget[] = [
    { key: "A", sources: [row("1", 1, "paribu_us", "a"), row("2", 2, "yahoo", "A")] },
    { key: "B", sources: [row("3", 1, "paribu_us", "b"), row("4", 2, "yahoo", "B")] },
    { key: "C", sources: [row("5", 1, "yahoo", "C")] },
  ]
  const r = await resolvePrices(
    targets,
    { paribu_us: fake({ a: 1 }, paribu), yahoo: fake({ B: 2, C: 3 }, yahoo) },
    identity,
  )
  assertEquals(paribu, [["a", "b"]])
  assertEquals(yahoo, [["C"], ["B"]])
  assertEquals([...r.priced.keys()].sort(), ["A", "B", "C"])
})

Deno.test("all sources failing leaves the key unpriced; convert errors count as failures", async () => {
  const targets: PriceTarget[] = [
    { key: "X", sources: [row("1", 1, "yahoo", "X"), row("2", 2, "tefas", "X")] },
    { key: "E", sources: [] },
  ]
  const r = await resolvePrices(
    targets,
    { yahoo: fake({ X: 5 }, []), tefas: fake({ X: "HTTP 500" }, []) },
    (q, src) => (src.source === "yahoo" ? "unsupported currency GBp" : q.price),
  )
  assertEquals(r.priced.size, 0)
  assertEquals(r.unpriced, ["X", "E"])
  assertEquals(
    r.failures.map((f) => [f.row.id, f.error]),
    [["1", "unsupported currency GBp"], ["2", "HTTP 500"]],
  )
})

Deno.test("missing fetcher and a throwing fetcher fail softly", async () => {
  const targets: PriceTarget[] = [
    { key: "K", sources: [row("1", 1, "paribu_bist", "k"), row("2", 2, "tefas", "K"), row("3", 3, "yahoo", "K")] },
  ]
  const r = await resolvePrices(
    targets,
    { tefas: () => Promise.reject(new Error("boom")), yahoo: fake({ K: 9 }, []) },
    identity,
  )
  assertEquals(r.priced.get("K")?.value, 9)
  assertEquals(r.failures.map((f) => f.error), ["unknown source", "boom"])
})
