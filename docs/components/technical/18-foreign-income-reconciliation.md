# Component 18: Foreign-Income Reconciliation — Technical

> Layer: React/Vite/Supabase implementation. Contract →
> [../18-foreign-income-reconciliation.md](../18-foreign-income-reconciliation.md)

## Data model

`supabase/migrations/20260912120000_foreign_income_reconciliations.sql` creates
an append-only per-user table. The client has SELECT and INSERT RLS policies but
no UPDATE or DELETE policies. Rows carry `recorded_fingerprint`; an index on
`(user_id, tax_year, reconciled_at DESC)` serves the only read path. Database
defaults own both timestamps.

The migration creates schema only and does not insert or mutate portfolio data.

## File map

| Path | Role |
|---|---|
| `src/pages/ForeignIncomePage.tsx` | Year routing, loading/error boundary, page composition. |
| `src/hooks/useForeignIncomeYtd.ts` | Current/year-selected totals, source errors, available years, threshold and fingerprint. |
| `src/hooks/useForeignIncomeReconciliation.ts` | History load, retry, append-only save, separate load/save errors. |
| `src/lib/pnl/foreign-income.ts` | Payment classification, payment-date TRY entries, payer resolution, stable fingerprint. |
| `src/lib/foreign-income-reconciliation.ts` | Pure four-state comparison logic. |
| `src/lib/constants/tax.ts` | Year-indexed thresholds and null-on-unknown lookup. |
| `src/lib/queries/foreign-income.ts` | Ordered history SELECT and single-row INSERT. |
| `src/components/foreign-income/*` | Summary, source breakdown, form, ledger and history cards. |
| `src/components/dashboard/ForeignIncomeCard.tsx` | Current-year heads-up and route entry point. |

## Correctness notes

- `TransactionDataContext` exposes fetch errors so a failed transaction/rate
  request cannot collapse into a trusted zero.
- The fingerprint is FNV-1a 64 over stable, sorted fields that affect the audit:
  transaction id/date, received and related assets, platform, type, original
  total/currency, and converted TRY result. It detects input changes; the amount
  comparison remains the authoritative monetary check.
- `related_asset_id ?? asset_id` supplies the payer label. Transaction links
  keep `asset_id` (the received cash asset) and add exact day, platform, and type
  filters so the target log contains the relevant payment.
- `foreignIncomeDeclarationThresholdTry` returns null for an unconfigured year.
  The dashboard and ledger both render that uncertainty explicitly.
- The migration stores no tax conclusion. Threshold and status copy are
  informational and should be re-verified when rules change.

## Verification

- Vitest covers classification, exact conversion rows, payer resolution,
  fingerprint change detection, all reconciliation states, and year thresholds.
- Browser verification covers exact save, mismatch save, append-only history,
  prior-year selection, filtered payment links, and a 390×664 no-overflow view.
