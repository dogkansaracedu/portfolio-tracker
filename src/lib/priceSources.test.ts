import { describe, expect, it } from "vitest"
import type { AssetPriceSource } from "@/types/database"
import {
  buildSourceSave,
  hasSourceList,
  moveDraft,
  sourceHealth,
  toDrafts,
  validateNewSource,
  type SourceDraft,
} from "@/lib/priceSources"
import { PRICE_SOURCE_COPY } from "@/lib/constants/priceSources"

function stored(
  id: string,
  priority: number,
  over: Partial<AssetPriceSource> = {},
): AssetPriceSource {
  return {
    id,
    asset_id: "a1",
    priority,
    source: "yahoo",
    symbol: id.toUpperCase(),
    last_ok_at: null,
    last_error: null,
    last_error_at: null,
    created_at: "2026-11-17T00:00:00Z",
    ...over,
  }
}

const draft = (id: string, over: Partial<SourceDraft> = {}): SourceDraft => ({
  id,
  source: "yahoo",
  symbol: id,
  last_ok_at: null,
  last_error: null,
  last_error_at: null,
  isNew: false,
  ...over,
})

describe("toDrafts", () => {
  it("orders by priority and keeps health", () => {
    const rows = toDrafts([
      stored("b", 2),
      stored("a", 1, { last_ok_at: "2026-11-17T10:00:00Z" }),
    ])
    expect(rows.map((r) => r.id)).toEqual(["a", "b"])
    expect(rows[0].last_ok_at).toBe("2026-11-17T10:00:00Z")
    expect(rows.every((r) => !r.isNew)).toBe(true)
  })
})

describe("moveDraft", () => {
  const rows = [draft("a"), draft("b"), draft("c")]
  it("swaps with the neighbour", () => {
    expect(moveDraft(rows, 1, -1).map((r) => r.id)).toEqual(["b", "a", "c"])
    expect(moveDraft(rows, 1, 1).map((r) => r.id)).toEqual(["a", "c", "b"])
  })
  it("ignores moves past either end", () => {
    expect(moveDraft(rows, 0, -1)).toBe(rows)
    expect(moveDraft(rows, 2, 1)).toBe(rows)
  })
})

describe("validateNewSource", () => {
  const rows = [draft("x", { source: "paribu_crypto", symbol: "btc" })]
  it("trims the symbol", () => {
    expect(validateNewSource(rows, "yahoo", "  BTC-USD ")).toEqual({ symbol: "BTC-USD" })
  })
  it("rejects blank, too long and duplicate rows", () => {
    expect(validateNewSource(rows, "yahoo", "  ")).toEqual({
      error: PRICE_SOURCE_COPY.symbolRequired,
    })
    expect(validateNewSource(rows, "yahoo", "x".repeat(33))).toEqual({
      error: PRICE_SOURCE_COPY.symbolTooLong,
    })
    expect(validateNewSource(rows, "paribu_crypto", "BTC")).toEqual({
      error: PRICE_SOURCE_COPY.duplicate,
    })
  })
  it("allows the same symbol on another source", () => {
    expect(validateNewSource(rows, "paribu_us", "btc")).toEqual({ symbol: "btc" })
  })
})

describe("buildSourceSave", () => {
  it("deletes dropped rows and renumbers the rest 1..n in draft order", () => {
    const save = buildSourceSave(
      "a1",
      [stored("a", 1), stored("b", 2), stored("c", 3)],
      [draft("c"), draft("new", { isNew: true, source: "paribu_bist", symbol: "asels" }), draft("a")],
    )
    expect(save.deleteIds).toEqual(["b"])
    expect(save.upserts).toEqual([
      { id: "c", asset_id: "a1", priority: 1, source: "yahoo", symbol: "c" },
      { id: "new", asset_id: "a1", priority: 2, source: "paribu_bist", symbol: "asels" },
      { id: "a", asset_id: "a1", priority: 3, source: "yahoo", symbol: "a" },
    ])
  })
  it("an emptied list deletes everything and writes nothing", () => {
    expect(buildSourceSave("a1", [stored("a", 1)], [])).toEqual({
      deleteIds: ["a"],
      upserts: [],
    })
  })
})

describe("sourceHealth", () => {
  it("reports the newer of success and failure", () => {
    expect(
      sourceHealth({
        last_ok_at: "2026-11-17T10:00:00Z",
        last_error: "HTTP 404",
        last_error_at: "2026-11-17T11:00:00Z",
      }),
    ).toEqual({ tone: "error", at: "2026-11-17T11:00:00Z", message: "HTTP 404" })
    expect(
      sourceHealth({
        last_ok_at: "2026-11-17T12:00:00Z",
        last_error: "HTTP 404",
        last_error_at: "2026-11-17T11:00:00Z",
      }),
    ).toEqual({ tone: "ok", at: "2026-11-17T12:00:00Z" })
  })
  it("is none before the first run", () => {
    expect(sourceHealth({ last_ok_at: null, last_error: null, last_error_at: null })).toEqual({
      tone: "none",
    })
  })
})

describe("hasSourceList", () => {
  it("is true for Yahoo and TEFAS assets only", () => {
    expect(hasSourceList({ price_source: "yahoo" })).toBe(true)
    expect(hasSourceList({ price_source: "tefas" })).toBe(true)
    expect(hasSourceList({ price_source: "tcmb" })).toBe(false)
    expect(hasSourceList({ price_source: "manual" })).toBe(false)
  })
})
