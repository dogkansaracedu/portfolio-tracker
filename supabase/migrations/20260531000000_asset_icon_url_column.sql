-- icon_url: optional manual override for an asset's logo. When null, the client
-- resolves a logo deterministically from ticker + category (US/BIST stock logo
-- repos served via jsDelivr) and falls back to a monogram. Purely additive —
-- nothing requires it, and existing rows keep auto-resolution behaviour.
alter table public.assets add column if not exists icon_url text;
