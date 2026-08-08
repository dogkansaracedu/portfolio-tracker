import { bn } from "@/lib/config"
import { isNewAssetSentinel } from "./sentinel"

/** The fields that identify a transaction for import dedup. Fee and notes are
 *  deliberately excluded — fees may have been hand-edited after a prior
 *  import. Dates are day-granularity, so identity is count-based, not
 *  existence-based (see dedupeImportedRows). */
export interface DedupCandidate {
  date: string
  assetId: string
  type: string
  amount: string
  unitPrice: string
  priceCurrency: string
}

/** Normalize a numeric string so "14.50" and "14.5" produce the same key.
 *  Empty/unparseable values collapse to "0" via the shared bn() helper. */
function normNum(raw: string): string {
  return bn(raw.trim()).toString()
}

function dedupKey(c: DedupCandidate): string {
  return [
    c.date,
    c.assetId,
    c.type,
    normNum(c.amount),
    normNum(c.unitPrice),
    c.priceCurrency.trim().toUpperCase(),
  ].join("|")
}

/** Count-based duplicate filter for imported rows.
 *
 *  Transactions are stored at day granularity, so two genuinely distinct
 *  trades can look identical. Instead of "does one exist?", each existing row
 *  consumes ONE matching parsed row: existing 2 + parsed 3 → 1 kept.
 *
 *  Rows whose assetId is an unresolved-asset sentinel (`new:TICKER`) never
 *  match — if the asset isn't in the catalog, no prior transaction can
 *  reference it. */
export function dedupeImportedRows<T extends DedupCandidate>(
  parsed: T[],
  existing: DedupCandidate[],
): { kept: T[]; duplicates: number } {
  const budget = new Map<string, number>()
  for (const e of existing) {
    if (isNewAssetSentinel(e.assetId)) continue
    const key = dedupKey(e)
    budget.set(key, (budget.get(key) ?? 0) + 1)
  }

  const kept: T[] = []
  let duplicates = 0
  for (const p of parsed) {
    const key = dedupKey(p)
    const remaining = isNewAssetSentinel(p.assetId) ? 0 : (budget.get(key) ?? 0)
    if (remaining > 0) {
      budget.set(key, remaining - 1)
      duplicates++
    } else {
      kept.push(p)
    }
  }
  return { kept, duplicates }
}
