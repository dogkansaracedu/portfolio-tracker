# Component 1: Project Setup — Behavioral Spec

> Layer: behavioral (tech-agnostic). Implementation → [technical/01-project-setup.md](technical/01-project-setup.md)

## Purpose

The application is a client-rendered single-page app: it loads once, then routes and renders entirely on the client with no full-page reloads. This component defines the foundation every other component sits on — the set of named screens, the navigation shell that wraps them, the light/dark theme, and the rule that the app is private (sign-in required) while only the login and signup screens are public. It owns no domain data; it provides the frame.

## Depends on

None. This is the foundation.

## Concepts used

None — this component is pre-domain. It defines structure (routes, shell, theme, auth gate), not any portfolio concept. Domain meaning enters from Component 2 onward.

## Behaviors / rules

- **Single-page navigation.** Moving between screens swaps content in place; no full reload. Each screen has a stable, bookmarkable URL path. Deep-linking directly to any path works (loading that URL lands on that screen, subject to the auth gate).
- **Named screens.** Exactly these authenticated screens exist:
  - `dashboard` — the default/home screen (the app root path).
  - `portfolio`
  - `transactions`
  - `performance`
  - `settings`
- **Public screens.** `login` and `signup` are reachable without being signed in.
- **Auth gate.** All authenticated screens require a signed-in user. An unauthenticated visit to any authenticated path is redirected to `login` (the redirect replaces history so Back doesn't bounce). While the app is still determining whether a session exists, a neutral loading state shows instead of either the screen or a premature redirect.
- **Full-screen vs. shell screens.** Most authenticated screens render inside the app shell (navigation + header). At least one authenticated flow — the dedicated transaction-editing screen — renders full-screen with no side navigation and no header, so the user can focus on data entry. (Detail of which flows are full-screen is part of those components; the setup contract is only that the routing layer supports both shell-wrapped and full-screen authenticated screens.)
- **App shell.** Authenticated shell screens are wrapped by a persistent layout:
  - **Desktop:** a persistent side navigation listing all five named screens, plus a top header.
  - **Mobile:** the side navigation is hidden; a bottom navigation bar lists the same five screens, plus the top header remains.
  - The active screen is visually indicated in whichever navigation is showing.
  - Only the content region scrolls; navigation and header stay fixed.
- **Theme.** The app supports a light and a dark theme. The choice is user-toggleable, persists across reloads and sessions, and on first visit defaults to the operating-system preference. The correct theme must be applied before first paint (no flash of the wrong theme).
- **Lazy screens.** Screens may load on demand the first time they're visited; while a screen's content is loading, a neutral placeholder shows in the content region.

## Contract (I/O)

Provides to all other components:

- A routing surface: the five named authenticated paths, the two public paths, plus support for full-screen authenticated paths — so any component can own a screen by name.
- The app shell (side nav + bottom nav + header) into which shell screens render their content.
- A global theme state (current theme + a toggle) that any component may read or flip.
- The auth-gate guarantee: code rendered inside an authenticated screen can assume a signed-in user exists.

Consumes: a signed-in/anonymous session signal and a sign-out action (owned by the auth component) to drive the gate and the account menu.

## UI contract

What the user sees and can do:

- **App shell (authenticated, shell screens):**
  - Desktop: left side navigation with the product name/logo and the five screen links (icon + label); a top header.
  - Mobile: a fixed bottom bar with the five screens (icon + label); the side navigation is not shown; the header shows the current screen's title.
  - Header controls (right-aligned): hide/show-values toggle, theme toggle, display-currency toggle, a price-refresh control, and an account menu. (Each control's behavior belongs to its own component; setup only guarantees the header hosts them.)
  - Account menu: shows who is signed in and offers sign-out; sign-out asks for confirmation, then returns the user to `login`.
- **Public screens:** `login` and `signup` render standalone, without the app shell.
- **States:**
  - *Determining session* — neutral full-screen loading indicator (neither screen nor redirect yet).
  - *Screen loading on demand* — neutral placeholder in the content region.
  - *Unauthenticated on a private path* — redirect to `login`.
- **Responsive intent:** a single breakpoint splits desktop (side nav) from mobile (bottom nav). Content padding leaves room for the bottom bar on mobile so it never overlaps content.

## Acceptance

Any stack must pass these:

- Navigating between all five authenticated screens works on both a desktop-width and a mobile-width viewport, swapping content with no full reload.
- On desktop the side navigation is visible and the bottom bar is not; on mobile the bottom bar is visible and the side navigation is not. The active screen is highlighted in the visible navigation.
- Toggling the theme switches light/dark immediately, the choice persists across a reload, and a fresh visitor with no saved choice gets the OS preference — with no wrong-theme flash on load.
- Visiting any authenticated path while signed out redirects to `login`; visiting `login` or `signup` while signed out succeeds.
- A signed-in user can open the account menu, confirm sign-out, and is returned to `login`.
- Deep-linking to any authenticated path while signed in lands on that screen inside the shell (or full-screen, for full-screen flows).
- Visiting a not-yet-loaded screen shows a neutral placeholder, then the screen.
