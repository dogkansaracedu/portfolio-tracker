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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "rename"
  initialName: string
  onSubmit: (name: string) => Promise<void>
}

export function ScenarioNameDialog({
  open,
  onOpenChange,
  mode,
  initialName,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  // Re-seed the field each time the dialog opens (adjusting state during
  // render, not in an effect — no cascading re-render).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setName(initialName)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Save as new scenario" : "Rename scenario"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Saves the current inputs as a new retirement scenario."
              : "Renames the active retirement scenario."}
          </DialogDescription>
        </DialogHeader>

        {/* `contents` keeps the form out of the sheet's flex column, so the
            body scrolls between a fixed header and a pinned footer. */}
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="scenario-name">Name</Label>
              <Input
                id="scenario-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
