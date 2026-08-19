-- Interest positions (Component 16) — the user's private notebook of what they
-- have committed somewhere to earn a return: crypto staking, a stablecoin
-- flexible-earn balance, a fiat time deposit at a bank, tokenized-gold earn.
--
-- Per-user and hand-entered: unlike `campaigns` (global, service-written claims
-- found on the web), every row here is the user's own note that they took an
-- offer. Standard four `auth.uid() = user_id` RLS policies, same shape as
-- `retirement_scenarios`.
--
-- THE BOUNDARY RULE: a row in this table creates no transaction and changes no
-- holding, balance or P&L figure. The asset is already counted by the holding it
-- sits in; every currency figure shown next to a position is derived at display
-- time from the live price and the recorded rate. Nothing here is ever booked.
--
-- Status (flexible / active / ends soon / expired) is derived from `expires_at`
-- on every read and deliberately NOT stored — a stored status would be wrong the
-- morning after it was written.

CREATE TABLE public.interest_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Real FKs (unlike `campaigns`, whose ticker/platform are free text from
  -- research): the user picks both from their own catalog. Cascade on delete,
  -- matching `holdings` / `transactions`.
  asset_id    uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  quantity    numeric NOT NULL,
  apr         numeric,          -- percent, e.g. 5.25; NULL when unrated
  apr_kind    text,             -- 'fixed' | 'variable' | 'up_to' (NULL iff apr NULL)
  label       text,             -- program name, "OKX TR fixed 105d"
  started_at  date NOT NULL DEFAULT current_date,
  expires_at  date,             -- NULL = flexible / no expiry, never warns
  -- Optional provenance, ON DELETE SET NULL: campaign rows are replaced
  -- wholesale by each research run and the user's note must outlive them.
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  note        text,
  -- Soft archive for a matured or redeemed position: it leaves every default
  -- list and stops warning, but stays as history.
  is_closed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.interest_positions IS
  'Per-user notes on assets committed to earn a return (Component 16). Informational only: never creates transactions and never affects holdings, balances or P&L. Status is derived from expires_at at read time, never stored.';

-- ─── Indexes ────────────────────────────────────────────────────────
-- Covers the only read path (one user's rows, split by open/closed), the RLS
-- predicate, and the auth.users foreign key — Postgres does not index FK
-- columns automatically, and an unindexed one turns user deletion into a
-- sequential scan.
CREATE INDEX idx_interest_positions_user_open
  ON public.interest_positions(user_id, is_closed);

-- ─── Row Level Security ─────────────────────────────────────────────
ALTER TABLE public.interest_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY interest_positions_select ON public.interest_positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY interest_positions_insert ON public.interest_positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY interest_positions_update ON public.interest_positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY interest_positions_delete ON public.interest_positions FOR DELETE USING (auth.uid() = user_id);
