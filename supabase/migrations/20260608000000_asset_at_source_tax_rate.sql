-- at_source_tax_rate: optional fixed withholding rate (e.g. 0.175 = 17.5%) taken
-- AT SOURCE on an asset's gains, like a Turkish para piyasası fonu (PPF). When
-- set, the P&L engine shows the asset's gain net of this rate (an additive
-- tax-accrual overlay; gross figures are unchanged). Null for assets with no
-- at-source tax (US stocks, crypto, …) — those keep gross behaviour.
alter table public.assets add column if not exists at_source_tax_rate numeric;
