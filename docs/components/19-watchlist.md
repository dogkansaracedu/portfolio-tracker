# Component 19: Watchlist (Takip listesi) — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/19-watchlist.md](technical/19-watchlist.md)
>
> **Status: built** (v0.26.0).

## Purpose

Follow symbols you don't hold — a US or BIST stock, a coin, an FX pair, gram
gold, a Turkish fund — with their current price and today's move, in an order
you choose. The same list feeds the phone home-screen widget ("Takip").

## Depends on

- Component 2 (data store & auth) — per-user, private storage.
- Component 5 (price engine) — every watched symbol is priced by the engine,
  through the same sources, cache, refresh cadence, market-hours gate,
  currency handling and [staleness](GLOSSARY.md#staleness) as assets. There is
  no second fetcher.

Nothing here touches holdings, transactions, total value, allocation or P&L.

## Concepts used — links into GLOSSARY

- [Watchlist](GLOSSARY.md#watchlist) — the list and its items.
- [Day change](GLOSSARY.md#day-change) — today's move for a watched symbol.
- [Price](GLOSSARY.md#price), [Staleness](GLOSSARY.md#staleness).

## Behaviors / rules

**Adding: type, then pick.** The user types a symbol or a word and picks from
results. One query is tried against every source it could mean, at once:

- a bare symbol → its US listing, its BIST listing, its USD crypto pair, and —
  for six letters — the FX pair (`USDTRY`);
- an explicit provider symbol (`THYAO.IS`, `BTC-USD`) → only that;
- a three-character code → also the Turkish-fund source;
- "altın" / "altin" / "gram altın" / "gold" / "XAU" → gram gold (the
  central-bank FX source's TRY gram price).

Each result shows the display symbol, the source's name for it, its category
and current price. A symbol already on the list shows as added and can't be
picked twice. Category and display currency come from the source's own report
(instrument type, quote currency), never from the symbol's spelling. A quote in
a currency the engine can't convert is not offered. Only a signed-in user can
search; anyone else is refused before any source is asked.

**Pricing.** A picked symbol's price is written to the shared cache by the
search itself, so the row is priced immediately; after that the engine's
regular refresh (the open app's presence loop, the widget's freshness ping, the
hourly and nightly forced refreshes) keeps it current exactly as it does an
asset's.

**Row.** Display symbol, name, price in the item's currency (TRY when the source
quotes TRY, USD otherwise), and [day change](GLOSSARY.md#day-change) as a
signed percent in gain/loss colour. A price older than 30 minutes is dimmed
(still shown). No price → `—`; no day change yet → `—` in the neutral tone.

**Order, remove.** The list is in the user's order. An Edit mode replaces each
row's figures with move-up, move-down and remove controls; Done returns to the
figures. Changes save immediately; a failed save shows an error and the list
reloads from storage.

## UI contract

- One entry in the secondary navigation ("Takip listesi"; on a phone it lives
  behind the More tab).
- Page actions: **Edit/Done** (only when the list has items) and **Add**.
- Add opens a search sheet: full-height on a phone (the results list sits
  above the keyboard), a centred dialog from `sm` up.
- Rows are a single bordered list, max ~42rem wide on desktop.

## Widget feed

The widget feed (Component 5) returns the list as `watchlist`, in the user's
order: `ticker`, `name`, `price`, `priceCurrency`, `changePct` (the day
change), `updatedAt`, `stale`. A list that cannot be read is returned empty
rather than failing the feed.

## Acceptance

- [ ] "AAPL", "THYAO", "BTC", "altın", "USDTRY" and a fund code each return the
      right instrument(s); "BTC" offers both the ETF and the coin.
- [ ] A picked symbol shows a price at once and keeps refreshing while the app
      is open; BIST symbols are not refetched outside market hours.
- [ ] Watching a symbol creates no asset and changes no portfolio figure.
- [ ] After a day boundary the row shows its day change; before it, `—`.
- [ ] Stale prices are dimmed; reorder and remove work by touch and persist.
- [ ] Another account never sees or edits this user's list.
- [ ] A search without a signed-in session is refused.
- [ ] The widget feed returns the list in the same order with the same figures.
