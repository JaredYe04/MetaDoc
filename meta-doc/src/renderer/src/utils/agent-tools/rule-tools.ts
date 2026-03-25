/**
 * 动态 Agent 规则：通过主进程 SQLite 写入，禁止用「写规则文件」代替
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

function clampPriority(p: unknown): number {
  const n = typeof p === 'number' ? p : parseInt(String(p), 10)
  if (Number.isNaN(n)) return 90
  return Math.min(100, Math.max(0, Math.round(n)))
}

const createDynamicRuleCallback: ToolCallback = async (params, _signal, onUpdate) => {
  const title = String(params.title ?? '').trim()
  const content = String(params.content ?? '').trim()
  if (!title) {
    return {
      status: 'failed',
      error: createDetailedError('缺少 title', ['{"title": "…", "content": "…"}'], [])
    }
  }
  if (!content) {
    return {
      status: 'failed',
      error: createDetailedError('缺少 content', ['{"title": "…", "content": "…"}'], [])
    }
  }
  const priority = clampPriority(params.priority ?? 90)
  const source = params.source === 'user' ? 'user' : 'agent'
  onUpdate(
    { content: { stage: 'inserting', title }, format: 'json' } as ToolCallbackData,
    {
      percentage: 40,
      message: 'Inserting dynamic rule…'
    } as ToolProgress
  )
  const res = await messageBridge.invoke('agent-capabilities-insert-dynamic-rule', {
    title,
    content,
    priority,
    source
  })
  if (!res?.success) {
    return { status: 'failed', error: res?.message || 'insert-dynamic-rule failed' }
  }
  const out = { ruleId: res.id, title, priority, source }
  return {
    status: 'succeeded',
    result: JSON.stringify(out, null, 2),
    data: { content: out, format: 'json' }
  }
}

const updateDynamicRuleCallback: ToolCallback = async (params, _signal, onUpdate) => {
  const rawId = params.ruleId ?? params.id
  const id = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10)
  if (Number.isNaN(id)) {
    return {
      status: 'failed',
      error: createDetailedError('缺少 ruleId', ['{"ruleId": 1, "content": "…"}'], [])
    }
  }
  const patch: { id: number; title?: string; content?: string; priority?: number } = { id }
  if (params.title !== undefined && params.title !== null) {
    patch.title = String(params.title).trim()
  }
  if (params.content !== undefined && params.content !== null) {
    patch.content = String(params.content).trim()
  }
  if (params.priority !== undefined && params.priority !== null) {
    patch.priority = clampPriority(params.priority)
  }
  if (patch.title === undefined && patch.content === undefined && patch.priority === undefined) {
    return {
      status: 'failed',
      error: createDetailedError(
        '至少提供 title、content、priority 之一',
        ['{"ruleId": 1, "content": "…"}'],
        []
      )
    }
  }
  onUpdate(
    { content: { stage: 'updating', ruleId: id }, format: 'json' } as ToolCallbackData,
    {
      percentage: 40,
      message: 'Updating dynamic rule…'
    } as ToolProgress
  )
  const res = await messageBridge.invoke('agent-capabilities-update-rule', patch)
  if (!res?.success) {
    return { status: 'failed', error: res?.message || 'update-rule failed' }
  }
  const out = { ruleId: id, ...patch }
  return {
    status: 'succeeded',
    result: JSON.stringify(out, null, 2),
    data: { content: out, format: 'json' }
  }
}

const CREATE_RULE_NAME = 'Create Dynamic Rule'
const CREATE_RULE_DESCRIPTION =
  'Insert a dynamic Agent rule into the app database (not a file). Use when the user wants MetaDoc prompt rules / 动态规则.'
const CREATE_RULE_INSTRUCTION = `## Create Dynamic Rule
Required: \`title\`, \`content\` (markdown or plain text).
Optional: \`priority\` (0–100, default 90; higher sorts first). \`source\`: \`agent\` (pending approval, default) or \`user\` (pre-approved).
Do **not** create a random file to represent rules; always use this tool or the capabilities UI.`

const UPDATE_RULE_NAME = 'Update Dynamic Rule'
const UPDATE_RULE_DESCRIPTION =
  'Update an existing dynamic rule by database id (from list in Agent → Rules / Skills / MCP).'
const UPDATE_RULE_INSTRUCTION = `## Update Dynamic Rule
Required: \`ruleId\` (number).
At least one of: \`title\`, \`content\`, \`priority\` (0–100). System rules cannot be updated.`

export const createDynamicRuleToolConfig: AgentToolConfig = {
  id: 'create_dynamic_rule',
  name: CREATE_RULE_NAME,
  description: CREATE_RULE_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'create_dynamic_rule',
    brief:
      'Add a dynamic rule to SQLite for system-prompt injection; do not use workspace files for rules.',
    fullSpec: CREATE_RULE_INSTRUCTION
  },
  instruction: CREATE_RULE_INSTRUCTION,
  callback: createDynamicRuleCallback,
  enabled: true,
  editable: false,
  tags: ['rules', 'capabilities']
}

export const updateDynamicRuleToolConfig: AgentToolConfig = {
  id: 'update_dynamic_rule',
  name: UPDATE_RULE_NAME,
  description: UPDATE_RULE_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'update_dynamic_rule',
    brief: 'Patch title/content/priority of a dynamic rule by ruleId.',
    fullSpec: UPDATE_RULE_INSTRUCTION
  },
  instruction: UPDATE_RULE_INSTRUCTION,
  callback: updateDynamicRuleCallback,
  enabled: true,
  editable: false,
  tags: ['rules', 'capabilities']
}
