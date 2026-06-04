import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAssets } from "@/hooks/useAssets"
import {
  ASSET_CATEGORIES,
  PRICE_SOURCES,
  TICKER_HINTS,
  DEFAULT_PRICE_SOURCE,
  assetNativeCurrency,
  type AssetCategoryValue,
  type PriceSourceValue,
} from "@/lib/constants/assets"
import { tickerFromSentinel } from "./sentinel"
import type { Asset } from "@/types/database"
import type { UnresolvedReason } from "@/lib/queries/assets"

interface Props {
  /** Sentinel values from the grid rows, e.g. ["new:BTC", "new:RKLB"]. */
  sentinels: string[]
  open: boolean
  /** Resolve one sentinel → the real asset id created on the server, plus the
   *  asset's native price currency. Called once per sentinel, in order. */
  onResolved: (
    sentinel: string,
    realAssetId: string,
    priceCurrency: string,
  ) => void
  /** Called when every sentinel has been resolved. The grid resumes its
   *  Save batch after this fires. */
  onAllResolved: () => void
  /** Cancel without resolving — the Save batch is aborted; rows stay in
   *  the grid with their sentinels. */
  onCancel: () => void
  reasons?: Record<string, UnresolvedReason>
}

/** Best-effort match for the DB's `duplicate key value violates unique
 *  constraint "assets_user_id_ticker_key"` error. Supabase-js surfaces the
 *  Postgres error message verbatim. */
function isDuplicateTickerError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("duplicate key") && msg.includes("ticker")
}

interface FormState {
  category: AssetCategoryValue
  ticker: string
  name: string
  tagsInput: string
  priceSource: PriceSourceValue
}

function defaultsForTicker(ticker: string): FormState {
  // Heuristic: lowercase coin-ish strings start as crypto; all-caps with
  // dot suffix → BIST; all-caps short → US stock. Easy override in the form.
  let category: AssetCategoryValue = "stock_us"
  if (/\.IS$/i.test(ticker)) category = "stock_bist"
  else if (ticker === ticker.toLowerCase() && ticker.length > 3) category = "crypto"
  return {
    category,
    ticker,
    name: "",
    tagsInput: "",
    priceSource: DEFAULT_PRICE_SOURCE[category],
  }
}

export function ResolveAssetsStepper({
  sentinels,
  open,
  onResolved,
  onAllResolved,
  onCancel,
  reasons,
}: Props) {
  const { assets, addAsset } = useAssets()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(() =>
    defaultsForTicker(sentinels[0] ? tickerFromSentinel(sentinels[0]) : ""),
  )
  const [submitting, setSubmitting] = useState(false)

  // Reset whenever the stepper opens or the list of sentinels changes
  // (e.g., the user adds new unknown tickers between save attempts).
  useEffect(() => {
    if (!open) return
    setStep(0)
    setForm(
      defaultsForTicker(sentinels[0] ? tickerFromSentinel(sentinels[0]) : ""),
    )
  }, [open, sentinels])

  // When the user advances steps, hydrate the form for the next ticker.
  useEffect(() => {
    if (!open) return
    const next = sentinels[step]
    if (!next) return
    setForm(defaultsForTicker(tickerFromSentinel(next)))
  }, [step, sentinels, open])

  if (sentinels.length === 0) return null
  const current = sentinels[step]
  if (!current) return null

  const isLast = step === sentinels.length - 1

  // Match the schema's UNIQUE(user_id, ticker) — `assets` is already
  // user-scoped by useAssets, so a case-insensitive ticker match here is
  // enough to spot a collision before the DB throws.
  const tickerExists = (t: string): Asset | undefined =>
    assets.find(
      (a: Asset) => a.ticker.toLowerCase() === t.trim().toLowerCase(),
    )

  async function handleNext() {
    const trimmedTicker = form.ticker.trim()
    const trimmedName = form.name.trim()
    if (!trimmedTicker) {
      toast.error("Ticker is required")
      return
    }
    if (!trimmedName) {
      toast.error("Display name is required")
      return
    }
    const existing = tickerExists(trimmedTicker)
    if (existing) {
      toast.error(
        `Ticker "${existing.ticker}" already exists (${existing.name}). Cancel this step and pick it from the dropdown instead.`,
      )
      return
    }

    setSubmitting(true)
    try {
      const tags = form.tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      const created = await addAsset({
        category: form.category,
        ticker: trimmedTicker,
        price_id: form.ticker,
        name: trimmedName,
        tags,
        price_source: form.priceSource,
        is_currency: false,
        is_active: true,
      })
      onResolved(current, created.id, assetNativeCurrency(created))
      toast.success(`Registered ${created.ticker}`)
      if (isLast) {
        onAllResolved()
      } else {
        setStep(step + 1)
      }
    } catch (err) {
      // Race: if another stepper run or a tab inserted the same ticker
      // between our pre-check and the insert, the DB still wins. Surface
      // a friendlier message than the raw constraint name.
      if (isDuplicateTickerError(err)) {
        toast.error(
          `Ticker "${trimmedTicker}" already exists. Cancel and pick it from the dropdown.`,
        )
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to register asset",
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const reasonText = (sentinel: string): string => {
    const ticker = tickerFromSentinel(sentinel)
    const reason = reasons?.[sentinel]
    switch (reason) {
      case "not_found":
        return `Yahoo couldn't find ${ticker}. For BIST stocks add the .IS suffix (e.g. THYAO.IS). Otherwise fill in details manually.`
      case "not_equity":
        return `Yahoo doesn't list ${ticker} as a stock. Pick the right category manually.`
      case "http_error":
        return `Couldn't reach Yahoo for ${ticker}. Fill in details manually.`
      case "create_failed":
        return `Yahoo found ${ticker} but saving the asset failed. Review and try again.`
      default:
        return `We don't know ${ticker} yet. Fill in the details so we can price it and track it.`
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Register new asset{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({step + 1} of {sentinels.length})
            </span>
          </DialogTitle>
          <DialogDescription>{reasonText(current)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Step indicator */}
          <div className="flex gap-1">
            {sentinels.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i < step
                    ? "bg-emerald-500"
                    : i === step
                      ? "bg-primary"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => {
                const cat = v as AssetCategoryValue
                setForm((f) => ({
                  ...f,
                  category: cat,
                  priceSource: DEFAULT_PRICE_SOURCE[cat],
                }))
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="resolve-ticker">Ticker</Label>
            <Input
              id="resolve-ticker"
              value={form.ticker}
              onChange={(e) =>
                setForm((f) => ({ ...f, ticker: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {TICKER_HINTS[form.category]}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="resolve-name">Display name</Label>
            <Input
              id="resolve-name"
              placeholder="e.g. Bitcoin, Apple Inc., US Dollar"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="resolve-tags">Tags (optional)</Label>
            <Input
              id="resolve-tags"
              placeholder="e.g. crypto, defi"
              value={form.tagsInput}
              onChange={(e) =>
                setForm((f) => ({ ...f, tagsInput: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Used for grouping in the dashboard breakdown.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Price source</Label>
            <Select
              value={form.priceSource}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, priceSource: v as PriceSourceValue }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel save
          </Button>
          <Button onClick={handleNext} disabled={submitting}>
            {submitting
              ? "Registering…"
              : isLast
                ? "Register & continue save"
                : `Register & next →`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
