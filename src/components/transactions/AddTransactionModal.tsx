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
import { FundingSourceSelect } from "./FundingSourceSelect"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactions } from "@/hooks/useTransactions"
import { useHoldings } from "@/hooks/useHoldings"
import { useAuth } from "@/hooks/useAuth"
import { fetchLinkedChild } from "@/lib/queries/transactions"
import { validateFundingCash } from "@/lib/cash"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"
import {
  CURRENCY_SYMBOLS,
  SUPPORTED_FIAT_CURRENCIES,
  DEFAULT_CURRENCY,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import { toast } from "sonner"
import type { TransactionType, Asset, Platform } from "@/types/database"

// The date picker tracks a local-timezone Date. .toISOString() converts to
// UTC, which can shift the calendar day backward (e.g. TR midnight on Jan 21
// → 2026-01-20T21:00Z). Backend uses date.slice(0,10) for snapshots so the
// recorded day must match the user's intent. This helper formats the
// picker's local Y-M-D as UTC midnight, preserving the chosen day.
function localDayAsUtcMidnight(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}T00:00:00Z`
}

interface Props {
  assets: Asset[]
  platforms: Platform[]
  onSuccess?: () => void
}

export function AddTransactionModal({ assets, platforms, onSuccess }: Props) {
  const { user } = useAuth()
  const { modalState, closeTransactionModal } = useTransactionModal()
  const { addTransaction, editTransaction } = useTransactions()
  const { holdings, getTotalBalance, getHoldingsForAsset } = useHoldings()

  const editing = modalState.editingTransaction
  const isEdit = Boolean(editing)

  const [type, setType] = useState<TransactionType>("buy")
  const [assetId, setAssetId] = useState<string>("")
  const [platformId, setPlatformId] = useState<string>("")
  const [date, setDate] = useState<Date>(new Date())
  const [amount, setAmount] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [priceCurrency, setPriceCurrency] = useState("USD")
  const [fee, setFee] = useState("")
  const [feeCurrency, setFeeCurrency] = useState("USD")
  const [destPlatformId, setDestPlatformId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [fundingPlatformId, setFundingPlatformId] = useState<string | null>(null)
  const [existingChild, setExistingChild] = useState<{
    amount: string
    platformId: string
  } | null>(null)
  const [fundingError, setFundingError] = useState<string | null>(null)

  // Hydrate form from edit target / prefill / defaults whenever the modal opens.
  // Prior implementation only handled prefilledAssetId on its own effect, which
  // left edit fields stale across openings.
  useEffect(() => {
    if (!modalState.isOpen) return
    if (editing) {
      setType(editing.type)
      setAssetId(editing.asset_id)
      setPlatformId(editing.platform_id)
      setDate(new Date(editing.date))
      setAmount(String(editing.amount))
      setUnitPrice(String(editing.unit_price))
      setPriceCurrency(editing.price_currency || "USD")
      setFee(editing.fee ? String(editing.fee) : "")
      setFeeCurrency(editing.fee_currency || "USD")
      setDestPlatformId("")
      setNotes(editing.notes ?? "")
      ;(async () => {
        if (editing.type !== TRANSACTION_TYPES.BUY) {
          setFundingPlatformId(null)
          setExistingChild(null)
          return
        }
        const child = await fetchLinkedChild(editing.id)
        if (child) {
          setFundingPlatformId(child.platform_id)
          setExistingChild({
            amount: String(child.amount),
            platformId: child.platform_id,
          })
        } else {
          setFundingPlatformId(null)
          setExistingChild(null)
        }
      })()
      return
    }
    setType("buy")
    setAssetId(modalState.prefilledAssetId ?? "")
    setPlatformId(modalState.prefilledPlatformId ?? "")
    setDate(new Date())
    setAmount("")
    setUnitPrice("")
    setPriceCurrency(DEFAULT_CURRENCY)
    setFee("")
    setFeeCurrency(DEFAULT_CURRENCY)
    setDestPlatformId("")
    setNotes("")
    setFundingPlatformId(null)
    setExistingChild(null)
    setFundingError(null)
  }, [
    modalState.isOpen,
    editing,
    modalState.prefilledAssetId,
    modalState.prefilledPlatformId,
  ])

  const selectedAsset = assets.find((a) => a.id === assetId)
  const parsedAmount = parseFloat(amount) || 0
  const parsedPrice = parseFloat(unitPrice) || 0
  const totalCost = parsedAmount * parsedPrice

  useEffect(() => {
    if (type !== TRANSACTION_TYPES.BUY || !fundingPlatformId) {
      setFundingError(null)
      return
    }
    const fiatAsset = assets.find(
      (a) => a.category === "fiat" && a.ticker === priceCurrency,
    )
    if (!fiatAsset) {
      setFundingError(null)
      return
    }
    const fiatHolding = holdings.find(
      (h) => h.asset_id === fiatAsset.id && h.platform_id === fundingPlatformId,
    )
    const cashOnFunding = String(fiatHolding?.balance ?? "0")
    const fundingPlatformName =
      platforms.find((p) => p.id === fundingPlatformId)?.name ?? "platform"
    const offset =
      existingChild && existingChild.platformId === fundingPlatformId
        ? existingChild.amount
        : null
    const err = validateFundingCash({
      cashOnFunding,
      totalCost: parsedAmount * parsedPrice,
      fee: parseFloat(fee) || 0,
      feeCurrency: fee ? feeCurrency : null,
      priceCurrency,
      existingChildOffset: offset,
      fundingPlatformName,
    })
    setFundingError(err)
  }, [
    type,
    fundingPlatformId,
    priceCurrency,
    parsedAmount,
    parsedPrice,
    fee,
    feeCurrency,
    assets,
    platforms,
    existingChild,
    holdings,
  ])

  const showPriceFields = ["buy", "sell", "dividend", "interest"].includes(type)
  const showFeeFields = ["buy", "sell"].includes(type)
  const isTransfer = type === "transfer_out"

  // Get the balance for the selected asset on the selected platform
  const holdingsForAsset = assetId ? getHoldingsForAsset(assetId) : []
  const selectedHolding = holdingsForAsset.find(
    (h) => h.platform_id === platformId,
  )
  const selectedPlatformBalance = selectedHolding?.balance ?? 0
  const totalBalance = assetId ? getTotalBalance(assetId) : 0

  // Validation: check balance on the specific platform for sell/transfer/fee.
  // Skip in edit mode because the existing tx is already counted in the balance —
  // a strict check would falsely flag the very tx being edited as overdrawing.
  const isOverBalance =
    !isEdit &&
    (type === "sell" || type === "transfer_out" || type === "fee") &&
    parsedAmount > selectedPlatformBalance

  const canSubmit =
    assetId &&
    platformId &&
    parsedAmount > 0 &&
    !isOverBalance &&
    !fundingError &&
    !submitting &&
    (showPriceFields ? parsedPrice > 0 : true) &&
    (isTransfer && !isEdit ? destPlatformId && destPlatformId !== platformId : true)

  const handleSubmit = async () => {
    if (!user || !canSubmit) return
    setSubmitting(true)

    try {
      const payload = {
        asset_id: assetId,
        platform_id: platformId,
        type,
        date: localDayAsUtcMidnight(date),
        amount: parsedAmount,
        unit_price: parsedPrice || 0,
        price_currency: priceCurrency,
        total_cost: totalCost,
        fee: parseFloat(fee) || 0,
        fee_currency: fee ? feeCurrency : null,
        related_asset_id: null,
        linked_tx_id: null,
        notes: notes || null,
      }

      if (isEdit && editing) {
        await editTransaction(
          editing.id,
          payload,
          { assetId: editing.asset_id, platformId: editing.platform_id },
          { fundingPlatformId },
        )
        toast.success("Transaction updated")
      } else {
        await addTransaction(payload, { fundingPlatformId })

        // For transfer_out, create matching transfer_in on the destination platform.
        // We don't auto-pair on edit — the source side and the destination side
        // are independent rows after creation, edit them individually.
        if (isTransfer && destPlatformId) {
          const selectedPlatform = platforms.find((p) => p.id === platformId)
          await addTransaction({
            asset_id: assetId,
            platform_id: destPlatformId,
            type: "transfer_in",
            date: localDayAsUtcMidnight(date),
            amount: parsedAmount,
            unit_price: parsedPrice || 0,
            price_currency: priceCurrency,
            total_cost: totalCost,
            fee: 0,
            fee_currency: null,
            related_asset_id: null,
            linked_tx_id: null,
            notes: notes
              ? `Transfer from ${selectedPlatform?.name ?? "unknown"}: ${notes}`
              : `Transfer from ${selectedPlatform?.name ?? "unknown"}`,
          })
        }
        toast.success("Transaction recorded")
      }
      closeTransactionModal()
      onSuccess?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save transaction",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={modalState.isOpen} onOpenChange={(open) => !open && closeTransactionModal()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Transaction Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <TransactionTypeSelector value={type} onChange={setType} />
          </div>

          {/* Asset Selection (global) */}
          <div className="space-y-2">
            <Label>Asset</Label>
            <AssetSearchSelect
              assets={assets}
              value={assetId}
              onChange={setAssetId}
            />
            {selectedAsset && (
              <p className="text-xs text-muted-foreground">
                Total balance: {totalBalance} {selectedAsset.ticker}
              </p>
            )}
          </div>

          {/* Platform Selection */}
          <div className="space-y-2">
            <Label>{isTransfer && !isEdit ? "Source Platform" : "Platform"}</Label>
            <Select
              value={platformId}
              onValueChange={(v) => v && setPlatformId(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string) => {
                    const p = value ? platforms.find((x) => x.id === value) : null
                    if (!p) return "Select platform..."
                    return (
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name}
                      </span>
                    )
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {platformId && selectedAsset && (type === "sell" || type === "transfer_out" || type === "fee") && (
              <p className="text-xs text-muted-foreground">
                Balance on this platform: {selectedPlatformBalance} {selectedAsset.ticker}
              </p>
            )}
          </div>

          {/* Transfer destination platform (creation only — paired tx) */}
          {isTransfer && !isEdit && (
            <div className="space-y-2">
              <Label>Destination Platform</Label>
              <Select
                value={destPlatformId}
                onValueChange={(v) => v && setDestPlatformId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => {
                      const p = value ? platforms.find((x) => x.id === value) : null
                      if (!p) return "Select destination..."
                      return (
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </span>
                      )
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {platforms
                    .filter((p) => p.id !== platformId)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
                Insufficient balance on this platform (have: {selectedPlatformBalance}{" "}
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
                    {SUPPORTED_FIAT_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Total Cost display */}
          {showPriceFields && totalCost > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              Total: {CURRENCY_SYMBOLS[priceCurrency as FiatCurrency] ?? ""}
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
                    {SUPPORTED_FIAT_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Funding source (buy only) */}
          {type === TRANSACTION_TYPES.BUY && (
            <div className="space-y-2">
              <Label>Funding source</Label>
              <FundingSourceSelect
                value={fundingPlatformId}
                onChange={setFundingPlatformId}
                assets={assets}
                platforms={platforms}
                priceCurrency={priceCurrency}
                existingChildAmount={existingChild?.amount ?? null}
                existingChildPlatformId={existingChild?.platformId ?? null}
              />
              {fundingError && (
                <p className="text-xs text-destructive">{fundingError}</p>
              )}
            </div>
          )}

          {/* Sale proceeds confirmation (sell only) */}
          {type === TRANSACTION_TYPES.SELL && parsedAmount > 0 && parsedPrice > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Sale proceeds: {CURRENCY_SYMBOLS[priceCurrency as FiatCurrency] ?? ""}
              {(parsedAmount * parsedPrice - (parseFloat(fee) || 0)).toLocaleString(
                undefined,
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              )}{" "}
              → credited to{" "}
              {platforms.find((p) => p.id === platformId)?.name ?? "the trading platform"}{" "}
              {priceCurrency}
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
            {submitting
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
