import type { CSSProperties } from "react"

/**
 * The one Recharts tooltip skin. Recharts paints its tooltip with inline
 * styles, so it cannot inherit the app's theme through a class — every chart
 * hands it these tokens instead, and a chart needing more (a width cap, say)
 * spreads this first.
 */
export const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: "var(--background)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  borderRadius: 8,
  fontSize: 12,
}
