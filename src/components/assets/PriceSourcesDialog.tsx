import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import type { Asset, AssetPriceSource, PriceSourceKind } from "@/types/database"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { PRICE_SOURCES } from "@/lib/constants/assets"
import {
  DEFAULT_SOURCE_KIND,
  PRICE_SOURCE_COPY,
  PRICE_SOURCE_KIND_LABELS,
  PRICE_SOURCE_KINDS,
  PRICE_SOURCE_SYMBOL_MAX,
} from "@/lib/constants/priceSources"
import { formatTimeAgo } from "@/lib/age"
import {
  buildSourceSave,
  hasSourceList,
  moveDraft,
  sourceHealth,
  toDrafts,
  validateNewSource,
  type SourceDraft,
} from "@/lib/priceSources"
import { fetchPriceSources, savePriceSources } from "@/lib/queries/priceSources"

interface Props {
  /** The asset being edited; null = closed. */
  asset: Asset | null
  onOpenChange: (open: boolean) => void
}

type Loaded =
  | { assetId: string; status: "ready"; stored: AssetPriceSource[] }
  | { assetId: string; status: "failed" }

/**
 * Fiyat kaynakları — one asset's ordered price sources (Admin page). Rows are
 * edited as a draft (move, remove, add) and written in one Save; the stored
 * list is untouched until then. The parent keys it by asset id, so each
 * asset opens with a fresh draft.
 */
export function PriceSourcesDialog({ asset, onOpenChange }: Props) {
  const open = asset != null
  const listed = asset != null && hasSourceList(asset)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [drafts, setDrafts] = useState<SourceDraft[]>([])
  const [newSource, setNewSource] = useState<PriceSourceKind>(
    () => (asset && DEFAULT_SOURCE_KIND[asset.category]) || "yahoo",
  )
  const [newSymbol, setNewSymbol] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const current = loaded?.assetId === asset?.id ? loaded : null

  useEffect(() => {
    if (!asset || !hasSourceList(asset)) return
    let cancelled = false
    fetchPriceSources(asset.id).then(
      (stored) => {
        if (cancelled) return
        setLoaded({ assetId: asset.id, status: "ready", stored })
        setDrafts(toDrafts(stored))
      },
      () => !cancelled && setLoaded({ assetId: asset.id, status: "failed" }),
    )
    return () => {
      cancelled = true
    }
  }, [asset])

  /** The draft with the add row appended, or null (error shown) when the
   *  typed symbol doesn't pass. */
  function withTypedRow(): SourceDraft[] | null {
    const result = validateNewSource(drafts, newSource, newSymbol)
    if ("error" in result) {
      setAddError(result.error)
      return null
    }
    setNewSymbol("")
    setAddError(null)
    return [
      ...drafts,
      {
        id: crypto.randomUUID(),
        source: newSource,
        symbol: result.symbol,
        last_ok_at: null,
        last_error: null,
        last_error_at: null,
        isNew: true,
      },
    ]
  }

  function handleAdd() {
    const next = withTypedRow()
    if (next) setDrafts(next)
  }

  async function handleSave() {
    if (!asset || current?.status !== "ready") return
    // A symbol typed but not yet added is part of what Save means.
    const rows = newSymbol.trim() ? withTypedRow() : drafts
    if (!rows) return
    setDrafts(rows)
    setSaving(true)
    setSaveError(null)
    try {
      await savePriceSources(asset.id, buildSourceSave(asset.id, current.stored, rows))
      onOpenChange(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : PRICE_SOURCE_COPY.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const feedLabel =
    PRICE_SOURCES.find((s) => s.value === asset?.price_source)?.label ??
    asset?.price_source ??
    ""
  const example = PRICE_SOURCE_KINDS.find((k) => k.value === newSource)?.example

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {PRICE_SOURCE_COPY.title}
            {asset && <span className="text-muted-foreground"> · {asset.ticker}</span>}
          </DialogTitle>
          {listed && <DialogDescription>{PRICE_SOURCE_COPY.description}</DialogDescription>}
        </DialogHeader>

        {!listed ? (
          <p className="text-sm text-muted-foreground">{PRICE_SOURCE_COPY.noList(feedLabel)}</p>
        ) : (
          <DialogBody className="grid content-start gap-4 py-1">
            {current == null ? (
              <Skeleton className="h-28 w-full" />
            ) : current.status === "failed" ? (
              <p className="text-sm text-destructive">{PRICE_SOURCE_COPY.loadFailed}</p>
            ) : drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{PRICE_SOURCE_COPY.empty}</p>
            ) : (
              <ol className="divide-y overflow-hidden rounded-lg border">
                {drafts.map((row, index) => (
                  <SourceRow
                    key={row.id}
                    row={row}
                    index={index}
                    last={index === drafts.length - 1}
                    onMove={(dir) => setDrafts((rows) => moveDraft(rows, index, dir))}
                    onRemove={() =>
                      setDrafts((rows) => rows.filter((r) => r.id !== row.id))
                    }
                  />
                ))}
              </ol>
            )}

            {current?.status === "ready" && (
              <div className="grid gap-1.5">
                <div className="flex gap-2">
                  <Select
                    value={newSource}
                    onValueChange={(v) => setNewSource(v as PriceSourceKind)}
                  >
                    <SelectTrigger
                      className="w-36 shrink-0"
                      aria-label={PRICE_SOURCE_COPY.source}
                    >
                      <SelectValue>{PRICE_SOURCE_KIND_LABELS[newSource]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_SOURCE_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="min-w-0 flex-1"
                    aria-label={PRICE_SOURCE_COPY.symbol}
                    placeholder={example}
                    maxLength={PRICE_SOURCE_SYMBOL_MAX}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAdd()
                      }
                    }}
                  />
                  <Button variant="outline" className="shrink-0" onClick={handleAdd}>
                    {PRICE_SOURCE_COPY.add}
                  </Button>
                </div>
                {addError && <p className="text-sm text-destructive">{addError}</p>}
              </div>
            )}
          </DialogBody>
        )}

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        {listed ? (
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {PRICE_SOURCE_COPY.cancel}
            </DialogClose>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || current?.status !== "ready"}
            >
              {saving ? PRICE_SOURCE_COPY.saving : PRICE_SOURCE_COPY.save}
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter showCloseButton />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One source: position, source · symbol, and its latest health underneath;
 *  move and remove on the right. */
function SourceRow({
  row,
  index,
  last,
  onMove,
  onRemove,
}: {
  row: SourceDraft
  index: number
  last: boolean
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const label = PRICE_SOURCE_KIND_LABELS[row.source] ?? row.source
  const health = sourceHealth(row)
  const name = `${label} ${row.symbol}`

  return (
    <li className="flex min-h-14 items-center gap-2 px-3 py-2">
      <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground"> · </span>
          <span>{row.symbol}</span>
        </p>
        <p
          className={
            health.tone === "error"
              ? "line-clamp-2 text-xs break-words text-destructive"
              : "text-xs text-muted-foreground"
          }
          title={health.tone === "error" ? (health.message ?? undefined) : undefined}
        >
          {row.isNew
            ? PRICE_SOURCE_COPY.newRow
            : health.tone === "ok"
              ? PRICE_SOURCE_COPY.lastOk(formatTimeAgo(health.at))
              : health.tone === "error"
                ? `${PRICE_SOURCE_COPY.lastError(formatTimeAgo(health.at))}${health.message ? `: ${health.message}` : ""}`
                : PRICE_SOURCE_COPY.neverRun}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-10"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label={`${PRICE_SOURCE_COPY.moveUp} ${name}`}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-10"
          disabled={last}
          onClick={() => onMove(1)}
          aria-label={`${PRICE_SOURCE_COPY.moveDown} ${name}`}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive max-sm:size-10"
          onClick={onRemove}
          aria-label={`${PRICE_SOURCE_COPY.remove} ${name}`}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}
