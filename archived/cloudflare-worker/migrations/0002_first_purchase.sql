-- 首购额度发放幂等（见 docs/economics-first-purchase.md）
CREATE TABLE IF NOT EXISTS first_purchase_grants (
  steam_id TEXT PRIMARY KEY NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
