/**
 * Turkish annual declaration threshold (GVK 86/1-d) for FOREIGN, non-withheld
 * dividend + interest income, in TRY. Below it, no declaration; cross it and the
 * whole amount must be declared. Revalues yearly — 18,000 (2025) → 22,000 (2026).
 * Verify the current figure each tax year. PPF (withheld at source) does NOT
 * count toward this.
 */
export const FOREIGN_INCOME_DECLARATION_THRESHOLD_TRY = 22000
