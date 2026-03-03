/**
 * 校对Tool
 * 检查文本中的语法错误、拼写错误、LaTeX语法错误
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import type { DocumentOutlineNode } from '@/types'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { getSetting } from '../settings'
import messageBridge from '../../bridge/message-bridge'
import { webMainCalls } from '../web-adapter/web-main-calls'
import axios from 'axios'
import ProofreadDisplay from './components/ProofreadDisplay.vue'
import {
  cleanJsonString,
  parseJsonWithClean,
  parsePartialJsonArray,
  createDetailedError,
  retryLLMCall
} from './tool-utils'
import { extractOuterJsonString } from '../regex-utils'
import { useWorkspace } from '../../stores/workspace'
import { searchNode } from '../outline-helpers'
import { getActiveDocumentInfoViaBroadcast } from './document-broadcast-helper'
import { getWindowType } from '../event-bus'
import { getLocale } from '../../i18n'

// 懒加载logger，避免初始化顺序问题
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('ProofreadTool')
  }
  return loggerInstance
}

const workspace = useWorkspace()

if (typeof window !== 'undefined' && !(window as any).electron?.ipcRenderer) {
  webMainCalls()
}

/**
 * 错误类型
 */
export type ErrorType = 'grammar' | 'spelling' | 'latex' | 'style' | 'other'

/**
 * 校对错误
 */
export interface ProofreadError {
  type: ErrorType
  line: number // 行号（1-based）
  column: number // 列号（1-based）
  length: number // 错误文本长度
  text: string // 错误的文本
  suggestion: string // 修改建议（第一个建议，向后兼容）
  suggestions: string[] // 修改建议列表（1-5个）
  message: string // 错误描述
  severity: 'error' | 'warning' | 'info' // 严重程度
  fixed?: boolean // 是否已自动修复（可选）
  selectedSuggestion?: string // 用户选择的建议（可选）
}

/**
 * 校对结果
 */
export interface ProofreadResult {
  errors: ProofreadError[]
  totalErrors: number
  errorCounts: Record<ErrorType, number>
  text: string
  format: 'text' | 'markdown' | 'latex'
  fixedCount?: number // 已修复的错误数量（可选）
  autoFixed?: boolean // 是否已自动应用修复（可选）
}

/**
 * 从文件路径读取内容
 */
async function loadTextFromFile(filePath: string, signal?: AbortSignal): Promise<string> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC渲染器不可用，无法读取文件')
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  try {
    const content = (await messageBridge.invoke('read-file-content', filePath)) as string | null
    if (content === null || content === undefined) {
      throw new Error('文件内容为空或文件不存在')
    }
    if (typeof content !== 'string') {
      throw new Error('文件内容格式错误')
    }
    return content
  } catch (error) {
    getLogger().error('读取文件失败:', error)
    throw new Error(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 从URL获取内容
 */
async function loadTextFromUrl(url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  try {
    // 优先使用主进程代理（避免CORS）
    if (messageBridge.getIpc()) {
      try {
        const response = (await messageBridge.invoke('execute-http-request', {
          url,
          method: 'GET',
          timeout: 30000,
          maxRedirects: 5
        })) as { content: string }
        return response.content
      } catch (error) {
        getLogger().warn('主进程HTTP请求失败，尝试使用axios:', error)
      }
    }

    // 使用axios作为后备
    const response = await axios.get(url, {
      timeout: 30000,
      signal,
      responseType: 'text',
      validateStatus: () => true
    })

    if (response.status >= 200 && response.status < 300) {
      return response.data
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ERR_CANCELED') {
        throw new Error('请求已取消')
      }
      throw new Error(`从URL获取数据失败: ${error.message}`)
    }
    getLogger().error('从URL获取数据失败:', error)
    throw error
  }
}

/**
 * 验证错误信息是否准确
 * @param error 错误对象
 * @param originalText 原始文本
 * @returns 验证后的错误对象，如果验证失败返回null
 */
function validateError(error: ProofreadError, originalText: string): ProofreadError | null {
  const lines = originalText.split('\n')

  // 验证行号范围
  if (error.line < 1 || error.line > lines.length) {
    getLogger().warn(
      `[validateError] 行号 ${error.line} 超出范围 [1, ${lines.length}]，跳过错误:`,
      JSON.stringify(error)
    )
    return null
  }

  const lineIndex = error.line - 1
  const line = lines[lineIndex]

  // 验证列号范围
  if (error.column < 1 || error.column > line.length) {
    getLogger().warn(
      `[validateError] 列号 ${error.column} 超出范围 [1, ${line.length}]，行 ${error.line}，跳过错误:`,
      JSON.stringify(error)
    )
    return null // Intentionally returning null - validation failed
  }

  // 验证错误文本是否匹配
  const actualText = line.substring(error.column - 1, error.column - 1 + error.length)

  if (actualText !== error.text) {
    // 尝试在附近查找错误文本（允许一定的容错）
    const searchStart = Math.max(0, error.column - 1 - 10)
    const searchEnd = Math.min(line.length, error.column - 1 + error.length + 10)
    const searchArea = line.substring(searchStart, searchEnd)

    if (searchArea.includes(error.text)) {
      // 找到了，但位置不对，尝试修正列号
      const foundIndex = line.indexOf(error.text, searchStart)
      if (foundIndex !== -1) {
        getLogger().warn(
          `[validateError] 错误文本位置不准确，从列 ${error.column} 修正为 ${foundIndex + 1}:`,
          error.text
        )
        return {
          ...error,
          column: foundIndex + 1
        }
      }
    }

    // 如果找不到，记录警告并跳过
    getLogger().warn(
      `[validateError] 错误文本不匹配，期望 "${error.text}"，实际 "${actualText}"，行 ${error.line} 列 ${error.column}，跳过错误`
    )
    getLogger().debug(`[validateError] 行内容: "${line}"`)
    return null
  }

  return error
}

/**
 * 通过 IPC 调用主进程的拼写检查服务
 */
async function proofreadWithCSpell(
  text: string,
  format: 'text' | 'markdown' | 'latex',
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<ProofreadError[]> {
  getLogger().info('[proofreadWithCSpell] 开始通过 IPC 调用主进程拼写检查服务')
  getLogger().debug('[proofreadWithCSpell] 文本长度:', text.length)
  getLogger().debug('[proofreadWithCSpell] 文本格式:', format)

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  // 更新进度
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'proofreading',
          format
        },
        format: 'json'
      },
      {
        percentage: 30,
        message: '正在使用拼写检查器检查文本...'
      }
    )
  }

  try {
    if (!messageBridge.getIpc()) {
      throw new Error('IPC渲染器不可用，无法调用拼写检查服务')
    }

    // 获取当前用户选择的语言
    // 确保使用正确的格式（下划线格式，如 'fr_FR', 'zh_CN'）
    let currentLocale = getLocale()

    // 标准化语言格式：将连字符转换为下划线，确保格式一致
    // i18n 使用下划线格式（zh_CN, fr_FR），但某些地方可能使用连字符（zh-CN, fr-FR）
    if (currentLocale && typeof currentLocale === 'string') {
      currentLocale = currentLocale.replace('-', '_')
    }

    // 如果获取失败，尝试从 localStorage 获取
    if (!currentLocale || currentLocale === 'zh_CN') {
      const savedLang = localStorage.getItem('lang')
      if (savedLang) {
        currentLocale = savedLang.replace('-', '_')
      }
    }

    // 确保有默认值
    if (!currentLocale) {
      currentLocale = 'zh_CN'
    }

    getLogger().debug('[proofreadWithCSpell] 使用语言:', currentLocale, '格式:', format)

    const result = (await messageBridge.invoke('spell-check', {
      text: text,
      format: format,
      locale: currentLocale
    })) as {
      issues: Array<{ offset: number; length: number; text: string; suggestions?: string[] }>
    }

    getLogger().info(
      '[proofreadWithCSpell] 主进程拼写检查完成，发现',
      result.issues?.length || 0,
      '个问题'
    )

    // 将主进程返回的结果转换为 ProofreadError 格式
    const errors: ProofreadError[] = []
    const lines = text.split('\n')

    if (result.issues && Array.isArray(result.issues) && result.issues.length > 0) {
      for (const issue of result.issues) {
        // 计算行号和列号
        // cspell 的 issue 包含 offset 和 length
        const issueOffset = issue.offset || 0
        let currentOffset = 0
        let lineNumber = 1
        let columnNumber = 1

        // 找到错误所在的行
        for (let i = 0; i < lines.length; i++) {
          const lineLength = lines[i].length + 1 // +1 是换行符
          if (currentOffset + lineLength > issueOffset) {
            lineNumber = i + 1
            columnNumber = issueOffset - currentOffset + 1
            break
          }
          currentOffset += lineLength
        }

        // 验证 issue 对象
        if (!issue || typeof issue !== 'object') {
          getLogger().warn('[proofreadWithCSpell] 跳过无效的 issue 对象:', issue)
          continue
        }

        // 获取错误文本
        const issueLength = (issue.length ?? 0) || (issue.text?.length ?? 0) || 0
        const errorText =
          issue.text || (text ? text.substring(issueOffset, issueOffset + issueLength) : '')

        if (!errorText) {
          getLogger().warn('[proofreadWithCSpell] 跳过无文本的 issue:', issue)
          continue
        }

        // 获取建议列表（最多5个，如果没有则使用原文本作为默认建议）
        const allSuggestions =
          issue.suggestions && Array.isArray(issue.suggestions) && issue.suggestions.length > 0
            ? issue.suggestions.slice(0, 5) // 最多取5个建议
            : [errorText]
        const firstSuggestion = allSuggestions[0] || errorText

        // 创建错误对象
        const error: ProofreadError = {
          type: 'spelling',
          line: lineNumber,
          column: columnNumber,
          length: issueLength,
          text: errorText,
          suggestion: firstSuggestion, // 向后兼容：第一个建议
          suggestions: allSuggestions, // 所有建议列表
          message: `拼写错误：${errorText}${allSuggestions.length > 0 ? `，建议：${allSuggestions.join('、')}` : ''}`,
          severity: 'error'
        }

        // 验证错误
        const validatedError = validateError(error, text)
        if (validatedError) {
          errors.push(validatedError)
        }
      }
    }

    getLogger().info('[proofreadWithCSpell] ✅ 拼写检查完成，有效错误数量:', errors.length)
    return errors
  } catch (error) {
    getLogger().error('[proofreadWithCSpell] 拼写检查失败:', error)
    throw new Error(`拼写检查失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 从文档中根据节点路径获取文本内容
 * @param nodePath 节点路径
 * @param tabId 文档标签页ID（可选）
 * @param mockDocument 测试环境下的mock文档数据（可选）
 */
async function getTextByNodePath(
  nodePath: string,
  tabId?: string,
  mockDocument?: { content: string; format: 'text' | 'markdown' | 'latex'; outline?: any }
): Promise<{ content: string; format: 'text' | 'markdown' | 'latex' }> {
  // 如果提供了 mock 数据（测试环境），直接使用
  if (mockDocument) {
    // 从 mock 文档中提取节点内容（简化实现，实际应该根据 outline 提取）
    return { content: mockDocument.content, format: mockDocument.format }
  }

  const windowType = getWindowType()
  let doc: any = null
  let targetTabId: string | null = null

  // 检查窗口类型是否支持文档上下文
  if (windowType === 'system' || windowType === 'tool') {
    throw new Error('工具Tab或系统Tab (system) 不应该有文档上下文')
  }

  if (windowType === 'setting') {
    const docInfo = await getActiveDocumentInfoViaBroadcast()
    if (!docInfo) {
      throw new Error('没有活动的文档标签页')
    }
    doc = {
      markdown: docInfo.markdown,
      tex: docInfo.tex,
      format: docInfo.format,
      outline: docInfo.outline
    }
    targetTabId = docInfo.tabId
  } else {
    targetTabId = tabId || workspace.activeTabId.value
    if (!targetTabId) {
      throw new Error('没有活动的文档标签页')
    }
    doc = workspace.ensureDocument(targetTabId)
    if (!doc) {
      throw new Error('文档不存在')
    }
  }

  // 查找节点
  const node = searchNode(nodePath, doc.outline)
  if (!node) {
    throw new Error(`找不到路径为 ${nodePath} 的节点`)
  }

  // 获取节点文本（包括该节点及其所有子节点的文本）
  const getNodeText = (n: DocumentOutlineNode): string => {
    let text = n.text || ''
    if (n.children && n.children.length > 0) {
      for (const child of n.children) {
        const childText = getNodeText(child)
        if (childText) {
          text += (text ? '\n\n' : '') + childText
        }
      }
    }
    return text
  }

  const content = getNodeText(node)
  const format = doc.format === 'tex' ? 'latex' : doc.format === 'md' ? 'markdown' : 'text'

  return { content, format }
}

/**
 * 获取当前活动文档的全文
 * @param tabId 文档标签页ID（可选）
 * @param mockDocument 测试环境下的mock文档数据（可选）
 */
async function getFullDocumentText(
  tabId?: string,
  mockDocument?: { content: string; format: 'text' | 'markdown' | 'latex' }
): Promise<{ content: string; format: 'text' | 'markdown' | 'latex' }> {
  // 如果提供了 mock 数据（测试环境），直接返回
  if (mockDocument) {
    return mockDocument
  }

  const windowType = getWindowType()
  let doc: any = null
  let targetTabId: string | null = null

  // 检查窗口类型是否支持文档上下文
  if (windowType === 'system' || windowType === 'tool') {
    throw new Error('工具Tab或系统Tab (system) 不应该有文档上下文')
  }

  if (windowType === 'setting') {
    const docInfo = await getActiveDocumentInfoViaBroadcast()
    if (!docInfo) {
      throw new Error('没有活动的文档标签页')
    }
    doc = {
      markdown: docInfo.markdown,
      tex: docInfo.tex,
      format: docInfo.format
    }
    targetTabId = docInfo.tabId
  } else {
    targetTabId = tabId || workspace.activeTabId.value
    if (!targetTabId) {
      throw new Error('没有活动的文档标签页')
    }
    doc = workspace.ensureDocument(targetTabId)
    if (!doc) {
      throw new Error('文档不存在')
    }
  }

  const content = doc.format === 'md' ? doc.markdown : doc.tex
  const format = doc.format === 'tex' ? 'latex' : doc.format === 'md' ? 'markdown' : 'text'

  return { content, format }
}

/**
 * 校对Tool回调函数
 */
export const proofreadToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // 支持多种参数格式：
  // 1. 直接文本：{ text: "...", source: "text", format: "text|markdown|latex" }
  // 2. 文件路径：{ text: "/path/to/file", source: "file" }
  // 3. URL：{ text: "https://...", source: "url" }
  // 4. 全文比对：{ source: "document" } 或 {}（不提供text和nodePath）
  // 5. 段落比对：{ nodePath: "1.1" }（根据大纲节点路径）

  const text = params.text as string | undefined
  const source: 'text' | 'file' | 'url' | 'document' =
    (params.source as 'text' | 'file' | 'url' | 'document') ||
    (text ? ('text' as const) : ('document' as const))
  const format = (params.format as 'text' | 'markdown' | 'latex' | undefined) || undefined
  const nodePath = params.nodePath as string | undefined
  const tabId = params.tabId as string | undefined

  // 如果提供了nodePath，使用段落比对
  if (nodePath) {
    try {
      // 支持测试环境的 mock 数据（通过 _mockDocument 参数传入）
      const mockDocument = (params as any)._mockDocument as
        | { content: string; format: 'text' | 'markdown' | 'latex'; outline?: any }
        | undefined
      const { content, format: docFormat } = await getTextByNodePath(nodePath, tabId, mockDocument)
      return await performProofread(content, docFormat, signal, onUpdate, tabId, false)
    } catch (error) {
      return {
        status: 'failed',
        error: createDetailedError(
          `根据节点路径获取文本失败: ${error instanceof Error ? error.message : String(error)}`,
          [
            '{"nodePath": "1"}  // 校对第一个章节',
            '{"nodePath": "1.1"}  // 校对第一个章节的第一个子章节',
            '{"nodePath": "1.2.3"}  // 校对更深层的章节'
          ],
          [
            'nodePath格式：使用点号分隔的路径，如"1"、"1.1"、"1.2.3"',
            '可查看引用素材中的「当前文档内容」了解章节结构，或使用 workspace（工作区文件读取）工具查看文件',
            '校对的内容包括该节点及其所有子节点的文本',
            '测试环境：可以通过 _mockDocument 参数传入 mock 文档数据'
          ]
        )
      }
    }
  }

  // 如果source为document或未提供text和nodePath，使用全文比对
  if ((source as string) === 'document' || (!text && !nodePath)) {
    try {
      // 支持测试环境的 mock 数据（通过 _mockDocument 参数传入）
      const mockDocument = (params as any)._mockDocument as
        | { content: string; format: 'text' | 'markdown' | 'latex' }
        | undefined
      const { content, format: docFormat } = await getFullDocumentText(tabId, mockDocument)
      return await performProofread(content, docFormat, signal, onUpdate, tabId, false)
    } catch (error) {
      return {
        status: 'failed',
        error: createDetailedError(
          `获取文档全文失败: ${error instanceof Error ? error.message : String(error)}`,
          [
            '{}  // 校对当前活动文档的全文',
            '{"source": "document"}  // 明确指定校对全文',
            '{"source": "document", "tabId": "文档ID"}  // 指定文档ID'
          ],
          [
            '不提供text和nodePath参数时，默认校对当前活动文档的全文',
            '可以通过tabId参数指定要校对的文档',
            '支持Markdown和LaTeX格式的文档',
            '测试环境：可以通过 _mockDocument 参数传入 mock 文档数据'
          ]
        )
      }
    }
  }

  // 其他情况：使用text参数（source为text/file/url）
  if (!text || text.trim().length === 0) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: 必须提供 text、nodePath 之一，或使用 source: "document" 校对全文',
        [
          '{"text": "要校对的文本内容", "source": "text", "format": "markdown"}',
          '{"nodePath": "1.1"}  // 校对指定章节',
          '{}  // 校对当前文档全文',
          '{"source": "document"}  // 校对当前文档全文'
        ],
        [
          '方式1：直接提供文本内容（text参数）',
          '方式2：提供节点路径（nodePath参数），校对指定章节',
          '方式3：不提供参数或source: "document"，校对当前文档全文',
          '支持Markdown、LaTeX和纯文本格式'
        ]
      )
    }
  }

  // 加载文本
  let content: string
  let finalFormat: 'text' | 'markdown' | 'latex' =
    (format as 'text' | 'markdown' | 'latex') || 'text'

  try {
    onUpdate(
      {
        content: {
          stage: 'loading',
          source,
          format: finalFormat
        },
        format: 'json',
        componentName: 'ProofreadDisplay'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.proofread.progress.loading', '正在加载文本...')
      }
    )

    if (source === 'file') {
      content = await loadTextFromFile(text, signal)
    } else if (source === 'url') {
      content = await loadTextFromUrl(text, signal)
    } else {
      content = text
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    return await performProofread(content, finalFormat, signal, onUpdate, tabId, false)
  } catch (error) {
    getLogger().error('校对失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 应用修复到文本内容
 * @param content 原始文本
 * @param errors 错误列表（需要包含suggestion）
 * @returns 修复后的文本和标记为已修复的错误
 */
function applyFixes(
  content: string,
  errors: ProofreadError[]
): { fixedContent: string; fixedErrors: ProofreadError[] } {
  // 筛选出可以修复的错误（必须有suggestion）
  const fixableErrors = errors.filter(
    (error) => error.suggestion && error.suggestion.trim().length > 0
  )

  if (fixableErrors.length === 0) {
    return { fixedContent: content, fixedErrors: [] }
  }

  // 按行号和列号从后往前排序，避免位置偏移问题
  const sortedErrors = [...fixableErrors].sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line
    return b.column - a.column
  })

  const lines = content.split(/\r?\n/)
  const fixedErrors: ProofreadError[] = []

  // 从后往前应用修复
  for (const error of sortedErrors) {
    if (error.line > 0 && error.line <= lines.length) {
      const lineIndex = error.line - 1
      const line = lines[lineIndex]

      // 验证错误位置是否有效
      if (error.column > 0 && error.column <= line.length) {
        const before = line.substring(0, error.column - 1)
        const after = line.substring(error.column - 1 + error.length)

        // 验证原始文本是否匹配
        const actualText = line.substring(error.column - 1, error.column - 1 + error.length)
        if (actualText === error.text) {
          // 使用用户选择的建议，如果没有选择则使用第一个建议
          const selectedSuggestion = error.selectedSuggestion || error.suggestion

          // 应用修复
          lines[lineIndex] = before + selectedSuggestion + after

          // 标记为已修复
          fixedErrors.push({
            ...error,
            fixed: true
          })

          getLogger().debug(
            `已修复错误: 第${error.line}行第${error.column}列 "${error.text}" -> "${selectedSuggestion}"`
          )
        } else {
          getLogger().warn(`错误位置不匹配，跳过修复: 期望 "${error.text}"，实际 "${actualText}"`)
        }
      }
    }
  }

  return {
    fixedContent: lines.join('\n'),
    fixedErrors
  }
}

/**
 * 更新workspace中的文档内容
 * @param tabId 文档标签页ID
 * @param fixedContent 修复后的内容
 * @param format 文档格式
 */
function updateDocumentInWorkspace(
  tabId: string | undefined,
  fixedContent: string,
  format: 'text' | 'markdown' | 'latex'
): void {
  try {
    const windowType = getWindowType()

    // 如果不是document来源，不更新workspace
    if (windowType === 'setting') {
      // 设置窗口模式下，可能需要通过广播更新，这里暂时不处理
      getLogger().debug('设置窗口模式，跳过workspace更新')
      return
    }

    const targetTabId = tabId || workspace.activeTabId.value
    if (!targetTabId) {
      getLogger().warn('没有活动的文档标签页，无法更新文档')
      return
    }

    const doc = workspace.ensureDocument(targetTabId)
    if (!doc) {
      getLogger().warn('文档不存在，无法更新')
      return
    }

    // 根据格式更新对应的内容
    if (format === 'latex' && doc.format === 'tex') {
      workspace.updateDocumentTex(targetTabId, fixedContent)
      getLogger().info('已更新LaTeX文档内容')
    } else if ((format === 'markdown' || format === 'text') && doc.format === 'md') {
      workspace.updateDocumentMarkdown(targetTabId, fixedContent)
      getLogger().info('已更新Markdown文档内容')
    } else {
      // 格式不匹配，尝试根据文档格式更新
      if (doc.format === 'tex') {
        workspace.updateDocumentTex(targetTabId, fixedContent)
        getLogger().info('已更新文档内容（格式转换）')
      } else {
        workspace.updateDocumentMarkdown(targetTabId, fixedContent)
        getLogger().info('已更新文档内容（格式转换）')
      }
    }
  } catch (error) {
    getLogger().error('更新workspace文档失败:', error)
    // 不抛出错误，让校对流程继续
  }
}

/**
 * 执行校对操作（内部函数）
 */
async function performProofread(
  content: string,
  format: 'text' | 'markdown' | 'latex',
  signal: AbortSignal | undefined,
  onUpdate: (data: ToolCallbackData, progress?: ToolProgress) => void,
  tabId?: string,
  autoFix: boolean = false
): Promise<ToolCallbackResult> {
  try {
    onUpdate(
      {
        content: {
          stage: 'proofreading',
          format,
          textLength: content.length
        },
        format: 'json',
        componentName: 'ProofreadDisplay'
      },
      {
        percentage: 30,
        message: i18n.global.t('agent.tool.proofread.progress.proofreading', '正在校对文本...')
      }
    )

    // 使用 cspell-lib 进行拼写检查
    getLogger().info(
      '[performProofread] 开始调用 cspell-lib 进行拼写检查，文本长度:',
      content.length,
      '格式:',
      format
    )
    let cspellErrors: ProofreadError[] = []
    let isTimeout = false
    try {
      cspellErrors = await proofreadWithCSpell(content, format, signal, onUpdate)
      if (cspellErrors.length === 0) {
        getLogger().info('[performProofread] cspell 检查完成：未发现错误')
      } else {
        getLogger().info(`[performProofread] cspell 检查发现 ${cspellErrors.length} 个错误`)
      }
    } catch (error) {
      getLogger().error('[performProofread] cspell 调用异常:', error)
      // 检查是否是因为超时
      if (signal?.aborted) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('超时') || errorMessage.includes('取消')) {
          getLogger().warn('任务超时，但可能已有部分结果，继续处理')
          isTimeout = true
          cspellErrors = []
        } else {
          // 其他错误，重新抛出
          throw error
        }
      } else {
        // 非超时错误，重新抛出
        throw error
      }
    }

    // 使用 cspell 检查的结果
    let errors = cspellErrors

    // 如果未发现错误，记录信息（不是警告，这是正常情况）
    if (errors.length === 0) {
      getLogger().info('校对完成：未发现任何错误')
    }

    if (signal?.aborted) {
      return {
        status: 'cancelled'
      }
    }

    // 不再自动修复错误，因为很多错误可能是误报，自动修复可能会把用户的文档改坏
    // 用户可以在 ProofreadView 中手动选择修复
    const fixedCount = 0
    const autoFixed = false

    // 统计错误
    const errorCounts: Record<ErrorType, number> = {
      grammar: 0,
      spelling: 0,
      latex: 0,
      style: 0,
      other: 0
    }

    for (const error of errors) {
      errorCounts[error.type] = (errorCounts[error.type] || 0) + 1
    }

    const result: ProofreadResult = {
      errors,
      totalErrors: errors.length,
      errorCounts,
      text: content, // 始终使用原始内容，不自动修复
      format,
      fixedCount: 0,
      autoFixed: false
    }

    // 构建完成消息，如果超时则添加警告
    let completedMessage: string
    if (errors.length === 0) {
      completedMessage = i18n.global.t(
        'agent.tool.proofread.progress.completedNoErrors',
        '校对完成，未发现任何错误'
      )
    } else {
      completedMessage = i18n.global.t(
        'agent.tool.proofread.progress.completed',
        `校对完成，发现 ${errors.length} 个错误`
      )
    }
    if (isTimeout) {
      completedMessage = `⚠️ ${completedMessage}（任务超时，结果可能不完整）`
      getLogger().warn('校对任务超时，但已返回已有结果')
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result
        },
        format: 'json',
        componentName: 'ProofreadDisplay'
      },
      {
        percentage: 100,
        message: completedMessage
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result
        },
        format: 'json',
        componentName: 'ProofreadDisplay'
      },
      result,
      // 如果超时，在result中添加警告信息
      ...(isTimeout ? { warning: '任务超时，结果可能不完整' } : {})
    }
  } catch (error) {
    getLogger().error('校对失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const proofreadToolLocales: ToolLocales = {
  zh_cn: {
    name: '文本校对',
    description: '检查文本中的语法错误、拼写错误、LaTeX语法错误，返回错误位置和修改建议'
  },
  en_us: {
    name: 'Proofread',
    description:
      'Check for grammar, spelling, and LaTeX syntax errors in text, return error locations and suggestions'
  },
  de_DE: {
    name: 'Korrekturlesen',
    description:
      'Überprüfen Sie Text auf Grammatik-, Rechtschreib- und LaTeX-Syntaxfehler, geben Sie Fehlerpositionen und Vorschläge zurück'
  },
  fr_FR: {
    name: 'Correction',
    description:
      "Vérifier les erreurs de grammaire, d'orthographe et de syntaxe LaTeX dans le texte, retourner les emplacements d'erreurs et suggestions"
  },
  ja_JP: {
    name: '校正',
    description: 'テキストの文法、スペル、LaTeX構文エラーをチェックし、エラー位置と提案を返す'
  },
  ko_KR: {
    name: '교정',
    description: '텍스트의 문법, 철자, LaTeX 구문 오류 확인, 오류 위치 및 제안 반환'
  }
}

export const proofreadToolConfig: AgentToolConfig = {
  id: 'proofread',
  name: proofreadToolLocales,
  description: proofreadToolLocales,
  origin: 'internal',
  spec: {
    name: 'proofread',
    brief:
      'Check text for grammar errors, spelling errors, LaTeX syntax errors, etc. Returns detailed error information and suggestions.',
    fullSpec: `# Text Proofreading Tool

## Description
Checks text for grammar errors, spelling errors, LaTeX syntax errors, and other issues. Returns detailed error information and modification suggestions.

## Usage Scenarios
- Check document grammar and spelling
- Verify LaTeX document syntax correctness
- Improve document quality
- Automatically discover text issues

## Input Format

### Method 1: Direct Text (traditional)
\`\`\`json
{
  "text": "text to proofread",
  "source": "text",
  "format": "markdown"
}
\`\`\`

### Method 2: File Path or URL
\`\`\`json
{
  "text": "/path/to/file.md",
  "source": "file",
  "format": "markdown"
}
\`\`\`

### Method 3: Proofread Full Document ⭐ Recommended (simplest)
Don't provide any parameters, or explicitly specify source as "document":
\`\`\`json
{}  // Proofread full text of current active document
\`\`\`

or:
\`\`\`json
{
  "source": "document"
}
\`\`\`

### Method 4: Proofread Specific Section ⭐ Recommended (efficient)
Proofread specified section based on outline node path:
\`\`\`json
{
  "nodePath": "1"  // Proofread first section (including all subsections)
}
\`\`\`

**Parameter Description**:
- \`text\`: Text to proofread, file path, or URL (mutually exclusive with nodePath)
- \`source\`: Text source type: "text"|"file"|"url"|"document"
- \`nodePath\`: Outline node path (e.g., "1", "1.1", "1.2.3"), proofread specified section
- \`format\`: Text format ("text"|"markdown"|"latex"), auto-detected if using document or nodePath
- \`tabId\`: Document tab ID (optional, default uses current active tab)

## Output Format
Returns array of errors with line numbers, positions, suggestions, and severity levels.`
  },
  instruction: `
# 文本校对工具

## 功能描述
检查文本中的语法错误、拼写错误、LaTeX语法错误等问题，返回详细的错误信息和修改建议。

## 使用场景
- 检查文档的语法和拼写
- 验证LaTeX文档的语法正确性
- 提高文档质量
- 自动发现文本问题

## 输入格式

支持多种输入方式：

### 方式1：直接文本（传统方式）
\`\`\`json
{
  "text": "要校对的文本内容",
  "source": "text",
  "format": "markdown"
}
\`\`\`

### 方式2：文件路径或URL
\`\`\`json
{
  "text": "/path/to/file.md",
  "source": "file",
  "format": "markdown"
}
\`\`\`

### 方式3：校对全文 ⭐ 推荐（最简单）
不提供任何参数，或明确指定source为"document"：
\`\`\`json
{}  // 校对当前活动文档的全文
\`\`\`

或：
\`\`\`json
{
  "source": "document"
}
\`\`\`

### 方式4：校对指定章节 ⭐ 推荐（高效）
根据大纲节点路径校对指定章节：
\`\`\`json
{
  "nodePath": "1"  // 校对第一个章节（包括其所有子章节）
}
\`\`\`

或：
\`\`\`json
{
  "nodePath": "1.1"  // 校对第一个章节的第一个子章节
}
\`\`\`

**参数说明**：
- \`text\`: 要校对的文本、文件路径或URL（与nodePath二选一）
- \`source\`: 文本来源类型
  - \`"text"\`: 直接文本（默认）
  - \`"file"\`: 文件路径
  - \`"url"\`: URL地址
  - \`"document"\`: 当前活动文档全文（推荐）
- \`nodePath\`: 大纲节点路径（如"1"、"1.1"、"1.2.3"），校对指定章节
- \`format\`: 文本格式（"text"|"markdown"|"latex"），如果使用document或nodePath会自动识别
- \`tabId\`: 文档标签页ID（可选，默认使用当前活动标签页）

**推荐使用方式**：
- **校对全文**：使用 \`{}\` 或 \`{"source": "document"}\`，最简单高效
- **校对特定章节**：使用 \`{"nodePath": "1.1"}\`，可查看引用素材中的「当前文档内容」了解章节路径，或使用 \`workspace\`（工作区文件读取）工具查看文件

## 输出格式
\`\`\`json
{
  "errors": [
    {
      "type": "grammar|spelling|latex|style|other",
      "line": 10,
      "column": 5,
      "length": 3,
      "text": "错误的文本",
      "suggestion": "修改建议",
      "message": "错误描述",
      "severity": "error"
    }
  ],
  "totalErrors": 5,
  "errorCounts": {
    "grammar": 2,
    "spelling": 1,
    "latex": 1,
    "style": 1,
    "other": 0
  },
  "text": "string",
  "format": "text|markdown|latex"
}
\`\`\`

## 注意事项
- **推荐使用全文比对或段落比对**：使用 \`{}\` 或 \`{"nodePath": "1.1"}\` 比手动输入文本更高效
- 支持纯文本、Markdown和LaTeX格式
- 支持从文本、文件路径和URL加载内容
- 使用AI进行智能校对，可能无法发现所有错误
- 错误位置基于行号和列号（1-based）
- 严重程度分为：error（错误）、warning（警告）、info（信息）
- 如果使用nodePath，校对的内容包括该节点及其所有子节点的文本
- 可查看引用素材中的「当前文档内容」了解章节结构，或使用 \`workspace\`（工作区文件读取）工具查看文件获取节点路径
`,
  callback: proofreadToolCallback,
  displayComponent: ProofreadDisplay,
  tags: ['text', 'proofread', 'grammar', 'spelling'],
  enabled: true,
  editable: false,
  locales: proofreadToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '要校对的文本、文件路径或URL（与nodePath二选一）'
      },
      source: {
        type: 'string',
        enum: ['text', 'file', 'url', 'document'],
        description: '文本来源类型，默认"text"，使用"document"校对全文',
        default: 'text'
      },
      format: {
        type: 'string',
        enum: ['text', 'markdown', 'latex'],
        description: '文本格式（使用document或nodePath时自动识别）',
        default: 'text'
      },
      nodePath: {
        type: 'string',
        description: '大纲节点路径（如"1"、"1.1"），校对指定章节（与text二选一）'
      },
      tabId: {
        type: 'string',
        description: '文档标签页ID（可选，默认使用当前活动标签页）'
      }
    }
    // 注意：text不是必需的，如果source为"document"或提供了nodePath，则不需要text
  },
  outputSchema: {
    type: 'object',
    properties: {
      errors: {
        type: 'array',
        description: '错误列表'
      },
      totalErrors: {
        type: 'number',
        description: '总错误数'
      },
      errorCounts: {
        type: 'object',
        description: '各类错误统计'
      },
      text: {
        type: 'string',
        description: '原始文本'
      },
      format: {
        type: 'string',
        description: '文本格式'
      }
    }
  }
}
