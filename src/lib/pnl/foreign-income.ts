import type BigNumber from "bignumber.js"
import type { Transaction, ExchangeRate } from "@/types/database"
import { BN_ZERO } from "@/lib/config"
import { convertOnDate } from "@/lib/pnl/currency"
import { assetNativeCurrency } from "@/lib/constants/assets"

/** Minimal asset shape needed to classify foreign-declarable income. */
type ClassifiableAsset = {
  id: string
  category: string
  ticker: string
  at_source_tax_rate: number | null
}

/**
 * Asset ids whose dividend/interest is FOREIGN and NOT withheld at source —
 * i.e. the income that feeds the Turkish 22k declaration threshold. Foreign is
 * proxied as "native currency is not TRY"; withheld-at-source assets (a PPF,
 * with at_source_tax_rate) are excluded because their tax is already taken.
 */
export function foreignDeclarableAssetIds(
  assets: ClassifiableAsset[],
): Set<string> {
  const ids = new Set<string>()
  for (const a of assets) {
    const foreign = assetNativeCurrency(a) !== "TRY"
    const withheld = a.at_source_tax_rate != null
    if (foreign && !withheld) ids.add(a.id)
  }
  return ids
}

/**
 * Sum of dividend + interest from declarable assets, converted to TRY at each
 * transaction's own date, for a single calendar (tax) year. This is the figure
 * shown against the 22,000 TL threshold.
 */
export function computeForeignIncomeTry(
  transactions: Transaction[],
  rates: ExchangeRate[],
  year: number,
  declarableAssetIds: Set<string>,
): BigNumber {
  const yearStr = String(year)
  let sum = BN_ZERO
  for (const t of transactions) {
    if (t.type !== "dividend" && t.type !== "interest") continue
    if (!declarableAssetIds.has(t.asset_id)) continue
    if (t.date.slice(0, 4) !== yearStr) continue
    sum = sum.plus(
      convertOnDate(t.total_cost ?? 0, t.price_currency, "TRY", t.date, rates),
    )
  }
  return sum
}
