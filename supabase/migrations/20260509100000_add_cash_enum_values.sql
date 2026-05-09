-- Add cash_credit and cash_debit to transaction_type enum.
-- See docs/cash-flow-feature-design.md for the full design.
--
-- NOTE: Postgres requires that new enum values be committed before they can be
-- used in CHECK constraints. The Supabase CLI wraps each migration file in a
-- transaction, so the enum additions are split into this file and the column
-- + CHECK constraint live in the next migration (20260509100001).

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'cash_credit';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'cash_debit';
