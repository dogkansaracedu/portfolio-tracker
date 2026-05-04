-- Reclassify the April 2, 2026 "loading event" transactions from `buy`
-- to `transfer_in`. These transactions represent the user adding their
-- existing holdings to the tracker for the first time; they do NOT
-- represent new cash being deployed. Treating them as buys was inflating
-- the cumulative invested capital and produced misleading P&L numbers
-- (e.g. all-time P&L looked like a sudden ~$10k drop after April 2).
--
-- Reclassifying to `transfer_in` keeps balances and FIFO cost basis
-- intact (those code paths treat buy and transfer_in identically), but
-- the period P&L calculation in src/lib/performance.ts now ignores
-- transfer_in/transfer_out as cash flows.

UPDATE public.transactions
SET
  type = 'transfer_in',
  notes = COALESCE(NULLIF(notes, ''), '') ||
          CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE ' · ' END ||
          'Opening balance (loaded into tracker 2026-04-02)'
WHERE date::date = '2026-04-02'
  AND type = 'buy';
