import { authorizeRequest, getCallerClient, unauthorizedResponse } from "../_shared/auth.ts"
import { HOME_TIMEZONE } from "../_shared/constants.ts"
import {
  baselinePrices,
  buildWatchlist,
  buildWidgetAssets,
  computeTodayChange,
  newestHeldUpdateMs,
  pickLatestTotal,
  type BaselineBreakdown,
  type TotalCandidate,
  type WidgetHolding,
  type WidgetPriceRow,
  type WidgetWatchItem,
} from "../_shared/widget.ts"

// ──────────────────────────────────────────────────────────────────────
// Read-only feed for the Android home-screen widget. The widget signs in as the
// owner (same email + password as the app) and calls with that user's access
// token; every read runs through RLS as that user — no service role. Writes
// nothing itself; when no price has been fetched for a while (app closed, hourly
// cron not yet due) it pings the existing throttled `fetch-prices` path.
// ──────────────────────────────────────────────────────────────────────

/** Ask for a price refresh when nothing in the cache is newer than this. */
const REFRESH_AFTER_MS = 15 * 60 * 1000

/** How long the response waits for that refresh before answering from cache
 *  (the refresh then finishes in the background). */
const REFRESH_WAIT_MS = 3_500

type UserClient = ReturnType<typeof getCallerClient>
type RefreshState = "none" | "done" | "background"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function loadPrices(supabase: UserClient) {
  const { data, error } = await supabase
    .from("price_cache")
    // `*`, not a column list: the baseline columns arrive with the watchlist
    // migration, and naming them would fail every read until it is applied.
    .select("*")
  if (error) throw new Error(`price_cache: ${error.message}`)
  const prices: Record<string, WidgetPriceRow> = {}
  for (const r of (data ?? []) as Array<WidgetPriceRow & { ticker: string }>) {
    prices[r.ticker] = {
      price_usd: num(r.price_usd),
      price_try: num(r.price_try),
      updated_at: r.updated_at,
      baseline_usd: num(r.baseline_usd),
      baseline_try: num(r.baseline_try),
    }
  }
  return prices
}

/** Ping `fetch-prices` exactly as the open app does — the caller's own
 *  Authorization, no cron token → a normal, per-asset-throttled refresh.
 *  Resolves true when it answered OK. */
function triggerPriceRefresh(authorization: string, apikey: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!
  return fetch(`${url}/functions/v1/fetch-prices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization, apikey },
    body: "{}",
  })
    .then(async (res) => {
      await res.body?.cancel()
      return res.ok
    })
    .catch((err) => {
      console.error("fetch-prices ping failed:", err)
      return false
    })
}

/** Keep the isolate alive for a background promise (Supabase Edge Runtime). */
function runInBackground(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  rt?.waitUntil?.(p)
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405)

  // Signed-in users only (the gateway's verify_jwt also passes the public anon
  // key). The Auth server confirms the token and gives the user id the queries
  // filter on; no cron caller.
  const caller = await authorizeRequest(req, { allowCron: false })
  if (caller.kind !== "user") return unauthorizedResponse({ "Cache-Control": "no-store" })
  const { userId, jwt } = caller
  const authorization = `Bearer ${jwt}`
  const apikey = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? ""
  const supabase = getCallerClient(req, jwt)

  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TIMEZONE }).format(new Date())

    const [cachedPrices, holdingsRes, rateRes, intradayRes, dailyRes, baselineRes, watchRes] = await Promise.all([
      loadPrices(supabase),
      supabase
        .from("holdings")
        .select("balance, assets(ticker, price_id, name, category, is_active)")
        .eq("user_id", userId)
        .gt("balance", 0),
      supabase
        .from("exchange_rates")
        .select("usd_try")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("intraday_snapshots")
        .select("captured_at, total_usd, total_try")
        .eq("user_id", userId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("snapshots")
        .select("snapshot_date, created_at, total_usd, total_try")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Baseline = the most recent snapshot before today (home-local day) —
      // the same baseline the app's daily return uses.
      supabase
        .from("snapshots")
        .select("snapshot_date, breakdown")
        .eq("user_id", userId)
        .lt("snapshot_date", today)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("watchlist_items")
        .select("ticker, name, price_id, currency")
        .eq("user_id", userId)
        .order("sort_order")
        .order("created_at"),
    ])
    for (const r of [holdingsRes, intradayRes, dailyRes, baselineRes]) {
      if (r.error) throw new Error(r.error.message)
    }

    type Row = { balance: unknown; assets: (WidgetHolding["asset"] & { is_active: boolean }) | null }
    const holdings: WidgetHolding[] = ((holdingsRes.data ?? []) as unknown as Row[])
      .filter((h) => h.assets && h.assets.is_active)
      .map((h) => ({ balance: num(h.balance) ?? 0, asset: h.assets! }))

    // ── Freshness: when none of the held prices moved in REFRESH_AFTER_MS
    // (app closed, hourly cron not due yet), refresh via the existing path ──
    let prices = cachedPrices
    let refresh: RefreshState = "none"
    if (Date.now() - newestHeldUpdateMs(holdings, prices) > REFRESH_AFTER_MS) {
      const ping = triggerPriceRefresh(authorization, apikey)
      const finished = await Promise.race([
        ping.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), REFRESH_WAIT_MS)),
      ])
      if (finished) {
        prices = await loadPrices(supabase)
        refresh = "done"
      } else {
        runInBackground(ping)
        refresh = "background"
      }
    }

    // ── Assets + today's change (price moves only) ───────────────────
    const baseline = baselinePrices(
      (baselineRes.data as { breakdown: BaselineBreakdown | null } | null)?.breakdown,
    )
    const usdTry = num((rateRes.data as { usd_try: unknown } | null)?.usd_try)
    const nowMs = Date.now()
    const { assets, positions } = buildWidgetAssets(holdings, prices, baseline, usdTry, nowMs)
    const change = computeTodayChange(positions)

    // ── Watchlist (Takip listesi): user's order. A failed read (e.g. the
    // table not migrated yet) empties it rather than failing the feed ──
    if (watchRes.error) console.error("widget-data watchlist:", watchRes.error.message)
    const watchlist = buildWatchlist(
      watchRes.error ? [] : ((watchRes.data ?? []) as WidgetWatchItem[]),
      prices,
      usdTry,
      nowMs,
    )

    // ── Total: the latest snapshot (what the dashboard shows) ────────
    const i = intradayRes.data as { captured_at: string; total_usd: unknown; total_try: unknown } | null
    const d = dailyRes.data as { created_at: string; total_usd: unknown; total_try: unknown } | null
    const candidate = (at: string | undefined, usd: unknown, tryV: unknown): TotalCandidate | null => {
      const u = num(usd)
      const t = num(tryV)
      return at && u != null && t != null ? { at, totalUsd: u, totalTry: t } : null
    }
    const latest = pickLatestTotal(
      candidate(i?.captured_at, i?.total_usd, i?.total_try),
      candidate(d?.created_at, d?.total_usd, d?.total_try),
    )

    return json({
      asOf: new Date(nowMs).toISOString(),
      total: {
        valueTry: latest?.totalTry ?? null,
        valueUsd: latest?.totalUsd ?? null,
        changeTry: change.changeTry,
        changePct: change.changePct,
        snapshotAt: latest ? new Date(latest.at).toISOString() : null,
      },
      assets,
      watchlist,
      pricesRefresh: refresh,
    })
  } catch (err) {
    console.error("widget-data failed:", err)
    return json({ error: "internal error" }, 500)
  }
})
