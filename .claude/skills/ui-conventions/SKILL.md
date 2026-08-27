---
name: ui-conventions
description: Use when creating or modifying any UI in this app — components, pages, layout, styling, charts, tables, dialogs — before writing the first line of JSX.
---

# UI Conventions

This app's UI standard is dense, minimal, broker-grade (IBKR/Midas class). The two
historical failure modes to prevent: generating MORE UI than was asked for, and
shipping UI that breaks on a phone.

## Generation rules

1. **Build only what was asked.** No speculative sections, props, empty states,
   filters, settings, or "nice to have" affordances. If you believe something extra
   is genuinely needed, name it in one line and let the user decide — do not build
   it on spec.
2. **Reuse before creating.** Check `src/components/ui/` (shadcn primitives) and
   shared helpers first — money/percent formatting and gain/loss colouring go
   through `gainLossClass`, `formatSignedCurrency`, `formatSignedPercent` in
   `src/lib/prices`. A second convention for something that already has one is a
   bug.
3. **Match the neighbours.** Before designing a new view, read the closest existing
   page and match its density, spacing scale, heading levels, and wording. One
   convention app-wide.
4. **No hardcoded strings.** URLs, type literals, currency codes, labels →
   constants.
5. **Money math** is bignumber.js, never floats — even inside display components.

## Mobile — required completion block

Design mobile-first: wide tables get their own `overflow-x-auto` container (the
page body never scrolls horizontally), grids collapse, tap targets stay comfortably
tappable, meaningful numbers never truncate on a phone screen.

Your completion report MUST end with this block, filled in — it is a required slot,
not a reminder:

```
Mobile: <what wraps / scrolls / collapses on each changed view>
Reused: <existing components/helpers used>
Not built: <things deliberately left out, or "nothing was descoped">
Verified: npm run build → <result>
```

A report without this block is an incomplete task. "Mobile: probably fine" is not
an acceptable value — describe the actual layout behaviour.

## Verification

`npm run build` (not just typecheck) before declaring done. After the change lands,
the `ux-reviewer` agent reviews it — write as if that reviewer will screenshot your
work on a phone viewport, because it will.
