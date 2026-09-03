import type { ReturnMode } from "@/hooks/usePortfolio"

/** Labels for the Portfolio Total | Daily return toggle. */
export const RETURN_MODE_LABELS: Record<ReturnMode, string> = {
  total: "Total",
  daily: "Daily",
}

/** Return column header on the desktop table, per return mode. */
export const RETURN_COLUMN_LABEL_TOTAL = "P&L"
export const RETURN_COLUMN_LABEL_DAILY = "Today"

/** The summary bar's third figure — a card at `sm+`, the P&L caption below. */
export const HELD_ASSETS_LABEL = "Held Assets"
