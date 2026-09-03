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
- **A linked transfer pair renders as ONE combined row.** A platform-to-platform
  transfer (Component 4 links the two sides) shows a single row labelled simply
  "Transfer": the platform cell reads `source → destination`, and the quantity is
  **neutral** — no sign, no gain/loss colour — because at portfolio level nothing
  was gained or lost. The destination side is folded into this row whenever its
  source side is visible in the same filtered list; when a filter matches only the
  destination side (e.g. filtering to the destination platform), that side appears
  as its own directional row so the transfer never disappears. Lone transfers
  (no counterpart) keep their signed, directional single-row rendering, labelled
  **Deposit** (transfer-in) / **Withdrawal** (transfer-out) — a pair side rendered
  alone under a filter carries the same directional label.
- **Native + converted.** A row's unit price and total are shown in the
  transaction's native price currency; when the display currency differs, an
  approximate converted figure (using the [exchange rate](GLOSSARY.md#exchange-rate)
  on the transaction's date) is shown alongside.
- **Linked cash leg as a subtitle.** Because [buys and sells carry a linked cash
  leg](GLOSSARY.md#transaction), each trade row surfaces that leg inline beneath
  the asset, e.g. a sell shows `$998.50 USD → Midas` (auto-credit) and a
  platform-funded buy shows `-$1,001.50 USD from Bank` (only outflows carry a
  sign; the arrow wording carries the direction). A buy funded by outside
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
- **The type filter matches the *derived* type, not the stored one.** The three
  transfer-shaped filters are separate: **Transfer** matches internal linked pairs
  (shown, as always, as the one combined row), **Withdrawal** matches only a *lone*
  outgoing transfer, and **Deposit** only a *lone* incoming one. So an internal
  platform-to-platform move appears under Transfer and **nowhere else** — filtering
  Withdrawal never surfaces money that never left the portfolio. Every other type
  filter matches its type directly. Whether a transfer is internal is answered from
  the full history, so it does not change with the date/asset/platform filters in
  effect.
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
  linked child (cash leg, or the destination side of a transfer pair — the
  confirmation names both sides) and recalculates the affected balances.
- **Bulk import entry.** The page offers an entry point into the bulk-import
  subsystem ([Component 4](04-transaction-system.md)) — a "bulk add" action and (on
  a per-asset basis, reached from elsewhere in the app) an "edit this asset's
  transactions" surface. The import experience itself is specified in Component 4.
- **No per-row refetching.** Rendering the log must not cause each row to re-request
  the data. Scrolling/paginating the log reads already-loaded data. This is a hard
  rule: a per-row data dependency floods the backend with requests.

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
  Quantity, Unit Price, Total, row-actions — "Quantity", matching the Portfolio
  page's wording, never "Amount"); a stacked card list on narrow screens — the
  same width split the Portfolio table uses, since the eight columns need the
  same room.
  Type is a color-coded badge per type. Asset cell carries the icon, ticker, and the
  linked-leg subtitle. Empty and loading states are explicit.
- **Numeric columns are right-aligned and figure-aligned** (Quantity, Unit Price,
  Total) so magnitudes compare straight down the column — the same typography the
  Portfolio table uses. Where a figure is shown in its native currency, the
  approximate display-currency equivalent sits on its own second line under it,
  right-aligned, never trailing the primary figure.
- **The gain/loss palette is reserved for realized P&L on this page.** Quantities
  carry direction with their sign alone (the Type badge already colours buy vs
  sell), and the activity summary's buy/sell volumes are turnover, not profit —
  they render in the default foreground.
- **Phone.** The page title and subtitle are dropped (the phone header names the
  screen), the activity summary condenses to one strip of count · buy volume ·
  sell volume, and the filters collapse behind a single "Filters (n)" trigger
  that counts what the user actually narrowed (the default date window does not
  count towards it) — so the first transaction is on screen without
  scrolling. From the medium width up the title returns; from the small width up
  the summary is three cards and the filters are always open.
- **Filters.** Date-range presets (Last 7d / Last 30d / This Year / All Time) plus
  free date pickers; an asset picker; a platform picker; type chips (toggle on/off) —
  including a **Transfer** chip carrying the same neutral label and colour as the
  combined pair row, sitting right after Deposit and Withdrawal; a "clear filters"
  affordance when any filter is active.
- **Realized P&L.** Rendered only on sell rows, beneath the total: signed amount +
  `%` of cost basis (a return %, so **two decimals** — the app-wide precision for
  return percentages), colored gain/red-loss by the **USD** sign, with the native
  figure shown when native ≠ USD. Follows the app-wide gain/loss styling
  conventions (canonical palette, ASCII minus, no sign at zero).
- **Edit / delete.** Each row exposes an actions menu → Edit (opens the pre-filled
  single-entry editor) and Delete (confirmation dialog naming the affected
  transaction and warning that holdings will be recalculated).
- **Import entry.** A "bulk add" action in the page header opens the bulk editor;
  the return path from that editor comes back to this page.
- **The bulk editor is this app.** Its full-viewport chrome sits on the app's own
  surface and border tones (not an inverted bar), so every control in it — the
  import triggers above all — is legible in both themes; its save is the page's
  one primary action and its column heads are Title Case, like every other table.
  It offers exactly **one** exit, next to Save in the footer.
- **On a phone the bulk editor is import-first.** Bringing in a broker
  statement is the only reason to open it there, so it opens on the import
  actions (with a way to start a row by hand) and the grid appears once there
  are rows to review. When the grid is showing, the row number and the
  ticker column stay pinned while the rest scrolls sideways, so it is never
  ambiguous which row a cell belongs to.

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
- [ ] A linked transfer pair shows as one neutral "Transfer" row with
      `source → destination`; filtering to either platform still surfaces the
      transfer; deleting the combined row removes both sides after a confirmation
      that names them.
- [ ] Filtering to **Withdrawal** shows no internal transfer pair; the pair appears
      under **Transfer**, and **Deposit** shows only lone incoming transfers.
- [ ] The activity summary reflects the **filtered** set (count, buy volume, sell
      volume).
- [ ] Editing a transaction updates the affected [Holding](GLOSSARY.md#holding)
      balance(s), reconciles its linked cash leg, and re-derives P&L — no manual
      reload.
- [ ] Deleting a transaction asks for confirmation and recalculates balances.
- [ ] The log paginates/scrolls **without per-row refetching** the whole table.
- [ ] The "bulk add" entry point opens the bulk-import surface (Component 4).
- [ ] Quantity / Unit Price / Total are right-aligned; no quantity or volume is
      painted in the gain/loss palette.
- [ ] Both import triggers in the bulk editor are visible in light **and** dark
      mode, and the editor offers a single exit path.
