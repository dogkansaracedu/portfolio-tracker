import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { resolveCaller, type CallerDecision } from "./caller.ts"

/**
 * Request-level auth for edge functions. See `caller.ts` for why the gateway's
 * `verify_jwt` is not enough (the anon key is a valid JWT and is public).
 */

function anonKey(req: Request): string {
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey")
  if (!key) throw new Error("Missing SUPABASE_ANON_KEY env var")
  return key
}

function supabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")
  if (!url) throw new Error("Missing SUPABASE_URL env var")
  return url
}

/**
 * Resolve the caller to the cron job (only when `allowCron`) or a signed-in
 * user verified by the Auth server (`auth.getUser`). Anon and service-role
 * tokens carry no user, so they come back `denied`.
 */
export function authorizeRequest(
  req: Request,
  opts: { allowCron: boolean },
): Promise<CallerDecision> {
  return resolveCaller({
    authorization: req.headers.get("Authorization"),
    cronHeader: req.headers.get("X-Cron-Token"),
    cronToken: Deno.env.get("CRON_TOKEN"),
    allowCron: opts.allowCron,
    getUserId: async (jwt) => {
      const auth = createClient(supabaseUrl(), anonKey(req), {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth
      const { data, error } = await auth.getUser(jwt)
      if (error || !data.user) return null
      return data.user.id
    },
  })
}

/**
 * Client that acts as the verified user: the anon key plus the user's own
 * access token, so every read and write goes through RLS as that user.
 */
export function getCallerClient(req: Request, jwt: string): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(req), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

/** The 401 every guarded function returns; never says why. */
export function unauthorizedResponse(headers: HeadersInit): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}
