-- Bulk-insert transactions in a single round-trip.
--
-- The full-page spreadsheet editor (/transactions/edit) lets the user
-- paste / type N rows then click Save. The original path was a TS loop
-- of createTransaction → ensureHistoricalRate → fiat-lookup → child
-- insert → recalculateBalance — ~9 round-trips per row. This RPC
-- consolidates the database work into one atomic call:
--   1. Insert every parent row.
--   2. For each sell (always) and buy with funding_platform_id (R2),
--      insert the auto-paired cash-side child on the right fiat asset.
--   3. Recompute the holdings.balance for every (asset_id, platform_id)
--      touched, exactly once.
--   4. Return (row_index, tx_id) so the client can map local row keys
--      back to the new DB ids in one shot.
--
-- SECURITY INVOKER + auth.uid() guard: the function runs with the
-- caller's role so the existing RLS policies on transactions/holdings
-- still apply for the INSERTs done inside. We additionally reject any
-- payload missing auth.uid() so anon callers can't poke this.

CREATE OR REPLACE FUNCTION public.bulk_insert_transactions(p_rows jsonb)
RETURNS TABLE(row_index int, tx_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row jsonb;
  v_tx_id uuid;
  v_idx int := -1;

  -- Per-row scratch
  v_asset_id          uuid;
  v_platform_id       uuid;
  v_type              public.transaction_type;
  v_date              timestamptz;
  v_amount            numeric;
  v_unit_price        numeric;
  v_price_currency    text;
  v_total_cost        numeric;
  v_fee               numeric;
  v_fee_currency      text;
  v_related_asset_id  uuid;
  v_notes             text;
  v_funding_platform_id uuid;

  -- Cash-side scratch
  v_needs_child       boolean;
  v_cash_asset_id     uuid;
  v_cash_type         public.transaction_type;
  v_cash_platform_id  uuid;
  v_same_currency_fee boolean;
  v_fee_for_cash      numeric;
  v_cash_amount       numeric;

  -- Lens-tracking ((asset_id, platform_id) pairs to recompute at the end)
  v_lens text;
  v_lenses text[] := '{}';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;

  -- ── Phase 1 + 2: insert parents (and cash children where required) ──
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_idx := v_idx + 1;

    v_asset_id           := (v_row->>'asset_id')::uuid;
    v_platform_id        := (v_row->>'platform_id')::uuid;
    v_type               := (v_row->>'type')::public.transaction_type;
    v_date               := (v_row->>'date')::timestamptz;
    v_amount             := (v_row->>'amount')::numeric;
    v_unit_price         := (v_row->>'unit_price')::numeric;
    v_price_currency     := COALESCE(v_row->>'price_currency', 'USD');
    v_total_cost         := (v_row->>'total_cost')::numeric;
    v_fee                := COALESCE((v_row->>'fee')::numeric, 0);
    v_fee_currency       := NULLIF(v_row->>'fee_currency', '');
    v_related_asset_id   := NULLIF(v_row->>'related_asset_id', '')::uuid;
    v_notes              := NULLIF(v_row->>'notes', '');
    v_funding_platform_id:= NULLIF(v_row->>'funding_platform_id', '')::uuid;

    -- The RPC never inserts cash rows from the client payload directly —
    -- it always derives them from the parent type. Reject any attempt to
    -- pass cash_credit/cash_debit so the cash-pairing invariant stays
    -- single-sourced.
    IF v_type IN ('cash_credit', 'cash_debit') THEN
      RAISE EXCEPTION
        'bulk_insert_transactions does not accept cash rows directly (row %)', v_idx;
    END IF;

    INSERT INTO public.transactions (
      user_id, asset_id, platform_id, type, date, amount,
      unit_price, price_currency, total_cost, fee, fee_currency,
      related_asset_id, linked_tx_id, notes
    )
    VALUES (
      v_user_id, v_asset_id, v_platform_id, v_type, v_date, v_amount,
      v_unit_price, v_price_currency, v_total_cost, v_fee, v_fee_currency,
      v_related_asset_id, NULL, v_notes
    )
    RETURNING id INTO v_tx_id;

    -- Track parent lens for the final balance recompute
    v_lens := v_asset_id::text || '::' || v_platform_id::text;
    IF NOT (v_lens = ANY(v_lenses)) THEN
      v_lenses := array_append(v_lenses, v_lens);
    END IF;

    -- Mirrors lib/cash.ts:shouldCreateChild — sells always, buys only
    -- with a funding platform.
    v_needs_child := (v_type = 'sell')
                  OR (v_type = 'buy' AND v_funding_platform_id IS NOT NULL);

    IF v_needs_child THEN
      -- Resolve fiat asset for price_currency, same rule as
      -- lib/cash.ts:resolveFiatAsset. We trust the seed function to have
      -- created USD/TRY/EUR rows for every user.
      SELECT id INTO v_cash_asset_id
      FROM public.assets
      WHERE user_id = v_user_id
        AND category = 'fiat'
        AND ticker = v_price_currency
      LIMIT 1;
      IF v_cash_asset_id IS NULL THEN
        RAISE EXCEPTION
          'fiat asset row missing for % (row %); check seed_user_data', v_price_currency, v_idx;
      END IF;

      -- Same-currency fee participates in the cash amount;
      -- cross-currency fee falls back to total_cost only (matches
      -- lib/cash.ts:computeCashAmount).
      v_same_currency_fee := v_fee_currency IS NULL
                          OR v_fee_currency = v_price_currency;
      v_fee_for_cash := CASE WHEN v_same_currency_fee THEN v_fee ELSE 0 END;

      IF v_type = 'sell' THEN
        v_cash_amount      := v_total_cost - v_fee_for_cash;
        v_cash_type        := 'cash_credit';
        v_cash_platform_id := v_platform_id;
      ELSE
        v_cash_amount      := v_total_cost + v_fee_for_cash;
        v_cash_type        := 'cash_debit';
        v_cash_platform_id := v_funding_platform_id;
      END IF;

      INSERT INTO public.transactions (
        user_id, asset_id, platform_id, type, date, amount,
        unit_price, price_currency, total_cost, fee, fee_currency,
        related_asset_id, linked_tx_id, notes
      )
      VALUES (
        v_user_id, v_cash_asset_id, v_cash_platform_id, v_cash_type, v_date,
        v_cash_amount, 1, v_price_currency, v_cash_amount, 0, NULL,
        NULL, v_tx_id, NULL
      );

      v_lens := v_cash_asset_id::text || '::' || v_cash_platform_id::text;
      IF NOT (v_lens = ANY(v_lenses)) THEN
        v_lenses := array_append(v_lenses, v_lens);
      END IF;
    END IF;

    -- Yield (index, tx_id) so the client can patch its local row state
    row_index := v_idx;
    tx_id     := v_tx_id;
    RETURN NEXT;
  END LOOP;

  -- ── Phase 3: recompute balances for every (asset, platform) touched ──
  -- Same formula as lib/balance.ts:recalculateBalance — kept in lock-step
  -- with the constants in lib/constants/transaction-types.ts (ADD_TYPES /
  -- SUBTRACT_TYPES). If those sets ever change, this function must be
  -- updated in tandem.
  DECLARE
    v_parts text[];
    v_a uuid;
    v_p uuid;
  BEGIN
    FOREACH v_lens IN ARRAY v_lenses LOOP
      v_parts := string_to_array(v_lens, '::');
      v_a := v_parts[1]::uuid;
      v_p := v_parts[2]::uuid;

      INSERT INTO public.holdings (user_id, asset_id, platform_id, balance, updated_at)
      SELECT
        v_user_id,
        v_a,
        v_p,
        COALESCE(SUM(
          CASE
            WHEN type IN ('buy', 'transfer_in', 'dividend', 'interest', 'cash_credit')
              THEN amount
            WHEN type IN ('sell', 'transfer_out', 'fee', 'cash_debit')
              THEN -amount
            ELSE 0
          END
        ), 0),
        now()
      FROM public.transactions
      WHERE user_id = v_user_id
        AND asset_id = v_a
        AND platform_id = v_p
      ON CONFLICT (user_id, asset_id, platform_id)
      DO UPDATE SET balance = EXCLUDED.balance, updated_at = now();
    END LOOP;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_insert_transactions(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bulk_insert_transactions(jsonb) TO authenticated;
