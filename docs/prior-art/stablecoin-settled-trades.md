# Prior art — Stablecoin-settled trades (buy crypto with USDT/USDC)

## Question

How do other portfolio trackers record a crypto trade settled in a stablecoin
(e.g. buying BTC with USDT) — one trade or two legs, linked or unlinked; is the
stablecoin treated as cash or as an asset with its own P&L; does spending it
book realized P&L; and how does the trade stay out of "net invested" / money-in
figures? Feeds the design decision on extending our fiat-only cash-leg pairing
to stablecoin funding sources without breaking the USD anchor.

**Apps researched:** Delta Investment Tracker, Ghostfolio, Kubera.
**Researched:** 2026-08-28, via `prior-art-researcher` agents (web research only).

---

## Delta Investment Tracker (delta.app, eToro)

**Model: one pair-quoted trade + one auto-generated linked disposal leg.** The
user enters a single Buy with a base and quote currency (CSV columns: `Base
amount`, `Base currency`, `Quote amount`, `Quote currency`); a per-transaction
toggle ("Deduct from … available cash" / `Sync Base Holding` in CSV) controls
whether Delta creates the counter-leg. The counter-leg is a **real, linked sell
transaction on the quote asset**, not a silent balance edit — verbatim from the
portfolio-move article: *"if you move LTC and there is a buy transaction of
LTC/ETH with 'deduct from ETH holdings' enabled then, the sell transaction
automatically created under Ethereum will also move with LTC."*

- https://support.delta.app/en/articles/8001646-import-from-the-delta-csv-template
- https://support.delta.app/en/articles/1579885-how-can-i-move-a-coin-asset-from-one-portfolio-to-another
- https://support.delta.app/en/articles/1428126-how-do-i-add-a-transaction-manually

**Stablecoins are regular crypto assets, not cash.** Delta's "Available Cash"
system is explicitly **fiat-only** (*"Available Cash is an entirely optional
system that allows you to keep track of the fiat/cash balances"*) and cash
movements *"will not affect your portfolio's P/L."* USDT is a normal tracked
coin with a live price. Since the counter-leg is a sell, spending USDT realizes
P&L on the USDT position against its cost basis (mechanism confirmed; the exact
labeling in the USDT asset view is inferred, not quoted).

- https://support.delta.app/en/articles/4682721-intro-to-available-cash

**Crypto-to-crypto is not new money in.** Deposit/Withdrawal/Transfer are
classified purely from Sent-from/Sent-to fields; a Buy is none of those.
Portfolio performance uses *"net returns … divided by your net deposits"*, so a
stablecoin-settled trade never inflates invested capital.

- https://support.delta.app/en/articles/1425665-how-can-i-record-a-deposit-or-withdrawal
- https://support.delta.app/en/articles/4590265-how-are-the-numbers-in-my-portfolio-calculated

**Conversion to fiat:** *"The price is taken directly from the exchange selected
and converted to your local fiat currency"*; BTC/ETH quotes use Delta's own
cross-exchange "global average" rate. **How a USDT quote maps to USD is never
documented** — pegged 1:1 vs. converted through a USDT/USD rate is unverified.

- https://support.delta.app/en/articles/4590298-what-do-all-the-numbers-in-the-transactions-tab-mean
- https://support.delta.app/en/articles/1433797-the-coin-price-does-not-match-that-on-the-exchange

**Failure modes documented in their own help center:** if the user forgets the
deduct toggle, the quote asset is never spent and Delta papers over exchange
mismatches with a cosmetic "Balance Adjustment" transaction that leaves cost
basis wrong; a quote-currency holding driven negative (or acquired with no cost
basis) breaks advanced-metrics calculation entirely.

- https://support.delta.app/en/articles/2138869-i-have-a-wrong-or-negative-asset-balance
- https://support.delta.app/en/articles/5013809-i-get-an-error-calculating-advanced-metrics-when-holdings-go-below-zero

**Confidence:** medium-high. The trade model, linked counter-leg, fiat-only cash
and money-in rules are quoted from Delta's help center (fetched via a reader
proxy — Delta's Intercom pages 403 direct fetches, so a few sentences are
summaries). Unverified: USDT→USD conversion, the toggle's default state, and
user complaints (Reddit and Delta's Canny board were unfetchable).

---

## Ghostfolio (open source, github.com/ghostfolio/ghostfolio)

Findings read from source on `main` (2026-08), so stated as confirmed.

**Activities are one-sided — no settlement leg exists.** An `Order` is
`{date, type, symbol, quantity, unitPrice, fee, currency?, accountId}` with no
counter-asset, no "paid with" field; the `Type` enum has no DEPOSIT / TRANSFER /
SWAP. A stablecoin-settled buy is therefore unrepresentable as one event: users
must enter a fiat-priced SELL of USDT plus a BUY of BTC, unlinked, and the USDT
sell books realized P&L against the stablecoin's own cost basis.

- https://github.com/ghostfolio/ghostfolio/blob/main/prisma/schema.prisma

**Stablecoins are hard-blocked as a pricing currency.** Activity currency is
validated as ISO 4217 (plus GBp-style derived currencies); USDT/USDC are
rejected at the DTO layer even though both exist as holdable assets in the
cryptocurrency catalog — an inconsistency users hit repeatedly (#3094, #2317,
#3344, #4336); a maintainer declined crypto-as-currency ("I don't see the worth
of doing so").

- https://raw.githubusercontent.com/ghostfolio/ghostfolio/main/libs/common/src/lib/validators/is-currency-code.ts
- https://github.com/ghostfolio/ghostfolio/discussions/4336

**Cash side is optional and fragile.** A buy decrements nothing by default; an
opt-in "Update Cash Balance" checkbox (create-only) posts a delta to a running
account balance that is **mutated, not derived** — edits/deletes don't reverse
it, past-dated activities corrupt it, and the changelog carries repeated fixes
(v3.48.1 etc.). Invested capital is Σ buy cost − Σ sell-at-average-price per
symbol, so funding source never touches it — internal trades and fresh deposits
are indistinguishable there.

- https://raw.githubusercontent.com/ghostfolio/ghostfolio/main/apps/api/src/app/activities/activities.service.ts
- https://raw.githubusercontent.com/ghostfolio/ghostfolio/main/apps/api/src/app/account/account.service.ts

**The transferable idea: store as entered, convert on read.** Since PR #4486,
`unitPrice` is stored in the currency the user paid and converted to the asset
profile currency at the **trade-date historical rate** on read; performance
converts to base currency with a per-date FX series. This replaced
convert-at-entry after "wildly inaccurate cost basis" bug reports (#2700).

- https://github.com/ghostfolio/ghostfolio/pull/4486
- https://raw.githubusercontent.com/ghostfolio/ghostfolio/main/apps/api/src/app/portfolio/calculator/portfolio-calculator.ts

**Confidence:** high (source code + changelog + linked issues). "No
maintainer-endorsed workaround for crypto-to-crypto" is inferred from absence.

---

## Kubera (kubera.com)

**Not prior art for this feature: no trade ledger exists.** Kubera is
balance-first — connected accounts and manual quantities, plus an optional
per-asset "Cash Flow" list (Cash In / Cash Out, *"No price. No quantity."*) used
only for IRR. A USDT→BTC swap just makes one balance shrink and another grow at
the next sync; neither row's basis or cash flow is touched automatically
(mechanism confirmed; the swap-specific outcome is inferred — Kubera documents
nothing for this case).

- https://help.kubera.com/article/96-transactions-for-my-investments
- https://help.kubera.com/article/79-irr-of-my-investment-in-kubera

**Stablecoins-as-cash is their stated philosophy.** Homepage/marketing:
*"Stablecoins count as cash, because they are"*; the portfolio-tracker page says
they are "properly categorized as cash equivalents." Marketing copy, not a
documented mechanism — the peg is assumed, never priced.

- https://www.kubera.com/
- https://www.kubera.com/portfolio-tracker

**Same-day offsetting flows are defined as a no-op for IRR** (their dividend
reinvestment guidance: a Cash Out and Cash In of the same amount on the same day
"cancel each other out") — the same shape as internal swaps being neutral to a
money-weighted return when both legs carry the same date and value.

- https://help.kubera.com/article/147-how-to-enter-dividend-reinvestment-in-cash-flow

**Confidence:** high on "no trade ledger" (their own help center), medium on
stablecoin classification (marketing only), low on swap outcomes (undocumented).
Reddit/forums unfetchable.

---

## Cross-app synthesis

- **The linked auto-generated counter-leg (Delta) is the only model that keeps
  both assets correct without double entry.** Ghostfolio's one-sided model —
  the alternative — is its most complained-about gap, and its mutated (not
  derived) cash balance is a recurring bug source. Our existing
  `cash_debit`/`cash_credit` pairing via `linked_tx_id` is already the Delta
  shape.
- **No app converts through a stablecoin FX rate.** Delta leaves USDT→USD
  undocumented, Ghostfolio forbids USDT pricing outright, Kubera assumes the
  peg. Nobody maintains a dated USDT/USD rate series for trade conversion.
- **Two stances on what a stablecoin is:** full asset that realizes (near-zero)
  P&L on every spend (Delta) vs. cash equivalent (Kubera's philosophy,
  Ghostfolio's users' wish). Both agree crypto-to-crypto trades are **not** new
  money in — money-in derives from deposits/withdrawals only.
- **Common failure mode:** an optional/forgettable settlement step (Delta's
  toggle, Ghostfolio's checkbox) leaves the paid-with balance unspent and cost
  basis wrong, then gets papered over with balance adjustments.

## What we decided

**Proposed 2026-08-28 (kickoff brief; not yet implemented):** treat USDT/USDC as
**cash-like settlement assets** — currency-like in the P&L engine (cost basis =
net USD deployed; value = balance × live price, so a real de-peg surfaces as FX
P&L exactly like TRY cash), eligible as a buy's funding source and a sell's
proceeds destination through the existing linked cash-leg machinery, with legs
booked at peg ($1/unit). Net invested and MWR are untouched by construction.

Explicitly rejected:
- **Delta's FIFO-disposal stance** (stablecoin spend realizes P&L): near-zero
  P&L noise at the cost of routing cash legs through the FIFO engine — undefined
  behaviour in our engine today. We are a tracker, not a tax tool.
- **Stablecoins as a `price_currency`** with dated exchange rates: no researched
  app does this; the asset-native price rule stays (crypto prices in USD).
- **General crypto-to-crypto pairs** (e.g. BTC/ETH): out of scope.
- **Balance-adjustment auto-fixes** (Delta): papering over missing legs corrupts
  cost basis.

**Shipped 2026-09-01 (v0.10.0), USDT only** — per the owner's call, USDC was
left out of the settlement set (`SETTLEMENT_STABLECOIN_TICKERS`) and the $1 peg
is assumed for leg amounts. Two divergences from the proposal, both smaller in
scope than planned: USDT stays a FIFO crypto asset rather than flipping to
currency-like (the FIFO engine gained `cash_credit` push-at-peg /
`cash_debit` consume-without-P&L cases instead — economically identical, no
UI/category side effects), and bulk import keeps fiat-only settlement (the
modal is the only entry point). Behaviour is owned by
[04 Transaction System](../components/04-transaction-system.md) and
[06 P&L Engine](../components/06-pnl-engine.md); worked numbers are
`docs/pnl-test-cases.md` Cases 24–26.
