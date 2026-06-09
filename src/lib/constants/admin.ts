/**
 * The single admin account that curates the global asset catalog. Asset
 * create / edit / deactivate is gated to this user in the UI (via useIsAdmin)
 * AND in the database (the assets RLS write policies check the same uuid). RLS
 * is the real enforcement; this constant only decides whether to render the
 * controls. Mirrors the uuid in migration
 * 20260610000000_global_asset_catalog.sql.
 */
export const ADMIN_USER_ID = "201091b3-6381-48f2-860b-4947fac09c69"
