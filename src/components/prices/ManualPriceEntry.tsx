import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { upsertManualPrice } from "@/lib/queries/prices"
import type { ExchangeRate } from "@/types/database"

interface ManualPriceEntryProps {
  ticker: string
  rates: ExchangeRate | null
  onSaved?: () => void
  children: React.ReactNode
}

export default function ManualPriceEntry({
  ticker,
  rates,
  onSaved,
  children,
}: ManualPriceEntryProps) {
  const [open, setOpen] = useState(false)
  const [priceUsd, setPriceUsd] = useState("")
  const [priceTry, setPriceTry] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usdTry = rates?.usd_try ?? null

  function handleUsdChange(val: string) {
    setPriceUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && usdTry) {
      setPriceTry((num * usdTry).toFixed(2))
    }
  }

  function handleTryChange(val: string) {
    setPriceTry(val)
    const num = parseFloat(val)
    if (!isNaN(num) && usdTry) {
      setPriceUsd((num / usdTry).toFixed(2))
    }
  }

  async function handleSave() {
    setError(null)
    const usd = priceUsd ? parseFloat(priceUsd) : null
    const tryVal = priceTry ? parseFloat(priceTry) : null

    if (usd == null && tryVal == null) {
      setError("Enter at least one price")
      return
    }

    setSaving(true)
    try {
      await upsertManualPrice(ticker, usd, tryVal)
      setOpen(false)
      setPriceUsd("")
      setPriceTry("")
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setPriceUsd("")
      setPriceTry("")
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<span />}>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Price Manually</DialogTitle>
          <DialogDescription>
            Override the cached price for <strong>{ticker}</strong>. This will
            be marked as a manual entry.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="manual-price-usd">Price (USD)</Label>
            <Input
              id="manual-price-usd"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={priceUsd}
              onChange={(e) => handleUsdChange(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="manual-price-try">Price (TRY)</Label>
            <Input
              id="manual-price-try"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={priceTry}
              onChange={(e) => handleTryChange(e.target.value)}
            />
          </div>

          {!usdTry && (
            <p className="text-xs text-muted-foreground">
              No exchange rate available. USD/TRY auto-conversion disabled.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
