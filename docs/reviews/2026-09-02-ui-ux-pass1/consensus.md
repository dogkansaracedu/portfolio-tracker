# Consensus — pass 1 (desktop) · agreed change list

Drafted by UX from `ux-findings.md`, `ui-findings.md`, `discussion-ux.md`, `discussion-ui.md`. Screenshot paths are relative to `<scratchpad>/review/`; code paths relative to the repo root. The seven UX amendments flagged as pending UI ratification in the draft (C-08, C-10, C-12, C-15, C-19, C-22, C-29) were reviewed by UI in round 2c; all accepted, tweaks applied inline, markers removed. Ordered by severity, then page.

---

## High

### C-01 · high · App-wide — one single-select control idiom
Sources: UI-03 (narrowed).
Change: Standardise every view/mode/range selector on the shadcn outline `ToggleGroup` already used by Portfolio (hero Value|Performance and TWR|MWR, hero range row, Transactions date presets, Retirement Nominal|Real / strategy / question chips, Asset Detail Cost·Price·range, Settings granularity); reserve solid `bg-primary` for the one primary action per page. Out of scope: the Transactions type chips / Add-form Type row (`TransactionTypeSelector.tsx`) — a colour-coded categorical picker (and a multi-select filter) that mirrors the log's Type badges. Land after C-02, then re-measure the Add dialog (see C-02).
Evidence: `shots/ui/02-dashboard.png` ; `src/components/dashboard/DashboardHero.tsx:459,845`.
Why: the same "pick one" interaction currently has five shapes, and solid-primary pills read as CTAs.

### C-02 · high · Add Transaction dialog — footer clipped; make it sticky
Sources: UX-01.
Change: Move `DialogFooter` out of the scrolling body (sticky, with a `border-t` hairline so the scroll boundary is visible), keep header + fields scrollable; optionally shorten the Buy form (Fee + currency inline with Unit Price). Acceptance: for every type, at 1440×900 and 1280×800, the Cancel / Save & add another / Add Transaction buttons' bounding boxes lie inside the dialog without scrolling — including the asset-prefilled variant (887px content).
Evidence: `shots/ux/11-add-buy-1440.png` ; `src/components/transactions/AddTransactionModal.tsx:955-985`.
Why: the most-used form has no visible submit on a normal laptop.

### C-03 · high · Portfolio + Asset Detail — P&L and cost follow the display currency
Sources: UX-02.
Change: In TRY mode, render P&L, cost basis, realized/unrealized, "Today" and group return subtotals converted to ₺ (presentation only; computation stays USD-anchored), matching the hero (`DashboardHero.tsx:588-596`). Replace the hardcoded `"USD"` at `PortfolioSummaryBar.tsx:74`, `PortfolioRow.tsx:193,202-203`, `PortfolioGroupHeader.tsx:63`, `AssetPositionSummary.tsx:52,84,173`, `AssetPlatformTable.tsx:65-72`. Update specs 08/12 to say P&L displays in the display currency. Do this before C-13 (column widths must be measured in TRY mode).
Evidence: `shots/ux/08-portfolio-TRY.png` ; `src/components/portfolio/PortfolioSummaryBar.tsx:74`.
Why: one row shows two currencies with no marker, and the same P&L is ₺ on one page and $ on the next.

### C-04 · high · Transactions table (and Asset Detail's) — right-align numerics
Sources: UI-01.
Change: `text-right` on Quantity / Unit Price / Total head and cells, `tabular-nums` on Quantity; approximate-USD sub-figure as a right-aligned second line. Portfolio row typography is the template.
Evidence: `shots/ui/04-transactions.png` ; `src/components/transactions/TransactionList.tsx:55-57`, `TransactionRow.tsx:77-103`.
Why: magnitudes cannot be compared down a start-aligned column.

### C-05 · high · Transaction editor header — "Import" / "Import from Midas" invisible in light mode
Sources: UI-02.
Change: Give both import triggers the same header-outline treatment as "Add row" via one shared `headerButtonClass`, or resolve together with C-19 (drop the inverted header).
Evidence: `shots/ui/50-txedit-top.png` ; `src/pages/TransactionsEditPage.tsx:40,49-53`, `src/components/transactions/sheet/ImportPopover.tsx:74`.
Why: the only route to CSV/PDF import is two blank pills.

---

## Medium

### C-06 · medium · Dashboard hero — Value-mode Δ with no real starting base
Sources: UX-04 (+ UI-05 rule).
Change: When the window has no real starting base (the condition that already hides the %), hide the Δ amount or render it in the default foreground (never `gainLossClass`) with the wording "since first deposit"; apply the same to the tooltip's period-delta row. Extend spec 07's denominator rule to the amount.
Evidence: `shots/ux/02-dash-value-ALL.png` ; `src/components/dashboard/DashboardHero.tsx:556-566`.
Why: "$47,481.31 all time" in green reads as profit.

### C-07 · medium · Dashboard hero — "Cost basis" / "Invested" → "Net invested"
Sources: UX-05 (+ UI-07 legend).
Change: One string constant "Net invested" for the Value-mode subtitle (`:571`), the Performance subtitle (`:649`), the dashed reference series and its tooltip row (`:741`), and the legend added in C-08. "Cost basis" stays reserved for FIFO figures (Portfolio "Bought", Asset Detail "Cost Basis").
Evidence: `shots/ux/02-dash-value-YTD.png` ; `src/components/dashboard/DashboardHero.tsx:262-263,571,649,741`.
Why: one figure carries two names, one of which is a different glossary term.

### C-08 · medium · Dashboard hero — benchmark line, legend, round ticks
Sources: UI-07.
Change: Benchmark as a 1.5–2px line in a dedicated neutral; two-item inline legend under the subtitle; nice-number tick step (0.5/1/2/5…). Legend labels follow the measure toggle exactly as the tooltip does — "You (TWR)" / "You (MWR)" and "S&P 500" → "S&P 500 (same flows)" under MWR (one label source shared by tooltip, subtitle chip and legend).
Evidence: `shots/ui/22-dash-1Y.png` ; `src/components/dashboard/DashboardHero.tsx:786-791,813-816,329-345`.
Why: the "you vs index" card's index line is a 45%-opacity hairline and its gridlines sit at 2.1% / 8.7%.

### C-09 · medium · Dashboard hero — English dates, "Şimdi" → "Now"
Sources: UX-10 + UI-08 (date clause).
Change: Format hero axis/tooltip dates with the app's English locale (same short-month style as the tables) and replace the `"Şimdi"` literal with a single "Now" constant in `DashboardHero.tsx:396-407,746-755`, `src/hooks/useDashboardHero.ts:146-151`, `src/lib/dashboard/intraday.ts:39,78`. TRY/EUR number grouping is NOT part of this change (see C-24).
Evidence: `shots/ux/13-hero-tooltip.png` ; `src/components/dashboard/DashboardHero.tsx:396-407`.
Why: the landing chart is the only Turkish-language surface in an English UI.

### C-10 · medium · Dashboard — one currency palette for Allocation and Currencies
Sources: UI-12.
Change: One shared currency-colour constant consumed by `AllocationChart` (outer fiat ring) and `CurrencyBreakdown`; category hues must not collide with platform colours (US Stocks ≠ IBKR blue). Constraint from spec `docs/components/07-dashboard.md:258`: the fiat currencies must remain one colour family in the donut, so the Currencies card adopts the donut's family (spaced for bar legibility), not the reverse. UI tweak: the *family* is the constraint, not the current green/teal/cyan hues — those collide with the Enpara/OKX green and Paribu cyan platform dots in the adjacent Platforms card exactly as US-Stocks blue collides with IBKR (`shots/ui/70-settings-platforms.png`, `shots/ui/10-dashboard-tall.png`). Pick one currency family that no seeded platform colour uses (platform colours are per-user data, so check against the current set) and apply it to both the donut's outer ring and the Currencies card.
Evidence: `shots/ui/10-dashboard-tall.png` ; `src/components/dashboard/AllocationChart.tsx:29-35`, `CurrencyBreakdown.tsx:11-15`.
Why: TRY is green in one card and amber in the next.

### C-11 · medium · Portfolio — persist Total/Daily, grouping, sort across navigation
Sources: UX-03.
Change: Store `returnMode`, `groupBy`, `sortBy` via `usePersistedState` (as the hero does at `DashboardHero.tsx:194-209`); search stays ephemeral. Spec 08 Contract states the persistence.
Evidence: `shots/ux/08-portfolio-after-nav.png` ; `src/hooks/usePortfolio.ts:135-138`.
Why: two toggles re-clicked on every visit, and the two main pages disagree on memory.

### C-12 · medium · Portfolio — group-header subtotals in their columns
Sources: UI-06.
Change: Render the header as real cells (subtotal in Value, return in P&L/Today, empty elsewhere; asset count stays beside the name) in both groupings and both return modes. Reword spec `docs/components/08-portfolio-page.md:178` from "full-width header row" to a header row whose subtotal and return sit in the Value and Return columns.
Evidence: `shots/ui/11-portfolio-tall.png` ; `src/components/portfolio/PortfolioGroupHeader.tsx:43-58`.
Why: the header exists to be scanned against its rows; today it is ~200px off.

### C-13 · medium · Portfolio at 1280×800 — fit the table without horizontal scroll
Sources: UI-13 (+ UX also-noted).
Change: Budget columns to ~990px — USD equivalents `(~$x)` on a second line in Bought/Price, Platform truncates — measured in TRY display mode after C-03 (widest strings), keeping the "+" row action and Alloc visible.
Evidence: `shots/ui/91-1280-portfolio.png` ; `src/components/ui/table.tsx:11`.
Why: the record-a-trade entry point is off-screen at a normal laptop width.

### C-14 · medium · Portfolio + Asset Detail — zero is neutral
Sources: UI-05.
Change: Tri-state colouring (gain / loss / neutral at zero) via a shared helper alongside `gainLossClass` (`src/lib/prices.ts:36-38`), applied at `AssetPositionSummary.tsx:51,83,172,190`, `PortfolioRow.tsx:107,275`, `PortfolioGroupHeader.tsx:39` and any other `>= 0` call site. Same rule governs C-06.
Evidence: `shots/ux/08-portfolio-daily-top.png` ; `src/lib/prices.ts:36-38`.
Why: a flat cash row is painted as a gain every day.

### C-15 · medium · Asset Detail — stat hierarchy, MWR label, chart controls, axis ticks
Sources: UI-10 + UX-06.
Change: Promote Value and Total return (e.g. `text-xl font-semibold`), demote Quantity / Allocation / Avg cost; the Total return % carries the shared micro-label "MWR" inline after the % in `text-xs text-muted-foreground` (same row as the existing "≈%/yr", no third line) with the one app-wide hint string; header price at the Portfolio-row price weight; Cost/Price toggles styled per C-01, distinct from the range row; `minTickGap={40}` on the x-axis. Also promote "Today" to the same tier (three promoted cards — Value, Total return, Today — share one size; the 2×4 grid keeps each row equal-height so the mixed tiers do not stagger). Unify the label app-wide: hero "XIRR" chip and Portfolio "MWR" chip use the same term/hint (keep "/yr" only on annualised readings).
Evidence: `shots/ux/05-asset-AAPL.png` ; `src/components/asset-detail/AssetPositionSummary.tsx:28-29,50-63`.
Why: the one screen about a position shows its key figures at label size and an unlabeled % beside a differently-based %.

### C-16 · medium · Transactions — no gain/loss palette on volumes and quantities
Sources: UI-04 (absorbs UX-12).
Change: Buy/Sell Volume and the Quantity column in the default foreground (ASCII sign carries direction; the Type badge already colours buy/sell); the palette on this page is reserved for the realized P&L line, and any remaining colour goes through `gainLossClass` (remove hand-rolled `green-600`/`red-600`).
Evidence: `shots/ui/04-transactions.png` ; `src/components/transactions/TransactionSummary.tsx:27,38`, `transactionRowModel.ts:94-98`.
Why: a sale is not a loss, and "$0.00" volume is painted red/green.

### C-17 · medium · Add Transaction — "Transfer" type
Sources: UX-07.
Change: Add a "Transfer" chip to the Type row (wraps 5 + 4) that sets `transfer_out` with Destination Platform required; Withdrawal keeps destination hidden/optional. Out of C-01's scope (categorical picker).
Evidence: `shots/ux/07-add-type-Withdrawal.png` ; `src/components/transactions/TransactionTypeSelector.tsx`.
Why: the log and filter say "Transfer"; the form has no such type.

### C-18 · medium · Add Transaction — smarter defaults
Sources: UX-08.
Change: Prefill Platform when the asset has holdings on exactly one platform (row "+" and asset-page button pass it); for a Buy, default Funding source to the platform's price-currency cash holding when its balance covers the total, else "External cash".
Evidence: `shots/ux/09-add-buy-AAPL-IBKR.png` ; `src/components/transactions/AddTransactionModal.tsx:200,106,319-339`.
Why: two clicks per trade, and the current default silently inflates net invested.

### C-19 · medium · Transaction editor — app chrome
Sources: UI-09.
Change: Keep the full-screen layout; header/footer on app surface tokens (`bg-card`/`border-b`), standard primary Button for Save, Title-case column heads, and either drop the `YYYY-MM-DD` hint or show ISO in the date cell. Keep one exit: drop the header "Cancel" (`:81`) and keep the footer "Discard and go back" (`:108`) beside Save, so the two terminal actions sit together as in every dialog footer in the app.
Evidence: `shots/ui/52-txedit-bottom.png` ; `src/pages/TransactionsEditPage.tsx:40,100,139`.
Why: the bulk editor reads as a different product.

### C-20 · medium · Retirement — projection chart/table floor at zero; label collision
Sources: UX-09 + UI-11.
Change: Floor the displayed series and milestone values at 0 (solvers keep unfloored maths, `projection.ts:167`), which sets the y-domain; print "depleted at age N" in the pessimistic cell/tooltip and as a marker; place the two age labels on opposite sides of their lines or stack them when within 3 years; label the target line with its value. One sentence in spec 13.
Evidence: `shots/ux/06-retirement-q-What.png` ; `src/components/retirement/PlanChart.tsx:106-112,168-190`.
Why: −$2.16M is not a portfolio value and the two ages overprint in the common case.

### C-21 · medium · Budget — multi-entry months
Sources: UX-11.
Change: Either open an inline editor listing that month's entries (amount per entry, delete) or let the cell adjust the last entry; whichever ships, a non-editable cell renders as plain text, not as a button. Update spec `docs/components/14-budgeting.md:60`.
Evidence: `shots/ux/06-budget.png` ; `src/components/budget/MonthlyBudgetTable.tsx:159-162`.
Why: the tooltip points to an editor that does not exist.

---

## Low

### C-22 · low · Transactions — one precision per figure type
Sources: UI-15.
Change: Return % = 2 dp; %/yr and pts = 1 dp; document in `src/lib/config.ts`. Route the sell-row realized % through `formatSignedPercent` and update spec `docs/components/04-transaction-system.md:151-160` examples (`(20.0%)` → `(20.00%)`) — the row currently matches the spec, so the spec moves with it.
Evidence: `shots/ui/18-asset-thyao-tall.png` ; `src/components/transactions/transactionRowModel.ts:132`.
Why: one number at two precisions on one screen.

### C-23 · low · Add Transaction — validate on submit
Sources: UX-14.
Change: Enable the submit buttons and validate on submit with field-level messages (the over-balance pattern), or a single muted line above the footer naming the first missing field.
Evidence: `shots/ux/09-add-empty-submit.png` ; `src/components/transactions/AddTransactionModal.tsx:449-458,967-984`.
Why: a 50%-opacity button with `pointer-events-none` explains nothing.

### C-24 · low · Number formatting rule
Sources: UI-08 (numeric clause, narrowed).
Change: Prefix the € symbol so all three currencies share symbol placement; document the rule ("currency amounts follow the currency's locale; quantities and percentages are en-US") in `src/lib/config.ts:58-62`. TRY stays `tr-TR` unless the owner asks otherwise — raise as a question, not a change.
Evidence: `shots/ui/12-transactions-tall.png` ; `src/lib/config.ts:58-62`.
Why: mixed grouping in one row is a misread risk, but ₺ notation is the owner's deliberate choice.

### C-25 · low · Campaigns — remove "Refresh"
Sources: UX-13.
Change: Remove the header button (the page refetches on mount; the button only re-reads a weekly table).
Evidence: `shots/ux/06-campaigns.png` ; `src/contexts/CampaignsContext.tsx:36-52`.
Why: it promises fresh research and delivers nothing visible.

### C-26 · low · Campaigns — "Ends soon" in the amber status tone
Sources: UI-14.
Change: Reuse the interest `ends_soon` tone (shared status-tone helper) at `CampaignsPage.tsx:366`; `secondary` stays for program type.
Evidence: `shots/ui/15-campaigns-tall.png` ; `src/pages/CampaignsPage.tsx:366`.
Why: the same 7-day warning is amber on one page and grey on another.

### C-27 · low · Settings — align spec 11 with the page
Sources: UX-16.
Change: Amend spec 11 so display preferences live in the global header only; add a one-line muted "Import transactions → Bulk add" link under a small heading (no card).
Evidence: `shots/ux/06-settings.png` ; `src/pages/SettingsPage.tsx:16-34`.
Why: the rebuild contract describes a page that does not exist.

### C-28 · low · Header — accessible name on the privacy toggle
Sources: UX-15.
Change: `aria-label={obfuscated ? "Show values" : "Hide values"}`, mirroring `ThemeToggle.tsx:22`.
Evidence: `shots/ux/02-dash-privacy.png` ; `src/components/layout/Header.tsx:47-63`.
Why: the icon-only button announces as "button".

### C-29 · low · Login (and Signup) card — footer spacing
Sources: UI-16.
Change: `space-y-4`/`gap-4` on the `<form>` (or `mt-4` on `CardFooter`) so the footer keeps the Card rhythm; apply the same to the Signup card (same `<form>`-wraps-`CardContent`+`CardFooter` structure, `src/components/auth/SignupForm.tsx:55-116`).
Evidence: `shots/ui/01-login.png` ; `src/components/auth/LoginForm.tsx:47-93`.
Why: the first screen of every session looks clipped.

---

## Collision resolutions (all eight pairs)
- (UX-02, UI-13) → C-03 lands first; C-13 measured in TRY mode.
- (UX-10, UI-08) → C-09 owns dates; C-24 owns numbers, narrowed, TRY untouched.
- (UX-05, UI-07) → C-07's "Net invested" is the legend/tooltip string in C-08.
- (UX-06, UI-10) → C-15: label inline after the %, no third line.
- (UX-09, UI-11) → C-20: floor sets the domain; UI keeps labels.
- (UX-01, UI-03) → C-02 first; C-01 excludes the type selector, so the dialog height is unaffected — re-measure once anyway.
- (UI-05, UX-04) → one rule (C-14) applied in C-06: zero / no-base figures use the default foreground.
- (UI-03, UX-07) → type selector out of C-01's scope; C-17 adds the chip freely.

## Also noted (unranked, owner's call)
Retirement caption says "in today's USD" while showing ₺ in TRY mode; Add-form date "September 2nd, 2026" vs table "Aug 28, 2026" (`AddTransactionModal.tsx:720`); Fiat header "(3 assets)" vs five rows shown; funded-buy delete confirm does not mention the cash leg; "Earning" / "Positions ending soon" / "Add interest position" for one glossary term; two "today" windows (hero 1D rolling 24h vs Portfolio "Today" since last daily snapshot) with no hint; Settings "Active" badges in primary, lowercase "fund" category; Alloc mini-bar scaled to 100% (1–7px nubs); Value-mode 1M axis has two labels; Campaigns card footers unaligned.

## Dropped / withdrawn
- UX-12 — identical to UI-04; folded into C-16.
- UI-08 date clause — folded into C-09; numeric clause survives as C-24 (low).
- UI-11 y-domain clause — folded into C-20 (flooring sets the domain); labels survive.
- UI-03 type-selector item — scoped out (categorical, colour-coded); five idioms remain.

## Do not change
- Dashboard net worth = Portfolio total to the cent when loaded simultaneously; hero "Total" = Portfolio P&L (snapshot-sourced design works).
- Privacy toggle masks every amount, keeps every %, persists with currency across reloads.
- Transactions filters in the URL; TRY filter reveals cash legs; transfer-pair delete names both rows, edit says "saving updates both sides".
- Sell/Withdrawal "Balance on this platform", Max, inline over-balance error in native units; interest banner deep-links to the asset.
- Portfolio table row typography (muted Bought / dark Price / bold Value, amount-over-% P&L, right-aligned `tabular-nums`) — the template for C-04.
- Dark-mode parity (only the editor header fails — C-05).
- Label-over-figure scale of the Value-mode hero and the three summary cards — C-06 removes one line in ALL/2Y only, scale untouched.

## Deferred to pass 2 (mobile)
- C-02 sticky footer and C-17's 5+4 chip wrap on a phone-height dialog.
- C-13's second-line USD equivalents vs the Portfolio mobile cards (spec 08 "Mobile (cards)").
- C-12 header-as-cells in the simplified mobile group header.
- C-08 legend and C-20 label stacking at narrow widths; C-15 promoted stat sizes in the stacked card layout.
- C-04 right-aligned numerics on the Transactions card list; C-19 editor chrome on small screens.
- Hover-only affordances (interest badge popover, `title` hints on XIRR/MWR) need touch equivalents.

Ratified by UI: 7 accepted, 0 unresolved
