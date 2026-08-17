import type { StoredRetirementScenarioInputs } from "@/lib/retirement/scenario";
import type {
  AprKind,
  CampaignProgramType,
  CampaignRunStatus,
} from "@/lib/constants/campaigns";

// ─── Enum Union Types ───────────────────────────────────────────────

export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "dividend"
  | "interest"
  | "fee"
  | "tax"
  | "cash_credit"
  | "cash_debit";

// ─── Table Row Interfaces ───────────────────────────────────────────

export interface Platform {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

/** Global asset — one row per ticker per user. No platform association. */
export interface Asset {
  id: string;
  user_id: string;
  category: string;
  ticker: string;
  /** Provider-specific identifier used to FETCH prices (e.g. "BTC-USD" for a
   *  crypto on Yahoo, "THYAO.IS" for a BIST stock). Display uses `ticker`.
   *  Fetch sites read `price_id ?? ticker`, so a null behaves like the old
   *  ticker-as-key. */
  price_id: string | null;
  /** Optional manual logo override. When null, the client resolves a logo from
   *  ticker + category and falls back to a monogram. See lib/assetIcons. */
  icon_url: string | null;
  name: string;
  tags: string[];
  price_source: string;
  is_currency: boolean;
  is_active: boolean;
  /** Fixed at-source withholding rate on this asset's gains (e.g. 0.175 for a
   *  Turkish PPF). When set, the engine reports the gain net of it. Null = no
   *  at-source tax (gross behaviour). See lib/pnl/portfolio taxAccrualUsd. */
  at_source_tax_rate: number | null;
  created_at: string;
  updated_at: string;
}

/** Per-platform balance for a global asset. */
export interface Holding {
  id: string;
  user_id: string;
  asset_id: string;
  platform_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  asset_id: string;
  platform_id: string;
  type: TransactionType;
  date: string;
  amount: number;
  unit_price: number;
  price_currency: string;
  total_cost: number;
  fee: number;
  fee_currency: string | null;
  related_asset_id: string | null;
  linked_tx_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface PriceCache {
  ticker: string;
  price_usd: number | null;
  price_try: number | null;
  source: string | null;
  updated_at: string;
}

export interface Snapshot {
  id: string;
  user_id: string;
  snapshot_date: string;
  total_usd: number | null;
  total_try: number | null;
  breakdown: SnapshotBreakdown | null;
  created_at: string;
}

/** A totals-only intraday point. The hourly cron writes one per hour and prunes
 *  rows older than 24h, so the client only ever sees a rolling ~24h window.
 *  Distinct from `Snapshot`: timestamp-keyed (`captured_at`), no breakdown. */
export interface IntradaySnapshot {
  id: string;
  user_id: string;
  captured_at: string;
  total_usd: number | null;
  total_try: number | null;
}

export interface ExchangeRate {
  date: string;
  source: string;
  usd_try: number | null;
  eur_try: number | null;
  eur_usd: number | null;
  gold_gram_try: number | null;
}

export interface BenchmarkPrice {
  ticker: string;
  date: string;
  close_usd: number;
  updated_at: string;
}

/** A named, per-user retirement planning input set (Component 13). The planner
 *  stores inputs only — every projection is recomputed from them. At most one
 *  row per user has `is_default` (enforced by a partial unique index).
 *  A stored row can predate an input, so `inputs` is the STORED shape: pass it
 *  through `normalizeScenarioInputs` before the engine or the UI reads it. */
export interface RetirementScenario {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  inputs: StoredRetirementScenarioInputs;
  created_at: string;
  updated_at: string;
}

// ─── Budgeting (Component 14) ───────────────────────────────────────
//
// Budgeting rows never touch holdings, balances, or P&L — the page derives
// "invested" from portfolio transactions and stores only income-side facts.

/** `expense` is reserved for the future expense ledger; the DB CHECK only
 *  accepts `income` today — widen both together. */
export type CashflowEntryType = "income";

/** One income event (a salary payment, a bonus). */
export interface CashflowEntry {
  id: string;
  user_id: string;
  date: string;
  type: CashflowEntryType;
  amount: number;
  currency: string;
  note: string | null;
  created_at: string;
}

/** Salary schedule row: the latest `effective_from` ≤ a month supplies that
 *  month's default income when it has no explicit entry. `effective_from` is
 *  always the first of a month (DB CHECK). */
export interface IncomeDefault {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  effective_from: string;
  created_at: string;
}

/** Plan-vs-actual target (storage shipped ahead of the feature; unread today). */
export interface BudgetTarget {
  id: string;
  user_id: string;
  monthly_invest_target: number;
  spend_ceiling: number | null;
  currency: string;
  effective_from: string;
  created_at: string;
}

// ─── Campaigns (Component 15) ───────────────────────────────────────
//
// Global, service-written tables (same shape of trust as `price_cache`): a
// research run produces a batch of campaign rows and the app always reads the
// latest successful run. Rows carry intrinsic facts only — personalization
// happens at read time by intersecting `asset_ticker` with what the user holds.
// No user_id anywhere, and no client write path.

/** One automated research pass. A failed run leaves the previous run's rows
 *  untouched; "latest run" = greatest `ran_at` with `status = 'success'`. */
export interface CampaignResearchRun {
  id: string;
  ran_at: string;
  producer: string;
  model: string | null;
  status: CampaignRunStatus;
  /** Model-written prose: what changed since the previous run. */
  summary: string | null;
  /** Per-row validation rejects, kept for debugging. */
  rejected_rows: unknown;
  /** Raw producer output, kept for debugging. */
  raw_output: unknown;
}

/** One earn/reward opportunity on one platform, as found on the public web.
 *  `asset_ticker` is free text (upper-cased on ingest) and may not exist in the
 *  asset catalog — always join by ticker string, never by asset id.
 *  A row carries `apr` OR `reward_description` (or both), never neither. */
export interface Campaign {
  id: string;
  run_id: string;
  asset_ticker: string;
  platform: string;
  program_type: CampaignProgramType;
  /** Percent, e.g. 3.8. Null when the reward is prose-only. */
  apr: number | null;
  /** Null iff `apr` is null. */
  apr_kind: AprKind | null;
  reward_description: string | null;
  /** Null or 0 = flexible. */
  lock_days: number | null;
  min_amount: number | null;
  max_amount: number | null;
  /** Currency/unit of `min_amount` / `max_amount` (e.g. 'USDT', 'ETH'). */
  amount_currency: string | null;
  conditions: string | null;
  /** YYYY-MM-DD; null = open-ended. */
  deadline: string | null;
  is_stablecoin: boolean;
  source_url: string;
  /** YYYY-MM-DD the research found this row. */
  fetched_at: string;
}

// ─── Snapshot Breakdown Shape ───────────────────────────────────────
//
// The snapshot's `breakdown` is the authoritative aggregation of a portfolio's
// state at a moment in time. The frontend reads from here for every dashboard
// number — never re-derives from `holdings + price_cache`. That keeps a single
// source of truth and prevents the kind of drift that produced the
// "+$515.26 vs +$1,691.76" gap fixed in commit 3a3cc45.

export interface SnapshotBreakdown {
  rates: {
    usd_try: number;
    eur_try: number;
    gold_gram_try: number;
  };
  by_category: Record<string, { usd: number; try: number; pct: number }>;
  by_platform: Record<
    string,
    { usd: number; try: number; color: string; pct: number }
  >;
  by_tag: Record<string, { usd: number; try: number; pct: number }>;
  by_asset: Array<{
    ticker: string;
    name: string;
    platform: string;
    amount: number;
    price_usd: number;
    value_usd: number;
    value_try: number;
  }>;
}

// ─── Insert / Update helpers ────────────────────────────────────────
//
// Postgres `numeric` columns accept strings to preserve precision beyond
// JS Number (15-17 sig figs). Writes use BigNumber.toFixed() strings;
// reads come back as Number via supabase-js.

export type PlatformInsert = Omit<Platform, "id" | "created_at">;
export type PlatformUpdate = Partial<Omit<Platform, "id" | "user_id" | "created_at">>;

// price_id is optional on insert: when omitted, fetch sites fall back to
// `price_id ?? ticker`, so a new asset behaves like the old ticker-as-key.
export type AssetInsert = Omit<
  Asset,
  "id" | "created_at" | "updated_at" | "price_id" | "icon_url" | "at_source_tax_rate"
> & {
  price_id?: string | null;
  icon_url?: string | null;
  at_source_tax_rate?: number | null;
};
export type AssetUpdate = Partial<Omit<Asset, "id" | "user_id" | "created_at" | "updated_at">>;

export type HoldingInsert = Omit<Holding, "id" | "balance" | "created_at" | "updated_at"> & {
  balance: number | string;
};
export type HoldingUpdate = Partial<Omit<Holding, "id" | "user_id" | "balance" | "created_at" | "updated_at"> & {
  balance: number | string;
}>;

export type TransactionInsert = Omit<Transaction, "id" | "created_at">;
export type TransactionUpdate = Partial<Omit<Transaction, "id" | "user_id" | "created_at">>;

export type SnapshotInsert = Omit<Snapshot, "id" | "total_usd" | "total_try" | "created_at"> & {
  total_usd: number | string | null;
  total_try: number | string | null;
};

// is_default is optional on insert: the column defaults to false, and the
// "exactly one default" invariant is moved by setDefaultRetirementScenario.
export type RetirementScenarioInsert = Omit<
  RetirementScenario,
  "id" | "is_default" | "created_at" | "updated_at"
> & {
  is_default?: boolean;
};
export type RetirementScenarioUpdate = Partial<
  Omit<RetirementScenario, "id" | "user_id" | "created_at" | "updated_at">
>;

export type CashflowEntryInsert = Omit<CashflowEntry, "id" | "created_at"> & {
  amount: number | string;
};
export type CashflowEntryUpdate = Partial<
  Omit<CashflowEntry, "id" | "user_id" | "created_at"> & { amount: number | string }
>;

export type IncomeDefaultInsert = Omit<IncomeDefault, "id" | "created_at"> & {
  amount: number | string;
};
export type IncomeDefaultUpdate = Partial<
  Omit<IncomeDefault, "id" | "user_id" | "created_at"> & { amount: number | string }
>;
