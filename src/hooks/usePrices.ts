// Prices are managed by `PricesProvider` (see contexts/PricesContext) so every
// consumer shares state and the manual "Refresh prices" button propagates to
// the rest of the tree (including `SnapshotsProvider`'s auto-refresh effect).
// This file preserves the original `usePrices` import path.
export { usePricesContext as usePrices } from "@/contexts/PricesContext"
