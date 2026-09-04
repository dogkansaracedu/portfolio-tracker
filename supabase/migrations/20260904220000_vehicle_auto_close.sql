-- Vehicle (Component 17) — two simplifications to how an outlay closes an item.
--
-- 1. TYRES STOPS BEING A COST CATEGORY. It was one because AAA separates tyres
--    in its own cost breakdown, but that breakdown card no longer exists, and
--    both tyres and maintenance are variable costs — so the split bought a
--    dropdown row and changed no figure. Tyre spend is maintenance spend.
--
-- 2. AN ITEM CAN DECLARE WHICH KIND OF OUTLAY CLOSES IT (`cost_category`).
--    Paying MTV means the MTV instalment is done; there is nothing to choose.
--    Only a service visit is genuinely ambiguous — one visit closes an
--    arbitrary combination of parts — so only maintenance needs a selector.
--
--    Deliberately nullable and deliberately un-CHECKed. Null means "this item
--    is only ever closed by hand", which is every real maintenance item. No
--    CHECK because the value mirrors `vehicle_cost_entries.category`, and two
--    constraints over one vocabulary drift apart the moment either changes.

-- ─── 1. Fold tyres into maintenance ─────────────────────────────────
UPDATE public.vehicle_cost_entries SET category = 'maintenance'
 WHERE category = 'tyres';

ALTER TABLE public.vehicle_cost_entries DROP CONSTRAINT vehicle_cost_entries_category_check;

ALTER TABLE public.vehicle_cost_entries ADD CONSTRAINT vehicle_cost_entries_category_check
  CHECK (category IN (
    'fuel', 'maintenance', 'insurance', 'tax', 'inspection',
    'fine', 'parking', 'other'
  ));

-- ─── 2. Which outlay closes an item automatically ───────────────────
ALTER TABLE public.vehicle_maintenance_items
  ADD COLUMN cost_category text;

COMMENT ON COLUMN public.vehicle_maintenance_items.cost_category IS
  'The vehicle_cost_entries.category whose outlays close this item without being asked. Set for the recurring obligations, where an outlay of that kind can only mean one thing. NULL for everything else, which is closed by ticking it on a cost entry — a service visit closes an arbitrary combination of parts, so it has to be chosen.';

-- Backfill by name. Anything unrecognised stays NULL, i.e. hand-selected,
-- which is the safe default: an item that auto-closes when it should not have
-- would silently reset an interval the owner never touched.
UPDATE public.vehicle_maintenance_items SET cost_category = 'tax'
 WHERE name ILIKE '%MTV%';

UPDATE public.vehicle_maintenance_items SET cost_category = 'insurance'
 WHERE name ILIKE '%sigorta%' OR name ILIKE '%kasko%';

UPDATE public.vehicle_maintenance_items SET cost_category = 'inspection'
 WHERE name ILIKE '%muayene%' OR name ILIKE '%TUVTURK%' OR name ILIKE '%TÜVTÜRK%';
