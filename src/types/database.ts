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

// ─── Interest Positions (Component 16) ──────────────────────────────
//
// Per-user notes on what is committed somewhere to earn a return. The mirror
// image of `campaigns`: a campaign is a global claim that an offer exists, a
// position is the user's private note that they took it — so this table has a
// user_id, real FKs into the user's own catalog, and a client write path.
//
// Informational only: a row here creates no transaction and changes no holding,
// balance or P&L figure. Status (flexible/active/ends soon/expired) is derived
// from `expires_at` at read time and deliberately not stored.

export interface InterestPosition {
  id: string;
  user_id: string;
  asset_id: string;
  platform_id: string;
  /** How much of the asset is committed, in the asset's own unit. Never
   *  reconciled against the holding's balance — see Component 16's spec. */
  quantity: number;
  /** Percent per year, e.g. 5.25. Null when the program has no quoted rate. */
  apr: number | null;
  /** Null iff `apr` is null. */
  apr_kind: AprKind | null;
  /** Program name the user recognises it by ("OKX TR fixed 105d"). */
  label: string | null;
  /** YYYY-MM-DD. */
  started_at: string;
  /** YYYY-MM-DD; null = flexible (never expires, never warns). */
  expires_at: string | null;
  /** Optional provenance when captured from a campaign card. Allowed to go
   *  stale — campaign rows are replaced by every research run (SET NULL). */
  campaign_id: string | null;
  note: string | null;
  /** Soft archive: closed positions leave every default list and stop warning. */
  is_closed: boolean;
  created_at: string;
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

// `quantity` and `apr` are both numeric columns, so both accept a
// BigNumber.toFixed() string on write. is_closed is optional on insert: the
// column defaults to false and a position is only ever archived later, by
// closeInterestPosition.
type InterestPositionNumerics = {
  quantity: number | string;
  apr: number | string | null;
};

export type InterestPositionInsert = Omit<
  InterestPosition,
  "id" | "quantity" | "apr" | "is_closed" | "created_at"
> &
  InterestPositionNumerics & {
    is_closed?: boolean;
  };

export type InterestPositionUpdate = Partial<
  Omit<
    InterestPosition,
    "id" | "user_id" | "quantity" | "apr" | "created_at"
  > &
    InterestPositionNumerics
>;

// ─── Vehicle (Component 17) ─────────────────────────────────────────
// Informational only: no row below ever creates a transaction or changes a
// holding, balance, net worth or P&L figure.

export interface Vehicle {
  id: string;
  user_id: string;
  /** What the owner calls it ("Egea", "the blue one"). */
  name: string;
  plate: string | null;
  make: string | null;
  model: string | null;
  model_year: number | null;

  /** YYYY-MM-DD. */
  purchased_on: string;
  purchase_price: number;
  purchase_currency: string;
  /** Odometer at purchase — a used car does not start at zero. */
  purchase_odometer: number;

  /** Hand-entered market value; the three fields are all-or-nothing (there is
   *  no free Turkish valuation API — see the component's constants). */
  current_value: number | null;
  current_value_currency: string | null;
  /** YYYY-MM-DD. */
  current_value_at: string | null;

  /** The latest standalone odometer reading; all-or-nothing with its date. */
  odometer: number | null;
  /** YYYY-MM-DD. */
  odometer_at: string | null;

  note: string | null;
  /** Soft archive for a sold car. Reversible — nothing was ever booked. */
  is_active: boolean;
  created_at: string;
}

export interface VehicleMaintenanceItem {
  id: string;
  user_id: string;
  vehicle_id: string;
  name: string;
  /** Which part of the plan this belongs to — a `MaintenanceGroup`. Distinct
   *  from a cost entry's `category`: that says what an outlay was for, this
   *  says what kind of item it is. */
  item_group: string;
  /** What happens at the interval — a `MaintenanceKind`. `service` (replaced,
   *  renewed, paid, performed) or `inspect` (looked at). Wording only; the due
   *  point is computed identically. */
  item_kind: string;
  /** The cost category whose outlays close this item without being asked
   *  (a `VehicleCostCategory`). Null = only ever ticked by hand, which is
   *  every real maintenance item. */
  cost_category: string | null;
  /** Null = distance is not tracked for this item. */
  interval_km: number | null;
  /** Null = time is not tracked. Both null = dormant, never becomes due. */
  interval_months: number | null;
  sort_order: number;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VehicleCostEntry {
  id: string;
  user_id: string;
  vehicle_id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** A `VehicleCostCategory` — see lib/constants/vehicle. */
  category: string;
  /** Null = "work done, price not recorded". Contributes nothing to any total
   *  and is NOT zero; it still resets whatever items the row closes. */
  amount: number | null;
  currency: string;
  /** Optional reading; every one sharpens the projected due dates. */
  odometer: number | null;
  /** Fuel rows only — needed to measure consumption full-tank to full-tank. */
  litres: number | null;
  is_full_tank: boolean;
  note: string | null;
  created_at: string;
  /**
   * The maintenance items this entry closed, flattened from
   * `vehicle_cost_entry_items` by the query layer so the pure schedule engine
   * takes one array instead of a join. Always present (empty when the entry
   * closed nothing).
   */
  item_ids: string[];
}

// Numeric columns are written as BigNumber `toFixed()` strings to preserve
// precision, so every write type widens them — the same hand-synced pattern
// the transaction and interest writes use.
type VehicleNumerics = {
  purchase_price: number | string;
  purchase_odometer: number | string;
  current_value: number | string | null;
  odometer: number | string | null;
};

export type VehicleInsert = Omit<
  Vehicle,
  | "id"
  | "purchase_price"
  | "purchase_odometer"
  | "current_value"
  | "odometer"
  | "is_active"
  | "created_at"
> &
  VehicleNumerics & { is_active?: boolean };

export type VehicleUpdate = Partial<
  Omit<
    Vehicle,
    | "id"
    | "user_id"
    | "purchase_price"
    | "purchase_odometer"
    | "current_value"
    | "odometer"
    | "created_at"
  > &
    VehicleNumerics
>;

type VehicleCostEntryNumerics = {
  amount: number | string | null;
  odometer: number | string | null;
  litres: number | string | null;
};

/** `item_ids` is not a column — the query layer writes it to the join table. */
export type VehicleCostEntryInsert = Omit<
  VehicleCostEntry,
  | "id"
  | "amount"
  | "odometer"
  | "litres"
  | "is_full_tank"
  | "created_at"
  | "item_ids"
> &
  VehicleCostEntryNumerics & { is_full_tank?: boolean };

export type VehicleCostEntryUpdate = Partial<
  Omit<
    VehicleCostEntry,
    | "id"
    | "user_id"
    | "amount"
    | "odometer"
    | "litres"
    | "created_at"
    | "item_ids"
  > &
    VehicleCostEntryNumerics
>;

type VehicleMaintenanceItemNumerics = {
  interval_km: number | string | null;
  interval_months: number | string | null;
};

export type VehicleMaintenanceItemInsert = Omit<
  VehicleMaintenanceItem,
  | "id"
  | "interval_km"
  | "interval_months"
  | "sort_order"
  | "is_active"
  | "item_group"
  | "item_kind"
  | "cost_category"
  | "created_at"
> &
  VehicleMaintenanceItemNumerics & {
    sort_order?: number;
    is_active?: boolean;
    item_group?: string;
    item_kind?: string;
    cost_category?: string | null;
  };

export type VehicleMaintenanceItemUpdate = Partial<
  Omit<
    VehicleMaintenanceItem,
    "id" | "user_id" | "interval_km" | "interval_months" | "created_at"
  > &
    VehicleMaintenanceItemNumerics
>;
