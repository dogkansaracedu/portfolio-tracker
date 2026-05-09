-- Add linked_tx_id FK column on transactions to pair cash rows with their parent.
-- See docs/cash-flow-feature-design.md for the full design.
--
-- The cash_credit / cash_debit enum values are added in the prior migration
-- (20260509100000) so they are committed before the CHECK constraint below
-- references them.

-- ─── Linked-row FK column ─────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS linked_tx_id uuid
    REFERENCES transactions(id)
    ON DELETE CASCADE;

-- Index for cascade lookups & "show me my paired row".
-- Partial index keeps the index small (most rows have NULL).
CREATE INDEX IF NOT EXISTS transactions_linked_tx_id_idx
  ON transactions(linked_tx_id)
  WHERE linked_tx_id IS NOT NULL;

-- ─── Invariant: cash rows must have a parent; non-cash must not ──
-- A cash_credit / cash_debit row is always paired to its parent.
-- A buy / sell / transfer / etc. is always a parent (linked_tx_id NULL).
ALTER TABLE transactions
  ADD CONSTRAINT cash_row_must_have_parent
    CHECK (
      (type IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NOT NULL)
      OR
      (type NOT IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NULL)
    );
