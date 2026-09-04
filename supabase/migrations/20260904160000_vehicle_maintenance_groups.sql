-- Vehicle (Component 17) — group the maintenance plan.
--
-- A plan of fourteen items is a flat list of three quite different things: the
-- consumables replaced at every service, the long-life parts replaced once in
-- several years, and the legal obligations that are not maintenance at all but
-- do recur on a clock. Grouping them lets the plan be read a group at a time.
--
-- Called `item_group`, NOT `category`: `vehicle_cost_entries.category` already
-- owns that word for what an outlay was *for*, and one concept per term is a
-- house rule. A cost entry's category and an item's group are different axes —
-- an `inspection` cost closes an `obligations` item, a `maintenance` cost can
-- close either a `routine` or a `long_life` one.
--
-- Membership is about **kind**, not interval length. The fuel filter sits in
-- `routine` even though it is replaced every *other* service, because it is a
-- service consumable and that is where an owner looks for it; its 40,000 km
-- interval is unchanged and does the actual work of deciding when it is due.

ALTER TABLE public.vehicle_maintenance_items
  ADD COLUMN item_group text NOT NULL DEFAULT 'routine'
    CHECK (item_group IN ('routine', 'long_life', 'obligations'));

COMMENT ON COLUMN public.vehicle_maintenance_items.item_group IS
  'Which part of the plan an item belongs to: routine (replaced at every service), long_life (replaced once in several years), obligations (insurance, tax, inspection — recurring but not maintenance). Distinct from vehicle_cost_entries.category, which describes an outlay rather than an item.';

-- The default is `routine` because a hand-added item usually is one, and
-- because it is the only value that is never wrong in a way that hides
-- something: a long-life part mis-filed as routine still shows its own
-- interval, whereas defaulting to `obligations` would file real maintenance
-- under paperwork.

-- Backfill the seeded plan by name. Anything the app seeded matches one of
-- these; a hand-named item keeps the `routine` default and can be re-grouped
-- from the item form.
UPDATE public.vehicle_maintenance_items SET item_group = 'obligations'
 WHERE name ILIKE '%muayene%'
    OR name ILIKE '%sigorta%'
    OR name ILIKE '%kasko%'
    OR name ILIKE '%MTV%';

UPDATE public.vehicle_maintenance_items SET item_group = 'long_life'
 WHERE name ILIKE '%belt%'
    OR name ILIKE '%kayı%'
    OR name ILIKE '%brake fluid%'
    OR name ILIKE '%coolant%'
    OR name ILIKE '%antifreeze%'
    OR name ILIKE '%antifriz%'
    OR name ILIKE '%gearbox%'
    OR name ILIKE '%transmission%'
    OR name ILIKE '%şanzıman%'
    OR name ILIKE '%sanziman%'
    OR name ILIKE '%tyre%'
    OR name ILIKE '%tire%'
    OR name ILIKE '%lastik%'
    OR name ILIKE '%spark plug%'
    OR name ILIKE '%buji%';
