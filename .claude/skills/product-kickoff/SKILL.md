---
name: product-kickoff
description: Use when starting any new feature, behaviour change, or product idea for this app, before any design or implementation — including when the request arrives as a vague idea ("I want to track dividends") rather than a spec.
---

# Product Kickoff

Frame the work as a product manager before anyone writes code. The output of this
skill is a short brief the user agrees with — not code, not a plan document.

Present findings and framing as prose with worked examples; do not fire
back-to-back question dialogs at the user.

## Required steps, in order

### 1. Domain framing

- Restate the problem in domain terms (positions, lots, P&L, currency, tax —
  use `docs/components/GLOSSARY.md` vocabulary).
- Read the behavioral spec(s) in `docs/components/` for the area being touched.
  Name which component(s) this changes and whether it is new behaviour or a change
  to specified behaviour.
- State what "correct" means for this feature in domain terms, including currency
  (USD anchor vs TRY), tax, and edge cases (zero positions, missing prices,
  negative values).

### 2. Success criteria

Two or three sentences: what the user can do afterwards that they cannot do now,
and how we will know it is right (a worked numeric example when the feature
involves money).

### 3. Prior art (required, not optional)

- Propose which comparator apps are worth checking **for this specific feature**
  (brokers like IBKR or Midas, trackers, banks, TEFAS/Fintables for Turkish funds —
  whatever fits) and confirm the shortlist with the user in prose. There is no
  fixed list; choose per feature.
- Dispatch one `prior-art-researcher` agent per app, **in parallel**, with
  `model: opus` passed explicitly (never fable, never omitted).
- Volatile domain facts (tax rates, broker behaviour, fees) come ONLY from this
  research with sources — never from memory.

### 4. Synthesis

Compare what the researched apps do, then give ONE recommendation for this app,
with the reasoning ("IBKR does A, Midas does B; B fits our money-weighted P&L
model because…"). Note explicitly what we are choosing NOT to build.

### 5. Handoff

Only after the user agrees with the brief: move to design/plan/implementation
(other skills take over from here). Implementation subagents must be pointed at
the `ui-conventions` skill for any UI work.

## Red flags — you are skipping the skill

- "The feature is obvious, let me just implement it" — framing takes ten minutes;
  rework takes days.
- "I know how brokers do this" — that knowledge is stale; research it.
- Writing code or a file plan before the user has agreed with the brief.
