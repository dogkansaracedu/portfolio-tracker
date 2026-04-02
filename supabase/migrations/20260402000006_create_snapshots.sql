-- Create snapshots table

CREATE TABLE public.snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_usd numeric,
  total_try numeric,
  breakdown jsonb,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT uq_snapshots_user_date UNIQUE (user_id, snapshot_date)
);
