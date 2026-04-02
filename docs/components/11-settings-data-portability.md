# Component 11: Settings & Data Portability

## Overview
Finalize the Settings page with data export (JSON/CSV), import (CSV + bulk paste), display preferences (currency, dark mode), price management, pg_cron for automated monthly snapshots, and data management (danger zone).

## Dependencies
- Component 10 (Snapshots & Performance) — for pg_cron snapshot automation
- Component 3 (Platform & Asset Management) — Settings already has platform/asset tabs
- All previous components for full export coverage

## File Structure
```
supabase/
├── migrations/
│   └── 00009_create_pgcron_snapshot.sql
├── functions/
│   └── take-snapshot/index.ts
src/
├── pages/
│   └── SettingsPage.tsx                # All settings tabs
├── components/
│   └── settings/
│       ├── ExportData.tsx
│       ├── ImportData.tsx
│       ├── DisplayPreferences.tsx
│       ├── PriceSettings.tsx
│       └── DataManagement.tsx
├── lib/
│   ├── export.ts
│   └── import.ts
```

## Tasks
1. **Export utility** (`lib/export.ts`):
   - `exportAllJSON(userId)`: Fetch all tables → single JSON → browser download as `portfolio-export-{date}.json`
   - `exportTransactionsCSV(userId)`: Transactions with joins → CSV (Date, Asset, Ticker, Platform, Type, Amount, Unit Price, Currency, Total, Fee, Notes)
   - `exportSnapshotsCSV(userId)`: Snapshots → CSV (Date, Total USD, Total TRY)
   - Use `Blob` + `URL.createObjectURL` + `<a download>` pattern

2. **Import utility** (`lib/import.ts`):
   - `parseCSV(file)`: Use `papaparse` (`npm install papaparse @types/papaparse`)
   - `validateTransactionImport(rows)`: Check required columns exist. Return errors for invalid rows
   - `importTransactions(rows, userId, assetMap)`: For each row: find/create asset → create transaction → recalculate balance. Returns { imported, skipped, errors[] }
   - `importBulkPortfolio(rows, userId)`: For "paste a table" import. Each row: Platform, Asset Name, Ticker, Category, Balance, Avg Cost. Creates platforms + assets + synthetic buy transactions
   - Duplicate detection: skip if matching (asset_id, date, type, amount) exists

3. **ExportData component**: Three buttons (JSON, Transactions CSV, Snapshots CSV) with brief descriptions. shadcn Card

4. **ImportData component**: File input (drag & drop), preview table (first 5 rows), column mapping (auto-detect + manual), Import button with progress. Separate section for "Bulk Portfolio Import" textarea (paste tab-separated data)

5. **DisplayPreferences**: Default currency (USD/TRY Select), number format locale (en-US/tr-TR), dark mode toggle (shadcn Switch → `class="dark"` on `<html>`). All persisted to localStorage

6. **PriceSettings**: Last update time, "Refresh Now" button, API status indicators (green/amber/red for TCMB, CoinGecko, Yahoo), auto-refresh toggle (30-min interval when enabled)

7. **DataManagement**: Danger zone (red border). "Delete All Transactions" with double confirmation. "Delete All Data" with triple confirmation (type "DELETE"). shadcn AlertDialog

8. **Settings page tabs**: Platforms, Assets, Display, Prices, Export/Import, Data Management

9. **take-snapshot edge function**: Same logic as createSnapshot() but runs server-side. Accepts user_id parameter

10. **pg_cron migration** (`00009`): Enable pg_cron extension. Schedule `'5 21 1 * *'` (1st of month, 00:05 UTC+3). **Preferred: create plpgsql function** `take_snapshot(p_user_id)` that does snapshot in SQL directly. pg_cron calls: `SELECT take_snapshot(user_id) FROM auth.users LIMIT 1;`. More reliable than HTTP → edge function

11. **Dark mode**: `darkMode: 'class'` in Tailwind config. shadcn/ui already supports it. Toggle controls `dark` class on root

12. **Auto-refresh interval**: In usePrices, if enabled, `setInterval(refreshPrices, 30 * 60 * 1000)`. Clear on unmount

## UI Components
- **shadcn/ui**: Card, Tabs, Button, Select, Switch, Label, Input (file), Textarea, Table (preview), Progress, AlertDialog, Separator
- **Install**: `npx shadcn@latest add progress switch alert-dialog`
- **Custom**: ExportData, ImportData, DisplayPreferences, PriceSettings, DataManagement

## Key Decisions
- **JSON export = primary backup**: Preserves all data + types + relationships. CSV for spreadsheet interop
- **Import is additive**: Doesn't delete existing data. Skips duplicates
- **pg_cron with SQL function**: More reliable than HTTP → edge function. No network dependency, runs in-process
- **Dark mode nearly free**: shadcn/ui + Tailwind class strategy. Toggle in localStorage, applied before render (no flash)
- **localStorage for preferences**: No user_preferences table for MVP. Per-browser but sufficient for single user
- **Bulk import critical for setup**: User can copy their spreadsheet data directly

## Acceptance Criteria
- [ ] Export JSON downloads complete portfolio data
- [ ] Export Transactions CSV downloads properly formatted CSV
- [ ] CSV import: upload, preview, map columns, import transactions
- [ ] Bulk import: paste spreadsheet data → creates platforms + assets + transactions
- [ ] Display preferences (currency, locale, dark mode) persist across sessions
- [ ] Dark mode works correctly across all UI components
- [ ] Price settings show API status, manual refresh works
- [ ] Data management delete actions work with proper confirmation
- [ ] pg_cron monthly snapshot job configured
- [ ] Settings page has all tabs functional
