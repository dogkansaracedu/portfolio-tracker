# Cash Flow & Buy/Sell Linkage — Feature Discussion

**Status:** Brainstorm starter — open in a new chat with `/superpowers:brainstorming`. This doc is the baseline; not a spec yet.

**One-line:** When you sell an asset the proceeds vanish; when you buy nothing is deducted from anywhere. The portfolio model has no concept of cash flowing between assets — only quantity additions/subtractions per asset. We need to make cash a first-class participant so a sell credits the right currency on the right platform, and a buy can optionally debit it.

---

## 1. How the system works today

### Single transactions table, polymorphic by `type`

`supabase/migrations/20260402100005_create_transactions.sql` and downstream — schema (paraphrased):

```
id uuid pk
user_id uuid              (RLS: auth.uid())
asset_id uuid             (foreign key to assets — what was traded)
platform_id uuid          (where it happened)
type transaction_type     (buy | sell | transfer_in | transfer_out
                            | dividend | interest | fee)
date timestamptz
amount numeric            (quantity, BigNumber-safe)
unit_price numeric        (per-unit, in price_currency)
price_currency text       (USD | TRY | EUR)
total_cost numeric        (= amount × unit_price; cached)
fee numeric
fee_currency text
related_asset_id uuid     (rarely populated; reserved for future linkage)
notes text
created_at timestamptz
```

### Holdings are a pure derivation of transactions

`src/lib/balance.ts` (`recalculateBalance`):

```
addTypes:      buy, transfer_in, dividend, interest
subtractTypes: sell, transfer_out, fee

balance(asset, platform) = SUM(add.amount) − SUM(subtract.amount)
                            for that (asset, platform) only
```

`holdings (user_id, asset_id, platform_id)` is unique. After each mutation the row is upserted; `holdings.balance` is just a cache of the derivation above.

### Fiat is already an asset

The seed (`20260402100010_seed_function.sql`) creates rows in `assets` for `USD`, `TRY`, `EUR` (all `category='fiat'`, with `tags` like `['usd']`). So the database can already represent "you hold $2,000 USD on Midas" — it's a row in `holdings` keyed on the USD asset and the Midas platform.

### What's missing

A sell does not credit any fiat asset. A buy does not debit any fiat asset. There is no relation between the asset side and the cash side — only one side gets recorded per transaction.

Concrete consequence: open the Settings → Platforms page on Midas. You see your AAPL, BRK-B, QQQ holdings, but no USD line, even though every buy implicitly used USD. If you transferred $2,000 of fresh money in (a `transfer_in` of the USD asset onto Midas), and then bought $1,000 worth of AAPL, the database still says you have $2,000 in USD on Midas — the buy didn't subtract it.

So **either you never record cash inflows** (and your reported portfolio total is just the assets, ignoring uninvested cash), **or you record them but then they double-count when you place a buy**. The system tolerates both inconsistent states.

---

## 2. What the user wants (verbatim, lightly cleaned up)

> I just realised — when I sell, the money doesn't disappear. It comes back to me as dollars. There's a system gap. When something is sold, the proceeds should be auto-credited as the currency it was sold in (TRY if I sold for TRY, EUR if EUR), to the same platform. And in the transactions list I don't want to see two separate rows.
>
> Buys should have two options:
> - Either deduct from my cash balance on that platform
> - Or it just lands as a fresh holding (like the $1,000 came from this month's salary, straight in)
>
> Example: I have $2,000 on Midas. I'm buying $1,000 of Apple. When I enter it, I want to be able to say "deduct from my Midas USD" — *or* "this is fresh money from salary, no deduction". Let's think hard about this.

Three requirements crystallise:

**R1 — Auto-credit on sell.** Selling $X of AAPL on Midas at USD price → $X added to Midas USD balance. No manual step.

**R2 — Buy modes.** Two (or three) ways to record a buy, user picks per transaction:
- *Deduct from platform cash* — assumes the cash is already on the platform (sold something earlier, or transferred money in)
- *Fresh external cash* — money is being introduced into the portfolio with this purchase; no deduction; net new capital

**R3 — Single-row UI.** A sell should appear as one entry in the transactions list, not "Sold AAPL" + "Cash credit USD" as two rows.

---

## 3. The hard design decisions (open questions)

These need answers before any spec can be written. Each has a recommendation but is genuinely up for debate.

### Q1. Storage shape: composite row, linked rows, or pure derivation?

**A — Composite row** (extend `transactions` with a `cash_effect` column)

Add nullable columns to `transactions`:
```
cash_effect          enum  (auto_credit | platform_deduct | external | none)
cash_asset_id        uuid  (which fiat asset was credited/debited; null when 'external')
cash_amount          numeric  (auto-derived for sell, optional for buy)
```

A sell of $1,000 AAPL becomes one row with `type='sell'`, `cash_effect='auto_credit'`, `cash_asset_id=<USD>`, `cash_amount=1000`. `recalculateBalance` runs *twice* per row when `cash_asset_id` is set: once for the asset side, once for the cash side.

- ✅ One row in DB, one row in UI. Matches user intent directly.
- ✅ Edit/delete a transaction → both sides update atomically.
- ❌ `recalculateBalance` becomes "for each (asset, platform) that *might* have been touched", harder to reason about.
- ❌ Subtle: if `cash_effect` changes on edit, both the old cash side and the new cash side need recomputation.

**B — Linked rows** (auto-create a paired tx with `linked_tx_id`)

A sell creates two rows: the original `sell`, plus an auto-generated `transfer_in` (or new `cash_credit` type) with `linked_tx_id` pointing back. The frontend renders linked pairs as a single visual row.

- ✅ Each `transactions` row has one and only one effect — clean mental model. `recalculateBalance` unchanged.
- ✅ Existing audit/RLS paths apply uniformly.
- ❌ Two rows in DB. Edit cascades manually (when you edit the sell, the cash row must follow). Delete cascades. Bugs likely.
- ❌ "Single-row UI" promise is fragile — every list/filter/export has to remember to fold pairs.

**C — Cash is a pure derivation** (no new rows; compute cash balances on the fly)

Don't store cash balances at all. Instead, define cash as `SUM(sell proceeds in currency C on platform P) − SUM(buy costs in currency C on platform P) + SUM(transfer_in.amount where asset is C) − SUM(transfer_out.amount where asset is C)`. Compute it whenever needed.

- ✅ Zero schema change, zero new rows.
- ✅ Always consistent with the source of truth.
- ❌ "Buy modes" don't fit naturally — derivation can't represent "this buy was external cash, don't deduct" without a marker. So we still need at least a flag column.
- ❌ Reports get more expensive (no cached cash balance).

**Recommendation:** **A (composite row).** It captures the user's "one row, two effects" intent without sacrificing DB-level integrity. Forces a careful refactor of `recalculateBalance` but keeps the data model honest.

### Q2. What's the default `cash_effect` for a buy?

The user wants both modes available. Pick a default — most buys are one or the other:

- **External cash default.** Existing data is implicitly external (no cash deduction has ever happened). Backwards-compatible. New users start with this; opt into platform deduction.
- **Platform deduct default.** Closer to a "real" brokerage feel. But assumes the user keeps platform cash up to date — a high bar at the start.

**Recommendation:** **External as default.** Add a checkbox / toggle in the buy form: "Deduct from my Midas USD ($2,000)". Default unchecked.

### Q3. Negative cash balance — allow, warn, or reject?

If "deduct from platform cash" is selected and the balance is insufficient, three policies:

- **Reject** with a form-level error: "Insufficient USD on Midas ($800 available, $1,000 needed)."
- **Warn** with a confirmation dialog: "This will leave your Midas USD at -$200. Continue?"
- **Silent allow** — let it go negative; treat it as a margin/loan position.

**Recommendation:** **Reject** with a clear inline error. Negative cash is almost always a data-entry mistake (forgot a transfer_in, or wrong platform). For the rare case of margin/credit, the user can record a synthetic `transfer_in` first.

### Q4. What happens to the existing 21+ transactions?

They have no cash effect today. If we deploy R1+R2 mid-stream:

- **Option α — Backwards compat.** Old transactions implicitly have `cash_effect='external'`. Their behaviour stays exactly as today. New transactions get the new model.
- **Option β — Auto-migrate.** Run a script that auto-credits cash for every past sell. Risky — we don't know whether the user already manually recorded those credits as `transfer_in`. Could double-count.
- **Option γ — Manual migration.** Tell the user "go review your past sells, mark them as cash-affecting if appropriate". Painful but explicit.

**Recommendation:** **α.** Don't touch history. The user can recreate any transaction if they want it cash-effecting.

### Q5. Which fiat asset gets credited on sell?

The transaction has `price_currency` (USD/TRY/EUR). The auto-credit uses that as the cash asset:

- `price_currency='USD'` → credit the `USD` asset on the same platform
- `price_currency='TRY'` → credit `TRY`
- `price_currency='EUR'` → credit `EUR`

Stablecoins (`USDT`, `USDC`) are different assets in our seed (`category='fiat'`, `tags=['crypto','usd']`). So selling AAPL "for USD" credits `USD`, not `USDT`. If a sell physically settled in USDT (e.g. on a crypto exchange), the user must record `price_currency='USD'` *and* a manual `transfer_in` of USDT — or we could in the future add a "settle currency" override. **Out of scope for v1.**

### Q6. Fees

Today fees can be encoded two ways:
1. Inline on a transaction: `transactions.fee` and `transactions.fee_currency` columns
2. As a separate `type='fee'` transaction

For inline fees: when `cash_effect='platform_deduct'`, also deduct the fee from the same fiat asset (`fee_currency`). When `cash_effect='external'`, the fee is part of the external outlay — no deduction.

For separate `fee` transactions: they already debit the asset they're recorded against. If the asset is fiat, that just works. If non-fiat, that's "I paid fee in BTC" — already handled.

**Recommendation:** Inline fees follow `cash_effect`. Separate fee transactions unchanged.

### Q7. `transfer_in` / `transfer_out` overlap

Today's semantics: `transfer_in` records assets brought into the system (the "loading event" reclassification, see migration `20260503100000_reclassify_loading_event.sql`); `transfer_out` is the rare flip. They're cash-flow neutral for performance accounting.

A user moving $500 from Bank to Midas → `transfer_in` of USD with platform=Midas, amount=500. This is exactly what "platform_deduct" is funded from. So `transfer_in` and the auto-credit-on-sell are the *only* two ways USD ends up on Midas.

This works without changes — the new feature *consumes* `transfer_in` data, doesn't replace it.

But: a forex conversion (sold $500 USD, got 16,500 TRY) is awkward. Today it's a `transfer_in` TRY + `transfer_out` USD pair, recorded by hand. After R1+R2 it could be a `sell` of USD asset for TRY. Worth thinking about. **Probably out of scope for v1.**

### Q8. UI surfaces affected

- Transaction form (`AddTransactionModal.tsx`): new dropdown/checkbox for `cash_effect`; for buys, show platform's current cash balance for context.
- Transaction list (`TransactionsPage`, `TransactionRow`): collapse cash side into the parent row.
- Portfolio page (`PortfolioPage`): cash assets now have non-trivial balances; ensure they render gracefully (today they're often 0).
- Dashboard hero: total value already includes cash assets if they have a price (USD price = 1, TRY price comes from FX rate). Should mostly Just Work.

### Q9. Storage of "cash side" — separate row or denormalised?

Per Q1 recommendation A: composite row. That means **no separate row** is created. `recalculateBalance` reads the same row twice with different `(asset_id, platform_id)` lenses.

Concretely, `recalculateBalance(userId, assetId, platformId)` today filters `transactions` by `asset_id=assetId AND platform_id=platformId`. The new version needs an OR clause: rows where the **primary** `(asset_id, platform_id)` matches, plus rows where the **cash side** `(cash_asset_id, platform_id)` matches.

This is a pure SQL change, doable with a `WHERE (asset_id = ? AND platform_id = ?) OR (cash_asset_id = ? AND platform_id = ?)`.

---

## 4. Sketch of the proposed model (Q1=A)

### Schema delta

```sql
ALTER TABLE transactions
  ADD COLUMN cash_effect text,
  ADD COLUMN cash_asset_id uuid REFERENCES assets(id),
  ADD COLUMN cash_amount numeric;

-- Constraint: cash_effect ∈ {'auto_credit','platform_deduct','external','none',null}
-- Constraint: when cash_effect='auto_credit' or 'platform_deduct',
--             cash_asset_id and cash_amount must be set.
```

### Default values per type

| `type`         | default `cash_effect`  | default `cash_amount`     |
|----------------|------------------------|---------------------------|
| `buy`          | `external` (opt-in to deduct) | `total_cost` if deducting; null otherwise |
| `sell`         | `auto_credit`          | `total_cost − fee` (net proceeds) |
| `transfer_in`  | `none`                 | null                      |
| `transfer_out` | `none`                 | null                      |
| `dividend`     | `auto_credit` (likely) | `total_cost`              |
| `interest`     | `auto_credit` (likely) | `total_cost`              |
| `fee`          | `none`                 | null (fee tx already debits the fee asset) |

### `recalculateBalance` change

Today: filter by `(asset_id, platform_id)`. Sum add-types, subtract subtract-types.

After: filter by **either** `(asset_id, platform_id)` **or** `(cash_asset_id, platform_id)`. For each row:
- If row's `asset_id == filterAssetId` → existing add/subtract logic on `amount`
- If row's `cash_asset_id == filterAssetId` → apply cash-side delta:
  - `auto_credit` → `+ cash_amount` (cash arrives)
  - `platform_deduct` → `− cash_amount` (cash leaves)
  - `external` / `none` → no effect

Note: a single buy with `cash_effect='platform_deduct'` and `cash_asset_id=USD` triggers two recomputations:
1. The asset side, e.g. AAPL on Midas (+ amount)
2. The cash side, USD on Midas (− cash_amount)

The `useTransactions` add/edit/remove flows must call `recalculateBalance` for *both* sides. The `TransactionDataContext.refresh()` then propagates new state to the UI.

### Transaction form sketch

```
Type:        [Buy]
Asset:       [AAPL ▾]
Platform:    [Midas ▾]
Amount:      [4]
Unit price:  [250 USD]
Total cost:  $1,000.00 (auto)
Fee:         [1.50 USD]

──────────────────────────────────────
☐ Deduct from Midas USD balance ($2,000.00 available)
   ↑ unchecked → "external cash" (default)
   ↓ checked → "platform deduct"
──────────────────────────────────────

Date: [2026-01-21]
Notes: [optional]
```

For sell, no checkbox — it's always auto-credit (R1). Display a confirmation: "Sale proceeds: $998.50 → credited to Midas USD".

### Transaction list rendering

Today: one row per `transactions.id`. After: same — every row shows the asset side as primary, with a small subtitle showing the cash side when present:

```
─────────────────────────────────────────────────────
🟢 Sold 4 AAPL @ $250 · Midas
   +$998.50 USD credited to Midas (auto)
─────────────────────────────────────────────────────
🔴 Bought 4 AAPL @ $250 · Midas
   −$1,001.50 USD from Midas (incl. $1.50 fee)
─────────────────────────────────────────────────────
🔴 Bought 4 AAPL @ $250 · Midas
   external cash · no platform deduction
─────────────────────────────────────────────────────
```

---

## 5. Edge cases to revisit when speccing

- **Edit a sell after it's been credited:** the auto-credit must move with the edit. If price changes, cash_amount is recomputed.
- **Delete a sell:** the auto-credit must be reversed (no orphan cash).
- **Concurrent edits** across two browser tabs (rare): last write wins; not worth atomicity work for a single-user app.
- **Edit the cash side independently?** No — `cash_amount` is derived from the parent transaction's `total_cost − fee`. Read-only in the UI. (Override could be a v2 thing.)
- **Negative cash on platform_deduct buy:** rejected per Q3. Show inline error.
- **Buy with `cash_effect='external'` while platform cash is high:** fully allowed. The user is saying "I'm bringing in fresh capital" even if there's idle cash. Their call.
- **A `transfer_in` of USD onto Midas vs. a `sell` of AAPL on Midas:** both end up adding USD to Midas holdings. Same outcome, different audit trail. That's fine.

---

## 6. Why this is hard

It looks like a small change — "auto-credit on sell" — but it's a **data model change**. Today the `transactions` row owns one effect; this proposal makes it own two. Everything that derives from transactions (FIFO P&L, snapshots, performance, dashboards, exports) needs to consider whether the new shape changes its inputs. Most won't (FIFO operates per-asset and doesn't care about cash side). But snapshots already include cash assets in `total_usd`, and right now those are usually $0 — once they become real numbers, the dashboard "total value" line jumps by the size of accumulated cash. The user has to be ready for that visual shift.

The migration path is also delicate. Q4 says "leave history alone," but the moment a buy is recorded with `platform_deduct`, the user's mental model changes: from "transactions = everything I bought" to "transactions = also the cash that funded it". The list UI needs to make this distinction obvious to avoid confusion ("wait, where did that $1,000 deduction come from?").

---

## 7. Suggested next steps for the new chat

1. Open with `/superpowers:brainstorming` (or `/effort max` first).
2. Use this doc as the context dump — ask Claude to read it first.
3. Walk through Q1–Q9 in order. Lock recommendations or override.
4. Decide v1 scope: just R1 (sell auto-credit) first, or R1+R2 (with buy modes) together?
5. Once Q1 is settled, write the spec → plan → implement.

Files to remember:
- `src/lib/balance.ts` — the only place balance arithmetic lives. The change lands here.
- `src/lib/queries/transactions.ts` — DB writes. Schema-level cash columns plumbed through.
- `src/components/transactions/AddTransactionModal.tsx` — the UI form. Cash mode selector lands here.
- `src/components/transactions/TransactionRow.tsx` — list rendering. Subtitle for cash effect lands here.
- `src/contexts/TransactionDataContext.tsx` — refresh() must trigger after both sides recompute.
- `supabase/migrations/` — new schema migration for `cash_*` columns.
