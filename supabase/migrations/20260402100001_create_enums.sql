CREATE TYPE public.asset_category AS ENUM (
  'fiat',
  'crypto',
  'stock_bist',
  'stock_us',
  'commodity'
);

CREATE TYPE public.transaction_type AS ENUM (
  'buy',
  'sell',
  'transfer_in',
  'transfer_out',
  'dividend',
  'interest',
  'fee'
);
