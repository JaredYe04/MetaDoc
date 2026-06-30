-- Daily reconciliation audit trail (Steam GetReport vs D1)
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  period_start_unix INTEGER NOT NULL,
  period_end_unix INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '{}',
  email_sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_created ON reconciliation_runs(created_at DESC);
