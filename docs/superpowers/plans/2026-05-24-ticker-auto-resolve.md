# Ticker Auto-Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the per-ticker stepper modal for US/BIST stocks during bulk transaction insert. Yahoo-recognized tickers get auto-created during save; the stepper opens only for tickers Yahoo can't resolve.

**Architecture:** A new `resolve-tickers` Supabase Edge Function batches Yahoo lookups, returns metadata + warms `price_cache`. The sheet's save handler resolves unknown sentinels via this function, auto-creates resolved assets through the existing `createAsset` query, and hands only the unresolved sentinels to the existing `ResolveAssetsStepper` (now with reason-aware messaging).

**Tech Stack:** Supabase Edge Functions (Deno), TypeScript, React 19, Yahoo Finance `query1.finance.yahoo.com/v8/finance/chart` endpoint.

**Project conventions:**
- No test suite — verification is typecheck + lint + manual browser walk-through (per the user's project decisions).
- Edge function deploy is a user-run step, not engineer-run (per deploy handoff preference).
- Commit frequently with `feat(scope): …` / `refactor(scope): …` style matching recent commits.

**Spec:** `docs/superpowers/specs/2026-05-24-ticker-auto-resolve-design.md`

---

## File Structure

| File | Role |
|---|---|
| `supabase/functions/resolve-tickers/index.ts` | **New.** Edge function — POST `{ tickers }` → `{ resolved, unresolved }`. Calls Yahoo, warms `price_cache`. |
| `src/lib/queries/assets.ts` | **Modify.** Add `resolveTickers()` client wrapper and the shared types (`ResolvedTickerInfo`, `UnresolvedReason`, etc.) that the stepper and helper both consume. |
| `src/components/transactions/sheet/autoResolveSentinels.ts` | **New.** Pure helper: takes sentinels + assets list, returns `{ resolvedMap, unresolved }`. Encapsulates the "already-known → existing id, Yahoo resolves → createAsset, else → stepper queue" pipeline. |
| `src/components/transactions/sheet/ResolveAssetsStepper.tsx` | **Modify.** Accept optional `reasons` prop; vary the dialog description based on the per-sentinel reason. Default behavior unchanged when prop absent. |
| `src/components/transactions/sheet/TransactionsSheetGrid.tsx` | **Modify.** Save handler calls `autoResolveSentinels` before opening the stepper. Adds `stepperReasons` state. |

**Task dependencies:**

- Task 1 (edge function) and Task 2 (client wrapper + types) are independent — can run in parallel.
- Tasks 3 (stepper) and 4 (helper) depend on Task 2's types — both can run in parallel after Task 2 lands.
- Task 5 (grid wiring) depends on Tasks 2, 3, and 4.
- Task 6 (verification + deploy) is the final user-run step.

---

## Task 1: Create the `resolve-tickers` Edge Function

**Files:**
- Create: `supabase/functions/resolve-tickers/index.ts`

**Context for the engineer:**
- Edge functions in this repo live under `supabase/functions/<name>/index.ts`.
- They use `getServiceClient()` from `_shared/client.ts` (service-role, bypasses RLS — fine here because we only write `price_cache`, not user data).
- They use `corsHeaders(origin)` from `_shared/cors.ts`.
- The closest reference implementation is `supabase/functions/fetch-yahoo/index.ts` — same Yahoo endpoint, same 1s-between-calls rate-limit pattern, same `price_cache` upsert shape. Read it before starting.

- [ ] **Step 1: Create the function directory and file**

Run: `mkdir -p supabase/functions/resolve-tickers`

Then create the file at `supabase/functions/resolve-tickers/index.ts` with the following content:

```ts
import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"

interface RequestBody {
  tickers: unknown
}

interface ResolvedTicker {
  ticker: string
  name: string
  category: "stock_us" | "stock_bist"
  price_source: "yahoo"
  currency: string
}

interface UnresolvedTicker {
  ticker: string
  reason: "not_found" | "http_error" | "not_equity"
}

interface ResponseBody {
  resolved: ResolvedTicker[]
  unresolved: UnresolvedTicker[]
}

const MAX_BATCH = 20
const YAHOO_DELAY_MS = 1000

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  const tickers: string[] = Array.isArray(body.tickers)
    ? body.tickers
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
        .map((t) => t.toUpperCase())
        .slice(0, MAX_BATCH)
    : []

  if (tickers.length === 0) {
    const empty: ResponseBody = { resolved: [], unresolved: [] }
    return new Response(JSON.stringify(empty), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })
  }

  const supabase = getServiceClient()

  // Latest USD/TRY for TRY→USD cross-rate (used when Yahoo quotes BIST in TRY).
  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("usd_try")
    .order("date", { ascending: false })
    .limit(1)
    .single()
  const usdTry: number | null = rateRow?.usd_try ?? null

  const resolved: ResolvedTicker[] = []
  const unresolved: UnresolvedTicker[] = []
  const now = new Date().toISOString()

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]

    if (i > 0) {
      await new Promise((r) => setTimeout(r, YAHOO_DELAY_MS))
    }

    try {
      const yahooRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      )

      if (!yahooRes.ok) {
        unresolved.push({
          ticker,
          reason: yahooRes.status === 404 ? "not_found" : "http_error",
        })
        continue
      }

      const data = await yahooRes.json()
      const meta = data?.chart?.result?.[0]?.meta

      if (!meta) {
        unresolved.push({ ticker, reason: "not_found" })
        continue
      }

      if (meta.quoteType !== "EQUITY") {
        unresolved.push({ ticker, reason: "not_equity" })
        continue
      }

      const name: string = meta.longName || meta.shortName || ticker
      const currency: string = typeof meta.currency === "string" ? meta.currency : "USD"
      const category: ResolvedTicker["category"] = ticker.endsWith(".IS")
        ? "stock_bist"
        : "stock_us"
      const price = meta.regularMarketPrice

      if (typeof price === "number") {
        let priceUsd: number | null = null
        let priceTry: number | null = null
        if (currency === "TRY") {
          priceTry = price
          priceUsd = usdTry ? price / usdTry : null
        } else {
          priceUsd = price
          priceTry = usdTry ? price * usdTry : null
        }
        const { error: cacheError } = await supabase.from("price_cache").upsert(
          {
            ticker,
            price_usd: priceUsd,
            price_try: priceTry,
            source: "yahoo",
            updated_at: now,
          },
          { onConflict: "ticker" },
        )
        if (cacheError) {
          console.error(`resolve-tickers price_cache upsert failed for ${ticker}:`, cacheError)
          // Don't fail the resolution — metadata is still valid.
        }
      }

      resolved.push({
        ticker,
        name,
        category,
        price_source: "yahoo",
        currency,
      })
    } catch (err) {
      console.error(`resolve-tickers ${ticker} failed:`, err)
      unresolved.push({ ticker, reason: "http_error" })
    }
  }

  const responseBody: ResponseBody = { resolved, unresolved }
  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  })
})
```

- [ ] **Step 2: Serve the function locally**

Run: `make functions-serve` (or `supabase functions serve` if not using the Makefile).

Expected: Output shows `Serving function: resolve-tickers` among the others, no compilation errors.

- [ ] **Step 3: Sanity-check with curl**

In a second terminal, with Supabase running locally:

```bash
SUPABASE_URL=$(supabase status -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['API_URL'])")
SUPABASE_ANON_KEY=$(supabase status -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['ANON_KEY'])")

curl -s -X POST "$SUPABASE_URL/functions/v1/resolve-tickers" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["AAPL","THYAO.IS","ZZZNOTREAL"]}' | python3 -m json.tool
```

Expected: Response shape matches:
```json
{
  "resolved": [
    {"ticker": "AAPL", "name": "Apple Inc.", "category": "stock_us", "price_source": "yahoo", "currency": "USD"},
    {"ticker": "THYAO.IS", "name": "Türk Hava Yolları A.O.", "category": "stock_bist", "price_source": "yahoo", "currency": "TRY"}
  ],
  "unresolved": [
    {"ticker": "ZZZNOTREAL", "reason": "not_found"}
  ]
}
```

The Apple `name` may vary slightly with Yahoo's data; the structure is what matters.

If `THYAO.IS` resolves with `category: "stock_bist"` and the not-real ticker is in `unresolved`, the function works.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/resolve-tickers/index.ts
git commit -m "feat(functions): resolve-tickers edge function for Yahoo lookup

Batches Yahoo Finance metadata lookups for US/BIST stocks. Returns
canonical name/category/currency and warms price_cache. Used by the
bulk transactions sheet to auto-create unknown ticker assets without
the per-ticker resolve modal."
```

---

## Task 2: Add `resolveTickers` client wrapper and shared types

**Files:**
- Modify: `src/lib/queries/assets.ts` (append new exports at the bottom)

**Context for the engineer:**
- All Edge Function invocations in this app use `supabase.functions.invoke<T>(name, { body })`. Reference: `src/lib/queries/snapshots.ts` (`triggerBackfillSnapshots`) for the error-envelope unwrap pattern.
- The `UnresolvedReason` union here is the *unified* contract: the edge function emits `not_found | http_error | not_equity`, and the client-side helper (Task 4) adds `create_failed` for post-resolve `createAsset` failures. The stepper (Task 3) consumes the union.

- [ ] **Step 1: Append types and wrapper to `src/lib/queries/assets.ts`**

Add at the end of the file (after `deactivateAsset`):

```ts
// ─── Ticker auto-resolution (Yahoo Finance via resolve-tickers Edge Fn) ──

export interface ResolvedTickerInfo {
  ticker: string
  name: string
  category: "stock_us" | "stock_bist"
  price_source: "yahoo"
  currency: string
}

/** Union of all reasons a ticker may need manual handling in the stepper.
 *  - `not_found | http_error | not_equity` come from the edge function.
 *  - `create_failed` is added client-side when the resolved metadata is
 *    fine but the follow-up `createAsset` call fails. */
export type UnresolvedReason =
  | "not_found"
  | "http_error"
  | "not_equity"
  | "create_failed"

export interface UnresolvedTickerInfo {
  ticker: string
  reason: UnresolvedReason
}

export interface ResolveTickersResult {
  resolved: ResolvedTickerInfo[]
  unresolved: UnresolvedTickerInfo[]
}

/** Call the resolve-tickers Edge Function. Returns an empty result on
 *  HTTP failure with a thrown error — callers should treat any throw as
 *  "fall back to manual stepper for every sentinel". */
export async function resolveTickers(
  tickers: string[],
): Promise<ResolveTickersResult> {
  const { data, error } = await supabase.functions.invoke<ResolveTickersResult>(
    "resolve-tickers",
    { body: { tickers } },
  )
  if (error) {
    // Mirror the unwrap pattern used in triggerBackfillSnapshots: pull the
    // Response body so the toast can show what Yahoo actually said.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.text === "function") {
      try {
        const text = await ctx.text()
        if (text) throw new Error(text)
      } catch (innerErr) {
        if (innerErr instanceof Error && innerErr.message) throw innerErr
      }
    }
    throw error
  }
  return data ?? { resolved: [], unresolved: [] }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/assets.ts
git commit -m "feat(queries): resolveTickers wrapper + UnresolvedReason types

Client side of the resolve-tickers Edge Function. UnresolvedReason
union covers both edge-function-side failures (not_found, http_error,
not_equity) and client-side post-resolve failures (create_failed),
giving downstream consumers a single shape."
```

---

## Task 3: Add `reasons` prop to `ResolveAssetsStepper`

**Files:**
- Modify: `src/components/transactions/sheet/ResolveAssetsStepper.tsx`

**Context for the engineer:**
- The stepper currently shows the same generic description for every unknown ticker. With auto-resolve, some sentinels reach the stepper *because* Yahoo refused them — surfacing the reason makes the manual flow less confusing.
- The prop is optional; existing callers that don't pass `reasons` keep the original message.

- [ ] **Step 1: Import the shared type**

Open `src/components/transactions/sheet/ResolveAssetsStepper.tsx` and add this import alongside the existing imports (after the import of `type { Asset } from "@/types/database"`):

```ts
import type { UnresolvedReason } from "@/lib/queries/assets"
```

- [ ] **Step 2: Add the `reasons` prop to the `Props` interface**

Find the `interface Props` block (around line 33). Add the `reasons` field after `onCancel`:

```ts
interface Props {
  /** Sentinel values from the grid rows, e.g. ["new:BTC", "new:RKLB"]. */
  sentinels: string[]
  open: boolean
  /** Resolve one sentinel → the real asset id created on the server.
   *  Called once per sentinel, in order. */
  onResolved: (sentinel: string, realAssetId: string) => void
  /** Called when every sentinel has been resolved. The grid resumes its
   *  Save batch after this fires. */
  onAllResolved: () => void
  /** Cancel without resolving — the Save batch is aborted; rows stay in
   *  the grid with their sentinels. */
  onCancel: () => void
  /** Optional per-sentinel reason for why this ticker needs manual entry.
   *  Drives the dialog description so users know whether they typo'd, hit
   *  a non-equity, or just need to fill in a manual-category asset. When
   *  absent (the legacy call path), shows the generic "we don't know X
   *  yet" message. */
  reasons?: Record<string, UnresolvedReason>
}
```

- [ ] **Step 3: Add `reasons` to the destructured component args**

In the component signature, change:

```ts
export function ResolveAssetsStepper({
  sentinels,
  open,
  onResolved,
  onAllResolved,
  onCancel,
}: Props) {
```

to:

```ts
export function ResolveAssetsStepper({
  sentinels,
  open,
  onResolved,
  onAllResolved,
  onCancel,
  reasons,
}: Props) {
```

- [ ] **Step 4: Add a `reasonText` helper above the return statement**

Right above the `return (` statement (between `handleNext` and the JSX), insert:

```ts
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
```

- [ ] **Step 5: Replace the hard-coded description with `reasonText`**

Find the `<DialogDescription>` block (around line 200):

```tsx
<DialogDescription>
  We don't know <span className="font-mono font-medium">{tickerFromSentinel(current)}</span>{" "}
  yet. Fill in the details so we can price it and track it.
</DialogDescription>
```

Replace with:

```tsx
<DialogDescription>{reasonText(current)}</DialogDescription>
```

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/transactions/sheet/ResolveAssetsStepper.tsx
git commit -m "feat(stepper): reason-aware description for unknown tickers

Optional reasons prop keyed by sentinel. Replaces the generic 'we don't
know X yet' line with a hint matched to why the ticker landed here —
typo, non-equity, Yahoo unreachable, or save-side failure. Existing
callers that don't pass reasons keep the original message."
```

---

## Task 4: Create the `autoResolveSentinels` helper

**Files:**
- Create: `src/components/transactions/sheet/autoResolveSentinels.ts`

**Context for the engineer:**
- This helper is the pipeline: it takes the sentinels from the grid, returns what got resolved (sentinel → asset id) and what still needs the manual stepper.
- It uses `createAsset` directly from `@/lib/queries/assets` rather than the `useAssets.addAsset` wrapper, so we don't fire one full re-fetch per asset. The caller does a single `refetchAssets()` at the end via the callback.
- The duplicate-key recovery path handles the race where a second tab inserts the same ticker between resolve and create. In that case we refetch from Supabase locally (one extra read) and look up the now-existing asset by ticker.

- [ ] **Step 1: Create the file**

Create `src/components/transactions/sheet/autoResolveSentinels.ts` with this content:

```ts
import type { Asset } from "@/types/database"
import {
  createAsset,
  fetchAssets,
  resolveTickers,
  type UnresolvedReason,
} from "@/lib/queries/assets"
import { tickerFromSentinel } from "./sentinel"

export interface AutoResolveResult {
  /** Sentinel → real asset id. Includes both already-known matches and
   *  newly created assets from Yahoo. */
  resolvedMap: Map<string, string>
  /** Sentinels that couldn't be handled automatically. The stepper still
   *  has to walk the user through these. */
  unresolved: Array<{ sentinel: string; reason: UnresolvedReason }>
  /** Whether we created at least one asset (used by callers to decide if
   *  a parent-list refetch is worth doing). */
  createdAny: boolean
}

interface Args {
  userId: string
  sentinels: string[]
  /** The grid's current asset list — used for case-insensitive existing-
   *  ticker matching to short-circuit a Yahoo call when the asset is
   *  already known. */
  assets: Asset[]
  /** Trigger the parent's refetch so its `assets` state catches up after
   *  any auto-creates. The helper still uses a direct `fetchAssets` for
   *  its own duplicate-recovery lookup since the parent's state isn't
   *  available synchronously after this call. */
  refetchAssets: () => Promise<void>
}

function findExisting(assets: Asset[], ticker: string): Asset | undefined {
  const lower = ticker.toLowerCase()
  return assets.find((a) => a.ticker.toLowerCase() === lower)
}

function isDuplicateTickerError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("duplicate key") && msg.includes("ticker")
}

export async function autoResolveSentinels({
  userId,
  sentinels,
  assets,
  refetchAssets,
}: Args): Promise<AutoResolveResult> {
  const resolvedMap = new Map<string, string>()
  const unresolved: Array<{ sentinel: string; reason: UnresolvedReason }> = []
  let createdAny = false

  // (1) Already-known tickers — substitute without hitting Yahoo.
  const remaining: string[] = []
  for (const s of sentinels) {
    const t = tickerFromSentinel(s)
    const existing = findExisting(assets, t)
    if (existing) {
      resolvedMap.set(s, existing.id)
    } else {
      remaining.push(s)
    }
  }

  if (remaining.length === 0) {
    return { resolvedMap, unresolved, createdAny }
  }

  // (2) Batch-resolve via Yahoo. Total wall time = remaining.length × 1s
  //     thanks to the rate-limit delay in the edge function.
  let result: Awaited<ReturnType<typeof resolveTickers>>
  try {
    const tickers = remaining.map(tickerFromSentinel)
    result = await resolveTickers(tickers)
  } catch {
    // Resolver itself failed → graceful degradation: everything goes to
    // the stepper with an http_error reason.
    for (const s of remaining) {
      unresolved.push({ sentinel: s, reason: "http_error" })
    }
    return { resolvedMap, unresolved, createdAny }
  }

  // Build a case-insensitive lookup from ticker → original sentinel so we
  // can map Yahoo's canonical response back to the grid's sentinel string.
  const sentinelByLowerTicker = new Map<string, string>()
  for (const s of remaining) {
    sentinelByLowerTicker.set(tickerFromSentinel(s).toLowerCase(), s)
  }

  // (3) Auto-create every Yahoo-resolved ticker.
  for (const r of result.resolved) {
    const sentinel = sentinelByLowerTicker.get(r.ticker.toLowerCase())
    if (!sentinel) continue
    try {
      const asset = await createAsset({
        user_id: userId,
        category: r.category,
        ticker: r.ticker,
        name: r.name,
        tags: [],
        price_source: r.price_source,
        is_currency: false,
        is_active: true,
      })
      resolvedMap.set(sentinel, asset.id)
      createdAny = true
    } catch (err) {
      if (isDuplicateTickerError(err)) {
        // Race: another tab/session inserted the same ticker between
        // resolve and create. Refetch directly and look up the existing
        // row. One extra read; cheaper than blocking on parent re-render.
        try {
          const fresh = await fetchAssets(userId)
          const existing = findExisting(fresh, r.ticker)
          if (existing) {
            resolvedMap.set(sentinel, existing.id)
            continue
          }
        } catch {
          // fall through — surface as create_failed
        }
        unresolved.push({ sentinel, reason: "create_failed" })
      } else {
        unresolved.push({ sentinel, reason: "create_failed" })
      }
    }
  }

  // (4) Yahoo-side unresolved → forward to stepper.
  for (const u of result.unresolved) {
    const sentinel = sentinelByLowerTicker.get(u.ticker.toLowerCase())
    if (!sentinel) continue
    unresolved.push({ sentinel, reason: u.reason })
  }

  // (5) Refetch parent asset list once if we created anything.
  if (createdAny) {
    await refetchAssets()
  }

  return { resolvedMap, unresolved, createdAny }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/transactions/sheet/autoResolveSentinels.ts
git commit -m "feat(sheet): autoResolveSentinels helper for ticker pipeline

Encapsulates the auto-create logic: known-ticker short-circuit → Yahoo
batch resolve → createAsset per resolved → duplicate-key race recovery
→ unresolved list for the stepper. Single refetch at the end."
```

---

## Task 5: Wire `autoResolveSentinels` into `TransactionsSheetGrid`

**Files:**
- Modify: `src/components/transactions/sheet/TransactionsSheetGrid.tsx`

**Context for the engineer:**
- Current flow (lines 188–202 of the existing file): collect sentinels → if any, open stepper → on `onAllResolved`, call `runCommit()`.
- New flow: collect sentinels → call `autoResolveSentinels` → apply resolved → if anything still unresolved, open stepper with `reasons`. Otherwise go straight to `runCommit`.
- The component already has `assets` as a prop and the existing `resolveAssetSentinel` reducer dispatch. We add a new `stepperReasons` state and import `useAssets` solely to get `refetch` (the prop `assets` is what we read from).

- [ ] **Step 1: Add the new imports**

In `src/components/transactions/sheet/TransactionsSheetGrid.tsx`, add these imports near the other component/lib imports (after the existing `import { isNewAssetSentinel } from "./sentinel"` line):

```ts
import { autoResolveSentinels } from "./autoResolveSentinels"
import { useAssets } from "@/hooks/useAssets"
import type { UnresolvedReason } from "@/lib/queries/assets"
```

- [ ] **Step 2: Add `useAssets` refetch hook and the reasons state**

Find this block (around line 110–111):

```ts
const [pendingSentinels, setPendingSentinels] = useState<string[]>([])
const [stepperOpen, setStepperOpen] = useState(false)
```

Replace with:

```ts
const [pendingSentinels, setPendingSentinels] = useState<string[]>([])
const [stepperOpen, setStepperOpen] = useState(false)
const [stepperReasons, setStepperReasons] = useState<
  Record<string, UnresolvedReason>
>({})

// `assets` prop powers row rendering; the hook's refetch is what we use
// after auto-create so the parent's view of the asset list catches up.
const { refetch: refetchAssets } = useAssets()
```

- [ ] **Step 3: Replace the sentinel-detection block in `save()`**

Find this block in the `save()` function (around lines 188–202):

```ts
// Step 1: if any rows reference unknown tickers (sentinels), pause and
// open the stepper. The stepper resolves each sentinel via reducer
// dispatches; we resume the commit from `runCommit()` after all are
// resolved.
const uniqueSentinels = Array.from(
  new Set(rows.filter((r) => isNewAssetSentinel(r.assetId)).map((r) => r.assetId)),
)
if (uniqueSentinels.length > 0) {
  setPendingSentinels(uniqueSentinels)
  setStepperOpen(true)
  return // saving stays true; cleared on stepper finish or cancel.
}

await runCommit()
```

Replace with:

```ts
// Step 1: collect unknown-ticker sentinels.
const uniqueSentinels = Array.from(
  new Set(
    rows.filter((r) => isNewAssetSentinel(r.assetId)).map((r) => r.assetId),
  ),
)

if (uniqueSentinels.length === 0) {
  await runCommit()
  return
}

// Step 2: try to auto-resolve everything via Yahoo. Already-known
// tickers and US/BIST stocks the resolver recognises are handled
// silently; anything else falls through to the manual stepper.
const { resolvedMap, unresolved, createdAny } = await autoResolveSentinels({
  userId: user.id,
  sentinels: uniqueSentinels,
  assets,
  refetchAssets,
})

for (const [sentinel, realId] of resolvedMap.entries()) {
  resolveAssetSentinel(sentinel, realId)
}

if (createdAny) {
  toast.success(
    `Resolved ${resolvedMap.size} ticker${resolvedMap.size === 1 ? "" : "s"} via Yahoo`,
  )
}

if (unresolved.length === 0) {
  await runCommit()
  return
}

// Step 3: hand the leftovers to the manual stepper, with reasons.
const reasonsMap: Record<string, UnresolvedReason> = {}
for (const u of unresolved) {
  reasonsMap[u.sentinel] = u.reason
}
setStepperReasons(reasonsMap)
setPendingSentinels(unresolved.map((u) => u.sentinel))
setStepperOpen(true)
// saving stays true; cleared on stepper finish or cancel.
```

- [ ] **Step 4: Pass `reasons` and clear `stepperReasons` on close**

Find the `<ResolveAssetsStepper>` JSX block at the bottom of the component (around line 506):

```tsx
<ResolveAssetsStepper
  sentinels={pendingSentinels}
  open={stepperOpen}
  onResolved={handleStepperResolved}
  onAllResolved={handleStepperAllResolved}
  onCancel={handleStepperCancel}
/>
```

Replace with:

```tsx
<ResolveAssetsStepper
  sentinels={pendingSentinels}
  open={stepperOpen}
  onResolved={handleStepperResolved}
  onAllResolved={handleStepperAllResolved}
  onCancel={handleStepperCancel}
  reasons={stepperReasons}
/>
```

Then find `handleStepperAllResolved` and `handleStepperCancel` (around lines 296–308):

```ts
const handleStepperAllResolved = async () => {
  setStepperOpen(false)
  setPendingSentinels([])
  await runCommit()
}

const handleStepperCancel = () => {
  setStepperOpen(false)
  setPendingSentinels([])
  setSaving(false)
  savingRef.current = false
  toast.message("Save cancelled. New tickers left in the grid.")
}
```

Update both to clear `stepperReasons` too:

```ts
const handleStepperAllResolved = async () => {
  setStepperOpen(false)
  setPendingSentinels([])
  setStepperReasons({})
  await runCommit()
}

const handleStepperCancel = () => {
  setStepperOpen(false)
  setPendingSentinels([])
  setStepperReasons({})
  setSaving(false)
  savingRef.current = false
  toast.message("Save cancelled. New tickers left in the grid.")
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/sheet/TransactionsSheetGrid.tsx
git commit -m "feat(sheet): auto-resolve unknown tickers before opening stepper

Save flow now batches unknown sentinels through autoResolveSentinels.
US/BIST stocks Yahoo recognises are created on the fly; the stepper
only opens for whatever's left, with reason-aware messaging."
```

---

## Task 6: Deploy and manually verify

**Files:** none (deploy + walkthrough)

**Context for the engineer:**
- This step is user-run for two reasons: deploying to remote Supabase is in the "step-by-step cloud ops" category, and the verification needs a real Midas PDF or real-world tickers that only the user has.
- Hand the commands to the user; don't run them.

- [ ] **Step 1: Hand the deploy command to the user**

Tell the user to run, from the project root:

```bash
supabase functions deploy resolve-tickers
```

Expected output: `Function deployed: resolve-tickers` (or similar — exact wording depends on CLI version).

- [ ] **Step 2: Hand the local verification steps to the user**

Ask the user to:

1. Run `npm run dev`.
2. Open the bulk transactions editor (Transactions → Bulk edit, or the per-asset Sheet).
3. Add a row with a brand-new US ticker (e.g. `RKLB` if not already in their assets).
4. Click Save.
5. Confirm: no stepper modal opens, a toast appears saying `Resolved 1 ticker via Yahoo`, the save completes, and `RKLB` shows up on Settings → Assets with the correct name (`Rocket Lab USA, Inc.` or similar).
6. Repeat with a fresh BIST ticker (e.g. `ASELS.IS` if not already present). Same expected behavior; the asset's category should be `stock_bist`.
7. Try a typo ticker (e.g. `WATXYZ`). Confirm: the stepper opens for that row only, with the description *"Yahoo couldn't find WATXYZ. For BIST stocks add the .IS suffix..."*.
8. Open the portfolio page within a few seconds. Confirm `RKLB`/`ASELS.IS` show a non-zero price (price_cache was warmed by the edge function).

- [ ] **Step 3: If the user reports a problem, debug from logs**

Run: `supabase functions logs resolve-tickers --tail` (or use the Supabase dashboard).

Common failure modes:
- **CORS error in browser:** Check that `ALLOWED_ORIGINS` env var on the deployed function includes the dev URL (usually `http://localhost:5173`). Same setup as the other edge functions.
- **`Missing SUPABASE_URL` from function logs:** Supabase auto-injects this on deployed functions; if local, check `.env` for the local equivalent.
- **`401 Unauthorized`:** Anon key wasn't sent — verify `supabase.functions.invoke` works for other functions like `fetch-prices`.

---

## Self-Review

- **Spec coverage:**
  - Edge function spec (§Architecture) → Task 1 ✓
  - Field mapping table → Task 1 (asset shape produced by edge fn) and Task 4 (createAsset call uses those fields) ✓
  - Client orchestration flowchart → Task 4 (helper) + Task 5 (grid integration) ✓
  - Reason-aware stepper messaging → Task 3 ✓
  - Edge cases (lowercase, no .IS, no_price, race) → Task 1 (yahoo upsert skipped if no price) + Task 4 (race recovery, lowercase normalize via toLowerCase comparisons) ✓
  - "Files touched" table → matches Task 1–5 ✓
- **Placeholder scan:** No "TBD"/"TODO"/"add appropriate error handling" found in steps; every code step has full code.
- **Type consistency:**
  - `UnresolvedReason` defined in Task 2, consumed identically in Tasks 3, 4, 5 ✓
  - `ResolvedTickerInfo` shape in Task 2 matches the edge function's `ResolvedTicker` shape in Task 1 ✓
  - `resolveTickers()` signature in Task 2 matches usage in Task 4 ✓
  - `autoResolveSentinels` return shape (`resolvedMap`, `unresolved`, `createdAny`) defined in Task 4, destructured identically in Task 5 ✓
- **Scope:** One focused feature, one design — no decomposition needed.
