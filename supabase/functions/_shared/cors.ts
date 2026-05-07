// Shared CORS helper for all Edge Functions.
// ALLOWED_ORIGINS is a comma-separated env var; if empty or unset the
// helper falls back to the literal string "null" which browsers treat as
// no-allow. Set "*" only if intentionally opening to any origin.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*"))
      ? origin
      : ALLOWED_ORIGINS[0] ?? "null"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}
