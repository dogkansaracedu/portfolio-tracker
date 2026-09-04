-- Vehicle (Component 17) — inspect vs replace.
--
-- Some plan items are not renewed on their interval, they are LOOKED AT on it.
-- Brake pads are the clear case: at 30,000 km they are very probably fine, so
-- the interval is not "replace them now", it is "have them checked at the next
-- periodic service". Recording that check must reset the reminder without
-- claiming a part was fitted.
--
-- The arithmetic is identical either way — interval from the last event — so
-- this column changes no due date. What it changes is what the row SAYS, which
-- is what decides what the owner does about it: "next due at 158,000 km" reads
-- as an instruction to buy pads; "next check at 158,000 km" reads correctly.
--
-- Neither Carfax nor Fuelly models this: in both, the verb lives inside the
-- item's name string ("Inspect belts, hoses and valves" vs "Replace spark
-- plugs"), which is why their schedules cannot sort or style by it.
--
-- Two values only. `service` covers everything that is DONE — a part replaced,
-- a fluid renewed, a policy paid, the periodic service itself — and keeps the
-- neutral "last done / next due" wording that already reads correctly for all
-- of them. `inspect` is the one that needed a name.

ALTER TABLE public.vehicle_maintenance_items
  ADD COLUMN item_kind text NOT NULL DEFAULT 'service'
    CHECK (item_kind IN ('service', 'inspect'));

COMMENT ON COLUMN public.vehicle_maintenance_items.item_kind IS
  'What happens at the interval: service (replaced, renewed, paid, performed — "last done / next due") or inspect (looked at, usually found fine — "last checked / next check"). Affects wording only; due dates are computed identically.';

-- Brake pads and discs are the items this exists for, and the seeded notes
-- already said so in prose ("treat this as a prompt to have them looked at").
-- Their intervals move to the periodic-service cadence at the same time: the
-- point is that they are checked whenever the car is in for a service, not
-- that they wear out on a schedule.
UPDATE public.vehicle_maintenance_items
   SET item_kind = 'inspect',
       interval_km = 15000,
       interval_months = 12
 WHERE name ILIKE '%brake pad%'
    OR name ILIKE '%brake disc%'
    OR name ILIKE '%fren balata%'
    OR name ILIKE '%disk%';
