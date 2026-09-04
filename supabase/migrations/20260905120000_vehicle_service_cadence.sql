-- Vehicle (Component 17) — items measured in SERVICES, and oil split from filter.
--
-- Most things in the periodic-service group are done at every service. The
-- diesel fuel filter is done at every OTHER one. That cannot be derived from
-- the km intervals: 40,000 km against a 15,000 km service is 2.67 services,
-- while the trade rule is plainly "every second service". So the cadence in
-- services is its own small fact and has to be stated.
--
-- Narrow on purpose. `every_n_services` decides two things and nothing else:
--   - whether logging a service pre-ticks the item, and
--   - whether the service card says it is due this time.
-- It is NOT folded into `interval_used`, which stays distance and time. An
-- item's meter still answers "how far through its own interval is it", and
-- this answers "is it this service's turn" — different questions, and merging
-- them would make a three-dimensional percentage nobody could reason about.

ALTER TABLE public.vehicle_maintenance_items
  ADD COLUMN every_n_services integer CHECK (every_n_services > 0);

COMMENT ON COLUMN public.vehicle_maintenance_items.every_n_services IS
  'How many periodic services pass between this item being done: 1 = every service, 2 = every other. NULL = not tied to the service rhythm at all (a belt, an annual policy), which is the default. Drives the pre-tick and the "due this service" line only; never the interval-used percentage.';

-- Everything in the periodic-service group is done at every service...
UPDATE public.vehicle_maintenance_items
   SET every_n_services = 1
 WHERE item_group = 'routine'
   AND item_kind <> 'service_visit';

-- ...except the fuel filter, which is every second one.
UPDATE public.vehicle_maintenance_items
   SET every_n_services = 2
 WHERE name ILIKE '%fuel filter%'
    OR name ILIKE '%mazot filtre%'
    OR name ILIKE '%yakıt filtre%';

-- ─── Oil and its filter are two items ───────────────────────────────
-- They are bought separately, they can be done separately (a top-up is not a
-- filter change), and a plan that welds them together cannot record either
-- one on its own.
UPDATE public.vehicle_maintenance_items
   SET name = 'Engine oil'
 WHERE name ILIKE 'engine oil & filter'
    OR name ILIKE 'engine oil and filter'
    OR name ILIKE 'motor yağı ve filtre%';

-- The new sibling inherits the oil row's interval, group, kind and cadence,
-- and — importantly — every completion the oil row already has: a service that
-- changed "oil & filter" changed both, so its history is theirs jointly.
INSERT INTO public.vehicle_maintenance_items
  (user_id, vehicle_id, name, item_group, item_kind, cost_category,
   interval_km, interval_months, every_n_services, sort_order, note)
SELECT user_id, vehicle_id, 'Oil filter', item_group, item_kind, cost_category,
       interval_km, interval_months, every_n_services, sort_order, note
  FROM public.vehicle_maintenance_items
 WHERE name = 'Engine oil';

INSERT INTO public.vehicle_cost_entry_items (cost_entry_id, item_id)
SELECT l.cost_entry_id, f.id
  FROM public.vehicle_cost_entry_items l
  JOIN public.vehicle_maintenance_items o ON o.id = l.item_id
  JOIN public.vehicle_maintenance_items f
       ON f.vehicle_id = o.vehicle_id AND f.name = 'Oil filter'
 WHERE o.name = 'Engine oil'
ON CONFLICT DO NOTHING;
