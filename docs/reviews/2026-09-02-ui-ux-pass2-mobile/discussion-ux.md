# Mobile round 2a — UX reviewer's response to mobile/ui-findings.md

Re-checked against the frozen copy (:5174) and the repo before answering. Paths relative to the repo root; screenshots relative to `<scratchpad>/review/mobile/`.

### MUI-01 — OVERLAPS MUX-01
- Same root cause, wider inventory on the UI side (Add Asset, Platform, Scenario-name dialogs have no `max-h` at all; my MUX-01 covered Add/Edit Transaction and Track/Add position). One merged entry survives, fixed at the primitive. Change line: "In `src/components/ui/dialog.tsx:56` give `DialogContent` a default `max-h-[calc(100dvh-2rem)] flex flex-col` with a scrolling body and a pinned footer; below `sm` render it as a full-height bottom sheet (`inset-x-0 bottom-0 h-[100dvh]`, no centring transform, fixed header with title + ✕, footer pinned). Every dialog inherits it; per-dialog `max-h` overrides (`AddTransactionModal.tsx:659`, `InterestPositionForm.tsx:229`) are removed."

### MUI-02 — OVERLAPS MUX-01
- Agreed on the arithmetic (a 168px stacked footer inside a 598px — or 328px with keyboard — dialog). Take the UI reviewer's single-row footer into the merged MUX-01 line: "Below `sm` the footer is one 56px row — primary `Add Transaction` + `Save & add another` as a secondary/text button; Cancel becomes the header ✕. Acceptance: submit visible without scrolling at 390×664 and 375×568 for all eight types and the asset-prefilled variant; with the viewport at 364px (keyboard) the focused input stays on screen." On C-17: accept 4+4+1; do not shorten "Withdrawal" — it is the glossary display label (`GLOSSARY.md` Transaction display labels).

### MUI-03 — OVERLAPS MUX-02
- Identical evidence and proposal. Merged Change line: "Move the sidebar/tab-bar switch (`Sidebar.tsx:57`, `MobileNav.tsx:32`, `Header.tsx:44`) and the table/cards switch (`PortfolioTable.tsx:41,74`, `TransactionList.tsx:47,76`) to `lg` (1024px) together; re-measure C-13's column budget at 1024×768, the new narrowest table."

### MUI-04 — OVERLAPS MUX-07
- MUI-04 survives — it adds the `index.html:5` `viewport-fit` evidence and the editor footer, both of which mine lacked. MUX-07 withdrawn into it; its Change line stands as written.

### MUI-05 — OVERLAPS MUX-06
- Same three tables. Merged Change line: "Below `sm`: Settings › Assets → the card list idiom Transactions uses (ticker + category + price, status dot, Actions in the card header); Asset Detail › By platform → one stacked row per platform (platform line, then quantity · value · P&L); Budget › Months → keep Month · Income · Spent · Savings rate visible and drop Invested to a second line under Income (Spent is the page's question). Add the 'cards on narrow screens' clause to specs 12 and 14. Fade + sticky first column only as an interim if a table must stay."

### MUI-06 — OVERLAPS MUX-03
- MUX-03 covered Transactions only; MUI-06 correctly extends it to Portfolio and adds the duplicate title. Merged entry for both pages. Change line: "Below `md` hide the page `h1`/subtitle (the header already names the page, `Header.tsx:44`); summary as a compact strip — Portfolio: Value and P&L side by side (`grid-cols-2`, Held Assets into the P&L caption); Transactions: count · buy · sell on one line; Transactions filters behind a 'Filters (n)' disclosure that opens with presets + chips. Acceptance: first Portfolio card / first transaction row visible within the first 664px." My FAB idea is dropped (see Collisions).

### MUI-07 — OVERLAPS MUX-08
- MUI-07's inventory is the fuller one; keep it and fold in my two additions: DropdownMenu items `min-h-10` (Edit/Delete are 28px) and the interest banner's whole row as the link (the 274×16 text is the only tap target today).

### MUI-08 — OVERLAPS MUX-05
- MUX-05 survives — it adds the Retirement "What is…?" icons (12×12, tooltip, no tap path; spec `13-retirement-planning.md:263-264` requires the explainer inline) which MUI-08 omits, and MUI-08's C-15 note is folded in. Merged Change line: "Hover-only hints get a tap path: Retirement info icons → Popover on tap with a ≥40px target (or the one-liner as a muted caption below `sm`); the shared MWR/XIRR micro-label (C-15) → a tap-to-open Popover with the hint, never `title=`; the interest badge → a button (stopPropagation) opening a Popover with rate · end date · days left and a 'View' link to the asset's Earning section."

### MUI-09 — AGREE
- Confirmed in my `shots/ux/08-asset-BTC-full.png` (plot ≈ 197px between two axes; two rows of green pills). Hiding the right axis labels below `md` is acceptable because the tooltip carries Price and the series is toggleable. The C-15 ordering note (promoted stats first on `< md`) is right — a 2-column grid puts a promoted card beside a demoted one otherwise.

### MUI-10 — OVERLAPS MUX-09 (label clause)
- Same conclusion (opposite sides cannot separate two ages ≈ 11px apart). Merged Change line for the C-20 amendment: "Stack the two age labels (`dy` offsets) whenever the ages are within 5 years or the plot is under 500px wide; below `md` shorten to 'Retire 60' / 'Earliest 62'." MUX-09's other half (collapse the scenario panel on phone) is separate and stands.

### MUI-11 — OVERLAPS MUX-13
- Same ⚠ on C-08. Merged Change line: "Make the existing subtitle chips the legend on every width — a colour dot before the headline 'You (TWR/MWR)' and before the benchmark name — so C-08 adds no row anywhere; if a drawn legend is still wanted on desktop, below `md` it becomes an in-chart top-left overlay, never a fourth subtitle line." Chips-as-legend also removes a C-08 element rather than adding one (no-speculative-UI).

### MUI-12 — OVERLAPS MUX-11
- Same popover, two defects: MUI-12 width (names truncated at the 140px anchor width), MUX-11 height (listbox 201→869px on a 664px viewport). Merged Change line: "Select content for the asset/platform filters: `min-w-[280px]` (or `w-[calc(100vw-2rem)]` below `sm`) and `max-h-[50dvh]`; the trigger stays compact. The Add dialog's pickers already behave correctly (`shots/ui/P-43`)."

### MUI-13 — OVERLAPS MUX-10
- Complementary halves. Merged Change line: "Below `sm`: one-row header (title + a single ⋯ menu holding Add row / Import / Import from Midas; one exit per C-19); import-first empty state (the two import actions, 'rows ready' summary, Save/Discard) with the grid rendered only once rows exist; when the grid shows, row-number + Ticker column `position: sticky; left: 0`; footer gets the MUI-04 safe-area inset. C-05's invisible Import buttons recur here and must be fixed in the same pass."

### MUI-14 — AGREE
- Confirmed (`shots/ux/01-dashboard-fold.png`, "ALL" alone); I had it in also-noted. Fold the `< sm` sizing into C-01's ToggleGroup restyle so it is done once.

### MUI-15 — AGREE
- Confirmed (`shots/ux/07-budget-fold.png` axis "$4,500.00"). Reusing the hero's `compactCurrency` is the right no-new-convention fix.

### MUI-16 — OVERLAPS MUX-12
- Same finding. MUI-16's Change line survives with my addendum: "value + mode-dependent return right-aligned in the mobile header (`text-sm tabular-nums`); the count moves into the label and includes nested children ('Fiat · 5') or is dropped."

## Defense / withdrawals

- **Withdrawn:** MUX-07 (safe area) → MUI-04, which has the `index.html:5` and editor-footer evidence.
- **Merged (survive as one entry each):** MUX-01 + MUI-01 + MUI-02 (dialog primitive as phone sheet, single-row footer); MUX-02 + MUI-03 (`lg` breakpoint); MUX-03 + MUI-06 (above-the-fold budget, both pages); MUX-05 + MUI-08 (MUX-05 text survives — retirement hints + spec 13); MUX-06 + MUI-05; MUX-08 + MUI-07 (MUI-07 inventory survives); MUX-09 label clause + MUI-10; MUX-10 + MUI-13; MUX-11 + MUI-12; MUX-12 + MUI-16; MUX-13 + MUI-11. That is 1 withdrawn, 10 merged.
- **Stand alone:** MUX-04 (staleness indicator hidden below `sm`, `PriceRefreshButton.tsx:55`; spec `05-price-engine.md:105-107`) — the UI reviewer did not raise it; pre-empting "the icon is enough": the icon shows a spinner while refreshing and nothing about age, so on the phone the 3-level fresh/warning/stale indicator the spec promises does not exist. MUX-09 panel-collapse half (Retirement answer ~1,100px down) — no UI counterpart; the "collapse behind a summary line like Assumptions" reuses an existing pattern.
- **Evidence I can supply to the UI reviewer's "Not reviewed":** the keyboard case in MUX-01 was simulated by shrinking the viewport to 364px — focused Quantity at y=456 leaves the screen and the dialog collapses to 328px (`shots/ux/02-add-keyboard-up.png`); that is why the merged dialog fix must use `dvh` and a sheet, not only a sticky footer.
- **Cleared deferred items (both sides agree):** C-04 (cards already right-align Total), C-13 (no Bought column on cards), C-15 (2×4 grid has room — with MUI-09's ordering note), C-17 (4+4+1 acceptable).

## Collisions

- **(MUX-01, MUI-02)** — footer design: mine "footer pinned to the sheet bottom", theirs "one 56px row, Cancel → header ✕". Resolution: theirs, inside my sheet; Cancel as ✕ is acceptable because Escape/backdrop still exist on desktop and the sheet header is always visible on phone. Reject shortening "Withdrawal" (glossary label); accept the 4+4+1 wrap.
- **(MUX-03, MUI-06)** — I proposed a floating/sticky Add Transaction; MUI-06 compacts the page instead. Resolution: drop the FAB (a new element, against the no-speculative-UI rule) — once title/stats/filters compact, the header-row button is in the first screen, which is the goal.
- **(MUX-05, MUI-08)** — badge behaviour: mine Popover; theirs Popover *or* link to the asset's Earning section (which is what an accidental tap already does). Resolution: Popover with a "View" link inside it — the detail is one tap, the section is two.
- **(MUX-06, MUI-05)** — Budget treatment: theirs "stacked card rows", mine "keep Month · Income · Spent · Rate as a row, Invested on a second line". Resolution: mine for Budget (the monthly scan is a table job; Spent must stay in a column), theirs for Settings › Assets and By-platform.
- **(MUX-13, MUI-11)** — legend placement: mine dots on the existing chips, theirs in-chart overlay or benchmark-chip-as-legend. Resolution: chips-as-legend on all widths (removes C-08's separate row entirely); overlay only if desktop insists on a drawn legend.
- **(MUX-09, MUI-10)** — none conflicting; label clause merged, panel-collapse clause kept.
- **(MUX-10, MUI-13)** — none conflicting; import-first empty state + one-row header + sticky column merged.
- **(MUX-02, MUI-03)** — none; both pick `lg`.
