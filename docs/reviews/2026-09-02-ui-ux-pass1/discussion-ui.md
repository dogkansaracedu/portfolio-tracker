# Round 2a — UI reviewer's response to ux-findings.md

Re-checked before writing: `shots/ux/11-add-buy-1440.png` (matches my own `shots/ui/42-tx-add-modal.png`), `shots/ux/08-portfolio-TRY.png`, `shots/ux/02-dash-value-ALL.png`, `shots/ux/09-add-empty-submit.png`; code at `pages/CampaignsPage.tsx:159-161`, `components/budget/MonthlyBudgetTable.tsx:159-162`, `components/ui/button.tsx:7` (`disabled:pointer-events-none disabled:opacity-50`). Paths below relative to `src/`.

---

### UX-01 — AGREE
- Confirmed independently: my `shots/ui/42-tx-add-modal.png` at 1440×900 also ends under the Notes textarea with no footer and no scrollbar. Visual addendum to the proposal: a sticky footer inside `DialogContent` needs a top hairline (`border-t`) so the scroll boundary is visible when content sits beneath it — otherwise the same "is there more?" ambiguity returns from the other side.

### UX-02 — AGREE
- `shots/ux/08-portfolio-TRY.png` shows ₺ Value beside $ P&L on every row and in every group header ("₺899.744,65  -$133.52") — a two-currency row with no marker is a visual defect as much as a definitional one, so I back the primary recommendation (presentation follows the display currency, computation stays USD-anchored). One visual consequence the proposal should state: ₺ P&L figures are ~40% wider ("-₺30.412,18" vs "-$654.12"), so the Portfolio column budget in UI-13 must be measured in TRY mode, not USD.

### UX-03 — AGREE
- No visual stake; the inconsistency is real (hero persists, Portfolio does not). Agree with persisting the three controls the same way the hero does.

### UX-04 — AGREE
- Confirmed in `shots/ux/02-dash-value-ALL.png`: "$47,481.31 all time" in emerald directly under the identical headline. Visual note for the fix: if the amount is kept and rendered "neutral", it must use the default foreground, not `gainLossClass` — the same zero-is-neutral rule as UI-05 — and the tooltip's period-delta row needs the same treatment.

### UX-05 — AGREE
- Wording is the UX lens; from mine, the Value-mode chart's dashed reference line and its tooltip row (`DashboardHero.tsx:741`) must take the same "Net invested" label so legend, subtitle and tooltip agree — three surfaces, one string constant.

### UX-06 — AGREE
- Agree with one shared micro-label. Coordination with UI-10: the Asset Detail stat cards are being re-weighted there (Value / Total return promoted); the "MWR" label belongs inline after the % in `text-xs text-muted-foreground`, the way the existing "≈35.97%/yr" line already sits, so the promoted number keeps a single visual anchor and the card does not grow a third line.

### UX-07 — AGREE
- A ninth type chip fits the modal's chip row (currently 5 + 3, `shots/ux/07-add-type-Withdrawal.png`); it will wrap to 5 + 4 with no layout change. Note for UI-03 scope: the type selector is a colour-coded categorical chooser, not a mode switch, and I am explicitly excluding it from the segmented-control consolidation (see Defense) — so adding "Transfer" there does not collide with UI-03.

### UX-08 — AGREE
- No visual stake. Agree with both defaults.

### UX-09 — OVERLAPS UI-11
- Same chart, same −$20M axis. UX-09 should survive as the owner of the y-domain: floor the *displayed* series and tables at 0 and mark "depleted at age N"; flooring makes the axis domain fix in UI-11 automatic. UI-11 narrows to what UX-09 does not cover — the "Retirement age 60" / "Earliest retirement: 62" label collision (`components/retirement/PlanChart.tsx:168-190`, `insideTop` vs `insideTopRight`) and a value-carrying label on the target line. Merged text: "Floor displayed projection values at 0 with a 'depleted at age N' marker/tooltip (solvers keep unfloored maths); place the two age labels on opposite sides of their lines or stack them when within 3 years; label the target line with its value."

### UX-10 — OVERLAPS UI-08
- Identical evidence (`DashboardHero.tsx:396-407,746-755`, `useDashboardHero.ts:146-151`, `intraday.ts:39,78`). UX-10 survives as written for dates and the "Şimdi" literal → "Now" constant. UI-08 drops its date clause and keeps only the numeric part (thousands/decimal separator mix within one row; EUR symbol-after via `de-DE`), downgraded to low — see Defense.

### UX-11 — AGREE
- Code confirmed (`MonthlyBudgetTable.tsx:159-162`). Visual note: a disabled inline-edit trigger that looks identical to an enabled one (`disabled:no-underline` is the only difference, and the underline only shows on hover) gives no affordance either way; whichever surface ships, the non-editable cell should read as plain text, not as a button.

### UX-12 — OVERLAPS UI-04
- Same finding; UI-04 survives because it adds the second half of the evidence — the quantity column's hand-rolled `text-green-600` / `text-red-600` (`transactionRowModel.ts:94-98`) that drifts from the canonical `emerald-600` / `red-500` — and the sell-row "red quantity beside green realized" collision. Merged text: "Buy/Sell Volume and the quantity column render in the default foreground (sign carries direction; the Type badge already colours buy/sell); the gain/loss palette on this page is reserved for the realized P&L line, and any remaining colour goes through `gainLossClass`." UX-12's "$0.00 buy volume renders green" example is kept as evidence.

### UX-13 — AGREE
- `CampaignsPage.tsx:159-161` calls `refresh()` from the context, which the UX reviewer traced to a plain read. From the UI lens the ghost button sitting beside "Data from Aug 27, 2026" is the visual promise; removing it is cleaner than renaming.

### UX-14 — AGREE
- `button.tsx:7` confirms `disabled:pointer-events-none disabled:opacity-50` — no tooltip can fire, and the 50%-opacity primary is the same low-contrast pale green seen on Retirement "Save" and Budget "Add" (`shots/ui/06-retirement.png`, `shots/ui/14-budget-tall.png`). Agree with validate-on-submit; a visible, enabled primary also removes three instances of that washed-out state.

### UX-15 — AGREE
- Confirmed from my own control dump on the dashboard: the first header `BUTTON` has empty text and `aria: null` while its sibling carries "Switch to dark mode" (`pw/ui-pass1.mjs` output). Agree; mirror `ThemeToggle.tsx:22`.

### UX-16 — AGREE
- Agree with the doc-amend direction: the header already carries currency / theme / privacy and duplicating them on Settings would be over-generation. The one-line "Import → Bulk add" pointer is fine visually as a muted link under a small heading, not another card.

---

## Defense / withdrawals

**Downgraded — UI-08 (medium → low, narrowed).** UX-10 takes the date/locale half with identical evidence. What remains is the numeric half: in one Transactions row the quantity uses en-US grouping ("35,040.994223") and the total uses tr-TR ("₺186.657,52"), and EUR renders symbol-after ("500,00 €") while ₺ and $ are prefixed (`lib/config.ts:59-61`). I expect the UX reviewer (and the owner) to defend tr-TR for lira as the native reading; I will not press for en-US on TRY. The narrowed proposal: keep tr-TR for ₺ if that is the owner's preference, but (a) prefix the € symbol so all three currencies share symbol placement, and (b) accept that the quantity column will stay en-US — so document the rule ("currency amounts follow the currency's locale; quantities and percentages are en-US") in `lib/config.ts` so it stops reading as an accident.

**Narrowed — UI-11.** Cedes the y-axis domain to UX-09 (flooring fixes it); keeps the label collision and the target-line label. Severity stays medium because the collision alone makes the chart's answer unreadable.

**Narrowed — UI-03 (scope).** I am excluding the Add-Transaction type selector (`TransactionTypeSelector.tsx:22`) from the consolidation: it is a categorical picker whose per-type colours carry meaning and match the log's Type badges, not a view/mode switch. The finding now covers five idioms, not six, and stays high — it is still the most pervasive consistency defect. Pre-empting an "over-generation / big refactor" objection: this removes bespoke implementations in favour of the primitive Portfolio already uses; net code goes down.

**Absorbs — UI-04** takes UX-12 (see above). **UI-13** stands; the UX reviewer's "also noted" independently confirms the 1280 horizontal scroll and hands the cue to me — my proposal (column budget to ~990px, USD equivalent on a second line) is the cue-free fix, and per UX-02 it must be measured in TRY mode.

**Stand unchanged:** UI-01, UI-02, UI-05, UI-06, UI-07, UI-09, UI-10, UI-12, UI-14, UI-15, UI-16. None is contradicted by the UX positives list (snapshot-sourced totals, privacy masking, URL filters, sell/withdrawal balance hints); UI-05's zero-neutral rule in fact reinforces positive (2) — percentages stay readable under masking and should stay uncoloured at zero.

**Pre-empted objection — UI-10 vs UX-06.** UX-06 wants a label added to the Total return card; UI-10 wants the card's number enlarged. These compose (label inline after the %), but if the UX reviewer prefers a label *above* the number, the card grows to three lines and the 2×4 grid at 1440 will need `min-h` parity; I would accept that only if all eight cards get the same height.

**Withdrawn: none.** Sixteen findings remain; two narrowed, one downgraded.

## Collisions

- **(UI-08, UX-10)** — both rewrite the hero's date formatting. Resolution: UX-10 as written; UI-08 drops dates entirely (done above).
- **(UI-11, UX-09)** — both change the projection chart's y-axis. Resolution: UX-09 floors displayed values at 0 (which sets the domain); UI-11 keeps only label placement and the target label.
- **(UI-04, UX-12)** — identical change. Resolution: one merged finding under UI-04's text with UX-12's `$0.00`-in-green evidence attached.
- **(UI-10, UX-06)** — UI-10 enlarges Value / Total return; UX-06 adds an "MWR" label to the Total return %. Resolution: label inline after the %, `text-xs text-muted-foreground`, same row as the existing "≈%/yr" affix; no third line.
- **(UI-13, UX-02)** — UX-02 converts row P&L to ₺ (wider strings); UI-13 budgets columns to fit 1280. Resolution: implement UX-02 first, then size UI-13's columns against TRY-mode widths (the widest case).
- **(UI-03, UX-07)** — UX-07 adds a chip to the modal type row; UI-03 consolidates segmented controls. Resolution: type selector is out of UI-03's scope (categorical, colour-coded); no conflict remains.
- **(UI-05, UX-04)** — both touch how a non-gain figure is coloured on the hero. Resolution: one rule — zero or no-base figures render in the default foreground, never through `gainLossClass`; UX-04 applies it to the Value-mode Δ, UI-05 to zeros elsewhere.
