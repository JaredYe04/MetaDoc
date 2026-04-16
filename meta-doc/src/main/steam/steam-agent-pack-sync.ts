import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createMainLogger } from '../logger'
import ragService from '../utils/rag-service'
import {
  deleteAllUserSourceRules,
  deleteSkillById,
  insertUserRuleFromCloud,
  listAllSkillIndexRows,
  listMcpConnections,
  listRules,
  replaceMcpConnectionsFromCloud,
  upsertSkillFromSkillMdPath,
  type AgentRuleRow
} from '../database/agent-capabilities-db'
import type { GreenworksApi } from './greenworks-loader'
import { readTextFromCloud, saveTextToCloud } from './steam-cloud'

const logger = createMainLogger('SteamAgentPack')

export const AGENT_PACK_CLOUD = 'cloud/agent-pack.json'

const PACK_SCHEMA = 1

export function getSkillsLibraryRoot(): string {
  return path.join(app.getPath('userData'), 'metadoc-skills-library')
}

export type AgentPackSkillEntry = {
  skill_folder: string
  skillMdUtf8: string
  status: 'draft' | 'active'
}

export type AgentPackPayload = {
  schemaVersion: number
  updatedAt: number
  rules: Array<
    Pick<AgentRuleRow, 'scope' | 'title' | 'content' | 'priority' | 'enabled' | 'approval_status'>
  >
  mcpConnections: Array<{ label: string; base_url: string; is_active: number }>
  skills: AgentPackSkillEntry[]
}

export type AgentPackBody = Omit<AgentPackPayload, 'updatedAt'>

export function buildAgentPackBody(): AgentPackBody {
  const rules = listRules()
    .filter((r) => r.source === 'user')
    .map((r) => ({
      scope: r.scope,
      title: r.title,
      content: r.content,
      priority: r.priority,
      enabled: r.enabled,
      approval_status: r.approval_status
    }))
  const mcpConnections = listMcpConnections().map((c) => ({
    label: c.label,
    base_url: c.base_url,
    is_active: c.is_active
  }))
  const libRoot = getSkillsLibraryRoot().replace(/\\/g, '/').toLowerCase()
  const skills: AgentPackSkillEntry[] = []
  for (const row of listAllSkillIndexRows()) {
    const wr = row.workspace_root.replace(/\\/g, '/').toLowerCase()
    if (wr !== libRoot) continue
    if (!row.full_path || !fs.existsSync(row.full_path)) continue
    try {
      const skillMdUtf8 = fs.readFileSync(row.full_path, 'utf8')
      skills.push({
        skill_folder: row.skill_folder,
        skillMdUtf8,
        status: row.status
      })
    } catch (e) {
      logger.warn('read skill for pack', row.full_path, e)
    }
  }
  return {
    schemaVersion: PACK_SCHEMA,
    rules,
    mcpConnections,
    skills
  }
}

function removeSkillsLibraryFromDiskAndDb(): void {
  const root = getSkillsLibraryRoot()
  const rows = listAllSkillIndexRows().filter(
    (r) =>
      r.workspace_root.replace(/\\/g, '/').toLowerCase() === root.replace(/\\/g, '/').toLowerCase()
  )
  for (const r of rows) {
    try {
      deleteSkillById(r.id, true)
    } catch (e) {
      logger.warn('delete skill lib row', e)
    }
  }
  try {
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  } catch (e) {
    logger.warn('rm skills library', e)
  }
}

export async function applyAgentPackPayload(blob: AgentPackPayload | AgentPackBody): Promise<void> {
  if (blob.schemaVersion !== PACK_SCHEMA) {
    throw new Error('unsupported_agent_pack_schema')
  }
  deleteAllUserSourceRules()
  for (const r of blob.rules ?? []) {
    insertUserRuleFromCloud({
      scope: r.scope,
      title: r.title,
      content: r.content,
      priority: r.priority,
      enabled: r.enabled,
      approval_status: r.approval_status
    })
  }
  replaceMcpConnectionsFromCloud(blob.mcpConnections ?? [])
  removeSkillsLibraryFromDiskAndDb()
  const root = getSkillsLibraryRoot()
  fs.mkdirSync(root, { recursive: true })
  const embedFn = async (text: string) => {
    const e = await ragService.embedForAgentCapabilities(text)
    return e.vector
  }
  for (const s of blob.skills ?? []) {
    const safeFolder = path.basename(s.skill_folder).replace(/[^a-zA-Z0-9._-]/g, '_') || 'skill'
    const dir = path.join(root, safeFolder)
    fs.mkdirSync(dir, { recursive: true })
    const skillPath = path.join(dir, 'SKILL.md')
    fs.writeFileSync(skillPath, s.skillMdUtf8, 'utf8')
    const r = await upsertSkillFromSkillMdPath(skillPath, embedFn)
    if (!r.ok) {
      logger.warn('upsert skill from cloud pack', r.error)
    }
  }
}

export async function pushAgentPackToCloud(
  gw: GreenworksApi
): Promise<{ success: true; updatedAt: number } | { success: false; error: string }> {
  const updatedAt = Date.now()
  const payload: AgentPackPayload = { ...buildAgentPackBody(), updatedAt }
  const body = JSON.stringify(payload, null, 2)
  const r = await saveTextToCloud(gw, AGENT_PACK_CLOUD, body)
  if (!r.success) {
    return r
  }
  return { success: true, updatedAt }
}

export async function readAgentPackFromCloud(
  gw: GreenworksApi
): Promise<{ success: true; payload: AgentPackPayload } | { success: false; error: string }> {
  const r = await readTextFromCloud(gw, AGENT_PACK_CLOUD)
  if (!r.success) {
    return { success: false, error: r.error }
  }
  try {
    const raw = JSON.parse(r.content) as AgentPackPayload
    if (!raw || typeof raw.schemaVersion !== 'number') {
      return { success: false, error: 'invalid_agent_pack' }
    }
    return { success: true, payload: raw }
  } catch {
    return { success: false, error: 'invalid_agent_pack_json' }
  }
}
