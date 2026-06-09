import { assetNativeCurrency, isStablecoin } from "@/lib/constants/assets"
import type { Asset, SnapshotBreakdown } from "@/types/database"

/**
 * One slice of the allocation donut. Top-level nodes are asset categories
 * (`fiat`, `stock_us`, …) or, for an unresolved ticker, the ticker itself. The
 * `fiat` node alone carries `children`: its per-currency split (TRY incl. PPF
 * funds, USD, EUR, USDC, USDT). Funds and USD-pegged stablecoins roll up under
 * `fiat` as cash-equivalents rather than standing alone, mirroring the Portfolio
 * table's nesting (lib/portfolio/grouping.ts → nestCashEquivalentsUnderFiat).
 */
export interface AllocationNode {
  /** Category key (`fiat`/`crypto`/…) for top-level nodes; currency code
   *  (`TRY`/`USD`/…) for the fiat node's children. */
  key: string
  valueUsd: number
  valueTry: number
  percentage: number
  /** Present only on the `fiat` node: its per-currency breakdown. */
  children?: AllocationNode[]
}

/** The allocation donut collapses every cash-equivalent into one `fiat` parent:
 *  real fiat cash, PPF funds, and USD-pegged stablecoins all count as "fiat",
 *  split by currency underneath. Single source for that rule. */
const FIAT_ALLOCATION_KEY = "fiat"

function isFiatAllocation(asset: Asset): boolean {
  return (
    asset.category === "fiat" || asset.category === "fund" || isStablecoin(asset)
  )
}

/** Currency bucket for a fiat-allocation asset: stablecoins keep their own
 *  ticker (USDC/USDT shown distinctly), while cash and funds fold into their
 *  native currency (a TRY money-market fund merges into the TRY bucket). */
function fiatCurrencyKey(asset: Asset): string {
  if (isStablecoin(asset)) return asset.ticker.toUpperCase()
  return assetNativeCurrency(asset)
}

/**
 * Allocation slices for the donut, re-derived from the snapshot's per-asset
 * values — NOT from `breakdown.by_category`, which is a flat category split that
 * lists `fund` separately and counts stablecoins under `crypto`. Here cash, PPF
 * funds, and stablecoins collapse into one `fiat` node with a per-currency
 * `children` breakdown, so stablecoins leave the `crypto` total automatically.
 *
 * Same ticker→asset join as deriveByCurrency / deriveTopMovers; plain `number`
 * math (render-only aggregation of already-computed snapshot floats). An unknown
 * ticker falls back to a top-level slice keyed by the ticker so nothing silently
 * disappears. Top-level nodes and fiat children are each sorted by USD value
 * desc.
 */
export function deriveAllocationSlices(
  byAsset: SnapshotBreakdown["by_asset"],
  assets: Asset[],
  totalValueUsd: number,
): AllocationNode[] {
  const assetByTicker = new Map<string, Asset>()
  for (const a of assets) assetByTicker.set(a.ticker, a)

  const top = new Map<string, { usd: number; try: number }>()
  const fiatChildren = new Map<string, { usd: number; try: number }>()
  const add = (
    m: Map<string, { usd: number; try: number }>,
    key: string,
    usd: number,
    tryVal: number,
  ) => {
    const cur = m.get(key) ?? { usd: 0, try: 0 }
    cur.usd += usd
    cur.try += tryVal
    m.set(key, cur)
  }

  for (const e of byAsset) {
    const asset = assetByTicker.get(e.ticker)
    if (asset && isFiatAllocation(asset)) {
      add(top, FIAT_ALLOCATION_KEY, e.value_usd, e.value_try)
      add(fiatChildren, fiatCurrencyKey(asset), e.value_usd, e.value_try)
    } else {
      add(top, asset ? asset.category : e.ticker, e.value_usd, e.value_try)
    }
  }

  const pct = (usd: number) =>
    totalValueUsd > 0 ? (usd / totalValueUsd) * 100 : 0
  const byUsdDesc = (a: AllocationNode, b: AllocationNode) =>
    b.valueUsd - a.valueUsd

  return [...top.entries()]
    .map(([key, v]): AllocationNode => {
      const node: AllocationNode = {
        key,
        valueUsd: v.usd,
        valueTry: v.try,
        percentage: pct(v.usd),
      }
      if (key === FIAT_ALLOCATION_KEY) {
        node.children = [...fiatChildren.entries()]
          .map(([ck, cv]) => ({
            key: ck,
            valueUsd: cv.usd,
            valueTry: cv.try,
            percentage: pct(cv.usd),
          }))
          .sort(byUsdDesc)
      }
      return node
    })
    .sort(byUsdDesc)
}
