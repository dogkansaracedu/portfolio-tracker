-- Dedicated type for taxes charged to a cash account (e.g. Midas' monthly
-- money-market-fund stopaj). Semantics: subtracts from the fiat balance like a
-- withdrawal, but is NOT an external flow — the P&L engine leaves net invested
-- untouched so the charge surfaces as a real loss, and the return engines
-- (XIRR/TWR) absorb it as performance rather than a cash flow.
alter type public.transaction_type add value if not exists 'tax';
