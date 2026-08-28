import { describe, expect, it } from "vitest"
import {
  CAMPAIGN_MIN_APR_PCT,
  PLATFORM_WATCH_LIST,
  RUN_SUMMARY_MAX_CHARS,
  canonicalPlatformName,
  clampRunSummary,
  consolidateCampaigns,
  type CampaignInput,
} from "../../supabase/functions/_shared/campaigns.ts"

// Tests for the consolidation half of the campaign ingestion contract (same
// cross-boundary pattern as campaign-validation.test.ts): tier ladders merge
// into one row, standing base rates fall below the quality floor, and platform
// names snap to the watch list's short names so groups actually group.

/** A validated row (consolidation runs after validateCampaignBatch); each test
 *  overrides just the fields under test. */
function row(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    asset_ticker: "AXS",
    platform: "Icrypex",
    program_type: "locked_earn",
    apr: 4.24,
    apr_kind: "fixed",
    reward_description: null,
    lock_days: 60,
    min_amount: 10,
    max_amount: 1500,
    amount_currency: "AXS",
    conditions: null,
    deadline: null,
    is_stablecoin: false,
    source_url: "https://www.icrypex.com/en/earn",
    fetched_at: "2026-08-28",
    ...overrides,
  }
}

describe("canonicalPlatformName", () => {
  it("gives every watch-list entry a short name", () => {
    for (const entry of PLATFORM_WATCH_LIST) {
      expect(entry.shortName.length, entry.platform).toBeGreaterThan(0)
      expect(entry.shortName).not.toContain("—")
    }
  })

  it("maps the bare brand to the global entity", () => {
    expect(canonicalPlatformName("Binance")).toBe("Binance (global)")
    expect(canonicalPlatformName("OKX")).toBe("OKX (global)")
  })

  it("keeps TR entities distinct from their global sibling", () => {
    expect(canonicalPlatformName("Binance TR")).toBe("Binance TR")
    expect(canonicalPlatformName("OKX TR")).toBe("OKX TR")
  })

  it("matches case-insensitively and through the long watch-list name", () => {
    expect(canonicalPlatformName("binance (global)")).toBe("Binance (global)")
    expect(
      canonicalPlatformName("Binance (global) — Launchpool / HODLer Airdrops / Megadrop"),
    ).toBe("Binance (global)")
    expect(canonicalPlatformName("OKX Web3 Wallet Earn")).toBe("OKX Web3 Earn")
  })

  it("passes unknown platforms through trimmed", () => {
    expect(canonicalPlatformName("  SomeNewExchange  ")).toBe("SomeNewExchange")
  })
})

describe("consolidateCampaigns — tier merge", () => {
  const tiers = [
    row({ apr: 2.13, lock_days: 30 }),
    row({ apr: 4.24, lock_days: 60 }),
    row({ apr: 6.12, lock_days: 90 }),
    row({ apr: 8.13, lock_days: 120, min_amount: 25, source_url: "https://www.icrypex.com/en/earn/axs-120" }),
  ]

  it("collapses a lock-tier ladder into one 'up to' row keeping the top tier's fields", () => {
    const { campaigns, merged } = consolidateCampaigns(tiers)

    expect(campaigns).toHaveLength(1)
    expect(merged).toBe(3)
    const top = campaigns[0]
    expect(top.apr).toBe(8.13)
    expect(top.apr_kind).toBe("up_to")
    expect(top.lock_days).toBe(120)
    expect(top.min_amount).toBe(25)
    expect(top.source_url).toBe("https://www.icrypex.com/en/earn/axs-120")
  })

  it("writes the full tier ladder into conditions, sorted by lock", () => {
    const { campaigns } = consolidateCampaigns(tiers)
    expect(campaigns[0].conditions).toContain("30d 2.13% / 60d 4.24% / 90d 6.12% / 120d 8.13%")
  })

  it("labels a no-lock tier as flexible in the ladder and keeps existing conditions", () => {
    const { campaigns } = consolidateCampaigns([
      row({ apr: 0.98, lock_days: null, program_type: "flexible_earn" }),
      row({ apr: 6.45, lock_days: 90, program_type: "flexible_earn", conditions: "Min 10 AXS" }),
    ])
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].conditions).toContain("Min 10 AXS")
    expect(campaigns[0].conditions).toContain("flex 0.98% / 90d 6.45%")
  })

  it("groups across drifted platform spellings", () => {
    const { campaigns } = consolidateCampaigns([
      row({ platform: "Binance", asset_ticker: "ETH", apr: 2 }),
      row({ platform: "Binance (global)", asset_ticker: "ETH", apr: 3, lock_days: 90 }),
    ])
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].platform).toBe("Binance (global)")
    expect(campaigns[0].apr).toBe(3)
  })

  it("leaves a single-tier row untouched", () => {
    const single = row({ apr: 5, apr_kind: "fixed" })
    const { campaigns, merged } = consolidateCampaigns([single])
    expect(merged).toBe(0)
    expect(campaigns[0]).toEqual({ ...single, platform: "Icrypex" })
    expect(campaigns[0].apr_kind).toBe("fixed")
  })

  it("does not merge a prose-only row into a rate ladder", () => {
    const { campaigns } = consolidateCampaigns([
      row({ apr: 4, lock_days: 30 }),
      row({ apr: 8, lock_days: 90 }),
      row({ apr: null, apr_kind: null, reward_description: "Bonus NFT for stakers" }),
    ])
    expect(campaigns).toHaveLength(2)
    expect(campaigns.some((c) => c.reward_description === "Bonus NFT for stakers")).toBe(true)
  })
})

describe("consolidateCampaigns — promos stay distinct", () => {
  it("keeps distinct promos on the same asset+platform as separate rows", () => {
    const { campaigns, merged } = consolidateCampaigns([
      row({ program_type: "promo", asset_ticker: "USDT", apr: 4.69, apr_kind: "up_to", conditions: "Bonus on first 200" }),
      row({ program_type: "promo", asset_ticker: "USDT", apr: 30, apr_kind: "up_to", conditions: "MENAT new-user special", deadline: "2026-09-15" }),
    ])
    expect(campaigns).toHaveLength(2)
    expect(merged).toBe(0)
  })

  it("still drops exact duplicate promos reported twice", () => {
    const dup = row({ program_type: "promo", asset_ticker: "USDT", apr: 30, apr_kind: "up_to", conditions: "MENAT new-user special", deadline: "2026-09-15" })
    const { campaigns, merged } = consolidateCampaigns([dup, { ...dup }])
    expect(campaigns).toHaveLength(1)
    expect(merged).toBe(1)
  })
})

describe("consolidateCampaigns — quality floor", () => {
  it("drops a standing base rate below the floor", () => {
    const { campaigns, floored } = consolidateCampaigns([
      row({ asset_ticker: "BTC", program_type: "flexible_earn", apr: 0.02, apr_kind: "variable", lock_days: null }),
    ])
    expect(campaigns).toHaveLength(0)
    expect(floored).toBe(1)
  })

  it("keeps a below-floor rate when it has a deadline (limited-time offer)", () => {
    const { campaigns, floored } = consolidateCampaigns([
      row({ apr: 0.5, deadline: "2026-09-30" }),
    ])
    expect(campaigns).toHaveLength(1)
    expect(floored).toBe(0)
  })

  it("never floors promos, launchpools, airdrops or prose-only rows", () => {
    const { campaigns } = consolidateCampaigns([
      row({ program_type: "promo", apr: 1, apr_kind: "up_to" }),
      row({ program_type: "launchpool", asset_ticker: "NEW", apr: 0.9, apr_kind: "variable" }),
      row({ program_type: "airdrop", asset_ticker: "ARB", apr: null, apr_kind: null, reward_description: "Hold to receive tokens" }),
    ])
    expect(campaigns).toHaveLength(3)
  })

  it("keeps a rate exactly at the floor", () => {
    const { campaigns } = consolidateCampaigns([row({ apr: CAMPAIGN_MIN_APR_PCT })])
    expect(campaigns).toHaveLength(1)
  })

  it("clamps an overlong run summary to the header budget, on a word boundary", () => {
    const long = "word ".repeat(400).trim()
    const clamped = clampRunSummary(long)
    expect(clamped.length).toBeLessThanOrEqual(RUN_SUMMARY_MAX_CHARS)
    expect(clamped.endsWith("…")).toBe(true)
    expect(clamped).not.toContain("word wor…")
  })

  it("leaves a short summary untouched", () => {
    expect(clampRunSummary("15 campaigns found.")).toBe("15 campaigns found.")
  })

  it("floors after merging, so a ladder is judged by its top tier", () => {
    const { campaigns, floored } = consolidateCampaigns([
      row({ asset_ticker: "USDT", apr: 0.98, lock_days: 30 }),
      row({ asset_ticker: "USDT", apr: 8.25, lock_days: 180 }),
    ])
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].apr).toBe(8.25)
    expect(floored).toBe(0)
  })
})
