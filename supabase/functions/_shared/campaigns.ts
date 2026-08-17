/** Campaign ingestion contract (Component 15) — the one place that defines
 *  what a campaign row is, which platforms research grounds on, and what a
 *  valid batch looks like.
 *
 *  MUST stay dependency-free: it is loaded by Deno (edge functions) and by
 *  Vitest/tsc from `src/` (see src/lib/campaign-validation.test.ts). No
 *  imports, no Deno globals, no npm. */

/** The closed vocabulary of program types. Rows outside it are rejected —
 *  the UI keys its labels off exactly these values. */
export const CAMPAIGN_PROGRAM_TYPES = [
  "flexible_earn",
  "locked_earn",
  "staking",
  "launchpool",
  "hold_to_earn",
  "promo",
  "airdrop",
] as const

export type CampaignProgramType = (typeof CAMPAIGN_PROGRAM_TYPES)[number]

/** How to read the quoted rate: a contractual rate, a floating one, or a
 *  marketing ceiling ("up to 12%"). Required whenever `apr` is present. */
export const APR_KINDS = ["fixed", "variable", "up_to"] as const

export type AprKind = (typeof APR_KINDS)[number]

/** Sanity bounds on a quoted rate (percent). Rates are claims found on the
 *  web, not guarantees — this bound is the only automated defense against a
 *  hallucinated or mis-parsed number; the source link is the user's. */
export const APR_MIN_EXCLUSIVE = 0
export const APR_MAX = 1000

/** Rates are stored to 4 dp — more precision than any platform publishes,
 *  less than a float's noise tail. */
export const APR_DECIMALS = 4

/** Kinds of watch-list source. Each behaves differently: TR entities are
 *  under SPK's rules, global exchanges are country-gated per campaign,
 *  wallets are self-custodial, defi has no operator at all, and the
 *  regulator entry produces news rather than campaigns. */
export const PLATFORM_KINDS = [
  "cex-global",
  "cex-turkey",
  "wallet",
  "defi",
  "regulator",
] as const

export type PlatformKind = (typeof PLATFORM_KINDS)[number]

export interface WatchListEntry {
  /** Display name as it should appear in a campaign row's `platform`. */
  platform: string
  kind: PlatformKind
  /** Canonical URL(s) the research prompt grounds its search on. */
  groundUrl: string
  /** Trust / eligibility caveat the research must carry into the row's
   *  conditions when it applies. Fed verbatim into the prompt. */
  flag: string
}

/** Researched 2026-08-17 (Turkey accessibility + trust verified with sources);
 *  ordered by usefulness. Backend truth — it scopes the research prompt; the
 *  UI never reads it. Excluded on purpose (don't re-add without new evidence):
 *  Coinbase (unavailable in Turkey), Gate (Turkey restricted), Bitexen (no earn
 *  product), KuCoin TR (earn scope unclear, second-tier trust). */
export const PLATFORM_WATCH_LIST: readonly WatchListEntry[] = [
  {
    platform: "Binance (global) — Launchpool / HODLer Airdrops / Megadrop",
    kind: "cex-global",
    groundUrl: "binance.com/en/launchpool + /en/support/announcement",
    flag:
      "Per-campaign Turkey eligibility — each announcement's country list must be checked; TRY services removed but accounts/withdrawals work",
  },
  {
    platform: "OKX TR — Earn + campaigns",
    kind: "cex-turkey",
    groundUrl: "tr.okx.com/en/earn",
    flag: "SPK-listed",
  },
  {
    platform: "Binance TR — Staking (\"Biriktir\")",
    kind: "cex-turkey",
    groundUrl: "binance.tr/tr/blog",
    flag: "SPK-listed, ~180 earn assets",
  },
  {
    platform: "Paribu — Staking",
    kind: "cex-turkey",
    groundUrl: "paribu.com/blog/en/news/",
    flag: "SPK-listed; flexible + fixed, incl. TRY-balance rewards",
  },
  {
    platform: "Midas Kripto — liquid staking + promos",
    kind: "cex-turkey",
    groundUrl: "getmidas.com/midas-kripto/",
    flag: "User's own platform; USDT \"staking\" is lending-like — SPK risk",
  },
  {
    platform: "Trust Wallet — Launchpool + staking",
    kind: "wallet",
    groundUrl: "trustwallet.com/blog/announcements",
    flag: "Self-custodial hold-to-earn token farms",
  },
  {
    platform: "Bybit (global + TR) — Earn / Launchpool",
    kind: "cex-global",
    groundUrl: "bybit.com/en/earn/home + announcements.bybit.com",
    flag: "Feb-2025 hack (covered) — trust caveat; per-campaign eligibility",
  },
  {
    platform: "Jito — JitoSOL + points seasons",
    kind: "defi",
    groundUrl: "jito.network",
    flag: "Solana LST/airdrop signal",
  },
  {
    platform: "Lido — stETH rate + incentives",
    kind: "defi",
    groundUrl: "lido.fi",
    flag: "ETH LST benchmark",
  },
  {
    platform: "Aave — Merit rewards / rate spikes",
    kind: "defi",
    groundUrl: "app.aave.com",
    flag: "Stablecoin yield benchmark",
  },
  {
    platform: "OKX Web3 Wallet Earn",
    kind: "wallet",
    groundUrl: "web3.okx.com/earn",
    flag: "DeFi campaign aggregator",
  },
  {
    platform: "Icrypex — stake campaigns",
    kind: "cex-turkey",
    groundUrl: "research.icrypex.com/tr/",
    flag: "Secondary local signal",
  },
  {
    platform: "Kraken — staking assets",
    kind: "cex-global",
    groundUrl: "kraken.com/features/staking-coins",
    flag: "Turkey eligibility unconfirmed — verify in-app before acting",
  },
  {
    platform: "BtcTurk — announcements",
    kind: "cex-turkey",
    groundUrl: "kripto.btcturk.com/en/corporate/announcements",
    flag: "No earn product today; watch for launch",
  },
  {
    platform: "SPK press announcements",
    kind: "regulator",
    groundUrl: "spk.gov.tr/duyurular/basin-duyurulari",
    flag:
      "Meta-entry: staking/lending rule changes invalidate TR-entity rows",
  },
]

/** One campaign as a producer emits it, and (after normalization) as it is
 *  written to `campaigns`. Intrinsic facts only — nothing user-specific. */
export interface CampaignInput {
  asset_ticker: string
  platform: string
  program_type: CampaignProgramType
  apr?: number | null
  apr_kind?: AprKind | null
  reward_description?: string | null
  lock_days?: number | null
  min_amount?: number | null
  max_amount?: number | null
  amount_currency?: string | null
  conditions?: string | null
  deadline?: string | null
  is_stablecoin?: boolean
  source_url: string
  fetched_at: string
}

/** The ingestion payload. Vendor-neutral: the scheduled research job is just
 *  the default producer; any producer emitting this shape may push. */
export interface CampaignBatch {
  producer: string
  model?: string | null
  summary?: string | null
  campaigns: CampaignInput[]
}

export interface RejectedRow {
  row: unknown
  reason: string
}

export interface ValidationResult {
  valid: CampaignInput[]
  rejected: RejectedRow[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Trimmed string, or null for anything empty / non-string. Producers vary
 *  between omitting a field, sending null, and sending "" — all mean absent. */
function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Numeric coercion that accepts the string forms models emit ("3.8", "12%").
 *  Returns null for absent, NaN for present-but-unparseable so callers can
 *  tell "no rate" from "garbage rate". */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value.replace("%", "").trim())
  return NaN
}

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals))
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  // Rejects 2026-02-31 and friends: Date normalizes them to another day.
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Validate + normalize one row. Returns the reason string on rejection —
 *  the first failing rule wins, which keeps rejected_rows readable. */
function validateRow(row: unknown): { ok: true; value: CampaignInput } | { ok: false; reason: string } {
  if (!isRecord(row)) return { ok: false, reason: "row is not an object" }

  const ticker = optionalText(row.asset_ticker)
  if (!ticker) return { ok: false, reason: "missing asset_ticker" }

  const platform = optionalText(row.platform)
  if (!platform) return { ok: false, reason: "missing platform" }

  const programType = optionalText(row.program_type)
  if (!programType) return { ok: false, reason: "missing program_type" }
  if (!(CAMPAIGN_PROGRAM_TYPES as readonly string[]).includes(programType)) {
    return { ok: false, reason: `unknown program_type: ${programType}` }
  }

  const sourceUrl = optionalText(row.source_url)
  if (!sourceUrl) return { ok: false, reason: "missing source_url" }
  if (!isHttpUrl(sourceUrl)) {
    return { ok: false, reason: `source_url is not an http(s) URL: ${sourceUrl}` }
  }

  const apr = optionalNumber(row.apr)
  let normalizedApr: number | null = null
  let aprKind: AprKind | null = null
  if (apr !== null) {
    if (!Number.isFinite(apr)) return { ok: false, reason: "apr is not a number" }
    if (apr <= APR_MIN_EXCLUSIVE || apr > APR_MAX) {
      return { ok: false, reason: `apr out of bounds (0, ${APR_MAX}]: ${apr}` }
    }
    const kind = optionalText(row.apr_kind)
    if (!kind || !(APR_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, reason: `apr present without a valid apr_kind: ${kind ?? "missing"}` }
    }
    normalizedApr = roundTo(apr, APR_DECIMALS)
    aprKind = kind as AprKind
  }

  const rewardDescription = optionalText(row.reward_description)
  if (normalizedApr === null && !rewardDescription) {
    return { ok: false, reason: "row has neither apr nor reward_description" }
  }

  const fetchedAt = optionalText(row.fetched_at)
  if (!fetchedAt) return { ok: false, reason: "missing fetched_at" }
  if (!isIsoDate(fetchedAt)) {
    return { ok: false, reason: `fetched_at is not YYYY-MM-DD: ${fetchedAt}` }
  }

  const deadlineRaw = optionalText(row.deadline)
  if (deadlineRaw !== null && !isIsoDate(deadlineRaw)) {
    return { ok: false, reason: `deadline is not YYYY-MM-DD: ${deadlineRaw}` }
  }

  const lockDays = optionalNumber(row.lock_days)
  if (lockDays !== null && !Number.isFinite(lockDays)) {
    return { ok: false, reason: "lock_days is not a number" }
  }

  const minAmount = optionalNumber(row.min_amount)
  if (minAmount !== null && !Number.isFinite(minAmount)) {
    return { ok: false, reason: "min_amount is not a number" }
  }

  const maxAmount = optionalNumber(row.max_amount)
  if (maxAmount !== null && !Number.isFinite(maxAmount)) {
    return { ok: false, reason: "max_amount is not a number" }
  }

  return {
    ok: true,
    value: {
      asset_ticker: ticker.toUpperCase(),
      platform,
      program_type: programType as CampaignProgramType,
      apr: normalizedApr,
      apr_kind: aprKind,
      reward_description: rewardDescription,
      lock_days: lockDays === null ? null : Math.trunc(lockDays),
      min_amount: minAmount,
      max_amount: maxAmount,
      amount_currency: optionalText(row.amount_currency)?.toUpperCase() ?? null,
      conditions: optionalText(row.conditions),
      deadline: deadlineRaw,
      is_stablecoin: row.is_stablecoin === true,
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    },
  }
}

/** Validate a whole batch. Never throws: per-row failures land in `rejected`
 *  (recorded on the run for debugging) and a malformed top-level payload is
 *  simply a batch with zero valid rows — the caller decides that a zero-valid
 *  batch fails outright, leaving the previous run's data untouched. */
export function validateCampaignBatch(payload: unknown): ValidationResult {
  const valid: CampaignInput[] = []
  const rejected: RejectedRow[] = []

  if (!isRecord(payload)) {
    return { valid, rejected: [{ row: payload, reason: "payload is not an object" }] }
  }
  if (!Array.isArray(payload.campaigns)) {
    return { valid, rejected: [{ row: payload.campaigns, reason: "campaigns is not an array" }] }
  }

  for (const row of payload.campaigns) {
    const result = validateRow(row)
    if (result.ok) valid.push(result.value)
    else rejected.push({ row, reason: result.reason })
  }

  return { valid, rejected }
}
