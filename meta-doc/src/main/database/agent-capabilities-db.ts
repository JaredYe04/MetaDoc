/**
 * Agent 能力层：Rules / Skills 索引 / MCP 工具注册与向量检索（与知识库向量表分离，查询时在应用层合并）
 */

import fs from 'fs'
import path from 'path'
import { getDatabase, query, queryOne, execute, transaction, tableExists } from './database'
import { ensureInitialized as ensureKnowledgeInitialized } from './knowledge-db'
import { createMainLogger } from '../logger'

const logger = createMainLogger('AgentCapabilitiesDB')

export type AgentRuleScope = 'system' | 'dynamic'
export type AgentRuleApproval = 'draft' | 'pending' | 'approved' | 'rejected'
export type AgentRuleSource = 'system' | 'user' | 'agent'
export type SkillStatus = 'draft' | 'active'
export type McpPermissionLevel = 'safe' | 'restricted' | 'dangerous'

export interface AgentRuleRow {
  id: number
  scope: AgentRuleScope
  title: string
  content: string
  priority: number
  enabled: number
  approval_status: AgentRuleApproval
  source: AgentRuleSource
  created_at: string
  updated_at: string
}

export interface SkillIndexRow {
  id: number
  workspace_root: string
  skill_folder: string
  name: string
  description: string | null
  entry: string | null
  tags_json: string | null
  status: SkillStatus
  full_path: string
}

export interface McpToolRow {
  id: number
  tool_name: string
  server_name: string
  description: string | null
  input_schema_json: string | null
  permission_level: McpPermissionLevel
  enabled: number
}

function ensureAgentTables(): void {
  ensureKnowledgeInitialized()
  if (!tableExists('agent_rules')) {
    logger.warn('agent_rules 不存在，请运行数据库迁移 011_agent_capabilities')
  }
}

function bufferToVector(buf: Buffer): number[] {
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4))
}

function vectorToBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer)
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

/** 构建注入 LLM 的规则文本（系统规则始终包含；动态规则仅 enabled + approved） */
export function getRulesPromptText(): string {
  ensureAgentTables()
  if (!tableExists('agent_rules')) {
    return ''
  }
  const rows = query<{ title: string; content: string; priority: number }>(
    `SELECT title, content, priority FROM agent_rules
     WHERE enabled = 1
       AND (
         scope = 'system'
         OR (scope = 'dynamic' AND approval_status = 'approved')
       )
     ORDER BY priority DESC, id ASC`,
    []
  )
  if (rows.length === 0) return ''
  return rows.map((r) => `### ${r.title}\n${r.content}`).join('\n\n')
}

export function listRules(): AgentRuleRow[] {
  ensureAgentTables()
  if (!tableExists('agent_rules')) return []
  return query<AgentRuleRow>(
    'SELECT * FROM agent_rules ORDER BY scope ASC, priority DESC, id ASC',
    []
  )
}

export function insertDynamicRule(params: {
  title: string
  content: string
  priority?: number
  source: 'user' | 'agent'
}): number {
  ensureAgentTables()
  const approval: AgentRuleApproval = params.source === 'agent' ? 'pending' : 'approved'
  const result = execute(
    `INSERT INTO agent_rules (scope, title, content, priority, enabled, approval_status, source)
     VALUES ('dynamic', ?, ?, ?, 1, ?, ?)`,
    [params.title, params.content, params.priority ?? 0, approval, params.source]
  )
  return result.lastInsertRowid as number
}

export function setRuleEnabled(id: number, enabled: boolean): void {
  ensureAgentTables()
  const row = queryOne<AgentRuleRow>('SELECT * FROM agent_rules WHERE id = ?', [id])
  if (!row) throw new Error(`Rule ${id} not found`)
  if (row.scope === 'system') {
    throw new Error('System rules cannot be disabled or modified via this API')
  }
  execute('UPDATE agent_rules SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
    enabled ? 1 : 0,
    id
  ])
}

export function approveRule(id: number, status: 'approved' | 'rejected'): void {
  ensureAgentTables()
  const row = queryOne<AgentRuleRow>('SELECT * FROM agent_rules WHERE id = ?', [id])
  if (!row) throw new Error(`Rule ${id} not found`)
  if (row.scope === 'system') throw new Error('Cannot change approval of system rules')
  execute(
    'UPDATE agent_rules SET approval_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id]
  )
}

export function updateRuleContent(
  id: number,
  patch: { title?: string; content?: string; priority?: number }
): void {
  ensureAgentTables()
  const row = queryOne<AgentRuleRow>('SELECT * FROM agent_rules WHERE id = ?', [id])
  if (!row) throw new Error(`Rule ${id} not found`)
  if (row.scope === 'system' && row.source === 'system') {
    throw new Error('System rules cannot be modified')
  }
  const title = patch.title ?? row.title
  const content = patch.content ?? row.content
  const priority = patch.priority ?? row.priority
  execute(
    `UPDATE agent_rules SET title = ?, content = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [title, content, priority, id]
  )
}

/** 仅用于测试或管理员：禁止 Agent 调用 */
export function deleteRule(id: number): void {
  ensureAgentTables()
  const row = queryOne<AgentRuleRow>('SELECT * FROM agent_rules WHERE id = ?', [id])
  if (!row) throw new Error(`Rule ${id} not found`)
  if (row.scope === 'system') throw new Error('System rules cannot be deleted')
  execute('DELETE FROM agent_rules WHERE id = ?', [id])
}

export function upsertSkillRecord(row: {
  workspace_root: string
  skill_folder: string
  name: string
  description: string
  entry: string
  tags_json: string
  status: SkillStatus
  full_path: string
  skill_md_hash: string
}): number {
  ensureAgentTables()
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM agent_skills_index WHERE workspace_root = ? AND skill_folder = ?',
    [row.workspace_root, row.skill_folder]
  )
  if (existing) {
    execute(
      `UPDATE agent_skills_index SET
        name = ?, description = ?, entry = ?, tags_json = ?, status = ?, full_path = ?, skill_md_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        row.name,
        row.description,
        row.entry,
        row.tags_json,
        row.status,
        row.full_path,
        row.skill_md_hash,
        existing.id
      ]
    )
    return existing.id
  }
  const ins = execute(
    `INSERT INTO agent_skills_index
      (workspace_root, skill_folder, name, description, entry, tags_json, status, full_path, skill_md_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.workspace_root,
      row.skill_folder,
      row.name,
      row.description,
      row.entry,
      row.tags_json,
      row.status,
      row.full_path,
      row.skill_md_hash
    ]
  )
  return ins.lastInsertRowid as number
}

export function setSkillEmbedding(skillIndexId: number, embedding: number[]): void {
  ensureAgentTables()
  const buf = vectorToBuffer(embedding)
  const existing = queryOne<{ skill_index_id: number }>(
    'SELECT skill_index_id FROM agent_skill_embeddings WHERE skill_index_id = ?',
    [skillIndexId]
  )
  if (existing) {
    execute('UPDATE agent_skill_embeddings SET embedding = ? WHERE skill_index_id = ?', [
      buf,
      skillIndexId
    ])
  } else {
    execute('INSERT INTO agent_skill_embeddings (skill_index_id, embedding) VALUES (?, ?)', [
      skillIndexId,
      buf
    ])
  }
}

export function getSkillById(id: number): SkillIndexRow | undefined {
  ensureAgentTables()
  return queryOne<SkillIndexRow>('SELECT * FROM agent_skills_index WHERE id = ?', [id])
}

/**
 * 从索引中移除技能；可选删除磁盘上的 SKILL.md
 */
export function deleteSkillById(id: number, deleteFile: boolean): void {
  ensureAgentTables()
  const row = getSkillById(id)
  if (!row) throw new Error('Skill not found')
  if (deleteFile && row.full_path) {
    const skillDir = path.dirname(row.full_path)
    try {
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true })
      }
    } catch (e) {
      logger.warn(`删除技能目录失败: ${skillDir}`, e as Error)
    }
  }
  execute('DELETE FROM agent_skill_embeddings WHERE skill_index_id = ?', [id])
  execute('DELETE FROM agent_skills_index WHERE id = ?', [id])
}

/** 摘要列表（不含全文 SKILL.md） */
export function listSkillSummaries(
  status?: SkillStatus
): Array<
  Pick<
    SkillIndexRow,
    | 'id'
    | 'workspace_root'
    | 'skill_folder'
    | 'name'
    | 'description'
    | 'entry'
    | 'tags_json'
    | 'status'
  >
> {
  ensureAgentTables()
  if (!tableExists('agent_skills_index')) return []
  if (status) {
    return query(
      `SELECT id, workspace_root, skill_folder, name, description, entry, tags_json, status
       FROM agent_skills_index WHERE status = ? ORDER BY name ASC`,
      [status]
    )
  }
  return query(
    `SELECT id, workspace_root, skill_folder, name, description, entry, tags_json, status
     FROM agent_skills_index ORDER BY workspace_root ASC, name ASC`,
    []
  )
}

export function searchSkillsByVector(
  queryVector: number[],
  topK: number,
  queryText?: string
): Array<{
  id: number
  score: number
  name: string
  description: string
  entry: string
  tags_json: string | null
}> {
  ensureAgentTables()
  if (!tableExists('agent_skill_embeddings')) return []
  const rows = query<{
    skill_index_id: number
    embedding: Buffer
    name: string
    description: string | null
    entry: string | null
    tags_json: string | null
  }>(
    `SELECT e.skill_index_id, e.embedding, s.name, s.description, s.entry, s.tags_json
     FROM agent_skill_embeddings e
     INNER JOIN agent_skills_index s ON s.id = e.skill_index_id
     WHERE s.status = 'active'`,
    []
  )
  const scored = rows.map((r) => {
    const vec = bufferToVector(r.embedding)
    let score = cosineSimilarity(queryVector, vec)
    if (queryText && queryText.trim()) {
      const blob = `${r.name}\n${r.description || ''}\n${r.tags_json || ''}`.toLowerCase()
      const q = queryText.toLowerCase()
      if (blob.includes(q)) score += 0.05
    }
    return {
      id: r.skill_index_id,
      score,
      name: r.name,
      description: r.description || '',
      entry: r.entry || '',
      tags_json: r.tags_json
    }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export function registerMcpTools(
  tools: Array<{
    serverName: string
    toolName: string
    description?: string
    inputSchema?: unknown
    permissionLevel: McpPermissionLevel
  }>
): void {
  ensureAgentTables()
  transaction(() => {
    for (const t of tools) {
      const schemaJson = t.inputSchema != null ? JSON.stringify(t.inputSchema) : null
      execute(
        `INSERT INTO agent_mcp_tools_registry (tool_name, server_name, description, input_schema_json, permission_level, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(server_name, tool_name) DO UPDATE SET
           description = excluded.description,
           input_schema_json = excluded.input_schema_json,
           permission_level = excluded.permission_level,
           enabled = 1,
           updated_at = CURRENT_TIMESTAMP`,
        [t.toolName, t.serverName || '', t.description ?? '', schemaJson, t.permissionLevel]
      )
    }
  })
}

export function setMcpToolEmbedding(mcpRegistryId: number, embedding: number[]): void {
  ensureAgentTables()
  const buf = vectorToBuffer(embedding)
  const existing = queryOne<{ mcp_registry_id: number }>(
    'SELECT mcp_registry_id FROM agent_mcp_embeddings WHERE mcp_registry_id = ?',
    [mcpRegistryId]
  )
  if (existing) {
    execute('UPDATE agent_mcp_embeddings SET embedding = ? WHERE mcp_registry_id = ?', [
      buf,
      mcpRegistryId
    ])
  } else {
    execute('INSERT INTO agent_mcp_embeddings (mcp_registry_id, embedding) VALUES (?, ?)', [
      mcpRegistryId,
      buf
    ])
  }
}

export function searchMcpToolsByVector(
  queryVector: number[],
  topK: number,
  queryText?: string
): Array<{
  id: number
  score: number
  tool_name: string
  server_name: string | null
  description: string
  permission_level: McpPermissionLevel
}> {
  ensureAgentTables()
  if (!tableExists('agent_mcp_embeddings')) return []
  const rows = query<{
    mcp_registry_id: number
    embedding: Buffer
    tool_name: string
    server_name: string
    description: string | null
    permission_level: McpPermissionLevel
  }>(
    `SELECT e.mcp_registry_id, e.embedding, t.tool_name, t.server_name, t.description, t.permission_level
     FROM agent_mcp_embeddings e
     INNER JOIN agent_mcp_tools_registry t ON t.id = e.mcp_registry_id
     WHERE t.enabled = 1`,
    []
  )
  const scored = rows.map((r) => {
    const vec = bufferToVector(r.embedding)
    let score = cosineSimilarity(queryVector, vec)
    if (queryText && queryText.trim()) {
      const blob = `${r.tool_name}\n${r.description || ''}`.toLowerCase()
      const q = queryText.toLowerCase()
      if (blob.includes(q)) score += 0.05
    }
    return {
      id: r.mcp_registry_id,
      score,
      tool_name: r.tool_name,
      server_name: r.server_name,
      description: r.description || '',
      permission_level: r.permission_level
    }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

export function getMcpRegistryId(serverName: string, toolName: string): number | undefined {
  ensureAgentTables()
  const row = queryOne<{ id: number }>(
    'SELECT id FROM agent_mcp_tools_registry WHERE server_name = ? AND tool_name = ?',
    [serverName, toolName]
  )
  return row?.id
}

export function listMcpTools(): McpToolRow[] {
  ensureAgentTables()
  if (!tableExists('agent_mcp_tools_registry')) return []
  return query<McpToolRow>(
    'SELECT * FROM agent_mcp_tools_registry ORDER BY server_name COLLATE NOCASE, tool_name COLLATE NOCASE',
    []
  )
}

/** 删除某 MCP 服务名下的工具及向量（同步前按服务重建） */
export function deleteMcpToolsByServerName(serverName: string): void {
  ensureAgentTables()
  if (!tableExists('agent_mcp_tools_registry')) return
  const rows = query<{ id: number }>(
    'SELECT id FROM agent_mcp_tools_registry WHERE server_name = ?',
    [serverName]
  )
  for (const r of rows) {
    execute('DELETE FROM agent_mcp_embeddings WHERE mcp_registry_id = ?', [r.id])
  }
  execute('DELETE FROM agent_mcp_tools_registry WHERE server_name = ?', [serverName])
}

/**
 * 删除「已不在配置中的服务」对应的工具行，避免残留。
 * keepServerNames 为空时清空全部 MCP 工具注册表。
 */
export function deleteMcpToolsNotMatchingServerNames(keepServerNames: string[]): void {
  ensureAgentTables()
  if (!tableExists('agent_mcp_tools_registry')) return
  if (keepServerNames.length === 0) {
    execute('DELETE FROM agent_mcp_embeddings', [])
    execute('DELETE FROM agent_mcp_tools_registry', [])
    return
  }
  const placeholders = keepServerNames.map(() => '?').join(', ')
  execute(
    `DELETE FROM agent_mcp_embeddings WHERE mcp_registry_id IN (
       SELECT id FROM agent_mcp_tools_registry WHERE server_name NOT IN (${placeholders})
     )`,
    keepServerNames
  )
  execute(
    `DELETE FROM agent_mcp_tools_registry WHERE server_name NOT IN (${placeholders})`,
    keepServerNames
  )
}

/**
 * 单个 SKILL.md 写入后增量入库：解析、upsert 行、active 时写 embedding
 */
export async function upsertSkillFromSkillMdPath(
  absPathInput: string,
  embedFn: (text: string) => Promise<number[]>
): Promise<{ ok: boolean; skillIndexId?: number; error?: string }> {
  ensureAgentTables()
  const absResolved = path.resolve(absPathInput)
  if (!fs.existsSync(absResolved)) {
    return { ok: false, error: 'File does not exist' }
  }
  const norm = absResolved.replace(/\\/g, '/')
  const re = /^(.+)\/\.metadoc\/skills\/([^/]+)\/SKILL\.md$/i
  const m = norm.match(re)
  if (!m) {
    return { ok: false, error: 'Path must be <workspace>/.metadoc/skills/<folder>/SKILL.md' }
  }
  const workspaceRoot = path.resolve(m[1].replace(/\//g, path.sep))
  const skillFolder = m[2]
  try {
    const content = fs.readFileSync(absResolved, 'utf-8')
    const meta = parseSkillMd(content)
    const status: SkillStatus = meta.draft ? 'draft' : 'active'
    const id = upsertSkillRecord({
      workspace_root: workspaceRoot,
      skill_folder: skillFolder,
      name: meta.name,
      description: meta.description,
      entry: meta.entry,
      tags_json: JSON.stringify(meta.tags),
      status,
      full_path: absResolved,
      skill_md_hash: hashString(content)
    })
    if (status === 'active') {
      const embedText = [meta.name, meta.description, meta.tags.join(' ')]
        .filter(Boolean)
        .join('\n')
      const vec = await embedFn(embedText)
      setSkillEmbedding(id, vec)
    } else {
      execute('DELETE FROM agent_skill_embeddings WHERE skill_index_id = ?', [id])
    }
    return { ok: true, skillIndexId: id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ——— MCP 连接（持久化 base URL，供 UI 切换；实际连接由后续 MCP 客户端使用）———

export interface McpConnectionRow {
  id: number
  label: string
  base_url: string
  is_active: number
  created_at: string
  updated_at: string
}

export function listMcpConnections(): McpConnectionRow[] {
  ensureAgentTables()
  if (!tableExists('agent_mcp_connections')) return []
  return query<McpConnectionRow>('SELECT * FROM agent_mcp_connections ORDER BY id ASC', [])
}

export function getActiveMcpConnection(): McpConnectionRow | undefined {
  ensureAgentTables()
  if (!tableExists('agent_mcp_connections')) return undefined
  return queryOne<McpConnectionRow>(
    'SELECT * FROM agent_mcp_connections WHERE is_active = 1 LIMIT 1',
    []
  )
}

export function addMcpConnection(label: string, baseUrl: string): number {
  ensureAgentTables()
  const ins = execute(
    'INSERT INTO agent_mcp_connections (label, base_url, is_active, updated_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP)',
    [label.trim(), baseUrl.trim()]
  )
  const newId = ins.lastInsertRowid as number
  const cnt = queryOne<{ n: number }>('SELECT COUNT(*) as n FROM agent_mcp_connections', [])
  if (cnt && cnt.n === 1) {
    execute(
      'UPDATE agent_mcp_connections SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newId]
    )
  }
  return newId
}

export function updateMcpConnection(
  id: number,
  patch: { label?: string; base_url?: string }
): void {
  ensureAgentTables()
  const row = queryOne<McpConnectionRow>('SELECT * FROM agent_mcp_connections WHERE id = ?', [id])
  if (!row) throw new Error('Connection not found')
  const label = patch.label !== undefined ? patch.label.trim() : row.label
  const baseUrl = patch.base_url !== undefined ? patch.base_url.trim() : row.base_url
  execute(
    'UPDATE agent_mcp_connections SET label = ?, base_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [label, baseUrl, id]
  )
}

export function deleteMcpConnection(id: number): void {
  ensureAgentTables()
  const wasActive = queryOne<{ is_active: number }>(
    'SELECT is_active FROM agent_mcp_connections WHERE id = ?',
    [id]
  )
  execute('DELETE FROM agent_mcp_connections WHERE id = ?', [id])
  if (wasActive?.is_active === 1) {
    const first = queryOne<McpConnectionRow>(
      'SELECT id FROM agent_mcp_connections ORDER BY id ASC LIMIT 1',
      []
    )
    if (first) {
      execute(
        'UPDATE agent_mcp_connections SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [first.id]
      )
    }
  }
}

export function setActiveMcpConnection(id: number): void {
  ensureAgentTables()
  execute('UPDATE agent_mcp_connections SET is_active = 0', [])
  const r = execute(
    'UPDATE agent_mcp_connections SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [id]
  )
  if ((r.changes ?? 0) === 0) throw new Error('Connection not found')
}

/**
 * 解析 SKILL.md：支持 YAML frontmatter（--- ... ---）或简单 key: value 行
 */
export function parseSkillMd(content: string): {
  name: string
  description: string
  entry: string
  tags: string[]
  draft: boolean
} {
  let body = content
  const result = {
    name: '',
    description: '',
    entry: 'SKILL.md',
    tags: [] as string[],
    draft: false
  }

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (fmMatch) {
    body = content.slice(fmMatch[0].length)
    const fm = fmMatch[1]
    for (const line of fm.split('\n')) {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/)
      if (!m) continue
      const key = m[1].toLowerCase()
      let val = m[2].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (key === 'name') result.name = val
      else if (key === 'description') result.description = val
      else if (key === 'entry') result.entry = val
      else if (key === 'tags') {
        result.tags = val
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      } else if (key === 'draft' && (val === 'true' || val === '1')) result.draft = true
    }
  } else {
    for (const line of content.split('\n')) {
      const m = line.match(/^(name|description|entry|tags)\s*:\s*(.*)$/i)
      if (!m) continue
      const key = m[1].toLowerCase()
      let val = m[2].trim()
      if (key === 'name') result.name = val
      else if (key === 'description') result.description = val
      else if (key === 'entry') result.entry = val
      else if (key === 'tags') {
        result.tags = val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    }
  }

  if (!result.name) {
    const h = body.match(/^#\s+(.+)/m)
    result.name = h ? h[1].trim() : 'skill'
  }
  if (!result.description) {
    result.description = body.slice(0, 200).replace(/\s+/g, ' ').trim()
  }
  return result
}

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return String(h)
}

export interface SyncSkillsResult {
  scanned: number
  upserted: number
  errors: string[]
}

/**
 * 扫描 workspaceRoot/.metadoc/skills/<folder>/SKILL.md，写入索引（不读全文进 LLM，仅元数据 + 向量）
 */
export function syncSkillsFromWorkspaces(
  workspaceRoots: string[],
  embedFn: (text: string) => Promise<number[]>
): Promise<SyncSkillsResult> {
  ensureAgentTables()
  const errors: string[] = []
  let scanned = 0
  let upserted = 0

  return (async () => {
    for (const root of workspaceRoots) {
      if (!root || !fs.existsSync(root)) continue
      const skillsDir = path.join(root, '.metadoc', 'skills')
      if (!fs.existsSync(skillsDir)) continue
      let entries: string[] = []
      try {
        entries = fs
          .readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch (e) {
        errors.push(`${skillsDir}: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      for (const folder of entries) {
        const skillPath = path.join(skillsDir, folder, 'SKILL.md')
        if (!fs.existsSync(skillPath)) continue
        scanned++
        try {
          const content = fs.readFileSync(skillPath, 'utf-8')
          const meta = parseSkillMd(content)
          const status: SkillStatus = meta.draft ? 'draft' : 'active'
          const id = upsertSkillRecord({
            workspace_root: root,
            skill_folder: folder,
            name: meta.name,
            description: meta.description,
            entry: meta.entry,
            tags_json: JSON.stringify(meta.tags),
            status,
            full_path: skillPath,
            skill_md_hash: hashString(content)
          })
          if (status === 'active') {
            const embedText = [meta.name, meta.description, meta.tags.join(' ')]
              .filter(Boolean)
              .join('\n')
            const vec = await embedFn(embedText)
            setSkillEmbedding(id, vec)
            upserted++
          } else {
            execute('DELETE FROM agent_skill_embeddings WHERE skill_index_id = ?', [id])
          }
        } catch (e) {
          errors.push(`${skillPath}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    return { scanned, upserted, errors }
  })()
}
