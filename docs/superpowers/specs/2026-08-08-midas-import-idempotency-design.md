# Midas Import Idempotency — Design

**Date:** 2026-08-08
**Status:** Approved

## Problem

The user wants to back-import every monthly Midas PDF statement. Monthly statements
can overlap (the same executed trade appears in two statements, or the same statement
is imported twice). Today the Midas PDF import appends every parsed row to the
bulk-add grid unconditionally, so overlapping imports create duplicate transactions.

## Goal

Re-importing an overlapping statement must not create duplicates. Rows that already
exist are silently excluded from the grid; the import summary shows how many were
skipped as already imported.

## Non-goals

- No DB schema change (no unique constraint, no import-hash column).
- No save-time dedup — manual entry and CSV/clipboard import are untouched.
- No retroactive cleanup of duplicates that already exist in the DB.

## Key constraint: day-granularity dates

Transactions store day-level dates (no time component), and the PDF parser also
drops the time. Two genuinely distinct trades on the same day with the same symbol,
quantity, and price are therefore indistinguishable by fields alone. A naive
"does one exist?" check would wrongly drop the second real trade.

## Design: count-based matching at import time

All logic lives in the Midas PDF import path (client-side, at parse time):

1. **Fetch existing rows.** After parsing succeeds and yields N rows, compute the
   min/max date across parsed rows and fetch the user's existing transactions for
   the Midas platform in that date range (one query via the existing transactions
   query helper). If the Midas platform doesn't exist yet, nothing can be a
   duplicate — skip the check.
2. **Build a duplicate key** per transaction:
   `date | assetId | type | amount | unitPrice | priceCurrency`.
   Amount, unit price are compared numerically via BigNumber normalization
   (so `14.50` from the PDF matches `14.5` from the DB). Fee and notes are
   excluded (fees may have been hand-edited after a prior import).
   Rows with an unresolved-asset sentinel (`new:TICKER`) never match — if the
   asset doesn't exist in the catalog, no prior transaction can reference it.
3. **Count, don't just test.** Build a key → count map from existing DB rows
   **plus** rows already sitting in the grid (unsaved rows from a previous PDF in
   the same session). For each parsed row in order, if its key still has a positive
   count, decrement the count and drop the row as a duplicate; otherwise keep it.
   Example: DB has 2 matching rows, PDF has 3 → exactly 1 is appended.
4. **Report.** The import summary popover gains an "Already imported" count next to
   the existing Rows / New tickers / Skipped stats. Duplicates never enter the grid.
   If every row is a duplicate, the summary says so instead of offering an empty
   append.

## Error handling

- If the existing-transactions query fails, the import must not silently disable
  dedup: surface the error in the summary and do not append (the user can retry).
- Grid rows already appended count toward duplicates regardless of their save state.

## Testing

Unit tests (Vitest) for the pure dedup function:
- exact overlap → dropped
- count semantics (DB 2 + PDF 3 → 1 kept)
- numeric normalization (`14.50` vs `14.5`)
- sentinel rows never match
- grid rows count as existing
