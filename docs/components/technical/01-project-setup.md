# Component 1: Project Setup — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../01-project-setup.md](../01-project-setup.md)

## Stack

- **Build:** Vite 8 (`vite` dev server, `tsc -b && vite build` for prod).
- **UI:** React 19 + React DOM 19.
- **Language:** TypeScript 5.9, strict, bundler module resolution, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- **Styling:** Tailwind 4 via the `@tailwindcss/vite` plugin — **no `postcss.config.js`, no `tailwind.config.js`** (Tailwind 4 is configured in CSS, not JS). `tw-animate-css` for animations.
- **Components:** shadcn/ui, built on **Base UI** (`@base-ui/react`) primitives in this build. Config in `components.json`: `style: "base-nova"`, `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, `rsc: false`. `components.json` is the authority on this — it is **not** the New York / Zinc shadcn default.
- **Icons:** `lucide-react`.
- **Routing:** React Router 7 (`react-router`), `<BrowserRouter>` + `<Routes>` (component-based, not `createBrowserRouter`).
- **Theme:** custom `ThemeContext` + a blocking inline script in `index.html` (see Notes). `next-themes` is installed but **not** the active theme mechanism.
- **Fonts:** `@fontsource-variable/geist` (Geist Variable, imported in `index.css` and wired as `--font-sans`).
- **Toasts:** `sonner`. **Command palette primitive:** `cmdk`. **Dates:** `date-fns` + `react-day-picker`.
- **Backend (local):** Supabase via CLI/Docker (`supabase/config.toml`, project_id `portfolio-tracker`; API 54321, DB 54322, Studio 54323). Auth `minimum_password_length = 10`, email confirmations off locally, `site_url = http://127.0.0.1:5173`.

## File map

- `index.html` — HTML entry; mounts `#root`, loads `/src/main.tsx`; contains the pre-paint theme script and PWA/`theme-color` meta + manifest link.
- `vite.config.ts` — Vite config: `react()` + `tailwindcss()` plugins; `@` alias → `./src`; `define`s the build-identity globals `__BUILD_VERSION__` (from `package.json`), `__BUILD_COMMIT__` (`resolveCommitSha()`), `__BUILD_TIME__` (ISO stamp at config evaluation).
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — project-references TS config; `@/*` path alias declared in both root and app configs.
- `components.json` — shadcn/ui config (style/baseColor/aliases/registries).
- `src/main.tsx` — React entry; calls `initAnalytics()` (fire-and-forget) then `createRoot` under `<StrictMode>`; wraps `<App/>` in the provider stack (`ThemeProvider` → `TooltipProvider` → `DisplayProvider` → `AuthProvider` → `AssetsProvider` → `PlatformsProvider` → `PricesProvider` → `TransactionDataProvider` → `TransactionProvider` → `HoldingsProvider` → `SnapshotsProvider`) and renders `<Toaster/>`.
- `src/App.tsx` — router: public `/login`, `/signup`; everything else under `<ProtectedRoute>`. Full-screen authenticated routes `transactions/edit` and `transactions/edit/:assetId` render outside the shell; the rest nest under `<AppLayout>` (index = Dashboard; `portfolio`, `assets/:assetId`, `transactions`, `performance` (flag-gated), `retirement`, `budget`, `campaigns`, `settings`, `more`). Non-critical pages are `lazy()` + `<Suspense fallback={<RouteSkeleton/>}>` (via the local `Lazy` wrapper); `MorePage` is imported eagerly so tapping the More tab never shows a skeleton.
- `src/index.css` — Tailwind 4 entry: `@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css`, Geist font; `@custom-variant dark`, `@theme inline` design tokens, sidebar/chart CSS variables. Also defines the `pb-safe` / `pb-safe-<n>` `@utility` pair (`env(safe-area-inset-bottom)`, optionally on top of a spacing step) used by `MobileNav`, `AppLayout`'s `<main>`, `DialogFooter` and the bulk editor's footer; `index.html`'s viewport meta carries `viewport-fit=cover`, which is what makes the inset non-zero.
- `src/components/layout/AppLayout.tsx` — shell: `<Sidebar/>` + `<Header/>` + scrollable `<main><Outlet/></main>` + `<MobileNav/>`; also mounts the global `AddTransactionModal` and restores/persists per-route scroll position in `sessionStorage`.
- `src/components/layout/Sidebar.tsx` — desktop-only (`hidden md:flex`) left nav; owns the nav model: `primaryNavItems` (Dashboard, Portfolio, Transactions), `secondaryNavItems` (flag-gated Performance, Retirement, Budget, Campaigns, Settings), `navItems` (their concat, rendered by the sidebar), `moreNavItem` (`/more`, "More", `Ellipsis`), and the shared route predicates `matchesPath` (exact or sub-path) / `isNavItemActive` (adds `/assets/*` → Portfolio) — all exported for `MobileNav`, `MorePage`, and `Header`. Sidebar links are plain `Link`s with active state from `isNavItemActive` + `aria-current`; footer row renders `<BuildBadge/>`.
- `src/components/common/BuildBadge.tsx` — muted mono `v<version> · <sha7>` stamp; `title` carries full sha + build time.
- `src/lib/constants/build-info.ts` — reads the injected globals and derives `BUILD_COMMIT_SHORT` (7 chars, `"dev"` when empty), `BUILD_LABEL`, `BUILD_TOOLTIP`. The globals are declared in `src/vite-env.d.ts`.
- `src/components/layout/MobileNav.tsx` — fixed bottom nav (`md:hidden`): 4 tabs — `primaryNavItems` + the More tab, rendered as plain `Link`s with active state from the shared `Sidebar` predicates and explicit `aria-current="page"`. More is highlighted on `/more` and on any `secondaryNavItems` path; `/assets/*` highlights the Portfolio tab (asset detail is its drill-down) — same rule as the desktop sidebar.
- `src/pages/MorePage.tsx` — the `/more` hub: standard page `h1` ("More") + `secondaryNavItems` as a bordered, divided list of `Link` rows (icon + label + chevron, `active:bg-accent` press feedback), `max-w-md`.
- `src/components/layout/Header.tsx` — top bar: mobile page title via `titleFor()` (`pageTitles` derived from `navItems` + `moreNavItem`, plus `"/assets"` → "Asset"; exact match first, then longest-prefix for parameterised routes, `APP_NAME` fallback), hide/show-values toggle, `ThemeToggle`, `CurrencyToggle`, `PriceRefreshButton`, `UserMenu`.
- `src/components/layout/UserMenu.tsx` — account dropdown; shows signed-in email; sign-out via `AlertDialog` confirm, then `navigate("/login", { replace: true })`.
- `src/components/common/Disclosure.tsx` — the app's one chevron-and-label collapse: content is always mounted and toggled with `hidden`, so a caller can force it open from a breakpoint up (`contentClassName="sm:block"`) while dropping the trigger (`triggerClassName="sm:hidden"`). Used by `ScenarioPanel` (Assumptions, and the whole panel on a phone) and `TransactionFilters`.
- `src/components/layout/RouteSkeleton.tsx` — neutral "Loading…" placeholder used as the lazy-route Suspense fallback.
- `src/lib/analytics.ts` — `initAnalytics()`: dynamic-imports `posthog-js` (its own chunk, never blocks first paint) and `posthog.init`s it with `defaults: "2025-05-24"`, which turns on history-change pageviews (SPA screen views) and autocapture (clicks/taps) — no per-route or per-button instrumentation anywhere.
- `src/lib/constants/analytics.ts` — `POSTHOG_KEY` (publishable project key, committed by design) + `POSTHOG_HOST` (EU cloud, `eu.i.posthog.com`).
- `src/components/auth/ProtectedRoute.tsx` — auth gate: spinner while `loading`, `<Navigate to="/login" replace/>` when no `user`, else `<Outlet/>`.
- `src/contexts/ThemeContext.tsx` — `ThemeProvider`/`useTheme`; reads `localStorage["theme"]` (falls back to OS `prefers-color-scheme`), toggles `.dark` on `<html>` and sets `colorScheme`.
- `src/components/ui/dialog.tsx` — the dialog primitive is two shapes in one component: below `sm` `DialogPopup` is `fixed inset-0 h-[100dvh] flex flex-col` (a full-height sheet that tracks the keyboard, no centring transform); from `sm` up it is the centred card (`sm:max-h-[90dvh]`). `DialogBody` is the scrolling middle (`min-h-0 flex-1 overflow-y-auto`) and `DialogFooter` is `shrink-0`, one `flex-row` at every width — below `sm` its buttons stretch (`*:flex-1`) to a 40px tap target and it carries `pb-safe-3`. Consumers whose fields live inside a `<form>` give the form `className="contents"` so the body/footer stay direct children of the sheet's flex column (`AssetForm`, `PlatformForm`, `InterestPositionForm`, `ScenarioNameDialog`); `AddTransactionModal`, `MonthlyBudgetTable`'s income editor and `ResolveAssetsStepper` use `DialogBody` directly. `AlertDialog` stays a centred card at every width (short confirmations) but gets 40px footer buttons below `sm`.
- `src/components/ui/` — shadcn/ui inventory present (no `avatar`): `alert-dialog`, `badge`, `button`, `calendar`, `card`, `command`, `dialog`, `dropdown-menu`, `input-group`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`.
- `src/components/{common,prices,transactions}/…` — header controls (`Logo`, `ThemeToggle`, `CurrencyToggle`, `PriceRefreshButton`) and the shared `AddTransactionModal` (owned by their respective components).

## Data layer

None owned here. This component consumes the auth session (`useAuth`) for the gate/account menu and theme state from `localStorage`; all domain data layers belong to Components 2+.

## Notes & gotchas

- **No flash of wrong theme:** the IIFE in `index.html` runs before React mounts — reads `localStorage["theme"]` (or `prefers-color-scheme`), sets `.dark` + `colorScheme` synchronously. `ThemeContext` then keeps the same `localStorage["theme"]` key in sync; they must agree on the key name and the `.dark` class.
- **`Sidebar.tsx` is the single source of truth** for nav (label/path/icon): `primaryNavItems` + `secondaryNavItems` feed the sidebar (concat), `MobileNav` (primary + More tab), `MorePage` (secondary list), and `Header`'s `pageTitles` (derived, no separate map to keep in step). Adding a screen means adding it to one of the two arrays — the mobile bar itself never grows.
- **Don't theme via `next-themes`.** It's installed but only consumed by the toast component (`ui/sonner.tsx`); it is **not** the app theme system. For app theming use `useTheme` from the custom `ThemeContext`.
- **Tailwind 4 has no JS config** — design tokens live in `index.css` (`@theme inline`, sidebar/chart vars). Looking for `tailwind.config.js`/`postcss.config.js` is a dead end; they don't exist.
- **shadcn here is Base-UI-flavored** (`@base-ui/react`), so some primitives use `render={<...>}` slot props (see `Header`/`UserMenu` triggers) rather than `asChild`. `DropdownMenuLabel` must sit inside a `Group`, hence the plain-`div` header in `UserMenu`.
- **Full-screen routes bypass the shell** by being nested directly under `ProtectedRoute` (siblings of `AppLayout`), not under `AppLayout` — that's how `transactions/edit*` gets no sidebar/header.
- **Per-route scroll restore** lives in `AppLayout` (`sessionStorage`, rAF retry up to ~1s because async/lazy content grows height after first paint).
- **Build identity is baked in, not fetched.** `resolveCommitSha()` prefers Vercel's `VERCEL_GIT_COMMIT_SHA` (its checkout is shallow and `git` isn't guaranteed) and only shells out to `git rev-parse HEAD` for local builds; failure yields `""`, which renders as `dev`. Because the sha is a `define` constant, **a stale badge means a stale bundle** — that's the point. The badge only exists in the shell, so full-screen routes (`transactions/edit*`) and mobile widths don't show it.

## Setup / commands

```bash
# Scaffold (react-ts template)
npm create vite@latest portfolio-tracker -- --template react-ts

# Tailwind 4 (Vite plugin; no postcss/tailwind config files)
npm install tailwindcss @tailwindcss/vite tw-animate-css
#   → add tailwindcss() to vite.config.ts plugins
#   → add @import "tailwindcss"; (+ tw-animate-css, fonts) to src/index.css

# shadcn/ui (Base UI build) — init then add components
npx shadcn@latest init      # style base-nova, baseColor neutral, CSS variables, lucide
npx shadcn@latest add alert-dialog badge button calendar card command dialog \
  dropdown-menu input-group input label popover select separator sheet skeleton \
  sonner table tabs textarea toggle toggle-group tooltip

# Routing, fonts, theme, charts, money math
npm install react-router @fontsource-variable/geist next-themes recharts bignumber.js

# Local Supabase (Docker required)
npx supabase init
npx supabase start          # prints local API URL + anon key for .env.local
```

- `@` path alias is declared in both `vite.config.ts` (`resolve.alias`) and `tsconfig*.json` (`paths`); keep them in sync.
- Scripts (`package.json`): `dev` (vite), `build` (`tsc -b && vite build`), `typecheck`, `lint`, `preview`, `deploy`.
