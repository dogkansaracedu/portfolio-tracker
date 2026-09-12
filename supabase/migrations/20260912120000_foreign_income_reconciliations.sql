-- Foreign-income reconciliation — immutable, private audit checkpoints. The
-- portfolio transactions remain the source of truth; each row only records
-- what total the owner verified externally and the exact app input set at that
-- moment. Saving a new comparison appends a row instead of overwriting history.

CREATE TABLE public.foreign_income_reconciliations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year              integer NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  statement_amount_try  numeric NOT NULL CHECK (statement_amount_try >= 0),
  recorded_amount_try   numeric NOT NULL CHECK (recorded_amount_try >= 0),
  recorded_fingerprint  text NOT NULL CHECK (char_length(recorded_fingerprint) BETWEEN 1 AND 128),
  note                  text CHECK (note IS NULL OR char_length(note) <= 1000),
  reconciled_at         timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.foreign_income_reconciliations IS
  'Immutable per-user comparisons of derived foreign-declarable income with an externally verified TRY total. Informational only: never changes transactions, holdings, balances or P&L.';

CREATE INDEX foreign_income_reconciliations_user_year_checked_idx
  ON public.foreign_income_reconciliations (user_id, tax_year, reconciled_at DESC);

ALTER TABLE public.foreign_income_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY foreign_income_reconciliations_select
  ON public.foreign_income_reconciliations FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY foreign_income_reconciliations_insert
  ON public.foreign_income_reconciliations FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);
