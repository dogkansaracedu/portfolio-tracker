# Component 3: Platform & Asset Management — Behavioral Spec
> Layer: behavioral (tech-agnostic). Implementation → [technical/03-platform-asset-management.md](technical/03-platform-asset-management.md)

## Purpose
Manage the two reference entities the rest of the app builds on: the **platforms** an investor holds assets on, and the **global assets** they track. This is the CRUD surface for that reference data — it does not record balances or transactions, only the definitions those hang off of.

## Depends on
- Component 2 (data store & auth). Platforms are scoped to the signed-in user; assets are a single global catalog (one shared set for all users), writable only by the admin.

## Concepts used — links into [GLOSSARY](GLOSSARY.md)
- [Platform](GLOSSARY.md#platform) — where assets are held (broker, exchange, bank, physical bucket).
- [Asset](GLOSSARY.md#asset) — one global row per ticker per user; balances are not stored here.
- [Holding](GLOSSARY.md#holding) — per-asset, per-platform balance (managed elsewhere; only *read* here, to count/sort).
- [Price](GLOSSARY.md#price) — the cached unit price an asset resolves to (priced elsewhere; only *displayed* here).

## Behaviors / rules

### Platforms — CRUD
- **Create / edit:** a platform has a `name` and a `color` (chosen from a small fixed palette; the color is reused across the app for dots and charts). A type/bucket distinction exists conceptually (broker / exchange / bank / physical) — name is what's edited.
- **Delete:** allowed **only when no active asset is held on the platform**. If any holding with a positive balance references it, deletion is blocked with an explanatory message rather than cascading. (A platform with zero held assets deletes outright; there is no soft-delete for platforms.)
- **Asset count:** each platform shows how many distinct assets it currently holds (counting only holdings with balance > 0).

### Assets — CRUD
An asset is **global: one shared row per ticker for all users**, curated by the [Admin](GLOSSARY.md#admin) — it is not tied to a platform, and it carries no balance (see [Holding](GLOSSARY.md#holding)). Only the admin can create/edit/deactivate; every other user only reads it. Admin-editable fields:
- `ticker` — display symbol (e.g. `BTC`, `AAPL`, `USD`).
- `name` — display name (e.g. `Bitcoin`).
- `category` — free-form bucket (`fiat`, `crypto`, `gold`, `fund`, `stock_us`, `stock_bist`, …). Drives the per-ticker hint, the native currency, and how the icon is resolved. (`fund` is a Turkish money-market fund / PPF — TRY-native, priced by manually-entered NAV.)
- `at_source_tax_rate` — optional. A fraction withheld at source on the asset's gains (e.g. `0.175` = 17.5%, as for a Turkish PPF). When set, the asset's gain is shown **net** of it (see the P&L engine's [after-tax rule](GLOSSARY.md#after-tax-pl) / [at-source tax](GLOSSARY.md#at-source-tax)); gross figures are unchanged. Surfaced for the `fund` category; blank means no at-source tax.
- `tags[]` — cross-cutting labels (comma-entered, lower-cased, de-duped) used for allocation grouping (e.g. tag `usd` groups USD + USDT + USDC).
- `price_source` — the classic feed for this asset (see Component 5): `yahoo` / `tefas` assets are priced through their [price-source list](GLOSSARY.md#price-source) (seeded from this field when the asset is created), `tcmb` / `manual` assets are priced as before. It still drives price history. Determines how a value is fetched, not the value itself.
- `price_id` — the identifier that feed uses (e.g. `BTC-USD`, `THYAO.IS`). **Falls back to `ticker` when blank.** For exchange-listed stocks it can be auto-derived from the ticker (e.g. a BIST ticker → its exchange-suffixed form) and stays in sync with the ticker until the user hand-edits it, after which their value is preserved.
- `icon_url` — optional manual logo override (see Icons below).
- `is_currency` — marks the asset as fiat/cash. Currency assets carry [Fiat FX P&L](GLOSSARY.md#fiat-fx-pl), are priced as 1 unit of themselves, and are **not** user-editable/deactivatable from this surface (they're managed as part of the system's currency set).

### Roles & visibility
- The catalog surface lives on the **Admin page**, which only the [Admin](GLOSSARY.md#admin) (a single designated account) can open. Settings shows the admin a one-line pointer to it; anyone else who opens the page directly is sent to the home screen once the admin check has answered (while it is pending, a placeholder shows instead of bouncing the admin).
- Other users don't manage the catalog; they meet it where they use it (picking an asset for the [watchlist](19-watchlist.md), transactions, portfolio).
- The catalog is enforced server-side (database write policies), so hiding the page is convenience, not the security boundary.

### Price sources (Fiyat kaynakları)
Each Yahoo/TEFAS-priced asset has an ordered list of [price sources](GLOSSARY.md#price-source) (source + that source's symbol). The admin edits it per asset:
- Rows show, in order: position, source name · symbol, and the row's latest health — "OK *age*" or "Failed *age*: *message*" (whichever happened last), "Not tried yet" before the first run, "New" for a row added in this edit.
- Rows move up/down and can be removed; a new row is added from a source picker plus a symbol (1–32 characters; the same source + symbol can't be listed twice, ignoring case). A symbol typed but not yet added is added by Save too. The picker starts on the source that usually fits the category (crypto → Paribu crypto, US stock → Paribu US, BIST stock → Paribu BIST, fund → TEFAS).
- Nothing is stored until **Save**, which writes the whole list at once with priorities 1..n in the shown order. A failed save keeps the editor open with the draft and the error, so it can be retried.
- TCMB and manual assets have no list; the editor says so instead.

### Native price currency
An asset's price is shown in its **native** currency, derived from the asset itself (its category/ticker), never from which price columns happen to be filled:
- fiat → its own currency code; BIST stock → ₺; physical gram gold → ₺; US stock / crypto / tokenized gold → $.
- A non-USD price additionally shows a `~$` USD estimate beside it.

### Activate / deactivate (soft delete)
- Assets are **deactivated**, never hard-deleted, because transactions and holdings reference them — history must be preserved.
- A deactivated asset (`is_active = false`) is **hidden from active views** (e.g. excluded from "active" lists and the active portfolio) but its transactions and holdings remain intact, and it can be reactivated later.
- Deactivation is confirmed (it warns that the asset will be hidden from the active portfolio).

### Held-vs-not split
The asset list separates **held** assets (net balance across all platforms > 0) from **not-held** assets, floating held ones to the top and collapsing the rest behind a "Not held (N)" toggle. Ordering within each group preserves the assets' existing name order.

### Icons / logos
Every asset renders a circular icon resolved **deterministically**, in this priority order:
1. **Manual override** (`icon_url`) — always wins if set.
2. **Auto-resolved logo** from ticker + category (stocks and fiat have automated sources; crypto/gold may not — they degrade gracefully).
3. **Monogram fallback** — first 1–2 characters of the ticker on a background color **deterministically hashed from the ticker** (stable per asset; unrelated to the gain/loss palette), shown when no image is available or all image candidates fail to load.

The icon is **decorative** — the adjacent ticker/name text carries the meaning.

## Contract (I/O)
- **Reads:** the user's platforms; the user's assets; current holdings (for asset counts and the held/not-held split); cached prices (for the per-row price display). These shared reads are fetched **once per session and shared**, not re-fetched per place that needs them. One asset's price sources are read when its editor opens.
- **Writes:**
  - Platform: create `{name, color}`, edit `{name?, color?}`, delete (guarded by the no-held-assets rule).
  - Asset: create `{ticker, name, category, tags[], price_source, price_id, icon_url?, is_currency, at_source_tax_rate?}`, edit the same fields, deactivate (sets `is_active = false`). Creating a Yahoo/TEFAS asset also gives it a first price source (its `price_source` + `price_id ?? ticker`), made by the data store, not by this screen.
  - Price sources (admin): replace one asset's list with `[{source, symbol}]` in priority order. Health fields are written by the price engine only.
- **Validation:** creating an asset requires `ticker` **and** `name` **and** a `price_source` (a category is always set, defaulting to a stock category). `price_id` blank ⇒ falls back to `ticker` on save.
- **No balances or transactions are written here.** Initial balances come from buy transactions (Component 4), not from asset creation.

## UI contract
- **Platforms:** a list/grid of platform cards (color dot + name + asset count + an actions menu for Edit / Delete). An "Add Platform" action opens a create dialog; the create dialog offers quick-select name presets (common broker/exchange names) and a fixed color swatch palette.
- **Assets (Admin page):** a table with columns **Ticker (with icon + name), Category, Price (native, with `~$` estimate when non-USD), Group/Tags, Status (Active/Inactive)**, plus a per-row actions menu (Edit / Fiyat kaynakları / Deactivate) — the menu is hidden for currency and inactive assets. Below the wide-screen breakpoint each asset is a card with the menu in its header. The header shows "active / total" counts. The "Not held" group is collapsible. An "Add Asset" action opens the create/edit dialog.
- **Price-source editor:** a dialog (full-height sheet on a phone, header and Save pinned, rows scroll between them). Each row is one line of source · symbol (truncated if long) over a health line that wraps to at most two lines; the three icon buttons stay on the right at full tap size. The add row is source picker + symbol field + Add on one line, the symbol field taking the leftover width.
- **Asset dialog:** category select (with a per-category ticker hint), ticker, display name, an icon field with a **live icon preview** + a hint that blank auto-resolves from the ticker, price-source select, price-id field (auto-filled/overridable per the rule above), an at-source tax-rate field shown **only when the category is `fund`** (a fraction 0–1; blank = none), and a comma-separated tags field.
- Inactive assets render visibly dimmed.
- Both lists show loading and error states and a friendly empty state.

## Acceptance
- [ ] Create a platform with name + color; edit either; the color shows everywhere that platform appears.
- [ ] Deleting a platform is **blocked while it still holds assets**, with a message; deletes once empty.
- [ ] Each platform card shows the count of assets it currently holds (balance > 0).
- [ ] Creating an asset **requires ticker + name + price_source** (category always set); leaving `price_id` blank stores the `ticker` as the fallback.
- [ ] Changing `price_source` / `price_id` changes how the asset is priced (verified via Component 5), not what this screen computes.
- [ ] Deactivating an asset **hides it from active lists/portfolio without deleting** its transactions or holdings; it can be reactivated.
- [ ] Currency assets (`is_currency`) cannot be edited/deactivated from this surface and price as 1 unit of themselves.
- [ ] The `fund` category (PPF) is TRY-native and manually priced; selecting it reveals the at-source tax-rate field, and a set rate (e.g. `0.175`) makes the asset's gain report net of tax (per the P&L engine's after-tax rule), while blank leaves it gross.
- [ ] Each asset shows an icon: override if set, else an auto logo, else a stable monogram; a manual `icon_url` overrides everywhere and updates the dialog preview live.
- [ ] The asset list floats held assets to the top and collapses not-held assets behind a toggle.
- [ ] As admin, adding/editing/deactivating an asset is reflected for every user; a non-admin opening the Admin page lands on the home screen, and a direct write is rejected by the database.
- [ ] As admin, reordering, removing and adding price sources then saving stores the list in the shown order (1..n); cancelling stores nothing; a TCMB or manual asset shows that it has no list.
- [ ] All changes persist across refreshes.
