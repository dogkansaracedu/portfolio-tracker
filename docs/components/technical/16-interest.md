# Component 16: Interest Positions — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../16-interest.md](../16-interest.md)
>
> **Status: built and shipped** (v0.7.0). Every path below is a real pointer.

## Stack

- **Supabase Postgres** — one per-user table (`interest_positions`) with the
  standard four `auth.uid() = user_id` RLS policies. No edge function, no cron:
  every row is hand-entered by the user from the client.
- Frontend: a React context provider (repo convention — shared server data never
  fetch-on-mount per call site), shadcn/ui `Dialog` / `AlertDialog` / `Select` /
  `Card` / `Tooltip`, BigNumber.js for the estimates.
- **No new price or P&L code.** The estimate delegates to the campaigns module's
  `estimateYearlyUsd`; prices come from `PricesContext`.

## File map

| Path | Role |
|---|---|
| `supabase/migrations/20260819120000_interest_positions.sql` | Table + index + four RLS policies. |
| `src/lib/constants/interest.ts` | `INTEREST_STATUS` (+ `InterestStatus`), `INTEREST_STATUS_RANK`, `INTEREST_WARNING_STATUSES`, `INTEREST_ENDS_SOON_DAYS`, `INTEREST_DAYS_PER_YEAR`, `INTEREST_STATUS_CLASSES` / `INTEREST_ALERT_CLASSES` (status tones), `INTEREST_POSITIONS_TABLE`, `INTEREST_ROUTE`, `INTEREST_ALERT_DISMISS_KEY`, `INTEREST_ALERT_NAMED_LIMIT`, `INTEREST_APR_KIND_OPTIONS`, and **all** user-visible copy (`INTEREST_COPY`). Imports `DEADLINE_SOON_DAYS` and the `AprKind` union from the campaigns constants rather than redefining either. |
| `src/lib/interest.ts` | Pure logic: `daysUntil`, `positionStatus`, `isWarningStatus`, `addDays`, `estimatePositionYearlyUsd` (delegates to `estimateYearlyUsd`), `positionTermDays`, `estimatePositionTermUsd` (yearly × termDays/365), `openPositions`, `sortPositions`, `summarizeAssetInterest`, `matchPlatformByName`, `buildPositionPrefill`. Types: `PositionTerm`, `AssetInterestSummary`, `PositionPrefill`. |
| `src/lib/interest.test.ts` | Vitest (46 cases): status boundaries (today, the exact 7-day edge, +8, past, null, unparseable), `addDays` month/year/leap crossings, the estimates and their null rules, term proration, sort order and stability, the open/summary helpers, platform-name matching, prefill derivation. |
| `src/lib/queries/interest.ts` | CRUD: `fetchInterestPositions(userId, { includeClosed })`, `createInterestPosition`, `updateInterestPosition`, `closeInterestPosition` (an update that sets `is_closed`; takes a second arg so it also re-opens), `deleteInterestPosition`. |
| `src/contexts/InterestContext.tsx` | Provider: `{ positions, loading, error, refresh, addPosition, updatePosition, closePosition, deletePosition }`. Loads **all** rows (open + closed) once per session; writes patch the local list in place. Mounted innermost in `src/main.tsx`. `useInterestContext` throws outside the provider. |
| `src/components/interest/InterestPositionForm.tsx` | The **shared** add/edit dialog, used by both entry points (Campaigns "Track" and the asset-detail section). Asset + platform `Select`s, quantity, rate + kind, program name, start/end dates, note. Writes through the context itself, so neither caller carries save logic. Quantity and rate leave as `toFixed()` strings. |
| `src/components/interest/display.ts` | Render-side wording (kept out of components, which carry no copy, and out of `lib/interest.ts`, which stays pure): `formatInterestDay`, `statusLabel`, `formatPositionRate` (reuses `formatApr`), `expiryPhrase` ("12 days left" / "Expired 3 days ago" / "ends today"), `alertSentence` (the dashboard sentence). |
| `src/components/interest/InterestBadge.tsx` | The Portfolio row indicator: `summarizeAssetInterest` → a tiny bordered pill (percent icon + rate + "+N") tinted by the loudest status, with per-position detail in a `Popover` (not a `Tooltip`: the pill sits inside the row's `Link`, so the trigger is a `<button>` whose `onClick` calls `preventDefault`/`stopPropagation` before the link sees it) plus a "View" link to `/assets/:id#${INTEREST_SECTION_ANCHOR}` — the id `AssetInterestSection` puts on its `<section>`. Returns `null` when the asset has no open position. |
| `src/components/asset-detail/AssetInterestSection.tsx` | The management home: this asset's open positions as cards (+ a "Show N closed" toggle), add / edit / close / reopen / delete, the campaign cross-link line, the shared dialog, and an `AlertDialog` delete confirmation. |
| `src/components/dashboard/InterestAlerts.tsx` | The two warning banners (expired = red, ends-soon = amber), max `INTEREST_ALERT_NAMED_LIMIT` (3) named positions each plus "and N more", each line linking to `/assets/:assetId`. Dismissal is one `sessionStorage` flag covering both banners. |

Edits to **existing** files:

| Path | Change |
|---|---|
| `src/types/database.ts` | `InterestPosition` row interface + `InterestPositionInsert` / `InterestPositionUpdate` (numeric-as-string writes, hand-synced as ever). |
| `src/main.tsx` | `<InterestProvider>` mounted inside `<CampaignsProvider>`, wrapping `<App />`. |
| `src/lib/campaigns.ts` | Exports the previously module-private `daysBetweenIsoDays` **and** `isoDayToUtcMs` so the interest logic reuses the app's one ISO-day arithmetic instead of restating it. |
| `src/pages/DashboardPage.tsx` | `<InterestAlerts />` above the hero. |
| `src/components/portfolio/PortfolioRow.tsx` | `<InterestBadge assetId>` next to the ticker in **both** the desktop row and the mobile card. |
| `src/pages/AssetDetailPage.tsx` | `<AssetInterestSection asset>` between the platform table and the transaction list. |
| `src/pages/CampaignsPage.tsx` | A "Track" button per campaign card → `buildPositionPrefill(campaign, platforms, today)` → the shared dialog. One `trackPrefill` state doubles as "dialog open" and "what to prefill". `onTrack` threads through `CampaignGroup` → `CampaignCard`. |
| `package.json` | 0.6.0 → 0.7.0. |

## Schema (as shipped)

```sql
CREATE TABLE public.interest_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  quantity    numeric NOT NULL,
  apr         numeric,          -- percent, e.g. 5.25; NULL when unrated
  apr_kind    text,             -- 'fixed' | 'variable' | 'up_to' (NULL iff apr NULL)
  label       text,             -- program name, "OKX TR fixed 105d"
  started_at  date NOT NULL DEFAULT current_date,
  expires_at  date,             -- NULL = flexible / no expiry
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  note        text,
  is_closed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_interest_positions_user_open
  ON public.interest_positions(user_id, is_closed);
```

RLS: four `auth.uid() = user_id` policies (select/insert/update/delete) — the
same per-user pattern as `retirement_scenarios`.

Notes on the foreign keys:

- `asset_id` / `platform_id` are **real** FKs (unlike `campaigns`, whose
  ticker/platform are free text from research): the user picks both from their
  own catalog. Cascade on delete, matching `holdings`/`transactions`.
- `campaign_id` is optional provenance and `ON DELETE SET NULL`: campaign rows
  are replaced wholesale by each research run, and the user's note must outlive
  them.
- The index covers the only read path (one user's rows, split by open/closed)
  and the `auth.users` FK — Postgres doesn't index FK columns automatically.

## Logic

- **Status** (`positionStatus`) is `daysUntil(expires_at)` bucketed against
  `INTEREST_ENDS_SOON_DAYS` (= `DEADLINE_SOON_DAYS`, 7, imported from the
  campaigns constants so the horizon can't drift): `null` days → `flexible`
  (also the answer for an unparseable date — an unreadable date must never
  masquerade as a deadline), `< 0` → `expired`, `≤ 7` → `ends_soon`, else
  `active`. Nothing stores a status; it is recomputed on every read.
- **Day arithmetic** reuses `daysBetweenIsoDays` / `isoDayToUtcMs` from
  `src/lib/campaigns.ts` (both were module-private before this build) so there
  is one implementation of "whole days between two `YYYY-MM-DD` values".
  `addDays` builds on `isoDayToUtcMs` and returns `""` for an unreadable day.
- **Estimates** are BigNumber throughout. `estimatePositionYearlyUsd` delegates
  to `estimateYearlyUsd` (same `qty × price × apr/100`, same "null, never $0"
  rule for a missing/zero/junk input); `estimatePositionTermUsd` multiplies that
  by `termDays / INTEREST_DAYS_PER_YEAR` and is null for a flexible position or
  a zero/negative-length term.
- **Sort** (`sortPositions`) ranks by `INTEREST_STATUS_RANK` (expired 0,
  ends_soon 1, active 2, flexible 3), then by end date ascending, then stable
  input order, and copies the array rather than sorting in place. Because the
  loudest status sorts first, `summarizeAssetInterest` takes the head of the
  sorted list as both the badge's status and its leading position.
- **Prefill** (`buildPositionPrefill`) derives the end date from `lock_days`
  (today + lock days) in preference to the campaign's `deadline` — a deadline is
  when you may *join*, not when the money comes back; a `lock_days` of 0 or null
  is flexible and falls through to the deadline. `matchPlatformByName`
  normalizes both names to `[a-z0-9]` and takes an exact match first, otherwise
  the **shortest** containment match in either direction, so "OKX" resolves to
  "OKX" over "OKX TR" when both exist. Null when nothing resembles it; the
  dialog then asks.
- `PositionPrefill` has **all fields optional** because the two entry points
  know different things: a campaign card knows platform/rate/term but not the
  asset; the asset-detail section knows only the asset.

## Frontend notes & gotchas

- The context deliberately loads **closed rows too** (`includeClosed: true`), so
  the asset-detail history toggle costs no second round-trip. Every consumer
  that wants live rows filters through `openPositions` — the dashboard banners
  and the portfolio badge both do.
- `closePosition(id, isClosed = true)` keeps the row in the local list with
  `is_closed` flipped (it is an archive, not a removal) and doubles as the
  "Reopen" action on a closed card; `deletePosition` removes it, behind an
  `AlertDialog` confirmation.
- The shared dialog re-seeds on the **closed→open transition, during render**
  (the `wasOpen` pattern from `ScenarioNameDialog`), not in a `useEffect` keyed
  on `prefill`: both callers build the prefill object inline, so an effect
  dependency on its identity would re-seed the form on every render.
- Both `quantity` and `apr` are `numeric` columns, so `InterestPositionInsert` /
  `InterestPositionUpdate` widen both to `number | string` and the form sends
  `BigNumber.toFixed()` strings. `apr_kind` is written null iff `apr` is null —
  the same invariant `campaigns` keeps.
- Status colors (amber/red) are applied through `INTEREST_STATUS_CLASSES` /
  `INTEREST_ALERT_CLASSES`, **never** `gainLossClass`. Same amber as the
  campaigns staleness banner. This is the rule Component 15 follows for APRs:
  not P&L, not the P&L palette.
- The dashboard banner reads `sessionStorage` once in a `useState` initializer,
  so dismissal survives navigation within the session and dies with the tab.
  One flag covers both banners.
- The campaign cross-link counts the latest run's **non-expired** rows whose
  `asset_ticker` matches this asset's ticker, case-insensitively — by ticker
  string, never by asset id, because campaign tickers are free text that may not
  exist in the catalog.
- Quantities render through the shared `formatAmount(value, category)` so a fiat
  time deposit doesn't print eight crypto decimals.
- Nothing in this component imports the P&L engine, `usePnL`, or
  `HoldingsContext`. That is the boundary rule enforced by construction.

## Deviations from the pre-build plan

- **Migration timestamp**: `20260819120000` (the plan pencilled in
  `20260818090000`). Still after `20260817120000_campaigns.sql`, which it
  references.
- `src/lib/campaigns.ts` exports `isoDayToUtcMs` as well as
  `daysBetweenIsoDays` — `addDays` needs the parse half, and duplicating it
  would have restated the one thing the export was meant to prevent.
- `display.ts` has **no `statusOf`**: components import `positionStatus` from
  `src/lib/interest.ts` directly rather than through a second name for the same
  function.
- `INTEREST_STATUS_RANK` and `INTEREST_WARNING_STATUSES` live in the constants
  file (the plan implied they'd sit inline in `lib/interest.ts`), so the
  ladder's ordering is stated once next to the ladder itself.

## Open questions / recorded extensions

- **Quantity vs balance** — deliberately never reconciled (see the behavioral
  spec's out-of-scope list). Revisit only if the auto-transaction extension is
  ever built.
- **Auto-generating estimated reward transactions at maturity** — out of scope
  for v1 and the reason the boundary rule exists; see the behavioral spec.
