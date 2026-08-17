import { describe, it, expect } from "vitest"
import {
  estimateYearlyUsd,
  formatApr,
  groupCampaigns,
  isDeadlineSoon,
  isExpired,
  isRunStale,
  partitionExpired,
} from "@/lib/campaigns"
import {
  CAMPAIGN_STALENESS_DAYS,
  DEADLINE_SOON_DAYS,
} from "@/lib/constants/campaigns"
import type { Campaign } from "@/types/database"

// Campaign rows are global facts; everything personal (bucket, estimate) is
// derived at read time by these functions. The cases below pin the behavioral
// spec: three buckets as a partition, estimate math, and the two date cues.

const TODAY = "2026-08-17"

let seq = 0

function campaign(over: Partial<Campaign> = {}): Campaign {
  seq += 1
  return {
    id: `c${seq}`,
    run_id: "run-1",
    asset_ticker: "BTC",
    platform: "Binance",
    program_type: "flexible_earn",
    apr: 5,
    apr_kind: "variable",
    reward_description: null,
    lock_days: null,
    min_amount: null,
    max_amount: null,
    amount_currency: null,
    conditions: null,
    deadline: null,
    is_stablecoin: false,
    source_url: "https://example.com/earn",
    fetched_at: TODAY,
    ...over,
  }
}

describe("estimateYearlyUsd", () => {
  it("multiplies quantity × price × apr/100", () => {
    const value = estimateYearlyUsd(2, 50_000, 4)
    expect(value?.toString()).toBe("4000")
  })

  it("keeps precision a float would lose", () => {
    // 0.1 * 0.2 = 0.020000000000000004 in float math.
    const value = estimateYearlyUsd("0.1", "0.2", "100")
    expect(value?.toString()).toBe("0.02")
  })

  it("is null when any input is missing", () => {
    expect(estimateYearlyUsd(null, 100, 5)).toBeNull()
    expect(estimateYearlyUsd(2, null, 5)).toBeNull()
    expect(estimateYearlyUsd(2, 100, null)).toBeNull()
    expect(estimateYearlyUsd(undefined, undefined, undefined)).toBeNull()
  })

  it("is null when any input is zero (no '≈ $0/yr' rows)", () => {
    expect(estimateYearlyUsd(0, 100, 5)).toBeNull()
    expect(estimateYearlyUsd(2, 0, 5)).toBeNull()
    expect(estimateYearlyUsd(2, 100, 0)).toBeNull()
  })

  it("is null for unparseable input", () => {
    expect(estimateYearlyUsd("not a number", 100, 5)).toBeNull()
  })
})

describe("groupCampaigns", () => {
  const heldTickers = new Set(["BTC", "ETH"])

  it("puts held tickers in bucket 1, matching case-insensitively", () => {
    const rows = [campaign({ asset_ticker: "btc" })]
    const { held, stablecoin, considering } = groupCampaigns(rows, heldTickers)
    expect(held).toHaveLength(1)
    expect(stablecoin).toHaveLength(0)
    expect(considering).toHaveLength(0)
  })

  it("keeps a held stablecoin in bucket 1 only (the buckets partition)", () => {
    const row = campaign({ asset_ticker: "ETH", is_stablecoin: true })
    const groups = groupCampaigns([row], heldTickers)
    expect(groups.held).toEqual([row])
    expect(groups.stablecoin).toEqual([])
    expect(groups.considering).toEqual([])
  })

  it("routes unheld stablecoins to bucket 2 and the rest to bucket 3", () => {
    const stable = campaign({ asset_ticker: "USDT", is_stablecoin: true })
    const other = campaign({ asset_ticker: "SOL" })
    const groups = groupCampaigns([stable, other], heldTickers)
    expect(groups.stablecoin).toEqual([stable])
    expect(groups.considering).toEqual([other])
  })

  it("sorts bucket 1 by estimated yearly USD, highest first", () => {
    const small = campaign({ asset_ticker: "BTC", apr: 20 })
    const big = campaign({ asset_ticker: "ETH", apr: 1 })
    // ETH's smaller rate on a much larger position still wins.
    const estimate = (c: Campaign) =>
      c.asset_ticker === "ETH"
        ? estimateYearlyUsd(100, 3_000, c.apr)
        : estimateYearlyUsd(0.01, 50_000, c.apr)
    const { held } = groupCampaigns([small, big], heldTickers, estimate)
    expect(held.map((c) => c.asset_ticker)).toEqual(["ETH", "BTC"])
  })

  it("puts bucket-1 rows with no estimate last", () => {
    const prose = campaign({
      asset_ticker: "BTC",
      apr: null,
      apr_kind: null,
      reward_description: "Hold through September for an airdrop",
    })
    const rated = campaign({ asset_ticker: "ETH", apr: 3 })
    const estimate = (c: Campaign) => estimateYearlyUsd(1, 1_000, c.apr)
    const { held } = groupCampaigns([prose, rated], heldTickers, estimate)
    expect(held.map((c) => c.asset_ticker)).toEqual(["ETH", "BTC"])
  })

  it("falls back to APR order in bucket 1 when no estimator is given", () => {
    const low = campaign({ asset_ticker: "BTC", apr: 2 })
    const high = campaign({ asset_ticker: "ETH", apr: 9 })
    const { held } = groupCampaigns([low, high], heldTickers)
    expect(held.map((c) => c.apr)).toEqual([9, 2])
  })

  it("sorts bucket 3 by APR desc with rate-less rows last", () => {
    const rows = [
      campaign({ asset_ticker: "SOL", apr: 4 }),
      campaign({ asset_ticker: "AVAX", apr: null, apr_kind: null, reward_description: "NFT drop" }),
      campaign({ asset_ticker: "DOT", apr: 12 }),
    ]
    const { considering } = groupCampaigns(rows, heldTickers)
    expect(considering.map((c) => c.asset_ticker)).toEqual(["DOT", "SOL", "AVAX"])
  })

  it("keeps input order on ties (stable sort)", () => {
    const first = campaign({ asset_ticker: "SOL", apr: 7 })
    const second = campaign({ asset_ticker: "DOT", apr: 7 })
    const third = campaign({ asset_ticker: "ADA", apr: 7 })
    const { considering } = groupCampaigns([first, second, third], heldTickers)
    expect(considering.map((c) => c.asset_ticker)).toEqual(["SOL", "DOT", "ADA"])
  })

  it("returns three empty buckets for an empty run", () => {
    expect(groupCampaigns([], heldTickers)).toEqual({
      held: [],
      stablecoin: [],
      considering: [],
    })
  })
})

describe("isExpired / partitionExpired", () => {
  it("treats a deadline before today as expired", () => {
    expect(isExpired(campaign({ deadline: "2026-08-16" }), TODAY)).toBe(true)
  })

  it("treats today's deadline as still live", () => {
    expect(isExpired(campaign({ deadline: TODAY }), TODAY)).toBe(false)
  })

  it("never expires a row without a deadline", () => {
    expect(isExpired(campaign({ deadline: null }), TODAY)).toBe(false)
  })

  it("splits a run into live and expired rows, preserving order", () => {
    const live = campaign({ asset_ticker: "BTC", deadline: "2026-12-01" })
    const gone = campaign({ asset_ticker: "ETH", deadline: "2026-01-01" })
    const openEnded = campaign({ asset_ticker: "SOL", deadline: null })
    const { active, expired } = partitionExpired([live, gone, openEnded], TODAY)
    expect(active.map((c) => c.asset_ticker)).toEqual(["BTC", "SOL"])
    expect(expired.map((c) => c.asset_ticker)).toEqual(["ETH"])
  })

  it("keeps expired rows out of the groups when filtered first", () => {
    const gone = campaign({ asset_ticker: "BTC", deadline: "2026-01-01" })
    const live = campaign({ asset_ticker: "BTC", deadline: "2026-12-01" })
    const { active } = partitionExpired([gone, live], TODAY)
    const { held } = groupCampaigns(active, new Set(["BTC"]))
    expect(held).toEqual([live])
  })
})

describe("isDeadlineSoon", () => {
  it("is true on the boundary day and inside it", () => {
    expect(isDeadlineSoon(campaign({ deadline: "2026-08-24" }), TODAY)).toBe(true) // +7
    expect(isDeadlineSoon(campaign({ deadline: "2026-08-18" }), TODAY)).toBe(true)
    expect(isDeadlineSoon(campaign({ deadline: TODAY }), TODAY)).toBe(true)
  })

  it("is false one day past the boundary", () => {
    expect(isDeadlineSoon(campaign({ deadline: "2026-08-25" }), TODAY)).toBe(false) // +8
  })

  it("uses DEADLINE_SOON_DAYS as the window", () => {
    expect(DEADLINE_SOON_DAYS).toBe(7)
  })

  it("is false for an expired or open-ended deadline", () => {
    expect(isDeadlineSoon(campaign({ deadline: "2026-08-16" }), TODAY)).toBe(false)
    expect(isDeadlineSoon(campaign({ deadline: null }), TODAY)).toBe(false)
  })
})

describe("isRunStale", () => {
  const now = new Date("2026-08-17T12:00:00Z")
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

  it("is false exactly on the threshold", () => {
    expect(isRunStale(daysAgo(CAMPAIGN_STALENESS_DAYS), now)).toBe(false)
  })

  it("is true just past the threshold", () => {
    expect(isRunStale(daysAgo(CAMPAIGN_STALENESS_DAYS + 0.5), now)).toBe(true)
  })

  it("is false for a fresh run", () => {
    expect(isRunStale(daysAgo(1), now)).toBe(false)
  })

  it("is false when there is no run at all", () => {
    expect(isRunStale(null, now)).toBe(false)
    expect(isRunStale("not a date", now)).toBe(false)
  })
})

describe("formatApr", () => {
  it("renders a plain percentage for a fixed rate", () => {
    expect(formatApr(5, "fixed")).toBe("5%")
  })

  it("marks a ceiling rate as 'up to'", () => {
    expect(formatApr(12, "up_to")).toBe("up to 12%")
  })

  it("marks a floating rate as variable", () => {
    expect(formatApr(3.85, "variable")).toBe("3.85% variable")
  })

  it("trims to two decimals and drops trailing zeros", () => {
    expect(formatApr(4.5678, null)).toBe("4.57%")
    expect(formatApr(4.5, null)).toBe("4.5%")
  })

  it("is null for a prose-only reward", () => {
    expect(formatApr(null, null)).toBeNull()
  })
})
