import { useState } from "react"
import {
  Dialog,
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAssetsContext } from "@/contexts/AssetsContext"
import { useInterestContext } from "@/contexts/InterestContext"
import { usePlatformsContext } from "@/contexts/PlatformsContext"
import { bn, homeDayIso } from "@/lib/config"
import {
  INTEREST_APR_KIND_OPTIONS,
  INTEREST_COPY,
  type AprKind,
} from "@/lib/constants/interest"
import type { PositionPrefill } from "@/lib/interest"
import type { InterestPosition } from "@/types/database"

/**
 * Component 16 — the one add/edit dialog, shared by both entry points: the
 * Campaigns page's "Track" button (which passes a `prefill`) and the
 * asset-detail section (which passes the asset, or a `position` to edit).
 *
 * It writes through `InterestContext` itself so neither caller carries a copy
 * of the save logic. Quantity and rate leave as `toFixed()` strings — the
 * columns are Postgres `numeric` and the repo never sends a float for money.
 */

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Seed values for a NEW position. Ignored while editing. */
  prefill?: PositionPrefill
  /** The row being edited; omit (or null) to add. */
  position?: InterestPosition | null
}

/** The dialog's own string-shaped state — inputs never hold numbers. */
interface FormState {
  assetId: string
  platformId: string
  quantity: string
  apr: string
  aprKind: AprKind
  label: string
  startedAt: string
  expiresAt: string
  note: string
}

const DEFAULT_APR_KIND: AprKind = "fixed"

function emptyForm(): FormState {
  return {
    assetId: "",
    platformId: "",
    quantity: "",
    apr: "",
    aprKind: DEFAULT_APR_KIND,
    label: "",
    startedAt: homeDayIso(),
    expiresAt: "",
    note: "",
  }
}

function formFromPosition(position: InterestPosition): FormState {
  return {
    assetId: position.asset_id,
    platformId: position.platform_id,
    quantity: String(position.quantity),
    apr: position.apr === null ? "" : String(position.apr),
    aprKind: position.apr_kind ?? DEFAULT_APR_KIND,
    label: position.label ?? "",
    startedAt: position.started_at,
    expiresAt: position.expires_at ?? "",
    note: position.note ?? "",
  }
}

function formFromPrefill(prefill: PositionPrefill): FormState {
  const base = emptyForm()
  return {
    ...base,
    assetId: prefill.assetId ?? base.assetId,
    platformId: prefill.platformId ?? base.platformId,
    quantity: prefill.quantity ?? base.quantity,
    apr: prefill.apr ?? base.apr,
    aprKind: prefill.aprKind ?? base.aprKind,
    label: prefill.label ?? base.label,
    startedAt: prefill.startedAt ?? base.startedAt,
    expiresAt: prefill.expiresAt ?? base.expiresAt,
    note: prefill.note ?? base.note,
  }
}

export function InterestPositionForm({
  open,
  onOpenChange,
  prefill,
  position,
}: Props) {
  const { assets } = useAssetsContext()
  const { platforms } = usePlatformsContext()
  const { addPosition, updatePosition } = useInterestContext()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!position

  // Re-seed on the closed→open transition: the same instance serves "add for
  // this asset", "track this campaign" and "edit that row" in turn. Adjusting
  // state during render (not in an effect) rather than depending on `prefill`,
  // which callers build inline and would re-seed on every render.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(
        position
          ? formFromPosition(position)
          : prefill
            ? formFromPrefill(prefill)
            : emptyForm(),
      )
      setError(null)
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const assetOptions = assets
    .filter((a) => a.is_active || a.id === form.assetId)
    .sort((a, b) => a.ticker.localeCompare(b.ticker))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.assetId) return setError(INTEREST_COPY.errorAssetRequired)
    if (!form.platformId) return setError(INTEREST_COPY.errorPlatformRequired)

    const quantity = bn(form.quantity)
    if (!quantity.isFinite() || !quantity.isGreaterThan(0)) {
      return setError(INTEREST_COPY.errorQuantityRequired)
    }

    const hasApr = form.apr.trim() !== ""
    const apr = hasApr ? bn(form.apr) : null
    if (apr && !apr.isFinite()) return setError(INTEREST_COPY.errorAprInvalid)

    if (form.expiresAt && form.expiresAt < form.startedAt) {
      return setError(INTEREST_COPY.errorEndBeforeStart)
    }

    // Numeric columns take strings so precision survives Postgres `numeric`.
    // `apr_kind` is null iff `apr` is (the same invariant campaigns keeps).
    const payload = {
      asset_id: form.assetId,
      platform_id: form.platformId,
      quantity: quantity.toFixed(),
      apr: apr ? apr.toFixed() : null,
      apr_kind: apr ? form.aprKind : null,
      label: form.label.trim() || null,
      started_at: form.startedAt,
      expires_at: form.expiresAt || null,
      note: form.note.trim() || null,
    }

    setSubmitting(true)
    setError(null)
    try {
      if (position) {
        await updatePosition(position.id, payload)
      } else {
        await addPosition({
          ...payload,
          campaign_id: prefill?.campaignId ?? null,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : INTEREST_COPY.saveFailedPrefix,
      )
    } finally {
      setSubmitting(false)
    }
  }

  const selectedAsset = assets.find((a) => a.id === form.assetId)
  const selectedPlatform = platforms.find((p) => p.id === form.platformId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? INTEREST_COPY.dialogEditTitle
              : INTEREST_COPY.dialogAddTitle}
          </DialogTitle>
          <DialogDescription>
            {INTEREST_COPY.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="grid max-h-[65vh] gap-4 overflow-y-auto px-1"
        >
          <div className="grid gap-2">
            <Label>{INTEREST_COPY.fieldAsset}</Label>
            <Select
              value={form.assetId}
              onValueChange={(v) => set("assetId", v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedAsset
                    ? `${selectedAsset.ticker} — ${selectedAsset.name}`
                    : INTEREST_COPY.fieldAssetPlaceholder}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assetOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.ticker} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{INTEREST_COPY.fieldPlatform}</Label>
            <Select
              value={form.platformId}
              onValueChange={(v) => set("platformId", v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedPlatform?.name ??
                    INTEREST_COPY.fieldPlatformPlaceholder}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="interest-quantity">
              {INTEREST_COPY.fieldQuantity}
            </Label>
            <Input
              id="interest-quantity"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {INTEREST_COPY.fieldQuantityHint}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="interest-apr">{INTEREST_COPY.fieldApr}</Label>
              <Input
                id="interest-apr"
                inputMode="decimal"
                value={form.apr}
                onChange={(e) => set("apr", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{INTEREST_COPY.fieldAprKind}</Label>
              <Select
                value={form.aprKind}
                onValueChange={(v) => set("aprKind", v as AprKind)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {
                      INTEREST_APR_KIND_OPTIONS.find(
                        (o) => o.value === form.aprKind,
                      )?.label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_APR_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {INTEREST_COPY.fieldAprHint}
          </p>

          <div className="grid gap-2">
            <Label htmlFor="interest-label">{INTEREST_COPY.fieldLabel}</Label>
            <Input
              id="interest-label"
              placeholder={INTEREST_COPY.fieldLabelPlaceholder}
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="interest-started">
                {INTEREST_COPY.fieldStartedAt}
              </Label>
              <Input
                id="interest-started"
                type="date"
                value={form.startedAt}
                onChange={(e) => set("startedAt", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="interest-expires">
                {INTEREST_COPY.fieldExpiresAt}
              </Label>
              <Input
                id="interest-expires"
                type="date"
                value={form.expiresAt}
                onChange={(e) => set("expiresAt", e.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {INTEREST_COPY.fieldExpiresAtHint}
          </p>

          <div className="grid gap-2">
            <Label htmlFor="interest-note">{INTEREST_COPY.fieldNote}</Label>
            <Textarea
              id="interest-note"
              rows={2}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {INTEREST_COPY.cancel}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? INTEREST_COPY.saving : INTEREST_COPY.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
