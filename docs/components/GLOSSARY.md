# Glossary & Domain Model

The shared vocabulary for the component specs. Entities, terms, and formulas are
defined **here, once**; component behavioral specs link to these anchors and never
redefine them. Conceptual only — field names appear, but storage types and stack
choices live in the per-component technical docs. For the P&L rationale in depth,
this glossary links to [P&L Methodology](../pnl-methodology.md) rather than
restating it.

## Entities

The nouns of the system. Fields are named conceptually; relationships are listed
at the end.

### Platform
Where assets are held — a broker, exchange, bank, or "physical" bucket (e.g. cash,
vehicle). Fields: `name`, `color` (a display color used across charts and dots).
Platforms are per-user.

### Asset
A tradable or held thing, **global: one row per ticker, shared by every user and
curated by the [Admin](#admin)** (no platform on the asset itself — balances live on
[Holdings](#holding)). Non-admin users read the catalog read-only. Fields: `ticker`
(display symbol), `name`, `category` (free-form text — `fiat`, `crypto`, `gold`,
`stock_us`, `stock_bist`, `vehicle`, …), `tags[]` (cross-cutting allocation labels,
e.g. `["crypto","usd"]`), `price_source` (which feed prices it — `yahoo` for
equities, crypto and tokenized gold, `tcmb` for fiat FX and gram gold, `tefas`
for Turkish funds, `manual` for hand-entered prices), `price_id` (the identifier that feed uses, e.g. `BTC-USD`,
`THYAO.IS`; falls back to `ticker` when absent), `icon_url` (optional
logo override), `is_currency` (true for fiat/cash — these carry
[Fiat FX P&L](#fiat-fx-pl), not FIFO P&L), `is_active`.

### Holding
The balance of one [Asset](#asset) on one [Platform](#platform), in the asset's
**native units** (₺, shares, coins, grams). Fields: `asset_id`, `platform_id`,
`balance`. A balance is the running result of that holding's
[Transactions](#transaction), never entered directly.

### Transaction
A dated event affecting a holding. `type` is one of: **buy, sell, transfer_in,
transfer_out, dividend, interest, fee, cash_credit, cash_debit**. Fields: `amount`
(quantity in native units), `unit_price`, `price_currency` (**derived from the
asset — asset-native; defaulted and editable, never a free picker**), `total_cost`,
`fee`/`fee_currency`, `date`, `related_asset_id`, `linked_tx_id`, `notes`.
- **Balance effect:** buy / transfer_in / dividend / interest / cash_credit *add*
  to the holding; sell / transfer_out / fee / cash_debit *subtract*.
- **Display labels:** `transfer_in` shows as **Deposit** and `transfer_out` as
  **Withdrawal** — value crossing the tracked-portfolio (or, under a platform
  filter, that platform's) boundary. A linked pair rendered as one combined row
  shows as **Transfer** — an internal platform-to-platform move.
- **Linked legs:** `linked_tx_id` pairs a trade with its cash movement (only `buy`
  and `sell` carry a linked cash child) and pairs the two sides of a transfer. The
  cash legs (`cash_credit`/`cash_debit`) are created automatically, not user-picked.

### Snapshot
A frozen point-in-time aggregation of the whole portfolio — **the authoritative
source for every dashboard/portfolio number; the UI reads snapshots rather than
re-deriving from holdings × prices.** Fields: `snapshot_date`, `total_usd`,
`total_try`, and `breakdown`:
- `rates` — the FX used (`usd_try`, `eur_try`, `gold_gram_try`).
- `by_category`, `by_platform`, `by_tag` — `{ usd, try, pct }` per group
  (`by_platform` also carries `color`).
- `by_asset[]` — per ticker **and** per ticker×platform: `{ ticker, name, platform,
  amount, price_usd, value_usd, value_try }`. The frozen `value_usd` is "that day's
  close value"; `price_usd` is the per-unit price used by the
  [snapshot-price / live-quantity rule](#snapshot-price-and-live-quantity).

There are two snapshot stores. The **daily snapshot** (one per calendar day,
full breakdown) is the authoritative record of a day's value. **Intraday
snapshots** are a transient, totals-only rolling 24-hour window (one per hour,
pruned after a day) used only to draw the 1-day intraday view; they never serve
as authoritative history.

### Price
The current/cached unit price of an asset, in USD and TRY, with its `source` and
`updated_at`. Distinct from the asset's *native* price currency. See
[Staleness](#staleness).

### Exchange rate
Historical FX **by date**: `usd_try`, `eur_try`, `eur_usd`, `gold_gram_try`. USD is
the [anchor](#usd-anchor); a transaction's native price is converted to USD using
the rate on (or just before) its date.

### Relationships
- An **Asset** has many **Holdings** (one per platform it sits on) and many
  **Transactions**.
- A **Holding**'s `balance` is the sum of its Transactions' balance effects.
- A **Transaction** may link to another (cash leg of a trade; the two legs of a
  transfer) via `linked_tx_id`.
- A **Snapshot** embeds the full breakdown for a date; **Exchange rates** anchor
  every USD conversion.

## Terms

### USD anchor
All P&L is measured in **USD**, regardless of an asset's native currency. A holding
is tracked in its native units, but its gain/loss is always the change in USD value.

### Net invested capital
The **net USD actually deployed** into a position or the portfolio. Deposits and the
cash legs of trades net out — a sell and its paired `cash_credit` cancel — so this
reflects capital at work, not cash sloshing in and out. Total P&L $ is `value − net
invested`; the headline **%** is the lifetime cumulative
[money-weighted return](#money-weighted-return-mwr--xirr), never a ratio over this
balance (which shrinks on withdrawal and would distort the %). The former
"peak net invested" denominator convention was removed 2026-08-28 — no peak
calculations exist in the app.

### Money-weighted
Comparing value today against **dollars actually deployed** (not a time-weighted
index return). The app's canonical total is money-weighted. See
[P&L Methodology](../pnl-methodology.md).

### Time-Weighted Return (TWR)
A return that measures **only the performance of the holdings**, with the timing
and size of your own deposits/withdrawals stripped out — so it answers "did my
picks beat the index?" without giving credit (or blame) for when cash went in or
out. It is built by computing each period's return, **removing the external cash
flow that landed in that period**, and then **geometrically chaining** the
periods together (`(1 + r₁) × (1 + r₂) × … − 1`). Within a single period the
return is **value-weighted automatically** — it is read off the whole-portfolio
total, so a big holding moves it more than a small one. The series is **rebased
to 0% at the window's start** so the portfolio and the index begin from the same
line. This is the basis **indices quote their returns on** ("the S&P is +25%"),
which is why it is the fair head-to-head against a benchmark. Contrast with
[money-weighted](#money-weighted) [Total P&L](#total-pl) (credits *your* cash-flow
timing) and Simple ROI (gain ÷ money in, ignoring time). Each period's own return
is the [money-weighted](#money-weighted-return-mwr--xirr) one — chaining them is
precisely what cancels the flows out — so the two measures share one underlying
calculation and differ only in how it is applied. It is most accurate when each
period is one day; over longer (e.g. weekly) periods that contain a flow it is an
approximation, because there is no valuation on the day the money landed. See the
[formula](#time-weighted-return-formula).

### Money-Weighted Return (MWR / XIRR)
The **investor's own** return: the single compound rate that reconciles every
external cash flow (each at its real date) with the portfolio's ending value —
so each dollar is weighted by **how much and how long** it was actually at work.
Deposit timing matters by design: putting big money in just before a good run
raises it; missing that run with most of your capital lowers it. XIRR is the
real-dated computation of this rate (Excel's name for it, industry-standard), and
it is the **only** money-weighted formula the app uses — the same solve produces
the per-period returns that [TWR](#time-weighted-return-formula) chains. Over a
**window**, the window's starting value counts as an
opening inflow and the ending value as the terminal amount, and the result is
shown **cumulative for that window** (rebased to 0% at the window start); over
the whole history it is shown **annualized** ("%/yr"), only once the history
spans at least a year (shorter spans annualize into noise). Unlike
[TWR](#time-weighted-return-twr) it needs no intermediate valuations — only
endpoint values and dated flows — so a windowed MWR is exact even over
weekly-sampled history. Contrast: TWR answers "how good is the strategy, per
dollar"; MWR answers "what did *my* dollars earn" — and its lifetime cumulative
form is the app's [Total P&L %](#total-pl-1).
See the [formula](#money-weighted-return-xirr-formula).

### What-if index (same-flows benchmark)
The value the user's money would have had if **every external cash flow had gone
into the benchmark index instead** — each inflow buys index exposure at that
date's level, each outflow sells the equivalent amount. Its
[money-weighted return](#money-weighted-return-mwr--xirr) is the fair benchmark
for the portfolio's MWR: both sides then share the same flows and the same
timing, so the comparison isolates *what you bought* ("would I have more if I'd
just bought the index with the same money on the same days?"). Comparing a
portfolio MWR against the index's plain (time-weighted) return would mix
frames — the index number would carry no deposit-timing effect while the
portfolio number does. Flows dated before the index has any usable level
participate at its first available level.

### FIFO lots and cost basis
Buys stack as **lots**; a sell consumes the **oldest lots first** (FIFO) and books
realized P&L per consumed lot. **Cost basis** = the USD cost of the remaining lots.
Transfers move cost basis across platforms without booking P&L.

### Realized and unrealized
**Realized** = P&L locked in by sells (FIFO). **Unrealized** = current value −
cost basis of holdings still held. Both are **sub-views** of the money-weighted
total (`unrealized = total − realized`).

### Fiat FX P&L
Fiat / cash holdings (`is_currency = true`) are **not zero-P&L**: their cost basis
is the net USD deployed into that currency, so `value − cost basis` is the real
FX gain/loss vs. the [USD anchor](#usd-anchor). Surfaced as unrealized P&L.

### At-source tax
A withholding taken automatically on an asset's gains (e.g. a Turkish PPF, 17.5%);
modeled per-asset as `at_source_tax_rate`. Drives the [tax accrual](#after-tax-pl)
that produces [after-tax P&L](#after-tax-pl).

### After-tax P&L
Gross P&L minus the at-source **tax accrual** (rate × the positive native gain on
the held position — its unrealized gain plus the realized gains booked on it). An
**additive overlay**: it leaves the gross decomposition and its invariant
(`unrealized + realized + income`) intact — after-tax Total P&L = gross − total
tax accrual.

### Foreign-declarable income
Dividend / interest from a non-TRY asset with no [at-source tax](#at-source-tax);
the income that counts toward the Turkish 22,000 TL declaration threshold. A
reporting figure, not part of the money-weighted total.

### Daily return
The money-weighted change **since the most recent [snapshot](#snapshot) before today**
(the portfolio's home-local day): `value_now − prev_snapshot_value − period_invested`.
Subtracting capital deployed during the period removes principal, leaving only
price/FX movement. See the [formula](#daily-return-formula).

### Allocation
An asset's (or group's) **current value ÷ total portfolio value**, as a percent.

### Admin
The single account that curates the global [Asset](#asset) catalog. Only the
admin can create / edit / deactivate assets; everyone else reads the catalog
read-only. Enforced in the database (the asset write RLS policies check a
hardcoded user id) and mirrored in the UI. Platforms are unaffected — they stay
per-user.

### Snapshot price and live quantity
Displayed value = **live [Holding](#holding) balance × the latest snapshot's
per-unit `price_usd`**. Quantities reflect fresh transactions immediately; prices
stay consistent with the dashboard's snapshot-sourced totals. The most recent
snapshot **before today** (home-local day) supplies the frozen `value_usd` (not
price × live balance) used as the baseline for [daily return](#daily-return).

### Staleness
How old a [Price](#price) is (`updated_at`). Surfaced as an indicator so the user
knows when a value is not fresh.

### Contribution plan
The saved intent to invest: a starting amount, a monthly contribution, an annual
contribution growth %, and the ages that frame it (current age →
[contribution end age](#contribution-end-age) → retirement age). The shared
input of every retirement calculation.

### Contribution end age
The age monthly contributions **stop**. Between it and the retirement age the
plan **coasts**: growth alone, no contributions and no withdrawals. Defaults to
the retirement age (contribute right up to retirement) and is always between the
current age and the retirement age.

Distinct from the **coast date** of the [Coast FIRE gap](#coast-fire-gap): the
coast date is *derived* — the first month the portfolio is big enough that
growth alone would reach the target — while the contribution end age is an
*input*, the month the user decides to stop paying in whether or not the plan is
there yet.

### Projection
A deterministic month-by-month compound-growth forecast of a
[contribution plan](#contribution-plan) at a stated [expected
return](#expected-return). Forward-looking and assumption-driven — always
presented as a projection under stated assumptions, never a prediction. Every
retirement figure (comparisons, [Coast FIRE](#coast-fire-number), [sensitivity
insights](#sensitivity-insight)) is derived from this **one** projection core, so
no two numbers on a retirement view can disagree. See the
[formula](#projection-formula).

### Retirement scenario
A named, saved set of retirement inputs: the [contribution
plan](#contribution-plan) (including its [contribution end
age](#contribution-end-age)), retirement spending (today's USD per month),
[SWR](#safe-withdrawal-rate-swr), [withdrawal strategy](#withdrawal-strategy),
depletion age (the age the portfolio is spent to zero by when depleting; the
after-retirement chart horizon when preserving), and the **assumption set** — the **primary
expected return** (the user's own growth assumption, driving the Plan and
Coast FIRE views), per-option [expected returns](#expected-return) (driving
Compare), USD inflation, TRY inflation, and TRY depreciation. Each expected
return is a triple (**pessimistic / base / optimistic**), so every projection
renders as a band, not a single line.
Scenarios persist per user; one is the default. Inputs added after a scenario was
saved are filled in on read with the behaviour that scenario was saved under (a
missing contribution end age becomes the retirement age).

### Expected return
An assumed annual compound growth rate, always quoted **per year**; monthly
compounding uses `(1+r)^(1/12) − 1`, never `r ÷ 12`. Entered in the option's
natural currency: USD options directly; a TRY-linked option (BES, TRY deposit)
takes a TRY nominal return that converts to its USD growth rate through the
scenario's TRY-depreciation assumption: `(1 + r_TRY) ÷ (1 + dep) − 1`. The
[USD anchor](#usd-anchor) applies to retirement planning exactly as to P&L.

### Nominal and real
**Nominal** = amounts as they will read at that future date. **Real** = deflated
to today's purchasing power by the scenario's USD-inflation assumption:
`real = nominal ÷ (1+i)^years`. One global toggle per retirement view, default
nominal; real views are labeled "today's purchasing power".

### Safe withdrawal rate (SWR)
The percentage of the retirement-date portfolio withdrawn in the first year of
retirement (inflation-adjusted thereafter) under
[capital preservation](#withdrawal-strategy). Default 4%.

### Withdrawal strategy
How the portfolio is consumed after retirement — exactly one of two:
- **Capital preservation** — withdraw at the [SWR](#safe-withdrawal-rate-swr);
  the principal is intended to survive indefinitely.
- **Capital depletion** — the portfolio is deliberately spent to zero by a
  chosen **depletion age** (e.g. retire at 55, deplete by 80). Produces a
  smaller [retirement target](#retirement-target) than preservation.

### Retirement target
The portfolio value required **at retirement age**, in nominal USD of that
date (spending entered in today's USD is inflated to retirement first). Per
[strategy](#withdrawal-strategy): preservation = inflated annual spending ÷
SWR; depletion = present value at retirement of the inflation-growing spending
stream until the depletion age. See the [formula](#retirement-target-formula).

### Coast FIRE number
The portfolio value needed **today** such that expected growth alone — with no
further contributions — reaches the [retirement target](#retirement-target) by
retirement age: `target ÷ (1+r)^years`. It **rises** toward the target as
retirement approaches (less time left to compound). This is the app's single
term for the concept — never "coast number", "coasting money", or variants.
See the [formula](#coast-fire-number-formula).

### Coast FIRE gap
`Coast FIRE number − current portfolio value`. Positive = still short; zero or
negative = **coasting** (growth alone is expected to carry you to the target).
The **coast date** is the first month the projected portfolio (with planned
contributions) meets the then-current Coast FIRE number; "years to Coast FIRE"
is the distance to that date.

### Earliest retirement age
The smallest age at which a [contribution plan](#contribution-plan)'s
[projection](#projection) reaches the [retirement target](#retirement-target)
**of that age** — the target is re-derived per candidate age, because retiring
later inflates the spending it funds and, under [capital
depletion](#withdrawal-strategy), shortens the drawdown it buys. A candidate's
[contribution end age](#contribution-end-age) is the earlier of the saved one
and the candidate itself. Null (never "reachable at 115") when no age reaches
it.

### Supported spending
The monthly retirement spending, in **today's** USD, that a given portfolio
value at retirement can fund under the scenario's [withdrawal
strategy](#withdrawal-strategy) — the [retirement target
formula](#retirement-target-formula) read backwards, and the third of the three
ways out of a plan that falls short (retire later, contribute more, spend less).

### Sensitivity insight
An automatically generated statement quantifying how one input change moves one
output — "at $1,500/month instead of $1,000 you reach your target 5 years
2 months earlier". Each insight is a solver run over the same
[projection](#projection) core, so insights can never disagree with the charts.

### Retirement tax estimate
The estimated Turkish tax due at exit for a comparison option, computed by that
option's **tax rule** from the scenario's assumptions (a TRY-taxed option's
taxable gain depends on the TRY-inflation and TRY-depreciation assumptions, so
tax is computed, not a flat percentage). Always labeled an **estimate under
current law** — never presented as a fact about the future. Rates, thresholds,
and brackets live in one sourced reference
([retirement-tax-rules](../retirement-tax-rules.md)) with legal citations;
they are data, not code.

### Cash-flow entry
A budgeting row recording money earned outside the portfolio — today always an
**income** event (a salary payment, a bonus); an **expense** kind is reserved
for a future expense ledger. Entirely separate from
[transactions](#transaction): a cash-flow entry never touches holdings,
balances, or P&L.

### Invested (monthly)
A calendar month's **net new external money into tracked platforms** — the
month's change in [net invested capital](#net-invested-capital). Internal
shuffles (a buy and its cash leg, platform-to-platform transfers) cancel; cash
deposited but not yet deployed still counts (saved, not spent). Negative on a
net-withdrawal month.

### Spent (residual)
`income − invested (monthly)` — spending is **derived, never recorded**. The
residual absorbs every data gap: money kept outside tracked platforms reads as
spent. Unknown when the month's income is unknown (shown as "—", never zero).

### Savings rate
`invested (monthly) ÷ income`, per month. Undefined when income is unknown or
not positive; negative on a net-withdrawal month.

### Salary schedule
The list of default monthly incomes with **effective-from months**: a month
with no explicit [cash-flow entry](#cash-flow-entry) falls back to the row
with the latest effective-from at or before it. Raises are appended, never
edited into history.

### Campaign
One earn/reward opportunity on one platform: an asset ticker, a program type
(flexible earn / locked earn / staking / launchpool / hold-to-earn / promo /
airdrop), a reward (a rate with a fixed / variable / "up to" kind, and/or a
prose reward description), terms (lock days, min/max amount, conditions,
deadline), and provenance (source URL + found-on date). Campaign data is
**global and shared** (like the [asset](#asset) catalog) and is a *claim found
on the public web*, not a guarantee — the app always shows its source and age.

### Research run
One automated pass that produced a batch of [campaigns](#campaign): when it
ran, what produced it, whether it succeeded, and a prose summary of what
changed since the previous run. The app always displays the **latest
successful** run's campaigns; older runs are history, never edited, and a
failed run leaves the previous run's data in place.

### Interest position
A **personal** record that the investor has committed some quantity of one
[asset](#asset) on one [platform](#platform) to earn a return: crypto staking, a
stablecoin flexible-earn balance, a fiat time deposit at a bank, tokenized gold
earn. It records what was committed (asset, platform, quantity), what it pays (a
rate with a fixed / variable / "up to" kind, optional), the program's name, when
it started and when it ends (**no end date = flexible**), an optional link to the
[campaign](#campaign) it was tracked from, and a free note. It can be **closed**
(soft-archived once redeemed) — closed positions are history: never listed by
default, never warned about.

An interest position is **informational only**. It creates no
[transaction](#transaction), changes no [holding](#holding) or balance, and is
absent from every [P&L](#total-pl) figure — the asset is already counted by the
holding it sits in. Any return figure shown next to one is a *display-time
estimate*, never a booked amount. Distinguish from a [campaign](#campaign): a
campaign is a global claim about an offer that exists; a position is the user's
private note that they took it.

### Interest status ladder
The four states an [interest position](#interest-position) can be in, derived
from its end date alone and never stored: **flexible** (no end date), **active**
(ends further out than the warning horizon), **ends soon** (ends within the same
7-day horizon a campaign [deadline](#campaign) uses — today and the boundary day
both count), and **expired** (the end date has passed). "Ends soon" and
"expired" are the two states that warn on the dashboard.

## Canonical formulas

State-only here; the rationale lives in [P&L Methodology](../pnl-methodology.md).

### Total P&L
```
Total P&L (USD) = current value − net invested capital
```
Money-weighted, USD-anchored. `realized` and `unrealized` are sub-views; fiat
carries its FX gain as unrealized.
→ [P&L Methodology](../pnl-methodology.md).

### Total P&L %
The lifetime **cumulative [money-weighted return](#money-weighted-return-xirr-formula)**:
solve the XIRR of every external flow (at its real date, opening value 0)
against the live value today, then de-annualize over the book's own span —
`(1+r)^years − 1`. The same lens as the per-asset return %. Shown on the
Portfolio summary bar (labelled MWR) and the Performance page's All-Time
Return; the dashboard hero shows the Total P&L dollar alone. "—"/absent when
the solver has no answer. (The former peak-net-invested ratio was removed
2026-08-28 along with all peak calculations; a current-net-invested ratio is
equally banned — it shrinks on withdrawal and explodes near zero.)

### Daily return formula
```
dailyReturnUsd = value_now − prev_snapshot_value − period_invested
denom          = prev_snapshot_value + period_invested
dailyReturnPct = denom <= 0 ? null : dailyReturnUsd / denom × 100
```
`period_invested` = net USD deployed into the position since the baseline snapshot
(the most recent before today, home-local day), bucketed by home-local calendar day.
Equals Δ(value − invested) over the period — the [Total P&L](#total-pl) applied across
it, so fiat FX is included automatically.

### Time-Weighted Return formula
For each period *i* between two consecutive snapshots, take its **money-weighted
return, solved as an [XIRR](#money-weighted-return-xirr-formula) over that period
alone**. The opening value `V_start` enters as an inflow dated at the period
start, each external cash flow enters at its own date, and `V_end` is the
terminal amount:
```
V_start · (1+r_i)^(T) + Σ C_j · (1+r_i)^(T − t_j) = V_end
```
where `t_j` is when each flow landed and `T` the period length, both in years.
The solver returns an annual rate, which is de-annualized back over the period to
the fraction actually earned:
```
r_i = (1 + rate)^T − 1
```
Then **geometrically chain** the periods and rebase to 0% at the window start:
```
cumulativeTWR(n) = [ Π (1 + r_i)  for i = 1..n ] − 1
```
Chaining is what makes the result time-weighted: each period's own deposits are
neutralized inside its solve, so the size and timing of cash flows cannot reach
the product. Value-weighting across holdings is automatic — `V_start`/`V_end` are
the **whole-portfolio totals**. A period the solver cannot resolve (no capital at
work, or a move beyond the solver's bracket) contributes a neutral factor
(skipped).

A window is flagged **approximate** when any period that contained a flow spanned
more than one day (weekly-sampled history). This is a **data** caveat, not a
formula one — the period's XIRR is exact for the flows it is given, but without a
valuation on the flow's own date we cannot see what the portfolio was worth when
the money landed, so the period's return absorbs some of that flow's own timing.
See [Time-Weighted Return](#time-weighted-return-twr).

> Historical note: this per-period return was computed with the **Modified Dietz**
> formula (a linear time weight on each flow, `w_j = (T − t_j) / T`) until it was
> retired in favour of the XIRR solver, so that the app has exactly one
> money-weighted mathematical core. The two agree whenever a period is flow-free
> or its gain is exactly zero, and diverge as flow size, flow timing and the
> period's return grow.

### Money-Weighted Return (XIRR) formula
The annual rate `r` that discounts every dated external cash flow and the
terminal value to zero:
```
V_start · (1+r)^(Y) + Σ C_i · (1+r)^(Y − y_i) = V_end        (windowed)
Σ C_i · (1+r)^(Y − y_i) = V_end                              (lifetime: V_start = 0)
```
where `C_i` is each external flow (positive = into the portfolio), `y_i` its
time in years from the window start, and `Y` the window's span in years.
Windowed display is **cumulative**: `(1+r)^Y − 1`, rebased to 0% at the window
start. Lifetime display is the annualized `r` itself, shown only when the
history spans ≥ 1 year. Solved numerically on a bracketed interval; **no
solution / degenerate inputs render as "—"** (never a fabricated number). Flows
use the same external-flow definition as TWR — internal asset↔cash swaps are
not flows.

This is the app's **single money-weighted core**: the same solve, over a single
snapshot-to-snapshot period, produces each `r_i` that the
[TWR formula](#time-weighted-return-formula) chains. The bracket is stated as a
range of terminal multiples over the solve's own span rather than a range of
annual rates, so one bracket serves a one-day period and a multi-year window
alike — a −10% day annualizes to roughly −100%/yr and would fall outside any
fixed annual-rate bracket. See [MWR / XIRR](#money-weighted-return-mwr--xirr).

### Projection formula
Monthly recurrence at annual [expected return](#expected-return) `r`, over three
phases in order — **contributing**, **coasting**, **retirement**:
```
r_m       = (1 + r)^(1/12) − 1
V_(t+1)   = V_t × (1 + r_m) + c_t        (contributing months:
                                          now → contribution end age)
V_(t+1)   = V_t × (1 + r_m)              (coasting months:
                                          contribution end age → retirement age)
V_(t+1)   = V_t × (1 + r_m) − w_t        (retirement months:
                                          retirement age → depletion age)
```
`c_t` = monthly contribution, stepped up once a year by the contribution
growth %, and zero from the [contribution end age](#contribution-end-age) on —
the coasting phase is the same recurrence with `c_t = 0`, not a second formula.
`w_t` = monthly spending, stepped up once a year by the inflation assumption.
With the contribution end age at its default (the retirement age) the coasting
phase is empty and the plan contributes right up to retirement. Inverse problems
(required contribution for a target; months to reach a target) are solved
numerically against this same recurrence — there is no separate closed-form path
that could drift from it.

### Retirement target formula
With `n` = years to retirement, `i` = USD inflation, monthly rates
`r_m`/`g_m` derived per the [projection formula](#projection-formula):
```
P_year = annual spending (today's USD) × (1 + i)^n     (nominal at retirement)

capital preservation:  target = P_year ÷ SWR
capital depletion:     target = P × [1 − ((1+g_m)/(1+r_m))^m] ÷ (r_m − g_m)
                       (growing annuity; target = P × m when r_m = g_m)
```
`P` = first retirement month's nominal spending, `g_m` = monthly inflation,
`m` = months from retirement age to depletion age.

The annuity closed form assumes spending grows every month, while the
[projection formula](#projection-formula) steps spending up **once a year** —
so a depletion target funds the projected drawdown with a small surplus
(≈ +5% at 7% return / 2% inflation / 25 years), never a shortfall. This
conservatism is deliberate and pinned by a test; the target is
sufficient-by-construction.

### Coast FIRE number formula
```
Coast FIRE number(t) = target ÷ (1 + r)^(years from t to retirement)
```
`r` is the base-case nominal **primary expected return** from the
[retirement scenario](#retirement-scenario). Evaluated at every future month it forms a curve
rising toward the target; the [coast date](#coast-fire-gap) is the first month
the projected portfolio value meets the curve.
