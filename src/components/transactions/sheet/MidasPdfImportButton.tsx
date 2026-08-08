import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileText } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { parseMidasPdf } from "./parseMidasPdf"
import { dedupeImportedRows, type DedupCandidate } from "./dedupeImportedRows"
import type { ParseSummary } from "./parseImport"
import type { SheetRow, SheetSnapshot } from "./types"
import type { Asset, Platform } from "@/types/database"
import { MIDAS_PLATFORM_NAME } from "@/lib/constants/brokers"
import { fetchTransactions } from "@/lib/queries/transactions"
import { useAuth } from "@/hooks/useAuth"

const MIDAS_PDF_ACCEPT = "application/pdf,.pdf"

interface Props {
  assets: Asset[]
  platforms: Platform[]
  /** Rows currently in the grid (unsaved included) — deduped against so two
   *  overlapping PDFs imported in one session don't double up. */
  gridRows: SheetRow[]
  onAppend: (rows: Partial<SheetSnapshot>[]) => void
}

export function MidasPdfImportButton({ assets, platforms, gridRows, onAppend }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [summary, setSummary] = useState<ParseSummary | null>(null)
  const [alreadyImported, setAlreadyImported] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setSummary(null)
    setParsing(false)
    setAlreadyImported(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFile = async (file: File) => {
    setParsing(true)
    setSummary(null)
    setAlreadyImported(0)
    try {
      const result = await parseMidasPdf(file, assets, platforms)

      const midas = platforms.find(
        (p) => p.name.toLowerCase() === MIDAS_PLATFORM_NAME.toLowerCase(),
      )
      // No Midas platform yet → no prior import can exist; skip the check.
      if (result.rows.length > 0 && midas && user) {
        const dates = result.rows.map((r) => r.date).sort()
        const existingTxs = await fetchTransactions(user.id, {
          platformId: midas.id,
          dateFrom: dates[0],
          dateTo: dates[dates.length - 1],
          includeLinkedChildren: false,
        })
        const existing: DedupCandidate[] = [
          ...existingTxs.map((tx) => ({
            date: tx.date.slice(0, 10),
            assetId: tx.asset_id,
            type: tx.type,
            amount: String(tx.amount),
            unitPrice: String(tx.unit_price),
            priceCurrency: tx.price_currency || "USD",
          })),
          // Unsaved rows only: a saved grid row is already in the DB fetch —
          // counting it twice would over-drop.
          ...gridRows.filter((r) => r.txId == null && r.platformId === midas.id),
        ]
        const { kept, duplicates } = dedupeImportedRows(result.rows, existing)
        result.rows = kept
        setAlreadyImported(duplicates)
      }

      setSummary(result)
      if (result.errors.length > 0) {
        toast.error(result.errors[0])
      }
    } catch (err) {
      // Covers both parse failures and the duplicate-check query failing.
      // On query failure we deliberately show nothing to append — silent
      // dedup-off would reintroduce duplicates.
      toast.error(err instanceof Error ? err.message : "Failed to import PDF")
    } finally {
      setParsing(false)
    }
  }

  const handleAppend = () => {
    if (!summary || summary.rows.length === 0) return
    onAppend(summary.rows as Partial<SheetSnapshot>[])
    const parts = [
      `${summary.rows.length} row${summary.rows.length === 1 ? "" : "s"} added`,
      summary.unresolvedAssets.length > 0 &&
        `${summary.unresolvedAssets.length} new ticker${summary.unresolvedAssets.length === 1 ? "" : "s"} to create`,
      summary.unresolvedPlatforms.length > 0 && "Midas platform not set",
      summary.skipped > 0 && `${summary.skipped} skipped`,
      alreadyImported > 0 && `${alreadyImported} already imported`,
    ]
      .filter(Boolean)
      .join(" · ")
    toast.success(parts)
    reset()
    setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <FileText className="size-3.5" />
            Import from Midas
          </Button>
        }
      />
      <PopoverContent className="w-[480px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="space-y-3 p-4">
          <div className="text-sm font-medium">Import Midas PDF statement</div>
          <p className="text-xs text-muted-foreground">
            Pick the PDF account statement Midas emails or exports. Imports
            executed trades, cash deposits and withdrawals, nema interest, and
            cash dividends — cancelled, pending, and unrecognised rows are
            skipped. Parsed rows land in the grid as new rows for review.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={MIDAS_PDF_ACCEPT}
            disabled={parsing}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
            className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent"
          />
          {parsing && (
            <div className="text-xs text-muted-foreground">Parsing PDF…</div>
          )}
        </div>

        {summary && (summary.rows.length > 0 || alreadyImported > 0) && (
          <div className="border-t bg-muted/30 p-4">
            <div className="mb-3 grid grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Rows</div>
                <div className="text-lg font-semibold tabular-nums">
                  {summary.rows.length}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">New tickers</div>
                <div className="text-lg font-semibold tabular-nums text-amber-600">
                  {summary.unresolvedAssets.length}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Skipped</div>
                <div className="text-lg font-semibold tabular-nums text-muted-foreground">
                  {summary.skipped}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Already imported</div>
                <div className="text-lg font-semibold tabular-nums text-muted-foreground">
                  {alreadyImported}
                </div>
              </div>
            </div>

            {(summary.unresolvedAssets.length > 0 ||
              summary.unresolvedPlatforms.length > 0) && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {summary.unresolvedAssets.length > 0 && (
                  <div>
                    New tickers (will be created on Save):{" "}
                    {summary.unresolvedAssets.slice(0, 8).join(", ")}
                    {summary.unresolvedAssets.length > 8 && "…"}
                  </div>
                )}
                {summary.unresolvedPlatforms.length > 0 && (
                  <div>
                    No platform named “Midas” yet — leave blank and pick in the
                    grid, or create one first.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {summary.rows.length === 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    All rows in this statement are already imported.
                  </span>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAppend}>
                    Add {summary.rows.length} row
                    {summary.rows.length === 1 ? "" : "s"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
