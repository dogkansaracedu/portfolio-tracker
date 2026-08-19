/**
 * Component 16 — Interest Positions. The status vocabulary, the status tones,
 * and every user-visible literal the four surfaces render (no copy inlined in
 * components).
 *
 * The "ends soon" horizon is imported from the campaigns constants rather than
 * restated: "ends soon" must mean one thing across the app, so there is exactly
 * one 7 in the codebase.
 */

import { DEADLINE_SOON_DAYS, type AprKind } from "@/lib/constants/campaigns"

/** Re-exported so interest code doesn't reach into the campaigns module for a
 *  vocabulary the two components genuinely share (fixed / variable / up to). */
export type { AprKind }

// ─── Status ladder ──────────────────────────────────────────────────

export const INTEREST_STATUS = {
  flexible: "flexible",
  active: "active",
  ends_soon: "ends_soon",
  expired: "expired",
} as const

export type InterestStatus =
  (typeof INTEREST_STATUS)[keyof typeof INTEREST_STATUS]

/**
 * Display order: expired first, then ends-soon, then active, flexible last.
 * Also the badge's "loudest status wins" ranking.
 */
export const INTEREST_STATUS_RANK: Record<InterestStatus, number> = {
  expired: 0,
  ends_soon: 1,
  active: 2,
  flexible: 3,
}

/** The two statuses that warn on the dashboard. */
export const INTEREST_WARNING_STATUSES: readonly InterestStatus[] = [
  INTEREST_STATUS.expired,
  INTEREST_STATUS.ends_soon,
]

/** The horizon "ends soon" uses — the same one a campaign deadline uses. */
export const INTEREST_ENDS_SOON_DAYS = DEADLINE_SOON_DAYS

/** Days in a year for the prorated term estimate. */
export const INTEREST_DAYS_PER_YEAR = 365

// ─── Status tones ───────────────────────────────────────────────────
//
// These are STATUS colors, not the gain/loss palette: an interest position is
// neither a gain nor a loss, and the row's own return figure owns that meaning.
// Never route these through `gainLossClass`. Amber matches the campaigns
// staleness banner.

export const INTEREST_STATUS_CLASSES: Record<InterestStatus, string> = {
  expired: "border-red-500/40 text-red-600 dark:text-red-400",
  ends_soon: "border-amber-500/40 text-amber-700 dark:text-amber-300",
  active: "border-border text-muted-foreground",
  flexible: "border-border text-muted-foreground",
}

/** Banner tones for the two warning levels on the dashboard. */
export const INTEREST_ALERT_CLASSES = {
  expired:
    "border-red-500/40 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
  ends_soon:
    "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
} as const

// ─── Storage / routing ──────────────────────────────────────────────

export const INTEREST_POSITIONS_TABLE = "interest_positions"

/** Where the surfaces link to. Positions have no page of their own — the asset
 *  detail page is their home and the campaigns page is where they're captured. */
export const INTEREST_ROUTE = {
  assetDetail: (assetId: string) => `/assets/${assetId}`,
  campaigns: "/campaigns",
} as const

/** Session-scoped dismissal flag for the dashboard banners (sessionStorage:
 *  survives navigation, dies with the tab — a nudge, not a task list). */
export const INTEREST_ALERT_DISMISS_KEY = "interest-alerts-dismissed"

/** How many positions a banner names before it summarizes the rest. */
export const INTEREST_ALERT_NAMED_LIMIT = 3

// ─── Form options ───────────────────────────────────────────────────

export const INTEREST_APR_KIND_OPTIONS: ReadonlyArray<{
  value: AprKind
  label: string
}> = [
  { value: "fixed", label: "Fixed" },
  { value: "variable", label: "Variable" },
  { value: "up_to", label: "Up to" },
]

// ─── Copy ───────────────────────────────────────────────────────────

/** Every user-visible string Component 16 renders. */
export const INTEREST_COPY = {
  statusLabels: {
    flexible: "Flexible",
    active: "Active",
    ends_soon: "Ends soon",
    expired: "Expired",
  } as Record<InterestStatus, string>,

  // Portfolio row badge
  badgeAriaPrefix: "Earning",
  badgeNoRate: "Earning",
  badgeTooltipMorePrefix: "+",
  badgeTooltipMoreSuffix: " more",

  // Asset detail section
  sectionTitle: "Earning",
  sectionDescription:
    "What you have committed on a platform to earn a return. Notes only — nothing here touches your balance or P&L.",
  addPosition: "Add position",
  emptyText: "Nothing of this asset is earning right now.",
  showClosedPrefix: "Show",
  showClosedSuffix: "closed",
  hideClosed: "Hide closed",
  closedBadge: "Closed",
  edit: "Edit",
  close: "Close",
  reopen: "Reopen",
  delete: "Delete",
  deleteConfirm: "Delete this position? The note is gone for good.",
  quantityLabel: "Committed",
  platformLabel: "on",
  termFlexible: "Flexible — no end date",
  termSeparator: " → ",
  noRate: "No recorded rate",
  estimatePrefix: "≈ ",
  estimateYearSuffix: "/yr",
  estimateTermPrefix: "≈ ",
  estimateTermSuffix: " over the term",
  campaignLinkPrefix: "The latest campaign research has live offers for",
  campaignLinkAction: "See campaigns",
  loadFailedPrefix: "Couldn't load interest positions",
  saveFailedPrefix: "Couldn't save this position",

  // Campaigns page
  track: "Track",
  trackAria: "Track this campaign as an interest position",

  // Dashboard banners
  alertExpiredTitle: "Positions that have ended",
  alertEndsSoonTitle: "Positions ending soon",
  alertAndMorePrefix: "and ",
  alertAndMoreSuffix: " more",
  alertDismiss: "Dismiss",
  expiredPhrasePrefix: "expired ",
  expiredPhraseSuffix: " ago",
  endsPhrasePrefix: "ends in ",
  endsTodayPhrase: "ends today",
  daysLeftSuffix: " left",
  dayUnit: "day",
  daysUnit: "days",
  alertSentencePrefix: "Your ",
  alertSentenceMiddle: " position on ",

  // Dialog
  dialogAddTitle: "Add interest position",
  dialogEditTitle: "Edit interest position",
  dialogDescription:
    "A note that this much of an asset is committed somewhere to earn a return. It never creates a transaction and never changes a balance.",
  fieldAsset: "Asset",
  fieldAssetPlaceholder: "Select an asset",
  fieldPlatform: "Platform",
  fieldPlatformPlaceholder: "Select a platform",
  fieldQuantity: "Quantity",
  fieldQuantityHint: "How much of the asset is committed, in its own unit.",
  fieldApr: "Rate (% per year)",
  fieldAprHint: "Leave blank for a program with no quantified rate.",
  fieldAprKind: "Rate kind",
  fieldLabel: "Program name",
  fieldLabelPlaceholder: 'e.g. "OKX TR fixed 105d"',
  fieldStartedAt: "Start date",
  fieldExpiresAt: "End date",
  fieldExpiresAtHint: "Leave blank for a flexible program that never expires.",
  fieldNote: "Note",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  errorAssetRequired: "Pick an asset",
  errorPlatformRequired: "Pick a platform",
  errorQuantityRequired: "Enter a quantity greater than zero",
  errorAprInvalid: "Rate must be a number",
  errorEndBeforeStart: "The end date can't be before the start date",
} as const
