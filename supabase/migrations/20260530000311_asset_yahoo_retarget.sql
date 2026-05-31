-- BREAKING — apply ONLY together with the frontend + edge-function deploy that
-- reads price_id. Until that code is live, the running app still looks prices
-- up by the OLD ticker, so applying this early makes crypto show unpriced.
--
-- Retargets crypto + tokenized gold to Yahoo symbols (fills the 2024-2025
-- snapshot gap; Yahoo has multi-year daily history for all four — verified),
-- renames the stablecoins for display only, and re-keys price_cache to the new
-- price_id values so client lookups hit immediately (no unpriced window).

update public.assets set ticker = 'BTC',  price_id = 'BTC-USD',  price_source = 'yahoo' where ticker = 'bitcoin';
update public.assets set ticker = 'ETH',  price_id = 'ETH-USD',  price_source = 'yahoo' where ticker = 'ethereum';
update public.assets set ticker = 'PAXG', price_id = 'PAXG-USD', price_source = 'yahoo' where ticker = 'pax-gold';
update public.assets set ticker = 'XAUT', price_id = 'XAUT-USD', price_source = 'yahoo' where ticker = 'tether-gold';

-- Stablecoins: display rename only. Keep CoinGecko source + the $1 backfill
-- hardcode; price_id stays the CoinGecko id so the hardcode keys still match.
update public.assets set ticker = 'USDT' where ticker = 'tether';
update public.assets set ticker = 'USDC' where ticker = 'usd-coin';

update public.price_cache set ticker = 'BTC-USD'  where ticker = 'bitcoin';
update public.price_cache set ticker = 'ETH-USD'  where ticker = 'ethereum';
update public.price_cache set ticker = 'PAXG-USD' where ticker = 'pax-gold';
update public.price_cache set ticker = 'XAUT-USD' where ticker = 'tether-gold';
