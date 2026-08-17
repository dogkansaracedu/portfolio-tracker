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

// The default campaign producer (Component 15). Two engines, selected by the
// CAMPAIGN_RESEARCH_ENGINE env var:
//   tavily (default) — one Tavily Research call (hosted multi-step researcher,
//     search included, structured output via output_schema). Free tier covers
//     the weekly cadence; mini tier costs 4–110 credits of the 1,000/month.
//   gemini — three url_context/google_search sweeps (Gemini free keys have no
//     search; kept as the fallback engine).
// Both funnel into the same validate+insert path as the ingest door. Triggered
// weekly by pg_cron (X-Cron-Token); invocable by hand with the ingest bearer
// token.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash"

/** How sweeps reach the live web. Free API keys have no google_search quota on
 *  3.x models (and the 2.5 models with free grounding are closed to new keys,
 *  verified empirically 2026-08-17), but url_context — fetching the watch
 *  list's pages directly — is free. google_search stays available for
 *  billing-enabled projects via the GEMINI_GROUNDING env var. */
const GROUNDING_MODES = ["url_context", "google_search"] as const
type GroundingMode = (typeof GROUNDING_MODES)[number]
const DEFAULT_GROUNDING: GroundingMode = "url_context"

const RESEARCH_ENGINES = ["tavily", "gemini"] as const
type ResearchEngine = (typeof RESEARCH_ENGINES)[number]
const DEFAULT_ENGINE: ResearchEngine = "tavily"

const TAVILY_BASE = "https://api.tavily.com"
/** mini = 4–110 credits per call (dynamic), pro = 15–250. Weekly pro worst-case
 *  brushes the free 1,000/month; mini proved too shallow for a 15-platform
 *  sweep (first run: one page, five rows), so the tier is env-tunable. */
const DEFAULT_TAVILY_MODEL = "mini"
const TAVILY_MODEL = Deno.env.get("TAVILY_RESEARCH_MODEL") ?? DEFAULT_TAVILY_MODEL
const TAVILY_POLL_MS = 10_000
/** Research is async (submit → poll) and a pro run outlives the free-tier
 *  edge-function wall clock (~150s — a 320s in-function poll died with
 *  WORKER_RESOURCE_LIMIT). So the function self-chains: each invocation polls
 *  within this per-hop budget, then re-invokes itself with the request_id.
 *  Client disconnects don't kill Supabase function execution (the cron jobs
 *  already rely on that), so a 5s fire-and-forget delivers the next hop. */
const TAVILY_HOP_BUDGET_MS = 100_000
const TAVILY_MAX_HOPS = 6

/** Tickers that are stablecoins regardless of how the catalog tags them. */
const STABLE_TICKERS = ["USDT", "USDC", "DAI", "FDUSD", "TUSD"]
/** Tokenized gold is parked value the same way dollars are — its earn offers
 *  belong in the stable-value bucket (user decision 2026-08-17). */
const GOLD_TOKEN_TICKERS = ["PAXG", "XAUT"]
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

function buildPrompt(today: string, instruction: string, grounding: GroundingMode): string {
  const method =
    grounding === "google_search"
      ? `Use Google Search for
EVERY claim — never answer from memory; published rates change weekly.

WATCH LIST (search each; the caveat tells you what to verify or flag):`
      : `Fetch and read the watch-list source pages below (the url_context tool retrieves them for
you) and base every claim ONLY on their live content — never on memory; published rates change
weekly. Follow a page's own links only when it cites a specific campaign page.

WATCH LIST (fetch each source page; the caveat tells you what to verify or flag):`
  return `You are a crypto earn-programme researcher. Today is ${today}. ${method}
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
      instruction: `Find current stable-value earn offers (flexible earn, locked earn, lending-style
"staking", promo/boosted rates) on the watch-list platforms, for ${stableTickers.join(", ")} and any
other major stablecoin or tokenized-gold token. Set "is_stablecoin": true on every row.
Boosted/limited-time promo rates are especially relevant — record their deadline.`,
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
  opts: { apiKey: string; model: string; prompt: string; grounding: GroundingMode },
): Promise<SweepResult> {
  try {
    const res = await fetch(
      `${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
          // Grounded either way: rates must come off the live web, not the
          // model's training data. url_context reads the watch-list pages;
          // google_search (paid tier) searches beyond them.
          tools: opts.grounding === "google_search" ? [{ google_search: {} }] : [{ url_context: {} }],
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
// Tavily research engine
// ──────────────────────────────────────────────────────────────────────

/** The single research task: same three collection targets the Gemini sweeps
 *  split up, folded into one call because each research call carries a 4+
 *  credit floor. */
function buildTavilyInput(today: string, catalogTickers: string[], stableTickers: string[]): string {
  return `You are collecting crypto earn/reward campaigns for a retail investor in Turkey. Today is
${today}. Report only offers that are LIVE or announced-and-upcoming as of ${today} — no historical
campaigns; rates must be what platforms publish now, never estimated, extrapolated or remembered.

Collect three things:
1. Earn/staking/launchpool/hold-to-earn/airdrop offers on the watch-list platforms for these coins:
${catalogTickers.join(", ") || "(none in catalog — skip this part)"}.
2. Stable-value earn offers on those platforms — stablecoins AND tokenized gold
(${stableTickers.join(", ")} and other major stablecoins or gold tokens) — set "is_stablecoin": true
on every such row; boosted/limited-time promo rates are especially relevant, record their deadline.
3. Any other currently-notable campaign on those platforms worth joining even without holding the
coin — new launchpools, HODLer airdrops, points seasons, deposit promos, newly-listed-coin campaigns.

WATCH LIST (check each; the caveat says what to verify or flag):
${watchListBlock()}

COVERAGE RULE — breadth before depth: visit EVERY watch-list platform. A platform with a live earn
page and zero rows is an incomplete answer; cap yourself at ~4 rows per platform rather than mining
one platform deeply. RATES RULE: any published rate goes in "apr" as a number (top of range +
apr_kind "up_to" for ranges) — never as prose.

${REGULATORY_CONTEXT}
Put earn-availability changes (paused/withdrawn programs, SPK decisions touching staking/earn) in
"regulatory_notes" — one short paragraph at most.

STRICT EXCLUSIONS: no tax guidance, no deposit/withdrawal mechanics, no KYC/AML explanation, no
exchange reviews, no general regulation commentary — not anywhere in the output. Also exclude
structured products whose principal can settle in a different asset (Dual Investment,
dual-currency, sell-high/buy-low products): those are options strategies, not earn campaigns.
Anything that is not a campaign row or an earn-availability note is unwanted.

Every row's "source_url" must be a page you actually read. If you cannot cite a real page for a
row, drop the row. If a platform has nothing live, return nothing for it.`
}

/** Our campaign row as a JSON Schema so the researcher fills rows instead of
 *  writing a report. fetched_at is deliberately absent — stamped server-side. */
function tavilyOutputSchema(): Record<string, unknown> {
  return {
    properties: {
      campaigns: {
        type: "array",
        description: "One row per live earn/reward campaign found.",
        items: {
          type: "object",
          properties: {
            asset_ticker: { type: "string", description: "Rewarded coin's ticker, e.g. ETH" },
            platform: { type: "string", description: "Platform running the offer" },
            program_type: {
              type: "string",
              enum: [...CAMPAIGN_PROGRAM_TYPES],
              description: "The campaign's program type.",
            },
            apr: {
              type: "number",
              description:
                "Rate in percent (3.8 means 3.8%). ALWAYS set this when any rate is published; for a range like 3.36%-7.2% set apr to the top (7.2) with apr_kind 'up_to'. Omit ONLY when the reward truly has no rate.",
            },
            apr_kind: {
              type: "string",
              enum: [...APR_KINDS],
              description: "Required whenever apr is set.",
            },
            reward_description: {
              type: "string",
              description:
                "Prose reward ONLY when there is no rate (e.g. token airdrops). Never put percentages here — rates belong in apr. Every row must have apr OR reward_description.",
            },
            lock_days: { type: "integer", description: "Lock-up in days; 0 or omitted = flexible." },
            min_amount: { type: "number", description: "Minimum participation amount. Omit if none." },
            max_amount: { type: "number", description: "Maximum/cap amount. Omit if none." },
            amount_currency: { type: "string", description: "Unit of min/max, e.g. USDT." },
            conditions: {
              type: "string",
              description: "Fine print INCLUDING Turkey eligibility (say when unconfirmed).",
            },
            deadline: { type: "string", description: "YYYY-MM-DD. Omit when open-ended." },
            is_stablecoin: {
              type: "boolean",
              description:
                "True when the deposited/rewarded asset is stable-value: a stablecoin or tokenized gold (PAXG, XAUT).",
            },
            source_url: {
              type: "string",
              description: "The real page this was read on. Never invent or template a URL.",
            },
          },
          required: ["asset_ticker", "platform", "program_type", "source_url", "is_stablecoin"],
        },
      },
      regulatory_notes: {
        type: "string",
        description:
          "ONLY changes to earn/staking availability (paused programs, SPK decisions). Not tax, not banking, not general regulation. Omit when nothing changed.",
      },
    },
    required: ["campaigns"],
  }
}

/** include_domains wants bare hostnames; groundUrl entries are scheme-less and
 *  occasionally compound ("a.com/x + /y"). API cap: 20 domains. */
function watchListDomains(): string[] {
  const domains = new Set<string>()
  for (const entry of PLATFORM_WATCH_LIST) {
    for (const token of entry.groundUrl.split(/[\s+]+/)) {
      const host = token.split("/")[0]?.trim().replace(/^www\./, "")
      if (host && host.includes(".")) domains.add(host)
    }
  }
  return [...domains].slice(0, 20)
}

/** Submit the research task; returns its request_id (and content when it
 *  somehow completes synchronously). */
async function submitTavilyResearch(
  apiKey: string,
  input: string,
): Promise<{ requestId: string; content?: unknown }> {
  const submit = await fetch(`${TAVILY_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input,
      model: TAVILY_MODEL,
      include_domains: watchListDomains(),
      output_schema: tavilyOutputSchema(),
    }),
  })
  const body = (await submit.json().catch(() => null)) as Record<string, unknown> | null
  if (!submit.ok) {
    throw new Error(`tavily submit HTTP ${submit.status}: ${JSON.stringify(body)?.slice(0, 300)}`)
  }
  const requestId = typeof body?.request_id === "string" ? body.request_id : null
  if (!requestId) throw new Error("tavily submit returned no request_id")
  if (body?.status === "completed") return { requestId, content: body.content }
  return { requestId }
}

/** Poll GET /research/{id} within one hop's budget. Statuses per the API
 *  reference: pending | in_progress | completed | failed. */
async function pollTavilyResearch(
  apiKey: string,
  requestId: string,
  budgetMs: number,
): Promise<{ done: true; content: unknown } | { done: false }> {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TAVILY_POLL_MS))
    const res = await fetch(`${TAVILY_BASE}/research/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (body?.status === "completed") return { done: true, content: body.content }
    if (body?.status === "failed") throw new Error(`tavily research ${requestId} failed`)
  }
  return { done: false }
}

/** Fire-and-forget self-invocation carrying the pending request_id. The 5s
 *  abort only drops our side of the connection — the invoked function keeps
 *  running (same guarantee the pg_net crons depend on). */
async function chainNextHop(requestId: string, hop: number): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/research-campaigns`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": Deno.env.get("CRON_TOKEN") ?? "",
      },
      body: JSON.stringify({ request_id: requestId, hop }),
      signal: controller.signal,
    })
  } catch {
    // Aborting our side is expected; delivery already happened.
  } finally {
    clearTimeout(timer)
  }
}

/** content is "a string or a structured object if output_schema was provided" —
 *  parse defensively either way. */
function parseTavilyContent(content: unknown): { campaigns: unknown[]; regulatoryNotes: string | null } {
  let parsed: unknown = content
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content)
    } catch {
      const arr = extractJsonArray(content)
      parsed = arr ? { campaigns: arr } : null
    }
  }
  if (Array.isArray(parsed)) return { campaigns: parsed, regulatoryNotes: null }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>
    return {
      campaigns: Array.isArray(obj.campaigns) ? obj.campaigns : [],
      regulatoryNotes:
        typeof obj.regulatory_notes === "string" && obj.regulatory_notes.trim()
          ? obj.regulatory_notes.trim()
          : null,
    }
  }
  return { campaigns: [], regulatoryNotes: null }
}

/** fetched_at is this run's date by definition; models routinely omit it. */
function stampFetchedAt(row: unknown, today: string): unknown {
  if (!row || typeof row !== "object") return row
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  if (typeof out.fetched_at !== "string" || !out.fetched_at) out.fetched_at = today
  return out
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

  // A body with request_id is a continuation hop of an already-submitted
  // Tavily research task (see chainNextHop); an empty body starts a new run.
  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const pendingRequestId = typeof payload?.request_id === "string" ? payload.request_id : null
  const hop = typeof payload?.hop === "number" ? payload.hop : 0

  const supabase = getServiceClient()
  const engineEnv = Deno.env.get("CAMPAIGN_RESEARCH_ENGINE")
  const engine: ResearchEngine = (RESEARCH_ENGINES as readonly string[]).includes(engineEnv ?? "")
    ? (engineEnv as ResearchEngine)
    : DEFAULT_ENGINE
  const model =
    engine === "tavily"
      ? `tavily-research-${TAVILY_MODEL}`
      : Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL
  const today = new Date().toISOString().slice(0, 10)

  try {
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
    const stables = new Set([...STABLE_TICKERS, ...GOLD_TOKEN_TICKERS])
    for (const row of (assetRows ?? []) as AssetRow[]) {
      const ticker = row.ticker.trim().toUpperCase()
      if (!ticker || seen.has(ticker)) continue
      seen.add(ticker)
      if (isStable(row)) stables.add(ticker)
      else catalog.push(ticker)
    }

    let merged: unknown[]
    let rawOutput: unknown
    const notes: string[] = []

    if (engine === "tavily") {
      const apiKey = Deno.env.get("TAVILY_API_KEY")
      if (!apiKey) throw new Error("TAVILY_API_KEY is not configured")

      let requestId = pendingRequestId
      let content: unknown
      if (!requestId) {
        const submitted = await submitTavilyResearch(
          apiKey,
          buildTavilyInput(today, catalog, [...stables]),
        )
        requestId = submitted.requestId
        content = submitted.content
      }
      if (content === undefined) {
        if (hop > TAVILY_MAX_HOPS) {
          throw new Error(
            `tavily research ${requestId} still running after ${TAVILY_MAX_HOPS} hops — giving up`,
          )
        }
        const polled = await pollTavilyResearch(apiKey, requestId, TAVILY_HOP_BUDGET_MS)
        if (!polled.done) {
          await chainNextHop(requestId, hop + 1)
          return json({ status: "pending", request_id: requestId, next_hop: hop + 1 }, 202)
        }
        content = polled.content
      }

      const { campaigns, regulatoryNotes } = parseTavilyContent(content)
      if (regulatoryNotes) notes.push(`regulatory: ${regulatoryNotes}`)
      merged = campaigns.map((row) => stampFetchedAt(row, today))
      rawOutput = { engine, request_id: requestId, content }
    } else {
      const apiKey = Deno.env.get("GEMINI_API_KEY")
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")
      const groundingEnv = Deno.env.get("GEMINI_GROUNDING")
      const grounding: GroundingMode = (GROUNDING_MODES as readonly string[]).includes(
        groundingEnv ?? "",
      )
        ? (groundingEnv as GroundingMode)
        : DEFAULT_GROUNDING

      const sweeps = buildSweeps(today, catalog, [...stables])
      const results: SweepResult[] = []
      for (const sweep of sweeps) {
        results.push(
          await runSweep(sweep, {
            apiKey,
            model,
            grounding,
            prompt: buildPrompt(today, sweep.instruction, grounding),
          }),
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

      // Defaults first, model's own values second: the stablecoin sweep's rows
      // are stablecoin rows even when the model forgets the flag.
      merged = results.flatMap((r) =>
        r.rows.map((row) => {
          const stamped = stampFetchedAt(row, today)
          if (!stamped || typeof stamped !== "object") return stamped
          const obj = stamped as Record<string, unknown>
          if (r.name === "stablecoins" && obj.is_stablecoin !== false) obj.is_stablecoin = true
          return obj
        }),
      )
      rawOutput = results.map((r) => ({ sweep: r.name, error: r.error ?? null, text: r.rawText }))
      notes.push(...failedSweeps.map((r) => `sweep ${r.name} failed: ${r.error}`))
    }

    const { valid, rejected } = validateCampaignBatch({
      producer: PRODUCER_RESEARCH,
      campaigns: merged,
    })
    const deduped = dedupeCampaigns(valid)
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
