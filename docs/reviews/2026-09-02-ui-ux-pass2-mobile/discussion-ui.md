# Mobile round 2a — UI reviewer's response to ux-findings.md (MUX-01…13)

Re-checked against the frozen worktree (2a2898e, :5174) before writing: `components/prices/PriceRefreshButton.tsx:55`, `components/retirement/RetirementControls.tsx:30`, `components/interest/InterestPositionForm.tsx:215,229`, `components/portfolio/PortfolioRow.tsx:280-287`. Two UX citations point at the main checkout rather than the frozen copy — noted inline; neither changes the finding. Paths below relative to `src/`; shot paths relative to `<scratchpad>/review/mobile/`.

The overlap is near-total (12 of 13), so each OVERLAPS entry names the single merged item that survives and gives its exact `Change:` line.

---

### MUX-01 — OVERLAPS MUI-01 + MUI-02
- Same geometry, measured independently to the pixel (Buy 943 / Dividend 965 / Edit 979 vs 598 visible; SE 511 vs 985). UX adds the decisive extra evidence — keyboard-up viewport 364px shrinks the dialog to 328px and the focused Quantity field leaves the screen — and the right fix level: the primitive. Citation drift: `AddTransactionModal.tsx:659` is the main checkout; frozen is `:568`. My MUI-01 evidence line was too broad for the interest dialog — frozen `InterestPositionForm.tsx:229` does scroll the form grid at `max-h-[65vh]`, but header + description + footer sit outside it, which is exactly why Save lands at y=777; the root cause is still `dialog.tsx:56` (centred card, no viewport constraint).
- **Surviving merged item (high, ⚠ C-02): MUX-01 text with MUI-02's footer clause.** Change: "Below `sm`, render `DialogContent` (`components/ui/dialog.tsx:56`) as a full-height sheet — `inset-x-0 bottom-0 h-[100dvh]`, no centring transform — with a fixed header (title + ✕), a scrolling body, and the footer pinned to the bottom; use `dvh` so the sheet tracks the keyboard. On the sheet the footer is one row (primary + `Save & add another` as a text/secondary button; Cancel is the header ✕), ≈56px, so C-02's stacked three-button footer is never rendered below `sm`. Desktop keeps C-02 as ratified. Acceptance: submit visible without scrolling at 390×664 and 375×568 for all eight types, Edit, Add Asset and Add interest position; at a 364px viewport the focused input stays on screen."

### MUX-02 — OVERLAPS MUI-03
- Identical evidence (1040/972px tables in a 480px wrapper beside a 240px sidebar at 768). One arithmetic point the merged line must carry: moving only the sidebar to `lg` does not rescue 1024–1279 — at 1024 the content column is ~736px and the Portfolio table needs 1040, so C-13's 990px budget still overflows there.
- **Surviving merged item (high, ⚠ C-13): MUX-02 text.** Change: "Move both switches to `lg` (1024): sidebar/tab bar (`Sidebar.tsx:57`, `MobileNav.tsx:32` → `lg:`), and table↔cards on Portfolio and Transactions (`PortfolioTable.tsx:41,74`, `TransactionList.tsx:47,76` → `lg:hidden` / `hidden lg:block`). Then re-measure C-13 at 1024×768 (content ≈736px, TRY mode): either the table fits by dropping the `(~$x)` equivalents and truncating Platform at `lg`–`xl`, or cards persist to `xl` — the implementer picks after measuring, not before."

### MUX-03 — OVERLAPS MUI-06
- UX measured what I described (first transaction card at y=756 in a 664 viewport; Portfolio's first group header at the fold). UX adds the filters disclosure and a reachable Add Transaction; mine adds the duplicate page title (header `h1` + page `h1` + subtitle, `Header.tsx:44`, `PortfolioPage.tsx:33`, `TransactionsPage.tsx:50`) that costs ~90px on every page. Both belong in one item. One caveat on "floating button": keep it a relocation of the existing primary action (a sticky row above the tab bar), not a new FAB idiom the app has nowhere else.
- **Surviving merged item (medium): MUX-03 text + MUI-06's title clause, scope Portfolio and Transactions.** Change: "Below `md` hide the page `h1`/subtitle (the phone header already names the page). Below `sm` collapse the summary cards into one compact strip (Portfolio: Total Value · P&L side by side, Held Assets as the P&L caption; Transactions: count · buy · sell in one row); put the Transactions filters behind a `Filters (n)` disclosure that opens with presets and chips; make Add Transaction a sticky row above the tab bar so the list begins inside the first screen. Acceptance: the first holding / first transaction card is visible at 390×664 without scrolling."

### MUX-04 — AGREE-WITH-CHANGE
- The staleness label is genuinely hidden below `sm` (`PriceRefreshButton.tsx:55` `hidden sm:inline`, confirmed in the frozen copy) — a UX finding I did not make; agree with the compact age/dot. Change: the "40px hit area" half belongs in the merged tap-target item (MUX-08/MUI-07), where the rule is stated once for the whole header — keep MUX-04 to the staleness indicator so one finding does not carry two proposals. Visual note for the dot: use the three-level tone the price engine already defines (fresh/warning/stale), not the gain/loss palette.

### MUX-05 — OVERLAPS MUI-08
- Same class of defect; UX adds two things I missed — the 12×12 retirement `Info` buttons (`RetirementControls.tsx:30` `size-3`, confirmed) and that tapping the interest badge *navigates* because it sits inside the card `<Link>` (`PortfolioRow.tsx:280-287`, confirmed). Mine adds the DOM proof (`[role=tooltip]` count 0 after tap) and the `title=` hint sites.
- **Surviving merged item (medium): MUX-05 text.** Change: "Retirement `What is…?` → `Popover` on tap with a ≥40px target (or the one-liner as a muted caption under the label below `sm`); XIRR/MWR hints (`DashboardHero.tsx:486,606`, `PortfolioSummaryBar.tsx:84`) → the shared hint as a tap `Popover` chip, never `title=`; interest badge → a `<button>` that stops propagation and opens a `Popover` with rate · end date · days left, or print that line in the card under the ticker. ⚠ interacts with C-15/UX-06: the shared MWR micro-label must use this tap-reachable hint."

### MUX-06 — OVERLAPS MUI-05
- Same three tables (Budget 538–570px, By platform 415–497px, Settings 670–687px — the width difference is wrapper padding). UX's per-table layouts are more concrete than my "cards or fade + sticky column"; adopt theirs and drop the fade fallback so there is one proposal.
- **Surviving merged item (medium): MUX-06 text.** Change: "Below `sm`: Budget months — Month · Income · Spent · Rate on the row, Invested as a second line under Income (`MonthlyBudgetTable.tsx:108`); By platform — stacked rows: platform line, then quantity · value · P&L (`AssetPlatformTable.tsx:39`); Settings assets — the card list idiom Transactions already uses, Actions in the card header (`AssetList.tsx:129`). Add the 'cards on narrow screens' clause to specs 12 and 14."

### MUX-07 — OVERLAPS MUI-04
- Identical; mine additionally verified `index.html:5` lacks `viewport-fit=cover` (UX marked it unverified) and includes the editor footer.
- **Surviving merged item (medium): MUI-04 text.** Change: "Add `viewport-fit=cover` to the viewport meta (`index.html:5`); `pb-[env(safe-area-inset-bottom)]` on the tab bar (`MobileNav.tsx:32`) and on the editor footer (`TransactionsEditPage.tsx:100`); `pb-[calc(5rem+env(safe-area-inset-bottom))]` on `main` (`AppLayout.tsx:76`)."

### MUX-08 — OVERLAPS MUI-07 (absorbs MUX-04's size clause)
- Same measurements; UX's list is longer (ToggleGroup items 28px, Retirement action bar, salary delete, banner link) and their "padding, not larger glyphs" rule is the right visual constraint — it keeps desktop density and the icon weight.
- **Surviving merged item (medium): MUX-08 text + the header line from MUX-04/MUI-07.** Change: "Below `sm` a 40px minimum hit area via padding: header icon buttons `size-10` with the `size-4` glyph centred (`Header.tsx:50-52`, ThemeToggle, UserMenu); Portfolio card `Add Tx` → `size="sm"` `min-h-10` (`PortfolioRow.tsx:330`); `ToggleGroup` items and `DropdownMenu` items `min-h-10`; range/measure pills and type chips `min-h-10`; interest banner row is the link. Retirement `Info` icons are covered by MUX-05's ≥40px popover trigger."

### MUX-09 — OVERLAPS MUI-10 (labels); the scenario-panel clause is AGREED as UX-only
- The collapse-the-panel proposal is a task-flow change with no visual objection from me — accept as written. The chart-label clause is my MUI-10 with the same conclusion (two years ≈ 10–14px at 300–326px plot width; "opposite sides" cannot work).
- **Surviving merged item (medium, ⚠ C-20): MUX-09 text; label clause in MUI-10's words.** Change (label clause): "Below `sm` always stack the two age labels (`PlanChart.tsx:176,188` — `dy` offsets, retirement age first) and shorten them to `Retire 60` / `Earliest 62`; alternatively move both ages to a caption row under the chart. Desktop keeps C-20's within-3-years rule."

### MUX-10 — OVERLAPS MUI-13
- UX's "import-first screen" is the better primary proposal (the two import buttons are the only reason to open the editor on a phone); mine adds what happens when the grid *is* shown (one-row header, sticky row-number + ticker column, safe-area footer) and that C-05's invisible Import buttons recur here.
- **Surviving merged item (low, ⚠ C-19): MUX-10 text + MUI-13's grid clause.** Change: "Below `sm` open the editor as an import-first screen (Import · Import from Midas · rows-ready summary · Save/Discard) and reveal the grid only when rows exist. When the grid is shown: header collapses to one row (title + a `⋯` menu holding Add row / Import / Import from Midas — the C-05 fix applies here too), row-number + Ticker column `position: sticky; left: 0`, footer carries the safe-area inset (MUI-04). C-19's chrome restyle should size the header for this."

### MUX-11 — OVERLAPS MUI-12
- Same control, two symptoms: UX measured the height (listbox 201→869 on a 664 viewport, bottom cut with no cue); I measured the width (`min-w-[140px]` trigger, `TransactionFilters.tsx:203,240`, names truncated mid-word). One rule fixes both.
- **Surviving merged item (low): MUX-11 text + MUI-12's width clause.** Change: "Select content below `sm`: `max-h-[50dvh]` and `min-w-[280px]` (or `w-[calc(100vw-2rem)]`) so long lists scroll visibly and names are not truncated; the trigger stays compact. If MUX-01's sheet primitive lands first, long pickers may reuse it."

### MUX-12 — OVERLAPS MUI-16
- Identical (mobile group header shows label + count only, `PortfolioTable.tsx:77-90`); UX adds the count discrepancy (five cards under "3 assets") and the spec reference (08:212-214 — not drift).
- **Surviving merged item (low, ⚠ C-12): MUX-12 text.** Change: "Add value and the mode-dependent return right-aligned in the mobile group header (`text-sm tabular-nums`, gain/loss palette), the same figures C-12 places in the desktop cells; fold the count into the label (`Fiat · 3`) counting nested children, or drop it."

### MUX-13 — OVERLAPS MUI-11 (legend); the C-04/C-15/C-17 clearances are AGREED
- Legend: UX's "dots on the existing subtitle chips" is simpler than my in-chart overlay and adds no row at any width — and it can be the *desktop* implementation of C-08 as well, so there is one legend code path. C-04 and C-17 clearances match mine. C-15: UX clears it on card room; my MUI-09 note is about *ordering* (promoted Value / Total return / Today paired with un-promoted neighbours in the phone's 2-column grid), not room — I keep it as a low note, no conflict.
- **Surviving merged item (medium, ⚠ C-08): MUX-13's legend clause, applied at all widths.** Change: "Implement C-08's legend as colour dots on the subtitle chips — a dot before `You (TWR/MWR)` and before the benchmark name (`S&P 500` / `S&P 500 (same flows)`) — at every width, instead of a separate legend row; the chips already follow the measure toggle. Propose to the desktop implementer that C-08 adopt this form so phone and desktop share one implementation."

---

## Defense / withdrawals

- **Withdrawn: none. Merged: 13 of 16.** MUI-01 and MUI-02 → MUX-01 (one item); MUI-03 → MUX-02; MUI-04 → MUX-07 (my text survives); MUI-05 → MUX-06 (their text survives); MUI-06 → MUX-03; MUI-07 → MUX-08 (+ MUX-04's size clause); MUI-08 → MUX-05; MUI-10 → MUX-09 label clause; MUI-11 → MUX-13 legend clause; MUI-12 → MUX-11; MUI-13 → MUX-10; MUI-16 → MUX-12.
- **Corrected — MUI-01 evidence.** The interest-position dialog's form grid *does* scroll (`InterestPositionForm.tsx:229` `max-h-[65vh] overflow-y-auto`, frozen); the unreachable Save is because header, description and footer live outside that grid and the centred `DialogContent` has no viewport constraint. Finding and severity unchanged; the fix is unchanged (primitive-level sheet); the sentence "no `max-h`/`overflow`" applies to Add Asset / Platform / Scenario dialogs, not to this one.
- **Stand alone, unchanged:** **MUI-09** (Asset Detail chart: two y-axes leave a ~197px plot at 390, `AssetHistoryChart.tsx:99,110`; hide the price-axis labels and compact the value axis below `md`, `minTickGap`) — UX's also-noted mentions only the pill wrap; the axis budget is a UI-lens finding and stays medium. **MUI-14** (range row orphans `ALL`, `DashboardHero.tsx:835-845`) — UX also-noted it without a proposal; mine has one (`px-2 gap-1` below `sm`, or `flex-nowrap overflow-x-auto`), stays low. **MUI-15** (Budget y-axis prints cents, `BudgetTrendChart.tsx:67-70`; reuse `compactCurrency`) — not in the UX file, stays low.
- **Pre-empted objection — MUI-09 ordering note vs MUX-13's C-15 clearance.** UX is right that the 160px cards have room for larger figures; my note is that in a 2-column grid the promoted set (Value, Total return, Today) does not form its own rows, so a promoted figure sits beside an un-promoted one. Low, and compatible: order the promoted three first below `md`.

## Collisions

- **(MUI-01/02, MUX-01)** — max-h + overflow on the primitive vs full-height sheet. Resolution: sheet below `sm` (MUX-01) with the one-row footer (MUI-02); desktop keeps C-02's sticky footer. Merged Change above.
- **(MUI-03, MUX-02)** — "move both to `lg`" vs "move either". Resolution: move both, then re-measure C-13 at 1024 (≈736px content) — column drops at `lg`–`xl` or cards to `xl`, decided by measurement.
- **(MUI-06, MUX-03)** — title/strip vs disclosure/floating action. Resolution: both, with the action as a sticky row (existing idiom), not a FAB.
- **(MUI-05, MUX-06)** — fade + sticky column fallback vs per-table layouts. Resolution: per-table layouts only; no fade.
- **(MUI-07, MUX-04, MUX-08)** — `size="icon"` vs `size-10` hit area with the current glyph. Resolution: padding-based `size-10` (visual weight unchanged); MUX-04 keeps only the staleness indicator.
- **(MUI-10, MUX-09)** — stack when within 3 years vs always stack below `sm`. Resolution: always stack below `sm`; desktop keeps C-20's rule.
- **(MUI-11, MUX-13)** — legend overlay inside the chart vs dots on the subtitle chips. Resolution: dots on chips at all widths; propose the same to C-08 so one implementation serves both.
- **(MUI-13, MUX-10)** — one-row header + sticky column vs import-first screen. Resolution: import-first below `sm`; header/sticky rules apply when the grid is shown.
- **(MUI-12, MUX-11)** — width vs height on the same Select content. Resolution: one rule (`max-h-[50dvh]` + `min-w-[280px]`).
- **(MUI-09 note, MUX-13 C-15 clearance)** — no change conflict; the ordering note stands as low.
