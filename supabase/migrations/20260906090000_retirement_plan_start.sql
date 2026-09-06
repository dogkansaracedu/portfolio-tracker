-- Retirement (Component 13) — starting a scenario as THE plan.
--
-- A scenario is a what-if until the user commits to it. Starting one freezes
-- three things on the row: the day it started, the portfolio total that day,
-- and the inputs as they stood. Without that freeze "am I on track?" has no
-- yardstick — every later edit to the scenario would silently move the line
-- the answer is measured against, and a plan you can edit into success is not
-- a plan.
--
-- One nullable jsonb column, not three columns or a second table: the frozen
-- inputs are the same client-owned shape `inputs` already stores, the whole
-- object is read and written as one unit, and nothing ever queries into it.
-- Null is the meaningful state (this scenario was never started), so no
-- default and no NOT NULL.
--
-- No RLS change: the table's four row-level policies are column-agnostic
-- (auth.uid() = user_id), so they already cover this column.

ALTER TABLE public.retirement_scenarios
  ADD COLUMN IF NOT EXISTS plan_start jsonb;

COMMENT ON COLUMN public.retirement_scenarios.plan_start IS
  'The frozen plan: the day this scenario was started as THE plan, the portfolio total it was anchored at, and the inputs at that moment. Mirrors RetirementPlanStart in src/lib/retirement/scenario.ts. NULL = the scenario has not been started as a plan. Starting an already-started scenario overwrites this.';
