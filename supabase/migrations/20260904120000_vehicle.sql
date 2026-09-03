-- Vehicle (Component 17) — the real cost of owning a car, and the periodic
-- maintenance schedule that says what is due next.
--
-- THE BOUNDARY RULE (third time, after Components 15 and 16): a row in any of
-- these tables creates no transaction and changes no holding, balance, net
-- worth or P&L figure. A car is consumption with a resale value, not a
-- position. Nothing here is ever booked.
--
-- It does not touch budgeting either. Component 14 is a RESIDUAL model
-- (spent = income − invested), so car spending is ALREADY inside that
-- residual; this component explains part of it and never adds to it. That is
-- also why the ledger is called `vehicle_cost_entries` and its rows are "cost
-- entries", not "expenses" — `cashflow_entries.type = 'expense'` is reserved
-- for Component 14's own future ledger and the two terms must not collide.
--
-- ONE LEDGER, not two. Every outlay is a `vehicle_cost_entries` row, and a row
-- MAY additionally close one or more maintenance items (via the join table).
-- So an oil change is one row that both costs ₺4,500 and resets the oil
-- interval; a fuel fill is one row that closes nothing; and "I changed the
-- drive belt at 130,000 km but don't recall the price" is one row with a NULL
-- amount that still resets the belt. Splitting cost from schedule would have
-- meant recording that visit twice.
--
-- Everything derived is derived on READ and never stored: current odometer,
-- average km/day, an item's next-due point, its interval-used %, its status,
-- and every cost figure. A stored status is wrong the morning after it is
-- written (the lesson Component 16 records for its own status ladder).

-- ─── vehicles ───────────────────────────────────────────────────────
CREATE TABLE public.vehicles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  plate               text,
  make                text,
  model               text,
  model_year          integer,

  -- Purchase: the capital side. `purchase_odometer` is the baseline for
  -- "km driven since purchase" — a used car does not start at zero.
  purchased_on        date NOT NULL,
  purchase_price      numeric NOT NULL CHECK (purchase_price >= 0),
  purchase_currency   text NOT NULL,
  purchase_odometer   numeric NOT NULL DEFAULT 0 CHECK (purchase_odometer >= 0),

  -- Current market value, hand-entered with the date it was read. Valuation
  -- CANNOT be automated for Turkey: TSB's Kasko Değer Listesi is free and
  -- key-free but is a monthly HTML query plus a file download rather than an
  -- API (and covers only cars up to 15 model years old); arabam.com disallows
  -- bots in robots.txt and sahibinden.com returns 403 to everything. So the
  -- owner reads the value and types it, exactly as `price_source = 'manual'`
  -- assets already work.
  current_value          numeric CHECK (current_value >= 0),
  current_value_currency text,
  current_value_at       date,

  -- The latest hand-entered odometer reading. Deliberately NOT a separate
  -- readings table: cost entries carry their own optional odometer, and the
  -- pair below covers the "I drove but bought nothing" case that Drivvo needs
  -- a whole record type for. Current odometer is the freshest of the two
  -- sources, resolved at read time.
  odometer            numeric CHECK (odometer >= 0),
  odometer_at         date,

  note                text,
  -- Soft archive for a sold car: it leaves every default list but stays as
  -- history. Same reversible archive as `interest_positions.is_closed`.
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- A value figure is meaningless without the date it was read on, and the
  -- currency it is quoted in. Either all three are present or none are.
  CONSTRAINT vehicles_current_value_complete CHECK (
    (current_value IS NULL AND current_value_currency IS NULL AND current_value_at IS NULL)
    OR (current_value IS NOT NULL AND current_value_currency IS NOT NULL AND current_value_at IS NOT NULL)
  ),
  -- Same rule for the odometer: a reading with no date cannot be compared
  -- against any other reading, so it cannot establish "current".
  CONSTRAINT vehicles_odometer_complete CHECK (
    (odometer IS NULL AND odometer_at IS NULL)
    OR (odometer IS NOT NULL AND odometer_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.vehicles IS
  'Vehicle (Component 17) — one car per row, per user. Informational only: never creates transactions and never affects holdings, balances, net worth or P&L. Market value is hand-entered (no free Turkish valuation API exists).';

-- ─── vehicle_maintenance_items ──────────────────────────────────────
-- The periodic maintenance plan: one row per recurring item, each with its own
-- interval. Per-item intervals, not per-milestone bundles — Carfax teaches the
-- "30-60-90" milestone view in its articles but its engine computes each item
-- independently, and Fuelly and Drivvo are per-item throughout.
--
-- BLANK MEANS "DON'T TRACK THIS DIMENSION" (Fuelly's design, adopted verbatim):
-- there is deliberately no `track_by: km | months | both` enum.
--   interval_km set,     interval_months NULL → distance-only (drive belt)
--   interval_km NULL,    interval_months set  → time-only (brake fluid, muayene)
--   both set                                  → whichever comes first
--   both NULL                                 → dormant; never becomes due
-- One fewer column, one fewer invariant to keep, and the "stop tracking this"
-- gesture is the same gesture as configuring it.
--
-- Intervals are free numeric entry, never a picker. Carfax offers tire
-- rotation only at 5,000 or 7,500 miles, so it cannot represent what a given
-- owner's own mechanic told them — a schedule engine less expressive than
-- reality gets abandoned.
CREATE TABLE public.vehicle_maintenance_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  interval_km     numeric CHECK (interval_km > 0),
  interval_months numeric CHECK (interval_months > 0),
  -- Display order within the plan; ties fall back to name.
  sort_order      integer NOT NULL DEFAULT 0,
  note            text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vehicle_maintenance_items IS
  'Vehicle (Component 17) periodic maintenance plan. A NULL interval column means that dimension is not tracked (both NULL = dormant); no track_by enum exists. Next-due, interval-used % and status are all derived at read time.';

-- ─── vehicle_cost_entries ───────────────────────────────────────────
-- Every outlay against a vehicle, in the currency it was actually paid in.
-- Normalized to the USD anchor at EACH ENTRY'S OWN DATE rate at read time —
-- the convention Component 14 already uses — never at today's rate. That is
-- what makes depreciation and running cost honest in a currency that moved:
-- a car whose nominal TRY value is flat has still lost a third of its real
-- value since 2024.
CREATE TABLE public.vehicle_cost_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id   uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date         date NOT NULL,
  -- Free-form text with a CHECK, matching how the app treats asset category:
  -- relaxing a CHECK is a one-line migration, a wrong early shape is not.
  category     text NOT NULL CHECK (category IN (
                 'fuel', 'maintenance', 'insurance', 'tax', 'inspection',
                 'tyres', 'fine', 'parking', 'other'
               )),
  -- NULLABLE on purpose, and this is load-bearing: it lets the owner record
  -- work whose price they no longer remember ("belt done at 130,000 km") so
  -- the interval still resets. A NULL contributes nothing to any cost total —
  -- it is not zero. Drivvo's inability to log a zero-cost fill is a 1-star
  -- review; this is the same failure one step further out.
  amount       numeric CHECK (amount >= 0),
  currency     text NOT NULL,
  -- Optional, but every reading improves the km projections, so the UI asks.
  odometer     numeric CHECK (odometer >= 0),
  -- Fuel only. `litres` + `is_full_tank` exist solely so consumption can be
  -- computed full-tank-to-full-tank; a partial fill cannot close a tank, so
  -- it contributes distance but yields no reading of its own.
  litres       numeric CHECK (litres > 0),
  is_full_tank boolean NOT NULL DEFAULT false,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Litres and the full-tank flag are meaningless outside a fuel row.
  CONSTRAINT vehicle_cost_entries_fuel_only CHECK (
    category = 'fuel' OR (litres IS NULL AND is_full_tank = false)
  )
);

COMMENT ON TABLE public.vehicle_cost_entries IS
  'Vehicle (Component 17) cost ledger — one row per outlay, in the currency paid, normalized to USD at the entry date''s own rate. A NULL amount means "work done, price not recorded" and still resets any maintenance item the row closes. Never a transaction; never affects holdings or P&L.';

CREATE INDEX idx_vehicle_cost_entries_vehicle_date
  ON public.vehicle_cost_entries(vehicle_id, date);

-- Covers the RLS predicate and the auth.users FK — Postgres does not index FK
-- columns automatically, and an unindexed one turns user deletion into a scan.
CREATE INDEX idx_vehicle_cost_entries_user
  ON public.vehicle_cost_entries(user_id);
CREATE INDEX idx_vehicle_maintenance_items_user
  ON public.vehicle_maintenance_items(user_id);
CREATE INDEX idx_vehicle_maintenance_items_vehicle
  ON public.vehicle_maintenance_items(vehicle_id, sort_order);
CREATE INDEX idx_vehicles_user_active
  ON public.vehicles(user_id, is_active);

-- ─── vehicle_cost_entry_items ───────────────────────────────────────
-- Which maintenance items a cost entry closed. One servis visit resets several
-- intervals, so this is many-to-many.
--
-- An interval resets ONLY for the items a row actually names — the exact-match
-- rule Fuelly had to ship a fix for. Its old reminders counted down and reset
-- themselves when the timer hit zero whether or not the work was done, which
-- is precisely the bug that makes a maintenance tracker lie to you.
CREATE TABLE public.vehicle_cost_entry_items (
  cost_entry_id uuid NOT NULL REFERENCES public.vehicle_cost_entries(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.vehicle_maintenance_items(id) ON DELETE CASCADE,
  PRIMARY KEY (cost_entry_id, item_id)
);

COMMENT ON TABLE public.vehicle_cost_entry_items IS
  'Vehicle (Component 17) — which maintenance items a cost entry closed. An item''s interval resets only when a row names it explicitly (never on a timer).';

-- The lookup that actually runs: "for this item, which entries closed it?"
-- (the PK already covers the other direction).
CREATE INDEX idx_vehicle_cost_entry_items_item
  ON public.vehicle_cost_entry_items(item_id);

-- ─── Row Level Security ─────────────────────────────────────────────
-- Owner-only, all four verbs, same per-user shape as `interest_positions`.
-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once per
-- statement instead of once per row.
ALTER TABLE public.vehicles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_cost_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_cost_entry_items   ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicles_select ON public.vehicles FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicles_insert ON public.vehicles FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicles_update ON public.vehicles FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicles_delete ON public.vehicles FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY vehicle_maintenance_items_select ON public.vehicle_maintenance_items FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicle_maintenance_items_insert ON public.vehicle_maintenance_items FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicle_maintenance_items_update ON public.vehicle_maintenance_items FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicle_maintenance_items_delete ON public.vehicle_maintenance_items FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY vehicle_cost_entries_select ON public.vehicle_cost_entries FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicle_cost_entries_insert ON public.vehicle_cost_entries FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicle_cost_entries_update ON public.vehicle_cost_entries FOR UPDATE USING ((SELECT auth.uid()) = user_id);
CREATE POLICY vehicle_cost_entries_delete ON public.vehicle_cost_entries FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- The join table carries no user_id of its own; ownership is inherited from
-- the cost entry it points at, checked with an EXISTS against that table
-- (whose own RLS keeps the row invisible to anyone else anyway).
CREATE POLICY vehicle_cost_entry_items_select ON public.vehicle_cost_entry_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vehicle_cost_entries e
    WHERE e.id = cost_entry_id AND e.user_id = (SELECT auth.uid())
  ));
CREATE POLICY vehicle_cost_entry_items_insert ON public.vehicle_cost_entry_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vehicle_cost_entries e
    WHERE e.id = cost_entry_id AND e.user_id = (SELECT auth.uid())
  ));
CREATE POLICY vehicle_cost_entry_items_delete ON public.vehicle_cost_entry_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.vehicle_cost_entries e
    WHERE e.id = cost_entry_id AND e.user_id = (SELECT auth.uid())
  ));
