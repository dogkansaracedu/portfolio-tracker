-- Budgeting (Component 14) — the storage behind the monthly earned/invested/
-- spent view. Three per-user tables; everything the page shows beyond income is
-- DERIVED client-side from portfolio transactions (the net-invested fold), so
-- none of it is stored here.
--
-- `cashflow_entries.type` is CHECKed to 'income' on purpose: the expense ledger
-- is a designed-but-unbuilt follow-up, and relaxing a CHECK is a one-line
-- migration while a wrong early shape is not. `budget_targets` ships now but is
-- unused until the plan-vs-actual phase, so that phase needs no migration.

-- ─── cashflow_entries ───────────────────────────────────────────────
-- One row per income event. Never touches holdings, balances, or P&L.
CREATE TABLE public.cashflow_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  type       text NOT NULL CHECK (type IN ('income')),
  amount     numeric NOT NULL CHECK (amount > 0),
  currency   text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashflow_entries IS
  'Budgeting (Component 14) income events; type ''expense'' reserved for the future expense ledger. Separate from portfolio transactions — never affects holdings or P&L.';

-- Covers the only read path (a user's entries by date), the RLS predicate,
-- and the auth.users FK (Postgres does not index FK columns automatically).
CREATE INDEX idx_cashflow_entries_user_date
  ON public.cashflow_entries(user_id, date);

-- ─── income_defaults ────────────────────────────────────────────────
-- Salary schedule: the row with the latest effective_from ≤ a month supplies
-- that month's default income when no explicit entry exists. Append-only in
-- spirit; one row per effective month.
CREATE TABLE public.income_defaults (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         numeric NOT NULL CHECK (amount > 0),
  currency       text NOT NULL,
  effective_from date NOT NULL CHECK (effective_from = date_trunc('month', effective_from)::date),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.income_defaults IS
  'Budgeting (Component 14) salary schedule: default monthly income with effective-from month semantics.';

CREATE UNIQUE INDEX idx_income_defaults_user_effective
  ON public.income_defaults(user_id, effective_from);

-- ─── budget_targets ─────────────────────────────────────────────────
-- Reserved for plan-vs-actual: monthly invest target + optional spend ceiling,
-- same effective-from semantics as income_defaults. Unused by the app today.
CREATE TABLE public.budget_targets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_invest_target  numeric NOT NULL CHECK (monthly_invest_target >= 0),
  spend_ceiling          numeric CHECK (spend_ceiling >= 0),
  currency               text NOT NULL,
  effective_from         date NOT NULL CHECK (effective_from = date_trunc('month', effective_from)::date),
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.budget_targets IS
  'Budgeting (Component 14) plan-vs-actual targets. Storage ships ahead of the feature; no app code reads it yet.';

CREATE UNIQUE INDEX idx_budget_targets_user_effective
  ON public.budget_targets(user_id, effective_from);

-- ─── Row Level Security ─────────────────────────────────────────────
-- Owner-only, all four verbs. auth.uid() is wrapped in a scalar subquery so
-- Postgres evaluates it once per statement instead of once per row.
ALTER TABLE public.cashflow_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_defaults  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_targets   ENABLE ROW LEVEL SECURITY;

CREATE POLICY cashflow_entries_select ON public.cashflow_entries FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_entries_insert ON public.cashflow_entries FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_entries_update ON public.cashflow_entries FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_entries_delete ON public.cashflow_entries FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY income_defaults_select ON public.income_defaults FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY income_defaults_insert ON public.income_defaults FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY income_defaults_update ON public.income_defaults FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY income_defaults_delete ON public.income_defaults FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY budget_targets_select ON public.budget_targets FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY budget_targets_insert ON public.budget_targets FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY budget_targets_update ON public.budget_targets FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY budget_targets_delete ON public.budget_targets FOR DELETE USING ((SELECT auth.uid()) = user_id);
