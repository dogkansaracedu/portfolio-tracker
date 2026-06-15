import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchYahooQuote, pickLatestPrice } from "../../../supabase/functions/_shared/yahoo.ts"

// Tests for the shared Yahoo fetcher used by `fetch-prices` / `resolve-tickers`.
// It lives under `supabase/functions/_shared/`, but the test sits in `src/`
// because Vitest only includes `src/**/*.test.ts` — and importing the module
// here also puts it under `tsc -b`, so the build gate typechecks it.

/** Build a `chart.result[0]` object with just the fields the picker reads. */
function chartResult(opts: {
  regularMarketPrice?: number | null
  regularMarketTime?: number | null
  timestamps?: number[]
  closes?: (number | null)[]
}) {
  const meta: Record<string, unknown> = { currency: "USD" }
  if (opts.regularMarketPrice !== undefined)
    meta.regularMarketPrice = opts.regularMarketPrice
  if (opts.regularMarketTime !== undefined)
    meta.regularMarketTime = opts.regularMarketTime
  return {
    meta,
    timestamp: opts.timestamps,
    indicators: opts.closes ? { quote: [{ close: opts.closes }] } : undefined,
  }
}

describe("pickLatestPrice", () => {
  it("returns regularMarketPrice during the regular session (newer than the last 5m candle)", () => {
    // regularMarketTime (live tick) is later than the last completed candle.
    const price = pickLatestPrice(
      chartResult({
        regularMarketPrice: 291.13,
        regularMarketTime: 1000,
        timestamps: [800, 900],
        closes: [290.0, 290.5],
      }),
    )
    expect(price).toBe(291.13)
  })

  it("returns the extended-hours close when it is newer than the regular-market close", () => {
    // Pre-/after-hours: regularMarketTime is the frozen regular close; the last
    // extended-hours candle is more recent and should win.
    const price = pickLatestPrice(
      chartResult({
        regularMarketPrice: 291.13,
        regularMarketTime: 500,
        timestamps: [800, 900],
        closes: [293.75, 293.85],
      }),
    )
    expect(price).toBe(293.85)
  })

  it("uses the last non-null close, skipping trailing nulls", () => {
    const price = pickLatestPrice(
      chartResult({
        regularMarketPrice: 291.13,
        regularMarketTime: 100,
        timestamps: [800, 900, 1000],
        closes: [293.75, 293.85, null],
      }),
    )
    expect(price).toBe(293.85)
  })

  it("falls back to regularMarketPrice when there are no intraday closes", () => {
    expect(
      pickLatestPrice(
        chartResult({ regularMarketPrice: 291.13, regularMarketTime: 500 }),
      ),
    ).toBe(291.13)

    expect(
      pickLatestPrice(
        chartResult({
          regularMarketPrice: 291.13,
          regularMarketTime: 500,
          timestamps: [800],
          closes: [null],
        }),
      ),
    ).toBe(291.13)
  })

  it("returns the last close when regularMarketPrice is absent", () => {
    const price = pickLatestPrice(
      chartResult({ timestamps: [800, 900], closes: [293.75, 293.85] }),
    )
    expect(price).toBe(293.85)
  })

  it("returns null when neither a regular price nor any close is present", () => {
    expect(pickLatestPrice(chartResult({}))).toBeNull()
  })
})

describe("fetchYahooQuote", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  function chartJson(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status })
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests the chart endpoint with includePrePost and an intraday interval", async () => {
    fetchMock.mockResolvedValue(
      chartJson({
        chart: {
          result: [
            {
              meta: { regularMarketPrice: 291.13, currency: "USD" },
              timestamp: [],
              indicators: { quote: [{ close: [] }] },
            },
          ],
        },
      }),
    )

    await fetchYahooQuote("AAPL")

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain("/AAPL?")
    expect(url).toContain("includePrePost=true")
    expect(url).toContain("interval=5m")
  })

  it("returns the most recent extended-hours price with the currency from meta", async () => {
    fetchMock.mockResolvedValue(
      chartJson({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 291.13,
                regularMarketTime: 500,
                currency: "USD",
                instrumentType: "EQUITY",
                longName: "Apple Inc.",
              },
              timestamp: [800, 900],
              indicators: { quote: [{ close: [293.75, 293.85] }] },
            },
          ],
        },
      }),
    )

    const { status, quote } = await fetchYahooQuote("AAPL")

    expect(status).toBe(200)
    expect(quote?.price).toBe(293.85)
    expect(quote?.currency).toBe("USD")
    expect(quote?.instrumentType).toBe("EQUITY")
    expect(quote?.name).toBe("Apple Inc.")
  })

  it("returns the HTTP status and no quote on a non-OK response", async () => {
    fetchMock.mockResolvedValue(chartJson("Too Many Requests", 429))

    const { status, quote } = await fetchYahooQuote("AAPL")

    expect(status).toBe(429)
    expect(quote).toBeNull()
  })

  it("returns status null and no quote when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("network error"))

    const { status, quote } = await fetchYahooQuote("AAPL")

    expect(status).toBeNull()
    expect(quote).toBeNull()
  })

  it("returns no quote when the meta block is missing", async () => {
    fetchMock.mockResolvedValue(chartJson({ chart: { result: [{}] } }))

    const { quote } = await fetchYahooQuote("AAPL")

    expect(quote).toBeNull()
  })
})
