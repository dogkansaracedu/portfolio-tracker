/**
 * Component 15 — Campaigns. UI-side constants: the human labels for the
 * program-type vocabulary, the trust/staleness thresholds from the behavioral
 * spec, and every literal the page renders (no copy inlined in components).
 *
 * The vocabulary itself is backend truth — it lives in
 * `supabase/functions/_shared/campaigns.ts` alongside the validator that
 * enforces it (that module stays dependency-free so Deno loads it too). The
 * unions are re-exported here as *types only*, so nothing from the Deno side
 * reaches the bundle and the two never drift.
 */

import type {
  AprKind,
  CampaignProgramType,
} from "../../../supabase/functions/_shared/campaigns.ts"

export type { AprKind, CampaignProgramType }

// ─── Run status (read side only — the writer sets it) ───────────────

export const CAMPAIGN_RUN_STATUS = {
  success: "success",
  failed: "failed",
} as const

export type CampaignRunStatus =
  (typeof CAMPAIGN_RUN_STATUS)[keyof typeof CAMPAIGN_RUN_STATUS]

/** Human labels for the seven program types. */
export const PROGRAM_TYPE_LABELS: Record<CampaignProgramType, string> = {
  flexible_earn: "Flexible earn",
  locked_earn: "Locked earn",
  staking: "Staking",
  launchpool: "Launchpool",
  hold_to_earn: "Hold to earn",
  promo: "Promo",
  airdrop: "Airdrop",
}

/** How a rate reads once its kind is applied: "up to 12%", "12% variable". */
export const APR_KIND_PREFIX: Record<AprKind, string> = {
  fixed: "",
  variable: "",
  up_to: "up to ",
}

export const APR_KIND_SUFFIX: Record<AprKind, string> = {
  fixed: "",
  variable: " variable",
  up_to: "",
}

// ─── Thresholds (behavioral spec) ───────────────────────────────────

/** A latest successful run older than this many days gets a stale banner. */
export const CAMPAIGN_STALENESS_DAYS = 10

/** A deadline this many days out (or nearer) gets the "ends soon" cue. */
export const DEADLINE_SOON_DAYS = 7

/** Decimals used when *rendering* an APR (the ingest side stores 4). */
export const APR_DISPLAY_DECIMALS = 2

// ─── Tables ─────────────────────────────────────────────────────────

export const CAMPAIGN_RUNS_TABLE = "campaign_research_runs"
export const CAMPAIGNS_TABLE = "campaigns"

// ─── Copy ───────────────────────────────────────────────────────────

/** Every user-visible string on the Campaigns page. */
export const CAMPAIGN_COPY = {
  pageTitle: "Campaigns",
  pageSubtitle:
    "Earn, staking and reward programs found on the public web — where idle coins could sit.",
  navLabel: "Campaigns",
  refresh: "Refresh",
  lastRefreshedPrefix: "Data from",
  stale: `This research is more than ${CAMPAIGN_STALENESS_DAYS} days old — treat every rate as out of date until the next run.`,
  empty: "No campaign data yet — the weekly research hasn't run.",
  emptyHint: "The research pass runs weekly and publishes its findings here.",
  loadFailedPrefix: "Couldn't load campaigns",
  groups: {
    held: {
      title: "You hold these",
      description:
        "Programs for coins already in your portfolio, richest estimate first.",
      emptyText: "No campaigns for the coins you hold right now.",
    },
    stablecoin: {
      title: "Stable value",
      description: "Where parked dollars and gold can earn while they wait.",
      emptyText: "No stable-value campaigns in this run.",
    },
    considering: {
      title: "Worth considering",
      description: "Everything else the research found, highest rate first.",
      emptyText: "Nothing else in this run.",
    },
  },
  estimatePrefix: "≈ ",
  estimateSuffix: "/yr",
  estimateBasisPrefix: "on your ",
  lockFlexible: "Flexible",
  lockLabel: "Lock",
  lockDaysSuffix: "d",
  minLabel: "Min",
  maxLabel: "Max",
  conditionsLabel: "Conditions",
  deadlineLabel: "Ends",
  endsSoon: "Ends soon",
  expired: "Expired",
  sourceLabel: "Source",
  foundOnPrefix: "found on ",
  verifySuffix: " — verify at source before committing funds",
  showExpiredPrefix: "Show",
  showExpiredSuffix: "expired",
  hideExpired: "Hide expired",
  assetFilterPlaceholder: "Filter by asset (e.g. USDT)",
  noRate: "No published rate",
} as const

/** `rel` for the source links — external, untrusted destinations. */
export const EXTERNAL_LINK_REL = "noopener noreferrer"
export const EXTERNAL_LINK_TARGET = "_blank"
