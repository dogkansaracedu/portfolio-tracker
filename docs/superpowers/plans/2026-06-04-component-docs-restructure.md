# Component Docs Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `docs/components/` into a tech-agnostic behavioral layer + a this-build technical layer with one shared glossary, aligned to the current app, so the app could be rebuilt on any stack from the behavioral docs.

**Architecture:** Each component becomes a pair — `components/NN-name.md` (behavioral, tech-agnostic, stays at canonical path so inbound links survive) ↔ `components/technical/NN-name.md` (React/Vite/Supabase/shadcn implementation). One shared `components/GLOSSARY.md` defines entities/terms/formulas once; specs reference it and never redefine. A drift check (read code + old doc) is folded into each component task. PRD moves under `docs/`; a `docs/README.md` index is added; root `README.md` stale bits fixed.

**Tech Stack (of the docs themselves):** Markdown only. No test framework (project has none by design) — verification is `grep` + cross-link checks. Commits go directly to `master` (solo repo, no PR ceremony); docs don't touch the deployed app, so no prod verification. Push is optional at the end.

**Source spec:** `docs/superpowers/specs/2026-06-04-component-docs-restructure-design.md`

---

## File Structure

**Create:**
- `docs/components/GLOSSARY.md` — shared domain model + terms + formulas
- `docs/components/technical/01-project-setup.md` … `11-settings-data-portability.md` (11 files)
- `docs/README.md` — docs-folder index

**Rewrite in place (behavioral, tech-agnostic):**
- `docs/components/01-project-setup.md` … `11-settings-data-portability.md` (11 files)
- `docs/components/README.md` — index table + dependency graph + "how to read these docs"

**Move + align:**
- `PRD.md` → `docs/PRD.md` (feature matrix aligned to current state)
- Root `README.md` — fix stale "Known gaps" line; repoint PRD links (lines 7 & 217)

**Leave untouched:** `docs/pnl-methodology.md` (verify only), `docs/budget-feature-plan.md`, `docs/pnl-engine-scaling-upgrade-path.md`, `docs/quote-currency-and-price-fetch-plan.md`, `docs/denomination-rollback-handoff.md`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**` (except this plan).

---

## Shared procedure for component-pair tasks (Tasks 2–12)

Every component task follows the same four steps. The per-component **content sheet** in each task supplies the unique inputs (sources, drift checklist, behavioral bullets, technical bullets, glossary links).

- [ ] **Step A — Read sources & confirm drift.** Read the current `docs/components/NN-name.md` and every code file listed in the sheet's *Sources*. Confirm each item in *Drift to fix* against the code (the checklist is a starting point — trust the code if they disagree, and note anything new you find).
- [ ] **Step B — Write the behavioral spec** at `docs/components/NN-name.md`, replacing it wholesale, using the **behavioral template** below and the sheet's *Behavioral* bullets. Link every domain term to `GLOSSARY.md` (e.g. `[net invested capital](GLOSSARY.md#net-invested-capital)`); never redefine a glossary term. Header pointer line: `> Layer: behavioral (tech-agnostic). Implementation → [technical/NN-name.md](technical/NN-name.md)`. **No stack specifics in the body** — no `npm`/`npx`/`shadcn`/`.tsx`/library names. Code-bound formulas are allowed *as math with worked examples* (numbers, not function names).
- [ ] **Step C — Write the technical doc** at `docs/components/technical/NN-name.md` using the **technical template** below and the sheet's *Technical* bullets. Header pointer line: `> Layer: React/Vite/Supabase implementation. Contract → [../NN-name.md](../NN-name.md)`. Use exact file paths.
- [ ] **Step D — Verify & commit.**
  - Stack-leak check (must print nothing): `grep -nE 'npm |npx |shadcn|\.tsx|\.ts:|\bSupabase\b|Tailwind|Recharts|BigNumber|useState|\bReact\b|\bVite\b|\bDeno\b|pg_cron|Postgres|Edge Function' docs/components/NN-name.md | grep -v 'technical/NN-name.md'`
  - Cross-links resolve: `grep -c 'technical/NN-name.md' docs/components/NN-name.md` → ≥1; `grep -c '\.\./NN-name.md' docs/components/technical/NN-name.md` → ≥1; `grep -c 'GLOSSARY.md' docs/components/NN-name.md` → ≥1.
  - Commit: `git add docs/components/NN-name.md docs/components/technical/NN-name.md && git commit -m "docs(components): rewrite component NN as behavioral spec + technical doc"`

### Behavioral template

```
# Component N: <Name> — Behavioral Spec
> Layer: behavioral (tech-agnostic). Implementation → technical/NN-name.md

## Purpose            — what & why, one paragraph
## Depends on         — other components (behavioral), by name+number
## Concepts used      — bulleted links into GLOSSARY for the terms this component touches
## Behaviors / rules  — what it must do, as rules; worked examples (numeric) for formulas
## Contract (I/O)     — what it consumes from / exposes to other components; data shapes
                        described conceptually (field names ok, no language types)
## UI contract        — what the user sees & can do; states (loading/empty/error);
                        responsive intent. Omit if the component is non-visual.
## Acceptance         — tech-neutral checks a rebuild on ANY stack must pass
```

### Technical template

```
# Component N: <Name> — Technical (this build)
> Layer: React/Vite/Supabase implementation. Contract → ../NN-name.md

## Stack              — libraries actually used for this component
## File map           — real paths (pages/components/hooks/lib/queries/supabase) + 1-line roles
## Data layer         — Supabase tables/migrations, edge functions, RLS notes (if any)
## Notes & gotchas    — non-obvious decisions (see sheet); the "why it's like this"
## Setup / commands   — npm / shadcn / supabase commands where relevant (else omit)
```

---

## Task 1: GLOSSARY.md

**Files:** Create `docs/components/GLOSSARY.md`

- [ ] **Step 1 — Write the glossary** with these three sections. Each entry is 1–3 sentences. Give every entity and term a markdown heading so specs can deep-link (`#asset`, `#net-invested-capital`, etc.).

  **Entities** (conceptual nouns; name the fields, no SQL types):
  - **Platform** — where assets are held (broker / exchange / bank / physical); has a display color.
  - **Asset** — global, one per ticker per user. Fields: `category` (free-form text: fiat, crypto, gold, stock_us, stock_bist, vehicle, …), `tags[]` (cross-cutting allocation, e.g. `["crypto","usd"]`), `price_source` (which feed prices it: tcmb / coingecko / yahoo / manual), `price_id` (the identifier the feed uses), native currency.
  - **Holding** — balance of one Asset on one Platform, in the asset's native units.
  - **Transaction** — a dated event. Types: buy, sell, transfer_in, transfer_out, dividend, interest, fee, cash_credit, cash_debit. `linked_tx_id` pairs the cash leg of a trade and the two legs of a transfer. **Price currency is derived from the asset (asset-native) — defaulted, editable, never a free picker.**
  - **Snapshot** — a frozen point-in-time portfolio value: `total_usd` plus a `by_asset` breakdown (per ticker, and per ticker×platform) each carrying `value_usd` and `price_usd`.
  - **Price** — current/cached unit price of an asset in its quote currency.
  - **Exchange rate** — historical FX by date (usd_try, eur_try). USD is the anchor currency.
  - End with a 4–6 line relationships note (Asset 1—N Holding; Asset 1—N Transaction; Snapshot embeds by_asset; Transaction cash/transfer legs paired by linked_tx_id).

  **Terms:**
  - **USD anchor** — all P&L is measured in USD regardless of an asset's native currency.
  - **Net invested capital** — net USD deployed; deposits/withdrawals and the cash legs of trades net out (a sell and its paired cash_credit cancel).
  - **Money-weighted** — value today vs. dollars actually deployed (not a time-weighted return).
  - **FIFO lot / cost basis** — purchases stack as lots; sells consume oldest-first; cost basis = USD cost of remaining lots.
  - **Realized vs. unrealized** — realized = P&L locked in by sells (FIFO); unrealized = current value − cost basis of holdings. Sub-views of the money-weighted total.
  - **Fiat FX P&L** — fiat holdings carry FX gain/loss vs. the USD anchor (cost basis = net USD deployed into that currency); they are *not* zero-P&L.
  - **Daily return** — Δ(value − invested) since the previous snapshot; subtracting period-invested removes principal so only price movement remains.
  - **Allocation %** — an asset's (or group's) current value ÷ total value.
  - **Snapshot-price / live-quantity rule** — displayed value = live Holding balance × the latest Snapshot's per-unit price (quantities update instantly; prices stay consistent with the dashboard).
  - **Staleness** — how old a Price is; surfaced as an indicator.

  **Canonical formulas** (state them, then link out — do not restate the rationale that lives in `pnl-methodology.md`):
  - `Total P&L = current value − net invested capital` (USD). → see [P&L Methodology](../pnl-methodology.md).
  - `Daily return = value_now − prev_snapshot_value − period_invested`; `denom = prev_snapshot_value + period_invested`; pct is `null` when `denom ≤ 0`.

- [ ] **Step 2 — Verify & commit.**
  - Headings present for deep-linking: `grep -c '^###\? ' docs/components/GLOSSARY.md` → ≥ 18.
  - Links to methodology, doesn't duplicate it: `grep -c 'pnl-methodology.md' docs/components/GLOSSARY.md` → ≥1.
  - Commit: `git add docs/components/GLOSSARY.md && git commit -m "docs(components): add shared GLOSSARY (entities, terms, formulas)"`

---

## Tasks 2–12: Component pairs

Follow the **Shared procedure** (Steps A–D) for each. Tasks 2–12 are mutually independent (disjoint files) and may run in parallel after Task 1.

### Task 2 — Component 1: Project Setup
- **Sources:** `docs/components/01-project-setup.md`, `vite.config.ts`, `package.json`, `components.json`, `src/main.tsx`, `src/App.tsx`, `src/components/layout/*`, `index.html`, `supabase/config.toml`.
- **Drift to fix:** old doc lists `postcss.config.js` + `tailwind.config.js` — Tailwind 4 uses `@tailwindcss/vite`, neither file exists; placeholder pages are now real; remove `Avatar` from the shadcn list if unused (`src/components/ui/` has no `avatar.tsx`); theming via `next-themes` not mentioned.
- **Behavioral:** client-rendered SPA; routes (dashboard, portfolio, transactions, performance, settings + public login/signup); responsive app shell (persistent desktop side nav, bottom nav on mobile); light/dark theme; auth-gated app vs. public auth pages. Acceptance: nav works on desktop & mobile; theme toggles; unauthenticated users land on login.
- **Technical:** Vite 8 + React 19 + TS 5.9; Tailwind 4 via `@tailwindcss/vite` (no postcss/tailwind config); shadcn/ui (New York, Zinc, CSS vars) — actual `ui/` inventory; React Router 7 `createBrowserRouter` with a layout route; `@/` path alias; `next-themes`, `@fontsource-variable/geist`, `tw-animate-css`; local Supabase via CLI/Docker. Files: `layout/{AppLayout,Sidebar,MobileNav,Header,UserMenu,RouteSkeleton}.tsx`. Commands: `npm create vite`, `npx shadcn add …`, `supabase init/start`.
- **Glossary links:** none required (setup is pre-domain).

### Task 3 — Component 2: Database Schema & Auth
- **Sources:** `docs/components/02-database-schema-auth.md`, `supabase/migrations/*`, `src/types/database.ts`, `src/contexts/AuthContext.tsx`, `src/components/auth/*`, `src/lib/supabase.ts`.
- **Drift to fix:** signup allowlist via BEFORE INSERT trigger on `auth.users` (added 2026-05-10) + grandfathering of pre-existing users; `seed_user_data` seeds default platforms + assets on signup.
- **Behavioral:** the data model (link entities to GLOSSARY); per-user data isolation; email/password auth (login/signup/protected routes); signup gated by an allowlist; new users auto-seeded with default platforms + assets. Acceptance: a non-allowlisted email cannot create an account; a new allowlisted user starts with seeded platforms/assets; users see only their own data.
- **Technical:** Supabase Postgres; append-only migrations (list them by role); RLS policies (per-user); Supabase Auth (auto-confirm locally); `signup_allowlist` table + trigger; `seed_user_data` SQL function; hand-written `types/database.ts`; `auth/{LoginForm,SignupForm,ProtectedRoute}.tsx`, `AuthContext`, `useAuth`.
- **Glossary links:** Platform, Asset, Holding, Transaction, Snapshot, Exchange rate.

### Task 4 — Component 3: Platform & Asset Management
- **Sources:** `docs/components/03-platform-asset-management.md`, `src/components/platforms/*`, `src/components/assets/*`, `src/components/common/{AssetIcon,Logo,PlatformDot}.tsx`, `src/lib/assetIcons.ts`, `src/lib/constants/{assets,brokers,assetIcons}.ts`, `src/lib/queries/{platforms,assets}.ts`, `src/contexts/{PlatformsContext,AssetsContext}.tsx`, `docs/superpowers/specs/2026-05-31-asset-logos-design.md`.
- **Drift to fix:** `price_id` + `price_source` fields on assets; asset icons/logos (2026-05-31); asset-native currency; activate/deactivate.
- **Behavioral:** CRUD platforms (name, type, color); CRUD assets (global per ticker; category free-form; tags; price source; price id; native currency); activate/deactivate; each asset shows an icon/logo. Acceptance: creating an asset requires ticker+category+price source; deactivating hides it from active views without deleting history.
- **Technical:** `platforms/{PlatformCard,PlatformForm,PlatformList}.tsx`, `assets/{AssetForm,AssetList,AssetRow}.tsx`; logo strategy = token-free CDN (TradingView logo CDN, flagcdn) per project convention; `lib/assetIcons.ts` + `constants/assetIcons.ts`; `constants/{assets,brokers}.ts`; `queries/{platforms,assets}.ts`; `PlatformsContext`/`AssetsContext` (shared via providers, not per-call-site fetches).
- **Glossary links:** Platform, Asset, Holding, Price.

### Task 5 — Component 4: Transaction System
- **Sources:** `docs/components/04-transaction-system.md`, `src/components/transactions/AddTransactionModal.tsx`, `src/components/transactions/sheet/**`, `src/lib/{balance,cash}.ts`, `src/lib/constants/{transaction-types,midas-pdf}.ts`, `src/lib/queries/transactions.ts`, `docs/superpowers/specs/2026-05-28-transaction-row-realized-pnl-design.md`, `docs/superpowers/specs/2026-05-30-asset-price-id-and-yahoo-design.md`.
- **Drift to fix:** the **entire bulk-import subsystem** (`sheet/`): spreadsheet grid with typed cells, CSV import (papaparse), **Midas broker PDF import** (pdfjs-dist), asset/platform resolution stepper, validation, sentinels; **asset-native price currency** (editable-but-defaulted, never a free picker); linked cash-leg model (`cash_credit`/`cash_debit` paired via `linked_tx_id`); transfers preserve cost basis.
- **Behavioral:** record buy/sell/transfer/dividend/interest/fee; each trade's price is in the asset's native currency; recording recalculates the affected holding's balance; transfers move cost basis (paired in/out, no realized P&L); a trade's cash movement is captured as a paired cash leg; bulk import from a pasted/typed grid, a CSV, or a broker PDF, with a step to resolve unknown assets/platforms. Worked example: a transfer's transfer_in carries the weighted-average cost of the consumed lots. Acceptance: recording a buy increases the holding balance and creates a paired cash_debit; importing a Midas PDF produces editable, validated rows; an unrecognized ticker is surfaced for resolution before commit.
- **Technical:** `AddTransactionModal`, `sheet/{TransactionsSheetGrid,ImportPopover,MidasPdfImportButton,ResolveAssetsStepper,useTransactionsSheetState,parseImport,parseMidasPdf,validation,sentinel,autoResolveSentinels,types}.tsx/.ts`, `sheet/cells/*`; `lib/balance.ts` (recalc), `lib/cash.ts`; `constants/{transaction-types,midas-pdf}.ts`; `queries/transactions.ts`; papaparse, pdfjs-dist (`lib/pdf/loadPdfjs.ts`). Note the asset-native-currency rule and the linked-row model as gotchas.
- **Glossary links:** Transaction, Holding, Asset, FIFO lot / cost basis, net invested capital.

### Task 6 — Component 5: Price Engine
- **Sources:** `docs/components/05-price-engine.md`, `supabase/functions/{fetch-prices,fetch-tcmb,fetch-coingecko,fetch-yahoo,fetch-historical-rate}/*`, `src/contexts/PricesContext.tsx`, `src/hooks/usePrices.ts`, `src/lib/{prices,priceId}.ts`, `src/lib/queries/{prices,exchangeRates}.ts`, `src/components/prices/*`, `docs/superpowers/specs/2026-05-30-asset-price-id-and-yahoo-design.md`.
- **Drift to fix:** **demand-driven, presence-gated refresh** (refresh when the user is present, not a scheduled price cron); `price_id`-keyed pricing; Yahoo is the only free BIST source (~15min delay, accepted); manual price entry.
- **Behavioral:** every asset gets a current price from a source determined by its `price_source` (central-bank FX / crypto feed / equities feed / manual); prices and historical FX (USD anchor) are cached; refresh is demand-driven (triggered by presence/explicit action), not a background schedule; stale prices are flagged. Acceptance: a BIST stock prices from the equities feed; a manual asset keeps its entered price; switching `price_source` re-routes fetching.
- **Technical:** Supabase Edge Functions (Deno): `fetch-prices` (orchestrator) + `fetch-tcmb`/`fetch-coingecko`/`fetch-yahoo`/`fetch-historical-rate`; `PricesContext` + `usePrices` (presence-gated refresh — explain the architecture, contrast with cron); `lib/priceId.ts` (keying), `lib/prices.ts` (formatters incl. `gainLossClass`/`formatSignedCurrency`/`formatSignedPercent`); `queries/{prices,exchangeRates}.ts`; `prices/{PriceDisplay,PriceRefreshButton}.tsx`.
- **Glossary links:** Price, Exchange rate, USD anchor, Staleness, Asset.

### Task 7 — Component 6: P&L Engine
- **Sources:** `docs/components/06-pnl-engine.md` (already partly current — preserve its correct money-weighted content, move stack detail to technical), `src/lib/pnl/{fifo,unrealized,realized,currency,totals,daily,types}.ts`, `src/lib/performance.ts`, `src/hooks/{usePnL,useCostBasis,useRealizedPnL,usePnLSummary}.ts`, `src/lib/queries/pnl.ts`, `docs/pnl-methodology.md`.
- **Drift to fix:** `daily.ts` (daily-return formula) is new; `realized.ts` split out; `totals.ts` `summarizePnLTotals`; confirm fiat-FX-P&L branch in `usePnL`.
- **Behavioral:** FIFO cost basis (lots; sells consume oldest-first); currency normalization to the USD anchor via historical rates; **canonical Total P&L = value − net invested (money-weighted)**; realized/unrealized are sub-views; fiat carries FX P&L; daily return = Δ(value−invested) since previous snapshot. Keep the existing worked examples (FIFO sell; same-day buy daily return). Acceptance: the four existing acceptance bullets in the current doc, restated tech-neutrally, plus "total = value − net invested" and "fiat reports FX P&L." This spec is mostly a re-section of the current doc — keep its formulas, strip `.ts` filenames into the technical doc.
- **Technical:** `lib/pnl/{types,fifo,unrealized,realized,currency,totals,daily}.ts` (one-line role each); `lib/performance.ts` (`computeCurrentInvestedUsd`, `computePnLTimeSeries`); hooks `usePnL`/`useCostBasis`/`useRealizedPnL`/`usePnLSummary`; `queries/pnl.ts`; BigNumber at all money boundaries, `.toNumber()` only at the UI edge. This is the single P&L engine — note "don't reintroduce a FIFO-sum total."
- **Glossary links:** FIFO lot / cost basis, realized vs. unrealized, money-weighted, net invested capital, USD anchor, fiat FX P&L, daily return, Snapshot.

### Task 8 — Component 7: Dashboard
- **Sources:** `docs/components/07-dashboard.md`, `src/pages/DashboardPage.tsx`, `src/components/dashboard/*`, `src/hooks/{useDashboard,useDashboardHero}.ts`, `src/contexts/DisplayContext.tsx`.
- **Drift to fix:** 2Y time range; money-weighted hero period-P&L delta; **percentages stay visible when values are hidden**; tag breakdown.
- **Behavioral:** show net worth (in the selected display currency); allocation breakdown; platform breakdown; tag breakdown; top movers; a hero showing value + period P&L over a selectable range; a privacy toggle that hides amounts but keeps percentages visible. Acceptance: net worth equals the portfolio total (same snapshot source); hiding values blanks amounts but not percentages; the hero's period delta is the money-weighted change.
- **Technical:** `DashboardPage`; `dashboard/{DashboardHero,NetWorthCard,AllocationChart,PlatformBreakdown,TagBreakdown,TopMovers}.tsx`; `useDashboard`/`useDashboardHero`; Recharts; `DisplayContext` (display currency + obfuscation `o(...)`); time ranges incl. 2Y.
- **Glossary links:** Snapshot, allocation %, money-weighted, USD anchor, snapshot-price / live-quantity rule.

### Task 9 — Component 8: Portfolio Page
- **Sources:** `docs/components/08-portfolio-page.md`, `src/pages/PortfolioPage.tsx`, `src/components/portfolio/*`, `src/hooks/usePortfolio.ts`, `src/lib/constants/portfolio.ts`, `src/lib/pnl/daily.ts`, `docs/superpowers/specs/2026-06-03-portfolio-daily-return-toggle-design.md`.
- **Drift to fix:** **Total/Daily return toggle** on group headers + rows (2026-06-03); **AssetDetailSheet was deferred and never built** — remove it from the doc; snapshot-price / live-quantity rule; summary bar stays the lifetime total.
- **Behavioral:** grouped asset table (group by platform or category) with search/filter; columns asset, quantity, price, value, cost basis, return, allocation; a **Total | Daily** toggle that switches the return figure on both group headers and rows (daily = since previous snapshot; `—` when no prior snapshot); value = live quantity × snapshot price; summary bar shows lifetime total; mobile → cards; hide inactive; zero-balance handling. Acceptance (restate the design's verification): toggle flips headers+rows, default Total; an asset bought today shows daily return from its purchase price; one-or-zero snapshots → daily renders `—`; group header = Σ of its visible rows.
- **Technical:** `PortfolioPage`; `portfolio/{PortfolioTable,PortfolioRow,PortfolioGroupHeader,PortfolioSummaryBar,PortfolioFilters}.tsx`; `usePortfolio` (returnMode state, prevSnapshot lookups, per-(ticker,platform) scoping); `constants/portfolio.ts` (`RETURN_MODE_LABELS`); `lib/pnl/daily.ts` (`computeDailyReturn`); shadcn Table + ToggleGroup; gain/loss palette via `lib/prices`.
- **Glossary links:** daily return, money-weighted, snapshot-price / live-quantity rule, allocation %, realized vs. unrealized, Holding.

### Task 10 — Component 9: Transactions Page
- **Sources:** `docs/components/09-transactions-page.md`, `src/pages/{TransactionsPage,TransactionsEditPage}.tsx`, `src/components/transactions/{TransactionList,TransactionRow,TransactionFilters,TransactionSummary,TransactionTypeSelector,AssetSearchSelect,FundingSourceSelect}.tsx`, `src/hooks/{useTransactions,useTransactionLog,useRealizedPnL}.ts`, `src/contexts/{TransactionContext,TransactionDataContext}.tsx`.
- **Drift to fix:** per-row **realized P&L display** (2026-05-28); a dedicated **edit page**; entry point into the bulk-import subsystem (Component 4).
- **Behavioral:** a filterable transaction log (by type, asset, platform, date); each sell row shows its realized P&L; transactions are editable; a summary of activity; entry to bulk import. Acceptance: filtering by asset narrows the log; a sell shows realized P&L consistent with the P&L engine; editing a transaction updates balances.
- **Technical:** `TransactionsPage` + `TransactionsEditPage`; the `transactions/*` list/filter components; `useTransactions`/`useTransactionLog`/`useRealizedPnL`; `TransactionContext` vs `TransactionDataContext` (shared-data provider split — avoids per-row refetch flood); `queries/transactions.ts`.
- **Glossary links:** Transaction, realized vs. unrealized, FIFO lot / cost basis.

### Task 11 — Component 10: Snapshots & Performance
- **Sources:** `docs/components/10-snapshots-performance.md`, `src/pages/PerformancePage.tsx`, `src/components/performance/*`, `src/components/charts/LazyChart.tsx`, `src/hooks/{usePerformance,useSnapshots,useBenchmark}.ts`, `src/contexts/SnapshotsContext.tsx`, `src/lib/performance.ts`, `src/lib/queries/{snapshots,benchmarks}.ts`, `src/lib/constants/benchmarks.ts`, `supabase/functions/{take-snapshots,backfill-snapshots}/*`, `supabase/migrations/*daily_snapshot_cron*`.
- **Drift to fix:** snapshot density (daily for last 30d, weekly older); on-demand backfill; daily auto-snapshot via pg_cron; drawdown / monthly-returns / category-attribution charts; benchmark comparison; performance summary metrics.
- **Behavioral:** the portfolio is snapshotted daily (frozen value + per-asset breakdown); historical backfill is available on demand at the stated density; performance views — value over time, drawdown, monthly returns, category attribution, benchmark comparison, summary metrics — over a selectable range. Acceptance: a snapshot freezes total + by_asset; backfill produces daily(≤30d)/weekly(older) points; charts render over the chosen range.
- **Technical:** `PerformancePage`; `performance/{PortfolioValueChart,DrawdownChart,MonthlyReturnsChart,CategoryAttribution,PerformanceSummary,TimeRangeSelector,SnapshotManager}.tsx`; `charts/LazyChart.tsx` (lazy Recharts); `usePerformance`/`useSnapshots`/`useBenchmark`; `SnapshotsContext`; `lib/performance.ts`; `queries/{snapshots,benchmarks}.ts`; Edge Functions `take-snapshots` + `backfill-snapshots`; pg_cron `daily-portfolio-snapshot` (23:55 UTC, chains after fetch-prices).
- **Glossary links:** Snapshot, money-weighted, net invested capital, USD anchor, allocation %.

### Task 12 — Component 11: Settings & Data Portability
- **Sources:** `docs/components/11-settings-data-portability.md`, `src/pages/SettingsPage.tsx`, `src/components/settings/SnapshotBackfillCard.tsx`, `src/contexts/{ThemeContext,DisplayContext}.tsx`, `src/components/common/{ThemeToggle,CurrencyToggle}.tsx`.
- **Drift to fix:** README/old-doc say "Partial (no CSV import/export, no pg_cron)" — **pg_cron exists** (Component 10) and **CSV + Midas PDF *import* exists** (Component 4); **export is still missing**. Reconcile honestly: import = done (cross-reference Component 4), export = not built, snapshot backfill control lives here.
- **Behavioral:** user preferences (display currency, light/dark theme); data portability — import is available (see Component 4); export is **not yet built** (state plainly); a control to run snapshot backfill. Acceptance: changing display currency updates amounts app-wide; theme persists; backfill can be triggered from settings.
- **Technical:** `SettingsPage`; `settings/SnapshotBackfillCard.tsx`; `ThemeContext` + `next-themes` + `ThemeToggle`; `DisplayContext` + `CurrencyToggle`. Note import lives in Component 4's sheet subsystem; export unbuilt.
- **Glossary links:** Snapshot, USD anchor.

---

## Task 13: components/README.md (index)

**Files:** Rewrite `docs/components/README.md`

- [ ] **Step 1 — Rewrite the index.** Sections: (a) one-paragraph intro; (b) **index table** with columns `# | Component | Behavioral | Technical | Status`, each row linking `NN-name.md` and `technical/NN-name.md`; (c) the dependency graph (port the existing ASCII graph); (d) **"How to read these docs"** — glossary defines shared terms, behavioral specs are the tech-agnostic rebuild contract, technical docs are the current React/Supabase build; (e) a *high-level* stack summary (detailed stack now lives in the per-component technical docs). Set Status honestly (Component 11 data-export = partial).
- [ ] **Step 2 — Verify & commit.**
  - All 11 behavioral + 11 technical links present: `grep -oE '(technical/)?[0-9]{2}-[a-z-]+\.md' docs/components/README.md | sort -u | wc -l` → 22.
  - Glossary linked: `grep -c 'GLOSSARY.md' docs/components/README.md` → ≥1.
  - Commit: `git add docs/components/README.md && git commit -m "docs(components): rewrite README index for spec/technical/glossary layers"`

---

## Task 14: docs/README.md (docs-folder index)

**Files:** Create `docs/README.md`

- [ ] **Step 1 — Write the docs index.** A map of `docs/`: link to `PRD.md`, `components/` (note the glossary + behavioral + technical layering), `pnl-methodology.md`, and the `superpowers/specs` + `superpowers/plans` directories (describe them as point-in-time design/plan records). One line on what each is for.
- [ ] **Step 2 — Verify & commit.**
  - Links resolve: `grep -cE 'PRD.md|components/|pnl-methodology.md|superpowers/' docs/README.md` → ≥4.
  - Commit: `git add docs/README.md && git commit -m "docs: add docs/ folder index"`

---

## Task 15: Move PRD + fix root README

**Files:** `git mv PRD.md docs/PRD.md`; modify root `README.md`; align `docs/PRD.md`.

- [ ] **Step 1 — Move the PRD.** Run: `git mv PRD.md docs/PRD.md`
- [ ] **Step 2 — Repoint root README links.** In `README.md`:
  - Line ~7: `[PRD.md](./PRD.md)` → `[PRD.md](./docs/PRD.md)`.
  - Line ~217: `[PRD §16](./PRD.md#16-mvp-scope-summary)` → `[PRD §16](./docs/PRD.md#16-mvp-scope-summary)`.
  - Same line: fix "Known gaps: PWA service worker, CSV import/export, manual 'snapshot now' button" → CSV/PDF **import** has landed (Component 4); remaining gaps are **data export**, PWA service worker, manual "snapshot now". Update to match reality.
- [ ] **Step 3 — Align the PRD.** Read `docs/PRD.md`; reconcile its §16 MVP scope/feature matrix with current state (import subsystem present; daily/total return toggle; money-weighted P&L; pg_cron snapshots). Fix only factual drift — don't rewrite the product vision.
- [ ] **Step 4 — Verify & commit.**
  - No dangling root-relative PRD links: `grep -rn '](./PRD.md' --include='*.md' . | grep -v node_modules` → nothing.
  - PRD at new path: `test -f docs/PRD.md && echo OK`.
  - Commit: `git add -A && git commit -m "docs: move PRD under docs/, align feature matrix, fix README gaps + links"`

---

## Task 16: Final verification sweep

**Files:** none (read-only checks) — then a no-op commit only if fixes were needed.

- [ ] **Step 1 — No stack leak in any behavioral spec:** `grep -lnE 'npm |npx |shadcn|\.tsx|\bSupabase\b|Tailwind|Recharts|BigNumber|useState|\bReact\b|\bVite\b|\bDeno\b|pg_cron|Edge Function' docs/components/[0-9]*.md` → expected: no files listed (ignore matches that are only the `→ technical/NN-name.md` pointer). Fix any real leak by moving it to the technical doc.
- [ ] **Step 2 — Every behavioral spec links its technical doc and back:** for `f` in `docs/components/[0-9]*.md`: it contains `technical/<same-name>` and the technical file contains `../<same-name>`. Spot-check 3.
- [ ] **Step 3 — Every spec references the glossary:** `for f in docs/components/[0-9]*.md; do grep -q GLOSSARY.md "$f" || echo "MISSING GLOSSARY LINK: $f"; done` → nothing.
- [ ] **Step 4 — No duplicate term definitions:** confirm entities/terms/formulas are defined only in `GLOSSARY.md` (specs link, don't restate). Spot-check "net invested" / "money-weighted": `grep -rln 'money-weighted' docs/components/[0-9]*.md` may match (as links/usage) but the *definition* sentence should appear only in GLOSSARY + pnl-methodology.
- [ ] **Step 5 — Dependency graph + status table accurate** in `components/README.md` vs the 11 specs.
- [ ] **Step 6 — Commit any fixes:** `git add -A && git commit -m "docs(components): verification sweep fixes"` (skip if clean).

---

## Self-Review (completed during planning)

- **Spec coverage:** hybrid structure ✓ (Tasks 1–13); agnostic↔technical boundary ✓ (shared procedure Step B/C + Task 16 Step 1 grep); glossary, one file ✓ (Task 1); paired files ✓ (Tasks 2–12); README roles ✓ (Tasks 13–14); scope incl. PRD move + root README + link fixes ✓ (Task 15); leave historical/forward-looking ✓ (File Structure); per-component drift ✓ (folded into each sheet); verification ✓ (Task 16).
- **Placeholder scan:** no "TBD/handle edge cases" — each sheet names concrete drift items, sources, and glossary links. Doc prose is generated at execution (not pre-written) — this is intentional and called out in the plan header, not a placeholder, since the *inputs* (sources + drift + split) are fully specified.
- **Consistency:** behavioral path `components/NN-name.md`, technical path `components/technical/NN-name.md`, pointer lines, and glossary anchors are used identically across the shared procedure, every task, and Task 16's greps.
- **Known-good preserved:** Component 6 sheet says re-section the already-current money-weighted content rather than rewrite it; `pnl-methodology.md` is verify-only.
