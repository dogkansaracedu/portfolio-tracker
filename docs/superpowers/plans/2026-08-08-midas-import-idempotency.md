# Midas Import Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-importing an overlapping Midas PDF statement must not create duplicate transactions — already-imported rows are excluded at import time with a visible "Already imported: N" count.

**Architecture:** A pure count-based dedup function (`dedupeImportedRows`) compares parsed PDF rows against existing DB transactions (fetched on demand for the statement's date range, Midas platform only) plus rows already sitting unsaved in the grid. Duplicates never enter the grid. Spec: `docs/superpowers/specs/2026-08-08-midas-import-idempotency-design.md`.

**Tech Stack:** React + TypeScript, bignumber.js for numeric comparison, Vitest for the pure function, Supabase query via existing `fetchTransactions`.

## Global Constraints

- All money/quantity comparisons go through bignumber.js — never string or float equality on numbers.
- No new hardcoded string literals where a constant exists (`MIDAS_PLATFORM_NAME` from `@/lib/constants/brokers`).
- Verify with `npm test` AND `npm run build` (typecheck-only is not enough) before declaring done.
- Update `docs/components/04-transaction-system.md` (behavioral, stack-free) and `docs/components/technical/04-transaction-system.md` (technical) in the same change.

---

### Task 1: Pure dedup function `dedupeImportedRows` (TDD)

**Files:**
- Create: `src/components/transactions/sheet/dedupeImportedRows.ts`
- Test: `src/components/transactions/sheet/dedupeImportedRows.test.ts`

**Interfaces:**
- Consumes: `isNewAssetSentinel` from `./sentinel`, `BigNumber` from `bignumber.js`.
- Produces (used by Task 3):
  ```ts
  export interface DedupCandidate {
    date: string          // YYYY-MM-DD
    assetId: string
    type: string
    amount: string
    unitPrice: string
    priceCurrency: string
  }
  export function dedupeImportedRows<T extends DedupCandidate>(
    parsed: T[],
    existing: DedupCandidate[],
  ): { kept: T[]; duplicates: number }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/transactions/sheet/dedupeImportedRows.test.ts
import { describe, expect, it } from "vitest"
import { dedupeImportedRows, type DedupCandidate } from "./dedupeImportedRows"

function row(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    date: "2026-07-01",
    assetId: "asset-1",
    type: "buy",
    amount: "10",
    unitPrice: "14.5",
    priceCurrency: "USD",
    ...overrides,
  }
}

describe("dedupeImportedRows", () => {
  it("keeps everything when nothing exists", () => {
    const parsed = [row(), row({ date: "2026-07-02" })]
    const result = dedupeImportedRows(parsed, [])
    expect(result.kept).toHaveLength(2)
    expect(result.duplicates).toBe(0)
  })

  it("drops an exact overlap", () => {
    const result = dedupeImportedRows([row()], [row()])
    expect(result.kept).toHaveLength(0)
    expect(result.duplicates).toBe(1)
  })

  it("uses count semantics: 2 existing + 3 parsed → 1 kept", () => {
    const parsed = [row(), row(), row()]
    const existing = [row(), row()]
    const result = dedupeImportedRows(parsed, existing)
    expect(result.kept).toHaveLength(1)
    expect(result.duplicates).toBe(2)
  })

  it("matches numerically equal amounts and prices ('14.50' vs '14.5', '10.0' vs '10')", () => {
    const parsed = [row({ amount: "10.0", unitPrice: "14.50" })]
    const existing = [row({ amount: "10", unitPrice: "14.5" })]
    const result = dedupeImportedRows(parsed, existing)
    expect(result.kept).toHaveLength(0)
    expect(result.duplicates).toBe(1)
  })

  it("treats different quantity/price/type/date/currency as distinct", () => {
    const existing = [row()]
    const variants = [
      row({ amount: "11" }),
      row({ unitPrice: "14.6" }),
      row({ type: "sell" }),
      row({ date: "2026-07-02" }),
      row({ priceCurrency: "TRY" }),
    ]
    const result = dedupeImportedRows(variants, existing)
    expect(result.kept).toHaveLength(5)
    expect(result.duplicates).toBe(0)
  })

  it("matches currency case-insensitively", () => {
    const result = dedupeImportedRows(
      [row({ priceCurrency: "usd" })],
      [row({ priceCurrency: "USD" })],
    )
    expect(result.duplicates).toBe(1)
  })

  it("never matches unresolved-asset sentinel rows", () => {
    const parsed = [row({ assetId: "new:VOO" })]
    const existing = [row({ assetId: "new:VOO" })]
    const result = dedupeImportedRows(parsed, existing)
    expect(result.kept).toHaveLength(1)
    expect(result.duplicates).toBe(0)
  })

  it("does not choke on unparseable numbers (falls back to trimmed string compare)", () => {
    const result = dedupeImportedRows(
      [row({ amount: "" })],
      [row({ amount: "" })],
    )
    expect(result.duplicates).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/transactions/sheet/dedupeImportedRows.test.ts`
Expected: FAIL — cannot resolve `./dedupeImportedRows`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/transactions/sheet/dedupeImportedRows.ts
import BigNumber from "bignumber.js"
import { isNewAssetSentinel } from "./sentinel"

/** The fields that identify a transaction for import dedup. Fee and notes are
 *  deliberately excluded — fees may have been hand-edited after a prior
 *  import. Dates are day-granularity, so identity is count-based, not
 *  existence-based (see dedupeImportedRows). */
export interface DedupCandidate {
  date: string
  assetId: string
  type: string
  amount: string
  unitPrice: string
  priceCurrency: string
}

/** Normalize a numeric string so "14.50" and "14.5" produce the same key.
 *  Unparseable values fall back to the trimmed raw string. */
function normNum(raw: string): string {
  const bn = new BigNumber(raw.trim())
  return bn.isNaN() ? raw.trim() : bn.toString()
}

function dedupKey(c: DedupCandidate): string {
  return [
    c.date,
    c.assetId,
    c.type,
    normNum(c.amount),
    normNum(c.unitPrice),
    c.priceCurrency.trim().toUpperCase(),
  ].join("|")
}

/** Count-based duplicate filter for imported rows.
 *
 *  Transactions are stored at day granularity, so two genuinely distinct
 *  trades can look identical. Instead of "does one exist?", each existing row
 *  consumes ONE matching parsed row: existing 2 + parsed 3 → 1 kept.
 *
 *  Rows whose assetId is an unresolved-asset sentinel (`new:TICKER`) never
 *  match — if the asset isn't in the catalog, no prior transaction can
 *  reference it. */
export function dedupeImportedRows<T extends DedupCandidate>(
  parsed: T[],
  existing: DedupCandidate[],
): { kept: T[]; duplicates: number } {
  const budget = new Map<string, number>()
  for (const e of existing) {
    if (isNewAssetSentinel(e.assetId)) continue
    const key = dedupKey(e)
    budget.set(key, (budget.get(key) ?? 0) + 1)
  }

  const kept: T[] = []
  let duplicates = 0
  for (const p of parsed) {
    const key = dedupKey(p)
    const remaining = isNewAssetSentinel(p.assetId) ? 0 : (budget.get(key) ?? 0)
    if (remaining > 0) {
      budget.set(key, remaining - 1)
      duplicates++
    } else {
      kept.push(p)
    }
  }
  return { kept, duplicates }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/transactions/sheet/dedupeImportedRows.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/transactions/sheet/dedupeImportedRows.ts src/components/transactions/sheet/dedupeImportedRows.test.ts
git commit -m "feat(import): count-based dedup function for imported rows"
```

---

### Task 2: Expose grid rows to the page chrome

**Files:**
- Modify: `src/components/transactions/sheet/TransactionsSheetGrid.tsx` (Controls interface ~line 46, onControlsReady effect ~line 410)
- Modify: `src/pages/TransactionsEditPage.tsx` (~line 64, MidasPdfImportButton usage)

**Interfaces:**
- Produces: `Controls.rows: SheetRow[]` — the grid's current (unsaved + loaded) rows, re-emitted on every state change (the effect already depends on `rows`).
- Consumed by Task 3 via a new `gridRows` prop on `MidasPdfImportButton`.

- [ ] **Step 1: Add `rows` to the Controls interface**

In `TransactionsSheetGrid.tsx`, extend the interface (SheetRow is already imported in that file):

```ts
interface Controls {
  hasChanges: boolean
  saving: boolean
  loading: boolean
  counts: { new: number; dirty: number; deleted: number; invalid: number; clean: number }
  /** Current grid rows (loaded + unsaved). Lets the import buttons dedup
   *  against rows already appended in this session. */
  rows: SheetRow[]
  addBlankRow: () => void
  appendRows: (rows: Partial<SheetRow>[]) => void
  save: () => Promise<void>
  discard: () => void
}
```

- [ ] **Step 2: Emit `rows` in the onControlsReady effect**

In the `useEffect` at ~line 410, add `rows,` to the object passed to `onControlsReady` (right after `counts,`). `rows` is already in the dependency list — no dep change needed.

- [ ] **Step 3: Pass grid rows to the Midas button**

In `TransactionsEditPage.tsx`:

```tsx
{!assetId && (
  <MidasPdfImportButton
    assets={assets}
    platforms={platforms}
    gridRows={controls.rows}
    onAppend={controls.appendRows}
  />
)}
```

(The `gridRows` prop is added to the button in Task 3 — Tasks 2 and 3 build/compile together; commit them together in Task 3 Step 6 if splitting the commit would leave a broken build. If executing tasks strictly separately, add the prop as optional in this task's commit.)

- [ ] **Step 4: Verify typecheck**

Run: `npm run build`
Expected: fails only on the not-yet-existing `gridRows` prop if Task 3 isn't done — otherwise PASS. (If executing sequentially in one session, defer this build check to Task 3.)

---

### Task 3: Wire dedup into the Midas PDF import flow

**Files:**
- Modify: `src/components/transactions/sheet/MidasPdfImportButton.tsx`

**Interfaces:**
- Consumes: `dedupeImportedRows`, `DedupCandidate` (Task 1); `gridRows: SheetRow[]` prop (Task 2); `fetchTransactions` from `@/lib/queries/transactions`; `useAuth` from `@/hooks/useAuth`; `MIDAS_PLATFORM_NAME` from `@/lib/constants/brokers`.
- Behavior contract (from spec):
  - Dedup runs after a successful parse, before the summary is shown.
  - Existing rows = DB transactions (user + Midas platform + parsed date range, parents only) **plus** current grid rows on the Midas platform.
  - If the DB query fails: show the error, no summary, no append.
  - No Midas platform yet → skip dedup entirely (nothing can be a duplicate).
  - Summary shows "Already imported: N"; all-duplicates shows an explicit message instead of an empty append offer.

- [ ] **Step 1: Update imports, props, and state**

```tsx
import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileText } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { parseMidasPdf } from "./parseMidasPdf"
import { dedupeImportedRows, type DedupCandidate } from "./dedupeImportedRows"
import type { ParseSummary } from "./parseImport"
import type { SheetRow, SheetSnapshot } from "./types"
import type { Asset, Platform } from "@/types/database"
import { MIDAS_PLATFORM_NAME } from "@/lib/constants/brokers"
import { fetchTransactions } from "@/lib/queries/transactions"
import { useAuth } from "@/hooks/useAuth"

const MIDAS_PDF_ACCEPT = "application/pdf,.pdf"

interface Props {
  assets: Asset[]
  platforms: Platform[]
  /** Rows currently in the grid (unsaved included) — deduped against so two
   *  overlapping PDFs imported in one session don't double up. */
  gridRows: SheetRow[]
  onAppend: (rows: Partial<SheetSnapshot>[]) => void
}
```

Component signature and state:

```tsx
export function MidasPdfImportButton({ assets, platforms, gridRows, onAppend }: Props) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [summary, setSummary] = useState<ParseSummary | null>(null)
  const [alreadyImported, setAlreadyImported] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
```

`reset` also clears the new state: add `setAlreadyImported(0)`.

- [ ] **Step 2: Run dedup inside `handleFile` after a successful parse**

Replace the body of `handleFile` with:

```tsx
const handleFile = async (file: File) => {
  setParsing(true)
  setSummary(null)
  setAlreadyImported(0)
  try {
    const result = await parseMidasPdf(file, assets, platforms)

    const midas = platforms.find(
      (p) => p.name.toLowerCase() === MIDAS_PLATFORM_NAME.toLowerCase(),
    )
    // No Midas platform yet → no prior import can exist; skip the check.
    if (result.rows.length > 0 && midas && user) {
      const dates = result.rows.map((r) => r.date).sort()
      const existingTxs = await fetchTransactions(user.id, {
        platformId: midas.id,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
        includeLinkedChildren: false,
      })
      const existing: DedupCandidate[] = [
        ...existingTxs.map((tx) => ({
          date: tx.date.slice(0, 10),
          assetId: tx.asset_id,
          type: tx.type,
          amount: String(tx.amount),
          unitPrice: String(tx.unit_price),
          priceCurrency: tx.price_currency || "USD",
        })),
        // Unsaved rows only: a saved grid row is already in the DB fetch —
        // counting it twice would over-drop.
        ...gridRows.filter((r) => r.txId == null && r.platformId === midas.id),
      ]
      const { kept, duplicates } = dedupeImportedRows(result.rows, existing)
      result.rows = kept
      setAlreadyImported(duplicates)
    }

    setSummary(result)
    if (result.errors.length > 0) {
      toast.error(result.errors[0])
    }
  } catch (err) {
    // Covers both parse failures and the duplicate-check query failing.
    // On query failure we deliberately show nothing to append — silent
    // dedup-off would reintroduce duplicates.
    toast.error(err instanceof Error ? err.message : "Failed to import PDF")
  } finally {
    setParsing(false)
  }
}
```

Note: `ParsedRow` satisfies `DedupCandidate` structurally (`type: TransactionType` extends `string`) — no mapping needed for parsed rows. `SheetRow` also satisfies it.

- [ ] **Step 3: Show the "Already imported" stat and the all-duplicates case**

Change the summary panel render condition from `summary.rows.length > 0` to `(summary.rows.length > 0 || alreadyImported > 0)`.

Stats grid becomes 4 columns (`grid-cols-4`), with a new cell after "Skipped":

```tsx
<div>
  <div className="text-muted-foreground">Already imported</div>
  <div className="text-lg font-semibold tabular-nums text-muted-foreground">
    {alreadyImported}
  </div>
</div>
```

When every row was a duplicate, replace the footer's Add button area:

```tsx
<div className="flex items-center justify-end gap-2">
  {summary.rows.length === 0 ? (
    <>
      <span className="text-xs text-muted-foreground">
        All rows in this statement are already imported.
      </span>
      <Button variant="ghost" size="sm" onClick={reset}>
        Close
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" size="sm" onClick={reset}>
        Cancel
      </Button>
      <Button size="sm" onClick={handleAppend}>
        Add {summary.rows.length} row
        {summary.rows.length === 1 ? "" : "s"}
      </Button>
    </>
  )}
</div>
```

- [ ] **Step 4: Include the duplicate count in the append toast**

In `handleAppend`'s `parts` array, add after the skipped entry:

```tsx
alreadyImported > 0 && `${alreadyImported} already imported`,
```

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: all tests pass (including Task 1's).

Run: `npm run build`
Expected: PASS (no type errors, no unused locals).

- [ ] **Step 6: Commit (Tasks 2 + 3 together)**

```bash
git add src/components/transactions/sheet/MidasPdfImportButton.tsx src/components/transactions/sheet/TransactionsSheetGrid.tsx src/pages/TransactionsEditPage.tsx
git commit -m "feat(import): skip already-imported rows on Midas PDF import"
```

---

### Task 4: Documentation sync

**Files:**
- Modify: `docs/components/04-transaction-system.md` (bulk-import section ~line 238 and acceptance list ~line 265)
- Modify: `docs/components/technical/04-transaction-system.md` (file list ~line 33)

**Interfaces:** none — doc-only.

- [ ] **Step 1: Behavioral doc (stack-free)**

In the "Bulk import" section, extend item 3:

```markdown
3. **Import a broker PDF statement** — parses only executed buy/sell rows (cancelled
   and non-trade rows are skipped); each parsed row lands in the grid for review.
   Statements may overlap (monthly back-imports): rows already recorded on the
   broker's platform are excluded and counted as "already imported" instead of
   landing in the grid. Matching is **count-based** on the transaction's identifying
   fields (day, asset, type, quantity, unit price, currency) — dates carry no time
   of day, so if the statement holds more identical trades than are already
   recorded, only the surplus is imported. Rows already sitting unsaved in the grid
   count as recorded. If the existing-transactions lookup fails, the import reports
   the error and offers nothing to add (it never silently re-imports).
```

Add an acceptance checkbox:

```markdown
- [ ] Re-importing an overlapping broker PDF adds no duplicates: already-recorded
      rows are excluded with a visible count, and same-day identical trades beyond
      the recorded count still import.
```

- [ ] **Step 2: Technical doc**

In the sheet file list, update the `MidasPdfImportButton.tsx` entry and add the new module:

```markdown
- `MidasPdfImportButton.tsx` — file picker + parse-progress + summary for the Midas PDF
  import. After parsing it fetches existing Midas-platform transactions for the
  statement's date range (`fetchTransactions`) and drops duplicates via
  `dedupeImportedRows` (unsaved grid rows passed in as `gridRows` count as
  existing; saved ones don't — they'd double-count with the DB fetch);
  a failed lookup aborts the import instead of skipping the check.
- `dedupeImportedRows.ts` — pure count-based duplicate filter keyed on
  date|asset|type|amount|unitPrice|currency (BigNumber-normalized numbers,
  sentinel assets never match). Vitest: `dedupeImportedRows.test.ts`.
```

- [ ] **Step 3: Re-read touched docs, then commit**

Confirm the docs describe the shipped behavior, then:

```bash
git add docs/components/04-transaction-system.md docs/components/technical/04-transaction-system.md
git commit -m "docs: Midas import idempotency behavior + technical notes"
```
