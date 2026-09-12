import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import type { Asset, InterestPosition, Platform } from "@/types/database"

const context = vi.hoisted(() => ({
  assets: [] as Asset[],
  platforms: [] as Platform[],
  positions: [] as InterestPosition[],
}))

vi.mock("@/contexts/AssetsContext", () => ({
  useAssetsContext: () => ({ assets: context.assets }),
}))

vi.mock("@/contexts/PlatformsContext", () => ({
  usePlatformsContext: () => ({ platforms: context.platforms }),
}))

vi.mock("@/contexts/InterestContext", () => ({
  useInterestContext: () => ({ positions: context.positions }),
}))

vi.mock("@/lib/config", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/config")>()
  return { ...original, homeDayIso: () => "2026-08-19" }
})

import { InterestAlerts } from "./InterestAlerts"

function position(
  over: Partial<InterestPosition> = {},
): InterestPosition {
  return {
    id: "position-1",
    user_id: "user-1",
    asset_id: "asset-1",
    platform_id: "platform-1",
    quantity: 1.25,
    apr: 5.25,
    apr_kind: "fixed",
    label: "90-day earn",
    started_at: "2026-05-15",
    expires_at: "2026-08-18",
    campaign_id: null,
    note: null,
    is_closed: false,
    created_at: "2026-05-15T10:00:00Z",
    ...over,
  }
}

function renderAlerts(): string {
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(InterestAlerts)),
  )
}

describe("InterestAlerts", () => {
  beforeEach(() => {
    context.assets = [
      {
        id: "asset-1",
        user_id: "user-1",
        category: "crypto",
        ticker: "ETH",
        price_id: "ETH-USD",
        icon_url: null,
        name: "Ethereum",
        tags: [],
        price_source: "yahoo",
        is_currency: false,
        is_active: true,
        at_source_tax_rate: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]
    context.platforms = [
      {
        id: "platform-1",
        user_id: "user-1",
        name: "Example Earn",
        color: "#123456",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]
    context.positions = [position()]
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("explains the consequence and exposes a named review action", () => {
    const html = renderAlerts()

    expect(html).toContain("Check whether it renewed or the funds are now idle.")
    expect(html).toContain("Your ETH position on Example Earn expired 1 day ago")
    expect(html).toContain("Committed")
    expect(html).toContain("1.25 ETH")
    expect(html).toContain("5.25%")
    expect(html).toContain("90-day earn")
    expect(html).toContain("Review position")
    expect(html).toContain('href="/assets/asset-1#earning"')
    expect(html).toContain(
      'aria-label="Review position: ETH on Example Earn"',
    )
    expect(html).toContain('aria-label="Dismiss interest alerts"')
    expect(html.match(/href=/g)).toHaveLength(1)
  })

  it("gives an ending-soon position decision guidance too", () => {
    context.positions = [
      position({
        id: "position-2",
        expires_at: "2026-08-22",
        apr: null,
        apr_kind: null,
        label: null,
      }),
    ]

    const html = renderAlerts()

    expect(html).toContain(
      "Decide whether to renew or move the funds before the recorded term ends.",
    )
    expect(html).toContain("Your ETH position on Example Earn ends in 3 days")
    expect(html).toContain("Review position")
  })
})
