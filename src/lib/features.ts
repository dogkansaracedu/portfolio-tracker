/**
 * Compile-time feature flags. No env gating (there is no dev environment —
 * everything ships to prod): flip the boolean and deploy.
 */
export const FEATURES = {
  /**
   * Performance page — OFF since 2026-08-28 by user decision. The route and
   * nav entry are gated on this flag; the page's code
   * (`src/pages/PerformancePage.tsx`, `src/hooks/usePerformance.ts`,
   * `src/components/performance/*`) and its docs
   * (`docs/components/{,technical/}10-snapshots-performance.md`) are FROZEN:
   * deliberately left stale, exempt from maintenance and doc-sync until this
   * flag is turned back on. Snapshot infrastructure itself (cron, storage,
   * the dashboard's consumption of snapshots) is NOT part of the freeze.
   */
  performancePage: false,
} as const
