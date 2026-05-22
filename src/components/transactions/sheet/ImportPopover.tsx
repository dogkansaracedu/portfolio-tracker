import { useState, useRef } from "react"
import { toast } from "sonner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ClipboardPaste } from "lucide-react"
import { parseClipboard, type ParseSummary } from "./parseImport"
import type { Asset, Platform } from "@/types/database"
import type { SheetSnapshot } from "./types"

interface Props {
  assets: Asset[]
  platforms: Platform[]
  /** When set, rows that don't specify an asset get this id. The grid passes
   *  the locked asset in per-asset mode. */
  lockedAssetId?: string
  onAppend: (rows: Partial<SheetSnapshot>[]) => void
}

const SAMPLE_HEADERS = "Date\tTicker\tPlatform\tType\tAmount\tPrice\tCurrency\tFee\tNotes"

export function ImportPopover({
  assets,
  platforms,
  lockedAssetId,
  onAppend,
}: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [summary, setSummary] = useState<ParseSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleParse = (raw: string) => {
    const s = parseClipboard(raw, assets, platforms, { lockedAssetId })
    setSummary(s)
    if (s.errors.length > 0) {
      toast.error(s.errors[0])
    }
  }

  const handleFile = async (file: File) => {
    const raw = await file.text()
    setText(raw)
    handleParse(raw)
  }

  const handleAppend = () => {
    if (!summary || summary.rows.length === 0) return
    onAppend(summary.rows as Partial<SheetSnapshot>[])
    const msg = [
      `${summary.rows.length} row${summary.rows.length === 1 ? "" : "s"} added`,
      summary.unresolvedAssets.length > 0 &&
        `${summary.unresolvedAssets.length} unknown ticker${summary.unresolvedAssets.length === 1 ? "" : "s"}`,
      summary.unresolvedPlatforms.length > 0 &&
        `${summary.unresolvedPlatforms.length} unknown platform${summary.unresolvedPlatforms.length === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ")
    toast.success(msg)
    setText("")
    setSummary(null)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <ClipboardPaste className="size-3.5" />
            Import
          </Button>
        }
      />
      <PopoverContent className="w-[560px] p-0" align="start">
        <Tabs defaultValue="paste">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
            <TabsTrigger value="paste" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Paste from Excel
            </TabsTrigger>
            <TabsTrigger value="upload" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
              Upload CSV
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-3 p-4">
            <div className="text-xs text-muted-foreground">
              Copy rows from Excel/Google Sheets and paste below. First row can
              be a header. Tab-separated.
            </div>
            <Textarea
              placeholder={`${SAMPLE_HEADERS}\n2024-01-15\tBTC\tBinance\tbuy\t0.5\t42000\tUSD\t0\t`}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setSummary(null)
              }}
              rows={8}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleParse(text)}
                disabled={!text.trim()}
              >
                Parse
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 p-4">
            <div className="text-xs text-muted-foreground">
              Pick a .csv file exported from Excel/Google Sheets.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent"
            />
          </TabsContent>
        </Tabs>

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
                <div className="text-muted-foreground">Unknown tickers</div>
                <div className="text-lg font-semibold tabular-nums text-amber-600">
                  {summary.unresolvedAssets.length}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Unknown platforms</div>
                <div className="text-lg font-semibold tabular-nums text-amber-600">
                  {summary.unresolvedPlatforms.length}
                </div>
              </div>
            </div>

            {(summary.unresolvedAssets.length > 0 ||
              summary.unresolvedPlatforms.length > 0) && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Unknown values:{" "}
                {[...summary.unresolvedAssets, ...summary.unresolvedPlatforms]
                  .slice(0, 5)
                  .join(", ")}
                {summary.unresolvedAssets.length +
                  summary.unresolvedPlatforms.length >
                  5 && "…"}
                <br />
                These rows will be added with the cell left blank — pick a
                value from the dropdown before Save.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSummary(null)
                  setText("")
                }}
              >
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
