import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { TransactionTypeSelector } from "./TransactionTypeSelector"
import { AssetSearchSelect } from "./AssetSearchSelect"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactions } from "@/hooks/useTransactions"
import { useAuth } from "@/hooks/useAuth"
import { toast } from "sonner"
import type { TransactionType, Asset, Platform } from "@/types/database"

interface AssetWithPlatform extends Asset {
  platforms: { name: string; color: string }
}

interface Props {
  assets: AssetWithPlatform[]
  platforms: Platform[]
  onSuccess?: () => void
}

export function AddTransactionModal({ assets, platforms, onSuccess }: Props) {
  const { user } = useAuth()
  const { modalState, closeTransactionModal } = useTransactionModal()
  const { addTransaction } = useTransactions()

  const [type, setType] = useState<TransactionType>("buy")
  const [assetId, setAssetId] = useState<string>("")
  const [date, setDate] = useState<Date>(new Date())
  const [amount, setAmount] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [priceCurrency, setPriceCurrency] = useState("USD")
  const [fee, setFee] = useState("")
  const [feeCurrency, setFeeCurrency] = useState("USD")
  const [relatedAssetId, setRelatedAssetId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Pre-fill asset when modal opens with a preset
  useEffect(() => {
    if (modalState.prefilledAssetId) {
      setAssetId(modalState.prefilledAssetId)
    }
  }, [modalState.prefilledAssetId])

  // Reset form when modal closes
  useEffect(() => {
    if (!modalState.isOpen) {
      setType("buy")
      setAssetId("")
      setDate(new Date())
      setAmount("")
      setUnitPrice("")
      setPriceCurrency("USD")
      setFee("")
      setFeeCurrency("USD")
      setRelatedAssetId("")
      setNotes("")
    }
  }, [modalState.isOpen])

  const selectedAsset = assets.find((a) => a.id === assetId)
  const parsedAmount = parseFloat(amount) || 0
  const parsedPrice = parseFloat(unitPrice) || 0
  const totalCost = parsedAmount * parsedPrice

  const showPriceFields = ["buy", "sell", "dividend", "interest"].includes(type)
  const showFeeFields = ["buy", "sell"].includes(type)
  const showTransferFields = type === "transfer_out"

  // Validation
  const selectedBalance = selectedAsset?.balance ?? 0
  const isOverBalance =
    (type === "sell" || type === "transfer_out" || type === "fee") &&
    parsedAmount > selectedBalance

  const canSubmit =
    assetId &&
    parsedAmount > 0 &&
    !isOverBalance &&
    !submitting &&
    (showPriceFields ? parsedPrice > 0 : true) &&
    (showTransferFields ? relatedAssetId : true)

  const handleSubmit = async () => {
    if (!user || !canSubmit) return
    setSubmitting(true)

    try {
      // Create main transaction
      await addTransaction({
        asset_id: assetId,
        type,
        date: date.toISOString(),
        amount: parsedAmount,
        unit_price: parsedPrice || 0,
        price_currency: priceCurrency,
        total_cost: totalCost,
        fee: parseFloat(fee) || 0,
        fee_currency: fee ? feeCurrency : null,
        related_asset_id: relatedAssetId || null,
        notes: notes || null,
      })

      // For transfer_out, create matching transfer_in
      if (type === "transfer_out" && relatedAssetId) {
        await addTransaction({
          asset_id: relatedAssetId,
          type: "transfer_in",
          date: date.toISOString(),
          amount: parsedAmount,
          unit_price: parsedPrice || 0,
          price_currency: priceCurrency,
          total_cost: totalCost,
          fee: 0,
          fee_currency: null,
          related_asset_id: assetId,
          notes: notes ? `Transfer from ${selectedAsset?.name}: ${notes}` : null,
        })
      }

      toast.success("Transaction recorded")
      closeTransactionModal()
      onSuccess?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create transaction",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={modalState.isOpen} onOpenChange={(open) => !open && closeTransactionModal()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Transaction Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <TransactionTypeSelector value={type} onChange={setType} />
          </div>

          {/* Asset Selection */}
          <div className="space-y-2">
            <Label>Asset</Label>
            <AssetSearchSelect
              assets={assets}
              platforms={platforms}
              value={assetId}
              onChange={setAssetId}
            />
            {selectedAsset && (
              <p className="text-xs text-muted-foreground">
                Current balance: {selectedAsset.balance} {selectedAsset.ticker}
              </p>
            )}
          </div>

          {/* Transfer destination */}
          {showTransferFields && (
            <div className="space-y-2">
              <Label>Destination Asset</Label>
              <AssetSearchSelect
                assets={assets}
                platforms={platforms}
                value={relatedAssetId}
                onChange={setRelatedAssetId}
                filterTicker={selectedAsset?.ticker}
              />
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label>Date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                className="inline-flex w-full items-center justify-start rounded-md border border-input bg-background px-3 py-2 text-left text-sm font-normal ring-offset-background hover:bg-accent hover:text-accent-foreground"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "PPP")}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (d) setDate(d)
                    setCalendarOpen(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {isOverBalance && (
              <p className="text-xs text-destructive">
                Insufficient balance (have: {selectedBalance}{" "}
                {selectedAsset?.ticker})
              </p>
            )}
          </div>

          {/* Unit Price + Currency */}
          {showPriceFields && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label>Unit Price</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={priceCurrency} onValueChange={(v) => v && setPriceCurrency(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Total Cost display */}
          {showPriceFields && totalCost > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              Total: {priceCurrency === "TRY" ? "₺" : priceCurrency === "EUR" ? "€" : "$"}
              {totalCost.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          )}

          {/* Fee */}
          {showFeeFields && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label>Fee (optional)</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={feeCurrency} onValueChange={(v) => v && setFeeCurrency(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Add a note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeTransactionModal}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Saving..." : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
