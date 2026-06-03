# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data-dense screens usable on a ~375px phone — add a mobile card fallback to the transactions list and fix toolbars/popovers/headlines that overflow — without touching the transactions edit spreadsheet (only its toolbar wrap).

**Architecture:** The transactions list follows the existing Portfolio pattern (`hidden sm:block` table + `sm:hidden` card list). To avoid duplicating `TransactionRow`'s ~50 lines of display derivation and its actions menu, that logic is extracted once into a pure model module + shared UI pieces that BOTH the table row and the new card consume. Everything else is responsive Tailwind className changes.

**Tech Stack:** React 19, Vite, Tailwind v4, shadcn/Base-UI components, bignumber.js, lucide-react.

**Verification convention (project-specific):** This project has **no automated tests** and ships via commit → push → check on live prod. Each task's verification gate is `npm run typecheck` and `npm run build` passing clean, plus a described visual check. **Do NOT add tests.** **Do NOT run `git commit` per task** — the user batches commits and drives the push themselves; stop at the typecheck/build gate.

**Parallelism note:** Tasks 1→4 are sequential (shared model → shared UI → row refactor → card+wiring). Tasks 5–9 are disjoint files and can be executed in parallel.

---

### Task 1: Extract the pure transaction-row model

**Files:**
- Create: `src/components/transactions/transactionRowModel.ts`

This is pure logic lifted verbatim from `TransactionRow.tsx` (the `formatDate` helper + lines ~72–115 of derivation). No JSX, no hooks — so both the table row and the card can call it.

- [ ] **Step 1: Create the model module**

```ts
import {
  POSITIVE_TYPES,
  TRANSACTION_TYPES,
} from "@/lib/constants/transaction-types"
import { isFiatCurrency, type FiatCurrency } from "@/lib/constants/currencies"
import { convertOnDate, fromUsdOnDate } from "@/lib/pnl/currency"
import { BN_HUNDRED } from "@/lib/config"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import type { ExchangeRate } from "@/types/database"

export function formatTxDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export interface TransactionDisplay {
  sign: string
  amountColor: string
  nativeCurrency: FiatCurrency
  convertedTotal: number | null
  convertedUnitPrice: number | null
  showRealized: boolean
  realizedColor: string
  usdSign: string
  realizedUsdAbs: number
  nativeSign: string
  realizedNativeAbs: number
  realizedPct: string | null
  nativeIsUsd: boolean
}

// Mirrors the derivation that used to live inline in TransactionRow. USD is the
// source of truth for realized returns; the % and the whole realized sub-line's
// color follow the USD sign (a position up in lira can be down in dollars).
export function deriveTransactionDisplay(
  tx: TransactionWithDetails,
  currency: "USD" | "TRY",
  realized: RealizedPnLEntry | null,
  rates: ExchangeRate[],
): TransactionDisplay {
  const isPositive = POSITIVE_TYPES.includes(tx.type)
  const sign = isPositive ? "+" : "-"
  const amountColor = isPositive ? "text-green-600" : "text-red-600"

  const nativeCurrency: FiatCurrency = isFiatCurrency(tx.price_currency)
    ? tx.price_currency
    : currency
  const showConverted = nativeCurrency !== currency && rates.length > 0
  const convertedTotal = showConverted
    ? convertOnDate(tx.total_cost, nativeCurrency, currency, tx.date, rates).toNumber()
    : null
  const convertedUnitPrice = showConverted
    ? convertOnDate(tx.unit_price, nativeCurrency, currency, tx.date, rates).toNumber()
    : null

  const showRealized = tx.type === TRANSACTION_TYPES.SELL && realized != null
  const realizedPnlUsd = realized?.realizedPnlUsd ?? null
  const usdIsGain = realizedPnlUsd ? realizedPnlUsd.gte(0) : false
  const usdSign = usdIsGain ? "+" : "-"
  const realizedColor = usdIsGain ? "text-green-600" : "text-red-600"
  const realizedUsdAbs = realizedPnlUsd ? realizedPnlUsd.abs().toNumber() : 0

  const nativePnlBn =
    realized?.nativePnl != null && realized.nativeCurrency === nativeCurrency
      ? realized.nativePnl
      : realizedPnlUsd
        ? fromUsdOnDate(realizedPnlUsd, nativeCurrency, tx.date, rates)
        : null
  const nativeSign = nativePnlBn?.gte(0) ? "+" : "-"
  const realizedNativeAbs = nativePnlBn ? nativePnlBn.abs().toNumber() : 0

  const realizedPctBn =
    realized && realized.costBasisUsd.gt(0)
      ? realized.realizedPnlUsd.div(realized.costBasisUsd).times(BN_HUNDRED)
      : null
  const realizedPct = realizedPctBn
    ? `${usdSign}${realizedPctBn.abs().toFixed(1)}%`
    : null
  const nativeIsUsd = nativeCurrency === "USD"

  return {
    sign,
    amountColor,
    nativeCurrency,
    convertedTotal,
    convertedUnitPrice,
    showRealized,
    realizedColor,
    usdSign,
    realizedUsdAbs,
    nativeSign,
    realizedNativeAbs,
    realizedPct,
    nativeIsUsd,
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS (no errors). The module is not imported yet, but it must type-check on its own.

---

### Task 2: Extract the shared row UI pieces

**Files:**
- Create: `src/components/transactions/TransactionRowShared.tsx`

Three shared pieces used by BOTH the table row and the card: the actions menu (stateful), the realized-P&L sub-line, and the asset label (icon + ticker + linked-child / external-cash sub-line). All lifted verbatim from `TransactionRow.tsx`.

- [ ] **Step 1: Create the shared UI module**

```tsx
import { useState } from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { AssetIcon } from "@/components/common/AssetIcon"
import { formatCurrency } from "@/lib/prices"
import { useTransactionModal } from "@/contexts/TransactionContext"
import { useTransactionMutations } from "@/hooks/useTransactions"
import { TRANSACTION_TYPES } from "@/lib/constants/transaction-types"
import {
  CURRENCY_SYMBOLS,
  type FiatCurrency,
} from "@/lib/constants/currencies"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import { formatTxDate, type TransactionDisplay } from "./transactionRowModel"

// Dropdown (edit/delete) + delete confirmation dialog. Owns its own local state
// so it can be dropped into either the desktop table row or the mobile card.
export function TransactionRowActions({ tx }: { tx: TransactionWithDetails }) {
  const { openTransactionModal } = useTransactionModal()
  const { removeTransaction } = useTransactionMutations()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleEdit = () => openTransactionModal({ edit: tx })

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await removeTransaction(tx.id, tx.asset_id, tx.platform_id)
      toast.success("Transaction deleted")
      setDeleteOpen(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete transaction",
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Actions</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleEdit}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {tx.type} of {tx.amount}{" "}
              {tx.assets?.ticker ?? ""} on {formatTxDate(tx.date)}. Holdings will
              be recalculated. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Asset icon + ticker, with the linked-child funding line or the "external cash"
// hint underneath. Identical in the table and the card.
export function TransactionAssetLabel({
  tx,
  linkedChild,
}: {
  tx: TransactionWithDetails
  linkedChild: TransactionWithDetails | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {tx.assets && <AssetIcon asset={tx.assets} size="sm" />}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {tx.assets?.ticker ?? "Unknown"}
        </span>
        {linkedChild && (
          <span className="truncate text-xs italic text-muted-foreground">
            {linkedChild.type === TRANSACTION_TYPES.CASH_CREDIT
              ? `+${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} → ${linkedChild.platforms?.name ?? "platform"}`
              : `−${CURRENCY_SYMBOLS[linkedChild.price_currency as FiatCurrency] ?? ""}${Number(linkedChild.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${linkedChild.price_currency} from ${linkedChild.platforms?.name ?? "platform"}`}
          </span>
        )}
        {tx.type === TRANSACTION_TYPES.BUY && !linkedChild && (
          <span className="text-xs italic text-muted-foreground">
            external cash
          </span>
        )}
      </div>
    </div>
  )
}

// Realized P&L sub-line shown under the Total. Renders nothing unless this is a
// sell with realized P&L. Color/sign follow the USD figure (see model).
export function RealizedPnLLine({ display }: { display: TransactionDisplay }) {
  if (!display.showRealized) return null
  const {
    realizedColor,
    nativeIsUsd,
    usdSign,
    realizedUsdAbs,
    realizedPct,
    nativeSign,
    realizedNativeAbs,
    nativeCurrency,
  } = display
  return (
    <div className={`mt-0.5 text-xs font-normal ${realizedColor}`}>
      {nativeIsUsd ? (
        <span>
          {usdSign}
          {formatCurrency(realizedUsdAbs, "USD")}
          {realizedPct && ` (${realizedPct})`}
          <span className="ml-1 text-muted-foreground">P&L</span>
        </span>
      ) : (
        <>
          <div>
            {nativeSign}
            {formatCurrency(realizedNativeAbs, nativeCurrency)}
            <span className="ml-1 text-muted-foreground">P&L</span>
          </div>
          <div className="text-muted-foreground">
            ~{usdSign}
            {formatCurrency(realizedUsdAbs, "USD")}
            {realizedPct && ` (${realizedPct})`}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS. Not imported anywhere yet; must type-check standalone.

---

### Task 3: Refactor TransactionRow to consume the shared pieces

**Files:**
- Modify: `src/components/transactions/TransactionRow.tsx`

Replace the inline derivation, the inline `formatDate`, the asset cell body, the realized sub-line, the actions cell, and the delete dialog with calls into Tasks 1 & 2. **Behavior and markup must be identical** — this is a pure refactor.

- [ ] **Step 1: Replace the whole file with the slimmed-down version**

```tsx
import { TableRow, TableCell } from "@/components/ui/table"
import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { PlatformDot } from "@/components/common/PlatformDot"
import { formatCurrency } from "@/lib/prices"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import { deriveTransactionDisplay } from "./transactionRowModel"
import {
  TransactionRowActions,
  TransactionAssetLabel,
  RealizedPnLLine,
} from "./TransactionRowShared"

interface Props {
  transaction: TransactionWithDetails
  linkedChild?: TransactionWithDetails | null
  currency: "USD" | "TRY"
  realized?: RealizedPnLEntry | null
}

export function TransactionRow({
  transaction,
  linkedChild,
  currency,
  realized,
}: Props) {
  const tx = transaction
  const { rates } = useTransactionData()
  const d = deriveTransactionDisplay(tx, currency, realized ?? null, rates)

  return (
    <TableRow>
      {/* Date */}
      <TableCell className="text-muted-foreground">
        {formatTxDate(tx.date)}
      </TableCell>

      {/* Asset */}
      <TableCell>
        <TransactionAssetLabel tx={tx} linkedChild={linkedChild ?? null} />
      </TableCell>

      {/* Platform */}
      <TableCell>
        {tx.platforms ? (
          <div className="flex items-center gap-1.5">
            <PlatformDot color={tx.platforms.color} />
            <span className="text-sm">{tx.platforms.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </TableCell>

      {/* Type */}
      <TableCell>
        <TransactionTypeBadge type={tx.type} />
      </TableCell>

      {/* Amount */}
      <TableCell className={d.amountColor}>
        <span className="font-medium tabular-nums">
          {d.sign}
          {new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          }).format(tx.amount)}
        </span>
      </TableCell>

      {/* Unit Price */}
      <TableCell className="tabular-nums text-muted-foreground">
        {formatCurrency(tx.unit_price, d.nativeCurrency)}
        {d.convertedUnitPrice !== null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (~{formatCurrency(d.convertedUnitPrice, currency)})
          </span>
        )}
      </TableCell>

      {/* Total */}
      <TableCell className="tabular-nums font-medium">
        {formatCurrency(tx.total_cost, d.nativeCurrency)}
        {d.convertedTotal !== null && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (~{formatCurrency(d.convertedTotal, currency)})
          </span>
        )}
        <RealizedPnLLine display={d} />
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <TransactionRowActions tx={tx} />
      </TableCell>
    </TableRow>
  )
}
```

- [ ] **Step 2: Add the missing `formatTxDate` import**

The version above references `formatTxDate` in the Date cell. Add it to the model import line:

```tsx
import { deriveTransactionDisplay, formatTxDate } from "./transactionRowModel"
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS. No unused-import errors (the old `useState`, `BigNumber`, `AlertDialog`, `DropdownMenu`, `AssetIcon`, `convertOnDate`, etc. imports are all gone).

- [ ] **Step 4: Visual sanity (desktop)**

Confirm the `/transactions` table still renders identically: dates, asset labels with linked-child/external-cash lines, converted amounts in parentheses, realized P&L sub-line on sells, and the ⋯ actions menu (edit + delete dialog) all work.

---

### Task 4: Add the mobile card + wire the fallback into TransactionList

**Files:**
- Create: `src/components/transactions/TransactionRowCard.tsx`
- Modify: `src/components/transactions/TransactionList.tsx`

- [ ] **Step 1: Create the card component**

```tsx
import { TransactionTypeBadge } from "@/components/transactions/TransactionTypeSelector"
import { PlatformDot } from "@/components/common/PlatformDot"
import { formatCurrency } from "@/lib/prices"
import { useTransactionData } from "@/contexts/TransactionDataContext"
import type { TransactionWithDetails } from "@/lib/queries/transactions"
import type { RealizedPnLEntry } from "@/lib/pnl/types"
import { deriveTransactionDisplay, formatTxDate } from "./transactionRowModel"
import {
  TransactionRowActions,
  TransactionAssetLabel,
  RealizedPnLLine,
} from "./TransactionRowShared"

interface Props {
  transaction: TransactionWithDetails
  linkedChild?: TransactionWithDetails | null
  currency: "USD" | "TRY"
  realized?: RealizedPnLEntry | null
}

export function TransactionRowCard({
  transaction,
  linkedChild,
  currency,
  realized,
}: Props) {
  const tx = transaction
  const { rates } = useTransactionData()
  const d = deriveTransactionDisplay(tx, currency, realized ?? null, rates)

  return (
    <div className="rounded-lg border p-3">
      {/* Top: date · type badge + actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {formatTxDate(tx.date)}
        </span>
        <div className="flex items-center gap-1">
          <TransactionTypeBadge type={tx.type} />
          <TransactionRowActions tx={tx} />
        </div>
      </div>

      {/* Middle: asset · platform */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <TransactionAssetLabel tx={tx} linkedChild={linkedChild ?? null} />
        {tx.platforms ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <PlatformDot color={tx.platforms.color} />
            <span className="text-sm">{tx.platforms.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </div>

      {/* Bottom: amount · total (+ realized) */}
      <div className="mt-2 flex items-end justify-between gap-2 border-t pt-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Amount</span>
          <span className={`font-medium tabular-nums ${d.amountColor}`}>
            {d.sign}
            {new Intl.NumberFormat("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 8,
            }).format(tx.amount)}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            @ {formatCurrency(tx.unit_price, d.nativeCurrency)}
          </span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="tabular-nums font-medium">
            {formatCurrency(tx.total_cost, d.nativeCurrency)}
            {d.convertedTotal !== null && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (~{formatCurrency(d.convertedTotal, currency)})
              </span>
            )}
          </span>
          <RealizedPnLLine display={d} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the fallback into TransactionList**

Replace the `return (<Table>...)` block (the success branch only — keep the `loading` and empty-state branches unchanged) with a fragment holding the `hidden sm:block` table and the `sm:hidden` card list:

```tsx
  return (
    <>
      {/* Desktop table (hidden below 640px) */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="w-12 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                currency={currency}
                linkedChild={childMap?.get(tx.id) ?? null}
                realized={realizedByTx?.get(tx.id) ?? null}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list (visible below 640px) */}
      <div className="flex flex-col gap-2 sm:hidden">
        {transactions.map((tx) => (
          <TransactionRowCard
            key={tx.id}
            transaction={tx}
            currency={currency}
            linkedChild={childMap?.get(tx.id) ?? null}
            realized={realizedByTx?.get(tx.id) ?? null}
          />
        ))}
      </div>
    </>
  )
```

- [ ] **Step 3: Add the card import to TransactionList**

Add next to the existing `TransactionRow` import:

```tsx
import { TransactionRowCard } from "@/components/transactions/TransactionRowCard"
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Visual check**

At ≥640px the table shows (unchanged). Below 640px (DevTools 375px) the table is hidden and a stacked card list shows: date + type badge + ⋯ on top, asset + platform in the middle, amount/@unit-price and total (+ realized sub-line) on the bottom. No horizontal scroll.

---

### Task 5: Make the Portfolio filters toolbar wrap

**Files:**
- Modify: `src/components/portfolio/PortfolioFilters.tsx:54`

- [ ] **Step 1: Add `flex-wrap` (and keep right-alignment on desktop) to the inner control cluster**

Change line 54 from:

```tsx
      <div className="flex items-center gap-3">
```

to:

```tsx
      <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
```

- [ ] **Step 2: Verify + visual**

Run: `npm run typecheck && npm run build` → PASS.
At 375px the two ToggleGroups and the Sort select wrap onto multiple lines instead of clipping off the right edge.

---

### Task 6: Make the Performance header + range selector wrap

**Files:**
- Modify: `src/pages/PerformancePage.tsx:66`
- Modify: `src/components/performance/TimeRangeSelector.tsx:12`

- [ ] **Step 1: Stack the header on mobile**

In `PerformancePage.tsx`, change line 66 from:

```tsx
      <div className="flex items-center justify-between">
```

to:

```tsx
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
```

- [ ] **Step 2: Let the range buttons wrap**

In `TimeRangeSelector.tsx`, change line 12 from:

```tsx
    <div className="flex gap-1">
```

to:

```tsx
    <div className="flex flex-wrap gap-1">
```

- [ ] **Step 3: Verify + visual**

Run: `npm run typecheck && npm run build` → PASS.
At 375px the title block sits above the range buttons; the 6 buttons wrap rather than overflow.

---

### Task 7: Wrap the transactions edit toolbar (no grid changes)

**Files:**
- Modify: `src/pages/TransactionsEditPage.tsx:40` (header) and `:99` (footer)

Only the toolbars wrap — the spreadsheet grid is intentionally left as horizontal-scroll.

- [ ] **Step 1: Wrap the header row**

Change line 40 from:

```tsx
      <header className="flex shrink-0 items-center justify-between gap-4 border-b bg-zinc-900 px-6 py-4 text-zinc-100">
```

to:

```tsx
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-zinc-900 px-4 py-4 text-zinc-100 md:gap-4 md:px-6">
```

- [ ] **Step 2: Let the header's left cluster wrap too**

Change line 41 from:

```tsx
        <div className="flex items-center gap-4">
```

to:

```tsx
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
```

- [ ] **Step 3: Wrap the footer row**

Change line 99 from:

```tsx
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t bg-zinc-900 px-6 py-4 text-zinc-100">
```

to:

```tsx
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-zinc-900 px-4 py-4 text-zinc-100 md:gap-4 md:px-6">
```

- [ ] **Step 4: Verify + visual**

Run: `npm run typecheck && npm run build` → PASS.
At 375px the header (title + Add row + Import + Cancel) and footer (Discard + ready-badge + Save) controls wrap instead of clipping off-screen.

---

### Task 8: Cap over-wide popovers to the viewport

**Files:**
- Modify: `src/components/transactions/AssetSearchSelect.tsx:50`
- Modify: `src/components/transactions/sheet/ImportPopover.tsx:80`
- Modify: `src/components/transactions/sheet/MidasPdfImportButton.tsx:83`

- [ ] **Step 1: AssetSearchSelect**

Change line 50 from:

```tsx
      <PopoverContent className="w-[350px] p-0" align="start">
```

to:

```tsx
      <PopoverContent className="w-[350px] max-w-[calc(100vw-2rem)] p-0" align="start">
```

- [ ] **Step 2: ImportPopover**

Change line 80 from:

```tsx
      <PopoverContent className="w-[560px] p-0" align="start">
```

to:

```tsx
      <PopoverContent className="w-[560px] max-w-[calc(100vw-2rem)] p-0" align="start">
```

- [ ] **Step 3: MidasPdfImportButton**

Change line 83 from:

```tsx
      <PopoverContent className="w-[480px] p-0" align="start">
```

to:

```tsx
      <PopoverContent className="w-[480px] max-w-[calc(100vw-2rem)] p-0" align="start">
```

- [ ] **Step 4: Verify + visual**

Run: `npm run typecheck && npm run build` → PASS.
At 375px the asset-search popover (and the edit-page import popovers) no longer exceed the screen width or cause horizontal scroll.

---

### Task 9: Scale down large headline text on mobile

**Files:**
- Modify: `src/components/dashboard/DashboardHero.tsx:388`
- Modify: `src/components/dashboard/NetWorthCard.tsx:36`

- [ ] **Step 1: DashboardHero headline**

Change line 388 from:

```tsx
              "text-3xl font-bold tracking-tight md:text-4xl",
```

to:

```tsx
              "text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl",
```

- [ ] **Step 2: NetWorthCard headline**

Change line 36 from:

```tsx
            <p className="text-3xl font-bold tracking-tight">
```

to:

```tsx
            <p className="text-2xl font-bold tracking-tight sm:text-3xl">
```

- [ ] **Step 3: Verify + visual**

Run: `npm run typecheck && npm run build` → PASS.
At 375px large currency headlines are slightly smaller and wrap less; at ≥640px they look unchanged.

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS, clean.

- [ ] **Step 2: CategoryAttribution visual check (no code change)**

Open `/performance` at 375px. The 5-column attribution table is wrapped by the shadcn `<Table>` (`overflow-x-auto`), so it scrolls horizontally inside its card without breaking the page. Confirm it does; no change needed.

- [ ] **Step 3: Hand back to the user for commit + prod push**

Per project convention, do not commit. Summarize the changed files so the user can review, commit, and push to prod to verify on a real phone.

---

## Self-Review

**Spec coverage:**
- Item 2 (transactions list mobile cards) → Tasks 1–4 ✓
- Item 3 (portfolio filters wrap) → Task 5 ✓
- Item 4 (performance header + selector wrap) → Task 6 ✓
- Item 1b (edit toolbar wrap, no grid rewrite) → Task 7 ✓
- Item 7 (over-wide popovers) → Task 8 ✓
- Item 6 (headline scaling) → Task 9 ✓
- Item 5 (CategoryAttribution — verify only) → Task 10 Step 2 ✓
- DRY constraint (shared logic, no duplication) → Tasks 1–2 extract the model + shared UI; Tasks 3–4 consume them ✓
- Color note (don't fix `text-green-600/red-600` here) → preserved verbatim in the model ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `deriveTransactionDisplay(tx, currency, realized, rates)` and `TransactionDisplay` defined in Task 1 are used with matching signatures in Tasks 2–4. `formatTxDate` defined in Task 1, imported in Tasks 2–4. `TransactionRowActions`/`TransactionAssetLabel`/`RealizedPnLLine` defined in Task 2, imported in Tasks 3–4 with matching props. `realized` is normalized to `realized ?? null` at every call site to match the non-optional `RealizedPnLEntry | null` parameter. ✓
