# Component 11: Settings & Data Portability — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../11-settings-data-portability.md](../11-settings-data-portability.md)

## Stack

- **Page**: a single React route, `src/pages/SettingsPage.tsx` — a thin shell of
  shadcn `Tabs` mounting **Assets**, **Platforms**, and **Snapshots**. The Assets
  and Platforms tabs render Component 3 components (`AssetList`, `PlatformList`);
  this component owns only the **Snapshots** tab.
- **Preferences via React Context** (not next-themes — see gotcha):
  - **Theme**: `src/contexts/ThemeContext.tsx`, surfaced by
    `src/components/common/ThemeToggle.tsx`.
  - **Display currency + value obfuscation**: `src/contexts/DisplayContext.tsx`,
    surfaced by `src/components/common/CurrencyToggle.tsx`.
- **Backfill**: `src/components/settings/SnapshotBackfillCard.tsx` calls
  `triggerBackfillSnapshots()` in `src/lib/queries/snapshots.ts`, which invokes
  the `backfill-snapshots` Supabase Edge Function (Deno). Toasts via `sonner`.
- **Persistence**: `localStorage` directly (no `usePersistedState` helper, no
  `user_preferences` table — preferences are per-browser).
- **Import** UI is **not here** — it lives in Component 4's transaction sheet
  subsystem. **Export** is **unbuilt** (no file in this build).

## File map

| File | Role |
| --- | --- |
| `src/pages/SettingsPage.tsx` | Shell: `Tabs` = Assets / Platforms / Snapshots. Mounts `AssetList`, `PlatformList` (Component 3) and `SnapshotBackfillCard`. |
| `src/components/settings/SnapshotBackfillCard.tsx` | The only Component-11-owned UI. `useState` for `granularity` (`"monthly" \| "tx_dates"`), `overwrite`, `running`, `lastResult`. Renders granularity buttons, overwrite checkbox, Run button, and a result/`Stat` panel with a warnings list. |
| `src/contexts/ThemeContext.tsx` | Hand-rolled theme context. `localStorage` key **`"theme"`** (`"light"\|"dark"`); falls back to `prefers-color-scheme`. Effect toggles `.dark` on `<html>` and sets `colorScheme`. Exposes `useTheme()` → `{ theme, toggleTheme, setTheme }`. |
| `src/components/common/ThemeToggle.tsx` | Ghost icon button (Sun/Moon) calling `toggleTheme()`. Lives in global chrome, not the Settings page. |
| `src/contexts/DisplayContext.tsx` | Display currency + obfuscation. `localStorage` keys **`"portfolio-display-currency"`** (`"USD"\|"TRY"`, default USD) and **`"portfolio-obfuscated"`**. Exposes `useDisplayCurrency()` → `{ currency, toggleCurrency, obfuscated, toggleObfuscated }`. |
| `src/components/common/CurrencyToggle.tsx` | Outline button showing `$ USD` / `₺ TRY`, calling `toggleCurrency()`. Global chrome. |
| `src/lib/queries/snapshots.ts` | `triggerBackfillSnapshots({ granularity, overwrite })` → `supabase.functions.invoke("backfill-snapshots", { body })`. Types: `BackfillGranularity`, `BackfillOptions`, `BackfillResult` (`target_dates`, `target_count`, `snapshots_written`, `tickers_priced[]`, `sample[]`, `errors?[]`, `timestamp`). Unwraps `FunctionsHttpError.context` to surface the real server error body. |
| _(Component 4)_ | Import UI (grid / CSV / broker PDF). Not in this component. |
| _(none)_ | Export — no module exists. |

## Notes & gotchas

- **Doc/README drift fixed.** The old doc/README said this component was
  "Partial (no CSV import/export, no pg_cron)" and specced `ExportData`/
  `ImportData`/`DisplayPreferences`/`PriceSettings`/`DataManagement` components,
  a `lib/export.ts`/`lib/import.ts`, `papaparse`, a locale select, a danger zone,
  and a `00009` pg_cron migration. **None of that exists.** Current reality:
  scheduled snapshots **do** exist (Component 10), **import** exists (Component 4),
  and **export is still not built**. `SettingsPage` is just 3 tabs.
- **Theme is NOT next-themes.** The brief mentioned next-themes; the code is a
  bespoke context (`ThemeContext.tsx`) writing `localStorage["theme"]` and toggling
  the `.dark` class itself. If you go looking for `next-themes`, it isn't wired in.
  Initial read happens in `useState(readInitial)` so there's no theme flash.
- **Two different storage key conventions.** Theme uses the bare key `"theme"`;
  display currency/obfuscation use `"portfolio-"`-prefixed keys. All writes are
  `try/catch`-guarded against storage being unavailable.
- **Currency/obfuscation are display-only.** They re-denominate/mask at render
  via `useDisplayCurrency()`; no stored value or the USD anchor changes. (Money
  math itself is BigNumber-based in the P&L engine — see Component 6.)
- **Backfill is long-running and partial-success.** The Edge Function pulls
  historical prices from Yahoo Finance and can take ~30–90s; it can return
  `snapshots_written > 0` **and** `errors[]` together (per-ticker/date price
  warnings). The card shows up to 5 warnings and a "+N more". `overwrite: true`
  deletes+rewrites targeted dates server-side; `false` upserts in place.
- **`SettingsPage` has no Display/Prices/Export/Import/Danger-zone tabs.** Display
  toggles live in the global app chrome (header), not on this page.
