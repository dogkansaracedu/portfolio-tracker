import type { ReturnMode } from "@/hooks/usePortfolio"

/** Labels for the Portfolio Total | Daily return toggle. */
export const RETURN_MODE_LABELS: Record<ReturnMode, string> = {
  total: "Total",
  daily: "Daily",
}

/** The portfolio's current market value — the same figure the dashboard hero
 *  headlines, so both say this. */
export const TOTAL_VALUE_LABEL = "Total Value"

/** The summary bar's third figure — a card at `sm+`, the P&L caption below. */
export const HELD_ASSETS_LABEL = "Held Assets"
