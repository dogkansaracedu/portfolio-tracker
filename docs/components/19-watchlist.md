# Component 19: Watchlist (Takip listesi) — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/19-watchlist.md](technical/19-watchlist.md)
>
> **Status: built** (v0.26.0; catalog assets only since v0.27.0).

## Purpose

Follow catalog [assets](GLOSSARY.md#asset) you don't hold — a US or BIST
stock, a coin, gram gold, a Turkish fund — with their current price and today's
move, in an order you choose. Only assets in the catalog can be watched. The
same list feeds the phone home-screen widget ("Takip").

## Depends on

- Component 2 (data store & auth) — per-user, private storage.
- Component 3 (asset catalog) — a watched item is a reference to a catalog
  asset; its ticker, name, category and price key come from there.
- Component 5 (price engine) — a watched asset is priced like any asset (its
  [price sources](GLOSSARY.md#price-source), cache, refresh cadence,
  market-hours gate and [staleness](GLOSSARY.md#staleness)). There is no second
  fetcher.

Nothing here touches holdings, transactions, total value, allocation or P&L.

## Concepts used — links into GLOSSARY

- [Watchlist](GLOSSARY.md#watchlist) — the list and its items.
- [Day change](GLOSSARY.md#day-change) — today's move for a watched symbol.
- [Price](GLOSSARY.md#price), [Staleness](GLOSSARY.md#staleness).

## Behaviors / rules

**Adding: pick from the catalog.** Add opens the catalog's active assets that
are not on the list yet (currency assets are left out — cash is worth one of
itself, there's nothing to follow); typing narrows them by ticker or name (case and
Turkish letters don't matter — "altin" finds "Altın"). An exact ticker match
comes first, then tickers that start with the text, then other matches. Each
result shows the ticker, name, category and current price. There is no free
symbol search: something not in the catalog has to be added to the catalog by
the [Admin](GLOSSARY.md#admin) first.

**Pricing.** The asset is already priced by the engine, so the row shows its
price at once and keeps refreshing with the rest of the app.

**Row.** The asset's ticker and name, its price in the asset's quote currency
(TRY for BIST stocks, funds and gram gold; USD otherwise), and
[day change](GLOSSARY.md#day-change) as a signed percent in gain/loss colour. A price older than 30 minutes is dimmed
(still shown). No price → `—`; no day change yet → `—` in the neutral tone.

**Order, remove.** The list is in the user's order. An Edit mode replaces each
row's figures with move-up, move-down and remove controls; Done returns to the
figures. Changes save immediately; a failed save shows an error and the list
reloads from storage.

## UI contract

- One entry in the secondary navigation ("Takip listesi"; on a phone it lives
  behind the More tab).
- Page actions: **Edit/Done** (only when the list has items) and **Add**.
- Add opens the catalog picker: full-height on a phone (filter field on top,
  the results scroll above the keyboard; long names truncate, the price never
  does), a centred dialog from `sm` up.
- Rows are a single bordered list, max ~42rem wide on desktop.

## Widget feed

The widget feed (Component 5) returns the list as `watchlist`, in the user's
order: `ticker`, `name`, `price`, `priceCurrency`, `changePct` (the day
change), `updatedAt`, `stale`. A list that cannot be read is returned empty
rather than failing the feed.

## Acceptance

- [ ] The picker lists only active, non-currency catalog assets not already watched; typing
      a ticker or part of a name narrows it ("altin" finds "Altın").
- [ ] A picked asset shows a price at once and keeps refreshing while the app
      is open.
- [ ] Watching an asset changes no portfolio figure.
- [ ] After a day boundary the row shows its day change; before it, `—`.
- [ ] Stale prices are dimmed; reorder and remove work by touch and persist.
- [ ] Another account never sees or edits this user's list.
- [ ] The widget feed returns the list in the same order with the same figures.
