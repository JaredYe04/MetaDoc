/**
 * Agent 能力层 IPC：Rules / Skills 同步 / MCP 注册 / RAG 合并检索
 */

import fs from 'fs'
import { ipcBridge } from '../bridge/ipc-bridge'
import { createMainLogger } from '../logger'
import ragService from './rag-service'
import {
  getRulesPromptText,
  listRules,
  insertDynamicRule,
  setRuleEnabled,
  approveRule,
  updateRuleContent,
  deleteRule,
  syncSkillsFromWorkspaces,
  searchSkillsByVector,
  searchMcpToolsByVector,
  registerMcpTools,
  setMcpToolEmbedding,
  getMcpRegistryId,
  getSkillById,
  listSkillSummaries,
  parseSkillMd,
  setSkillEmbedding,
  listMcpTools,
  upsertSkillFromSkillMdPath,
  listMcpConnections,
  getActiveMcpConnection,
  addMcpConnection,
  updateMcpConnection,
  deleteMcpConnection,
  setActiveMcpConnection,
  deleteSkillById,
  type McpPermissionLevel
} from '../database/agent-capabilities-db'
import { execute } from '../database/database'

const logger = createMainLogger('AgentCapabilitiesHandlers')

export function bindAgentCapabilitiesHandlers(): void {
  ipcBridge.registerHandle('agent-capabilities-get-rules-prompt', async () => {
    try {
      return { success: true, text: getRulesPromptText() }
    } catch (e) {
      logger.error('get-rules-prompt failed', e as Error)
      return { success: false, message: e instanceof Error ? e.message : String(e), text: '' }
    }
  })

  ipcBridge.registerHandle('agent-capabilities-list-rules', async () => {
    try {
      return { success: true, rules: listRules() }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e), rules: [] }
    }
  })

  ipcBridge.registerHandle(
    'agent-capabilities-insert-dynamic-rule',
    async (
      _e,
      params: { title: string; content: string; priority?: number; source: 'user' | 'agent' }
    ) => {
      try {
        const id = insertDynamicRule(params)
        return { success: true, id }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-set-rule-enabled',
    async (_e, params: { id: number; enabled: boolean }) => {
      try {
        setRuleEnabled(params.id, params.enabled)
        return { success: true }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-approve-rule',
    async (_e, params: { id: number; status: 'approved' | 'rejected' }) => {
      try {
        approveRule(params.id, params.status)
        return { success: true }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-update-rule',
    async (_e, params: { id: number; title?: string; content?: string; priority?: number }) => {
      try {
        updateRuleContent(params.id, {
          title: params.title,
          content: params.content,
          priority: params.priority
        })
        return { success: true }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle('agent-capabilities-delete-rule', async (_e, params: { id: number }) => {
    try {
      deleteRule(params.id)
      return { success: true }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcBridge.registerHandle(
    'agent-capabilities-sync-skills',
    async (_e, params: { workspaceRoots: string[] }) => {
      try {
        const roots = Array.isArray(params.workspaceRoots) ? params.workspaceRoots : []
        const result = await syncSkillsFromWorkspaces(roots, async (text) => {
          const r = await ragService.embedForAgentCapabilities(text)
          return r.vector
        })
        return { success: true, ...result }
      } catch (e) {
        logger.error('sync-skills failed', e as Error)
        return {
          success: false,
          message: e instanceof Error ? e.message : String(e),
          scanned: 0,
          upserted: 0,
          errors: []
        }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-register-mcp-tools',
    async (
      _e,
      params: {
        tools: Array<{
          serverName: string
          toolName: string
          description?: string
          inputSchema?: unknown
          permissionLevel: McpPermissionLevel
        }>
      }
    ) => {
      try {
        const tools = Array.isArray(params.tools) ? params.tools : []
        registerMcpTools(tools)
        for (const t of tools) {
          const id = getMcpRegistryId(t.serverName || '', t.toolName)
          if (id != null) {
            const embedText = `${t.toolName}\n${t.description || ''}`
            const { vector } = await ragService.embedForAgentCapabilities(embedText)
            setMcpToolEmbedding(id, vector)
          }
        }
        return { success: true }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-retrieve-merged',
    async (
      _e,
      params: {
        query: string
        topKSkills?: number
        topKMcp?: number
        topKnowledge?: number
        knowledgeThreshold?: number
      }
    ) => {
      try {
        const q = (params.query || '').trim()
        if (!q) {
          return {
            success: true,
            skills: [],
            mcpTools: [],
            knowledgeSnippets: []
          }
        }
        const { vector } = await ragService.embedForAgentCapabilities(q)
        const topKSkills = params.topKSkills ?? 5
        const topKMcp = params.topKMcp ?? 5
        const topKnowledge = params.topKnowledge ?? 0
        const skills = searchSkillsByVector(vector, topKSkills, q)
        const mcpTools = searchMcpToolsByVector(vector, topKMcp, q)
        let knowledgeSnippets: string[] = []
        if (topKnowledge > 0) {
          const snippets = await ragService.queryKnowledgeBase(
            q,
            params.knowledgeThreshold ?? 0.45
          )
          knowledgeSnippets = snippets.slice(0, topKnowledge)
        }
        return { success: true, skills, mcpTools, knowledgeSnippets }
      } catch (e) {
        logger.error('retrieve-merged failed', e as Error)
        return {
          success: false,
          message: e instanceof Error ? e.message : String(e),
          skills: [],
          mcpTools: [],
          knowledgeSnippets: []
        }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-search-skills',
    async (_e, params: { query: string; topK?: number }) => {
      try {
        const q = (params.query || '').trim()
        if (!q) return { success: true, skills: [] }
        const { vector } = await ragService.embedForAgentCapabilities(q)
        const skills = searchSkillsByVector(vector, params.topK ?? 8, q)
        return { success: true, skills }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e), skills: [] }
      }
    }
  )

  ipcBridge.registerHandle('agent-capabilities-get-skill', async (_e, params: { id: number }) => {
    try {
      const row = getSkillById(params.id)
      return { success: true, skill: row ?? null }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e), skill: null }
    }
  })

  ipcBridge.registerHandle('agent-capabilities-list-skill-summaries', async (_e, params?: { status?: 'draft' | 'active' }) => {
    try {
      const summaries = listSkillSummaries(params?.status)
      return { success: true, summaries }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e), summaries: [] }
    }
  })

  ipcBridge.registerHandle('agent-capabilities-list-mcp-tools', async () => {
    try {
      return { success: true, tools: listMcpTools() }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e), tools: [] }
    }
  })

  ipcBridge.registerHandle(
    'agent-capabilities-delete-skill',
    async (_e, params: { id: number; deleteFile?: boolean }) => {
      try {
        deleteSkillById(params.id, params.deleteFile !== false)
        return { success: true }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle('agent-capabilities-upsert-skill-path', async (_e, params: { path: string }) => {
    try {
      const r = await upsertSkillFromSkillMdPath(params.path, async (text) => {
        const e = await ragService.embedForAgentCapabilities(text)
        return e.vector
      })
      return {
        success: r.ok,
        skillIndexId: r.skillIndexId,
        message: r.error
      }
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : String(e)
      }
    }
  })

  ipcBridge.registerHandle('agent-capabilities-list-mcp-connections', async () => {
    try {
      return { success: true, connections: listMcpConnections(), active: getActiveMcpConnection() }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e), connections: [] }
    }
  })

  ipcBridge.registerHandle(
    'agent-capabilities-add-mcp-connection',
    async (_e, params: { label: string; baseUrl: string }) => {
      try {
        const id = addMcpConnection(params.label, params.baseUrl)
        return { success: true, id }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle(
    'agent-capabilities-update-mcp-connection',
    async (_e, params: { id: number; label?: string; baseUrl?: string }) => {
      try {
        updateMcpConnection(params.id, { label: params.label, base_url: params.baseUrl })
        return { success: true }
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcBridge.registerHandle('agent-capabilities-delete-mcp-connection', async (_e, params: { id: number }) => {
    try {
      deleteMcpConnection(params.id)
      return { success: true }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcBridge.registerHandle('agent-capabilities-set-active-mcp-connection', async (_e, params: { id: number }) => {
    try {
      setActiveMcpConnection(params.id)
      return { success: true, active: getActiveMcpConnection() }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  /** 用户确认后将草稿技能激活并重建向量 */
  ipcBridge.registerHandle('agent-capabilities-activate-skill', async (_e, params: { id: number }) => {
    try {
      const row = getSkillById(params.id)
      if (!row) throw new Error('Skill not found')
      execute(
        `UPDATE agent_skills_index SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [params.id]
      )
      if (fs.existsSync(row.full_path)) {
        const content = fs.readFileSync(row.full_path, 'utf-8')
        const meta = parseSkillMd(content)
        const embedText = [meta.name, meta.description, meta.tags.join(' ')].filter(Boolean).join('\n')
        const { vector } = await ragService.embedForAgentCapabilities(embedText)
        setSkillEmbedding(params.id, vector)
      }
      return { success: true }
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}
