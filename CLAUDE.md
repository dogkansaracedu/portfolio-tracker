# CLAUDE.md

## Code and docs stay in sync

`docs/components/` is the source of truth for how this app behaves. **Before starting
any task, read the relevant component doc(s); before committing, update them to match
the code you changed.** A change that alters behaviour without the matching doc edit is
incomplete — no silent drift between code and docs.

### How the docs are organized
- `docs/components/NN-name.md` — **behavioral spec**: what the component does, in plain
  terms. Stack-free (no function/file names) — it must hold even if the app were
  rebuilt on a different stack.
- `docs/components/technical/NN-name.md` — **technical doc**: the implementation
  (files, functions, data flow). Paired 1:1 with its behavioral spec.
- `docs/components/GLOSSARY.md` — shared domain terms + canonical formulas. Define a
  term once here and link to it.

### Working rule
1. **Before a task** — read the behavioral + technical doc for the area you're touching.
2. **While implementing** — if behaviour or implementation changes, edit the matching
   doc layer in the same change (behavioral edits stay stack-free; technical edits name
   the code).
3. **Before committing** — re-read the touched docs and confirm they describe the code
   as shipped.

### P&L specifics
The P&L engine is the pure function `computePortfolioPnL` (`src/lib/pnl/portfolio.ts`);
`usePnL` is a thin wrapper. Worked numeric behaviour lives in `docs/pnl-test-cases.md`
and runs as Vitest (`npm test`) — update those cases when P&L behaviour changes.
