# Handoff — Roll back `denomination`, keep everything else

> Hand this file to a fresh Claude session. Everything needed to continue is here.

## TL;DR

The fiat-as-system-currency + transfer-cost-UX feature shipped over 12 commits on `master` (range `69861fe4..bb62ed1`). The Mar 3 zero-cost transfer_in bug class is now structurally impossible (DB CHECK + modal auto-fill). USDT/USDC moved to `category='crypto'` so they get real FIFO P&L instead of the fiat short-circuit. `is_currency` is the system-managed flag that gates the P&L short-circuit and hides USD/TRY/EUR from user edit/delete.

We also shipped a `denomination` column on `assets` (USD/TRY/EUR) and a matching dropdown in `AssetForm`. **The user pushed back and is correct that this column is mostly dead weight** — see "The decision" below. The next session's job is to remove `denomination` cleanly while leaving everything else intact.

## Context anchors

- **Spec:** `docs/superpowers/specs/2026-05-15-fiat-and-transfer-cost-design.md` (still accurate for what shipped)
- **Plan:** `docs/superpowers/plans/2026-05-16-fiat-and-transfer-cost.md` (executed; reflects the version with `denomination`)
- **Supabase project:** `hhqwxygrtqcugaxamrtu` (remote, eu-central-1). Use the `mcp__plugin_supabase_supabase__*` MCP tools.
- **Branch:** `master` (no PR pipeline — solo project, commit-and-deploy direct)
- **Auto-memory:** see `memory/MEMORY.md` for user prefs (BigNumber discipline, no testing, skip PR ceremony, etc.)

## What shipped (12 commits)

```
acbf7b6  feat(schema):  is_currency + denomination + transfer_in cost CHECK
bdb5a94  fix(schema):   restore SECURITY DEFINER guards on seed_user_data
8fadbb2  types(asset):  add is_currency boolean and denomination literal
8166ea5  feat(pnl):     fiat short-circuit now gates on is_currency
870bd07  feat(modal):   auto-fill cost on currency transfers
93a8997  feat(modal):   FIFO-derived cost on paired non-currency transfers
444bd80  feat(modal):   require explicit cost on lone non-currency transfer_in
583599b  feat(modal):   prefill unit_price from cached market price
849ea4d  feat(assets):  denomination dropdown on asset form
c5b87e4  fix(assets):   hide edit/deactivate on system currency rows
c0b27f9  fix(modal):    gate auto-fill effects in edit mode + stabilize prefill
bb62ed1  fix(bn):       treat empty string as 0
```

The Mar 3 row (`4f0e315f-407f-4118-92ab-5a04c0197177`) was hot-fixed in the previous session via UPDATE — `unit_price=1, total_cost=2000, price_currency='USD'`. It's still correct.

## The decision: drop `denomination`

The user's argument (verbatim): *"we were already able to put in costs as in try or eur for example for gram gold i always put my cost in try. we can still fixate everything to usd based after the initial cost."*

This is correct. The transaction's `price_currency` field already captures "what currency I paid in" per-row, and `normalizeToUsd` converts to USD for all internal math. The asset-level `denomination` field exists only to provide a default value for the modal's `price_currency` dropdown — which saves at most one click and is wrong half the time (defaults to USD for gold even though user always pays in TRY).

For the future BIST stocks case, `category='stock_bist'` already encodes "priced in TRY" and the price-fetch layer can branch on that. Per-transaction `price_currency` continues to handle the input flexibility.

**There's also a latent bug** the user's argument exposed: Task 5's FIFO transfer effect writes `setPriceCurrency(selectedAsset.denomination)` but `unit_price` it writes is the USD-normalized FIFO weighted-average. If a user ever sets a non-currency asset's `denomination` to TRY, the saved row would be a USD value labeled TRY → corrupt cost basis. The current CHECK doesn't catch this. Dropping the column eliminates the bug surface.

## What to do (rollback scope)

Make one new migration + a small code change pass. Treat as a single coherent change.

### 1. New migration

Create `supabase/migrations/2026051812XXXX_drop_denomination.sql` (pick the next available timestamp). Body:

```sql
ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS currency_self_denominated,
  DROP CONSTRAINT IF EXISTS denomination_supported,
  DROP COLUMN IF EXISTS denomination;
```

Also update the seed function `seed_user_data` (via `CREATE OR REPLACE FUNCTION` in the same migration) to remove every `denomination` value from its INSERTs. **Keep the H1 guards** (`SET search_path = public` and the `auth.uid()` check) — see `supabase/migrations/20260507100000_seed_function_guard.sql` for the original pattern and `bdb5a94` for why this matters.

Apply via `mcp__plugin_supabase_supabase__apply_migration` against project `hhqwxygrtqcugaxamrtu`.

### 2. Code changes

- `src/types/database.ts:23-35` — drop `denomination: "USD" | "TRY" | "EUR"` from the `Asset` interface. Keep `is_currency`.
- `src/lib/queries/holdings.ts` — drop `denomination` from the two `.select(...)` strings and from the local `HoldingWithDetails.assets` type. Keep `is_currency`.
- `src/components/transactions/AddTransactionModal.tsx`:
  - **Task 4 effect (currency-transfer auto-fill):** replace `setPriceCurrency(selectedAsset.denomination)` with `setPriceCurrency(selectedAsset.ticker)`. For `is_currency=true` rows, ticker IS the currency code (USD/TRY/EUR) — semantically identical to what `denomination` was carrying.
  - **Task 5 effect (FIFO paired transfer):** replace `setPriceCurrency(selectedAsset.denomination)` with `setPriceCurrency("USD")`. The `unit_price` we write is already USD-normalized from `computeTransferCostBasis`, so the label was always meant to be USD; using `denomination` was the latent bug.
  - **Cost basis display block:** uses `selectedAsset.denomination` for the symbol lookup. Replace with `selectedAsset.ticker` for currency assets and `"USD"` for non-currency. Or just use `priceCurrency` (state) — it's already set correctly by the effects above.
- `src/components/assets/AssetForm.tsx` — drop the `denomination` state, the hydrate line, the interface field, the submit payload field, and the JSX dropdown block. Net negative diff.
- `src/components/assets/AssetList.tsx` — drop the `denomination: data.denomination` line from the `editAsset` call's payload.
- `docs/superpowers/specs/2026-05-15-fiat-and-transfer-cost-design.md` — add a short note at the bottom: "2026-05-18: `denomination` column was removed as redundant; see `docs/denomination-rollback-handoff.md`."

### 3. Verify

- `npm run typecheck` clean.
- `npm run lint` clean.
- Live DB: `\d public.assets` shows no `denomination` column; `pg_get_functiondef('public.seed_user_data'::regproc)` shows no `denomination` argument in the INSERT statements; both H1 guards intact.
- Open the modal, walk the three transfer flavors (USD transfer_in, AAPL transfer_out paired, BTC lone transfer_in) — submitted rows have correct `price_currency`.
- Hero P&L still ≈ Portfolio P&L within $1.

### 4. Commit

One commit per logical step is fine (schema + types + code + spec note = 4 commits, or roll into 2). Use `revert:` or `refactor:` prefix per the project's existing convention — `revert(schema): drop denomination column` for the schema commit feels right.

## What NOT to touch

- `is_currency` — earns its keep (P&L short-circuit, system-row UI protection, CHECK ensures denomination=ticker which we're now removing but the flag stays).
- `transfer_in_has_cost` CHECK — this is the floor that prevents the Mar 3 bug class. Keep.
- The Task 5 FIFO logic itself — only the `priceCurrency` write changes, not the cost computation.
- USDT/USDC `category='crypto'` migration — keep. They go through real FIFO now.

## Dev environment state at handoff

- Frontend dev server: user runs it themselves at port `5173`. (A second instance from a prior tool call ran at `5174` — may or may not still be alive.)
- Local Supabase stack: started via `supabase start` in this session. Running on `127.0.0.1:54321` (API/functions), `:54322` (Postgres), `:54323` (Studio). Edge functions served via `supabase functions serve` (running in background).
- `.env.local` points the FE at `http://127.0.0.1:54321` — local stack, not remote. **Keep this in mind:** changes via the Supabase MCP go to the *remote* project (`hhqwxygrtqcugaxamrtu`), not the local stack the user is testing against. Apply schema changes to both if you want the local FE to see them, or let `supabase db reset` re-run migrations locally.

## Open questions for the user

None hard-blocking. If you want to verify the rollback feels right with them before applying, ask: *"Want this in one commit or split by file group? And should I add the same drop to the local stack via `supabase db reset` or leave that to you?"*

Otherwise proceed.

## What was attempted that didn't help

- An earlier hypothesis about unpaired sells/transfer_outs as the divergence cause was wrong. All `linked_tx_id` pairs were intact. Real cause was a single bad `total_cost` field. (Resolved long ago — keeping for prosperity in case the same hypothesis re-surfaces.)
