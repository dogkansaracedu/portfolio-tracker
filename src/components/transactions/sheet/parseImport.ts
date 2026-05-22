import Papa from "papaparse"
import { DEFAULT_CURRENCY, SUPPORTED_FIAT_CURRENCIES } from "@/lib/constants/currencies"
import { USER_PICKABLE_TYPES } from "@/lib/constants/transaction-types"
import type { Asset, Platform, TransactionType } from "@/types/database"

/** A parsed-but-not-yet-committed row. Unknown fields stay empty; the user
 *  fills them in the grid before Save. */
export interface ParsedRow {
  date: string
  assetId: string
  platformId: string
  type: TransactionType
  amount: string
  unitPrice: string
  priceCurrency: string
  fee: string
  notes: string
}

export interface ParseSummary {
  rows: ParsedRow[]
  unresolvedAssets: string[]
  unresolvedPlatforms: string[]
  skipped: number
  errors: string[]
}

/** Header aliases — case-insensitive. First match wins. */
const HEADER_ALIASES: Record<keyof ParsedRow, string[]> = {
  date: ["date", "tarih", "trade date", "transaction date"],
  assetId: ["asset", "ticker", "symbol", "sembol", "name"],
  platformId: ["platform", "account", "exchange", "broker", "hesap"],
  type: ["type", "action", "side", "tip", "işlem"],
  amount: ["amount", "quantity", "qty", "shares", "miktar", "adet"],
  unitPrice: ["unit price", "price", "cost", "fiyat", "birim fiyat"],
  priceCurrency: ["currency", "price currency", "cur", "para birimi"],
  fee: ["fee", "commission", "komisyon"],
  notes: ["notes", "note", "memo", "açıklama", "description"],
}

const TYPE_ALIASES: Record<string, TransactionType> = {
  buy: "buy",
  bought: "buy",
  purchase: "buy",
  alış: "buy",
  alis: "buy",
  sell: "sell",
  sold: "sell",
  satış: "sell",
  satis: "sell",
  transfer_in: "transfer_in",
  "transfer in": "transfer_in",
  deposit: "transfer_in",
  transfer_out: "transfer_out",
  "transfer out": "transfer_out",
  withdrawal: "transfer_out",
  withdraw: "transfer_out",
  dividend: "dividend",
  div: "dividend",
  temettü: "dividend",
  temettu: "dividend",
  interest: "interest",
  faiz: "interest",
  fee: "fee",
}

function indexHeaders(headers: string[]): Partial<Record<keyof ParsedRow, number>> {
  const map: Partial<Record<keyof ParsedRow, number>> = {}
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ParsedRow, string[]][]) {
    for (const alias of aliases) {
      const idx = lower.indexOf(alias)
      if (idx !== -1) {
        map[field] = idx
        break
      }
    }
  }
  return map
}

/** Normalize date strings to ISO `YYYY-MM-DD`. Accepts:
 *  - ISO already
 *  - `YYYY/MM/DD`, `DD.MM.YYYY` (TR locale), `MM/DD/YYYY` (US locale, ambiguous → flagged) */
function normalizeDate(raw: string): string {
  const s = raw.trim()
  if (!s) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // YYYY/MM/DD or YYYY.MM.DD
  let m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  // DD.MM.YYYY or DD/MM/YYYY (Turkish locale default)
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) {
    const day = m[1].padStart(2, "0")
    const month = m[2].padStart(2, "0")
    return `${m[3]}-${month}-${day}`
  }
  // Fallback: let Date parse it; if it works, format as ISO.
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${y}-${mm}-${dd}`
  }
  return ""
}

function normalizeNumber(raw: string): string {
  if (!raw) return ""
  // Strip spaces and currency symbols. Keep digits, comma, period, minus.
  let s = raw.replace(/[^\d.,-]/g, "")
  // If both comma and dot appear, assume the last one is the decimal mark.
  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // 1.234,56 → 1234.56
      s = s.replace(/\./g, "").replace(",", ".")
    } else {
      // 1,234.56 → 1234.56
      s = s.replace(/,/g, "")
    }
  } else if (lastComma !== -1) {
    // Single comma — treat as decimal mark (Turkish locale).
    s = s.replace(",", ".")
  }
  return s
}

function normalizeType(raw: string): TransactionType | null {
  const key = raw.trim().toLowerCase()
  const found = TYPE_ALIASES[key]
  if (found) return found
  // Some Excel sheets use exact internal value already.
  if ((USER_PICKABLE_TYPES as readonly string[]).includes(key)) {
    return key as TransactionType
  }
  return null
}

function normalizeCurrency(raw: string): string {
  const upper = raw.trim().toUpperCase()
  if ((SUPPORTED_FIAT_CURRENCIES as readonly string[]).includes(upper)) return upper
  // Common symbol mappings
  if (raw.includes("$")) return "USD"
  if (raw.includes("₺") || /\btl\b/i.test(raw)) return "TRY"
  if (raw.includes("€")) return "EUR"
  return ""
}

/** Returns true if the header row looks like actual column names rather than
 *  data. Heuristic: at least 2 cells match a known header alias. */
function looksLikeHeader(cells: string[]): boolean {
  const lower = cells.map((c) => c.trim().toLowerCase())
  let matches = 0
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (lower.some((c) => aliases.includes(c))) matches++
  }
  return matches >= 2
}

interface ParseOptions {
  /** When set, parsed rows that don't specify an asset use this id. */
  lockedAssetId?: string
}

/** Parse pasted TSV/CSV text into structured rows. */
export function parseClipboard(
  text: string,
  assets: Asset[],
  platforms: Platform[],
  opts: ParseOptions = {},
): ParseSummary {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      rows: [],
      unresolvedAssets: [],
      unresolvedPlatforms: [],
      skipped: 0,
      errors: ["Nothing to parse"],
    }
  }

  // papaparse auto-detects delimiter; explicit "" lets it sniff. We pass
  // header:false to keep the first-row-detection logic ours.
  const result = Papa.parse<string[]>(trimmed, {
    header: false,
    skipEmptyLines: true,
    delimiter: "", // auto-sniff (Excel pastes use \t)
  })

  if (result.errors.length > 0 && result.data.length === 0) {
    return {
      rows: [],
      unresolvedAssets: [],
      unresolvedPlatforms: [],
      skipped: 0,
      errors: result.errors.map((e) => e.message),
    }
  }

  const all = result.data as string[][]
  let headerMap: Partial<Record<keyof ParsedRow, number>> = {}
  let dataStart = 0

  if (all.length > 0 && looksLikeHeader(all[0])) {
    headerMap = indexHeaders(all[0])
    dataStart = 1
  } else {
    // Positional fallback: assume Date | Ticker | Platform | Type | Amount | UnitPrice | Currency | Fee | Notes
    headerMap = {
      date: 0,
      assetId: 1,
      platformId: 2,
      type: 3,
      amount: 4,
      unitPrice: 5,
      priceCurrency: 6,
      fee: 7,
      notes: 8,
    }
  }

  const tickerLookup = new Map<string, string>()
  for (const a of assets) {
    tickerLookup.set(a.ticker.toLowerCase(), a.id)
    tickerLookup.set(a.name.toLowerCase(), a.id)
  }
  const platformLookup = new Map<string, string>()
  for (const p of platforms) {
    platformLookup.set(p.name.toLowerCase(), p.id)
  }

  const rows: ParsedRow[] = []
  const unresolvedAssets = new Set<string>()
  const unresolvedPlatforms = new Set<string>()
  let skipped = 0
  const errors: string[] = []

  for (let i = dataStart; i < all.length; i++) {
    const cells = all[i]
    const get = (field: keyof ParsedRow): string => {
      const idx = headerMap[field]
      if (idx === undefined) return ""
      return (cells[idx] ?? "").trim()
    }

    const dateRaw = get("date")
    const typeRaw = get("type")
    const amountRaw = get("amount")

    // Skip rows that look empty.
    if (!dateRaw && !amountRaw && !typeRaw) {
      skipped++
      continue
    }

    const date = normalizeDate(dateRaw)
    const type = normalizeType(typeRaw) ?? "buy"

    const tickerRaw = get("assetId")
    let assetId = ""
    if (opts.lockedAssetId) {
      assetId = opts.lockedAssetId
    } else if (tickerRaw) {
      const hit = tickerLookup.get(tickerRaw.toLowerCase())
      if (hit) assetId = hit
      else unresolvedAssets.add(tickerRaw)
    }

    const platformRaw = get("platformId")
    let platformId = ""
    if (platformRaw) {
      const hit = platformLookup.get(platformRaw.toLowerCase())
      if (hit) platformId = hit
      else unresolvedPlatforms.add(platformRaw)
    }

    const currency = normalizeCurrency(get("priceCurrency")) || DEFAULT_CURRENCY

    rows.push({
      date,
      assetId,
      platformId,
      type,
      amount: normalizeNumber(amountRaw),
      unitPrice: normalizeNumber(get("unitPrice")),
      priceCurrency: currency,
      fee: normalizeNumber(get("fee")),
      notes: get("notes"),
    })
  }

  return {
    rows,
    unresolvedAssets: Array.from(unresolvedAssets),
    unresolvedPlatforms: Array.from(unresolvedPlatforms),
    skipped,
    errors,
  }
}
