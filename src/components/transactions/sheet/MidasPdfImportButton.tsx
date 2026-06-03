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
import type { ParseSummary } from "./parseImport"
import type { SheetSnapshot } from "./types"
import type { Asset, Platform } from "@/types/database"

const MIDAS_PDF_ACCEPT = "application/pdf,.pdf"

interface Props {
  assets: Asset[]
  platforms: Platform[]
  onAppend: (rows: Partial<SheetSnapshot>[]) => void
}

export function MidasPdfImportButton({ assets, platforms, onAppend }: Props) {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [summary, setSummary] = useState<ParseSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setSummary(null)
    setParsing(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFile = async (file: File) => {
    setParsing(true)
    setSummary(null)
    try {
      const result = await parseMidasPdf(file, assets, platforms)
      setSummary(result)
      if (result.errors.length > 0) {
        toast.error(result.errors[0])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse PDF")
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
            Pick the PDF account statement Midas emails or exports. Only
            executed buy/sell rows are imported — cancelled and pending rows
            are skipped. Parsed rows land in the grid as new rows for review.
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

        {summary && summary.rows.length > 0 && (
          <div className="border-t bg-muted/30 p-4">
            <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
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

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAppend}>
                Add {summary.rows.length} row
                {summary.rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
