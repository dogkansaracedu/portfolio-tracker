/** The Admin page: catalog upkeep for the single admin account (GLOSSARY:
 *  Admin). Non-admins are sent home. */

export const ADMIN_ROUTE = "/admin"

/** Where a non-admin who opens the Admin page lands. */
export const ADMIN_FALLBACK_ROUTE = "/"

export const ADMIN_COPY = {
  pageTitle: "Admin",
  pageSubtitle: "The asset catalog and where each price comes from.",
  /** The Settings pointer, shown to the admin only. */
  settingsHeading: "Asset catalog",
  settingsLink: "Edit assets and price sources",
} as const
