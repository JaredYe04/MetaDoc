/**
 * Workspace Skills：检索摘要 + 懒加载全文（.metadoc/skills 下各子目录的 SKILL.md）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import messageBridge from '../../bridge/message-bridge'
import { createDetailedError } from './tool-utils'

const searchSkillCallback: ToolCallback = async (params, _signal, onUpdate) => {
  const query = params.query as string
  if (!query || typeof query !== 'string') {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少 query 参数',
        ['{"query": "workspace grep"}'],
        ['使用自然语言检索已索引的 active 技能摘要']
      )
    }
  }
  onUpdate({ content: { stage: 'searching', query }, format: 'json' } as ToolCallbackData, {
    percentage: 20,
    message: 'Searching skills...'
  } as ToolProgress)
  const res = await messageBridge.invoke('agent-capabilities-search-skills', {
    query,
    topK: typeof params.topK === 'number' ? params.topK : 8
  })
  if (!res?.success) {
    return { status: 'failed', error: res?.message || 'search-skills failed' }
  }
  const skills = (res.skills || []).map(
    (s: { id: number; name: string; description: string; score: number }) => ({
      skillId: s.id,
      name: s.name,
      description: s.description,
      score: s.score
    })
  )
  return {
    status: 'succeeded',
    result: JSON.stringify({ skills }, null, 2),
    data: { content: { skills }, format: 'json' }
  }
}

const loadSkillCallback: ToolCallback = async (params, _signal, onUpdate) => {
  const skillId = params.skillId
  if (skillId == null || (typeof skillId !== 'number' && typeof skillId !== 'string')) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少 skillId',
        ['{"skillId": 1}'],
        ['skillId 来自 search_skill 或意图上下文中的摘要列表']
      )
    }
  }
  const id = typeof skillId === 'string' ? parseInt(skillId, 10) : skillId
  if (Number.isNaN(id)) {
    return { status: 'failed', error: 'Invalid skillId' }
  }
  onUpdate({ content: { stage: 'loading', skillId: id }, format: 'json' } as ToolCallbackData, {
    percentage: 30,
    message: 'Loading SKILL.md...'
  } as ToolProgress)
  const res = await messageBridge.invoke('agent-capabilities-get-skill', { id })
  if (!res?.success || !res.skill) {
    return { status: 'failed', error: res?.message || 'Skill not found' }
  }
  const sk = res.skill as {
    status: string
    full_path: string
    name: string
    description: string | null
    entry: string | null
  }
  if (sk.status === 'draft') {
    return {
      status: 'failed',
      error:
        '该技能为草稿（draft），需用户确认激活后方可加载。可在确认后调用主进程 agent-capabilities-activate-skill 并重新同步索引。'
    }
  }
  const content = (await messageBridge.invoke('read-file-content', sk.full_path)) as string | null
  if (content == null) {
    return { status: 'failed', error: `无法读取文件: ${sk.full_path}` }
  }
  const payload = {
    skillId: id,
    name: sk.name,
    path: sk.full_path,
    entry: sk.entry,
    body: content
  }
  return {
    status: 'succeeded',
    result: content,
    data: { content: payload, format: 'json' }
  }
}

function getWorkspaceRoots(): string[] {
  try {
    const raw = localStorage.getItem('workspaceFolders')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0) : []
  } catch {
    return []
  }
}

function joinUnderWorkspace(root: string, ...segments: string[]): string {
  const win = /^[A-Za-z]:/.test(root)
  const sep = win ? '\\' : '/'
  const base = root.replace(/[/\\]+$/, '')
  return base + sep + segments.join(sep)
}

const syncWorkspaceSkillsCallback: ToolCallback = async (params, _signal, onUpdate) => {
  let roots = params.workspaceRoots as string[] | undefined
  if (!Array.isArray(roots) || roots.length === 0) {
    roots = getWorkspaceRoots()
  }
  if (roots.length === 0) {
    return {
      status: 'failed',
      error: createDetailedError(
        '未找到工作区根目录',
        ['{"workspaceRoots": ["D:/project"]}', '{}'],
        ['请先在 MetaDoc 中添加工作区文件夹，或显式传入 workspaceRoots']
      )
    }
  }
  onUpdate({ content: { stage: 'syncing', roots }, format: 'json' } as ToolCallbackData, {
    percentage: 30,
    message: 'Syncing skills index...'
  } as ToolProgress)
  const res = await messageBridge.invoke('agent-capabilities-sync-skills', { workspaceRoots: roots })
  if (!res?.success) {
    return { status: 'failed', error: res?.message || 'sync-skills failed' }
  }
  const payload = {
    scanned: res.scanned ?? 0,
    upserted: res.upserted ?? 0,
    errors: res.errors ?? []
  }
  return {
    status: 'succeeded',
    result: JSON.stringify(payload, null, 2),
    data: { content: payload, format: 'json' }
  }
}

const createWorkspaceSkillCallback: ToolCallback = async (params, _signal, onUpdate) => {
  const folder = String(params.skillFolder ?? '').trim()
  const markdown = String(params.skillMarkdown ?? params.content ?? '').trim()
  if (!folder || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(folder)) {
    return {
      status: 'failed',
      error: createDetailedError(
        'skillFolder 非法（仅字母数字、下划线、连字符，且不能以连字符开头）',
        ['{"skillFolder": "my-skill", "skillMarkdown": "---\\nname: x\\n---\\n# ..."}'],
        []
      )
    }
  }
  if (!markdown) {
    return {
      status: 'failed',
      error: createDetailedError('skillMarkdown 不能为空', [], [])
    }
  }
  let root = typeof params.workspaceRoot === 'string' ? params.workspaceRoot.trim() : ''
  if (!root) {
    const roots = getWorkspaceRoots()
    root = roots[0] || ''
  }
  if (!root) {
    return {
      status: 'failed',
      error: createDetailedError('需要工作区根路径：添加工作区文件夹或传入 workspaceRoot', [], [])
    }
  }
  const fullPath = joinUnderWorkspace(root, '.metadoc', 'skills', folder, 'SKILL.md')
  onUpdate({ content: { stage: 'writing', path: fullPath }, format: 'json' } as ToolCallbackData, {
    percentage: 40,
    message: 'Writing SKILL.md...'
  } as ToolProgress)
  try {
    await messageBridge.invoke('write-file-content', { filePath: fullPath, content: markdown })
  } catch (e) {
    return {
      status: 'failed',
      error: e instanceof Error ? e.message : String(e)
    }
  }
  const upsert = await messageBridge.invoke('agent-capabilities-upsert-skill-path', { path: fullPath })
  if (!upsert?.success) {
    return {
      status: 'failed',
      error: upsert?.message || '索引写入失败（文件已落盘，可稍后执行 sync_workspace_skills）'
    }
  }
  const out = { path: fullPath, skillIndexId: upsert.skillIndexId }
  return {
    status: 'succeeded',
    result: JSON.stringify(out, null, 2),
    data: { content: out, format: 'json' }
  }
}

const SEARCH_SKILL_NAME = 'Search Skill'
const SEARCH_SKILL_DESCRIPTION =
  'Vector search over indexed workspace skills (.metadoc/skills); returns summaries only, not full SKILL.md.'
const SEARCH_SKILL_INSTRUCTION = `## Search Skill
Parameters: \`query\` (string, required), \`topK\` (number, optional).
Returns skillId and metadata for **active** skills only. Use \`load_skill\` with skillId to load full SKILL.md.`

const LOAD_SKILL_NAME = 'Load Skill'
const LOAD_SKILL_DESCRIPTION =
  'Load full SKILL.md for an active skill by skillId (lazy load). Draft skills must be activated by the user first.'
const LOAD_SKILL_INSTRUCTION = `## Load Skill
Parameter: \`skillId\` (number, required).
Reads the skill file from the workspace. **Draft** skills are rejected until activated in Agent capabilities management.`

export const searchSkillToolConfig: AgentToolConfig = {
  id: 'search_skill',
  name: SEARCH_SKILL_NAME,
  description: SEARCH_SKILL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'search_skill',
    brief: 'Search indexed workspace skills by query; returns skillId summaries only.',
    fullSpec: `${SEARCH_SKILL_INSTRUCTION}

Draft skills are not included in the index.`
  },
  instruction: SEARCH_SKILL_INSTRUCTION,
  callback: searchSkillCallback,
  enabled: true,
  editable: false,
  tags: ['skills', 'rag']
}

export const loadSkillToolConfig: AgentToolConfig = {
  id: 'load_skill',
  name: LOAD_SKILL_NAME,
  description: LOAD_SKILL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'load_skill',
    brief: 'Load full skill file by skillId from workspace .metadoc/skills.',
    fullSpec: LOAD_SKILL_INSTRUCTION
  },
  instruction: LOAD_SKILL_INSTRUCTION,
  callback: loadSkillCallback,
  enabled: true,
  editable: false,
  tags: ['skills']
}

const SYNC_SKILLS_NAME = 'Sync Workspace Skills'
const SYNC_SKILLS_DESCRIPTION =
  'Scan all workspace folders for .metadoc/skills/*/SKILL.md, upsert SQLite rows and refresh embeddings for active skills.'
const SYNC_SKILLS_INSTRUCTION = `## Sync Workspace Skills
Optional \`workspaceRoots\`: string[]. If omitted, uses MetaDoc workspace folders.
Call after bulk file changes or when search_skill returns empty unexpectedly.`

const CREATE_SKILL_NAME = 'Create Workspace Skill'
const CREATE_SKILL_DESCRIPTION =
  'Create or overwrite <workspace>/.metadoc/skills/<skillFolder>/SKILL.md, then index and embed in one step. Prefer this when the user asks to add a workspace skill.'
const CREATE_SKILL_INSTRUCTION = `## Create Workspace Skill
Required: \`skillFolder\` (directory name under .metadoc/skills), \`skillMarkdown\` (full file body, include YAML frontmatter).
Optional: \`workspaceRoot\` (absolute path); defaults to first workspace folder.`

export const syncWorkspaceSkillsToolConfig: AgentToolConfig = {
  id: 'sync_workspace_skills',
  name: SYNC_SKILLS_NAME,
  description: SYNC_SKILLS_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'sync_workspace_skills',
    brief:
      'Re-index all skills from workspace .metadoc/skills; updates SQLite and vectors. Use after creating/editing SKILL.md manually.',
    fullSpec: SYNC_SKILLS_INSTRUCTION
  },
  instruction: SYNC_SKILLS_INSTRUCTION,
  callback: syncWorkspaceSkillsCallback,
  enabled: true,
  editable: false,
  tags: ['skills', 'index']
}

export const createWorkspaceSkillToolConfig: AgentToolConfig = {
  id: 'create_workspace_skill',
  name: CREATE_SKILL_NAME,
  description: CREATE_SKILL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'create_workspace_skill',
    brief:
      'Write SKILL.md under .metadoc/skills/<folder>/ and immediately upsert embeddings. Preferred over raw edit for new skills.',
    fullSpec: CREATE_SKILL_INSTRUCTION
  },
  instruction: CREATE_SKILL_INSTRUCTION,
  callback: createWorkspaceSkillCallback,
  enabled: true,
  editable: false,
  tags: ['skills', 'create']
}
