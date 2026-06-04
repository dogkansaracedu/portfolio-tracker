# Component 1: Project Setup — Technical (this build)

> Layer: React/Vite/Supabase implementation. Contract → [../01-project-setup.md](../01-project-setup.md)

## Stack

- **Build:** Vite 8 (`vite` dev server, `tsc -b && vite build` for prod).
- **UI:** React 19 + React DOM 19.
- **Language:** TypeScript 5.9, strict, bundler module resolution, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- **Styling:** Tailwind 4 via the `@tailwindcss/vite` plugin — **no `postcss.config.js`, no `tailwind.config.js`** (Tailwind 4 is configured in CSS, not JS). `tw-animate-css` for animations.
- **Components:** shadcn/ui, built on **Base UI** (`@base-ui/react`) primitives in this build. Config in `components.json`: `style: "base-nova"`, `baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, `rsc: false`. (Note: this is **not** the New York / Zinc combo some older docs mention — trust `components.json`.)
- **Icons:** `lucide-react`.
- **Routing:** React Router 7 (`react-router`), `<BrowserRouter>` + `<Routes>` (component-based, not `createBrowserRouter`).
- **Theme:** custom `ThemeContext` + a blocking inline script in `index.html` (see Notes). `next-themes` is installed but **not** the active theme mechanism.
- **Fonts:** `@fontsource-variable/geist` (Geist Variable, imported in `index.css` and wired as `--font-sans`).
- **Toasts:** `sonner`. **Command palette primitive:** `cmdk`. **Dates:** `date-fns` + `react-day-picker`.
- **Backend (local):** Supabase via CLI/Docker (`supabase/config.toml`, project_id `portfolio-tracker`; API 54321, DB 54322, Studio 54323). Auth `minimum_password_length = 10`, email confirmations off locally, `site_url = http://127.0.0.1:5173`.

## File map

- `index.html` — HTML entry; mounts `#root`, loads `/src/main.tsx`; contains the pre-paint theme script and PWA/`theme-color` meta + manifest link.
- `vite.config.ts` — Vite config: `react()` + `tailwindcss()` plugins; `@` alias → `./src`.
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` — project-references TS config; `@/*` path alias declared in both root and app configs.
- `components.json` — shadcn/ui config (style/baseColor/aliases/registries).
- `src/main.tsx` — React entry; `createRoot` under `<StrictMode>`; wraps `<App/>` in the provider stack (`ThemeProvider` → `TooltipProvider` → `DisplayProvider` → `AuthProvider` → `AssetsProvider` → `PlatformsProvider` → `PricesProvider` → `TransactionDataProvider` → `TransactionProvider` → `HoldingsProvider` → `SnapshotsProvider`) and renders `<Toaster/>`.
- `src/App.tsx` — router: public `/login`, `/signup`; everything else under `<ProtectedRoute>`. Full-screen authenticated routes `transactions/edit` and `transactions/edit/:assetId` render outside the shell; the rest nest under `<AppLayout>` (index = Dashboard; `portfolio`, `transactions`, `performance`, `settings`). Non-critical pages are `lazy()` + `<Suspense fallback={<RouteSkeleton/>}>` (via the local `Lazy` wrapper).
- `src/index.css` — Tailwind 4 entry: `@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css`, Geist font; `@custom-variant dark`, `@theme inline` design tokens, sidebar/chart CSS variables.
- `src/components/layout/AppLayout.tsx` — shell: `<Sidebar/>` + `<Header/>` + scrollable `<main><Outlet/></main>` + `<MobileNav/>`; also mounts the global `AddTransactionModal` and restores/persists per-route scroll position in `sessionStorage`.
- `src/components/layout/Sidebar.tsx` — desktop-only (`hidden md:flex`) left nav; exports the shared `navItems` array (5 routes + lucide icons) reused by `MobileNav`.
- `src/components/layout/MobileNav.tsx` — fixed bottom nav (`md:hidden`); consumes `navItems` from `Sidebar`.
- `src/components/layout/Header.tsx` — top bar: mobile page title (from a `pageTitles` map), hide/show-values toggle, `ThemeToggle`, `CurrencyToggle`, `PriceRefreshButton`, `UserMenu`.
- `src/components/layout/UserMenu.tsx` — account dropdown; shows signed-in email; sign-out via `AlertDialog` confirm, then `navigate("/login", { replace: true })`.
- `src/components/layout/RouteSkeleton.tsx` — neutral "Loading…" placeholder used as the lazy-route Suspense fallback.
- `src/components/auth/ProtectedRoute.tsx` — auth gate: spinner while `loading`, `<Navigate to="/login" replace/>` when no `user`, else `<Outlet/>`.
- `src/contexts/ThemeContext.tsx` — `ThemeProvider`/`useTheme`; reads `localStorage["theme"]` (falls back to OS `prefers-color-scheme`), toggles `.dark` on `<html>` and sets `colorScheme`.
- `src/components/ui/` — shadcn/ui inventory present (no `avatar`): `alert-dialog`, `badge`, `button`, `calendar`, `card`, `command`, `dialog`, `dropdown-menu`, `input-group`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`.
- `src/components/{common,prices,transactions}/…` — header controls (`Logo`, `ThemeToggle`, `CurrencyToggle`, `PriceRefreshButton`) and the shared `AddTransactionModal` (owned by their respective components).

## Data layer

None owned here. This component consumes the auth session (`useAuth`) for the gate/account menu and theme state from `localStorage`; all domain data layers belong to Components 2+.

## Notes & gotchas

- **No flash of wrong theme:** the IIFE in `index.html` runs before React mounts — reads `localStorage["theme"]` (or `prefers-color-scheme`), sets `.dark` + `colorScheme` synchronously. `ThemeContext` then keeps the same `localStorage["theme"]` key in sync; they must agree on the key name and the `.dark` class.
- **`navItems` is the single source of truth** for nav (label/path/icon) and is shared by `Sidebar` and `MobileNav` — edit it once. `Header`'s `pageTitles` map is separate and must be kept in step with the routes.
- **Don't theme via `next-themes`.** It's installed but only consumed by the toast component (`ui/sonner.tsx`); it is **not** the app theme system. For app theming use `useTheme` from the custom `ThemeContext`.
- **Tailwind 4 has no JS config** — design tokens live in `index.css` (`@theme inline`, sidebar/chart vars). Looking for `tailwind.config.js`/`postcss.config.js` is a dead end; they don't exist.
- **shadcn here is Base-UI-flavored** (`@base-ui/react`), so some primitives use `render={<...>}` slot props (see `Header`/`UserMenu` triggers) rather than `asChild`. `DropdownMenuLabel` must sit inside a `Group`, hence the plain-`div` header in `UserMenu`.
- **Full-screen routes bypass the shell** by being nested directly under `ProtectedRoute` (siblings of `AppLayout`), not under `AppLayout` — that's how `transactions/edit*` gets no sidebar/header.
- **Per-route scroll restore** lives in `AppLayout` (`sessionStorage`, rAF retry up to ~1s because async/lazy content grows height after first paint).

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
