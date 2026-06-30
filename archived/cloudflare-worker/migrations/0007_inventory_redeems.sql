-- Inventory card redeem state machine (idempotent / atomic grant)
CREATE TABLE IF NOT EXISTS inventory_redeems (
  id TEXT PRIMARY KEY NOT NULL,
  steam_id TEXT NOT NULL,
  item_instance_id TEXT NOT NULL,
  itemdefid TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  consume_requestid TEXT,
  status TEXT NOT NULL, -- pending | consumed | granting | granted | failed
  credits_added INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (steam_id) REFERENCES users(steam_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_redeems_steam_item
  ON inventory_redeems(steam_id, item_instance_id);
CREATE INDEX IF NOT EXISTS idx_inventory_redeems_steam_created
  ON inventory_redeems(steam_id, created_at DESC);

