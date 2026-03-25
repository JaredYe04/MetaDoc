-- Agent: Rules, Skills index, MCP tool registry + embeddings (separate stores, merged at query time in app layer)

CREATE TABLE IF NOT EXISTS agent_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK(scope IN ('system','dynamic')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('draft','pending','approved','rejected')),
  source TEXT NOT NULL DEFAULT 'user' CHECK(source IN ('system','user','agent')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_rules_scope_title ON agent_rules(scope, title);

CREATE TABLE IF NOT EXISTS agent_skills_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_root TEXT NOT NULL,
  skill_folder TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  entry TEXT,
  tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active')),
  skill_md_hash TEXT,
  full_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(workspace_root, skill_folder)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_status ON agent_skills_index(status);

CREATE TABLE IF NOT EXISTS agent_skill_embeddings (
  skill_index_id INTEGER NOT NULL UNIQUE,
  embedding BLOB NOT NULL,
  FOREIGN KEY (skill_index_id) REFERENCES agent_skills_index(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_mcp_tools_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name TEXT NOT NULL,
  server_name TEXT NOT NULL DEFAULT '',
  description TEXT,
  input_schema_json TEXT,
  permission_level TEXT NOT NULL DEFAULT 'safe' CHECK(permission_level IN ('safe','restricted','dangerous')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_name, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_mcp_enabled ON agent_mcp_tools_registry(enabled);

CREATE TABLE IF NOT EXISTS agent_mcp_embeddings (
  mcp_registry_id INTEGER NOT NULL UNIQUE,
  embedding BLOB NOT NULL,
  FOREIGN KEY (mcp_registry_id) REFERENCES agent_mcp_tools_registry(id) ON DELETE CASCADE
);

-- Seed system rules (non-removable via API; agent cannot modify)
INSERT OR IGNORE INTO agent_rules (scope, title, content, priority, enabled, approval_status, source) VALUES
('system', 'markdown_math', 'Markdown math: use inline $...$ and block $$...$$ only. Do not use parentheses ( ) or square brackets [ ] for math delimiters.', 100, 1, 'approved', 'system'),
('system', 'latex_chinese', 'LaTeX Chinese: use xeCJK, compile with XeLaTeX, and specify a valid Chinese font (e.g. in document preamble).', 90, 1, 'approved', 'system'),
('system', 'diagram_layout', 'Diagrams: prefer orthogonal edges and avoid crossing lines where possible.', 80, 1, 'approved', 'system');
