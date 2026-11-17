/**
 * Pure helpers for the price-source editor (Admin page): reorder a draft
 * list, validate an added row, turn the draft into the writes that save it,
 * and summarise a row's health. No IO.
 */
import type {
  AssetPriceSource,
  AssetPriceSourceUpsert,
  PriceSourceKind,
} from "@/types/database"
import {
  PRICE_SOURCE_COPY,
  PRICE_SOURCE_LIST_ASSET_SOURCES,
  PRICE_SOURCE_SYMBOL_MAX,
} from "@/lib/constants/priceSources"

/** A row while the editor is open. Existing rows keep their id (and health);
 *  added rows get a client-made id and no health yet. */
export interface SourceDraft {
  id: string
  source: PriceSourceKind
  symbol: string
  last_ok_at: string | null
  last_error: string | null
  last_error_at: string | null
  isNew: boolean
}

/** Whether an asset is priced through a source list (Yahoo/TEFAS assets) —
 *  TCMB and manual assets are not. */
export function hasSourceList(asset: { price_source: string }): boolean {
  return PRICE_SOURCE_LIST_ASSET_SOURCES.has(asset.price_source)
}

/** Stored rows → the editor's draft, in priority order. */
export function toDrafts(rows: AssetPriceSource[]): SourceDraft[] {
  return [...rows]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => ({
      id: r.id,
      source: r.source,
      symbol: r.symbol,
      last_ok_at: r.last_ok_at,
      last_error: r.last_error,
      last_error_at: r.last_error_at,
      isNew: false,
    }))
}

/** Swap a row with its neighbour; out-of-range moves return the list as is. */
export function moveDraft(
  rows: SourceDraft[],
  index: number,
  direction: -1 | 1,
): SourceDraft[] {
  const to = index + direction
  if (index < 0 || index >= rows.length || to < 0 || to >= rows.length) return rows
  const next = [...rows]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** Check a row about to be added. Returns the trimmed symbol, or the error
 *  to show. Mirrors the DB checks (1–32 chars, one row per source + symbol);
 *  the duplicate check ignores case, since sources don't. */
export function validateNewSource(
  rows: SourceDraft[],
  source: PriceSourceKind,
  symbol: string,
): { symbol: string } | { error: string } {
  const trimmed = symbol.trim()
  if (trimmed.length === 0) return { error: PRICE_SOURCE_COPY.symbolRequired }
  if (trimmed.length > PRICE_SOURCE_SYMBOL_MAX) {
    return { error: PRICE_SOURCE_COPY.symbolTooLong }
  }
  const folded = trimmed.toLowerCase()
  if (rows.some((r) => r.source === source && r.symbol.toLowerCase() === folded)) {
    return { error: PRICE_SOURCE_COPY.duplicate }
  }
  return { symbol: trimmed }
}

/**
 * The writes that make the stored list equal the draft: delete the rows the
 * draft dropped, then one upsert of every remaining row with priority =
 * position (1..n). One upsert is one statement, so the deferred
 * (asset_id, priority) uniqueness is checked once, after every row moved.
 */
export function buildSourceSave(
  assetId: string,
  stored: Pick<AssetPriceSource, "id">[],
  drafts: SourceDraft[],
): { deleteIds: string[]; upserts: AssetPriceSourceUpsert[] } {
  const kept = new Set(drafts.map((d) => d.id))
  return {
    deleteIds: stored.map((s) => s.id).filter((id) => !kept.has(id)),
    upserts: drafts.map((d, index) => ({
      id: d.id,
      asset_id: assetId,
      priority: index + 1,
      source: d.source,
      symbol: d.symbol,
    })),
  }
}

export type SourceHealth =
  | { tone: "ok"; at: string }
  | { tone: "error"; at: string; message: string | null }
  | { tone: "none" }

/** The row's latest outcome: whichever of last success / last failure is
 *  newer. */
export function sourceHealth(
  row: Pick<SourceDraft, "last_ok_at" | "last_error" | "last_error_at">,
): SourceHealth {
  const okMs = row.last_ok_at ? new Date(row.last_ok_at).getTime() : null
  const errMs = row.last_error_at ? new Date(row.last_error_at).getTime() : null
  if (errMs != null && (okMs == null || errMs > okMs)) {
    return { tone: "error", at: row.last_error_at!, message: row.last_error }
  }
  if (okMs != null) return { tone: "ok", at: row.last_ok_at! }
  return { tone: "none" }
}
