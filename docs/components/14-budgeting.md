# Component 14 — Budgeting

A monthly **earned / invested / spent** view of the user's money flow, built to
need almost no data entry: the user records only income, and the app derives the
rest from the portfolio transactions it already has.

**Depends on:**
- **Transaction system** (Component 4) — the source of every derived "invested"
  figure.
- **Price engine** (Component 5) — exchange rates for currency normalization.

**Glossary:** [Cash-flow entry](GLOSSARY.md#cash-flow-entry),
[Invested (monthly)](GLOSSARY.md#invested-monthly),
[Spent (residual)](GLOSSARY.md#spent-residual),
[Savings rate](GLOSSARY.md#savings-rate),
[Salary schedule](GLOSSARY.md#salary-schedule),
[Net invested capital](GLOSSARY.md#net-invested-capital).

## The residual model

Only **income** is entered. Everything else is derived per calendar month:

- **Invested** — the net new external money that entered tracked platforms that
  month: the month's change in [net invested capital](GLOSSARY.md#net-invested-capital).
  Internal shuffles (a buy and the cash it consumes, platform-to-platform
  transfers) cancel; only genuine external inflows/outflows count. Cash
  deposited onto a tracked platform but not yet deployed still counts as
  invested-side — it was saved, not spent.
- **Spent** — income − invested. A residual: no expense is ever recorded.
- **Savings rate** — invested ÷ income.

**Accepted trade-off:** the residual absorbs every data gap. Money kept outside
tracked platforms, or a deposit that was never recorded, reads as "spent".

**Reserved for later (expense ledger):** cash-flow entries have a type. Only
`income` is accepted today; `expense` is reserved so a future expense ledger can
categorize *part of* the spent residual (remainder shown as "other") without
changing this model or migrating data.

## Income entry and the salary schedule

- A month's income is the sum of that month's explicit income entries.
- If a month has no explicit entry, it falls back to the **salary schedule**: a
  list of (amount, currency, effective-from month) rows; the row with the latest
  effective-from at or before the month applies. Raises are appended, never
  edited into history. Auto-filled months are visually marked as defaults until
  overridden.
- Income entries never touch holdings, balances, or P&L — budgeting is
  read-only over portfolio data.

## The Budget page

A top-level page alongside Dashboard / Portfolio / Retirement:

- **Monthly table**, most recent first (last 12 months by default, expandable to
  the full history): month · income · invested · spent · savings rate. The
  income cell is editable inline: a month with no entry gets one recorded on
  its first day; a month with exactly one entry has that entry's amount updated
  (clearing the cell removes it, falling back to the salary default); a month
  with **several** entries opens a list editor instead — one row per entry,
  each with its own amount and a delete — because the cell's figure is their
  total, which is nobody's amount to type over. The editor is a dialog, not a
  panel inside the cell: the months table scrolls sideways on a narrow screen,
  where a panel wedged into a cell puts its own controls out of reach. Deleting
  an entry asks for confirmation first (it removes real income history);
  removing the last entry falls the month back to the salary default. Every
  income cell is therefore editable; nothing renders as a control that does not
  act. How that editing works is explained once, from the **income column's own
  heading**, through an explainer that opens on hover *and* on tap — a cell's
  own tap already starts an edit, so the explanation needs a trigger of its own,
  and one sentence at the head beats the same sentence repeated down every row.
  On a phone the row keeps month · income · spent · savings rate and **invested**
  moves under income as a second line, so the spent column — the reason the
  table exists — never leaves the screen.
- **Trend chart**: grouped monthly bars for income / invested / spent. The
  savings rate stays in the table — it is a different measure and never shares
  the chart's axis. Money ticks are compact ("$4.5k", "-$1.5k"), so the axis
  does not spend a quarter of a phone-width chart on ".00".
- **Salary schedule editor**: default income rows (amount, currency,
  effective-from month), appendable and deletable.
- The page follows the **app-wide display currency** (USD/TRY); derived figures
  are normalized using each transaction's or entry's own date rate.
- Every money figure on the page is grouped by its currency's own conventions,
  and hidden by the **privacy toggle**: table cells, the trend chart, and the
  salary schedule's amounts. An unmasked chart axis would hand the hidden
  figures straight back, since the bars are still to scale — so with amounts
  hidden the axis **keeps its scale and drops its labels** entirely rather than
  printing a masked placeholder per tick; the bar *shape* stays visible, for the
  same reason percentages do. The tooltip masks.
- The **income entry list is the page's one privacy exception**, by
  construction: it edits raw amounts in text fields, which cannot mask. So the
  amount named in its delete confirmation is shown in the clear too — masking it
  would buy no privacy against the fields directly above it, while costing a
  non-undoable confirmation the only field that says *which* of the month's
  entries is about to go.
- Amounts that belong to a single entry (a schedule row, the entry being
  deleted) render in **that entry's own currency**, never re-denominated.
- Spending is not a loss: the page uses a neutral palette, not the gain/loss
  colors.

## Edge cases

- A month with a net withdrawal shows **negative invested**; spent then exceeds
  income. Rendered honestly with signed formatting.
- A month with no income data (no entry, no applicable salary default) shows
  invested only; spent and savings rate render as "—", never a fake zero.
- Months before both the first transaction and the first income entry are not
  listed. The current month appears but is marked as in-progress.

## Future work (not yet built)

- **Plan vs. actual**: monthly invest target and spend ceiling with
  effective-from semantics, per-month adherence, and a cross-link from the
  retirement planner's contribution assumption to the actual trailing average.
  (Its storage already exists, unused.)
- Expense entries with categories; inflation-adjusted trend; month locking.
