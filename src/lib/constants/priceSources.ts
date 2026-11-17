/**
 * Price sources (Fiyat kaynakları) — the ordered list of places an asset's
 * price is fetched from, edited on the Admin page. Terms per GLOSSARY.md
 * ("Fiyat kaynağı"); every string the editor renders lives here.
 */
import type { PriceSourceKind } from "@/types/database"

export const PRICE_SOURCES_TABLE = "asset_price_sources"

/** The sources fetch-prices knows, in the order the add menu lists them. */
export const PRICE_SOURCE_KINDS: readonly {
  value: PriceSourceKind
  label: string
  /** What the symbol looks like for this source. */
  example: string
}[] = [
  { value: "paribu_crypto", label: "Paribu crypto", example: "btc" },
  { value: "paribu_us", label: "Paribu US", example: "brk.b" },
  { value: "paribu_bist", label: "Paribu BIST", example: "asels" },
  { value: "yahoo", label: "Yahoo Finance", example: "BTC-USD" },
  { value: "tefas", label: "TEFAS", example: "TP2" },
] as const

export const PRICE_SOURCE_KIND_LABELS: Record<PriceSourceKind, string> =
  Object.fromEntries(PRICE_SOURCE_KINDS.map((k) => [k.value, k.label])) as Record<
    PriceSourceKind,
    string
  >

/** The source the add row starts on, by asset category (what Paribu lists
 *  for it, else the classic feed). */
export const DEFAULT_SOURCE_KIND: Partial<Record<string, PriceSourceKind>> = {
  crypto: "paribu_crypto",
  stock_us: "paribu_us",
  stock_bist: "paribu_bist",
  fund: "tefas",
}

/** Assets whose `price_source` has a source list. TCMB (fiat, gram gold) and
 *  manual assets are priced elsewhere and have none. */
export const PRICE_SOURCE_LIST_ASSET_SOURCES = new Set(["yahoo", "tefas"])

/** The DB check on `asset_price_sources.symbol`. */
export const PRICE_SOURCE_SYMBOL_MAX = 32

export const PRICE_SOURCE_COPY = {
  /** GLOSSARY: Fiyat kaynağı (plural on the editor). */
  title: "Fiyat kaynakları",
  menuItem: "Fiyat kaynakları",
  description:
    "Tried top to bottom. If one fails, the next one is used.",
  noList: (feed: string) =>
    `Priced by ${feed}. This asset has no source list.`,
  empty: "No sources yet. Add one below.",
  loadFailed: "Couldn't load the sources.",
  saveFailed: "Couldn't save the sources.",

  source: "Source",
  symbol: "Symbol",
  add: "Add",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",

  /** Health line under each row. */
  lastOk: (age: string) => `OK ${age}`,
  lastError: (age: string) => `Failed ${age}`,
  neverRun: "Not tried yet",
  newRow: "New",

  symbolRequired: "Enter a symbol.",
  symbolTooLong: `Symbol is too long (max ${PRICE_SOURCE_SYMBOL_MAX}).`,
  duplicate: "That source and symbol is already in the list.",
} as const
