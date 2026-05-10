// Snapshots are managed by `SnapshotsProvider` (see contexts/SnapshotsContext)
// so every consumer reads from one shared store and the auto-refresh that
// keeps today's snapshot trailing the freshest prices runs exactly once.
// This file preserves the original `useSnapshots` import path.
export { useSnapshotsContext as useSnapshots } from "@/contexts/SnapshotsContext"
