import { getServiceClient } from "../_shared/client.ts"
import { corsHeaders } from "../_shared/cors.ts"
import {
  CAMPAIGN_PROGRAM_TYPES,
  APR_KINDS,
  PLATFORM_WATCH_LIST,
  validateCampaignBatch,
  type CampaignInput,
} from "../_shared/campaigns.ts"
import {
  fetchLatestSuccessfulRows,
  insertCampaignBatch,
  recordFailedRun,
  PRODUCER_RESEARCH,
  type StoredCampaign,
} from "../_shared/campaign-store.ts"

// The default campaign producer (Component 15): three grounded Gemini sweeps
// over the platform watch list, merged into one batch and pushed through the
// same validate+insert path as the ingest door. Triggered weekly by pg_cron
// (X-Cron-Token); invocable by hand with the ingest bearer token.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

/** Tickers that are stablecoins regardless of how the catalog tags them. */
const STABLE_TICKERS = ["USDT", "USDC", "DAI", "FDUSD", "TUSD"]
const STABLE_TAG = "usd"

/** Regulatory framing every sweep carries — without it the model reports TR
 *  programs as if Turkey were an unregulated market, and silently drops the
 *  "this program was paused" findings that matter most here. */
const REGULATORY_CONTEXT = `Regulatory context (Turkey): Turkish SPK rules ban customer-asset lending and
guaranteed-return promos; staking is a tolerated GRAY ZONE for Turkish-licensed entities. A TR earn
program that has been paused, withdrawn or restructured is ITSELF a finding — report it (as a
campaign row whose conditions explain the pause, or in your notes) rather than omitting it. Any SPK
announcement touching staking/earn/lending is likewise a finding. Campaigns on global platforms are
often country-gated: put the Turkey eligibility of each campaign into that row's "conditions" field,
and say so explicitly when eligibility is unconfirmed.`

interface Sweep {
  name: string
  instruction: string
}

interface SweepResult {
  name: string
  rows: unknown[]
  rawText: string
  error?: string
}

// ──────────────────────────────────────────────────────────────────────
// Prompting
// ──────────────────────────────────────────────────────────────────────

function watchListBlock(): string {
  return PLATFORM_WATCH_LIST.map(
    (p, i) => `${i + 1}. ${p.platform} [${p.kind}] — search: ${p.groundUrl} — CAVEAT: ${p.flag}`,
  ).join("\n")
}

/** The output contract. Note the fenced-JSON demand: with the google_search
 *  tool enabled the API rejects response_mime_type, so a fenced block is the
 *  only reliable way to get parseable output out of a grounded call. */
function outputContract(today: string): string {
  return `OUTPUT FORMAT — obey exactly:
Reply with ONE fenced code block, nothing before or after it:

\`\`\`json
[ { ...campaign... }, { ...campaign... } ]
\`\`\`

Each campaign object has these fields (omit or null what you cannot verify):
- "asset_ticker" (required): the rewarded coin's ticker, e.g. "ETH".
- "platform" (required): the platform name from the watch list, or the real name if elsewhere.
- "program_type" (required): one of ${CAMPAIGN_PROGRAM_TYPES.join(" | ")}.
- "apr": the rate as a NUMBER in percent (3.8 means 3.8%), or null if the reward is prose-only.
- "apr_kind": one of ${APR_KINDS.join(" | ")} — REQUIRED whenever "apr" is set.
- "reward_description": prose reward when there is no rate (e.g. "hold >= 0.1 ETH through September
  to receive N tokens"). A row MUST have "apr" or "reward_description".
- "lock_days": integer lock-up in days; 0 or null for flexible.
- "min_amount", "max_amount": numbers; "amount_currency": their unit, e.g. "USDT".
- "conditions": the fine print, INCLUDING Turkey eligibility.
- "deadline": "YYYY-MM-DD" or null.
- "is_stablecoin": true if the rewarded/deposited asset is a stablecoin.
- "source_url" (required): the REAL page you read this on — an announcement, product or docs URL you
  actually visited via search. Never invent, guess or template a URL. If you cannot cite a real page
  for a row, DROP THE ROW.
- "fetched_at" (required): "${today}".

Rules: only offers that are LIVE or announced-and-upcoming as of ${today}. No historical campaigns.
Rates are what the platform publishes today — do not estimate, extrapolate or average. If a sweep
finds nothing, return an empty array \`[]\`.`
}

function buildPrompt(today: string, instruction: string): string {
  return `You are a crypto earn-programme researcher. Today is ${today}. Use Google Search for
EVERY claim — never answer from memory; published rates change weekly.

WATCH LIST (search each; the caveat tells you what to verify or flag):
${watchListBlock()}

${REGULATORY_CONTEXT}

TASK:
${instruction}

${outputContract(today)}`
}

function buildSweeps(today: string, catalogTickers: string[], stableTickers: string[]): Sweep[] {
  const sweeps: Sweep[] = []
  // An empty catalog would produce a coin sweep with no coins in it — drop it
  // and let the other two carry the run.
  if (catalogTickers.length > 0) {
    sweeps.push({
      name: "catalog-coins",
      instruction: `Find current earn/staking/launchpool/hold-to-earn/airdrop offers on the watch-list
platforms for these specific coins: ${catalogTickers.join(", ")}.
Cover every coin you can find an offer for; skip the ones with nothing live.`,
    })
  }
  sweeps.push(
    {
      name: "stablecoins",
      instruction: `Find current stablecoin earn offers (flexible earn, locked earn, lending-style
"staking", promo/boosted rates) on the watch-list platforms, for ${stableTickers.join(", ")} and any
other major stablecoin. Set "is_stablecoin": true on every row. Boosted/limited-time promo rates are
especially relevant — record their deadline.`,
    },
    {
      name: "notable-sweep",
      instruction: `Open sweep: anything NOTABLE currently running on the watch-list platforms, even
for coins nobody holds — new launchpools, HODLer airdrops, points seasons, high-yield promos,
newly-listed-coin campaigns. Also report any watch-list earn programme that has recently been
paused, changed or withdrawn, and any SPK announcement affecting staking/earn.`,
    },
  )
  return sweeps
}

// ──────────────────────────────────────────────────────────────────────
// Gemini
// ──────────────────────────────────────────────────────────────────────

/** Pull the model's JSON array out of its reply. Grounded replies routinely
 *  carry prose and citations around the block, so the fence is tried first,
 *  then a bare-array scan, then the whole text — defensive because a parse
 *  failure costs a whole sweep. */
function extractJsonArray(text: string): unknown[] | null {
  const candidates: string[] = []

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1])

  const firstBracket = text.indexOf("[")
  const lastBracket = text.lastIndexOf("]")
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1))
  }
  candidates.push(text)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim())
      if (Array.isArray(parsed)) return parsed
      // Some replies wrap the array: { "campaigns": [...] }.
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (Array.isArray(value)) return value
        }
      }
    } catch {
      // Try the next, looser candidate.
    }
  }
  return null
}

async function runSweep(
  sweep: Sweep,
  opts: { apiKey: string; model: string; prompt: string },
): Promise<SweepResult> {
  try {
    const res = await fetch(
      `${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
          // Grounded search: the whole point is that rates come off the live
          // web, not the model's training data.
          tools: [{ google_search: {} }],
        }),
      },
    )

    const bodyText = await res.text()
    if (!res.ok) {
      return { name: sweep.name, rows: [], rawText: bodyText, error: `HTTP ${res.status}` }
    }

    const data = JSON.parse(bodyText)
    const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts)
      ? parts.map((p: { text?: unknown }) => (typeof p.text === "string" ? p.text : "")).join("")
      : ""
    if (!text) {
      return { name: sweep.name, rows: [], rawText: bodyText, error: "empty model reply" }
    }

    const rows = extractJsonArray(text)
    if (!rows) {
      return { name: sweep.name, rows: [], rawText: text, error: "no JSON array in reply" }
    }
    return { name: sweep.name, rows, rawText: text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error"
    return { name: sweep.name, rows: [], rawText: "", error: msg }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Merge + diff
// ──────────────────────────────────────────────────────────────────────

const identity = (c: { asset_ticker: string; platform: string; program_type: string }) =>
  `${c.asset_ticker}|${c.platform}|${c.program_type}`

/** Same offer reported by two sweeps: keep the higher rate. Sweeps overlap by
 *  design (a stablecoin in the catalog shows up in two of them), and the
 *  higher figure is the one the user would want to check at source. */
function dedupeCampaigns(rows: CampaignInput[]): CampaignInput[] {
  const byKey = new Map<string, CampaignInput>()
  for (const row of rows) {
    const key = identity(row)
    const existing = byKey.get(key)
    if (!existing || (row.apr ?? -1) > (existing.apr ?? -1)) byKey.set(key, row)
  }
  return [...byKey.values()]
}

const pairName = (c: { asset_ticker: string; platform: string }) =>
  `${c.asset_ticker}@${c.platform}`

/** Deterministic change summary vs the previous run — computed here, not asked
 *  of the model, so it can't be embellished. Names are capped: the summary is
 *  a page header, not a changelog. */
function buildChangeSummary(
  current: CampaignInput[],
  previous: StoredCampaign[],
  notes: string[],
): string {
  const currentPairs = new Set(current.map(pairName))
  const previousPairs = new Set(previous.map(pairName))
  const added = [...currentPairs].filter((p) => !previousPairs.has(p)).sort()
  const removed = [...previousPairs].filter((p) => !currentPairs.has(p)).sort()

  const cap = (list: string[]) =>
    list.length <= 8 ? list.join(", ") : `${list.slice(0, 8).join(", ")} +${list.length - 8} more`

  const parts = [`${current.length} campaigns found`]
  if (previous.length === 0) parts.push("first run (no previous dataset to compare)")
  else {
    parts.push(added.length > 0 ? `${added.length} new: ${cap(added)}` : "no new campaigns")
    parts.push(removed.length > 0 ? `${removed.length} gone: ${cap(removed)}` : "none dropped")
  }
  if (notes.length > 0) parts.push(notes.join("; "))
  return `${parts.join(". ")}.`
}

// ──────────────────────────────────────────────────────────────────────
// Orchestrator
// ──────────────────────────────────────────────────────────────────────

interface AssetRow {
  ticker: string
  tags: string[] | null
}

function isStable(asset: AssetRow): boolean {
  if (STABLE_TICKERS.includes(asset.ticker.toUpperCase())) return true
  return (asset.tags ?? []).some((t) => t.toLowerCase().includes(STABLE_TAG))
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin")
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    })

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) })
  }

  // Two doors, same privilege: the cron token (scheduled) and the ingest token
  // (manual re-run when a week's data looks wrong).
  const cronToken = Deno.env.get("CRON_TOKEN")
  const ingestToken = Deno.env.get("CAMPAIGN_INGEST_TOKEN")
  const isCron = !!cronToken && req.headers.get("X-Cron-Token") === cronToken
  const isManual = !!ingestToken && req.headers.get("Authorization") === `Bearer ${ingestToken}`
  if (!isCron && !isManual) return json({ error: "unauthorized" }, 401)

  const supabase = getServiceClient()
  const model = Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL
  const today = new Date().toISOString().slice(0, 10)

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")

    // Scope: the global crypto catalog, split so stablecoins get their own
    // sweep (their offers live on different pages than coin staking).
    const { data: assetRows, error: assetErr } = await supabase
      .from("assets")
      .select("ticker, tags")
      .eq("category", "crypto")
      .eq("is_active", true)
    if (assetErr) throw new Error(`assets: ${assetErr.message}`)

    const seen = new Set<string>()
    const catalog: string[] = []
    const stables = new Set(STABLE_TICKERS)
    for (const row of (assetRows ?? []) as AssetRow[]) {
      const ticker = row.ticker.trim().toUpperCase()
      if (!ticker || seen.has(ticker)) continue
      seen.add(ticker)
      if (isStable(row)) stables.add(ticker)
      else catalog.push(ticker)
    }

    const sweeps = buildSweeps(today, catalog, [...stables])
    const results: SweepResult[] = []
    for (const sweep of sweeps) {
      results.push(
        await runSweep(sweep, { apiKey, model, prompt: buildPrompt(today, sweep.instruction) }),
      )
    }

    // One failed sweep must not cost the whole run — the others' rows still
    // beat last week's data. Failures are named in the summary instead.
    const failedSweeps = results.filter((r) => r.error)
    if (failedSweeps.length === results.length) {
      throw new Error(
        `all sweeps failed: ${failedSweeps.map((r) => `${r.name} (${r.error})`).join(", ")}`,
      )
    }

    // Defaults first, model's own values second: fetched_at is today's run by
    // definition, and the stablecoin sweep's rows are stablecoin rows even
    // when the model forgets the flag.
    const merged = results.flatMap((r) =>
      r.rows.map((row) => {
        if (!row || typeof row !== "object") return row
        const merged: Record<string, unknown> = { ...(row as Record<string, unknown>) }
        if (typeof merged.fetched_at !== "string" || !merged.fetched_at) merged.fetched_at = today
        if (r.name === "stablecoins" && merged.is_stablecoin !== false) merged.is_stablecoin = true
        return merged
      }),
    )

    const { valid, rejected } = validateCampaignBatch({
      producer: PRODUCER_RESEARCH,
      campaigns: merged,
    })
    const deduped = dedupeCampaigns(valid)

    const rawOutput = results.map((r) => ({ sweep: r.name, error: r.error ?? null, text: r.rawText }))
    const notes = failedSweeps.map((r) => `sweep ${r.name} failed: ${r.error}`)
    if (rejected.length > 0) notes.push(`${rejected.length} rows rejected by validation`)

    if (deduped.length === 0) {
      const runId = await recordFailedRun(supabase, {
        producer: PRODUCER_RESEARCH,
        model,
        summary: `No valid campaigns found. ${notes.join("; ")}`,
        rejected,
        rawOutput,
      })
      return json({ run_id: runId, status: "failed", inserted: 0, rejected: rejected.length }, 422)
    }

    const previous = await fetchLatestSuccessfulRows(supabase)
    const summary = buildChangeSummary(deduped, previous, notes)

    const { runId, inserted } = await insertCampaignBatch(supabase, deduped, {
      producer: PRODUCER_RESEARCH,
      model,
      summary,
      rejected,
      rawOutput,
    })

    return json({ run_id: runId, status: "success", inserted, rejected: rejected.length, summary })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown research error"
    // The failed run is the log: previous rows stay live and untouched.
    const runId = await recordFailedRun(supabase, {
      producer: PRODUCER_RESEARCH,
      model,
      summary: msg,
    })
    return json({ run_id: runId, status: "failed", error: msg }, 500)
  }
})
