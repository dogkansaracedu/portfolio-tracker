# Component 18: Foreign-Income Reconciliation — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation →
> [technical/18-foreign-income-reconciliation.md](technical/18-foreign-income-reconciliation.md)
>
> **Status: built.**

## Purpose

Let the owner compare the app's foreign dividend and interest total with an
external statement or tax worksheet without changing the portfolio ledger.
The component is an audit aid, not tax advice and not a tax filing surface.

## Depends on

- Component 2 (data store & auth) for private, per-user comparison history.
- Component 3 (assets and platforms) for payer/source labels.
- Component 4 (transactions) for the authoritative payment trail.
- Component 5 (exchange rates) for payment-date TRY conversion.
- Component 7 (dashboard) for the current-year heads-up and entry point.

## Rules

1. The app total is always re-derived from dividend and interest transactions
   for the selected calendar year. Only foreign/non-TRY assets with no recorded
   at-source tax are included.
2. The user can select the current year, previous year, or any year represented
   by eligible payments. The URL carries `?year=` so the view is shareable.
3. Legal thresholds are year-specific. Known values are shown; an unknown year
   says "Threshold not configured" rather than reusing an earlier amount.
4. A comparison stores the external TRY total, current app total, a deterministic
   fingerprint of every contributing transaction and FX result, an optional
   note, and a server timestamp.
5. Comparisons are append-only. A second save creates history; it never replaces
   an earlier check.
6. A saved check is **Matched** when the external and current app totals agree
   within one kuruş and the input fingerprint is unchanged; **Difference found**
   when the totals differ; **Review again** whenever the input set changes,
   including a same-total edit; and **Not checked** when there is no history.
7. Income paid into a cash asset names the payer from `related_asset_id` while
   retaining the received asset for its original amount and transaction filter.
8. If transactions, rates, assets, platforms, or saved comparisons fail to
   load, the page shows an error and disables the comparison workflow. An
   unverified empty data set must never look like a valid zero total.

## UI contract

- Summary cards: app total, latest comparison status, current difference.
- Source breakdown: payment count and TRY total per platform.
- Comparison form: statement/worksheet total, live signed difference, optional
  note, and explicit copy that saving does not change transactions or balances.
- Included payments: date, payer, platform, type, original amount, payment-date
  TRY equivalent, and a narrowly filtered transaction link. Cards are used
  below the desktop breakpoint; the table is desktop-only.
- History: all checks in reverse chronological order, with app total, statement
  total, difference, note, and latest marker.
- The dashboard uses cautious copy ("Threshold crossed — review filing
  requirement"), never an unconditional filing conclusion.

## Acceptance criteria

- Switching 2026 → 2025 updates both payments and threshold (22,000 → 18,000).
- Saving exact and non-exact totals produces Matched and Difference states.
- Two saves produce two rows; neither row is updated or deleted by the client.
- Editing any contributing input makes the latest check stale, even if the
  aggregate TRY total is unchanged.
- Failed source loads block saving and expose a Retry action.
- The 390 px layout has no horizontal overflow and keeps controls at accessible
  touch sizes.

## Boundary rule

This component never creates, updates, or deletes a transaction, holding,
balance, exchange rate, or P&L value. It writes comparison history only.
