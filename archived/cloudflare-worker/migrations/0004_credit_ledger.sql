-- Append-only credit ledger for Steam cloud billing UI
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  steam_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  kind TEXT NOT NULL,
  delta_credits INTEGER NOT NULL,
  balance_after INTEGER,
  meta TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (steam_id) REFERENCES users(steam_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_steam_created ON credit_ledger(steam_id, created_at DESC, id DESC);
