# Portfolio Tracker — Product Requirements Document

**Version:** 1.0  
**Date:** April 2, 2026  
**Author:** —  
**Status:** Draft

---

## 1. Problem Statement

Managing a diversified portfolio across multiple platforms (IBKR, Midas, Paribu, OKX, bank accounts, physical assets) using spreadsheets is fragile and unsustainable. There is no unified view of total net worth, no automated performance tracking over time, and no reliable way to calculate realized P&L from trades. The user needs a single system that consolidates everything, tracks performance monthly, and works seamlessly on both desktop and mobile.

## 2. Goals

- **Unified net worth dashboard** — See total portfolio value in USD and TRY at a glance, broken down by platform, asset category, and individual asset.
- **Transaction log with P&L** — Record every buy/sell/transfer. Automatically compute realized and unrealized P&L using FIFO cost basis.
- **Monthly performance tracking** — Automated snapshots on the 1st of each month. Month-over-month and year-over-year returns, with attribution (which asset class drove gains/losses).
- **Multi-device access** — Fully responsive web app, installable as PWA on mobile.
- **Zero ongoing cost** — Run entirely on free tiers (Supabase, Netlify/Vercel).
- **Long-term durability** — Simple enough to maintain solo for years. Portable data (easy export).

## 3. Non-Goals

- Real-time trading or order execution.
- Automatic sync with brokerage APIs (manual entry is acceptable; auto-sync is a future nice-to-have).
- Social features, sharing, or multi-user collaboration.
- Tax reporting (nice-to-have later, not MVP).
- Sub-second price updates — prices refreshed every 15–60 minutes are sufficient.

## 4. User Profile

A single user (the developer/owner) who:
- Holds assets across 5–10 platforms.
- Makes trades infrequently (a few per week at most, sometimes none for months).
- Wants to check portfolio value daily on phone, do deeper analysis on desktop.
- Cares about long-term wealth trajectory, not day-trading signals.

## 5. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React + Vite + Tailwind | Fast dev, simple deploy, great DX |
| Hosting | Netlify (or Vercel) | Free tier, `npm run build` → deploy |
| Database | Supabase (PostgreSQL) | Free tier (500MB), auth, RLS, edge functions, realtime |
| Auth | Supabase Auth | Email/password or magic link — single user, keep it simple |
| Price Data | TCMB, CoinGecko, Yahoo Finance | All free, details in §10 |
| Scheduled Jobs | Supabase Edge Functions + pg_cron | Monthly snapshots, daily price cache refresh |

## 6. Data Model

### 6.1 `platforms`

Represents a brokerage, exchange, bank, or physical location.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| name | text | "IBKR", "Paribu", "Ziraat", "Fiziksel" |
| color | text | Hex color for UI |
| created_at | timestamptz | |

### 6.2 `assets`

A specific holding on a specific platform. One row = one asset-platform pair. E.g., "BTC on Paribu" and "BTC on OKX" are two separate rows.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| platform_id | uuid | FK → platforms |
| category | enum | `fiat`, `crypto`, `stock_bist`, `stock_us`, `commodity` |
| ticker | text | Canonical ticker used for price lookups. See §6.7 |
| name | text | Display name: "Bitcoin", "THY", "Gram Altın" |
| balance | numeric | Current quantity — **derived from transactions**, cached here |
| is_active | boolean | Soft delete |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 6.3 `transactions`

Every buy, sell, transfer, dividend, or fee event.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| asset_id | uuid | FK → assets |
| type | enum | `buy`, `sell`, `transfer_in`, `transfer_out`, `dividend`, `interest`, `fee` |
| date | timestamptz | When the transaction occurred |
| amount | numeric | Quantity (always positive) |
| unit_price | numeric | Price per unit at time of transaction |
| price_currency | text | Currency of unit_price: `USD`, `TRY`, `EUR`, `BTC` |
| total_cost | numeric | Computed: amount × unit_price (stored for convenience) |
| fee | numeric | Commission/fee amount |
| fee_currency | text | |
| related_asset_id | uuid | FK → assets, nullable. For transfers: the counterpart asset on the other platform |
| notes | text | |
| created_at | timestamptz | |

**Invariant:** `asset.balance = SUM(buy + transfer_in + dividend + interest) - SUM(sell + transfer_out + fee)` for that asset's transactions.

### 6.4 `price_cache`

Latest known price for each ticker.

| Column | Type | Notes |
|--------|------|-------|
| ticker | text | PK. Canonical ticker |
| price_usd | numeric | |
| price_try | numeric | |
| source | text | `coingecko`, `yahoo`, `tcmb` |
| updated_at | timestamptz | |

### 6.5 `snapshots`

Monthly portfolio photograph.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| snapshot_date | date | Always 1st of month |
| total_usd | numeric | |
| total_try | numeric | |
| breakdown | jsonb | See §8.2 for structure |
| created_at | timestamptz | |

**Unique constraint:** (user_id, snapshot_date)

### 6.6 `exchange_rates`

Daily exchange rate log for historical calculations.

| Column | Type | Notes |
|--------|------|-------|
| date | date | PK (with source) |
| usd_try | numeric | |
| eur_try | numeric | |
| eur_usd | numeric | |
| gold_gram_try | numeric | |
| source | text | |

### 6.7 Canonical Ticker Convention

Every asset has a `ticker` used for price lookups. Convention:

| Category | Ticker Format | Examples |
|----------|--------------|----------|
| Fiat | ISO currency code | `TRY`, `USD`, `EUR` |
| Crypto | CoinGecko ID | `bitcoin`, `ethereum`, `tether`, `solana` |
| BIST Stock | Yahoo format | `THYAO.IS`, `GARAN.IS`, `ASELS.IS` |
| US Stock | Standard ticker | `AAPL`, `MSFT`, `VOO` |
| Commodity | Custom | `XAU_GRAM` (gram gold), `XAG_GRAM` (gram silver) |

Fiat assets (TRY, USD, EUR) have an implicit price of 1 in their own currency. Conversion to USD/TRY is done via `exchange_rates`.

## 7. P&L Calculation Engine

### 7.1 FIFO Cost Basis

All realized P&L is calculated using **FIFO (First In, First Out)**.

**Algorithm:**

```
For each asset, maintain a queue of "lots":
  lot = { amount, unit_price, price_currency, date }

ON BUY / TRANSFER_IN:
  Push new lot to end of queue

ON SELL:
  remaining = sell_amount
  realized_pnl = 0
  while remaining > 0:
    lot = queue[0]  (oldest lot)
    consumed = min(lot.amount, remaining)
    cost_basis = consumed × lot.unit_price  (converted to USD)
    proceeds = consumed × sell_unit_price    (converted to USD)
    realized_pnl += (proceeds - cost_basis)
    lot.amount -= consumed
    remaining -= consumed
    if lot.amount == 0: remove lot from queue

  Record realized_pnl on the transaction
```

### 7.2 Unrealized P&L

```
For each asset:
  current_value = balance × current_price_usd
  cost_basis = SUM(remaining_lots: lot.amount × lot.unit_price_usd)
  unrealized_pnl = current_value - cost_basis
  unrealized_pnl_pct = unrealized_pnl / cost_basis
```

### 7.3 Currency Normalization

All P&L is computed in USD. When a transaction's `price_currency` is not USD:
- Use the `exchange_rates` entry for that transaction's date.
- If no entry exists for that exact date, use the nearest prior date.

### 7.4 Transfer Handling

Transfers between platforms do NOT affect P&L. A `transfer_out` from Platform A and `transfer_in` to Platform B should carry the original cost basis lots. Implementation:

- `transfer_out` removes lots (FIFO) from source asset.
- `transfer_in` creates corresponding lots on destination asset with the **same cost basis** (not current market price).
- Link via `related_asset_id`.

## 8. Snapshots & Performance

### 8.1 Snapshot Generation

A scheduled job (Supabase Edge Function triggered by pg_cron) runs on the 1st of every month at 00:05 UTC+3:

1. Fetch latest prices for all user's asset tickers.
2. For each asset: `value_usd = balance × price_usd`.
3. Aggregate by category, platform, and individual asset.
4. Insert into `snapshots`.
5. Log exchange rates into `exchange_rates`.

The user can also trigger a manual snapshot at any time (button in UI).

### 8.2 Snapshot Breakdown Schema

```json
{
  "rates": {
    "usd_try": 44.50,
    "eur_try": 51.54,
    "gold_gram_try": 6610
  },
  "by_category": {
    "fiat": { "usd": 8200, "try": 364900, "pct": 19.3 },
    "crypto": { "usd": 15000, "try": 667500, "pct": 35.4 },
    "stock_bist": { "usd": 1500, "try": 66750, "pct": 3.5 },
    "stock_us": { "usd": 6700, "try": 298150, "pct": 15.8 },
    "commodity": { "usd": 11000, "try": 489500, "pct": 25.9 }
  },
  "by_platform": {
    "IBKR": { "usd": 6700, "pct": 15.8 },
    "Midas": { "usd": 5000, "pct": 11.8 },
    "Paribu": { "usd": 12000, "pct": 28.3 }
  },
  "by_asset": [
    {
      "ticker": "bitcoin",
      "name": "Bitcoin",
      "platform": "Paribu",
      "amount": 0.12,
      "price_usd": 84500,
      "value_usd": 10140
    }
  ]
}
```

### 8.3 Performance Metrics

Computed on-the-fly from snapshots:

| Metric | Formula |
|--------|---------|
| Monthly return (USD) | `(snapshot[M] - snapshot[M-1]) / snapshot[M-1]` |
| Monthly return (TRY) | Same but using TRY totals |
| YTD return | `(latest - Jan 1 snapshot) / Jan 1 snapshot` |
| All-time return | `(latest - earliest) / earliest` |
| Category attribution | `Δ category_usd / previous_total_usd` — shows what % of total return came from each category |
| Best/worst month | Min/max of monthly returns |

### 8.4 Performance Chart Data

The snapshots table provides the data points for:
- Line chart: total portfolio value over time (USD and TRY).
- Stacked area chart: value by category over time.
- Bar chart: monthly return %.

## 9. Dashboard & Pages

### 9.1 Dashboard (Home)

The primary view. Shows at a glance:

- **Total net worth** in USD and TRY (large, prominent).
- **Daily change** — compared to previous day's cached total (or last snapshot if no daily cache).
- **Allocation donut chart** — by asset category.
- **Platform breakdown** — bar or horizontal stacked bar.
- **Top movers** — assets with highest absolute USD change since last check.
- **Monthly performance sparkline** — last 12 months from snapshots.

### 9.2 Portfolio Page

Full asset list, grouped by platform (default) or by category (toggle).

Each row shows:
- Asset name + ticker
- Platform
- Quantity held
- Current price
- Current value (USD + TRY)
- Unrealized P&L (USD + %)
- 24h change %

Subtotals per group. Search/filter bar at top.

**Actions:** Add asset, edit, record transaction, delete (soft).

### 9.3 Transactions Page

Chronological log of all transactions across all assets.

Columns: Date, Asset, Platform, Type (color-coded badge), Amount, Unit Price, Total, Realized P&L (for sells), Notes.

Filters: date range, asset, platform, type.

**Add Transaction modal:**
- Select asset (searchable dropdown, grouped by platform).
- Type selector (buy/sell/transfer/dividend).
- Amount, unit price, currency, fee.
- Date picker (defaults to now).
- Notes.
- For transfers: select destination asset.

### 9.4 Performance Page

- **Time-range selector**: 1M, 3M, 6M, YTD, 1Y, ALL.
- **Portfolio value chart** (line, USD + TRY toggle).
- **Monthly returns bar chart** (green/red bars).
- **Category attribution table**: for selected period, how much each category contributed.
- **Drawdown chart**: peak-to-trough visualization.
- **Summary stats**: total return, CAGR, best month, worst month, max drawdown.

### 9.5 Settings Page

- **Platforms**: CRUD.
- **Assets**: manage tickers, categories.
- **Display currency**: default USD or TRY.
- **Export data**: JSON or CSV dump of all tables.
- **Import data**: bulk transaction import from CSV.
- **Manual snapshot**: trigger button.
- **Price refresh**: manual trigger + show last update time.

## 10. Price Data Sources

### 10.1 TCMB (Turkish Central Bank)

- **URL:** `https://www.tcmb.gov.tr/kurlar/today.xml`
- **Data:** Official daily USD/TRY, EUR/TRY, XAU/TRY rates.
- **Update frequency:** Once daily (published ~15:30 Turkish time).
- **Rate limits:** None (public XML).
- **Use for:** Fiat exchange rates, gram gold TRY price.

### 10.2 CoinGecko API (Free Tier)

- **URL:** `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd`
- **Data:** Crypto prices in USD.
- **Rate limits:** 10–30 calls/minute (no API key needed for basic endpoints).
- **Use for:** All crypto asset prices.
- **Fallback:** Cache aggressively; if rate limited, serve from `price_cache`.

### 10.3 Yahoo Finance (Unofficial)

- **URL:** `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d`
- **Data:** Stock prices. BIST tickers use `.IS` suffix (e.g., `THYAO.IS`).
- **Rate limits:** Unofficial, be conservative (1 req/sec).
- **Use for:** BIST and US stock prices.
- **Note:** Yahoo Finance's unofficial API can break without notice. Consider a fallback or accept manual price entry for stocks as degraded mode.

### 10.4 Price Refresh Strategy

```
Every 30 minutes (via Supabase Edge Function or client-side):
  1. Fetch TCMB → update exchange_rates + price_cache for XAU_GRAM
  2. Fetch CoinGecko → update price_cache for all crypto tickers
  3. Fetch Yahoo Finance → update price_cache for all stock tickers
  4. Derive: price_try = price_usd × usd_try for all assets
  
On client load:
  1. Read price_cache
  2. If any price older than 30 min → trigger refresh
  3. Show "last updated: X min ago" in UI
```

### 10.5 Fallback & Degraded Mode

If any price source is down:
- Serve last known price from `price_cache`.
- Show a warning badge: "BTC price is 2 hours old".
- Allow manual price override per asset (useful for illiquid BIST stocks or unlisted assets).

## 11. Key User Flows

### 11.1 Initial Setup

1. User signs up (email/password).
2. Onboarding wizard:
   - Add platforms (preset list + custom).
   - For each platform, add assets with current balances.
   - Optionally backfill: "I bought 0.5 BTC at $30,000 on 2023-06-15" — this creates a `buy` transaction.
3. First snapshot is taken automatically.

### 11.2 Recording a Trade

1. User taps "Add Transaction" (FAB on mobile, button on desktop).
2. Selects or searches asset (e.g., "BTC - Paribu").
3. Picks type: Buy.
4. Enters: amount (0.05), unit price (84,500), currency (USD), fee (0.1%).
5. Confirms.
6. System: creates transaction row, updates asset balance, recalculates unrealized P&L.

### 11.3 Transfer Between Platforms

1. User selects "BTC - Paribu", action: Transfer Out.
2. Enters amount: 0.02 BTC.
3. Selects destination: "BTC - OKX" (or creates new asset on OKX).
4. System: creates `transfer_out` on Paribu asset, `transfer_in` on OKX asset, links them, carries cost basis lots over.

### 11.4 Monthly Review

1. On the 1st, system auto-generates snapshot.
2. User opens Performance page.
3. Sees: "March 2026: +$1,240 (+3.2%). Crypto drove +$900, Gold +$500, Stocks -$160."
4. Drills into category → sees per-asset attribution.

## 12. Security & Access

- **Single-user system** with Supabase Auth. RLS policies ensure data isolation (future-proof if multi-user is ever needed).
- **No API keys on the client.** Price fetching should happen via Supabase Edge Functions (server-side) to avoid exposing any keys and to handle CORS.
- **Data export** always available — user owns their data.

## 13. Data Portability

### 13.1 Export

- Full JSON export of all tables (one click in Settings).
- CSV export of transactions (compatible with generic portfolio tools).
- CSV export of snapshots for spreadsheet analysis.

### 13.2 Import

- CSV transaction import with column mapping UI.
- Bulk initial import: user pastes a table (platform, asset, ticker, balance, avg_cost) and system creates assets + synthetic buy transactions.

## 14. PWA Requirements

- `manifest.json` with app name, icons, theme color.
- Service worker for offline shell caching (app loads offline, data requires network).
- "Add to Home Screen" prompt on mobile.
- Responsive breakpoints: mobile (< 640px), tablet (640–1024px), desktop (> 1024px).

## 15. Future Considerations (Post-MVP)

These are explicitly out of scope for v1 but worth keeping in mind architecturally:

- **Auto-sync with exchanges** via API keys (Binance, IBKR, Paribu APIs).
- **Tax reporting** — realized P&L grouped by tax year, exportable.
- **Goal tracking** — "I want to reach $100K by 2027" with projection lines.
- **Alerts** — "BTC dropped 10% today", "Portfolio hit new ATH".
- **Multiple currencies as base** — show everything in EUR or GBP, not just USD/TRY.
- **Benchmark comparison** — overlay S&P 500, BIST 100, or BTC on performance chart.
- **Recurring investment tracker** — DCA tracking with avg cost visualization.

## 16. MVP Scope Summary

For the initial release, prioritize in this order:

| Priority | Feature | Effort |
|----------|---------|--------|
| P0 | Auth + platform/asset CRUD | S |
| P0 | Transaction logging (buy/sell) | M |
| P0 | Price fetching (TCMB + CoinGecko) | M |
| P0 | Dashboard with total net worth | M |
| P0 | Portfolio page with current values | M |
| P1 | FIFO P&L calculation | L |
| P1 | Monthly snapshots (auto + manual) | M |
| P1 | Performance page with charts | L |
| P1 | Transfer between platforms | M |
| P2 | PWA setup | S |
| P2 | CSV import/export | M |
| P2 | Yahoo Finance for stocks | S |
| P2 | Settings + data management | S |

**Estimated total effort:** 3–5 weeks solo, working evenings/weekends.

## 17. Open Questions

1. **Dividend handling for BIST stocks** — Are dividends received in TRY to bank, or reinvested? This affects which platform the dividend transaction is recorded on.
2. **Physical gold tracking** — When buying/selling physical gold, is the counterparty a jeweler (OTC) or bank? Affects price accuracy.
3. **Staking rewards for crypto** — Should staking rewards be treated as `interest` type transactions? They increase balance but have zero cost basis (taxable event in some jurisdictions).
4. **Base currency preference** — Is USD the primary display currency, or should TRY be default with USD secondary?
5. **Historical backfill** — How far back does the user want to enter transactions? All-time, or start fresh from "today"?