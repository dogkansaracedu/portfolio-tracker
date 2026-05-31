// ─── Enum Union Types ───────────────────────────────────────────────

export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "dividend"
  | "interest"
  | "fee"
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
  "id" | "created_at" | "updated_at" | "price_id" | "icon_url"
> & { price_id?: string | null; icon_url?: string | null };
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
