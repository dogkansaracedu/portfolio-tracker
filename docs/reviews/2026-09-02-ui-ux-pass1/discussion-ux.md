# Round 2a — UX reviewer's response to ui-findings.md

Verified against the running app and the repo before answering; file paths relative to the repo root (`src/…`, `docs/…`).

### UI-01 — AGREE
- Confirmed in my own shots (`shots/ux/01-transactions.png`, `05-asset-AAPL.png`): Quantity / Unit Price / Total start-aligned while Portfolio is right-aligned `tabular-nums`. Spec 09 says nothing about alignment, so no doc edit is needed; the Portfolio row is the right template (I agree with UI positive 1).

### UI-02 — AGREE
- My `shots/ux/09-bulk-edit.png` shows the same two blank pills on the dark header. Task consequence the UI proposal can absorb: this page is the only route to CSV/PDF import (spec 11 sends Settings here as a "pointer"), so the invisible buttons hide the whole import feature, not just two controls.

### UI-03 — AGREE-WITH-CHANGE
- Standardise the single-select controls, but exclude the Transactions **type chips** from the list: they are a multi-select filter (spec `docs/components/09-transactions-page.md` "one or more transaction types (multi-select)"), and they intentionally carry the same per-type colour as the row badges (`components/transactions/TransactionTypeSelector.tsx`), which is how the user matches chip to row. Keep one multi-select idiom (chips) and one single-select idiom (outline ToggleGroup); the Add-form Type row is single-select and should follow the ToggleGroup but may keep its per-type colour on the active item since it mirrors the badge the user will see in the log.

### UI-04 — OVERLAPS UX-12
- Same finding; UI-04 is the richer write-up (adds the `green-600` hue drift at `transactionRowModel.ts:94-98` and the "$0.00 in red" case). Merged proposal that should survive: Buy/Sell Volume in default foreground; quantity in default foreground with its ASCII sign (the Type badge already colours direction); any residual colour routed through `gainLossClass`. UX-12 withdrawn in its favour.

### UI-05 — AGREE
- Confirmed (`shots/ux/08-portfolio-daily-top.png`, USD row "$0.00 / 0.00%" emerald). `gainLossClass(positive: boolean)` at `src/lib/prices.ts:36-38` has no zero branch, and the app's own convention (formatSignedCurrency docstring `:40-42`: "gains and zero render bare") already treats zero as neutral for the sign — colour should follow. Prefer the tri-state helper over per-call-site fixes: there are 20+ `gainLossClass(x >= 0)` sites and a helper keeps them from drifting again.

### UI-06 — AGREE-WITH-CHANGE
- Agree the subtotals should land in the Value / P&L columns — it is the only way the Daily-mode invariant (header = sum of visible rows, spec 08 "Group rollup") can be checked by eye. Change: spec `docs/components/08-portfolio-page.md:178` currently says "Each group = a full-width header row … value subtotal, return subtotal", so the same change must reword that line to "a header row whose subtotal and return sit in the Value and Return columns"; keep the asset count next to the group name. Also decide what the header shows in Platform grouping (same cells — no nesting there, so nothing special).

### UI-07 — AGREE-WITH-CHANGE
- Agree on line weight, legend and nice ticks. Change: the legend labels must follow the measure toggle the way the tooltip already does (`"You (TWR)"` / `"You (MWR)"`, and the benchmark label becomes "S&P 500 (same flows)" under MWR — spec 07 "Measure toggle", and the subtitle already switches). A static legend saying "S&P 500" under MWR would mislabel the what-if index.

### UI-08 — OVERLAPS UX-10 (dates) · AGREE-WITH-CHANGE (numbers)
- The date/axis/"Şimdi" part is UX-10 — one merged item: hero dates in the app's English locale, "Şimdi" → "Now" as a constant (`DashboardHero.tsx:396-407,746-755`, `useDashboardHero.ts`, `intraday.ts`). The number-locale part is different in kind: TRY = `tr-TR` and EUR = `de-DE` are a deliberate config (`src/lib/config.ts:58-62`, not mentioned in any spec) made by a Turkish owner who reads ₺ figures in Turkish notation every day. I agree the mixed row ("35,040.994223" next to "₺186.657,52") is a misread risk, but this is an owner decision, not a reviewer call: raise it as a question ("one grouping convention for the whole UI?") and, if he says yes, the fix is one line in `config.ts` — do not bundle it into the date fix.

### UI-09 — AGREE
- Confirmed (`shots/ux/09-bulk-edit.png`): black bars, amber Save, uppercase heads, native date cell. One addition from the flow side: the page has two exits that do the same thing ("Cancel" top-right and "Discard and go back" bottom-left, `pages/TransactionsEditPage.tsx:81,108`) — keep one when the chrome is redone.

### UI-10 — AGREE-WITH-CHANGE
- Agree on promoting Value and Total return and demoting Quantity/Allocation/Avg cost; agree on Cost/Price toggles and `minTickGap`. Change: the promoted Total return % must carry the MWR micro-label from UX-06 (`AssetPositionSummary.tsx:50-63` shows a bare "(60.85%)" next to "Unrealized P&L (25.81%)") — enlarging an unlabeled % makes the two-bases problem more prominent, not less. I would also promote "Today" to the same tier: "check one position" is usually "what did it do today", and it is currently the same size as Allocation.

### UI-11 — OVERLAPS UX-09
- Same chart, two symptoms (UI: collision + wasted −$20M band; UX: negative values in the milestones table and the axis). One merged proposal: clamp the y-domain at `[0, 'auto']`, floor the displayed series and table values at 0 and print "depleted at age N" in the pessimistic cell/tooltip and as a marker, keep the unfloored maths internal for the solvers (`lib/retirement/projection.ts:167`), and separate the two age labels (opposite sides or `dy` stack when within N years). Spec 13 gets one sentence on the floor.

### UI-12 — AGREE-WITH-CHANGE
- Agree the two cards must share one currency palette and that US Stocks must not be IBKR-blue. Change: the shared palette has to satisfy spec `docs/components/07-dashboard.md:258` — "The fiat currencies share one colour family so the cash wedge still reads as a single block" — so the donut's green/teal ramp is the constraint and the Currencies card should adopt it (with hues spaced enough to separate USD/TRY/EUR in bars), not the other way round. Spec `:78` ("Distinct hues per currency, intentionally not the gain/loss palette") is satisfied either way.

### UI-13 — AGREE-WITH-CHANGE
- Confirmed (`shots/ux/13-portfolio-1280.png`; wrapper `overflow-x-auto`, scrollWidth 1055 vs 992). Agree with fitting the table at ~990px rather than adding a scroll cue — the "+" row action is the record-a-trade entry point and must be visible without a horizontal drag. Change: budget the columns with TRY display mode on — if UX-02 lands, the P&L column carries strings like "−₺31.369,09" and the Value column "₺2.309.025,44", which are wider than their $ equivalents; measure in TRY mode, not USD.

### UI-14 — AGREE
- Confirmed: `pages/CampaignsPage.tsx:366` uses `<Badge variant="secondary">` for "Ends soon" while the interest ladder tones it amber (`lib/constants/interest.ts`). The glossary makes the 7-day horizon one concept across campaigns and interest positions ("Interest status ladder"), so one tone is also a spec-consistency fix.

### UI-15 — AGREE-WITH-CHANGE
- The 1-dp on sell rows is not drift — it is the spec: `docs/components/04-transaction-system.md:151-160` gives the worked format as `$50.00 (20.0%)` and `~$13.33 (66.7%)`, and `transactionRowModel.ts:132` implements exactly that. So the card (2 dp) and the row (1 dp) are both "correct" to their sources, and the fix must include a spec edit whichever precision wins. I'd take the UI reviewer's rule (return % = 2 dp; %/yr and pts = 1 dp) and update spec 04's examples to `(20.00%)` — but the change is not "route through `formatSignedPercent` and done".

### UI-16 — AGREE
- Confirmed in `shots/ux/00-login.png` (grey footer flush under the password input). The signup form (`shots/ux/13-signup.png`) has the same Card structure and should get the same fix.

## Defense / withdrawals

- **Withdrawn:** UX-12 (volume/quantity palette) — identical to UI-04, which has the better evidence; UI-04 survives.
- **Merged, not withdrawn:** UX-09 into UI-11 (retirement chart/table), UX-10 into UI-08's date half (hero locale); my "also noted" 1280 item is UI-13. The surviving merged items are stated above.
- **Kept, pre-empting objections:**
  - **UX-02 (P&L currency under TRY).** The UI reviewer may read "convert P&L to ₺" as touching the USD anchor. It does not: the anchor is where P&L is *computed* (glossary "USD anchor"); display conversion is what the hero already does at `DashboardHero.tsx:588-596` and what spec 11 promises ("re-denominates every money amount"). The finding is the cross-page inconsistency; if the owner prefers USD-visible P&L, the resolution is the hero stops converting and the column header says "P&L ($)". Either way one rule.
  - **UX-04 (Value-mode ALL Δ = whole portfolio).** UI positive 3 says the Value-mode hero's scale should be inherited, not replaced. UX-04 changes nothing about scale or layout — it hides or neutralises one delta line only when the window has no real starting base (the same condition that already hides the %). The Value-mode card looks identical on 1D–1Y.
  - **UX-13 (Campaigns Refresh).** Removing a control might look like a loss of "consistency" with the header's price-refresh button. The two are not the same thing: the header button triggers a fetch that can change prices; the Campaigns button re-reads a table that changes weekly. CLAUDE.md's no-speculative-UI rule applies.
  - **UX-01 (dialog footer clipped).** Independent of UI-03/UI-09; if the Type row becomes an outline ToggleGroup its wrap may change the dialog height, so re-measure the footer after both land (see Collisions).
  - **UX-06 (MWR label).** Reinforced by UI-10 rather than threatened — the label is what makes the promoted Total return card readable.
- **Downgrades:** none. UX-16 (Settings vs spec 11) stays low and is a doc-or-page decision for the owner.

## Collisions

- **(UX-02, UI-13)** — Converting P&L/cost to ₺ widens the P&L and Value columns; UI-13's ~990px column budget computed in USD mode will overflow again in TRY mode. Resolution: implement UI-13 measured in TRY mode (longest strings), moving the `(~$x)` equivalents to a second line and allowing the P&L amount/percent stack to keep the column narrow.
- **(UX-10, UI-08)** — Same date fix; UI-08 additionally changes TRY/EUR number grouping, which UX-10 deliberately leaves alone as a config decision (`config.ts:58-62`). Resolution: ship the date/"Now" fix now; put the number-grouping question to the owner separately; if he wants en-US grouping it is a one-line `config.ts` change plus a glossary/spec note.
- **(UX-05, UI-07)** — UI-07 adds a legend; UX-05 renames the "Cost basis" series to "Net invested". Resolution: the legend and tooltip use "Net invested"; no "Cost basis" string remains in the hero.
- **(UX-06, UI-10)** — Both edit the Asset Detail stat cards. Resolution: one change — promote Value / Total return (/ Today), label the Total return % "MWR" with the shared hint, demote the rest.
- **(UX-09, UI-11)** — Both edit `PlanChart`/`PlanMilestones`. Resolution: the merged proposal under UI-11 (clamp + floor + "depleted at age N" + label separation).
- **(UX-01, UI-03)** — Restyling the Add-form Type row as a ToggleGroup may change its wrap and therefore the dialog height that UX-01 measures. Resolution: land UX-01's sticky footer first (it is viewport-independent), then UI-03; re-measure the submit button's bounding box at 1280×800 for every type after both.
- **(UX-12, UI-04)** — Identical; UI-04 survives.
