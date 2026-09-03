import { useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogBody,
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
  SCENARIO_NAME_DIALOG_COPY,
  SCENARIO_WRITE_FAILED,
} from "./constants"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "rename"
  initialName: string
  /** Rejects when the write fails — the dialog then stays open and says why. */
  onSubmit: (name: string) => Promise<void>
}

/**
 * Names a scenario, on the way to creating one or renaming the active one.
 *
 * The form owns the outcome, like every other dialog form here: it closes only
 * once the write has landed, and a failure keeps it open with the typed name
 * and the reason under the field — a rename that silently closed on a rejected
 * write was indistinguishable from one that worked.
 */
export function ScenarioNameDialog({
  open,
  onOpenChange,
  mode,
  initialName,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Re-seed the field each time the dialog opens (adjusting state during
  // render, not in an effect — no cascading re-render).
  //
  // `mode` is latched here for the same reason: the caller drops its "which
  // dialog" state the moment this closes, and reading the prop live swapped
  // the heading and the description to the create wording while the dialog was
  // still animating out.
  const [openMode, setOpenMode] = useState(mode)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(initialName)
      setOpenMode(mode)
      setError(null)
    }
  }
  const copy = SCENARIO_NAME_DIALOG_COPY[openMode]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : SCENARIO_WRITE_FAILED,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {/* `contents` keeps the form out of the sheet's flex column, so the
            body scrolls between a fixed header and a pinned footer. */}
        <form onSubmit={handleSubmit} className="contents">
          {/* `content-start`: `DialogBody` is `flex-1`, so on a phone (a
              full-height sheet) a one-field grid stretched its rows apart and
              pushed the error line a screen below the field it explains. */}
          <DialogBody className="grid content-start gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="scenario-name">
                {SCENARIO_NAME_DIALOG_COPY.nameLabel}
              </Label>
              <Input
                id="scenario-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
          </DialogBody>
          {error && <p className="pt-2 text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {SCENARIO_NAME_DIALOG_COPY.cancel}
            </DialogClose>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting
                ? SCENARIO_NAME_DIALOG_COPY.saving
                : SCENARIO_NAME_DIALOG_COPY.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
