import { describe, it, expect } from "vitest"
import { bn } from "@/lib/config"
import {
  buildDailyReturnLookups,
  buildSnapshotLookups,
  enrichAsset,
  groupAssets,
  sortAssets,
} from "@/lib/portfolio/grouping"
import { computeAssetReturnRates } from "@/lib/pnl/assetReturns"
import type {
  Asset,
  PriceCache,
  Transaction,
  TransactionType,
} from "@/types/database"
import type { HoldingWithDetails } from "@/lib/queries/holdings"
import type { AssetPnL } from "@/lib/pnl/types"
import type { EnrichedAsset } from "@/hooks/usePortfolio"

const TODAY = "2026-01-01"

const tx = (
  id: string,
  type: TransactionType,
  date: string,
  totalCost: number,
): Transaction =>
  ({
    id,
    asset_id: "a1",
    platform_id: "p1",
    type,
    date: `${date}T12:00:00Z`,
    amount: 1,
    unit_price: totalCost,
    price_currency: "USD",
    total_cost: totalCost,
    fee: 0,
    fee_currency: null,
    linked_tx_id: null,
  }) as unknown as Transaction

/** Minimal enrichAsset context: no snapshots (live price wins), no daily
 *  baseline, empty P&L map unless given. */
function ctx(opts: {
  txs: Transaction[]
  priceUsd: number
  pnl?: AssetPnL
}) {
  const pnlMap = new Map<string, AssetPnL>()
  if (opts.pnl) pnlMap.set("a1", opts.pnl)
  const holding = {
    asset_id: "a1",
    platform_id: "p1",
    balance: 1,
    platforms: { name: "IBKR", color: "#000" },
  } as unknown as HoldingWithDetails
  return {
    prices: { AAPL: { price_usd: opts.priceUsd } as PriceCache },
    pnlMap,
    holdingsByAsset: new Map([["a1", [holding]]]),
    txByAsset: new Map([["a1", opts.txs]]),
    rates: [],
    today: TODAY,
    snapshotLookups: buildSnapshotLookups([], 0),
    dailyReturnLookups: buildDailyReturnLookups([], [], [], TODAY),
    totalValue: bn(720),
  }
}

const asset = {
  id: "a1",
  name: "Apple",
  ticker: "AAPL",
  category: "stock_us",
  icon_url: null,
  price_id: null,
} as unknown as Asset

describe("enrichAsset total return (money-weighted row headline)", () => {
  it("surfaces value − net invested and the cumulative XIRR %", () => {
    // In 1,000 (2024) — out 600 (2025) — worth 720 today: P&L +320,
    // cumulative MWR ≈ +44% (see assetReturns.test); the old unrealized-style
    // ratio over remaining basis would read far higher — the row must not.
    const row = enrichAsset(
      asset,
      ctx({
        txs: [
          tx("t1", "buy", "2024-01-01", 1000),
          tx("t2", "sell", "2025-01-01", 600),
        ],
        priceUsd: 720,
      }),
    )
    expect(row.totalReturnUsd).toBe(320)
    expect(row.totalReturnPct).toBeCloseTo(44, 0)
    // Untaxed → net % mirrors the gross %.
    expect(row.totalReturnNetPct).toBe(row.totalReturnPct)
  })

  it("taxed asset: net % is the same solve with the accrual off the terminal value", () => {
    const txs = [tx("t1", "buy", "2024-01-01", 1000)]
    const pnl = {
      assetId: "a1",
      taxAccrualUsd: bn(50),
      costBasisUsd: bn(1000),
      unrealizedPnlUsd: bn(200),
      unrealizedPnlPct: bn(20),
      realizedPnlUsd: bn(0),
      costBasisNative: null,
      nativeCurrency: null,
    } as unknown as AssetPnL
    const row = enrichAsset(asset, ctx({ txs, priceUsd: 1200, pnl }))
    const expectedNet = computeAssetReturnRates(txs, [], bn(1150), TODAY)
    expect(row.totalReturnPct).toBeCloseTo(20, 5)
    expect(row.totalReturnNetPct).toBeCloseTo(
      expectedNet.mwrCumulativePct!.toNumber(),
      5,
    )
    expect(row.totalReturnNetPct!).toBeLessThan(row.totalReturnPct!)
  })
})

describe("group rollup and sort use the money-weighted total", () => {
  const enriched = (
    id: string,
    category: string,
    totalReturnUsd: number,
    children?: EnrichedAsset[],
  ): EnrichedAsset =>
    ({
      id,
      ticker: id.toUpperCase(),
      category,
      holdings: [],
      currentValueUsd: 0,
      currentValueTry: 0,
      unrealizedPnlUsd: -999, // sentinel: must NOT reach subtotals or sort
      totalReturnUsd,
      dailyReturnUsd: 0,
      dailyDenomUsd: 0,
      children,
    }) as unknown as EnrichedAsset

  it("group subtotal sums totalReturnUsd, children included", () => {
    const groups = groupAssets(
      "category",
      [enriched("usd", "fiat", 100, [enriched("usdt", "crypto", 25)])],
      [],
      {
        transactions: [],
        rates: [],
        today: TODAY,
        snapshotLookups: buildSnapshotLookups([], 0),
        dailyReturnLookups: buildDailyReturnLookups([], [], [], TODAY),
        totalCurrentValueUsd: bn(0),
      },
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].totalPnlUsd).toBe(125)
  })

  it("sort by pnl orders on totalReturnUsd", () => {
    const rows = sortAssets(
      [enriched("a", "fiat", 10), enriched("b", "fiat", 30)],
      "pnl",
    )
    expect(rows.map((r) => r.id)).toEqual(["b", "a"])
  })
})
