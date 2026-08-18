# Component 16: Interest Positions — Technical (planned build)

> Layer: React/Vite/Supabase implementation. Contract → [../16-interest.md](../16-interest.md)
>
> **Status: designed, not built.** Nothing below exists in the repo yet — the
> file map is the *intended* layout, the schema is the *intended* migration, and
> every path is a plan, not a pointer. Update this header to "this build" on the
> commit that ships the code.

## Stack

- **Supabase Postgres** — one per-user table (`interest_positions`) with the
  standard four `auth.uid() = user_id` RLS policies. No edge function, no cron:
  every row is hand-entered by the user from the client.
- Frontend: React context provider (repo convention — shared server data never
  fetch-on-mount per call site), shadcn/ui `Dialog`/`Select`/`Card`/`Badge`/
  `Tooltip`, BigNumber.js for the estimates.
- **No new price or P&L code.** The estimate delegates to the campaigns module's
  `estimateYearlyUsd`; prices come from `PricesContext`.

## File map (planned — none of these exist yet)

| Path (to create) | Role |
|---|---|
| `supabase/migrations/20260818090000_interest_positions.sql` | Table + index + four RLS policies. |
| `src/lib/constants/interest.ts` | `INTEREST_STATUS` (+ `InterestStatus` type), `INTEREST_STATUS_CLASSES` / `INTEREST_ALERT_CLASSES` (status tones), `INTEREST_POSITIONS_TABLE`, `INTEREST_ROUTE`, `INTEREST_ALERT_DISMISS_KEY`, `INTEREST_APR_KIND_OPTIONS`, and **all** user-visible copy (`INTEREST_COPY`). Imports `DEADLINE_SOON_DAYS` from the campaigns constants rather than redefining the horizon. |
| `src/lib/interest.ts` | Pure logic: `daysUntil`, `positionStatus`, `isWarningStatus`, `estimatePositionYearlyUsd` (delegates to `estimateYearlyUsd`), `estimatePositionTermUsd` (yearly × termDays/365), `sortPositions`, `openPositions`, `summarizeAssetInterest`, `matchPlatformByName`, `buildPositionPrefill`, `addDays`. |
| `src/lib/interest.test.ts` | Vitest: status boundaries (±1 day around the 7-day horizon, today, unparseable), estimates incl. the term proration, sort order, the open/summary helpers, platform-name matching, prefill derivation, `addDays` boundary crossings. |
| `src/lib/queries/interest.ts` | CRUD: `fetchInterestPositions(userId, { includeClosed })`, `createInterestPosition`, `updateInterestPosition`, `closeInterestPosition` (an update that sets `is_closed`), `deleteInterestPosition`. |
| `src/contexts/InterestContext.tsx` | Provider: `{ positions, loading, error, refresh, addPosition, updatePosition, closePosition, deletePosition }`. Loads **all** rows (open + closed) once per session; writes patch the local list in place. To be mounted in `src/main.tsx`. |
| `src/components/interest/InterestPositionForm.tsx` | The **shared** add/edit dialog, used by both entry points (Campaigns "Track" and the asset-detail section). Asset + platform `Select`s, quantity, rate + kind, program name, start/end dates, note. Quantity and rate leave as `toFixed()` strings. |
| `src/components/interest/display.ts` | Render-side wording (kept out of components, which carry no copy, and out of `lib/interest.ts`, which stays pure): `formatInterestDay`, `statusLabel`, `statusOf`, `formatPositionRate` (reuses `formatApr`), `expiryPhrase` ("12 days left" / "Expired 3 days ago"), `alertSentence` (the dashboard sentence). |
| `src/components/interest/InterestBadge.tsx` | The Portfolio row indicator: `summarizeAssetInterest` → a tiny bordered pill (percent icon + rate) tinted by the loudest status, with per-position detail in a `Tooltip`. Returns `null` when the asset has no open position. |
| `src/components/asset-detail/AssetInterestSection.tsx` | The management home: this asset's open positions as cards (+ a "Show N closed" toggle), add/edit/close/delete, the campaign cross-link line, and the shared dialog. |
| `src/components/dashboard/InterestAlerts.tsx` | The two warning banners (expired = red, ends-soon = amber), max 3 named positions each plus "and N more", each line linking to `/assets/:assetId`. Dismissal is one `sessionStorage` flag. |


Edits to **existing** files the build will need:

| Path (to edit) | Change |
|---|---|
| `src/types/database.ts` | Add the `InterestPosition` row interface + `InterestPositionInsert` / `InterestPositionUpdate` (numeric-as-string writes, hand-synced as ever). |
| `src/main.tsx` | Mount `<InterestProvider>` alongside the other providers. |
| `src/lib/campaigns.ts` | Export the existing private `daysBetweenIsoDays` helper so the interest logic reuses it instead of restating it. |
| `src/pages/DashboardPage.tsx` | Render `<InterestAlerts />` above the hero. |
| `src/components/portfolio/PortfolioRow.tsx` | Render `<InterestBadge>` next to the ticker in **both** the desktop row and the mobile card. |
| `src/pages/AssetDetailPage.tsx` | Render `<AssetInterestSection>` between the platform table and the transaction list. |
| `src/pages/CampaignsPage.tsx` | "Track" button per campaign card → `buildPositionPrefill(campaign, platforms)` → the shared dialog. One `trackPrefill` state can double as "dialog open" and "what to prefill". |
| `package.json` | Version bump on the shipping commit. |

## Schema (planned migration)

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
  `DEADLINE_SOON_DAYS` (7, imported from the campaigns constants so the horizon
  can't drift): `null` days → `flexible` (also the answer for an unparseable
  date — an unreadable date must never masquerade as a deadline), `< 0` →
  `expired`, `≤ 7` → `ends_soon`, else `active`.
- **Day arithmetic** should reuse `daysBetweenIsoDays` from
  `src/lib/campaigns.ts` (today a module-private helper — export it) so there is
  one implementation of "whole days between two `YYYY-MM-DD` values", not two.
- **Estimates** are BigNumber throughout. `estimatePositionYearlyUsd` delegates
  to `estimateYearlyUsd` (same `qty × price × apr/100`, same "null, never $0"
  rule for a missing/zero/junk input); `estimatePositionTermUsd` multiplies that
  by `termDays / 365` and is null for a flexible or zero-length term.
- **Sort** (`sortPositions`) ranks by status (expired 0, ends_soon 1, active 2,
  flexible 3), then by end date ascending, then stable input order. Because the
  loudest status sorts first, `summarizeAssetInterest` can take the head of the
  sorted list as both the badge's status and its leading position.
- **Prefill** (`buildPositionPrefill`) derives the end date from `lock_days`
  (today + lock days) in preference to the campaign's `deadline` — a deadline is
  when you may *join*, not when the money comes back. `matchPlatformByName`
  normalizes both names to `[a-z0-9]` and takes an exact match first, otherwise
  the **shortest** containment match, so "OKX" resolves to "OKX" over "OKX TR"
  when both exist. Null when nothing resembles it; the dialog then asks.
- `PositionPrefill` has **all fields optional** because the two entry points
  know different things: a campaign card knows platform/rate/term but not the
  asset; the asset-detail section knows only the asset.

## Frontend notes & gotchas (decisions already made)

- The context deliberately loads **closed rows too** (`includeClosed: true`), so
  the asset-detail history toggle costs no second round-trip. Every consumer
  that wants live rows filters through `openPositions` — the dashboard banner
  and the portfolio badge both do.
- `closePosition` keeps the row in the local list with `is_closed` flipped (it
  is an archive, not a removal); `deletePosition` removes it.
- Status colors (amber/red) are applied through `INTEREST_STATUS_CLASSES`, not
  `gainLossClass`. Same amber as the campaigns staleness banner. This is the
  same rule Component 15 follows for APRs: not P&L, not the P&L palette.
- The dashboard banner reads `sessionStorage` once in a `useState` initializer,
  so dismissal survives navigation within the session and dies with the tab.
- Nothing in this component imports the P&L engine, `usePnL`, or
  `HoldingsContext`. That is the boundary rule enforced by construction.

## Open questions for the build

- **Migration timestamp** — pick one at implementation time; the schema above
  assumes it lands after `20260817120000_campaigns.sql` (it references
  `campaigns(id)`).
- **Quantity vs balance** — deliberately never reconciled (see the behavioral
  spec's out-of-scope list). Revisit only if the auto-transaction extension is
  ever built.
