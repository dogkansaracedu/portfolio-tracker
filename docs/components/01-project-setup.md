# Component 1: Project Setup

## Overview
Bootstrap the development environment with Vite + React + TypeScript + Tailwind CSS + shadcn/ui. Set up React Router v7 for page routing, configure local Supabase via CLI/Docker, create the app layout shell (sidebar/navbar, content area), and establish the folder structure and dev tooling conventions.

## Dependencies
None. This is the foundation.

## File Structure
```
portfolio-tracker/
├── .env.local                          # Supabase local URL + anon key
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── components.json                     # shadcn/ui config
├── supabase/
│   ├── config.toml                     # Supabase local config
│   └── .gitignore
├── public/
│   ├── favicon.ico
│   ├── manifest.json                   # PWA manifest (basic)
│   └── icons/                          # App icons (192, 512)
├── src/
│   ├── main.tsx                        # Entry point, wraps with providers
│   ├── App.tsx                         # Router setup
│   ├── index.css                       # Tailwind directives + globals
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── ui/                         # shadcn/ui components (auto-generated)
│   │   └── layout/
│   │       ├── AppLayout.tsx           # Main layout shell
│   │       ├── Sidebar.tsx             # Desktop sidebar nav
│   │       ├── MobileNav.tsx           # Bottom nav for mobile
│   │       └── Header.tsx              # Top bar (page title, currency toggle)
│   ├── pages/
│   │   ├── DashboardPage.tsx           # Placeholder
│   │   ├── PortfolioPage.tsx           # Placeholder
│   │   ├── TransactionsPage.tsx        # Placeholder
│   │   ├── PerformancePage.tsx         # Placeholder
│   │   ├── SettingsPage.tsx            # Placeholder
│   │   ├── LoginPage.tsx               # Placeholder
│   │   └── SignupPage.tsx              # Placeholder
│   ├── lib/
│   │   ├── supabase.ts                 # Supabase client init
│   │   └── utils.ts                    # cn() helper from shadcn/ui
│   ├── hooks/                          # Custom hooks (empty for now)
│   ├── contexts/                       # React Context providers (empty for now)
│   └── types/                          # TypeScript types (empty for now)
│       └── index.ts
```

## Tasks
1. Initialize Vite project: `npm create vite@latest . -- --template react-ts`
2. Install and configure Tailwind CSS: `npm install -D tailwindcss @tailwindcss/vite`, add to `vite.config.ts`, add `@import "tailwindcss"` to `index.css`
3. Initialize shadcn/ui: `npx shadcn@latest init` (New York style, Zinc base color, CSS variables)
4. Add initial shadcn/ui components: `npx shadcn@latest add button card separator sheet tabs avatar badge dropdown-menu tooltip`
5. Install React Router: `npm install react-router`, configure routes in `App.tsx`
6. Install Supabase client: `npm install @supabase/supabase-js`
7. Initialize local Supabase: `npx supabase init` then `npx supabase start`
8. Create Supabase client file: `src/lib/supabase.ts` reads from `.env.local`
9. Create `.env.local` with local Supabase URL and anon key (from `supabase start` output)
10. Build layout shell: `AppLayout.tsx` with sidebar on desktop, bottom tab bar on mobile. Use shadcn `Sheet` for mobile sidebar overlay
11. Set up routing: `/login`, `/signup` (public), `/` with child routes for dashboard, portfolio, transactions, performance, settings
12. Create placeholder pages: each exports a simple component with the page title
13. Install Recharts: `npm install recharts`
14. PWA basics: minimal `manifest.json` in `public/`
15. Configure path aliases: `@/` as alias for `src/` in tsconfig + vite config

## UI Components
- **shadcn/ui**: Button, Card, Separator, Sheet (mobile nav), Tabs, Avatar, Badge, DropdownMenu, Tooltip
- **Custom**: AppLayout, Sidebar, MobileNav, Header

## Key Decisions
- **Folder structure**: Flat (pages/, components/, hooks/, contexts/, lib/, types/). No feature-folder nesting for MVP.
- **shadcn/ui style**: New York variant, Zinc color palette.
- **CSS variables**: Yes (enables dark mode later).
- **React Router**: `createBrowserRouter` with layout route for the app shell.
- **Pure SPA**: No SSR/SSG. Vite dev server for development, static build for production.
- **Path alias `@/`**: Standard shadcn/ui convention for clean imports.

## Acceptance Criteria
- [ ] `npm run dev` starts the app at localhost:5173 with no errors
- [ ] `npx supabase start` runs local Supabase (Postgres, Auth, Studio)
- [ ] Navigating between all pages shows placeholder content within layout shell
- [ ] Sidebar nav works on desktop, bottom tab bar shows on mobile (< 640px)
- [ ] Tailwind classes render correctly, shadcn Button renders with correct styling
- [ ] `.env.local` has valid local Supabase credentials and is in `.gitignore`
