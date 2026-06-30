-- Store (Inventory Item Store) purchases → credits grants (idempotent)
CREATE TABLE IF NOT EXISTS store_sales_grants (
  id TEXT PRIMARY KEY NOT NULL,
  steam_id TEXT NOT NULL,
  trans_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  report_type TEXT NOT NULL,
  report_timecreated TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (steam_id) REFERENCES users(steam_id)
);

CREATE INDEX IF NOT EXISTS idx_store_sales_grants_steam_created
  ON store_sales_grants(steam_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_sales_grants_trans
  ON store_sales_grants(trans_id);

