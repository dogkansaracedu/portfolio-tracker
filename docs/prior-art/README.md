# Prior Art

How other apps solve the problems this app solves. Persisted so the same research
is not re-run — and not re-invented from memory — every time a feature is
designed or revised.

## When to read this

The `product-kickoff` skill makes prior art a **required** step before designing
a new feature or changing specified behaviour. Read the entry for the feature
area first:

- If an entry exists and is still current, use it — no new research needed.
- If it exists but is stale, or the new question isn't covered, dispatch
  `prior-art-researcher` agents (one per app, in parallel, `model: opus`) for
  the gap only, then **extend the existing entry** rather than starting a new file.
- If no entry exists, research and create one.

Volatile facts (fees, tax rates, broker behaviour) come from sourced research,
never from memory — including the research recorded here, which is a snapshot
with a date, not a standing truth.

## File convention

One file per **feature area**, not per app: `docs/prior-art/<feature-area>.md`.
An app that appears in three areas is researched three times, once per area, and
each finding lives with the feature it informs.

Every entry contains, in this order:

1. **Question** — the one design question the research fed.
2. **Apps researched** + research date.
3. **Findings, one section per app** — what the app does, with source URLs
   inline, and a confidence line (high / medium / low + why). "Not found" is a
   valid finding and must be written as such; never fill a gap with a guess.
4. **Cross-app synthesis** — patterns and common failure modes.
5. **What we decided** — our choice, the date, what we explicitly rejected and
   why, and a pointer to the `docs/components/` spec that now owns the behaviour.

The spec is the source of truth for what the app does; a prior-art entry records
only why the choice was made and what the alternatives were. When behaviour
changes, update the spec and append to the "What we decided" section here — do
not rewrite the findings, they are a dated observation.

## Entries

| Feature area | Apps researched | Researched | Feeds |
|---|---|---|---|
| [Transfers between platforms](transfers-between-platforms.md) | Delta, Ghostfolio, Kubera, Sharesight, Empower | 2026-08-28 | [04 Transaction System](../components/04-transaction-system.md), [09 Transactions Page](../components/09-transactions-page.md) |
| [Stablecoin-settled trades](stablecoin-settled-trades.md) | Delta, Ghostfolio, Kubera | 2026-08-28 | [04 Transaction System](../components/04-transaction-system.md), [06 P&L Engine](../components/06-pnl-engine.md) |

## Related research that lives elsewhere

Not competitor prior art, but sourced external research worth knowing about
before re-researching the same ground:

- **Campaign platform watch list** (researched 2026-08-17) — which staking/earn
  platforms are accessible and trustworthy for a Turkish resident, with ground
  URLs, exclusions, and SPK regulatory context. Lives in
  [`docs/components/technical/15-campaigns.md`](../components/technical/15-campaigns.md)
  because it is a live config table (`PLATFORM_WATCH_LIST`), not a design input.
  Left there deliberately — copying it here would create two versions that drift.
- **Retirement tax rules** — [`docs/retirement-tax-rules.md`](../retirement-tax-rules.md),
  cited primary sources, the only permitted origin for BES/tax rates.

## Backlog — research that was not persisted

These features were designed with research that no longer exists in the repo.
Re-capture it as a prior-art entry the next time each is revised; do not
reconstruct it from memory.

- **Campaigns (Component 15)** — the app-level framing (how other trackers, if
  any, surface yield/promo opportunities) was never written down. Only the
  platform watch list survived, and that is source research, not prior art.
- **Budgeting (Component 14)** — the residual-model design and the deferred
  Phase C / expense-ledger work were framed without a persisted comparison
  against budgeting apps.
</content>
</invoke>
