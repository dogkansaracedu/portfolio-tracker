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

export interface ForeignIncomeEntry {
  transaction: Transaction
  amountTry: BigNumber
}

/** Income transactions may settle into a cash asset while naming the payer in
 * `related_asset_id`. Use the payer for labels, but keep `asset_id` for the
 * original settlement amount and transaction filtering. */
export function foreignIncomePayerAssetId(transaction: Transaction): string {
  return transaction.related_asset_id ?? transaction.asset_id
}

/** Stable digest of the exact transaction/FX inputs behind a comparison. The
 * total alone is insufficient: two edited rows can cancel out to the same TRY
 * amount and still need a fresh review. */
export function foreignIncomeFingerprint(entries: ForeignIncomeEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => a.transaction.id.localeCompare(b.transaction.id))
    .map(({ transaction, amountTry }) =>
      JSON.stringify([
        transaction.id,
        transaction.date.slice(0, 10),
        transaction.asset_id,
        transaction.related_asset_id,
        transaction.platform_id,
        transaction.type,
        transaction.total_cost,
        transaction.price_currency.toUpperCase(),
        amountTry.toFixed(8),
      ]),
    )
    .join("\n")

  let hash = 14695981039346656037n
  const prime = 1099511628211n
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= BigInt(canonical.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * prime)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}:${entries.length}`
}

/**
 * Asset ids whose dividend/interest is FOREIGN and NOT withheld at source —
 * i.e. the income compared with the configured yearly Turkish declaration
 * threshold. Foreign is proxied as "native currency is not TRY";
 * withheld-at-source assets (a PPF,
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
 * shown against the selected year's configured threshold.
 */
export function computeForeignIncomeTry(
  transactions: Transaction[],
  rates: ExchangeRate[],
  year: number,
  declarableAssetIds: Set<string>,
): BigNumber {
  return foreignIncomeEntries(
    transactions,
    rates,
    year,
    declarableAssetIds,
  ).reduce((sum, entry) => sum.plus(entry.amountTry), BN_ZERO)
}

/** The auditable rows behind {@link computeForeignIncomeTry}. The dashboard
 * only needs their sum; reconciliation needs to show every included payment
 * and its payment-date TRY conversion. */
export function foreignIncomeEntries(
  transactions: Transaction[],
  rates: ExchangeRate[],
  year: number,
  declarableAssetIds: Set<string>,
): ForeignIncomeEntry[] {
  const yearStr = String(year)
  const entries: ForeignIncomeEntry[] = []
  for (const t of transactions) {
    if (t.type !== "dividend" && t.type !== "interest") continue
    if (!declarableAssetIds.has(foreignIncomePayerAssetId(t))) continue
    if (t.date.slice(0, 4) !== yearStr) continue
    entries.push({
      transaction: t,
      amountTry: convertOnDate(
        t.total_cost ?? 0,
        t.price_currency,
        "TRY",
        t.date,
        rates,
      ),
    })
  }
  return entries
}
