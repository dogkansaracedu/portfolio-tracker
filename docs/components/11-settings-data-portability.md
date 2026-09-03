# Component 11: Settings & Data Portability — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/11-settings-data-portability.md](technical/11-settings-data-portability.md)

## Purpose

The owner-facing control panel. It hosts the management surfaces for platforms
and assets (owned by Component 3) as tabs, owns **data portability** (a pointer
to where data comes in, plus a control to (re)build historical
[snapshots](GLOSSARY.md#snapshot)), and documents the app's **display
preferences** — which are *operated* from the global header, not from this page,
because they change how every screen reads and must be reachable from all of
them.

## Depends on

- **Component 3 (Platform & Asset Management)** — the platform/asset editing
  tabs live here; this component only mounts them.
- **Component 4 (Transaction System)** — owns the **import** experience (grid /
  CSV / broker PDF). This component links to it; it does not reimplement it.
- **Component 10 (Snapshots & Performance)** — owns snapshot creation; this
  component exposes a manual **backfill** trigger and reports its result.

## Concepts used — links into GLOSSARY

- [Snapshot](GLOSSARY.md#snapshot) — what the backfill control creates/rewrites.
- [USD anchor](GLOSSARY.md#usd-anchor) — the display-currency choice is USD vs
  TRY; USD is the anchor all P&L is measured against.

## Behaviors / rules

**Display preferences — operated from the global header (persisted per browser,
survive reload).** They live in the app chrome, not on this page: each one
re-renders every screen, so it must be adjustable while looking at the screen it
affects. This component only defines their behaviour.

- **Display currency** — toggle between **USD** and **TRY**. Changing it
  re-denominates every money amount across the whole app immediately; it is a
  presentation choice only and does **not** change the [USD anchor](GLOSSARY.md#usd-anchor)
  used for P&L math.
- **Theme** — light / dark. Initial value follows the OS preference until the
  owner picks one; once picked, the explicit choice persists and wins on reload.
- **Value privacy (obfuscation)** — a toggle that masks all monetary figures
  (for screen-sharing / screenshots) without changing any data. Persists per browser.
  **Percentages stay visible** (they reveal shape, not size), and so do public
  market quotes — a per-unit price is not one of the owner's amounts.
  - **On charts** the rule reaches the axes, not just the readouts: a money axis
    keeps its scale and **drops its tick labels** while amounts are hidden, so
    the plotted shape survives but the ruler beside it does not. A masked label
    per tick was rejected on both counts — a series drawn to scale beside a
    labelled axis is the hidden figures readable off that ruler, and a column of
    identical mask glyphs reads as chart noise while holding a gutter open (up
    to 56px of a 390px phone chart) to say nothing. Percent axes keep their
    labels. Chart tooltips mask like any other readout.
  - **Editable fields are the exception, by construction:** a text input shows
    the raw amount it edits and cannot mask. A confirmation that names a figure
    already visible in such a field therefore names it in the clear too —
    masking it would buy no privacy and cost the confirmation its identifier.

**Data portability:**

- **Import — available.** Bringing data in (manual grid entry, CSV upload,
  broker-statement PDF) is fully built and lives in **Component 4**. Settings
  links to it rather than duplicating it.
- **Export — NOT yet built.** There is currently **no** way to export the
  portfolio (no JSON/CSV download). This is a known gap, explicitly out of scope
  here until implemented. Do not document export behaviors as if they exist.

**Snapshot backfill control:**

- The owner can trigger a (re)build of historical [snapshots](GLOSSARY.md#snapshot)
  from Settings. This is for first-time setup and for repairing history after
  back-dated transactions are added.
- **Granularity** is selectable: either (a) a sparse-but-cheap schedule —
  roughly weekly walking back from the earliest transaction **plus** one per day
  for the recent window — or (b) one snapshot per transaction date.
- **Overwrite** is selectable: when on, existing snapshots on the targeted dates
  are deleted and rewritten; when off, existing dates are reconciled in place
  (totals/breakdown updated, the date itself not duplicated).
- The trigger is **long-running** (tens of seconds) and uses historical prices;
  the owner must enter any missing transactions **first** for the rebuild to be
  correct. It is **destructive only when overwrite is on**.
- On completion the control reports a result: how many dates were targeted, how
  many snapshots were written, what was priced, and any warnings/failures.

## Contract (I/O)

**Inputs**

- Preference changes: display currency, theme, value-privacy — each a user toggle.
- Backfill request: `{ granularity, overwrite }`.

**Outputs / effects**

- Preferences are written to durable per-browser storage and applied app-wide on
  every load (no flash of the wrong theme).
- Backfill returns a structured summary: `{ targetDateCount, snapshotsWritten,
  tickersPriced[], warnings[] }` (and the underlying dates/sample). Warnings
  (e.g. a price source missing a ticker on a date) are surfaced, not swallowed —
  a run can succeed with partial warnings.

**Invariants**

- Display currency and value-privacy are presentation-only: switching them never
  mutates stored money/quantity values or the anchor.
- Backfill is the **only** action here that writes data; everything else on this
  page (preferences) is local to the browser.

## UI contract

- **Preferences** — the display-currency (USD/TRY), theme (light/dark) and
  value-privacy controls live in the app's **global header only**. The Settings
  page does not duplicate them.
- **Import** — surfaced via **Component 4** (grid / CSV / broker PDF). Settings
  carries a single muted line under a small heading linking to it — a pointer,
  not a card, and never a second import UI.
- **Asset and platform catalogs on a narrow screen** — the catalog's columns
  (ticker, category, price, group, status, actions) do not fit a phone: there
  the list uses the app's card idiom instead, each asset one card with its
  actions menu in the card header, so the menu is never the thing that falls
  off the side.
- **Export status** — **not built**; show nothing actionable, or an explicit
  "not available yet" affordance. Never imply a download exists.
- **Snapshot backfill control** — granularity selector, an overwrite toggle with
  a clear warning about deletion, a run button with a busy state, and a result
  panel (targets / written / priced / warnings) after a run.

## Acceptance

- [ ] Changing display currency re-denominates amounts **app-wide** instantly
      (and does not alter the USD anchor or any stored value).
- [ ] The theme choice **persists across reloads** and initially honors the OS
      preference until explicitly set.
- [ ] Snapshot backfill can be **triggered from settings**, runs with a busy
      state, and reports a result summary (incl. warnings) on completion.
- [ ] Overwrite-on visibly warns that existing snapshots will be replaced;
      overwrite-off reconciles in place without duplicating dates.
- [ ] Data **export is explicitly absent** — nothing on the page claims to export.
- [ ] Import is reachable from Settings as a one-line link to Component 4's bulk
      surface (not duplicated here).
- [ ] The Settings page carries **no** display-preference controls; they are in
      the global header.
