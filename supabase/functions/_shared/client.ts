import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"

/**
 * Service-role Supabase client for edge functions. Bypasses RLS; only use
 * from server-side code where the request has been authorized by other
 * means (cron token, end-user JWT validated separately, etc.).
 */
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
