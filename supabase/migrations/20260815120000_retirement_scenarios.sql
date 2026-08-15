-- Retirement scenarios — the saved input sets behind Component 13 (Retirement
-- Planning). A scenario is a named, per-user bag of planning inputs; nothing the
-- component computes is stored, outputs are always recomputed from `inputs`.
--
-- `inputs` is jsonb rather than a wide column set on purpose: the input shape is
-- owned by the client contract (RetirementScenarioInputs in
-- src/lib/retirement/types.ts) and evolves with the planner — options are a
-- variable-length list and no query ever filters or joins on an individual
-- assumption. Rows are read whole, by user.
--
-- "Exactly one default per user" is enforced by the partial unique index below,
-- not by application code. Consequence for writers: clear the old default first,
-- then set the new one — the reverse order trips the index mid-statement.

CREATE TABLE public.retirement_scenarios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (LENGTH(BTRIM(name)) > 0),
  is_default boolean NOT NULL DEFAULT false,
  inputs     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.retirement_scenarios IS
  'Named per-user retirement planning input sets (Component 13). `inputs` mirrors RetirementScenarioInputs in src/lib/retirement/types.ts. At most one row per user has is_default = true.';

-- ─── Indexes ────────────────────────────────────────────────────────
-- Per-user lookup: covers the only read path (all scenarios for one user,
-- newest first), the RLS predicate, and the auth.users foreign key — Postgres
-- does not index FK columns automatically, and an unindexed one turns user
-- deletion into a sequential scan.
CREATE INDEX idx_retirement_scenarios_user_created
  ON public.retirement_scenarios(user_id, created_at);

-- Exactly one default per user. Partial: only the default rows are indexed, so
-- the non-default majority costs nothing to keep unique.
CREATE UNIQUE INDEX idx_retirement_scenarios_one_default_per_user
  ON public.retirement_scenarios(user_id)
  WHERE is_default;

-- ─── Row Level Security ─────────────────────────────────────────────
ALTER TABLE public.retirement_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY retirement_scenarios_select ON public.retirement_scenarios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY retirement_scenarios_insert ON public.retirement_scenarios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY retirement_scenarios_update ON public.retirement_scenarios FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY retirement_scenarios_delete ON public.retirement_scenarios FOR DELETE USING (auth.uid() = user_id);
