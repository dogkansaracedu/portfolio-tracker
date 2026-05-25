import type { Asset, Platform, TransactionType } from "@/types/database"
import { loadPdfjs } from "@/lib/pdf/loadPdfjs"
import { MIDAS_PLATFORM_NAME } from "@/lib/constants/brokers"
import {
  MIDAS_HEADER_ALIASES,
  MIDAS_EXECUTED_STATUS,
  MIDAS_TYPE_MAP,
  type MidasHeaderField,
} from "@/lib/constants/midas-pdf"
import type { ParsedRow, ParseSummary } from "./parseImport"
import { canonicalizeTicker, makeNewAssetSentinel } from "./sentinel"

const ROW_Y_TOLERANCE = 2
const PHRASE_GAP_X = 4

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
  /** Each entry: the field this column carries, and the x at which its
   *  leftmost token starts. Ordered left-to-right. */
  columns: { field: MidasHeaderField; xStart: number }[]
}

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

function detectHeader(rowPhrases: Phrase[]): HeaderLayout | null {
  const matches: { field: MidasHeaderField; xStart: number }[] = []
  for (const phrase of rowPhrases) {
    const field = HEADER_LOOKUP.get(canon(phrase.str))
    if (field) matches.push({ field, xStart: phrase.x })
  }
  const fields = new Set(matches.map((m) => m.field))
  if (!fields.has("TARIH") || !fields.has("SEMBOL")) return null
  matches.sort((a, b) => a.xStart - b.xStart)
  return { columns: matches }
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
): Partial<Record<MidasHeaderField, string>> {
  const cells: Partial<Record<MidasHeaderField, string>> = {}
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

interface ParseStats {
  skippedCancelled: number
  skippedNonTrade: number
}

function cellsToParsedRow(
  cells: Partial<Record<MidasHeaderField, string>>,
  ctx: {
    tickerLookup: Map<string, string>
    midasPlatformId: string
    unresolvedAssets: Set<string>
    unresolvedPlatform: boolean
  },
  stats: ParseStats,
): ParsedRow | null {
  const status = cells.ISLEM_DURUMU?.trim() ?? ""
  if (status !== MIDAS_EXECUTED_STATUS) {
    stats.skippedCancelled++
    return null
  }

  const typeRaw = cells.ISLEM_TIPI?.trim() ?? ""
  const type: TransactionType | undefined = MIDAS_TYPE_MAP[typeRaw]
  if (!type) {
    stats.skippedNonTrade++
    return null
  }

  const dateRaw = cells.TARIH?.trim() ?? ""
  const date = parseDate(dateRaw)
  if (!date) {
    // Looked like a data row in the header pass (had TARIH+SEMBOL cells) but
    // TARIH isn't a real DD/MM/YY value — most likely a footer or stray text
    // mis-classified. Drop it silently rather than emit an invalid row.
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
    amount: normalizeNumber(cells.GERCEKLESEN_ADET ?? ""),
    unitPrice: normalizeNumber(cells.ORT_FIYAT ?? ""),
    priceCurrency: currency,
    fee: normalizeNumber(cells.ISLEM_UCRETI ?? ""),
    notes: "",
  } satisfies ParsedRow
}

export async function parseMidasPdf(
  file: File,
  assets: Asset[],
  platforms: Platform[],
): Promise<ParseSummary> {
  const tickerLookup = new Map<string, string>()
  for (const a of assets) tickerLookup.set(a.ticker.toLowerCase(), a.id)

  const midas = platforms.find(
    (p) => p.name.toLowerCase() === MIDAS_PLATFORM_NAME.toLowerCase(),
  )
  const ctx = {
    tickerLookup,
    midasPlatformId: midas?.id ?? "",
    unresolvedAssets: new Set<string>(),
    unresolvedPlatform: !midas,
  }
  const stats: ParseStats = { skippedCancelled: 0, skippedNonTrade: 0 }

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
  let headerFoundOnAnyPage = false

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

    let layout: HeaderLayout | null = null
    for (let i = 0; i < rowsOfPhrases.length; i++) {
      const candidate = detectHeader(rowsOfPhrases[i])
      if (candidate) {
        layout = candidate
        headerFoundOnAnyPage = true
        const rightBounds = columnRightBounds(layout)
        for (let j = i + 1; j < rowsOfPhrases.length; j++) {
          const phrases = rowsOfPhrases[j]
          if (phrases.length === 0) continue
          if (detectHeader(phrases)) break
          const cells = rowToCells(phrases, layout, rightBounds)
          if (!cells.TARIH || !cells.SEMBOL) continue
          const parsed = cellsToParsedRow(cells, ctx, stats)
          if (parsed) rows.push(parsed)
        }
        break
      }
    }
  }

  if (!headerFoundOnAnyPage) {
    return emptySummary(
      "This doesn't look like a Midas PDF (no Tarih/Sembol header found).",
    )
  }

  const errors: string[] = []
  if (rows.length === 0) {
    errors.push("No executed buy/sell transactions found in this PDF.")
  }

  const unresolvedPlatforms = ctx.unresolvedPlatform ? [MIDAS_PLATFORM_NAME] : []

  return {
    rows,
    unresolvedAssets: Array.from(ctx.unresolvedAssets),
    unresolvedPlatforms,
    skipped: stats.skippedCancelled + stats.skippedNonTrade,
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
