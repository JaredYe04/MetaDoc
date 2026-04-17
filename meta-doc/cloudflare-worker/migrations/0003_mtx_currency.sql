-- InitTxn 记录的货币，Finalize 入账时与 amount_cents 一起换算 USD 等价
ALTER TABLE mtx_orders ADD COLUMN currency TEXT DEFAULT 'USD';
