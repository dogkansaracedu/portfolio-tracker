import { describe, it, expect } from "vitest"
import {
  addDays,
  buildPositionPrefill,
  daysUntil,
  estimatePositionTermUsd,
  estimatePositionAccruedUsd,
  estimatePositionYearlyUsd,
  isWarningStatus,
  matchPlatformByName,
  openPositions,
  positionStatus,
  positionTermDays,
  sortPositions,
  summarizeAssetInterest,
} from "@/lib/interest"
import { DEADLINE_SOON_DAYS } from "@/lib/constants/campaigns"
import {
  INTEREST_ENDS_SOON_DAYS,
  INTEREST_STATUS,
} from "@/lib/constants/interest"
import type { Campaign, InterestPosition, Platform } from "@/types/database"

// A position is a note, not a ledger entry: these cases pin the two things the
// component actually computes — the status ladder off the end date, and the
// display-time estimate — plus the ordering every surface renders in.

const TODAY = "2026-08-19"

let seq = 0

function position(over: Partial<InterestPosition> = {}): InterestPosition {
  seq += 1
  return {
    id: `p${seq}`,
    user_id: "u1",
    asset_id: "a1",
    platform_id: "pl1",
    quantity: 1,
    apr: 5,
    apr_kind: "fixed",
    label: "Test program",
    started_at: TODAY,
    expires_at: null,
    campaign_id: null,
    note: null,
    is_closed: false,
    created_at: `${TODAY}T00:00:00Z`,
    ...over,
  }
}

function platform(name: string, id = name): Platform {
  return { id, user_id: "u1", name, color: "#000", created_at: "" }
}

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    run_id: "run-1",
    asset_ticker: "USDT",
    platform: "OKX TR",
    program_type: "locked_earn",
    apr: 12.5,
    apr_kind: "up_to",
    reward_description: null,
    lock_days: null,
    min_amount: null,
    max_amount: null,
    amount_currency: null,
    conditions: null,
    deadline: null,
    is_stablecoin: true,
    source_url: "https://example.com/earn",
    fetched_at: TODAY,
    ...over,
  }
}

describe("daysUntil", () => {
  it("counts whole days forward and backward", () => {
    expect(daysUntil("2026-08-26", TODAY)).toBe(7)
    expect(daysUntil(TODAY, TODAY)).toBe(0)
    expect(daysUntil("2026-08-16", TODAY)).toBe(-3)
  })

  it("is null for a missing date", () => {
    expect(daysUntil(null, TODAY)).toBeNull()
    expect(daysUntil(undefined, TODAY)).toBeNull()
    expect(daysUntil("", TODAY)).toBeNull()
  })

  it("is null — never a number — for an unreadable date", () => {
    expect(daysUntil("not a date", TODAY)).toBeNull()
  })
})

describe("positionStatus", () => {
  it("calls a position with no end date flexible", () => {
    expect(positionStatus(position({ expires_at: null }), TODAY)).toBe(
      INTEREST_STATUS.flexible,
    )
  })

  it("falls back to flexible for an unreadable end date (never a deadline)", () => {
    expect(positionStatus(position({ expires_at: "31/12/2026" }), TODAY)).toBe(
      INTEREST_STATUS.flexible,
    )
  })

  it("treats a past end date as expired", () => {
    expect(positionStatus(position({ expires_at: "2026-08-18" }), TODAY)).toBe(
      INTEREST_STATUS.expired,
    )
  })

  it("treats today as ends-soon, not expired", () => {
    expect(positionStatus(position({ expires_at: TODAY }), TODAY)).toBe(
      INTEREST_STATUS.ends_soon,
    )
  })

  it("includes the exact 7-day boundary in ends-soon", () => {
    expect(positionStatus(position({ expires_at: "2026-08-26" }), TODAY)).toBe(
      INTEREST_STATUS.ends_soon,
    )
  })

  it("is active one day past the boundary", () => {
    expect(positionStatus(position({ expires_at: "2026-08-27" }), TODAY)).toBe(
      INTEREST_STATUS.active,
    )
  })

  it("shares the horizon with campaign deadlines — one meaning app-wide", () => {
    expect(INTEREST_ENDS_SOON_DAYS).toBe(DEADLINE_SOON_DAYS)
    expect(INTEREST_ENDS_SOON_DAYS).toBe(7)
  })
})

describe("isWarningStatus", () => {
  it("warns on expired and ends-soon only", () => {
    expect(isWarningStatus(INTEREST_STATUS.expired)).toBe(true)
    expect(isWarningStatus(INTEREST_STATUS.ends_soon)).toBe(true)
    expect(isWarningStatus(INTEREST_STATUS.active)).toBe(false)
    // A flexible position has no deadline to miss.
    expect(isWarningStatus(INTEREST_STATUS.flexible)).toBe(false)
  })
})

describe("addDays", () => {
  it("adds days inside a month", () => {
    expect(addDays("2026-08-19", 5)).toBe("2026-08-24")
  })

  it("crosses a month boundary", () => {
    expect(addDays("2026-08-19", 20)).toBe("2026-09-08")
  })

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04")
  })

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
  })

  it("subtracts with a negative count", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
  })

  it("returns an empty string for an unreadable day", () => {
    expect(addDays("nope", 5)).toBe("")
  })
})

describe("estimatePositionYearlyUsd", () => {
  it("is quantity × price × apr/100", () => {
    const value = estimatePositionYearlyUsd(
      position({ quantity: 1000, apr: 12 }),
      1,
    )
    expect(value?.toString()).toBe("120")
  })

  it("keeps precision a float would lose", () => {
    const value = estimatePositionYearlyUsd(
      position({ quantity: 0.1, apr: 100 }),
      0.2,
    )
    expect(value?.toString()).toBe("0.02")
  })

  it("is null — never $0 — with no rate, no price or no quantity", () => {
    expect(estimatePositionYearlyUsd(position({ apr: null }), 100)).toBeNull()
    expect(estimatePositionYearlyUsd(position(), null)).toBeNull()
    expect(estimatePositionYearlyUsd(position({ quantity: 0 }), 100)).toBeNull()
    expect(estimatePositionYearlyUsd(position({ apr: 0 }), 100)).toBeNull()
    expect(estimatePositionYearlyUsd(position(), 0)).toBeNull()
  })
})

describe("estimatePositionAccruedUsd", () => {
  const p = position({
    quantity: 500,
    apr: 10,
    started_at: "2026-04-02",
    expires_at: "2026-09-29",
  })

  it("prorates simple interest over elapsed days", () => {
    // Apr 2 → Aug 19 = 139 days: 500 × 10% × 139/365
    const value = estimatePositionAccruedUsd(p, 1, "2026-08-19")
    expect(value?.toFixed(4)).toBe("19.0411")
  })

  it("caps accrual at the term end after maturity", () => {
    const atEnd = estimatePositionAccruedUsd(p, 1, "2026-09-29")
    const after = estimatePositionAccruedUsd(p, 1, "2027-01-01")
    expect(after?.toString()).toBe(atEnd?.toString())
  })

  it("accrues indefinitely for a flexible position", () => {
    const flex = position({ quantity: 500, apr: 10, started_at: "2026-04-02", expires_at: null })
    const value = estimatePositionAccruedUsd(flex, 1, "2027-04-02")
    expect(value?.toString()).toBe("50")
  })

  it("is null before the start date or with no rate", () => {
    expect(estimatePositionAccruedUsd(p, 1, "2026-04-02")).toBeNull()
    expect(estimatePositionAccruedUsd(p, 1, "2026-03-01")).toBeNull()
    expect(
      estimatePositionAccruedUsd(position({ apr: null, expires_at: "2026-09-29" }), 1, "2026-08-19"),
    ).toBeNull()
  })
})

describe("positionTermDays / estimatePositionTermUsd", () => {
  const oneYear = position({
    quantity: 1000,
    apr: 10,
    started_at: "2026-01-01",
    expires_at: "2027-01-01",
  })

  it("counts the term in whole days", () => {
    expect(positionTermDays(oneYear)).toBe(365)
    expect(positionTermDays(position({ expires_at: null }))).toBeNull()
  })

  it("prorates the yearly figure over the term", () => {
    // 1000 × $1 × 10% = $100/yr; a 365-day term is exactly one year of it.
    expect(estimatePositionTermUsd(oneYear, 1)?.toString()).toBe("100")
  })

  it("scales down for a part-year term", () => {
    const half = position({
      quantity: 1000,
      apr: 10,
      started_at: "2026-01-01",
      // 73 days = 365/5, so exactly a fifth of the yearly figure.
      expires_at: "2026-03-15",
    })
    expect(estimatePositionTermUsd(half, 1)?.toString()).toBe("20")
  })

  it("is null for a flexible position (no term to prorate)", () => {
    expect(
      estimatePositionTermUsd(position({ expires_at: null }), 100),
    ).toBeNull()
  })

  it("is null for a zero-length or backwards term", () => {
    expect(
      estimatePositionTermUsd(
        position({ started_at: "2026-05-01", expires_at: "2026-05-01" }),
        100,
      ),
    ).toBeNull()
    expect(
      estimatePositionTermUsd(
        position({ started_at: "2026-05-02", expires_at: "2026-05-01" }),
        100,
      ),
    ).toBeNull()
  })

  it("is null whenever the yearly estimate is", () => {
    expect(
      estimatePositionTermUsd({ ...oneYear, apr: null }, 100),
    ).toBeNull()
  })
})

describe("openPositions", () => {
  it("drops closed rows", () => {
    const live = position()
    const archived = position({ is_closed: true })
    expect(openPositions([live, archived])).toEqual([live])
  })
})

describe("sortPositions", () => {
  it("ranks expired, then ends-soon, then active, then flexible", () => {
    const flexible = position({ id: "flex", expires_at: null })
    const active = position({ id: "active", expires_at: "2026-12-01" })
    const soon = position({ id: "soon", expires_at: "2026-08-22" })
    const expired = position({ id: "expired", expires_at: "2026-08-01" })
    const sorted = sortPositions([flexible, active, soon, expired], TODAY)
    expect(sorted.map((p) => p.id)).toEqual([
      "expired",
      "soon",
      "active",
      "flex",
    ])
  })

  it("orders within a status by end date, soonest first", () => {
    const later = position({ id: "later", expires_at: "2026-08-25" })
    const sooner = position({ id: "sooner", expires_at: "2026-08-20" })
    const sorted = sortPositions([later, sooner], TODAY)
    expect(sorted.map((p) => p.id)).toEqual(["sooner", "later"])
  })

  it("keeps input order on ties (stable)", () => {
    const first = position({ id: "first", expires_at: "2026-08-22" })
    const second = position({ id: "second", expires_at: "2026-08-22" })
    const sorted = sortPositions([first, second], TODAY)
    expect(sorted.map((p) => p.id)).toEqual(["first", "second"])
  })

  it("does not mutate its input", () => {
    const rows = [
      position({ id: "flex", expires_at: null }),
      position({ id: "expired", expires_at: "2026-01-01" }),
    ]
    sortPositions(rows, TODAY)
    expect(rows.map((p) => p.id)).toEqual(["flex", "expired"])
  })
})

describe("summarizeAssetInterest", () => {
  it("is null when the asset has no open position", () => {
    expect(summarizeAssetInterest([], "a1", TODAY)).toBeNull()
    expect(
      summarizeAssetInterest([position({ is_closed: true })], "a1", TODAY),
    ).toBeNull()
    expect(
      summarizeAssetInterest([position({ asset_id: "other" })], "a1", TODAY),
    ).toBeNull()
  })

  it("reports the loudest status and leads with that position", () => {
    const active = position({ id: "active", expires_at: "2026-12-01" })
    const expired = position({ id: "expired", expires_at: "2026-08-01" })
    const summary = summarizeAssetInterest([active, expired], "a1", TODAY)
    expect(summary?.status).toBe(INTEREST_STATUS.expired)
    expect(summary?.leading.id).toBe("expired")
    expect(summary?.positions.map((p) => p.id)).toEqual(["expired", "active"])
  })

  it("ignores other assets' and closed positions", () => {
    const mine = position({ id: "mine" })
    const summary = summarizeAssetInterest(
      [mine, position({ asset_id: "a2" }), position({ is_closed: true })],
      "a1",
      TODAY,
    )
    expect(summary?.positions.map((p) => p.id)).toEqual(["mine"])
  })
})

describe("matchPlatformByName", () => {
  const platforms = [platform("OKX TR"), platform("OKX"), platform("Midas")]

  it("prefers an exact match", () => {
    expect(matchPlatformByName("OKX TR", platforms)?.name).toBe("OKX TR")
  })

  it("ignores case and punctuation", () => {
    expect(matchPlatformByName("okx-tr", platforms)?.name).toBe("OKX TR")
  })

  it("takes the shortest containment match when there's no exact one", () => {
    // "OKX Turkey" contains neither exactly; "OKX" is the shorter candidate.
    expect(matchPlatformByName("OKX Turkey", platforms)?.name).toBe("OKX")
  })

  it("matches the other direction too (campaign name inside a platform)", () => {
    expect(matchPlatformByName("Mid", [platform("Midas")])?.name).toBe("Midas")
  })

  it("is null when nothing resembles it", () => {
    expect(matchPlatformByName("Binance", platforms)).toBeNull()
    expect(matchPlatformByName(null, platforms)).toBeNull()
    expect(matchPlatformByName("!!!", platforms)).toBeNull()
  })
})

describe("buildPositionPrefill", () => {
  const platforms = [platform("OKX TR"), platform("Midas")]

  it("carries the rate, its kind and the campaign id", () => {
    const prefill = buildPositionPrefill(campaign(), platforms, TODAY)
    expect(prefill.apr).toBe("12.5")
    expect(prefill.aprKind).toBe("up_to")
    expect(prefill.campaignId).toBe("c1")
    expect(prefill.platformId).toBe("OKX TR")
    expect(prefill.startedAt).toBe(TODAY)
  })

  it("prefers the lock period over the deadline for the end date", () => {
    // A deadline is when you may *join*, not when the money comes back.
    const prefill = buildPositionPrefill(
      campaign({ lock_days: 105, deadline: "2026-09-01" }),
      platforms,
      TODAY,
    )
    expect(prefill.expiresAt).toBe(addDays(TODAY, 105))
  })

  it("falls back to the deadline when there is no lock period", () => {
    const prefill = buildPositionPrefill(
      campaign({ lock_days: null, deadline: "2026-09-01" }),
      platforms,
      TODAY,
    )
    expect(prefill.expiresAt).toBe("2026-09-01")
  })

  it("treats a zero lock period as flexible, not a same-day term", () => {
    const prefill = buildPositionPrefill(
      campaign({ lock_days: 0, deadline: null }),
      platforms,
      TODAY,
    )
    expect(prefill.expiresAt).toBeUndefined()
  })

  it("leaves the asset and quantity for the user to supply", () => {
    const prefill = buildPositionPrefill(campaign(), platforms, TODAY)
    expect(prefill.assetId).toBeUndefined()
    expect(prefill.quantity).toBeUndefined()
  })

  it("leaves the platform unset when none resembles the campaign's", () => {
    const prefill = buildPositionPrefill(
      campaign({ platform: "Kraken" }),
      platforms,
      TODAY,
    )
    expect(prefill.platformId).toBeUndefined()
  })

  it("has no rate to carry for a prose-only campaign", () => {
    const prefill = buildPositionPrefill(
      campaign({ apr: null, apr_kind: null, reward_description: "Airdrop" }),
      platforms,
      TODAY,
    )
    expect(prefill.apr).toBeUndefined()
    expect(prefill.aprKind).toBeUndefined()
  })
})
