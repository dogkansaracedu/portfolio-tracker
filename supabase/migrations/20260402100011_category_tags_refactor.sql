-- Refactor: replace rigid asset_category enum + single asset_group
-- with free-form category text + multi-value tags text[] + price_source text.

-- 1. Convert category from enum to plain text
ALTER TABLE public.assets ALTER COLUMN category TYPE text;

-- 2. Drop the old asset_group column
ALTER TABLE public.assets DROP COLUMN IF EXISTS asset_group;

-- 3. Add tags array and price_source
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS price_source text DEFAULT 'manual';

-- 4. GIN index for fast ANY() queries on tags
CREATE INDEX IF NOT EXISTS idx_assets_tags ON public.assets USING GIN(tags);

-- 5. Drop the enum type (no longer referenced)
DROP TYPE IF EXISTS public.asset_category;
