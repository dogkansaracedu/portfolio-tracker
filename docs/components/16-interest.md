# Component 16: Interest Positions — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/16-interest.md](technical/16-interest.md)
>
> **Status: built** (v0.7.0). The contract below describes the shipped
> behavior.

## Purpose

Keep track of **what the investor has committed somewhere to earn a return**,
and warn before a term quietly ends. Crypto staking is one case; a stablecoin
flexible-earn balance, a fiat time deposit at a bank, and tokenized-gold earn
are equally in scope. The component answers two questions the rest of the app
cannot: *which of my assets are locked up earning something*, and *which of
those need a decision this week*.

It is a **notebook, not a ledger**. Nothing it stores changes a balance, a
transaction, or any profit figure.

## Depends on

- Component 2 (data store & auth) — per-user storage, isolated per account.
- Component 3 (asset catalog + platforms) — a position always points at one
  catalog asset and one of the user's own platforms.
- Component 5 (price engine) — a cached price turns "0.05 BTC at 5%" into a
  currency estimate.
- Component 15 (campaigns) — **read only**, in two directions: a campaign card
  can pre-fill a new position, and an asset with a live campaign gets a
  cross-link. This component never writes campaign data.

Surfaces it appears on: Component 7 (dashboard warnings), Component 8
(portfolio row indicator), Component 12 (the management home).

## Concepts used — links into [GLOSSARY](GLOSSARY.md)

- [Interest position](GLOSSARY.md#interest-position) — the record itself.
- [Interest status ladder](GLOSSARY.md#interest-status-ladder) — flexible /
  active / ends soon / expired.
- [Campaign](GLOSSARY.md#campaign) — the global offer a position may come from.
- [Holding](GLOSSARY.md#holding) — read-only context; never modified.

## Behaviors / rules

### What a position records

- **Asset** — one asset from the catalog (any class: crypto, stablecoin, fiat,
  gold, fund…). Not free text: a position is about something the user owns.
- **Platform** — one of the user's own platforms. Banks count: a time deposit at
  a bank is an interest position exactly like a stake on an exchange.
- **Quantity** — how much of the asset is committed, in the asset's own unit.
- **Rate** — an annual percentage with a kind (fixed / variable / "up to"),
  optional: some programs pay in points or an unquantified airdrop.
- **Program name** — the label the user recognises it by ("OKX TR fixed 105d",
  "Enpara 32-day deposit").
- **Start date** — defaults to today.
- **End date** — when the term matures. **Absent = flexible**: an open-ended
  program that never expires and never warns.
- **Origin campaign** — optional provenance when the position was captured from
  a campaign card. The link is allowed to go stale: campaign data is replaced by
  every research pass, and the user's note must outlive it.
- **Note** — free text.
- **Closed flag** — a soft archive for a matured or redeemed position. Closed
  positions leave every default list and stop warning, but are kept as history
  and can be shown again on demand. Closing is reversible: a position archived
  by mistake can be re-opened, since nothing about it was ever booked.

### Status ladder

Derived from the end date alone, recomputed on every read — never stored:

| Status | Condition |
|---|---|
| **flexible** | no end date (also the safe answer for an unreadable one) |
| **expired** | the end date is in the past |
| **ends soon** | the end date is today or within the next 7 days |
| **active** | anything further out |

The 7-day horizon is deliberately the **same** one a campaign deadline uses, so
"ends soon" means one thing across the app. Today's date is *ends soon*, not
expired. Display order everywhere: expired first, then ends-soon, then by end
date, flexible last.

### The estimate

When a position has both a rate and a known price for its asset, the app shows
what it pays: **quantity × price × rate ÷ 100** per year, and for a fixed-term
position the same figure prorated over `start → end` in days. With a missing
rate, a missing price, or a zero anywhere, **no estimate is shown at all** —
never a fabricated zero. An estimate is a display-time projection: it is never
booked, never accrued, and never enters any P&L figure.

The projection models **simple interest only** (the only mode in v1): it always
runs on the position's fixed recorded quantity — earned rewards do not grow the
earning base, and the current holding balance is never substituted for the
position's quantity. Linear proration over days is the whole model. Real
products of both kinds exist (the flexible-earn products that pay onto the
principal do compound); a per-position **compounding mode** with compound math
is a recorded extension, not built — until then a compounding position's
estimate simply understates slightly.

### Where it appears

Four surfaces, each with one job:

1. **Portfolio page — a glance.** Any asset row with at least one open position
   carries a small indicator showing the rate, with the position details (rate,
   end date, days left) available on hover. Colored by the loudest status among
   that asset's positions. The indicator is a *status* cue, never gain/loss
   coloring — an interest position is neither a gain nor a loss, and the row's
   own return figure owns that meaning. Rows without a position show nothing.
2. **Asset detail page — the home.** A full section listing that asset's open
   positions (quantity, platform, rate, start → end, status, estimate, note),
   with add / edit / close / delete, plus a toggle that reveals its closed
   history. This is also the **manual add** entry point. When the latest
   campaign research has live rows for this asset's ticker, one line says so and
   links to the campaigns page.
3. **Campaigns page — capture only.** Every campaign card has a "Track" action
   that opens the same add dialog, pre-filled from the campaign: the user's
   platform whose name resembles the campaign's, the rate and rate kind, a
   program name, and an end date derived from the lock period (start + lock
   days) or, absent one, the campaign's deadline. The user supplies the asset
   and quantity. The page **does not list positions** — capture happens here,
   management happens on the asset.
4. **Dashboard — the warnings.** See below.

### Dashboard warnings — both levels

Open positions in either loud status raise a compact banner above the fold, one
per level:

- **Expired** (loudest): "Your BTC position on OKX TR expired 3 days ago". The
  money may be sitting idle or have auto-renewed at a worse rate.
- **Ends soon**: "Your BTC position on OKX TR ends in 5 days" — decide before it
  rolls.

Each line names the asset and platform and links to that asset's page, where
the position can be edited or closed. A banner names a few positions and
summarizes the rest ("and 3 more"). The banner is dismissable **for the browser
session only**: it is a nudge, not a task list, and it must return on the next
visit if nothing was done. Closed positions never warn; flexible ones never
warn (they have no deadline to miss).

### The boundary rule (v1)

**Interest positions create no transactions and touch no holdings, balances, or
P&L.** Recording a position does not increase the holding, and the asset's
return figures are identical with and without it. Every currency figure shown
next to a position is derived at display time from the live price and the
recorded rate. This is the single invariant the component must never break.

## Out of scope (recorded extensions)

- **Auto-generating estimated reward transactions at maturity** — the obvious
  next step (turn a matured position into an `interest` transaction so the
  reward lands in P&L), deliberately **not built** in v1. It would make the
  notebook a writer to the ledger, which needs its own accuracy rules
  (estimated vs actual payout, compounding, at-source tax) before it can be
  trusted.
- Reminders outside the app (email/push).
- Auto-detecting positions from exchange APIs or statements — everything here is
  hand-entered.
- Any relationship between a position's quantity and the holding's balance: they
  are never reconciled, and the app never warns that a position exceeds a
  balance.
