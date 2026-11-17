/** How long ago an ISO timestamp was, in the app's short form ("5m", "3h",
 *  "2d"). Shared by the header's refresh button and the price-source health
 *  line. */

function ageParts(isoString: string, nowMs: number): { value: number; unit: string } {
  const minutes = Math.floor((nowMs - new Date(isoString).getTime()) / 60_000)
  if (minutes < 60) return { value: Math.max(minutes, 0), unit: "m" }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { value: hours, unit: "h" }
  return { value: Math.floor(hours / 24), unit: "d" }
}

/** "just now", "5m ago", "3h ago", "2d ago". */
export function formatTimeAgo(isoString: string, nowMs: number = Date.now()): string {
  const { value, unit } = ageParts(isoString, nowMs)
  if (unit === "m" && value < 1) return "just now"
  return `${value}${unit} ago`
}

/** The phone header's version of the same figure: "2m", "3h", "2d". */
export function formatCompactAge(isoString: string, nowMs: number = Date.now()): string {
  const { value, unit } = ageParts(isoString, nowMs)
  return `${value}${unit}`
}
