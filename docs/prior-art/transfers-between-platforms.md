# Prior art — Transfers between platforms

## Question

How do other portfolio trackers store, display, and edit the movement of an
asset from one platform to another — one record or two, linked or unlinked, and
how do they keep the move out of return math and preserve cost basis?

**Apps researched:** Delta Investment Tracker, Ghostfolio, Kubera (primary);
Sharesight, Empower / Personal Capital (fallback).
**Researched:** 2026-08-28, via `prior-art-researcher` agents (web research only).

---

## Delta Investment Tracker (delta.app, eToro)

**Storage.** One single `TRANSFER` record carrying "Sent/Received from" and
"Sent to" fields. The type shown to the user (Deposit / Withdrawal / Transfer) is
**derived from the endpoints**, not stored: both endpoints yours = Transfer, and
only the fee is deducted. The CSV template mirrors this — one row, with columns
`Sent/Received from` and `Sent to`.

- https://support.delta.app/en/articles/8001646-import-from-the-delta-csv-template
- https://support.delta.app/en/articles/1425665-how-can-i-record-a-deposit-or-withdrawal

**No pairing, no auto-matching.** A one-sided API import (exchange reports only
its own leg) is repaired by the user re-typing the row's source/destination field
— changing "Other/Unknown" to a named exchange converts the row into a proper
Transfer. There is no matching heuristic and no link column, because there is
never a second row to match.

- https://support.delta.app/en/articles/1426036-how-do-i-record-a-transfer-between-crypto-exchanges-or-wallets

**P&L treatment.** Transfers are documented as zero P&L impact with cost basis
preserved. A network fee paid in the same asset is treated as a **partial sell**:
it reduces cost basis and books realized P&L. (Same URL as above.)

**Limits.** The transfer type is **crypto-only** — no equivalent pattern for
stocks. Endpoints are a fixed enum of venues, not the user's own account list, so
two accounts on the same venue ("OKX B → OKX D") have no natural representation.

**Not found:** how the combined row renders in the transaction list, and the
edit/delete cascade semantics — not publicly documented.

**Confidence:** medium-high on the storage model, matching behaviour, and P&L
treatment (official help center, retrieved through a text proxy —
support.delta.app returns 403 to direct fetches). Low on list rendering.

---

## Ghostfolio (open source, ghostfol.io)

**No transfer concept for securities.** The activity enum in
`prisma/schema.prisma` on main is BUY, DIVIDEND, FEE, INTEREST, LIABILITY, SELL.
The maintainer explicitly declined a `TRANSFER` type on 2023-09-15 as unjustified
complexity. The sanctioned workaround is export JSON → edit `accountId` →
reimport: it preserves cost basis but erases the transfer event entirely. Still
being requested through 2026-03.

- https://github.com/ghostfolio/ghostfolio/discussions/1899

**Cash-only transfer is two orphan snapshots.** "Transfer Cash Balance"
(`POST /api/v1/account/transfer-balance`, PRs #2433 / #2455) writes two unrelated
`AccountBalance` rows — no transfer entity, no link column, no date field (always
`now()`), and it never appears in the activities list. Deleting one side leaves
the other inflated.

**Sell + buy as a workaround** loses book cost and books fictitious realized
gains (discussion #1899, issue #3455).

**Confidence:** high — read the actual main-branch schema and controller source.

---

## Kubera (kubera.com)

**No transaction ledger at all.** Kubera stores balances plus per-asset Cash In /
Cash Out rows that feed IRR. The bulk CSV schema is
`clientNameOrEmail,assetName,date,currency,cashIn,cashOut,note,portfolioName` —
**no type column**, so an internal transfer is structurally indistinguishable
from new money entering the portfolio.

- https://help.kubera.com/article/96-transactions-for-my-investments
- https://help.kubera.com/article/115-bulk-import-cash-flow-for-private-assets
- https://help.kubera.com/article/79-irr-of-my-investment-in-kubera

**Not found:** any transfer UI, any cost-basis carry mechanism. Also shows ROI
instead of IRR for holdings under one year (help/155).

**Confidence:** high that these are genuinely absent / undocumented.

---

## Sharesight (fallback)

**Two unlinked rows, with the user as the integrity constraint.** The source
portfolio gets a "Transfer out" (rollover-style, no capital gain); the
destination gets an "Opening balance" whose Trade cost base the user **hand-copies**
from the source portfolio's summary screen. Nothing references the other row,
nothing detects a mismatch, nothing propagates edits. Real continuity requires
emailing support to move the holding.

- https://help.sharesight.com/how-to-record-share-transfer-between-portfolios/
- https://help.sharesight.com/how-to-record-share-buybacks-share-transfers-and-broker-transfers-in/

**Broker-to-broker within the same tax entity:** "do nothing" — holdings are not
venue-scoped in Sharesight's model.

**Cash accounts have no Transfer type** — a Deposit and a Withdrawal are recorded
separately.

- https://help.sharesight.com/adding-a-transaction-to-a-cash-account/

**Confidence:** high (official help articles).

---

## Empower / Personal Capital (fallback)

Real transaction ledger, two rows per transfer, **no pairing table**. Rows
categorized as transfers are excluded from the Cash Flow tool **by type alone**,
so the money isn't double-counted — this covers credit-card payments, brokerage
moves, and IRA rollovers alike.

- https://support-personalwealth.empower.com/hc/en-us/articles/201170070
- https://support-personalwealth.empower.com/hc/en-us/articles/201169700
- https://support-personalwealth.empower.com/hc/en-us/articles/201169690

**Not found:** cost-basis carry across transfers.

**Confidence:** medium — direct fetches return 403; quotes taken from
search-indexed content.

---

## Cross-app synthesis

- **Nobody renders a linked one-row transfer from two stored rows.** Delta is the
  only app with a true single-event transfer, and there it is the storage shape,
  not a display trick over a pair.
- **Two failure modes worth avoiding.** The *user as integrity constraint*
  (Sharesight: cost basis re-typed by hand, no link, silent divergence), and
  *untyped flows corrupting money-weighted returns* (Kubera: an internal move is
  indistinguishable from new money, so IRR is wrong).
- **Type-driven exclusion from flow math** (Empower) is the one widely used
  mechanism that works, and it matches how our engine already treats transfers.
- **Same-asset network fees** are the subtle case: Delta is the only researched
  app that documents them, and it books them as a partial sell against cost basis.

---

## What we decided

**Decided 2026-08-28.** Two stored rows — a `transfer_out` and a `transfer_in` —
paired through `linked_tx_id`, rendered in the transactions list as **one combined
neutral "source → destination" row**, with edit and delete acting in lockstep
from the source side.

Specs that own this behaviour:
[04 Transaction System](../components/04-transaction-system.md) (storage, pairing,
edit/delete cascade) and
[09 Transactions Page](../components/09-transactions-page.md) (combined row
rendering).

**Rejected:**

- **Delta's single-record storage.** It is the cleanest model, but the P&L engine
  consumes per-platform legs; collapsing a transfer into one record would rewrite
  the engine's input shape for one transaction type.
- **Auto-matching heuristics at import time.** Delta avoids matching by never
  creating two rows; Sharesight shows what unmatched pairs cost. We create the
  pair explicitly at write time instead of guessing at it later.
</content>
</invoke>
