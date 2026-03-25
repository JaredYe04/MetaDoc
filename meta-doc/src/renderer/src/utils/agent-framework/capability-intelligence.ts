/**
 * RAG 合并检索 + 能力路由：Skills / MCP / Knowledge 分库存储，查询时合并；内置工具 top-K 截断
 */

import messageBridge from '../../bridge/message-bridge'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('CapabilityIntelligence')

const DEFAULT_BUILTIN_TOOL_TOP_K = 18

/** 用户消息是否明显与「工作区技能」相关 */
export function messageTouchesSkills(userMessage: string): boolean {
  const q = (userMessage || '').toLowerCase()
  if (/技能|skill|skills|skill\.md|\.metadoc\/skills|工作区技能|索引技能|创建技能/.test(userMessage)) {
    return true
  }
  if (
    /\bskill\b/.test(q) ||
    q.includes('metadoc') && q.includes('skill')
  ) {
    return true
  }
  return false
}

/** 用户消息是否明显与「动态规则 / Agent 规则」相关 */
export function messageTouchesRules(userMessage: string): boolean {
  const q = (userMessage || '').toLowerCase()
  if (/动态规则|agent\s*规则|系统规则|注入规则|创建规则|添加规则|规则管理|prompt\s*rule|dynamic\s*rule/.test(userMessage)) {
    return true
  }
  if (/\brule\b/.test(q) && /(agent|meta|prompt|动态|添加|创建)/i.test(userMessage)) {
    return true
  }
  return false
}

/** 技能管线工具：意图阶段优先保留，避免被 top-K 截断挤掉 */
const SKILL_MANAGEMENT_TOOL_IDS = [
  'create_workspace_skill',
  'sync_workspace_skills',
  'search_skill',
  'load_skill'
] as const

const RULE_MANAGEMENT_TOOL_IDS = ['create_dynamic_rule', 'update_dynamic_rule'] as const

/** 始终倾向保留的核心工具 id（若存在于当前 Agent 配置中） */
const BUILTIN_TOOL_PRIORITY_IDS = [
  'create_workspace_skill',
  'sync_workspace_skills',
  'search_skill',
  'load_skill',
  'create_dynamic_rule',
  'update_dynamic_rule',
  'edit',
  'workspace',
  'grep',
  'rag-retrieval'
] as const

export interface MergedRetrievalResult {
  skills: Array<{
    id: number
    score: number
    name: string
    description: string
    entry: string
    tags_json: string | null
  }>
  mcpTools: Array<{
    id: number
    score: number
    tool_name: string
    server_name: string
    description: string
    permission_level: string
  }>
  knowledgeSnippets: string[]
}

export class RAGRetriever {
  /**
   * 对 skills、mcp、knowledge 分别 top-K 检索后在应用层合并返回（知识库仍使用独立向量存储）
   */
  static async retrieveMerged(
    query: string,
    opts?: { topKSkills?: number; topKMcp?: number; topKnowledge?: number; knowledgeThreshold?: number }
  ): Promise<MergedRetrievalResult> {
    const q = (query || '').trim()
    if (!q) {
      return { skills: [], mcpTools: [], knowledgeSnippets: [] }
    }
    try {
      const res = await messageBridge.invoke('agent-capabilities-retrieve-merged', {
        query: q,
        topKSkills: opts?.topKSkills ?? 5,
        topKMcp: opts?.topKMcp ?? 5,
        topKnowledge: opts?.topKnowledge ?? 3,
        knowledgeThreshold: opts?.knowledgeThreshold ?? 0.45
      })
      if (!res?.success) {
        logger.warn('[RAGRetriever] retrieve-merged failed', res?.message)
        return { skills: [], mcpTools: [], knowledgeSnippets: [] }
      }
      return {
        skills: res.skills || [],
        mcpTools: res.mcpTools || [],
        knowledgeSnippets: res.knowledgeSnippets || []
      }
    } catch (e) {
      logger.error('[RAGRetriever] invoke error', e)
      return { skills: [], mcpTools: [], knowledgeSnippets: [] }
    }
  }
}

export class CapabilityRouter {
  /**
   * 内置工具简要列表按用户消息关键词截断为 top-K，并合并优先工具
   */
  static narrowBuiltinToolBriefs(
    briefs: Array<{ id: string; brief: string }>,
    userMessage: string,
    topK: number = DEFAULT_BUILTIN_TOOL_TOP_K
  ): Array<{ id: string; brief: string }> {
    const skillMode = messageTouchesSkills(userMessage)
    const ruleMode = messageTouchesRules(userMessage)
    const merged = new Map<string, { id: string; brief: string }>()

    if (skillMode) {
      for (const id of SKILL_MANAGEMENT_TOOL_IDS) {
        const f = briefs.find((b) => b.id === id)
        if (f) merged.set(f.id, { id: f.id, brief: f.brief })
      }
    }
    if (ruleMode) {
      for (const id of RULE_MANAGEMENT_TOOL_IDS) {
        const f = briefs.find((b) => b.id === id)
        if (f) merged.set(f.id, { id: f.id, brief: f.brief })
      }
    }
    for (const id of BUILTIN_TOOL_PRIORITY_IDS) {
      const f = briefs.find((b) => b.id === id)
      if (f) merged.set(f.id, { id: f.id, brief: f.brief })
    }

    if (briefs.length <= topK) {
      for (const b of briefs) {
        merged.set(b.id, { id: b.id, brief: b.brief })
      }
      return Array.from(merged.values())
    }

    const q = userMessage.toLowerCase()
    const tokens = q.split(/[^\w\u4e00-\u9fa5]+/).filter((t) => t.length > 1)
    const scored = briefs.map((b) => {
      const text = `${b.id} ${b.brief}`.toLowerCase()
      let s = 0
      for (const t of tokens) {
        if (text.includes(t)) s += 1
      }
      return { ...b, _s: s }
    })
    scored.sort((a, b) => b._s - a._s)
    const boost = (skillMode ? 6 : 0) + (ruleMode ? 4 : 0)
    const limit = boost > 0 ? Math.min(topK + boost, briefs.length) : topK
    for (const x of scored.slice(0, limit)) {
      merged.set(x.id, { id: x.id, brief: x.brief })
    }
    return Array.from(merged.values())
  }

  static buildIntentContextSupplement(retrieval: MergedRetrievalResult): string {
    let s = ''
    if (retrieval.skills.length > 0) {
      s += '\n## Relevant skills (lazy-load full SKILL.md via load_skill)\n'
      for (const sk of retrieval.skills) {
        const desc = (sk.description || '').slice(0, 160)
        s += `- **skillId=${sk.id}** ${sk.name}: ${desc}\n`
      }
    }
    if (retrieval.mcpTools.length > 0) {
      s += '\n## Relevant MCP tools (external adapter; respect permission_level)\n'
      for (const t of retrieval.mcpTools) {
        s += `- \`${t.server_name}::${t.tool_name}\` [${t.permission_level}]: ${(t.description || '').slice(0, 120)}\n`
      }
    }
    if (retrieval.knowledgeSnippets.length > 0) {
      s += '\n## Knowledge (top-K, separate vector store)\n'
      retrieval.knowledgeSnippets.forEach((k, i) => {
        s += `${i + 1}. ${k.slice(0, 500)}${k.length > 500 ? '…' : ''}\n`
      })
    }
    return s
  }
}
