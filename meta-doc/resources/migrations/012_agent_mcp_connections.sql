-- MCP 连接配置（多地址、切换当前、持久化）

CREATE TABLE IF NOT EXISTS agent_mcp_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_mcp_connections_active ON agent_mcp_connections(is_active);
