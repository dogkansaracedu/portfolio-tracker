-- Create transactions table

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  date timestamptz NOT NULL,
  amount numeric NOT NULL,
  unit_price numeric NOT NULL,
  price_currency text NOT NULL DEFAULT 'USD',
  total_cost numeric NOT NULL,
  fee numeric DEFAULT 0,
  fee_currency text,
  related_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transactions_user_asset_date ON public.transactions(user_id, asset_id, date);
CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, date);
