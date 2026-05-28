import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at startup rather than letting createClient build a client
// pointed at `undefined`, which surfaces only later as opaque request errors.
// With no local dev server (commit → push → test on prod), a missing/renamed
// Vercel env var would otherwise ship as a silently broken live app.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — set them in .env.local (dev) and the Vercel project environment (prod).",
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
