/** Build identity of the running bundle. Values are frozen at build time by
 *  `define` in vite.config.ts — see `src/vite-env.d.ts` for the globals. */

const COMMIT_SHORT_LENGTH = 7
const UNKNOWN_COMMIT_LABEL = "dev"

export const APP_VERSION = __BUILD_VERSION__
export const BUILD_COMMIT = __BUILD_COMMIT__
export const BUILD_TIME = __BUILD_TIME__

export const BUILD_COMMIT_SHORT = BUILD_COMMIT
  ? BUILD_COMMIT.slice(0, COMMIT_SHORT_LENGTH)
  : UNKNOWN_COMMIT_LABEL

/** What the shell renders: `v0.1.0 · f70892e`. */
export const BUILD_LABEL = `v${APP_VERSION} · ${BUILD_COMMIT_SHORT}`

/** Hover detail: full sha + build timestamp, one per line. */
export const BUILD_TOOLTIP = [
  `Version ${APP_VERSION}`,
  BUILD_COMMIT && `Commit ${BUILD_COMMIT}`,
  BUILD_TIME && `Built ${BUILD_TIME}`,
]
  .filter(Boolean)
  .join("\n")
