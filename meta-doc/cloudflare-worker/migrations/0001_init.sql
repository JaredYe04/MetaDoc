-- Users & billing (Steam ID as text)
CREATE TABLE IF NOT EXISTS users (
  steam_id TEXT PRIMARY KEY NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS credit_freezes (
  id TEXT PRIMARY KEY NOT NULL,
  steam_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (steam_id) REFERENCES users(steam_id)
);

CREATE TABLE IF NOT EXISTS mtx_orders (
  order_id TEXT PRIMARY KEY NOT NULL,
  steam_id TEXT NOT NULL,
  item_id TEXT,
  status TEXT,
  amount_cents INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_freezes_steam ON credit_freezes(steam_id);
CREATE INDEX IF NOT EXISTS idx_mtx_steam ON mtx_orders(steam_id);
