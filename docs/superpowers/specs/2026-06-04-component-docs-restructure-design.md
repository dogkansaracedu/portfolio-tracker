# Component docs restructure — tech-agnostic rebuild contract — Design

**Date:** 2026-06-04
**Status:** Proposed — awaiting spec review before planning.

## Goal

Restructure `docs/components/` so it does two things at once:

1. **Aligns with the current state of the app.** The component docs were last
   broadly touched 2026-04 → 2026-05 and have drifted: the Total/Daily return
   toggle, the money-weighted P&L propagation, and the entire transactions
   import subsystem (CSV + Midas PDF) are not reflected.
2. **Becomes a stack-agnostic rebuild contract.** Today the docs are effectively
   build playbooks tied to React/Vite/Supabase/shadcn (`npm` commands, `.tsx`
   filenames, shadcn component names). We want the *behavioral* description
   separated from the *this-build implementation*, so the app could be
   regenerated on a different stack (different frontend framework, different
   backend/DB/auth) purely from the behavioral layer.

**Target reader:** someone — a person or an AI agent — recreating this app on a
new stack. The behavioral layer is the contract they must satisfy; the technical
layer shows how the current build satisfies it.

## Approach: hybrid two-layer + one shared glossary

Each component is described by a **pair** of docs that cross-reference each
other (mirroring the superpowers specs↔plans relationship), plus a **single
shared glossary** for cross-cutting domain concepts so they are defined once.

- **Behavioral spec** (`docs/components/NN-name.md`) — tech-agnostic. The rebuild
  contract. Stays at the canonical path so existing inbound links survive.
- **Technical doc** (`docs/components/technical/NN-name.md`) — how the current
  React/Vite/Supabase/shadcn build implements that contract.
- **`docs/components/GLOSSARY.md`** — shared domain model, terms, and canonical
  formulas, defined **once** and referenced by every spec. One file for now (the
  app is small); split into `DOMAIN.md` + `GLOSSARY.md` later only if it grows.

Rejected alternatives: per-component **single layered file** (mixes the agnostic
contract and stack detail in one file — weaker separation) and a **monolithic
`IMPLEMENTATION.md`** (one giant file edited from many directions — a drift
magnet, breaks the 1:1 spec↔technical pairing and the per-component locality that
mirrors the code).

### The agnostic ↔ technical boundary (the core convention)

- **Behavioral layer** = *what any implementation must do*: behaviors, rules,
  formulas, data contracts, UI contracts, acceptance criteria.
- **Technical layer** = *how this build does it*: libraries, file paths, hooks,
  Supabase tables/migrations/edge functions, scaffolding commands, gotchas.
- **Genuinely code-bound behavior stays in the behavioral layer**, with worked
  examples — exactly as `pnl-methodology.md` already does for the money-weighted
  formula. Only the *stack mechanics* (which library, which file, which shadcn
  component) move to the technical layer. The test for a line: *"would a Vue +
  Firebase rebuild still need to know this?"* If yes → behavioral. If it's only
  true because we chose React/Supabase → technical.

## Layout

```
docs/
  README.md                  NEW — index/map for the whole docs/ folder
  PRD.md                     MOVED here from repo root (links updated)
  pnl-methodology.md         (unchanged; glossary links to it)
  components/
    README.md                index table · dependency graph · "how to read these docs"
    GLOSSARY.md              NEW — shared domain model + terms + canonical formulas
    01-project-setup.md            ┐  BEHAVIORAL specs (tech-agnostic)
    02-database-schema-auth.md     │  each links → technical/NN + into GLOSSARY
    …                              │
    11-settings-data-portability.md┘
    technical/
      01-project-setup.md          ┐  THIS-BUILD implementation
      …                            │  each links → ../NN behavioral spec
      11-settings-data-portability.md┘
```

## `GLOSSARY.md` outline (one file, three sections)

- **Entities** (the nouns, conceptually — fields named, no SQL):
  - **Platform** — where assets are held (broker/exchange/bank/physical); display color.
  - **Asset** — global per ticker per user; `category` (free-form: fiat/crypto/gold/
    stock_us/stock_bist/vehicle/…), `tags[]`, `price_source` (tcmb/coingecko/yahoo/
    manual), `price_id`.
  - **Holding** — balance per (asset, platform), in the asset's native units.
  - **Transaction** — an event; types: buy/sell/transfer_in/transfer_out/dividend/
    interest/fee/cash_credit/cash_debit; `linked_tx_id` pairs cash legs and transfer
    legs. **Price currency derives from the asset (asset-native), editable-but-
    defaulted, never a free picker.**
  - **Snapshot** — frozen point-in-time `total_usd` + `by_asset` breakdown (per ticker
    and per ticker×platform) with `value_usd` & `price_usd`.
  - **Price** — current/cached unit price in the asset's quote currency.
  - **Exchange rate** — historical FX (usd_try, eur_try) by date; USD is the anchor.
  - (+ a short relationships note / mini-diagram)
- **Terms** — USD anchor · net invested capital · money-weighted · FIFO lot / cost
  basis · realized vs unrealized · fiat FX P&L · daily return · allocation % ·
  snapshot-price/live-quantity rule · staleness.
- **Canonical formulas** — `Total P&L = current value − net invested capital` (USD);
  `daily return = value_now − prev_snapshot_value − period_invested`. **Links to
  `pnl-methodology.md`** for rationale; does not restate it.

Component specs *reference* these; they never redefine them.

## Behavioral spec template

```
# Component N: <Name> — Behavioral Spec
> Layer: behavioral (tech-agnostic). Implementation → technical/NN-name.md
## Purpose            — what & why, one paragraph
## Depends on         — other components (behavioral)
## Concepts used      — links into GLOSSARY (not redefined here)
## Behaviors / rules  — what it must do; worked examples for any formula-bound logic
## Contract (I/O)     — consumes / exposes; data shapes conceptual (field names ok, no TS)
## UI contract        — what the user sees & can do; states (loading/empty/error);
                        responsive intent (NOT shadcn/Tailwind specifics)
## Acceptance         — tech-neutral checks a rebuild on ANY stack must pass
```

## Technical doc template

```
# Component N: <Name> — Technical (this build)
> Layer: React/Vite/Supabase implementation. Contract → ../NN-name.md
## Stack              — libraries actually used for this component
## File map           — real paths (pages/components/hooks/lib/queries) + one-line roles
## Data layer         — Supabase tables/migrations, edge functions, RLS notes
## Notes & gotchas    — the non-obvious (snapshot-priced/live-qty, BigNumber boundaries,
                        divide-by-zero guards, context-provider data sharing, …)
## Setup / commands   — npm / shadcn / supabase scaffolding where relevant
```

## README roles

- **`docs/components/README.md`** — index table (component → spec → technical →
  status), the dependency graph (kept), a short "how to read these docs"
  (glossary → behavioral → technical), and a *high-level* stack summary (detailed
  stack moves into the per-component technical docs).
- **`docs/README.md`** (new) — top-level map of the `docs/` folder: PRD, the
  component docs, glossary, methodology, and the superpowers specs/plans.
- **Root `README.md`** — stays at repo root (GitHub landing page). Aligned for
  stale content (e.g. the "Known gaps: CSV import/export" line — CSV + Midas PDF
  *import* has landed; export still missing). Its `PRD.md` link is repointed to
  `docs/PRD.md`.

## Scope

**Edit / create:**
- `docs/components/**` — restructure into the two layers + GLOSSARY + README, and
  align every doc with the current code.
- `docs/README.md` — new docs-folder index.
- `docs/PRD.md` — moved from repo root; feature matrix aligned with current state.
- Root `README.md` — fix stale content; repoint the PRD link.
- `pnl-methodology.md` — verify only (already current as of 2026-06-03).
- Fix inbound links broken by the PRD move (root README `./PRD.md` and `#16`
  anchor; any others found via grep).

**Leave as-is** (rewriting these destroys their value):
- Forward-looking plans: `budget-feature-plan.md`,
  `pnl-engine-scaling-upgrade-path.md`, `quote-currency-and-price-fetch-plan.md`.
- Point-in-time records: `denomination-rollback-handoff.md`,
  `superpowers/specs/**`, `superpowers/plans/**`.

## How alignment happens (execution outline)

The "align with current state" half is not guesswork. Per component:

1. **Drift audit (parallel, one agent per component):** compare the existing doc
   against the live code (components/, hooks/, lib/, queries/, supabase/) and
   produce a structured drift report — what exists, what's stale, what's missing,
   what was deferred and never built.
2. **Write GLOSSARY.md** from the union of entities/terms surfaced by the audits.
3. **Write each component's spec + technical doc** from its drift report
   (parallel — disjoint files).
4. **Write `docs/components/README.md`** index + `docs/README.md`.
5. **Move PRD → `docs/PRD.md`**, align it, fix inbound links; align root README.

### Component inventory + known drift highlights (illustrative, not exhaustive — the audit is authoritative)

| # | Component | Known drift to capture |
|---|-----------|------------------------|
| 1 | Project Setup | Tailwind 4 via `@tailwindcss/vite` (no postcss/tailwind config files); placeholder pages now real; theming (next-themes) |
| 2 | DB Schema & Auth | signup allowlist trigger; seed function (8 platforms + 16 assets) |
| 3 | Platform & Asset Mgmt | `price_id`, `price_source`, asset logos/icons, asset-native currency |
| 4 | Transaction System | sheet import subsystem (CSV + Midas PDF), linked cash/transfer legs, asset-native currency, per-row realized P&L |
| 5 | Price Engine | demand-driven presence-gated refresh (not cron); `price_id` keying; Yahoo = only free BIST source (~15min delay) |
| 6 | P&L Engine | money-weighted total (done 2026-06-03); `daily.ts` daily-return formula; `realized.ts` split |
| 7 | Dashboard | 2Y range; money-weighted hero period P&L; percentages stay visible when values hidden |
| 8 | Portfolio Page | **Total/Daily return toggle**; snapshot-price/live-quantity rule; AssetDetailSheet was deferred, never built |
| 9 | Transactions Page | realized P&L display; edit page; import entry points |
| 10 | Snapshots & Performance | snapshot density (daily 30d / weekly older); backfill edge fn + cron; drawdown / monthly-returns / category-attribution charts; benchmark |
| 11 | Settings & Data Portability | pg_cron exists; CSV+PDF import exists (export still missing); snapshot backfill card |

## Risks / notes

- **PRD move breaks links.** Mitigation: grep for `PRD.md` references before/after
  the move and fix each (known: root README link + `#16` anchor).
- **Behavioral/technical boundary judgment.** The "would a Vue+Firebase rebuild
  need this?" test keeps it consistent; `pnl-methodology.md` is the reference for
  how much code-bound math is acceptable in the behavioral layer.
- **Two files per component to keep in sync going forward.** Accepted: locality
  (they sit adjacent) plus the README status table make drift visible; this is the
  cost of a clean separation, and it's the same discipline superpowers specs/plans
  already use.

## Verification

- Every component has a behavioral spec + a technical doc that link to each other,
  and every spec links into GLOSSARY for the terms it uses.
- No domain term/entity/formula is defined in more than one place (glossary is the
  single source; specs reference it; `pnl-methodology.md` owns the P&L rationale).
- Each behavioral spec is free of stack specifics (no `npm`/shadcn/`.tsx`/Supabase
  names) except genuinely code-bound formulas with worked examples.
- Each doc matches the current code (the audit's drift items are all resolved).
- `docs/PRD.md` exists, root `README.md` and all inbound links point to it, and no
  dangling `PRD.md` references remain.
- The forward-looking and point-in-time docs are untouched.
