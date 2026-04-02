// ─── Enum Union Types ───────────────────────────────────────────────

export type AssetCategory =
  | "fiat"
  | "crypto"
  | "stock_bist"
  | "stock_us"
  | "commodity";

export type TransactionType =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "dividend"
  | "interest"
  | "fee";

// ─── Table Row Interfaces ───────────────────────────────────────────

export interface Platform {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Asset {
  id: string;
  user_id: string;
  platform_id: string;
  category: AssetCategory;
  ticker: string;
  name: string;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  asset_id: string;
  type: TransactionType;
  date: string;
  amount: number;
  unit_price: number;
  price_currency: string;
  total_cost: number;
  fee: number;
  fee_currency: string | null;
  related_asset_id: string | null;
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

// ─── Snapshot Breakdown Shape ───────────────────────────────────────

export interface SnapshotBreakdown {
  rates: {
    usd_try: number;
    eur_try: number;
    gold_gram_try: number;
  };
  by_category: Record<
    AssetCategory,
    { usd: number; try: number; pct: number }
  >;
  by_platform: Record<string, { usd: number; pct: number }>;
  by_asset: Array<{
    ticker: string;
    name: string;
    platform: string;
    amount: number;
    price_usd: number;
    value_usd: number;
  }>;
}

// ─── Insert / Update helpers ────────────────────────────────────────

export type PlatformInsert = Omit<Platform, "id" | "created_at">;
export type PlatformUpdate = Partial<Omit<Platform, "id" | "user_id" | "created_at">>;

export type AssetInsert = Omit<Asset, "id" | "created_at" | "updated_at">;
export type AssetUpdate = Partial<Omit<Asset, "id" | "user_id" | "created_at" | "updated_at">>;

export type TransactionInsert = Omit<Transaction, "id" | "created_at">;
export type TransactionUpdate = Partial<Omit<Transaction, "id" | "user_id" | "created_at">>;

export type SnapshotInsert = Omit<Snapshot, "id" | "created_at">;
