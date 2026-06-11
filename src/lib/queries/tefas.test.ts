import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchTefasHistory } from "../../../supabase/functions/_shared/tefas.ts"

// Tests for the shared TEFAS fetcher used by the `backfill-snapshots` Edge
// Function. It lives under `supabase/functions/_shared/`, but the test sits in
// `src/` because Vitest only includes `src/**/*.test.ts` — and importing the
// module here also puts it under `tsc -b`, so the build gate typechecks it.

const TEFAS_URL = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** The request body the mocked fetch received on its nth call. */
function sentBody(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  call = 0,
): { fonKodu: string; dil: string; periyod: number } {
  const init = fetchMock.mock.calls[call][1]
  return JSON.parse(init?.body as string)
}

describe("fetchTefasHistory", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    // Pin "today" so the periyod window math is deterministic.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-11T00:00:00Z"))
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("parses daily NAVs into a date-keyed TRY close map", async () => {
    // Real response shape (probed 2026-06-11): business days only — the
    // 2026-05-27 → 05-29 gap is the Kurban Bayramı market holiday.
    fetchMock.mockResolvedValue(
      jsonResponse({
        resultList: [
          { tarih: "2026-05-26", fiyat: 1.9403, fonUnvan: "TP2 FON" },
          { tarih: "2026-06-01", fiyat: 1.955275, fonUnvan: "TP2 FON" },
          { tarih: "2026-06-10", fiyat: 1.978683, fonUnvan: "TP2 FON" },
          { tarih: "2026-06-11", fiyat: 1.981275, fonUnvan: "TP2 FON" },
        ],
      }),
    )

    const { status, closes } = await fetchTefasHistory("TP2", "2026-06-01")

    expect(status).toBe(200)
    expect(closes.size).toBe(4)
    expect(closes.get("2026-06-01")).toBe(1.955275)
    expect(closes.get("2026-06-10")).toBe(1.978683)
    expect(closes.get("2026-05-27")).toBeUndefined()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(TEFAS_URL)
    expect(sentBody(fetchMock)).toMatchObject({ fonKodu: "TP2", dil: "TR" })
  })

  it("skips rows with a missing date or a missing/non-numeric NAV", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        resultList: [
          { tarih: "2026-06-01", fiyat: 1.955275 },
          { tarih: "2026-06-02" }, // no fiyat
          { tarih: "2026-06-03", fiyat: "1.961022" }, // string fiyat
          { fiyat: 1.96339 }, // no tarih
          { tarih: "2026-06-05", fiyat: 1.965988 },
        ],
      }),
    )

    const { closes } = await fetchTefasHistory("TP2", "2026-06-01")

    expect([...closes.keys()]).toEqual(["2026-06-01", "2026-06-05"])
  })

  it("requests the smallest allowed periyod window that covers fromDate", async () => {
    // periyod (months of history ending today) must come from {1,3,6,12,36,60}.
    const cases: Array<[fromDate: string, periyod: number]> = [
      ["2026-06-01", 1], // 10 days back
      ["2026-05-12", 1], // exactly 30 days
      ["2026-05-11", 3], // 31 days → next step up
      ["2026-01-11", 6], // ~5 months
      ["2025-06-20", 12], // ~11.9 months
      ["2024-06-11", 36], // 2 years
      ["2019-06-11", 60], // beyond the 60-month API cap → clamp
    ]
    fetchMock.mockResolvedValue(jsonResponse({ resultList: [] }))

    for (const [fromDate] of cases) {
      await fetchTefasHistory("TP2", fromDate)
    }

    cases.forEach(([, periyod], i) => {
      expect(sentBody(fetchMock, i).periyod, `fromDate ${cases[i][0]}`).toBe(
        periyod,
      )
    })
  })

  it("returns the HTTP status and no closes on a non-OK response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403)) // WAF block

    const { status, closes } = await fetchTefasHistory("TP2", "2026-06-01")

    expect(status).toBe(403)
    expect(closes.size).toBe(0)
  })

  it("returns status null and no closes when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("network error"))

    const { status, closes } = await fetchTefasHistory("TP2", "2026-06-01")

    expect(status).toBeNull()
    expect(closes.size).toBe(0)
  })

  it("returns no closes when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>blocked</html>", { status: 200 }))

    const { status, closes } = await fetchTefasHistory("TP2", "2026-06-01")

    expect(status).toBe(200)
    expect(closes.size).toBe(0)
  })

  it("returns no closes when resultList is absent or empty", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    expect((await fetchTefasHistory("TP2", "2026-06-01")).closes.size).toBe(0)

    fetchMock.mockResolvedValueOnce(jsonResponse({ resultList: [] }))
    expect((await fetchTefasHistory("TP2", "2026-06-01")).closes.size).toBe(0)
  })
})
