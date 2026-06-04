# Component 9: Transactions Page — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/09-transactions-page.md](technical/09-transactions-page.md)

## Purpose

The audit trail: a filterable, reverse-chronological log of every
[Transaction](GLOSSARY.md#transaction). It is where the user inspects history,
confirms what each event did to a balance, sees the [realized P&L](GLOSSARY.md#realized-and-unrealized)
booked by each sell, edits a mistaken entry, and launches a bulk import. It does
not *compute* portfolio numbers — it reads the same [P&L engine](06-pnl-engine.md)
the rest of the app uses, so a sell's realized figure here matches the dashboard
and portfolio views exactly.

## Depends on

- [Transaction System](04-transaction-system.md) — owns transaction shape, the
  cash-leg linkage, the single-entry editor, and the **bulk-import subsystem**.
  This page is only the *entry point* into bulk import, not its implementation.
- [P&L Engine](06-pnl-engine.md) — the single source of realized P&L per sell.
  This page never re-derives FIFO; it joins the engine's per-transaction output
  to displayed rows.

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

- [Transaction](GLOSSARY.md#transaction) — the logged event; its `type`, balance
  effect, and linked cash leg drive every row.
- [Asset](GLOSSARY.md#asset) / [Platform](GLOSSARY.md#platform) — the two
  dimensions a row is attributed to, and two of the filters.
- [Holding](GLOSSARY.md#holding) — the balance an edit/delete recalculates.
- [Realized and unrealized](GLOSSARY.md#realized-and-unrealized) /
  [FIFO lots and cost basis](GLOSSARY.md#fifo-lots-and-cost-basis) — the per-sell
  number shown on its row.
- [USD anchor](GLOSSARY.md#usd-anchor) — realized P&L (amount, sign, color, and %)
  is measured in USD; a sell up in lira can still be down in dollars.

## Behaviors / rules

- **The log.** Newest first. Each row shows the date, [asset](GLOSSARY.md#asset),
  [platform](GLOSSARY.md#platform), type, signed quantity, unit price, and total.
- **Sign of the quantity** follows the [Transaction](GLOSSARY.md#transaction)
  balance effect: add-types (buy, transfer-in, dividend, interest, cash-credit)
  render `+`; subtract-types (sell, transfer-out, fee, cash-debit) render `−`.
- **Native + converted.** A row's unit price and total are shown in the
  transaction's native price currency; when the display currency differs, an
  approximate converted figure (using the [exchange rate](GLOSSARY.md#exchange-rate)
  on the transaction's date) is shown alongside.
- **Linked cash leg as a subtitle.** Because [buys and sells carry a linked cash
  leg](GLOSSARY.md#transaction), each trade row surfaces that leg inline beneath
  the asset, e.g. a sell shows `+$998.50 USD → Midas` (auto-credit) and a
  platform-funded buy shows `−$1,001.50 USD from Bank`. A buy funded by outside
  money (no linked leg) shows an `external cash` hint instead. The subtitle text
  is read from the linked child, never recomputed.
- **Realized P&L per sell.** Every sell row shows the realized P&L it booked —
  amount, sign, color, and a `%` of cost basis — taken from the
  [P&L engine](06-pnl-engine.md)'s [FIFO](GLOSSARY.md#fifo-lots-and-cost-basis)
  output. Non-sell rows show nothing. The figure is **USD-anchored**: sign, color,
  and percent follow the USD result; when the native currency is not USD the row
  shows the native amount with the USD figure as an approximate sub-line.
- **Realized P&L is computed over full history, not the filtered view.** FIFO must
  consume the asset's *entire* lot history to attribute the correct cost basis to a
  sell. Filtering the log to a date range or one asset must NOT change the realized
  number on any visible sell. (See Acceptance.)
- **Filters.** The user can narrow by date range, [asset](GLOSSARY.md#asset),
  [platform](GLOSSARY.md#platform), and one or more transaction **types** (multi-
  select). Filters compose (all active filters AND together).
- **Default range.** A fresh visit defaults to the current calendar year rather
  than the entire history, so the first load is bounded. The user can widen to
  "All Time". The active filter set is reflected in the page's address so a
  filtered view is shareable/bookmarkable and survives reload.
- **Auto-paired cash legs are hidden by default.** The main list omits rows that
  are the *child* leg of a linked pair (they already appear as their parent's
  subtitle). Filtering to a specific cash/[fiat asset](GLOSSARY.md#asset) reveals
  them, so the user can audit "where did this cash come from".
- **Activity summary.** Above the log, a small set of stats describes the
  **currently filtered** set: transaction count, total buy volume, total sell
  volume. Volumes are normalized to a common currency via dated FX so mixed-
  currency activity is comparable.
- **Edit.** Any transaction is editable. Editing re-runs the same balance-recompute
  and cash-leg reconciliation as creation: the affected [holding](GLOSSARY.md#holding)
  balance(s) are recalculated (on both the old and new asset/platform if they
  changed), the linked cash leg is updated/created/removed to match, and all P&L
  re-derives. A single-entry edit opens a pre-filled editor; this page launches it.
- **Delete.** Removing a transaction asks for confirmation, then removes it and its
  linked cash leg and recalculates the affected balances.
- **Bulk import entry.** The page offers an entry point into the bulk-import
  subsystem ([Component 4](04-transaction-system.md)) — a "bulk add" action and (on
  a per-asset basis, reached from elsewhere in the app) an "edit this asset's
  transactions" surface. The import experience itself is specified in Component 4.
- **No per-row refetching.** Rendering the log must not cause each row to re-request
  the data. Scrolling/paginating the log reads already-loaded data. (This is a hard
  rule — a naive per-row data dependency previously caused a request flood; see the
  [technical doc](technical/09-transactions-page.md).)

## Contract (I/O)

**Inputs**
- The full [Transaction](GLOSSARY.md#transaction) history for the user (the source
  of truth that also feeds the [P&L engine](06-pnl-engine.md)), plus dated
  [exchange rates](GLOSSARY.md#exchange-rate).
- The current filter set (date range, asset, platform, types) — sourced from the
  page address.
- The display currency (USD/TRY) for the native↔display conversion columns.

**Derived / outputs**
- A **date+asset+platform-filtered, newest-first** list of rows (the type filter
  may be applied on top of the already-fetched slice).
- A `transaction → realized P&L` mapping, computed by FIFO over **full** history
  and joined to sell rows by transaction identity.
- A summary `{ count, totalBuyVolume, totalSellVolume }` over the filtered set, with
  volumes normalized to a common currency.
- Edit/delete actions that mutate transactions and trigger balance + P&L recompute.

**Invariants**
- A sell row's realized P&L equals the [P&L engine](06-pnl-engine.md)'s figure for
  that sell — same number on this page, the dashboard, and the portfolio view.
- Realized numbers are invariant to filtering (filters change *which rows show*,
  never *what a sell's P&L is*).
- After an edit/delete, balances and all P&L reflect the change without a manual
  reload.

## UI contract — log list, filters, realized P&L, edit, import entry

- **Log list.** Table on wide screens (columns: Date, Asset, Platform, Type,
  Amount, Unit Price, Total, row-actions); a stacked card list on narrow screens.
  Type is a color-coded badge per type. Asset cell carries the icon, ticker, and the
  linked-leg subtitle. Empty and loading states are explicit.
- **Filters.** Date-range presets (Last 7d / Last 30d / This Year / All Time) plus
  free date pickers; an asset picker; a platform picker; type chips (toggle on/off);
  a "clear filters" affordance when any filter is active.
- **Realized P&L.** Rendered only on sell rows, beneath the total: signed amount +
  `%` of cost basis, colored gain/red-loss by the **USD** sign, with the native
  figure shown when native ≠ USD. Follows the app-wide gain/loss styling
  conventions (canonical palette, ASCII minus, no sign at zero).
- **Edit / delete.** Each row exposes an actions menu → Edit (opens the pre-filled
  single-entry editor) and Delete (confirmation dialog naming the affected
  transaction and warning that holdings will be recalculated).
- **Import entry.** A "bulk add" action in the page header opens the bulk editor;
  the cancel/return path from that editor comes back to this page.

## Acceptance

- [ ] Log renders newest-first with date, asset, platform, type badge, signed
      amount, unit price, and total.
- [ ] Each sell row shows realized P&L whose amount/% **match the FIFO P&L engine**
      (Component 6) for that sell.
- [ ] Filtering by asset narrows the log to that asset; filtering by platform, type,
      and date range each narrow correctly, and filters compose.
- [ ] Narrowing the filter (e.g. to one asset or a short date range) does **not**
      change the realized P&L shown on any still-visible sell.
- [ ] Auto-paired cash legs are hidden in the default view but appear when filtering
      to the relevant cash/fiat asset.
- [ ] The activity summary reflects the **filtered** set (count, buy volume, sell
      volume).
- [ ] Editing a transaction updates the affected [Holding](GLOSSARY.md#holding)
      balance(s), reconciles its linked cash leg, and re-derives P&L — no manual
      reload.
- [ ] Deleting a transaction asks for confirmation and recalculates balances.
- [ ] The log paginates/scrolls **without per-row refetching** the whole table.
- [ ] The "bulk add" entry point opens the bulk-import surface (Component 4).
