// Holdings are managed by `HoldingsProvider` (see contexts/HoldingsContext) so
// every consumer shares one fetch instead of each call site firing its own
// `holdings?select=*,assets(...),platforms(...)` request on mount, and the
// snapshot auto-refresh can reuse the in-memory rows. This file preserves the
// original `useHoldings` import path.
export { useHoldingsContext as useHoldings } from "@/contexts/HoldingsContext"
