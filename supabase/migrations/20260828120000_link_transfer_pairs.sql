-- A transfer_out and the transfer_in it auto-creates are one real-world event.
-- Let transfer_in rows reference their transfer_out via linked_tx_id so the UI
-- can render the pair as a single "source → destination" row and edits/deletes
-- can keep the two sides in lockstep (ON DELETE CASCADE pairs deletion for
-- free, same as cash legs). Cash legs keep REQUIRING a parent; every other
-- type keeps forbidding one. A lone transfer_in (external deposit / opening
-- balance) stays unlinked, so for transfer_in the link is optional.
ALTER TABLE public.transactions
  DROP CONSTRAINT cash_row_must_have_parent;

ALTER TABLE public.transactions
  ADD CONSTRAINT linked_tx_allowed CHECK (
    (type IN ('cash_credit', 'cash_debit') AND linked_tx_id IS NOT NULL)
    OR type = 'transfer_in'
    OR (
      type NOT IN ('cash_credit', 'cash_debit', 'transfer_in')
      AND linked_tx_id IS NULL
    )
  );

-- Backfill existing pairs conservatively: same user/asset/date/amount,
-- different platforms, and the match is unambiguous (exactly one candidate on
-- both sides, and the transfer_out has no linked child yet — keeps the
-- one-child-per-parent invariant and makes re-runs idempotent). Ambiguous
-- pairs stay unlinked and keep rendering as two independent rows.
WITH ins AS (
  SELECT id, user_id, asset_id, date, amount, platform_id
  FROM public.transactions
  WHERE type = 'transfer_in' AND linked_tx_id IS NULL
),
outs AS (
  SELECT o.id, o.user_id, o.asset_id, o.date, o.amount, o.platform_id
  FROM public.transactions o
  WHERE o.type = 'transfer_out'
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions c WHERE c.linked_tx_id = o.id
    )
),
candidates AS (
  SELECT
    i.id AS in_id,
    o.id AS out_id,
    COUNT(*) OVER (PARTITION BY i.id) AS outs_for_in,
    COUNT(*) OVER (PARTITION BY o.id) AS ins_for_out
  FROM ins i
  JOIN outs o
    ON o.user_id = i.user_id
   AND o.asset_id = i.asset_id
   AND o.date = i.date
   AND o.amount = i.amount
   AND o.platform_id <> i.platform_id
)
UPDATE public.transactions t
SET linked_tx_id = c.out_id
FROM candidates c
WHERE t.id = c.in_id
  AND c.outs_for_in = 1
  AND c.ins_for_out = 1;
