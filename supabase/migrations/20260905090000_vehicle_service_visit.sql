-- Vehicle (Component 17) — the periodic service becomes a first-class thing.
--
-- It shipped as one row among seventeen in the plan, which is not what it is.
-- The service visit is the EVENT the rest of the plan happens at: parts are
-- replaced at one, wear items are checked at one, and the question an owner
-- actually has is not "what is due today" but "when I go in at 157,000 km,
-- what will be due by then?" — which is a different query, over a future
-- point, that a flat list of rows cannot answer.
--
-- Modelled as a third `item_kind` rather than new interval columns on
-- `vehicles`. The cadence is a km/month pair with whichever-comes-first
-- semantics, projected from the car's pace — exactly what a maintenance item
-- already is, and exactly what the schedule engine already computes. Putting
-- the same pair on the vehicle would fork that logic across two shapes for no
-- gain. One row keeps its meaning; only its `kind` says it is the visit.
--
-- The plan list excludes it (it is not a part), and the form's kind picker
-- excludes it too: there is one service cadence per car, and it is not
-- something to create a second of by hand.

ALTER TABLE public.vehicle_maintenance_items DROP CONSTRAINT vehicle_maintenance_items_item_kind_check;

ALTER TABLE public.vehicle_maintenance_items ADD CONSTRAINT vehicle_maintenance_items_item_kind_check
  CHECK (item_kind IN ('service', 'inspect', 'service_visit'));

COMMENT ON COLUMN public.vehicle_maintenance_items.item_kind IS
  'What happens at the interval: service (replaced, renewed, paid, performed), inspect (looked at, usually found fine), or service_visit (the periodic service itself — at most one per vehicle, shown as its own surface rather than as a row in the plan).';

-- Promote the seeded row. Matched on name because that is what created it;
-- anything else stays a plain item.
UPDATE public.vehicle_maintenance_items
   SET item_kind = 'service_visit'
 WHERE name ILIKE 'periodic service'
    OR name ILIKE 'periyodik bakım'
    OR name ILIKE 'periyodik bakim';

-- At most one per vehicle: the card shows "the" next service, and two rows
-- claiming to be it would make that arbitrary.
CREATE UNIQUE INDEX idx_vehicle_one_service_visit
  ON public.vehicle_maintenance_items(vehicle_id)
  WHERE item_kind = 'service_visit';
