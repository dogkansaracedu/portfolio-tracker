/**
 * Pure helpers for the `widget-data` edge function (the Android home-screen
 * widget feed). No IO and no Deno globals, so Vitest imports this module too
 * (`src/lib/queries/widget.test.ts`).
 */

/** A price row older than this shows as stale on the widget. Mirrors the app's
 *  `isStale` default (30 min, `src/lib/prices.ts`) — separate runtime. */
export const WIDGET_STALE_MS = 30 * 60 * 1000

/** Physical gram gold is quoted in TRY. Mirrors `PHYSICAL_GOLD_TICKER`. */
const PHYSICAL_GOLD_TICKER = "XAU_GRAM"

export type QuoteCurrency = "USD" | "TRY"

/**
 * The currency the app shows an asset's unit price in: TRY for TRY-native
 * assets (BIST stocks, funds, physical gold, TRY cash), USD for everything else
 * (the price cache has only USD + TRY columns, so EUR falls back to USD). Mirrors
 * `assetNativeCurrency` (`src/lib/constants/assets.ts`) + the portfolio row's
 * `CurrentPrice` fallback — separate runtime, keep in sync.
 */
export function quoteCurrency(asset: { category: string; ticker: string }): QuoteCurrency {
  if (asset.category === "fiat") return asset.ticker === "TRY" ? "TRY" : "USD"
  if (asset.category === "stock_bist" || asset.category === "fund") return "TRY"
  if (asset.category === "gold" && asset.ticker === PHYSICAL_GOLD_TICKER) return "TRY"
  return "USD"
}

/** One unit price in both columns. */
export interface UnitPrice {
  usd: number
  try: number
}

/** The slice of a snapshot `breakdown` this module reads. */
export interface BaselineBreakdown {
  rates?: { usd_try?: number | null } | null
  by_asset?: Array<{
    ticker: string
    amount?: number | null
    price_usd?: number | null
    value_try?: number | null
  }> | null
}

/**
 * Per-ticker unit prices frozen in a snapshot (the previous day's baseline).
 * TRY comes from the entry's own `value_try ÷ amount` (exact — it is what the
 * writer booked), falling back to `price_usd × rates.usd_try`. Entries without a
 * positive price are skipped, so the ticker has no baseline.
 */
export function baselinePrices(breakdown: BaselineBreakdown | null | undefined): Map<string, UnitPrice> {
  const out = new Map<string, UnitPrice>()
  const usdTry = breakdown?.rates?.usd_try ?? null
  for (const a of breakdown?.by_asset ?? []) {
    if (out.has(a.ticker)) continue
    const usd = a.price_usd ?? 0
    if (!(usd > 0)) continue
    const amount = a.amount ?? 0
    const tryPrice =
      amount > 0 && a.value_try != null && a.value_try > 0
        ? a.value_try / amount
        : usdTry
          ? usd * usdTry
          : null
    if (tryPrice == null || !(tryPrice > 0)) continue
    out.set(a.ticker, { usd, try: tryPrice })
  }
  return out
}

/** Percent move from `prev` to `now`; null without a positive baseline. */
export function pctChange(now: number, prev: number | null | undefined): number | null {
  if (prev == null || !(prev > 0)) return null
  return ((now - prev) / prev) * 100
}

export interface ChangeInput {
  quantity: number
  /** Current unit price in TRY. */
  nowTry: number
  /** Previous-day unit price in TRY; null = no baseline (excluded). */
  prevTry: number | null
}

/**
 * Today's change from price moves only (no deposits/withdrawals):
 *   changeTry = Σ quantity × (nowTry − prevTry)
 *   changePct = changeTry ÷ Σ quantity × prevTry × 100
 * over the positions that have a baseline. Both null when none does.
 */
export function computeTodayChange(
  positions: ChangeInput[],
): { changeTry: number | null; changePct: number | null } {
  let change = 0
  let base = 0
  let counted = 0
  for (const p of positions) {
    if (p.prevTry == null || !(p.prevTry > 0) || !(p.quantity > 0)) continue
    change += p.quantity * (p.nowTry - p.prevTry)
    base += p.quantity * p.prevTry
    counted++
  }
  if (counted === 0 || !(base > 0)) return { changeTry: null, changePct: null }
  return { changeTry: change, changePct: (change / base) * 100 }
}

export interface WidgetHolding {
  balance: number
  asset: {
    ticker: string
    price_id: string | null
    name: string
    category: string
  }
}

export interface WidgetPriceRow {
  price_usd: number | null
  price_try: number | null
  updated_at: string | null
}

export interface WidgetAsset {
  ticker: string
  name: string
  price: number | null
  priceCurrency: QuoteCurrency
  changePct: number | null
  valueTry: number
  updatedAt: string | null
  stale: boolean
}

/**
 * Held assets for the widget: balances summed across platforms (only
 * quantity > 0), valued at the cached price (stale prices still count — the
 * app's rule), sorted by TRY value desc. Also returns the inputs for
 * `computeTodayChange`.
 */
export function buildWidgetAssets(
  holdings: WidgetHolding[],
  prices: Record<string, WidgetPriceRow>,
  baseline: Map<string, UnitPrice>,
  usdTry: number | null,
  nowMs: number,
): { assets: WidgetAsset[]; positions: ChangeInput[] } {
  const byTicker = new Map<string, { holding: WidgetHolding; quantity: number }>()
  for (const h of holdings) {
    const entry = byTicker.get(h.asset.ticker)
    if (entry) entry.quantity += h.balance
    else byTicker.set(h.asset.ticker, { holding: h, quantity: h.balance })
  }

  const assets: WidgetAsset[] = []
  const positions: ChangeInput[] = []
  for (const { holding, quantity } of byTicker.values()) {
    if (!(quantity > 0)) continue
    const a = holding.asset
    const row = prices[a.price_id ?? a.ticker]
    const usd = row?.price_usd ?? null
    const tryPrice = row?.price_try ?? (usd != null && usdTry ? usd * usdTry : null)
    const currency = quoteCurrency(a)
    const price = currency === "TRY" ? tryPrice : usd
    const prev = baseline.get(a.ticker)
    const updatedAt = row?.updated_at ?? null

    assets.push({
      ticker: a.ticker,
      name: a.name,
      price,
      priceCurrency: currency,
      changePct: price == null || !prev ? null : pctChange(price, currency === "TRY" ? prev.try : prev.usd),
      valueTry: tryPrice == null ? 0 : quantity * tryPrice,
      updatedAt,
      stale: updatedAt == null || nowMs - new Date(updatedAt).getTime() > WIDGET_STALE_MS,
    })
    if (tryPrice != null) positions.push({ quantity, nowTry: tryPrice, prevTry: prev?.try ?? null })
  }

  assets.sort((x, y) => y.valueTry - x.valueTry)
  return { assets, positions }
}

/** Newest `updated_at` (ms) among the prices of the given holdings; 0 if none.
 *  Drives the widget's "ask for a refresh?" check. */
export function newestHeldUpdateMs(
  holdings: WidgetHolding[],
  prices: Record<string, WidgetPriceRow>,
): number {
  let newest = 0
  for (const h of holdings) {
    const at = prices[h.asset.price_id ?? h.asset.ticker]?.updated_at
    if (at) newest = Math.max(newest, new Date(at).getTime())
  }
  return newest
}

export interface TotalCandidate {
  at: string
  totalUsd: number
  totalTry: number
}

/** The newer of the latest intraday (hourly) and latest daily snapshot. */
export function pickLatestTotal(
  intraday: TotalCandidate | null,
  daily: TotalCandidate | null,
): TotalCandidate | null {
  if (!intraday) return daily
  if (!daily) return intraday
  return new Date(intraday.at).getTime() >= new Date(daily.at).getTime() ? intraday : daily
}
