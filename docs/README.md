# Docs

Documentation for the Portfolio Tracker app. `docs/components/` is the source of
truth for how the app behaves — read the relevant doc before changing an area,
and update it in the same change (see the working rule in `CLAUDE.md`).

## Component docs

- **[components/](components/)** — per-component documentation in two layers plus
  a shared glossary. See [components/README.md](components/README.md) for the
  index:
  - **[components/GLOSSARY.md](components/GLOSSARY.md)** — shared domain model:
    entities, terms, canonical formulas (defined once).
  - **Behavioral specs** (`components/NN-name.md`) — the stack-free rebuild
    contract: what any implementation must do.
  - **Technical docs** (`components/technical/NN-name.md`) — how the current
    React/Vite/Supabase build does it.

## P&L reference

- **[pnl-methodology.md](pnl-methodology.md)** — the canonical P&L definition
  (money-weighted, USD-anchored), the return-metric choices, and known issues.
- **[pnl-test-cases.md](pnl-test-cases.md)** — worked numeric cases that pin the
  engine's behaviour, run as Vitest (`npm test`).
