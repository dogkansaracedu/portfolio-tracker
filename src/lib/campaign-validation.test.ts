import { describe, expect, it } from "vitest"
import {
  APR_KINDS,
  CAMPAIGN_PROGRAM_TYPES,
  PLATFORM_WATCH_LIST,
  validateCampaignBatch,
} from "../../supabase/functions/_shared/campaigns.ts"

// Tests for the campaign ingestion contract. The module lives under
// `supabase/functions/_shared/` (Deno loads it too), but the test sits in
// `src/` because Vitest only includes `src/**/*.test.ts` — and importing it
// here also puts it under `tsc -b`, so the build gate typechecks it.

/** A row that passes every rule; each test overrides just the field under test. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    asset_ticker: "ETH",
    platform: "Binance (global)",
    program_type: "flexible_earn",
    apr: 3.8,
    apr_kind: "variable",
    source_url: "https://www.binance.com/en/earn",
    fetched_at: "2026-08-17",
    ...overrides,
  }
}

function batch(rows: unknown[]) {
  return validateCampaignBatch({ producer: "ingest", campaigns: rows })
}

/** The single reject reason for a one-bad-row batch. */
function rejectReason(bad: unknown): string {
  const { valid, rejected } = batch([bad])
  expect(valid).toHaveLength(0)
  expect(rejected).toHaveLength(1)
  return rejected[0].reason
}

describe("validateCampaignBatch — happy path", () => {
  it("accepts a complete row and passes every field through", () => {
    const { valid, rejected } = batch([
      row({
        reward_description: "Boosted week",
        lock_days: 30,
        min_amount: 0.1,
        max_amount: 100,
        amount_currency: "eth",
        conditions: "Not available to Turkish residents",
        deadline: "2026-09-30",
        is_stablecoin: false,
      }),
    ])

    expect(rejected).toEqual([])
    expect(valid).toHaveLength(1)
    expect(valid[0]).toEqual({
      asset_ticker: "ETH",
      platform: "Binance (global)",
      program_type: "flexible_earn",
      apr: 3.8,
      apr_kind: "variable",
      reward_description: "Boosted week",
      lock_days: 30,
      min_amount: 0.1,
      max_amount: 100,
      amount_currency: "ETH",
      conditions: "Not available to Turkish residents",
      deadline: "2026-09-30",
      is_stablecoin: false,
      source_url: "https://www.binance.com/en/earn",
      fetched_at: "2026-08-17",
    })
  })

  it("accepts a rate-less row carried by its reward description", () => {
    const { valid } = batch([
      row({
        apr: null,
        apr_kind: null,
        reward_description: "Hold >= 0.1 ETH through September to receive N tokens",
      }),
    ])
    expect(valid).toHaveLength(1)
    expect(valid[0].apr).toBeNull()
    expect(valid[0].apr_kind).toBeNull()
  })

  it("defaults the optional fields rather than dropping the row", () => {
    const { valid } = batch([row()])
    expect(valid[0].reward_description).toBeNull()
    expect(valid[0].lock_days).toBeNull()
    expect(valid[0].deadline).toBeNull()
    expect(valid[0].is_stablecoin).toBe(false)
  })

  it("accepts every declared program type and apr kind", () => {
    for (const programType of CAMPAIGN_PROGRAM_TYPES) {
      expect(batch([row({ program_type: programType })]).valid).toHaveLength(1)
    }
    for (const kind of APR_KINDS) {
      expect(batch([row({ apr_kind: kind })]).valid).toHaveLength(1)
    }
  })
})

describe("validateCampaignBatch — per-row rejects", () => {
  it("rejects a missing ticker, platform, program type or source URL", () => {
    expect(rejectReason(row({ asset_ticker: "  " }))).toContain("asset_ticker")
    expect(rejectReason(row({ platform: undefined }))).toContain("platform")
    expect(rejectReason(row({ program_type: null }))).toContain("program_type")
    expect(rejectReason(row({ source_url: "" }))).toContain("source_url")
  })

  it("rejects aggregate pseudo-tickers, accepts real symbols", () => {
    expect(rejectReason(row({ asset_ticker: "STABLECOINS (UNSPECIFIED)" }))).toContain(
      "single specific symbol",
    )
    expect(rejectReason(row({ asset_ticker: "GOLD TOKENS" }))).toContain("single specific symbol")
    expect(batch([row({ asset_ticker: "USD1" })]).valid).toHaveLength(1)
    expect(batch([row({ asset_ticker: "jitosol" })]).valid).toHaveLength(1)
  })

  it("rejects an unrecognized program type", () => {
    expect(rejectReason(row({ program_type: "yield_farming" }))).toContain(
      "unknown program_type",
    )
  })

  it("rejects a source URL that is not http(s)", () => {
    expect(rejectReason(row({ source_url: "binance.com/earn" }))).toContain("http(s)")
    expect(rejectReason(row({ source_url: "ftp://binance.com" }))).toContain("http(s)")
  })

  it("rejects a rate outside the (0, 1000] sanity bounds", () => {
    expect(rejectReason(row({ apr: 0 }))).toContain("out of bounds")
    expect(rejectReason(row({ apr: -5 }))).toContain("out of bounds")
    expect(rejectReason(row({ apr: 1000.01 }))).toContain("out of bounds")
    expect(batch([row({ apr: 1000 })]).valid).toHaveLength(1)
  })

  it("rejects a rate without a valid kind", () => {
    expect(rejectReason(row({ apr_kind: undefined }))).toContain("apr_kind")
    expect(rejectReason(row({ apr_kind: "guaranteed" }))).toContain("apr_kind")
  })

  it("rejects a row with neither a rate nor a reward description", () => {
    expect(rejectReason(row({ apr: null, apr_kind: null }))).toContain(
      "neither apr nor reward_description",
    )
  })

  it("rejects malformed dates", () => {
    expect(rejectReason(row({ fetched_at: "17/08/2026" }))).toContain("fetched_at")
    expect(rejectReason(row({ fetched_at: undefined }))).toContain("fetched_at")
    expect(rejectReason(row({ deadline: "2026-13-01" }))).toContain("deadline")
    expect(rejectReason(row({ deadline: "2026-02-31" }))).toContain("deadline")
  })

  it("rejects a non-object row", () => {
    expect(rejectReason("not a campaign")).toContain("not an object")
  })

  it("keeps the good rows of a partly-bad batch and reports the bad ones", () => {
    const { valid, rejected } = batch([
      row(),
      row({ program_type: "nonsense" }),
      row({ asset_ticker: "sol", platform: "Jito" }),
    ])
    expect(valid.map((c) => c.asset_ticker)).toEqual(["ETH", "SOL"])
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toContain("unknown program_type")
  })
})

describe("validateCampaignBatch — normalization", () => {
  it("upper-cases and trims the ticker, and trims the platform", () => {
    const { valid } = batch([row({ asset_ticker: "  btc ", platform: "  Paribu  " })])
    expect(valid[0].asset_ticker).toBe("BTC")
    expect(valid[0].platform).toBe("Paribu")
  })

  it("rounds the rate to 4 decimal places", () => {
    expect(batch([row({ apr: 3.123456789 })]).valid[0].apr).toBe(3.1235)
    expect(batch([row({ apr: 12.5 })]).valid[0].apr).toBe(12.5)
  })

  it("accepts the string number forms a model emits", () => {
    const { valid } = batch([row({ apr: "4.25%", min_amount: "100" })])
    expect(valid[0].apr).toBe(4.25)
    expect(valid[0].min_amount).toBe(100)
  })
})

describe("validateCampaignBatch — batch level", () => {
  it("returns zero valid rows when every row is bad", () => {
    const { valid, rejected } = batch([row({ apr: 5000 }), row({ source_url: "nope" })])
    expect(valid).toHaveLength(0)
    expect(rejected).toHaveLength(2)
  })

  it("returns zero valid rows for an empty campaigns array", () => {
    expect(batch([]).valid).toHaveLength(0)
  })

  it("treats a malformed top-level payload as zero valid rows", () => {
    for (const payload of [null, undefined, "a string", 42, [], { producer: "ingest" }]) {
      const { valid, rejected } = validateCampaignBatch(payload)
      expect(valid).toHaveLength(0)
      expect(rejected).toHaveLength(1)
    }
  })
})

describe("PLATFORM_WATCH_LIST", () => {
  it("carries all 16 entries, each with a ground URL and a flag", () => {
    expect(PLATFORM_WATCH_LIST).toHaveLength(16)
    for (const entry of PLATFORM_WATCH_LIST) {
      expect(entry.platform.length).toBeGreaterThan(0)
      expect(entry.groundUrl.length).toBeGreaterThan(0)
      expect(entry.flag.length).toBeGreaterThan(0)
    }
  })

  it("includes the regulator meta-entry — SPK news invalidates TR rows", () => {
    expect(PLATFORM_WATCH_LIST.some((p) => p.kind === "regulator")).toBe(true)
  })
})
