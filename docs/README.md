# Docs

Documentation for the Portfolio Tracker app. Start here.

## Product

- **[PRD.md](PRD.md)** — product requirements: problem, goals, data model, P&L
  engine, pages, price sources, and the MVP scope/feature matrix (§16).

## Component docs (the build, by component)

- **[components/](components/)** — per-component documentation in two layers plus a
  shared glossary. See [components/README.md](components/README.md) for the index
  and how the layers fit together:
  - **[components/GLOSSARY.md](components/GLOSSARY.md)** — shared domain model:
    entities, terms, canonical formulas (defined once).
  - **Behavioral specs** (`components/NN-name.md`) — the tech-agnostic rebuild
    contract: what any implementation must do.
  - **Technical docs** (`components/technical/NN-name.md`) — how the current
    React/Vite/Supabase build does it.

## Reference

- **[pnl-methodology.md](pnl-methodology.md)** — the canonical P&L definition
  (money-weighted, USD-anchored) and the rationale behind it. The glossary and
  Component 6 link here for the deep "why."

## Forward-looking plans (design intent, not yet built)

- **[budget-feature-plan.md](budget-feature-plan.md)** — the future budget feature.
- **[pnl-engine-scaling-upgrade-path.md](pnl-engine-scaling-upgrade-path.md)** —
  how the P&L engine would scale beyond the current client-side approach.
- **[quote-currency-and-price-fetch-plan.md](quote-currency-and-price-fetch-plan.md)**
  — planned quote-currency / price-fetch work.

## Process records (point-in-time; not maintained)

- **[denomination-rollback-handoff.md](denomination-rollback-handoff.md)** — a
  historical handoff note.
- **[superpowers/specs/](superpowers/specs/)** — dated design specs (one per
  feature, frozen at the time it was designed).
- **[superpowers/plans/](superpowers/plans/)** — dated implementation plans paired
  with those specs.

> Forward-looking and process records are **snapshots of a moment**, not living
> docs — they intentionally reflect what was true when written. For current state,
> use the component docs, the PRD, and `pnl-methodology.md`.
