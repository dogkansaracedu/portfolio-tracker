import type { Asset, Platform, TransactionType } from "@/types/database"
import { bn } from "@/lib/config"
import { loadPdfjs } from "@/lib/pdf/loadPdfjs"
import { MIDAS_PLATFORM_NAME } from "@/lib/constants/brokers"
import { FIAT_ASSET_CATEGORY } from "@/lib/constants/assets"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"
import {
  MIDAS_HEADER_ALIASES,
  MIDAS_EXECUTED_STATUS,
  MIDAS_TYPE_MAP,
  MIDAS_ACCOUNT_TYPE_MAP,
  MIDAS_OTHER_INCOME_TYPE,
  MIDAS_INTEREST_DESCRIPTION_TOKEN,
  MIDAS_SECURITY_TICKER_SEPARATOR,
  midasDividendNote,
  type MidasHeaderField,
  type MidasTableKind,
} from "@/lib/constants/midas-pdf"
import type { ParsedRow, ParseSummary } from "./parseImport"
import { canonicalizeTicker } from "@/lib/priceId"
import { makeNewAssetSentinel } from "./sentinel"

const ROW_Y_TOLERANCE = 2
const PHRASE_GAP_X = 4

/** Cash-side rows (deposits, withdrawals, interest, cash dividends) sit on the
 *  fiat asset, where one unit *is* one of the currency. */
const CASH_UNIT_PRICE = "1"

interface TextFragment {
  str: string
  x: number
  y: number
  width: number
}

interface Phrase {
  str: string
  x: number
}

interface HeaderLayout {
  /** Which of the statement's tables this header opens. */
  kind: MidasTableKind
  /** Each entry: the field this column carries, and the x at which its
   *  leftmost token starts. Ordered left-to-right. */
  columns: { field: MidasHeaderField; xStart: number }[]
}

type MidasCells = Partial<Record<MidasHeaderField, string>>

/** A canonicalized header string → field key. Built once at module load.
 *  Each field can have multiple accepted labels (e.g. "Emir Adet" / "Emir
 *  Adedi") — see {@link MIDAS_HEADER_ALIASES}. */
const HEADER_LOOKUP: Map<string, MidasHeaderField> = (() => {
  const m = new Map<string, MidasHeaderField>()
  for (const field of Object.keys(MIDAS_HEADER_ALIASES) as MidasHeaderField[]) {
    for (const label of MIDAS_HEADER_ALIASES[field]) {
      m.set(canon(label), field)
    }
  }
  return m
})()

function canon(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

function parseDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s|$)/)
  if (!m) return null
  const day = m[1].padStart(2, "0")
  const month = m[2].padStart(2, "0")
  const year = `20${m[3]}`
  return `${year}-${month}-${day}`
}

function normalizeNumber(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === "-") return ""
  let s = trimmed.replace(/[^\d.,-]/g, "")
  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".")
    } else {
      s = s.replace(/,/g, "")
    }
  } else if (lastComma !== -1) {
    s = s.replace(",", ".")
  }
  return s
}

/** Cash cells carry their own currency code ("2000,00 USD") — the cash tables
 *  have no separate Para Birimi column. */
function splitAmountCurrency(raw: string): { amount: string; currency: string } {
  const trimmed = raw.trim()
  const m = trimmed.match(/([A-Za-z]{3})\s*$/)
  if (!m) return { amount: normalizeNumber(trimmed), currency: "" }
  return {
    amount: normalizeNumber(trimmed.slice(0, m.index)),
    currency: m[1].toUpperCase(),
  }
}

function groupFragmentsIntoRows(fragments: TextFragment[]): TextFragment[][] {
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextFragment[][] = []
  for (const frag of sorted) {
    const current = rows[rows.length - 1]
    if (current && Math.abs(current[0].y - frag.y) <= ROW_Y_TOLERANCE) {
      current.push(frag)
    } else {
      rows.push([frag])
    }
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x)
  return rows
}

function mergeIntoPhrases(row: TextFragment[]): Phrase[] {
  const phrases: Phrase[] = []
  for (let i = 0; i < row.length; i++) {
    const frag = row[i]
    if (i === 0) {
      phrases.push({ str: frag.str, x: frag.x })
      continue
    }
    const last = phrases[phrases.length - 1]
    const prev = row[i - 1]
    const gap = frag.x - (prev.x + prev.width)
    if (gap <= PHRASE_GAP_X) {
      last.str =
        last.str.endsWith(" ") || frag.str.startsWith(" ")
          ? `${last.str}${frag.str}`
          : `${last.str}${gap > 0 ? " " : ""}${frag.str}`
    } else {
      phrases.push({ str: frag.str, x: frag.x })
    }
  }
  return phrases.map((p) => ({ str: p.str.replace(/\s+/g, " ").trim(), x: p.x }))
}

/** Which table a header row opens, from the set of fields it matched. Each
 *  table is identified by a pair of columns unique to it. */
function classifyHeaderFields(
  fields: Set<MidasHeaderField>,
): MidasTableKind | null {
  if (fields.has("TARIH") && fields.has("SEMBOL")) return "trade"
  if (fields.has("ISLEM_TARIHI") && fields.has("TUTAR_YP")) return "account"
  if (fields.has("ODEME_TARIHI") && fields.has("NET_TEMETTU")) return "dividend"
  return null
}

/** Table kind for a list of raw header labels. Exported for tests; the
 *  geometry path goes through {@link detectHeader}. */
export function headerKindForLabels(labels: string[]): MidasTableKind | null {
  const fields = new Set<MidasHeaderField>()
  for (const label of labels) {
    const field = HEADER_LOOKUP.get(canon(label))
    if (field) fields.add(field)
  }
  return classifyHeaderFields(fields)
}

function detectHeader(rowPhrases: Phrase[]): HeaderLayout | null {
  const matches: { field: MidasHeaderField; xStart: number }[] = []
  for (const phrase of rowPhrases) {
    const field = HEADER_LOOKUP.get(canon(phrase.str))
    if (field) matches.push({ field, xStart: phrase.x })
  }
  const kind = classifyHeaderFields(new Set(matches.map((m) => m.field)))
  if (!kind) return null
  matches.sort((a, b) => a.xStart - b.xStart)
  return { kind, columns: matches }
}

/** Compute the right-edge x-bound of each column: midpoint to the next
 *  column's xStart, or +∞ for the last column. Using midpoints (not the next
 *  column's xStart directly) tolerates the common case where the data text
 *  in column N+1 starts a few pixels LEFT of where the column N+1 header
 *  text starts — which would otherwise dump the data into column N. */
function columnRightBounds(layout: HeaderLayout): number[] {
  const cols = layout.columns
  return cols.map((col, i) => {
    const next = cols[i + 1]
    return next ? (col.xStart + next.xStart) / 2 : Number.POSITIVE_INFINITY
  })
}

/** Place phrases into columns by midpoint boundaries. */
function rowToCells(
  phrases: Phrase[],
  layout: HeaderLayout,
  rightBounds: number[],
): MidasCells {
  const cells: MidasCells = {}
  for (const phrase of phrases) {
    let colIdx = rightBounds.length - 1
    for (let i = 0; i < rightBounds.length; i++) {
      if (phrase.x < rightBounds[i]) {
        colIdx = i
        break
      }
    }
    const field = layout.columns[colIdx].field
    const prev = cells[field]
    cells[field] = prev ? `${prev} ${phrase.str}` : phrase.str
  }
  return cells
}

export interface MidasParseStats {
  skippedNotExecuted: number
  skippedNonTrade: number
}

export interface MidasRowContext {
  /** canonicalized-lowercase ticker → asset id. */
  tickerLookup: Map<string, string>
  /** currency code → seeded fiat asset id. */
  fiatAssetIds: Map<string, string>
  midasPlatformId: string
  unresolvedAssets: Set<string>
  unresolvedPlatform: boolean
  /** Deduped blocking messages (e.g. a currency with no fiat asset row). */
  errors: Set<string>
}

type AssetLike = Pick<Asset, "id" | "category" | "ticker">
type PlatformLike = Pick<Platform, "id" | "name">

export function buildMidasRowContext(
  assets: AssetLike[],
  platforms: PlatformLike[],
): MidasRowContext {
  const tickerLookup = new Map<string, string>()
  const fiatAssetIds = new Map<string, string>()
  for (const a of assets) {
    tickerLookup.set(a.ticker.toLowerCase(), a.id)
    if (a.category === FIAT_ASSET_CATEGORY) {
      fiatAssetIds.set(a.ticker.toUpperCase(), a.id)
    }
  }
  const midas = platforms.find(
    (p) => p.name.toLowerCase() === MIDAS_PLATFORM_NAME.toLowerCase(),
  )
  return {
    tickerLookup,
    fiatAssetIds,
    midasPlatformId: midas?.id ?? "",
    unresolvedAssets: new Set<string>(),
    unresolvedPlatform: !midas,
    errors: new Set<string>(),
  }
}

function missingFiatAssetError(currency: string): string {
  return `No ${currency} cash asset found — skipped the ${currency} cash rows in this statement.`
}

/** YATIRIM İŞLEMLERİ → buy/sell on the traded security. */
export function tradeCellsToRow(
  cells: MidasCells,
  ctx: MidasRowContext,
  stats: MidasParseStats,
): ParsedRow | null {
  // Date gate first: section titles and footnotes also land under the active
  // layout, and they must not count as skipped transactions.
  const date = parseDate(cells.TARIH?.trim() ?? "")
  if (!date) return null

  // Filled quantity — not status — decides whether shares changed hands. A
  // "Kalanın Süresi Doldu" order (remainder expired) still fills part of the
  // order, and dropping it would leave the later sell with no cost basis.
  // Cancelled/expired orders fill nothing and fall out here.
  const amount = normalizeNumber(cells.GERCEKLESEN_ADET ?? "")
  if (!amount || !bn(amount).gt(0)) {
    stats.skippedNotExecuted++
    return null
  }

  const typeRaw = cells.ISLEM_TIPI?.trim() ?? ""
  const type: TransactionType | undefined = MIDAS_TYPE_MAP[typeRaw]
  if (!type) {
    stats.skippedNonTrade++
    return null
  }

  const symbol = cells.SEMBOL?.trim() ?? ""
  let assetId = ""
  if (symbol) {
    // Canonicalize before the lookup so PDF symbols like BRK.B match
    // assets stored under Yahoo's BRK-B form.
    const hit = ctx.tickerLookup.get(canonicalizeTicker(symbol).toLowerCase())
    if (hit) {
      assetId = hit
    } else {
      // Unknown ticker → encode as `new:TICKER` sentinel. Save-time
      // auto-resolve will either create it via Yahoo or hand it to the
      // Resolve-Unknowns stepper for manual entry.
      assetId = makeNewAssetSentinel(symbol)
      ctx.unresolvedAssets.add(symbol)
    }
  }

  const currency = (cells.PARA_BIRIMI?.trim() ?? "").toUpperCase()

  return {
    date,
    assetId,
    platformId: ctx.midasPlatformId,
    type,
    amount,
    unitPrice: normalizeNumber(cells.ORT_FIYAT ?? ""),
    priceCurrency: currency,
    fee: normalizeNumber(cells.ISLEM_UCRETI ?? ""),
    notes: "",
    relatedAssetId: null,
  } satisfies ParsedRow
}

/** HESAP İŞLEMLERİ → cash deposits / withdrawals / interest on the fiat asset. */
export function accountCellsToRow(
  cells: MidasCells,
  ctx: MidasRowContext,
  stats: MidasParseStats,
): ParsedRow | null {
  // The settlement date (İşlem Tarihi) is when the cash actually moved; the
  // request date (Talep Tarihi) can fall on the previous day.
  const date = parseDate(cells.ISLEM_TARIHI?.trim() ?? "")
  if (!date) return null

  const status = cells.ISLEM_DURUMU?.trim() ?? ""
  if (status !== MIDAS_EXECUTED_STATUS) {
    stats.skippedNotExecuted++
    return null
  }

  const typeRaw = cells.ISLEM_TIPI?.trim() ?? ""
  const description = cells.ISLEM_ACIKLAMASI?.trim() ?? ""
  let type: TransactionType | undefined = MIDAS_ACCOUNT_TYPE_MAP[typeRaw]
  if (
    !type &&
    typeRaw === MIDAS_OTHER_INCOME_TYPE &&
    description.includes(MIDAS_INTEREST_DESCRIPTION_TOKEN)
  ) {
    type = TRANSACTION_TYPES.INTEREST
  }
  if (!type) {
    stats.skippedNonTrade++
    return null
  }

  const { amount, currency } = splitAmountCurrency(cells.TUTAR_YP ?? "")
  if (!amount || !currency) {
    stats.skippedNonTrade++
    return null
  }

  const assetId = ctx.fiatAssetIds.get(currency)
  if (!assetId) {
    // No `new:` sentinel here — fiat rows are seeded, never created by import.
    ctx.errors.add(missingFiatAssetError(currency))
    return null
  }

  return {
    date,
    assetId,
    platformId: ctx.midasPlatformId,
    type,
    amount,
    unitPrice: CASH_UNIT_PRICE,
    priceCurrency: currency,
    fee: "",
    notes: description,
    relatedAssetId: null,
  } satisfies ParsedRow
}

/** TEMETTÜ İŞLEMLERİ → cash dividend on the fiat asset, pointing at the payer. */
export function dividendCellsToRow(
  cells: MidasCells,
  ctx: MidasRowContext,
  stats: MidasParseStats,
): ParsedRow | null {
  const date = parseDate(cells.ODEME_TARIHI?.trim() ?? "")
  if (!date) return null

  // Net is what actually hit the account (and what the same-day auto-reinvest
  // buy spends); gross and withholding survive in the notes.
  const { amount, currency } = splitAmountCurrency(cells.NET_TEMETTU ?? "")
  if (!amount || !currency) {
    stats.skippedNonTrade++
    return null
  }

  const assetId = ctx.fiatAssetIds.get(currency)
  if (!assetId) {
    ctx.errors.add(missingFiatAssetError(currency))
    return null
  }

  // "SPYM - SPDR Portfolio S&P 500…" → SPYM. Long names get truncated with an
  // ellipsis in the PDF, so only the leading token is trustworthy.
  const security = cells.SERMAYE_ARACI?.trim() ?? ""
  const head = security.split(MIDAS_SECURITY_TICKER_SEPARATOR)[0].trim()
  const ticker = canonicalizeTicker(head.split(/\s+/)[0])
  // A payer with no catalog entry stays null rather than becoming a `new:`
  // sentinel — the ticker is named in the notes, and the position it pays on
  // is normally already held.
  const relatedAssetId = ticker
    ? (ctx.tickerLookup.get(ticker.toLowerCase()) ?? null)
    : null

  const gross = splitAmountCurrency(cells.BRUT_TEMETTU ?? "").amount
  const withholding = splitAmountCurrency(cells.STOPAJ ?? "").amount

  return {
    date,
    assetId,
    platformId: ctx.midasPlatformId,
    type: TRANSACTION_TYPES.DIVIDEND,
    amount,
    unitPrice: CASH_UNIT_PRICE,
    priceCurrency: currency,
    fee: "",
    notes: midasDividendNote(ticker, gross, withholding),
    relatedAssetId,
  } satisfies ParsedRow
}

const ROW_MAPPERS: Record<
  MidasTableKind,
  (cells: MidasCells, ctx: MidasRowContext, stats: MidasParseStats) => ParsedRow | null
> = {
  trade: tradeCellsToRow,
  account: accountCellsToRow,
  dividend: dividendCellsToRow,
}

export async function parseMidasPdf(
  file: File,
  assets: Asset[],
  platforms: Platform[],
): Promise<ParseSummary> {
  const ctx = buildMidasRowContext(assets, platforms)
  const stats: MidasParseStats = { skippedNotExecuted: 0, skippedNonTrade: 0 }

  let pdfjs: Awaited<ReturnType<typeof loadPdfjs>>
  try {
    pdfjs = await loadPdfjs()
  } catch (err) {
    return emptySummary(`Could not load PDF engine: ${errMsg(err)}`)
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (err) {
    return emptySummary(`Could not read file: ${errMsg(err)}`)
  }

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>
  try {
    doc = await pdfjs.getDocument({ data: buffer }).promise
  } catch (err) {
    return emptySummary(`Not a valid PDF: ${errMsg(err)}`)
  }

  const rows: ParsedRow[] = []
  let tradeHeaderFound = false

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const fragments: TextFragment[] = []
    for (const item of content.items) {
      if (!("str" in item)) continue
      const str = item.str
      // Midas's PDF emits explicit whitespace items between cells (an empty
      // visual gap is a real item with its own x/width). Drop them — they
      // carry no data and would otherwise sit between real cells, fooling
      // either the gap-based merger or the column assignment.
      if (!str || !str.trim()) continue
      const transform = item.transform as number[]
      fragments.push({
        str,
        x: transform[4],
        y: transform[5],
        width: item.width ?? 0,
      })
    }

    const rowsOfFragments = groupFragmentsIntoRows(fragments)
    const rowsOfPhrases = rowsOfFragments.map(mergeIntoPhrases)

    // A page holds several tables stacked vertically (trades, then cash ops,
    // then dividends). Each header row switches the active layout; every row
    // after it is read under that layout until the next header. Layouts don't
    // carry across pages — column x-positions are page-local.
    let layout: HeaderLayout | null = null
    let rightBounds: number[] = []
    for (const phrases of rowsOfPhrases) {
      if (phrases.length === 0) continue
      const candidate = detectHeader(phrases)
      if (candidate) {
        layout = candidate
        rightBounds = columnRightBounds(candidate)
        if (candidate.kind === "trade") tradeHeaderFound = true
        continue
      }
      if (!layout) continue
      const cells = rowToCells(phrases, layout, rightBounds)
      const parsed = ROW_MAPPERS[layout.kind](cells, ctx, stats)
      if (parsed) rows.push(parsed)
    }
  }

  if (!tradeHeaderFound) {
    return emptySummary(
      "This doesn't look like a Midas PDF (no Tarih/Sembol header found).",
    )
  }

  const errors: string[] = Array.from(ctx.errors)
  if (rows.length === 0) {
    errors.push("No importable transactions found in this PDF.")
  }

  const unresolvedPlatforms = ctx.unresolvedPlatform ? [MIDAS_PLATFORM_NAME] : []

  return {
    rows,
    unresolvedAssets: Array.from(ctx.unresolvedAssets),
    unresolvedPlatforms,
    skipped: stats.skippedNotExecuted + stats.skippedNonTrade,
    errors,
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function emptySummary(error: string): ParseSummary {
  return {
    rows: [],
    unresolvedAssets: [],
    unresolvedPlatforms: [],
    skipped: 0,
    errors: [error],
  }
}
