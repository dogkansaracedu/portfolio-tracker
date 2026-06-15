# Intraday (hourly) snapshots — design

> Date: 2026-06-15 · Status: approved (pending spec review)
> Touches component 10 (Snapshots & Performance) and component 07 (Dashboard).

## Goal

Capture the portfolio's **total value hourly for a rolling 24-hour window** and render
that intraday detail in the dashboard hero's existing **1D** view. Once a day rolls
over, the hourly rows for the expired window are deleted — the permanent record of that
day stays the existing daily snapshot (written ~23:55). The intraday store never grows
beyond ~24 rows per user.

This adds *intraday resolution for the last day* without touching the daily `snapshots`
table, which remains the single source of truth for current totals and all-time history.

## Decisions (locked)

| Decision | Choice | Rationale |
| --- | --- | --- |
| **Who captures** | Server-side hourly `pg_cron` (24/7) | Full 24h coverage even when the app is closed. User chose this over client-only (which would gap when closed) and over a market-hours hybrid (more complex). |
| **What is stored** | Totals only (`total_usd`, `total_try`) — no breakdown | Allocation doesn't meaningfully move intraday; a full breakdown would bloat each row 24×/day for a value sparkline that only needs totals. The daily snapshot keeps the full breakdown. |
| **Where it's stored** | New `intraday_snapshots` table (timestamp-keyed) | The `snapshots` table is `UNIQUE(user_id, snapshot_date)` on a `date` column — one row per day, physically can't hold hourly points. Isolating intraday keeps the daily source-of-truth untouched. |
| **Retention** | Rolling ~24h window; expired hourly rows deleted outright | The permanent "last point" of an expired day is the existing 23:55 daily snapshot — no reconciliation, no duplicate per-day record. |
| **Display** | Populate the existing **1D** hero view at intraday resolution; 1W+ unchanged | The hero already has a 1D button that currently renders ~1–2 points. 1W+ stay on daily snapshots (mixing intraday into a 7-day chart where only the last day has hourly data would be inconsistent, and retention is 24h). |
| **Index/TWR overlay in 1D** | Suppressed for the 1D range only | The benchmark series is one *daily* close — it can't draw a meaningful intraday line, and a 1-day TWR-vs-index gap isn't informative. Longer ranges keep the overlay as-is. |
| **Cadence** | Every hour on the hour, 24/7 | Crypto moves overnight (real intraday motion); stock/fund values sit flat outside market hours. Cost = 24 forced price refreshes/day — acceptable for a solo portfolio. |

## No-duplication constraint

Approach A (new edge function) is only acceptable if it does **not** add a third copy of
the per-user valuation loop. Today that loop exists twice:

1. `take-snapshots/index.ts` — inlined per-user aggregation (Deno, plain `number`).
2. `src/lib/queries/snapshots.ts` → `buildSnapshotInsert` — browser copy (BigNumber, Vite).

These two can't trivially unify (different runtimes). **(2) is out of scope** — pre-existing,
noted not fixed.

The new function reuses (1) by **extracting** the loop into a shared Deno module so there
are *fewer* copies on the Deno side than today, not more:

- New `supabase/functions/_shared/valuation.ts` exposes `valueHoldings(userHoldings, prices, rates, nowMs)`
  returning `{ totalUsd, totalTry, byAsset, byCategory, byPlatform, byTag, unpriced }` —
  the exact aggregation currently inlined in `take-snapshots`. `STALE_PRICE_MS` moves to
  `_shared/constants.ts` (it's now shared).
- `take-snapshots` refactors to call `valueHoldings()` then build its full-breakdown row
  and upsert to `snapshots`. **Behavior-preserving** — same totals, same unpriced/stale
  skip guard, same home-timezone date stamp.
- `take-intraday-snapshots` (new) calls the same `valueHoldings()`, uses only the totals,
  and inserts to `intraday_snapshots`.
- `fetch-prices`' `triggerSnapshot(cronToken)` is generalized to a reusable
  `triggerChainedFunction(fnName, cronToken)` so the `intraday` path reuses the same fetch
  boilerplate rather than copying it.

## Architecture

### Data model — `intraday_snapshots`

New migration. Columns:

- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null` (FK to `auth.users`, like `snapshots`)
- `captured_at timestamptz not null default now()`
- `total_usd numeric not null`
- `total_try numeric not null`
- Index `idx_intraday_user_captured (user_id, captured_at)`.
- RLS: per-user select/insert/update/delete on `auth.uid()` (mirror `snapshots`).

No `breakdown`. No unique constraint on the hour (capture is append-only; pruning bounds
the row count). Totals stored as `numeric`; written as strings server-side is unnecessary
here (plain JS `number` totals are fine — same precision class as the daily breakdown's
JSONB numbers, and these rows are transient/cosmetic, never an authoritative basis).

### Capture — `take-intraday-snapshots` (new Deno edge function)

1. Auth via `X-Cron-Token` vs `CRON_TOKEN` (same as `take-snapshots`).
2. Load `price_cache` + latest `exchange_rates` + non-zero `holdings` (same queries as
   `take-snapshots`; consider extracting these loads into `_shared/valuation.ts` too if it
   stays clean — otherwise keep them per-function, they're thin).
3. Group holdings by user; for each user call `valueHoldings()`.
4. **Unpriced guard, per row:** if `valueHoldings()` reports any unpriced/stale held asset,
   **skip that user's row this hour** and log — a missing hour is harmless for a sparkline
   (no date is destroyed). This is softer than the daily writer, which skips the whole date.
5. Insert one `{ user_id, captured_at: now(), total_usd, total_try }` per priced user.
6. **Prune:** `delete from intraday_snapshots where captured_at < now() - interval '24 hours'`.
7. Return `{ users, written, pruned, errors }`.

Registered in `supabase/config.toml` (`[functions.take-intraday-snapshots]`).

### `fetch-prices` chaining

- Body type gains `intraday?: boolean`; `doIntraday = isCron && body.intraday === true`.
- `triggerSnapshot(cronToken)` → generalized `triggerChainedFunction(fnName, cronToken)`.
  Existing daily path calls it with `"take-snapshots"`; new Step 3.5 calls it with
  `"take-intraday-snapshots"` when `doIntraday`.

### Cron — `hourly-intraday-snapshot`

New migration. `pg_cron` job `hourly-intraday-snapshot`, schedule `0 * * * *` (every hour
on the hour). POSTs `fetch-prices` with body `{"force": true, "intraday": true}` using the
same Vault secrets (`functions_url`, `cron_token`) as the daily snapshot cron. Unschedules
any prior job of the same name first. Forcing the refresh is what makes "coverage when the
app is closed" work — the demand-driven model otherwise leaves prices stale.

### Read path — `SnapshotsContext`

The context already owns snapshot data and loads once per auth session. It gains
`intradaySnapshots: IntradaySnapshot[]` (last 24h, ascending by `captured_at`), fetched
alongside daily snapshots. ~24 tiny rows; negligible. No per-call-site fetch (data-fetching
rule). `useSnapshots` re-exports it. The client does **not** write intraday rows — capture
is cron-only; the client only reads them.

### Display — `useDashboardHero` + the 1D view

Currently every hero point is positioned at UTC-midnight of a `YYYY-MM-DD` string
(`dateMs = new Date("${date}T00:00:00Z").getTime()`), and `filterByTimeRange` is date-string
based. The 1D view learns a **timestamp** X-axis:

- When `timeRange === "1D"`: build the series from `intradaySnapshots` keyed by real
  `captured_at` epoch ms (not midnight), plus the live in-memory "now" point at the right
  edge (so the chart is live between cron runs). Labels format as time-of-day (`HH:mm`,
  `tr-TR`). `xTicks` pick a sensible subset of hours.
- P&L mode in 1D: `pnl(t) = intradayTotalUsd(t) − investedUsd(date_of_t)`. Invested is
  effectively flat across the day (changes only on a same-day transaction), derived from
  the existing transaction-replay (`computeCurrentInvestedUsd` / `computePnLTimeSeries`
  date lookup). The rolling 24h window can straddle one date boundary — map each point's
  `captured_at` to its home-timezone calendar date for the invested lookup.
- **Index overlay suppressed in 1D:** the portfolio line still moves — in P&L mode it shows
  the intraday cumulative % change (`twrPct(t) = (value(t)/value(windowStart) − 1) × 100`),
  in value mode the intraday value line. Only the **benchmark/index** overlay is hidden in
  1D: `benchmarkPct` stays 0, and the gray index Area + the "vs index" chip + gap-pts are not
  rendered when `timeRange === "1D"`. The "approximate" badge never applies to 1D.
- 1W and all longer ranges are **unchanged** — they read daily snapshots exactly as today.

`TimeRange` already includes `"1D"`; no new range value is added.

## Edge cases & guards

- **Unpriced hour →** skip that user's row, log it, keep going (do not destroy any data).
- **Empty portfolio →** no intraday row is written (matches `take-snapshots`' bulk path,
  which only iterates users with non-zero active holdings). The 1D chart's live "now" anchor
  (current value, 0 when closed) covers the right edge, so a freshly-emptied portfolio still
  renders without a special $0 row.
- **First hour / cold start →** if `intraday_snapshots` is empty for a user, the 1D view
  shows just the live "now" point (and the "not enough data" hint may apply, same as a
  sparse daily chart). It fills in as the cron runs.
- **DST / timezone →** `captured_at` is UTC `timestamptz`; display converts to home tz.
  Date-boundary mapping for the invested lookup uses the home-timezone calendar day.
- **Prune races →** prune is a single `delete ... where captured_at < now()-24h`; idempotent,
  safe to run every hour.

## Out of scope (non-goals)

- Unifying the browser `buildSnapshotInsert` with the Deno valuation core (separate runtime;
  pre-existing duplication).
- Intraday breakdown / allocation (totals only).
- Intraday resolution in 1W or any range > 1D.
- Index/TWR overlay at intraday resolution.
- Backfilling historical intraday data (capture is forward-only from first cron run).

## Docs to update (same change)

- `docs/components/10-snapshots-performance.md` (behavioral) — intraday capture, 24h
  rolling retention, the 1D view, overlay suppression in 1D.
- `docs/components/technical/10-snapshots-performance.md` — new table, `take-intraday-snapshots`,
  `_shared/valuation.ts` extraction, hourly cron, `fetch-prices` `intraday` flag,
  `SnapshotsContext` intraday read, `useDashboardHero` 1D timestamp axis.
- `docs/components/07-dashboard.md` (+ technical) — 1D view now shows intraday detail.
- `docs/components/GLOSSARY.md` — snapshot entry: daily-frozen (authoritative) vs
  intraday-rolling (transient, totals-only, 24h).

## Acceptance criteria

- An `intraday_snapshots` row is written each hour by the cron (forced price refresh →
  chained `take-intraday-snapshots`), totals only.
- Rows older than 24h are pruned every run; the table holds ≤ ~24 rows per user.
- The daily 23:55 snapshot is unchanged and remains the permanent per-day record.
- The hero's 1D view renders the intraday points on a time-of-day axis with a live "now"
  right-edge; 1W+ are visually unchanged.
- The index/TWR overlay does not render in the 1D range.
- An unpriced hour is skipped (logged), never destroys a daily snapshot or writes a wrong
  total; a fully-closed portfolio simply gets no intraday row that hour (now-anchor covers it).
- No third copy of the valuation loop exists: `take-snapshots` and `take-intraday-snapshots`
  both call `_shared/valuation.ts`; `take-snapshots` behavior is preserved.
</content>
</invoke>
