# Consensus — pass 2 (mobile) · agreed change list

Drafted by UX from `mobile/ux-findings.md`, `mobile/ui-findings.md`, `mobile/discussion-ux.md`, `mobile/discussion-ui.md`. Target of every measurement: the frozen worktree (2a2898e, :5174) — line numbers are frozen-copy lines. Screenshot paths relative to `<scratchpad>/review/mobile/`; code paths relative to the repo root. Breakpoints are Tailwind's (`sm` 640, `md` 768, `lg` 1024). The one collision (M-03, Add Transaction placement) was settled empirically by UI in round 2c — see M-03. Last pass: nothing is deferred.

Baseline both sides confirmed: no route scrolls the body sideways (`documentElement.scrollWidth` = 390 everywhere); tab-bar active states are correct on every route; charts respond to tap.

---

## High

### M-01 · high · Dialog primitive — full-height sheet below `sm`, single-row footer, keyboard-safe
Sources: MUX-01, MUI-01, MUI-02.
Change: In `src/components/ui/dialog.tsx:56` render `DialogContent` below `sm` as a full-height sheet — `inset-x-0 bottom-0 h-[100dvh]`, no centring transform — with a fixed header (title + ✕), a scrolling body and the footer pinned to the bottom; `dvh` so the sheet tracks the keyboard. On the sheet the footer is one ≈56px row: primary (`Add Transaction` / `Save`) + `Save & add another` as a secondary/text button; Cancel is the header ✕. At `sm+` give `DialogContent` a default `max-h-[calc(100dvh-2rem)] flex flex-col` with a scrolling body so Add Asset / Platform / Scenario-name dialogs stop overflowing; C-02's desktop sticky footer stays as ratified. Remove per-dialog `max-h` overrides (`AddTransactionModal.tsx:568`, `InterestPositionForm.tsx:229`). C-17's ninth chip wraps 4+4+1 — accepted; do not shorten "Withdrawal" (glossary display label). Acceptance: submit visible without scrolling at 390×664 and 375×568 for all eight transaction types, Edit, Add Asset and Add interest position; at a 364px viewport the focused input stays on screen.
Evidence: `shots/ux/02-add-keyboard-up.png`, `shots/ui/P-70-settings-add-asset.png` ; `src/components/ui/dialog.tsx:56`, `src/components/transactions/AddTransactionModal.tsx:568`.
Why: every dialog on a phone hides its submit button, and with the keyboard open the field being typed into leaves the screen.

### M-02 · high · 640–1279px — move the sidebar/tab-bar switch and the table/cards switch to `lg`, then re-measure C-13 at 1024
Sources: MUX-02, MUI-03.
Change: `Sidebar.tsx:57`, `MobileNav.tsx:32`, `Header.tsx:44` → `lg:`; `PortfolioTable.tsx:41,74` and `TransactionList.tsx:47,76` → `hidden lg:block` / `lg:hidden`. Then re-measure C-13 at 1024×768 in TRY mode (content ≈736px vs a 1040px table): the implementer decides by measurement whether the table fits at `lg`–`xl` by dropping the `(~$x)` equivalents and truncating Platform, or whether cards persist to `xl`. Nothing about C-13 is assumed fixed by the breakpoint move alone.
Evidence: `shots/ux/12-tablet-portfolio.png` ; `src/components/portfolio/PortfolioTable.tsx:41` vs `src/components/layout/Sidebar.tsx:57`.
Why: iPad-portrait and landscape-phone users get a 240px sidebar beside a table that needs 1,040px in 480px — Value, P&L and Alloc are all off-screen.

---

## Medium

### M-03 · medium · Portfolio + Transactions — the first holding / first transaction inside the first screen
Sources: MUX-03, MUI-06.
Change: Below `md` hide the page `h1`/subtitle (the phone header already names the page, `Header.tsx:44`). Below `sm` collapse the summary cards into one strip — Portfolio: Total Value · P&L side by side (`grid-cols-2`), Held Assets as the P&L caption; Transactions: count · buy · sell on one line (must fit ₺-mode strings). Put the Transactions filters behind a `Filters (n)` disclosure that opens with presets + chips. Add Transaction stays the existing button in the top row (no new FAB idiom, no sticky row): measured on the frozen copy at 375×568 the button sits at y=140–172 in a 576px viewport, and hiding the 80px title/subtitle block above it puts it at ≈y=92 — inside the first screen unconditionally (`shots/ui/S-M03-transactions-375x568.png`). UI withdraws the sticky-row proposal; the thumb-reach argument had no evidence behind it. Acceptance: first Portfolio card / first transaction card visible at 390×664 without scrolling.
Evidence: `shots/ux/01-transactions-fold.png` (first card at y=756 of 664), `shots/ui/02-portfolio-fold.png` ; `src/pages/TransactionsPage.tsx:50-79`, `src/pages/PortfolioPage.tsx:33`, `TransactionSummary.tsx:12`, `PortfolioSummaryBar.tsx:54`.
Why: on the two most-visited pages the phone user scrolls a full screen past a duplicated title and stacked stat cards before the first number.

### M-04 · medium · Hover-only affordances get a tap path (retirement hints, MWR/XIRR hints, interest badge)
Sources: MUX-05, MUI-08.
Change: Retirement `What is…?` icons (`RetirementControls.tsx:30`, 12×12 Tooltip) → `Popover` on tap with a ≥40px target, or the one-liner as a muted caption under the label below `sm` (spec 13:263-264). XIRR/MWR hints (`DashboardHero.tsx:486,606`, `PortfolioSummaryBar.tsx:84`) → the shared hint as a tap `Popover` chip, never `title=` — this is the hint the C-15 "MWR" micro-label must use. Interest badge (`PortfolioRow.tsx:280-287`, Tooltip inside the card `<Link>`) → a `<button>` that stops propagation and opens a `Popover` with rate · end date · days left and a "View" link to the asset's Earning section.
Evidence: `shots/ux/03-portfolio-badge-tap.png` (tap navigates, no popover), `shots/ux/06-retirement-hint-tap.png` ; `src/components/interest/InterestBadge.tsx:41-78`.
Why: the glossary explainers and the "ends in 4 days" detail exist only for mouse users; on the phone the badge is an unexplained amber pill and the hint icons do nothing.

### M-05 · medium · Budget, By-platform and Settings › Assets tables — phone layouts instead of a silent sideways scroll
Sources: MUX-06, MUI-05.
Change: Below `sm` — Budget months (`MonthlyBudgetTable.tsx:108`): Month · Income · Spent · Savings rate on the row, Invested as a second line under Income; Asset Detail By platform (`AssetPlatformTable.tsx:39`): stacked rows — platform line, then quantity · value · P&L; Settings assets (`AssetList.tsx:129`): the card-list idiom Transactions already uses, Actions in the card header. Per-table layouts only — no fade/sticky-column fallback. Add the "cards on narrow screens" clause to specs 12 and 14.
Evidence: `shots/ux/08-asset-BTC-full.png` (Value clipped to "Val", P&L invisible), `shots/ui/07-settings-fold.png` ("$3", "₺1", Actions off-screen) ; `src/components/ui/table.tsx:11`.
Why: the hidden column is the one the page exists for — Spent on Budget, P&L on By-platform, the Actions menu on Settings — and nothing signals that the table continues.

### M-06 · medium · Safe-area insets for the tab bar, main padding and the editor footer
Sources: MUI-04, MUX-07.
Change: Add `viewport-fit=cover` to the viewport meta (`index.html:5`); `pb-[env(safe-area-inset-bottom)]` on the tab bar (`MobileNav.tsx:32`) and the editor footer (`TransactionsEditPage.tsx:100`); `pb-[calc(5rem+env(safe-area-inset-bottom))]` on `main` (`AppLayout.tsx:76`).
Evidence: `grep -rn "safe-area\|env(" src` → none ; `src/components/layout/MobileNav.tsx:32`, `index.html:5`.
Why: on every notched iPhone the 12px tab labels sit under the home indicator (CSS evidence; the emulator has no notch).

### M-07 · medium · 40px minimum hit areas below `sm`, via padding not larger glyphs
Sources: MUX-08, MUI-07 (+ MUX-04's size clause).
Change: header icon buttons `size-10` with the `size-4` glyph centred (`Header.tsx:50-52`, ThemeToggle, UserMenu); Portfolio card `Add Tx` → `size="sm"` `min-h-10` (`PortfolioRow.tsx:330`); `ToggleGroup` items, range/measure pills, type chips and `DropdownMenu` items `min-h-10` (Edit/Delete are 28px); interest card Edit/Close/Delete and Campaigns Track/Source `min-h-10`; the interest banner's whole row is the link (today a 274×16 text). Retirement `Info` icons are covered by M-04's popover trigger. Desktop density unchanged.
Evidence: `shots/ui/P-45-tx-row-menu.png`, `shots/ux/03-portfolio-fold.png` ; `src/components/portfolio/PortfolioRow.tsx:330`.
Why: the controls used every day (add a trade, open a row menu, switch Today/Total, hide values) are 24–28px — half the touch guideline.

### M-08 · medium · Header on phone — keep the price-staleness indicator
Sources: MUX-04 (UI: AGREE-WITH-CHANGE — indicator only; sizing lives in M-07).
Change: Below `sm` the refresh button shows a compact age ("2m", "3h", "2d") or a three-level fresh/warning/stale dot on the icon using the price engine's own tones (not the gain/loss palette), replacing the `hidden sm:inline` label (`PriceRefreshButton.tsx:55`).
Evidence: header dump on every phone route (refresh button innerText empty, 36×28) ; `src/components/prices/PriceRefreshButton.tsx:55`; spec `docs/components/05-price-engine.md:105-107`.
Why: on the device where the owner glances most, a stale price is indistinguishable from a live one.

### M-09 · medium · Retirement on phone — collapse the scenario panel; always stack the two age labels
Sources: MUX-09, MUI-10.
Change: Below `sm` collapse the scenario panel by default behind a one-line summary ("$1,000/mo · retire at 60 · 4% SWR — Edit"), the way Assumptions already collapses, so the question tabs and the answer land in the first screen. Chart labels (`PlanChart.tsx:176,188`): below `sm` always stack the two ages (`dy` offsets, retirement age first) and shorten to "Retire 60" / "Earliest 62" — or move both to a caption row under the chart; desktop keeps C-20's within-3-years rule.
Evidence: `shots/ux/01-retirement-full.png` (answer ≈1,100px down; "RetiremenEagle60retirement: 62" overprint) ; `src/components/retirement/PlanChart.tsx:176,188`.
Why: the monthly retirement check is one number the phone user never sees without scrolling past twelve inputs, and the chart's two ages overprint at 326px because two years ≈ 11px.

### M-10 · medium · Asset Detail on phone — chart axis budget and promoted-stat ordering
Sources: MUI-09 (+ MUX-13's C-15 clearance).
Change: Below `md` hide the right (price) axis labels (`AssetHistoryChart.tsx:110` — tooltip carries Price, series stays toggleable), set the left axis `width={44}` with a compact formatter (`3.2k`, `160k`), `minTickGap={48}` (compatible with C-15's 40). In the phone's 2-column stat grid order C-15's promoted stats (Value, Total return, Today) first so they form their own rows before Quantity / Avg cost / Allocation / Unrealized / Realized. Room for the promoted sizes is confirmed (≈160px cards).
Evidence: `shots/ui/10-asset-aapl-fold.png`, `shots/ux/08-asset-BTC-full.png` (plot ≈197px between two axes) ; `src/components/asset-detail/AssetHistoryChart.tsx:98-110`.
Why: the value history — the reason to open the page on a phone — gets half the card width, and a promoted figure would otherwise sit beside a demoted one.

### M-11 · medium · Hero legend as colour dots on the subtitle chips, at every width
Sources: MUX-13, MUI-11.
Change: Implement C-08's legend as a colour dot before the headline "You (TWR/MWR)" and before the benchmark name ("S&P 500" / "S&P 500 (same flows)") — the chips already follow the measure toggle — instead of a separate legend row at any width. If desktop still wants a drawn legend, below `md` it becomes an in-chart top-left overlay, never a fourth subtitle line.
Evidence: `shots/ux/01-dashboard-fold.png` (subtitle already 2–3 lines; chart top at y≈400 of 664) ; `src/components/dashboard/DashboardHero.tsx:551,585`.
Why: a legend row would push the landing chart and its range row below the phone fold; dots on the existing chips add nothing to the height and give one code path for both sizes.

---

## Low

### M-12 · low · Transaction editor on phone — import-first screen; one-row header and sticky ticker column when the grid shows
Sources: MUX-10, MUI-13.
Change: Below `sm` open `/transactions/edit` as an import-first screen (Import · Import from Midas · "rows ready" summary · Save/Discard) and render the grid only when rows exist. When the grid shows: header collapses to one row (title + a single ⋯ menu holding Add row / Import / Import from Midas; one exit per C-19), row-number + Ticker column `position: sticky; left: 0`, footer carries M-06's inset. C-05's invisible Import buttons recur here and are fixed in the same pass.
Evidence: `shots/ux/10-editor-fold.png` (three-row header ≈400px of 664; grid 913px in 390) ; `src/pages/TransactionsEditPage.tsx:40,87,100`.
Why: importing a broker PDF is the only phone use of this page, and its two buttons are buried under a wrapped header above an empty spreadsheet.

### M-13 · low · Transactions filter Select popovers — width and height
Sources: MUX-11, MUI-12.
Change: Select content below `sm`: `max-h-[50dvh]` and `min-w-[280px]` (or `w-[calc(100vw-2rem)]`); the `min-w-[140px]` trigger (`TransactionFilters.tsx:203,240`) stays compact. Long pickers may reuse M-01's sheet once it lands.
Evidence: `shots/ux/04-tx-asset-filter.png` (listbox 201→869 on a 664 viewport), `shots/ui/P-47-tx-asset-filter.png` ("Aselsan (ASELS.", "Berkshire Hathaw") ; `src/components/transactions/TransactionFilters.tsx:203,240`.
Why: the picker used to audit one asset's cash legs truncates names mid-word and runs off the bottom with no cue.

### M-14 · low · Portfolio mobile group header — value and return subtotals
Sources: MUX-12, MUI-16.
Change: Add the group's value and mode-dependent return right-aligned in the mobile header (`text-sm tabular-nums`, gain/loss palette; `PortfolioTable.tsx:77-90`) — the same figures C-12 places in the desktop cells; fold the count into the label ("Fiat · 5", counting nested children) or drop it. Spec 08:212-214 ("simplified header") is not drift; note the subtotal in it.
Evidence: `shots/ux/01-portfolio-full.png` ("Fiat · 3 assets" over five cards, no figures) ; `src/components/portfolio/PortfolioTable.tsx:77-90`.
Why: in Daily mode the phone user cannot check "what moved" per group without adding cards by hand.

### M-15 · low · Hero range row — no orphaned "ALL"
Sources: MUI-14 (UX also-noted).
Change: Below `sm` `px-2 gap-1` on the range pills (eight fit in 358px at ≈40px each) or `flex-nowrap overflow-x-auto`; fold into C-01's ToggleGroup restyle so it is sized once.
Evidence: `shots/ux/01-dashboard-fold.png`, `shots/ui/P-23-dash-ALL.png` ; `src/components/dashboard/DashboardHero.tsx:835-845`.
Why: the landing page's most-used control breaks onto two lines on every phone visit.

### M-16 · low · Budget chart y-axis — compact currency
Sources: MUI-15.
Change: Reuse the hero's `compactCurrency` formatter on `BudgetTrendChart.tsx:67-70` (`$4.5k`, `-$1.5k`); same for the Retirement Compare axis if it ever shows sub-million ticks.
Evidence: `shots/ux/07-budget-fold.png` ("$4,500.00", "-$1,500.00" axis ≈90px of 342) ; `src/components/budget/BudgetTrendChart.tsx:67-70`.
Why: a quarter of the phone chart is spent on ".00".

---

## Feeds back into desktop consensus
- **C-02** → M-01: the Dialog primitive becomes a full-height `dvh` sheet with a single-row footer below `sm`; the ratified sticky footer applies at `sm+` only, and the default `max-h`/scroll body moves to `dialog.tsx` so every dialog inherits it.
- **C-08** → M-11: implement the legend as colour dots on the subtitle chips at all widths (one code path); no separate legend row.
- **C-13** → M-02: breakpoints move to `lg`; the column budget is re-measured at 1024×768 in TRY mode before any column decision.
- **C-15** → M-04 (the "MWR" micro-label's hint must be a tap Popover, never `title=`) and M-10 (promoted stats first in the 2-column grid; `minTickGap` compatible).
- **C-19** → M-12: the chrome restyle sizes the phone header to one row (title + ⋯ menu) and keeps one exit.
- **C-20** → M-09: below `sm` always stack the two age labels (or caption them); the within-3-years rule is desktop-only.
- **C-12** → M-14: the mobile group header gets the value/return figures C-12 puts in the desktop cells.
- **C-05** → M-12: the Import buttons' header-outline treatment must be visible on the phone header too.
- **C-01** → M-15: the ToggleGroup restyle includes `< sm` pill sizing so the range row fits on one line.
- **C-17** → M-01: the ninth "Transfer" chip wraps 4+4+1 on phone — accepted as is.

## Already covered by the desktop implementation (mobile implementer verifies on phone, does not redo)
- C-02 desktop sticky footer at `sm+` (M-01 only changes `< sm`).
- C-04 numerics: the transaction cards already right-align Total and label Quantity/Total — no card work.
- C-09 hero dates / "Now": the phone chart shows the same axis and tooltip strings — verify "Ağu 2026 / Şimdi" are gone on the 1M chart and tap tooltip.
- C-11 Portfolio state persistence: verify Total/Daily and grouping survive tab-bar navigation on phone.
- C-14 zero-neutral: the phone Daily cards showed "$0.00 (0.00%)" in emerald (USD row) — verify the tri-state helper reaches `PortfolioRowCard`.
- C-16 palette: verify `TransactionRowCard`'s quantity colour (`d.amountColor`) went neutral with the table.
- C-18 defaults: the card "Add Tx" opens the same modal — verify single-platform prefill and funding default apply from the card entry point.
- C-22 precision: the card's realized line (`RealizedPnLLine`) shares the model — verify 2dp.
- C-25 Campaigns "Refresh" removed, C-26 "Ends soon" amber, C-28 eye `aria-label` — same components on phone; verify only.
- C-03 P&L in display currency: the phone cards render `netUsd` via the same hardcoded `"USD"` path (`PortfolioRow.tsx:310-316`) — verify the desktop change covered `PortfolioRowCard` and the mobile group header (M-14).

## Dropped / withdrawn
- MUX-07 → folded into M-06 (MUI-04 had the `index.html:5` and editor-footer evidence).
- MUI-01 + MUI-02 → folded into M-01; MUI-01's evidence corrected by UI: the interest form's grid does scroll (`InterestPositionForm.tsx:229`), the unreachable Save is the un-constrained `DialogContent` — finding unchanged.
- MUX-03's FAB → dropped (new idiom); MUI-05's fade/sticky-column fallback → dropped (per-table layouts only); MUI-09's ordering note → folded into M-10.
- MUX-03 severity high → medium in the merge (UI's disposition accepted).
- MUX-13's clearances (C-04, C-15 room, C-17) → recorded above, not separate entries.
- Also-noted items kept unranked: 16px child-card indent with no parent cue or chevron on phone; Sort select opens over the tab bar; Value-mode 1M axis shows two labels; possible lazy-load icon discs in dark mode (not claimed); iPhone SE taps timing out under the fixed bar (not investigated).

## Do not change
- No route scrolls the body sideways; every wide table sits in its own `overflow-x-auto` wrapper and `main` never exceeds 390px.
- Tab-bar active state is right on every route (Asset → Portfolio, Retirement/Settings → More); `main pb-20` clears the 57px bar; the phone header shows the page title.
- Portfolio and Transactions cards are well-formed — ticker/price/platform left, bold Value with P&L stacked right, Quantity/Total label-over-value, `tabular-nums`, gain/loss palette correct on dark; nested TP2/USDT cards mirror the desktop nesting; the linked-leg subtitle, type badge and realized line survive on cards.
- Charts answer to tap: hero tooltip, donut legend/slice centre swap, asset chart tooltip — no hover dependency.
- The delete confirmation, the date picker and the Add dialog's type/asset/platform pickers fit the phone viewport.
- Dark mode on phone has no light-only artefacts on the reviewed pages.

Ratified by UI: 16 accepted, 0 unresolved
