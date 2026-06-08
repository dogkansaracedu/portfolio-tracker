import type {
  Transaction,
  TransactionType,
  PriceCache,
  ExchangeRate,
  Snapshot,
} from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"

/**
 * Test fixtures for the P&L engine. Not a `*.test.ts` file, so Vitest won't
 * collect it as a suite — it's a helper imported by the case files so each case
 * reads like the worked numbers in `docs/pnl-test-cases.md`.
 */

let seq = 0

/** Build a Transaction with sane defaults; override any field. */
export function tx(
  partial: Partial<Transaction> & { type: TransactionType },
): Transaction {
  seq += 1
  const amount = partial.amount ?? 0
  const unit_price = partial.unit_price ?? 0
  return {
    id: partial.id ?? `tx-${seq}`,
    user_id: "u",
    asset_id: "asset",
    platform_id: "platform",
    date: partial.date ?? `2026-01-${String((seq % 28) + 1).padStart(2, "0")}`,
    amount,
    unit_price,
    price_currency: "USD",
    total_cost: amount * unit_price,
    fee: 0,
    fee_currency: null,
    related_asset_id: null,
    linked_tx_id: null,
    notes: null,
    created_at: "2026-01-01",
    ...partial,
  }
}

/** buy `amount` units at `price`/unit (USD). total_cost = amount × price. */
export const buy = (
  amount: number,
  price: number,
  opts: Partial<Transaction> = {},
) => tx({ type: "buy", amount, unit_price: price, ...opts })

/** sell `amount` units at `price`/unit (USD). */
export const sell = (
  amount: number,
  price: number,
  opts: Partial<Transaction> = {},
) => tx({ type: "sell", amount, unit_price: price, ...opts })

/** transfer_in (opening balance / carried cost basis). */
export const transferIn = (
  amount: number,
  price: number,
  opts: Partial<Transaction> = {},
) => tx({ type: "transfer_in", amount, unit_price: price, ...opts })

/** transfer_out (withdrawal). */
export const transferOut = (
  amount: number,
  price: number,
  opts: Partial<Transaction> = {},
) => tx({ type: "transfer_out", amount, unit_price: price, ...opts })

/** cash_credit — the sell-side paired cash entry (proceeds stay on platform). */
export const cashCredit = (amount: number, opts: Partial<Transaction> = {}) =>
  tx({ type: "cash_credit", amount, unit_price: 1, ...opts })

/** cash_debit — the buy-side paired cash entry. */
export const cashDebit = (amount: number, opts: Partial<Transaction> = {}) =>
  tx({ type: "cash_debit", amount, unit_price: 1, ...opts })

/** dividend received as units (Mode A): adds a lot at market, income at total. */
export const dividendUnits = (
  amount: number,
  price: number,
  opts: Partial<Transaction> = {},
) => tx({ type: "dividend", amount, unit_price: price, ...opts })

/** interest received as cash (Mode B): credits a fiat balance, unit_price 1. */
export const interestCash = (amount: number, opts: Partial<Transaction> = {}) =>
  tx({ type: "interest", amount, unit_price: 1, ...opts })

/** dividend received as cash (Mode B): credits a fiat balance, unit_price 1. */
export const dividendCash = (amount: number, opts: Partial<Transaction> = {}) =>
  tx({ type: "dividend", amount, unit_price: 1, ...opts })

/**
 * A holding row (post-balance.ts). `balance` is the net units held; tests pass
 * what the transactions imply. asset_id/platform_id default to the tx fixtures'
 * defaults so a single-asset case lines up by key.
 */
export function holding(opts: {
  balance: number
  ticker?: string
  category?: string
  isCurrency?: boolean
  assetId?: string
  platformId?: string
  priceId?: string | null
  atSourceTaxRate?: number | null
}): HoldingWithDetails {
  const ticker = opts.ticker ?? "ASSET"
  return {
    id: `holding-${opts.assetId ?? "asset"}`,
    user_id: "u",
    asset_id: opts.assetId ?? "asset",
    platform_id: opts.platformId ?? "platform",
    balance: opts.balance,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    assets: {
      name: ticker,
      ticker,
      price_id: opts.priceId ?? null,
      category: opts.category ?? "crypto",
      tags: [],
      is_currency: opts.isCurrency ?? false,
      is_active: true,
      at_source_tax_rate: opts.atSourceTaxRate ?? null,
    },
    platforms: { name: "Platform", color: "#000000" },
  }
}

/** price_cache map keyed by ticker → current USD price. */
export function prices(map: Record<string, number>): Record<string, PriceCache> {
  const out: Record<string, PriceCache> = {}
  for (const [ticker, price_usd] of Object.entries(map)) {
    out[ticker] = {
      ticker,
      price_usd,
      price_try: null,
      source: "test",
      updated_at: "2026-01-01",
    }
  }
  return out
}

/** price_cache map carrying both USD and native-TRY unit prices (for funds
 *  whose at-source tax is computed on the native TRY gain). */
export function pricesWithTry(
  map: Record<string, { usd: number; try: number }>,
): Record<string, PriceCache> {
  const out: Record<string, PriceCache> = {}
  for (const [ticker, { usd, try: tryPrice }] of Object.entries(map)) {
    out[ticker] = {
      ticker,
      price_usd: usd,
      price_try: tryPrice,
      source: "test",
      updated_at: "2026-01-01",
    }
  }
  return out
}

/** A snapshot row with a minimal by_asset breakdown (date is local, per homeDayIso). */
export function snapshot(
  date: string,
  byAsset: Array<{
    ticker: string
    platform?: string
    value_usd: number
    price_usd?: number
    amount?: number
  }>,
): Snapshot {
  return {
    id: `snap-${date}`,
    user_id: "u",
    snapshot_date: date,
    total_usd: byAsset.reduce((s, e) => s + e.value_usd, 0),
    total_try: null,
    breakdown: {
      rates: { usd_try: 0, eur_try: 0, gold_gram_try: 0 },
      by_category: {},
      by_platform: {},
      by_tag: {},
      by_asset: byAsset.map((e) => ({
        ticker: e.ticker,
        name: e.ticker,
        platform: e.platform ?? "Platform",
        amount: e.amount ?? 0,
        price_usd: e.price_usd ?? 0,
        value_usd: e.value_usd,
        value_try: 0,
      })),
    },
    created_at: `${date}T00:00:00Z`,
  }
}

/** An exchange-rate row for a date; unset legs stay null. */
export function rate(date: string, vals: Partial<ExchangeRate>): ExchangeRate {
  return {
    date,
    source: "test",
    usd_try: null,
    eur_try: null,
    eur_usd: null,
    gold_gram_try: null,
    ...vals,
  }
}
