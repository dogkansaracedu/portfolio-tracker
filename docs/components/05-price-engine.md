# Component 5: Price Engine — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/05-price-engine.md](technical/05-price-engine.md)

## Purpose

Give every [Asset](GLOSSARY.md#asset) a current [Price](GLOSSARY.md#price) (in
both the [USD anchor](GLOSSARY.md#usd-anchor) and the home currency TRY), and
keep the historical [Exchange rates](GLOSSARY.md#exchange-rate) those conversions
depend on. Prices and rates are **cached** and read from the cache by everything
else in the app; refresh happens **on demand**, and how old a price is
([staleness](GLOSSARY.md#staleness)) is surfaced to the user.

## Depends on

- **Database & identity** — somewhere to store the price cache and the dated
  exchange-rate table, scoped to the signed-in user.
- **Asset management** — assets must exist and carry a `price_source` and a
  price-fetch key before they can be priced.

## Concepts used — links into GLOSSARY

- [Price](GLOSSARY.md#price) — cached current unit price (USD + TRY) with a
  `source` and an `updated_at`.
- [Exchange rate](GLOSSARY.md#exchange-rate) — dated FX (`usd_try`, `eur_try`,
  `eur_usd`, gram-gold); the conversion backbone.
- [USD anchor](GLOSSARY.md#usd-anchor) — all values reduce to USD.
- [Staleness](GLOSSARY.md#staleness) — age of a price, surfaced as an indicator.
- [Asset](GLOSSARY.md#asset) — carries `price_source` and the price-fetch key.

## Behaviors / rules

**Source routing — `price_source` decides where a price comes from.** Each asset
declares one of:

- **central-bank FX source** → fiat (USD/EUR/TRY) and the official gram-gold
  rate. This source also produces the dated [Exchange rates](GLOSSARY.md#exchange-rate)
  the whole app converts through.
- **equities source** → stocks, including Turkish (BIST) equities.
- **Turkish-fund source** → Turkish mutual / money-market funds (e.g. a *Para
  Piyasası Fonu* / PPF), which the equities source doesn't cover. The fund's
  daily **NAV** (its per-unit price, quoted in TRY) is the price, converted to
  the USD anchor like any other TRY-quoted asset. NAV publishes ~once a business
  day, so these refresh on a daily-ish cadence with no market-hours gate.
- **crypto source** → crypto and tokenized-gold tokens.
- **manual** → the user types the price in; the engine never overwrites it.

The price-fetch **key is separate from the display symbol.** An asset shows a
short display [ticker](GLOSSARY.md#asset) (e.g. `BTC`, `THYAO`) but is fetched by
a provider-specific key (`price_id`, e.g. `BTC-USD`, or a market-suffixed stock
symbol). When `price_id`
is absent, the key **falls back to the ticker**. The cache is keyed by this fetch
key, so **two assets that share a display ticker but resolve to different
provider keys never collide**, and re-routing an asset's `price_source` / key
changes how it's fetched without touching its display.

**Currency comes from the source, not the symbol.** The quoted currency is read
from the source's own report and converted into both USD and TRY using the latest
exchange rate. A symbol suffix is never used to *guess* currency. An unsupported
quote currency is skipped (and logged) rather than silently mislabeled as USD.

**Both currency columns are stored, native value preferred.** Each cached price
keeps `price_usd` and `price_try`; whichever the asset is natively quoted in is
stored raw, the other is derived via the rate. If a needed rate is missing, the
derived column is left empty rather than wrong.

**Refresh is demand-driven and presence-gated — NOT a background schedule.**
Prices refresh only when a user is **actively present** (the app is open and
focused) or on an **explicit refresh action**. While present the app
periodically (a) re-reads the cache so on-screen figures track it and (b) asks
the engine to refresh upstream; when the app is backgrounded or no one is signed
in, **nothing is fetched**. (A separate daily *[Snapshot](GLOSSARY.md#snapshot)*
job — Component 10 — runs on a schedule and force-refreshes prices as its first
step; that is the only scheduled price fetch, and it is not part of this
component's demand-driven loop.)

**The engine self-throttles per asset.** A refresh request is *not* "refetch
everything." Each asset is refetched only once it is older than a per-class
cadence (crypto/gold refresh more often than equities; FX rarely, since the
central bank publishes ~once a day). Concurrent requests within a short window
(multiple devices/tabs) collapse into one fetch. A forced refresh bypasses all
throttling.

**Markets that are closed aren't polled.** BIST equities are only refetched
during Turkish market hours; outside the continuous session and on weekends
their price can't move, so they're skipped (saving wasted calls). Other
asset classes are not market-gated.

**Equity prices follow the latest traded price, including extended-hours
sessions.** Where a market publishes pre-market or after-hours trades (e.g. US
equities), the most recent such trade is used as the current price — the value
is *not* frozen at the official regular-session close. During the regular
session the live regular price is used (it is more current than the last
extended-hours print). Markets without an extended session, and asset classes
that trade continuously (crypto, tokenized gold), are unaffected. Because there
is a single shared price store, this latest price is what the daily
[Snapshot](GLOSSARY.md#snapshot) records too — a snapshot taken while a foreign
market is still in an extended session reflects that session's price, by design.

**Single shared price store.** Every consumer (header, portfolio, dashboard, the
snapshot writer) reads from **one** app-wide price store. A manual refresh
propagates to all of them at once; the presence/refresh loop runs **once per app
session**, not once per consumer.

**Staleness is display-only.** Age is computed from `updated_at` and surfaced as
a 3-level indicator (fresh / warning / stale). Stale prices are **still used** in
all calculations — staleness only informs the user, it never blocks a value.

**Historical-rate backfill (supporting behavior).** When a [Transaction](GLOSSARY.md#transaction)
is entered in a non-USD currency, the engine ensures the dated exchange rate for
that day exists (fetched on demand, best-effort) so cost-basis conversion uses
the day's real rate. If the exact day is unavailable (weekend/holiday), it walks
back to the most recent prior published rate. Failure is non-fatal: conversion
falls back to the nearest known rate.

## Contract (I/O)

**Inputs**

- The set of assets with their `price_source` and price-fetch key.
- A refresh trigger: user presence (app focused), an explicit user action, or a
  forced/privileged call (the scheduled snapshot job).
- For non-USD transactions: a date for which a historical rate is needed.

**Outputs**

- **Price cache**: per fetch-key → `{ price_usd, price_try, source, updated_at }`.
- **Exchange-rate history**: per date → `{ usd_try, eur_try, eur_usd, gram-gold }`.
- A refresh result summary: count updated + any per-source errors.
- A consumable client state: `{ prices (map by fetch-key), latest rates,
  loading, refreshing, lastUpdated, staleAssets }`.

**Guarantees**

- A value is keyed by `price_id ?? ticker`; lookups must use the same key.
- Manual prices are never overwritten by an automated refresh.
- A refresh is idempotent and safe to call repeatedly (throttling absorbs spam).

## UI contract — price display + manual refresh control

- **Price display** shows the price in the user's preferred currency (USD/TRY),
  preceded by a staleness dot: **fresh** (recent), **warning** (older than the
  fresh window), **stale** (well past it), each with an explanatory tooltip.
  Missing price → a neutral placeholder (e.g. `--`).
- **Manual refresh control** shows the last-update time as a relative label
  ("Updated 5m ago", "just now", "2h ago", or "No price data"), triggers a
  refresh on click, and shows an in-progress state (spinner / disabled) while
  refreshing.
- **Manual price entry** (for `price_source = manual` assets): the user enters
  the price; it is stored as a manual-sourced price and left untouched by the
  automated loop.

## Acceptance

- [ ] A Turkish (BIST) equity gets its price from the equities source (not the
      FX source), converted to USD via the latest rate.
- [ ] A Turkish fund (PPF) gets its price from the Turkish-fund source as a
      TRY-quoted NAV, converted to USD via the latest rate.
- [ ] A `manual` asset keeps the entered price across refreshes; the engine never
      overwrites it.
- [ ] Changing an asset's `price_source` re-routes how its price is fetched.
- [ ] Pricing is keyed by `price_id` (falling back to ticker), so two assets that
      share a display ticker but differ in fetch key do **not** collide.
- [ ] No price is fetched while the app is backgrounded or no one is signed in;
      refresh resumes on focus and on explicit action.
- [ ] A refresh request does not refetch everything — only assets past their
      cadence — and BIST equities are skipped outside market hours.
- [ ] FX rates and gram-gold appear in the exchange-rate history after an FX
      refresh; crypto and equity prices appear in the cache after a refresh.
- [ ] The refresh control shows the last-update time and refreshes on click; the
      display shows fresh/warning/stale indicators.
- [ ] A non-USD transaction triggers a best-effort fetch of that day's historical
      rate; if unavailable, conversion degrades to the nearest prior rate.
