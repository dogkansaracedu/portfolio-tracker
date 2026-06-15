# Component 2: Database Schema & Auth — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/02-database-schema-auth.md](technical/02-database-schema-auth.md)

## Purpose

Define the persistent data model and the authentication boundary the whole app sits behind. Every other component reads and writes through the entities described here. Most reads/writes are scoped to the signed-in user; the lone exception is the **asset catalog**, which is global (shared by all users, writable only by the admin). This component owns: the entity catalog, per-user data isolation (with the global-asset-catalog exception), email/password authentication, an allowlist gate on signup, and the automatic seeding of a usable starter dataset for each new user.

## Depends on

- Project setup / configuration (the app must be able to reach its data store and identity provider).

## Concepts used

- Entities: [Platform](GLOSSARY.md#platform) · [Asset](GLOSSARY.md#asset) · [Holding](GLOSSARY.md#holding) · [Transaction](GLOSSARY.md#transaction) · [Snapshot](GLOSSARY.md#snapshot) · [Price](GLOSSARY.md#price) · [Exchange rate](GLOSSARY.md#exchange-rate)
- The entity fields, types, and relationships are defined once in the glossary; this spec does not restate them.

## Behaviors / rules

### Data model (what is stored)

- The system persists seven user-facing entity kinds. Follow each link for fields and relationships:
  - [Platform](GLOSSARY.md#platform) — per-user; where assets are held.
  - [Asset](GLOSSARY.md#asset) — a single **global catalog** shared by all users (one row per ticker; no platform on the asset itself). All authenticated users read it; only the [admin](GLOSSARY.md#admin) writes it.
  - [Holding](GLOSSARY.md#holding) — per-user; the balance of one asset on one platform, derived from its transactions, never entered directly.
  - [Transaction](GLOSSARY.md#transaction) — per-user; the dated events that drive holding balances.
  - [Snapshot](GLOSSARY.md#snapshot) — per-user; one frozen aggregation per user per date.
  - [Price](GLOSSARY.md#price) — shared/global cache of the latest unit price per asset key; readable by any signed-in user, written only by the system's price-fetch path.
  - [Exchange rate](GLOSSARY.md#exchange-rate) — shared/global historical FX by date; readable by any signed-in user, written only by the system.
- **Intraday snapshots** — a transient, totals-only record of the portfolio's value
  captured roughly hourly and kept only for about the last day (older points are
  pruned). They exist solely to draw the intraday (single-day) value view; the daily
  snapshot remains the authoritative per-day record.
- A separate **benchmark price** series (daily-close index history, e.g. SPY / QQQ) is also stored globally and readable by any signed-in user; it backs the "performance vs market" overlay and is written only by the system.
- A **signup allowlist** (set of permitted emails, each with an optional note and an added-at timestamp) exists purely to gate account creation. It is operator-managed and is **not** readable or writable by ordinary users.

### Per-user data isolation (the core invariant)

- Every row of every **per-user** entity (platforms, holdings, transactions, snapshots, intraday snapshots) carries an owning user. A signed-in user can read and write **only their own** rows; another user's rows are invisible and unmodifiable, enforced at the data layer (not merely in the UI).
- **Assets are the exception:** they are a single **global catalog** shared by every user — all authenticated users read the same asset rows, and only the [admin](GLOSSARY.md#admin) account may create/edit/deactivate them. The admin-write restriction is enforced at the data layer, not merely in the UI.
- Other global/shared data (prices, exchange rates, benchmark series) is **read-only** to users: any signed-in user may read it; none may write it. Only the system's background fetch path writes it.
- Deleting a user cascades to all of that user's owned rows.

### Authentication

- Identity is **email + password**. Supported flows: **log in**, **sign up**, **sign out**.
- The app has **protected areas**: all portfolio functionality requires an authenticated session. An unauthenticated visitor is redirected to log in; the protected content never renders for them.
- A session, once established, persists across reloads and is silently refreshed in the background without disrupting the user or forcing a re-login. A background session refresh that does not change identity must **not** cause a full data reload or visible churn.

### Signup gate (allowlist)

- Account creation is **gated by an allowlist**. Sign-up succeeds only if the submitted email is on the allowlist; a non-allowlisted email **cannot** create an account, and no account row is created for it.
- The check is **case-insensitive** on the email and is enforced at the data layer, so it holds no matter how the signup is attempted (it cannot be bypassed by calling the identity provider directly or from a different client).
- The allowlist is **operator-managed**: the operator adds, removes, and lists permitted emails out-of-band. Removing an email blocks *future* signups for it but does **not** delete an already-existing account.
- **Grandfathering (historical):** when the gate was first introduced, every account that already existed was added to the allowlist so live users were not locked out. New accounts since then require an explicit allowlist entry.
- **Rejection UX caveat:** a blocked signup surfaces as a generic account-creation failure, not a precise "you are not on the allowlist" message. Acceptable for a small private tracker.

### New-user seeding

- Immediately after a successful signup, the new user is **auto-seeded** with a starter dataset so the app is usable on first login instead of empty:
  - a fixed set of **default [platforms](GLOSSARY.md#platform)** (the brokers / exchanges / banks / a physical bucket the owner uses).
  - No assets are seeded per-user — every user already shares the single **global [asset](GLOSSARY.md#asset) catalog** (the fiat currencies including the [USD anchor](GLOSSARY.md#usd-anchor) and the local currency, the major holdable assets, and representative stocks), so a new user sees the full catalog immediately without any seeding.
- Seeding writes **only into the new user's own rows** (its platforms) and cannot be aimed at another user.
- The shared asset catalog always includes the fiat currency rows, because later flows (e.g. the auto-paired cash side of a trade) assume each currency has a fiat row.
- Seeding is best-effort: if it fails, the account still exists and the user can log in; they simply start with no platforms (the shared asset catalog is still visible) and add their own.

## Contract (I/O)

**Provides to the rest of the app:**

- An **auth state**: the current user (or none), whether a session is still loading, and the actions `signIn(email, password)`, `signUp(email, password)`, `signOut()`. Each of `signIn` / `signUp` resolves with either success or an error to display.
- A **gate** that withholds protected content until an authenticated user is known (with a loading state in between).
- A **typed data model** (the entities above) and a per-user-scoped read/write surface that every other component builds on.

**Inputs / preconditions:**

- `signUp` requires the email to be on the allowlist; otherwise it returns an error and creates nothing.
- All data reads/writes require an authenticated session and are implicitly scoped to that user.

**Outputs / postconditions:**

- After a successful `signUp`: an account exists **and** the user's default platforms exist (best-effort); the global asset catalog is already visible to them without per-user seeding.
- After a successful `signIn`: a persistent session exists; protected areas render.
- After `signOut`: the session is cleared; protected areas stop rendering.

## UI contract — login / signup

- **Login view:** email + password fields; submit. States:
  - *idle* → editable form.
  - *submitting* → control disabled, progress label ("signing in…").
  - *error* → inline message from the failure (e.g. bad credentials); form re-editable.
  - *success* → redirect into the app (replacing history so Back doesn't return to login).
  - Link to the signup view.
- **Signup view:** email + password + **confirm-password** fields; submit. States:
  - Client-side rule: password and confirm-password must match before submit; mismatch shows an inline error and does not submit.
  - *submitting* / *error* / *success* mirror login. A non-allowlisted email lands in *error* with the generic creation-failure message.
  - On success the user is taken straight into the app (no separate email-confirmation step in this deployment).
  - Link to the login view.
- **Protected area:** while auth state is loading, show a neutral loading indicator; once known, either render the app (authenticated) or redirect to login (not).

## Acceptance — tech-neutral

- A non-allowlisted email submitted at signup is **rejected**, and no account is created for it.
- An allowlisted email can sign up; the same email, if removed from the allowlist afterward, still has its existing account but a *new* signup with a different non-listed email is rejected.
- A brand-new (allowlisted) user, on first login, already has the default set of platforms and sees the shared global asset catalog — including a fiat row for each default currency — rather than an empty workspace.
- The email allowlist match is case-insensitive (`Person@Example.com` matches a listed `person@example.com`).
- A signed-in user can read and write only their own platforms / holdings / transactions / snapshots / intraday snapshots; they can read the shared global asset catalog but write it only if they are the admin; they can read but not write the shared price, exchange-rate, and benchmark data; they can neither read nor write the allowlist.
- Visiting a protected area without a session redirects to login; the protected content never renders unauthenticated.
- Reloading the page keeps the user logged in; a background session refresh that doesn't change identity does not trigger a visible data reload.
