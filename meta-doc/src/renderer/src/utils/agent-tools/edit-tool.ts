/**
 * 文档编辑 Tool（V2）：基于 anchor + context 的编辑引擎，无行号、无 unified diff 输入
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolProgress
} from '../../types/agent-tool'
import { useWorkspace } from '../../stores/workspace'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import EditDisplay from './components/EditDisplay.vue'
import { createDetailedError } from './tool-utils'
import messageBridge from '../../bridge/message-bridge'
import { useAgentEditStagingStore } from '../../stores/agent-edit-staging-store'
import { scheduleSkillIndexSyncAfterWrite } from '../agent-framework/skill-index-hook'
import type { UnifiedDiffHunk } from './edit-diff-parse'
import type { ApplyEditLogEntry, EditOperation, EditPlan } from './edit-engine'
import { applyEdits, EditEngineError } from './edit-engine'
import { notifyWorkspaceFilesystemChange } from '../workspace-fs-notify'

export type { UnifiedDiffHunk } from './edit-diff-parse'
export { parseUnifiedDiff } from './edit-diff-parse'
export type { EditOperation, EditPlan } from './edit-engine'

const logger = createRendererLogger('EditTool')
const workspace = useWorkspace()

function getWorkspaceRoots(): string[] {
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (!saved) return []
    const arr = JSON.parse(saved)
    return Array.isArray(arr)
      ? arr.filter((p: unknown) => typeof p === 'string' && p.length > 0)
      : []
  } catch {
    return []
  }
}

function resolveFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/') || /^[A-Za-z]:[/\\]/.test(normalized)) {
    return normalized
  }
  const roots = getWorkspaceRoots()
  const root = roots[0]
  if (!root) return normalized
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  return `${base}/${normalized}`
}

/** 工具回调与 EditDisplay 共用的结果形状 */
export interface EditResult {
  appliedEdits: number
  failedEdits: number
  hunks: UnifiedDiffHunk[]
  filePath?: string
  originalContent?: string
  newContent?: string
  engineLogs?: ApplyEditLogEntry[]
  /** 本轮传入的编辑意图（供 staging 与调试） */
  engineEdits?: EditOperation[]
  /** 旧版行号编辑（仅历史持久化数据可能含） */
  operations?: unknown[]
  rawDiff?: string
}

function parseEditPlan(params: Record<string, unknown>): EditPlan {
  const raw = params.editPlan ?? params.edits
  let obj: unknown = raw
  if (typeof params.editsJson === 'string' && params.editsJson.trim()) {
    try {
      obj = JSON.parse(params.editsJson as string)
    } catch {
      throw new Error('editsJson 不是合法 JSON')
    }
  }
  if (obj == null) {
    throw new Error('缺少 edits 或 editPlan')
  }
  if (Array.isArray(obj)) {
    return { edits: obj as EditOperation[] }
  }
  if (typeof obj === 'object' && obj !== null && Array.isArray((obj as EditPlan).edits)) {
    return obj as EditPlan
  }
  throw new Error('edits 必须为数组或含 edits 数组的对象')
}

function engineLogsToHunks(logs: ApplyEditLogEntry[]): UnifiedDiffHunk[] {
  return logs.map((log, i) => {
    const oldLines =
      log.oldSnippet.length === 0 ? [] : log.oldSnippet.split('\n').map((l) => l.replace(/\r$/, ''))
    const newLines =
      log.newSnippet.length === 0 ? [] : log.newSnippet.split('\n').map((l) => l.replace(/\r$/, ''))
    return {
      oldStart: i + 1,
      oldCount: oldLines.length,
      newStart: i + 1,
      newCount: newLines.length,
      oldLines,
      newLines,
      contextLines: [],
      displayLines: [
        ...oldLines.map((text) => ({ type: 'remove' as const, text })),
        ...newLines.map((text) => ({ type: 'add' as const, text }))
      ]
    }
  })
}

const editToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const tabId = params.tabId as string | undefined
  const filePathParam = params.filePath as string | undefined
  const rawParams = params as Record<string, unknown>

  if (
    rawParams.diff != null &&
    rawParams.edits == null &&
    rawParams.editPlan == null &&
    rawParams.editsJson == null
  ) {
    return {
      status: 'failed',
      error: createDetailedError(
        'edit 工具已升级为 V2：不再接受 `diff`（git unified diff）。请改用 `edits` 数组或 `editPlan`。',
        [
          '{"filePath":"path.md","edits":[{"id":"e1","type":"replace","target":{"anchor":"旧句","context_before":"","context_after":""},"content":"新句"}]}',
          '润色/替换：用 replace + anchor（及必要时 context）定位；新建空文件：一条 insert，anchor 为 ""，content 为全文'
        ],
        []
      )
    }
  }

  let plan: EditPlan
  try {
    plan = parseEditPlan(rawParams)
  } catch (e) {
    return {
      status: 'failed',
      error: createDetailedError(
        e instanceof Error ? e.message : String(e),
        [
          '{"filePath":"src/a.md","edits":[{"id":"e1","type":"replace","target":{"anchor":"旧词","context_before":"前文","context_after":"后文"},"content":"新词"}]}',
          '或 {"edits": [ ... ]}，每条含 id、type、target.anchor、按需 content'
        ],
        []
      )
    }
  }

  if (!plan.edits.length) {
    return {
      status: 'failed',
      error: createDetailedError('edits 数组不能为空', [], [])
    }
  }

  const sendProgress = (
    stage: string,
    pct: number,
    msg: string,
    extra?: Record<string, unknown>
  ) => {
    onUpdate(
      {
        content: { stage, filePath: extra?.filePath, editCount: plan.edits.length, ...extra },
        format: 'json',
        componentName: 'EditDisplay'
      },
      { percentage: pct, message: msg } as ToolProgress
    )
  }

  try {
    sendProgress(
      'loading',
      10,
      i18n.global.t('agent.tool.edit.progress.loading', '正在解析编辑计划...')
    )

    // —— 磁盘文件分支 ——
    if (filePathParam) {
      if (!messageBridge.getIpc()?.invoke) {
        return {
          status: 'failed',
          error: createDetailedError('filePath 编辑需要 IPC（仅 Electron）', [], [])
        }
      }
      const absPath = resolveFilePath(filePathParam)
      let currentContent: string | null = null
      try {
        currentContent = (await messageBridge.invoke('read-file-content', absPath)) as string | null
      } catch (e) {
        logger.warn('read-file-content failed', e)
      }
      const baseline = currentContent ?? ''
      const isNew = currentContent === null || currentContent === undefined

      sendProgress(
        'applying',
        40,
        i18n.global.t('agent.tool.edit.progress.applying', '正在应用编辑...'),
        {
          filePath: absPath
        }
      )

      let resultText: string
      let logs: ApplyEditLogEntry[]
      try {
        const out = applyEdits(baseline, plan.edits, {
          onLog: (m, d) => logger.debug(m, d)
        })
        resultText = out.text
        logs = out.logs
      } catch (err) {
        if (err instanceof EditEngineError) {
          return {
            status: 'failed',
            error: createDetailedError(
              `${err.code}: ${err.message}`,
              [
                '确认 anchor 与 context 在文件中唯一匹配',
                '多候选会报 AMBIGUOUS_MATCH，找不到则 TARGET_NOT_FOUND'
              ],
              []
            )
          }
        }
        throw err
      }

      if (signal?.aborted) return { status: 'cancelled' }

      sendProgress(
        'updating',
        80,
        i18n.global.t('agent.tool.edit.progress.updating', '正在写入文件...'),
        {
          filePath: absPath
        }
      )

      await messageBridge.invoke('write-file-content', { filePath: absPath, content: resultText })
      scheduleSkillIndexSyncAfterWrite(absPath)
      if (isNew) {
        notifyWorkspaceFilesystemChange(absPath, 'add')
      }

      try {
        const sid = params._sessionId as string | undefined
        const umid = params._userMessageId as string | undefined
        if (sid && umid) {
          if (isNew && baseline === '') {
            useAgentEditStagingStore().pushFileCheckpoint(sid, umid, {
              filePath: absPath,
              type: 'create',
              newContent: resultText,
              operations: []
            })
          } else {
            useAgentEditStagingStore().pushFileCheckpoint(sid, umid, {
              filePath: absPath,
              type: 'edit',
              oldContent: baseline,
              newContent: resultText,
              operations: plan.edits
            })
          }
        }
      } catch {
        /* ignore */
      }

      const hunks = engineLogsToHunks(logs)
      const fileResult: EditResult = {
        appliedEdits: logs.length,
        failedEdits: 0,
        hunks,
        filePath: absPath,
        originalContent: baseline,
        newContent: resultText,
        engineLogs: logs,
        engineEdits: plan.edits
      }

      return {
        status: 'succeeded',
        data: {
          content: { stage: 'completed', result: fileResult, filePath: absPath },
          format: 'json',
          componentName: 'EditDisplay'
        },
        result: {
          appliedEdits: fileResult.appliedEdits,
          failedEdits: 0,
          hunks,
          filePath: absPath,
          engineLogs: logs
        }
      }
    }

    // —— 当前文档 tab ——
    const candidateTabId = tabId || workspace.activeTabId.value
    if (!candidateTabId) {
      return {
        status: 'failed',
        error: createDetailedError(
          '未指定要编辑的文档',
          [
            '请传 filePath 或打开文档标签页',
            '{"tabId":"...","edits":[...]} 或 {"filePath":"rel.md","edits":[...]}'
          ],
          []
        )
      }
    }
    const tab = (workspace.tabs as { id: string; kind?: string }[]).find(
      (t) => t.id === candidateTabId
    )
    const isDocumentTab = tab && (tab.kind === 'file' || tab.kind === 'new')
    if (!isDocumentTab) {
      return {
        status: 'failed',
        error: createDetailedError('当前活动标签页不是文档', ['请先打开文档或传入 filePath'], [])
      }
    }

    const doc = workspace.ensureDocument(candidateTabId)
    if (!doc) {
      return {
        status: 'failed',
        error: createDetailedError('文档不存在', [], [])
      }
    }

    let currentFormat = doc.format
    if (!currentFormat || (doc.markdown.trim().length === 0 && doc.tex.trim().length === 0)) {
      if (doc.markdown.trim().length > 0) {
        const latexPatterns = [
          /\\documentclass/i,
          /\\begin\{document\}/i,
          /\\section\{/i,
          /\\usepackage\{/i
        ]
        currentFormat = latexPatterns.some((p) => p.test(doc.markdown)) ? 'tex' : 'md'
      } else if (doc.tex.trim().length > 0) {
        currentFormat = 'tex'
      } else {
        currentFormat = 'md'
      }
    }
    const docContent = currentFormat === 'md' ? doc.markdown : doc.tex
    const baseline = docContent

    sendProgress(
      'applying',
      40,
      i18n.global.t('agent.tool.edit.progress.applying', '正在应用编辑...')
    )

    let resultText: string
    let logs: ApplyEditLogEntry[]
    try {
      const out = applyEdits(baseline, plan.edits, {
        onLog: (m, d) => logger.debug(m, d)
      })
      resultText = out.text
      logs = out.logs
    } catch (err) {
      if (err instanceof EditEngineError) {
        return {
          status: 'failed',
          error: createDetailedError(`${err.code}: ${err.message}`, [], [])
        }
      }
      throw err
    }

    if (signal?.aborted) return { status: 'cancelled' }

    sendProgress(
      'updating',
      80,
      i18n.global.t('agent.tool.edit.progress.updating', '正在更新文档...')
    )

    if (currentFormat === 'md') {
      workspace.updateDocumentMarkdown(candidateTabId, resultText)
    } else {
      workspace.updateDocumentTex(candidateTabId, resultText)
    }

    try {
      await workspace.saveDocument(candidateTabId)
    } catch (e) {
      logger.warn('编辑后保存到磁盘失败', e)
    }

    const tabPath =
      (tab as { path?: string }).path != null ? String((tab as { path?: string }).path) : undefined
    try {
      const sid = params._sessionId as string | undefined
      const umid = params._userMessageId as string | undefined
      if (sid && umid && tabPath) {
        useAgentEditStagingStore().pushFileCheckpoint(sid, umid, {
          filePath: tabPath,
          type: 'edit',
          oldContent: baseline,
          newContent: resultText,
          operations: plan.edits
        })
      }
    } catch {
      /* ignore */
    }

    const hunks = engineLogsToHunks(logs)
    const display: EditResult = {
      appliedEdits: logs.length,
      failedEdits: 0,
      hunks,
      originalContent: baseline,
      newContent: resultText,
      filePath: tabPath,
      engineLogs: logs,
      engineEdits: plan.edits
    }

    return {
      status: 'succeeded',
      data: {
        content: { stage: 'completed', result: display },
        format: 'json',
        componentName: 'EditDisplay'
      },
      result: {
        appliedEdits: display.appliedEdits,
        failedEdits: 0,
        hunks,
        engineLogs: logs
      }
    }
  } catch (error) {
    logger.error('编辑失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const EDIT_TOOL_DESCRIPTION =
  'Anchor-based `edits`: insert_at before|after; insert_newline_policy auto|none (default auto: avoids same-line glue after insert); match_scope anchor|full for replace/delete—full deletes/replaces the entire literal before+anchor+after string (use anchor scope to affect only anchor text while contexts disambiguate). Empty anchor with context when unique.'

/** 与 edit-engine EditOperation 对齐，供 JSON Schema `items` 使用（兼容严格网关） */
const EDIT_OPERATION_ITEM_JSON_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['replace', 'insert', 'delete'] },
    target: {
      type: 'object',
      properties: {
        anchor: { type: 'string' },
        context_before: { type: 'string' },
        context_after: { type: 'string' }
      },
      required: ['anchor']
    },
    content: { type: 'string' },
    insert_at: { type: 'string', enum: ['before', 'after'] },
    match_scope: { type: 'string', enum: ['anchor', 'full'] },
    insert_newline_policy: { type: 'string', enum: ['auto', 'none'] }
  },
  required: ['id', 'type', 'target']
} as const

export const editToolConfig: AgentToolConfig = {
  id: 'edit',
  name: 'Document Edit',
  description: EDIT_TOOL_DESCRIPTION,
  origin: 'internal',
  instruction:
    'JSON edits: insert uses insert_newline_policy "auto" (default) to prevent new text sticking to the same line as the anchor (adds \\n when needed); set "none" for raw splice. match_scope "full" replace/delete removes the ENTIRE single exact match of context_before+anchor+context_after—NOT just the heading. To delete only "### New" while using long contexts for uniqueness, omit match_scope or use "anchor" (default). insert_at before|after. filePath or tabId.',
  spec: {
    name: 'edit',
    brief:
      'Stable text edits via anchor + optional context; batch `edits` array; target file with `filePath` or document tab.',
    fullSpec: `
# Document Edit (V2)

## Parameters
- **edits**: JSON array of operations (or **editPlan**: \`{ "edits": [...] }\`).
- **filePath**: Workspace-relative or absolute path to edit on disk (recommended).
- **tabId**: Optional document tab id; if omitted with no filePath, uses active document tab.

## Operation shape
\`\`\`json
{
  "id": "edit-1",
  "type": "replace | insert | delete",
  "target": {
    "anchor": "string (may be empty if context pins location)",
    "context_before": "optional",
    "context_after": "optional"
  },
  "content": "required for replace/insert",
  "insert_at": "before | after",
  "insert_newline_policy": "auto | none",
  "match_scope": "anchor | full"
}
\`\`\`

## Rules
- **anchor** matching uses context; multiple matches → error. Whitespace-flexible fallback when only anchor is used without context.
- **replace/delete (default match_scope anchor)**: only the **anchor** substring is replaced/deleted; **context_before/after** narrow the match.
- **match_scope: full**: replace/delete the **entire one substring** equal to **context_before + anchor + context_after** (can be huge). **Do not use full** if you only want to remove the anchor line—use default **anchor** with the same contexts.
- **insert**: **insert_at** after (default) or before. **insert_newline_policy auto** (default): after non-empty anchor, skip one following \\n to insert on the next line when present; if still glued to same line as following text, prefix/suffix \\n as needed. **none**: exact byte splice.
- **Empty anchor** on non-empty files: context must make **before+anchor+after** exactly unique (precise match).
- **delete** with empty anchor: **match_scope: full** and contexts.
- Apply **edits** in order.

## Examples
Replace whole block (full): \`{"type":"replace","match_scope":"full","target":{"anchor":"## H","context_after":"\\\\nbody\\\\n"},"content":"## New\\\\n"}\`
Delete only a heading (anchor scope): \`{"type":"delete","target":{"anchor":"### New","context_before":"...","context_after":"..."}}\`
Insert before title: \`{"type":"insert","insert_at":"before","target":{"anchor":"# Title"},"content":"Preamble\\\\n"}\`
Insert after heading line: \`{"type":"insert","target":{"anchor":"# Title\\\\n"},"content":"Intro\\\\n"}\`
`
  },
  callback: editToolCallback,
  get displayComponent() {
    return EditDisplay
  },
  tags: ['edit', 'document', 'text'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: EDIT_OPERATION_ITEM_JSON_SCHEMA,
        description:
          '编辑意图：target + content；insert_at、insert_newline_policy:auto|none；match_scope:full 会替换/删除整段 before+anchor+after 字面量，仅删锚段请用默认 anchor'
      },
      editPlan: {
        type: 'object',
        description: '与 { edits: [...] } 等价，可与 edits 二选一',
        properties: {
          edits: {
            type: 'array',
            items: EDIT_OPERATION_ITEM_JSON_SCHEMA
          }
        }
      },
      editsJson: {
        type: 'string',
        description: '整段 JSON 字符串（edits 数组或含 edits 的对象），与 edits 二选一'
      },
      filePath: {
        type: 'string',
        description: '工作区相对或绝对路径；编辑磁盘文件时推荐'
      },
      tabId: {
        type: 'string',
        description: '文档标签页 ID（可选）'
      }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      appliedEdits: { type: 'number' },
      failedEdits: { type: 'number' },
      hunks: { type: 'array', items: {} },
      engineLogs: { type: 'array', items: {} }
    }
  }
}
