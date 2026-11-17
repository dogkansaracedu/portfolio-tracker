import { describe, expect, it } from "vitest"
import { formatCompactAge, formatTimeAgo } from "@/lib/age"

const now = new Date("2026-11-17T12:00:00Z").getTime()

describe("formatTimeAgo", () => {
  it("rounds down to minutes, hours, days", () => {
    expect(formatTimeAgo("2026-11-17T11:59:40Z", now)).toBe("just now")
    expect(formatTimeAgo("2026-11-17T11:55:00Z", now)).toBe("5m ago")
    expect(formatTimeAgo("2026-11-17T09:00:00Z", now)).toBe("3h ago")
    expect(formatTimeAgo("2026-11-15T12:00:00Z", now)).toBe("2d ago")
    expect(formatCompactAge("2026-11-17T09:00:00Z", now)).toBe("3h")
  })
})
