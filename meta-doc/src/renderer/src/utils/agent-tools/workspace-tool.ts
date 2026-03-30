import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { createAiTask, cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import type { AIDialogMessage } from '@/types'
import { createDetailedError } from './tool-utils'
import WorkspaceDisplay from './components/WorkspaceDisplay.vue'
import messageBridge from '../../bridge/message-bridge'
import { notifyWorkspaceFilesystemChange } from '../workspace-fs-notify'
import { ensureDirectoryRecursive as ensureDirectoryRecursiveImpl } from './workspace-directory-helper'
import {
  pathLooksLikeWorkspaceSkillMd,
  scheduleSkillIndexSyncAfterWrite
} from '../agent-framework/skill-index-hook'

const logger = createRendererLogger('WorkspaceTool')

/**
 * 工作区文件读取结果
 */
export interface WorkspaceFileResult {
  path: string
  content: string
  startLine?: number
  endLine?: number
  totalLines: number
  summarized?: boolean
  summary?: string
  /** 内容是否因过长被截断 */
  truncated?: boolean
  truncationMessage?: string
}

/**
 * 工作区工具结果
 */
export interface WorkspaceToolResult {
  files: WorkspaceFileResult[]
  totalFiles: number
  summarized: boolean
  /** paths 中传入目录时，返回的目录列表（每项为该目录下的递归树） */
  directoryListings?: Array<{
    path: string
    tree: Array<{ name: string; path: string; isDirectory: boolean }>
    truncated?: boolean
    totalEntries?: number
    message?: string
  }>
}

/** 列表/树结果最大条目数，超过则截断并提示（控制上下文长度） */
const MAX_TREE_ENTRIES = 300
/** 单文件内容最大字符数，超过则截断 */
const MAX_FILE_CONTENT_CHARS = 32000
/** paths 为目录时，递归列举的最大条目数 */
const MAX_DIRECTORY_LIST_ENTRIES = 600

type WorkspaceOperationType = 'createDirectory' | 'deleteDirectory' | 'createFile' | 'deleteFile'

export interface WorkspaceOperationInput {
  /**
   * 操作类型：
   * - createDirectory: 递归创建目录（类似 mkdir -p）
   * - deleteDirectory: 删除目录（级联，移动到回收站）
   * - createFile: 创建文件（自动创建缺失目录）
   * - deleteFile: 删除文件（移动到回收站）
   */
  type: WorkspaceOperationType
  /**
   * 目标路径：
   * - 可以是绝对路径
   * - 也可以是相对当前工作区根目录的相对路径
   */
  path: string
  /**
   * 创建文件时的初始内容（可选）
   */
  content?: string
}

export interface WorkspaceOperationResult {
  type: WorkspaceOperationType
  path: string
  success: boolean
  /**
   * 人类可读的信息，说明本次操作的结果：
   * - 创建成功 / 已存在跳过 / 删除成功 / 未找到等
   */
  message: string
}

/** 模糊搜索时跳过的目录名（与 Everything 类似，减少噪音） */
const SEARCH_EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.metadoc', '__pycache__', '.next'])

/**
 * 模糊匹配：query 的每个字符按顺序出现在 text 中即视为匹配（不要求连续，大小写不敏感）。
 * 类似 Everything 的搜索体验。
 */
function fuzzyMatch(query: string, text: string): boolean {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  let j = 0
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++
  }
  return j === q.length
}

/**
 * 递归读取目录树（可选排除部分目录，用于模糊搜索）
 */
async function readDirectoryTreeForSearch(
  dirPath: string,
  maxDepth: number,
  currentDepth: number,
  maxEntries: number,
  acc: Array<{ name: string; path: string; isDirectory: boolean }>
): Promise<void> {
  if (currentDepth >= maxDepth || acc.length >= maxEntries) return
  if (!messageBridge.getIpc()) return

  try {
    const entries = await messageBridge.invoke('read-directory', dirPath)
    for (const entry of entries as Array<{ name: string; path: string; isDirectory: boolean }>) {
      if (acc.length >= maxEntries) return
      acc.push(entry)
      if (entry.isDirectory && !SEARCH_EXCLUDE_DIRS.has(entry.name)) {
        await readDirectoryTreeForSearch(
          entry.path,
          maxDepth,
          currentDepth + 1,
          maxEntries,
          acc
        )
      }
    }
  } catch (error) {
    logger.warn(`读取目录失败（搜索用）: ${dirPath}`, error)
  }
}

/**
 * 是否是绝对路径（兼容 Windows / Unix）
 */
function isAbsolutePath(path: string): boolean {
  // Windows绝对路径: C:\ 或 C:/
  if (/^[A-Za-z]:[\\/]/.test(path)) {
    return true
  }
  // Unix绝对路径: / 开头
  if (path.startsWith('/')) {
    return true
  }
  return false
}

/**
 * 规范化路径分隔符为 /
 */
function normalizePath(p: string): string {
  return p.replace(/[/\\]+/g, '/').replace(/\/+/g, '/')
}

/**
 * 简单防护：避免对 .metadoc 目录做写操作。
 * 例外：`.metadoc/skills/` 下的技能文件允许创建/删除（与 Agent 技能系统一致）。
 */
function isInMetaDoc(path: string): boolean {
  const n = normalizePath(path)
  if (n.includes('/.metadoc/skills/') || n.endsWith('/.metadoc/skills')) {
    return false
  }
  return n.includes('/.metadoc/') || n.endsWith('/.metadoc')
}

async function ensureDirectoryRecursive(
  fullPath: string
): Promise<{ created: boolean; message: string; pathsCreated: string[] }> {
  const ipc = messageBridge.getIpc()
  if (!ipc) {
    throw new Error('IPC renderer not available')
  }
  return ensureDirectoryRecursiveImpl(fullPath, ipc)
}

/**
 * 创建文件（自动创建缺失目录；已存在则跳过）
 */
async function createFileWithDirs(
  fullPath: string,
  content?: string
): Promise<{ created: boolean; message: string }> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC renderer not available')
  }
  const ipc = messageBridge.getIpc()
  const normalized = normalizePath(fullPath)

  if (isInMetaDoc(normalized)) {
    return {
      created: false,
      message: `已跳过 .metadoc 工作目录内的文件创建: ${normalized}`
    }
  }

  // 先检查是否已存在
  try {
    const exists = await ipc.invoke('file-exists', normalized)
    if (exists) {
      return {
        created: false,
        message: `文件已存在，未重复创建: ${normalized}`
      }
    }
  } catch (error) {
    logger.warn(`检查文件是否存在失败: ${normalized}`, error)
  }

  // 确保上层目录存在
  const dir = normalized.replace(/[/\\][^/\\]+$/, '')
  if (dir && dir !== normalized) {
    const mkdirRes = await ensureDirectoryRecursive(dir)
    for (const p of mkdirRes.pathsCreated) {
      notifyWorkspaceFilesystemChange(p, 'addDir')
    }
  }

  // 主进程 create-file 接收 { parentPath, fileName, content }
  const fileName = normalized.split('/').pop() ?? ''
  try {
    await ipc.invoke('create-file', {
      parentPath: dir,
      fileName,
      content: content ?? ''
    })
    if (pathLooksLikeWorkspaceSkillMd(normalized)) {
      scheduleSkillIndexSyncAfterWrite(normalized)
    }
    notifyWorkspaceFilesystemChange(normalized, 'add')
    return { created: true, message: `文件已创建: ${normalized}` }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.warn(`创建文件失败: ${normalized}`, error)
    throw new Error(`创建文件失败: ${normalized}。${msg}`)
  }
}

/**
 * 删除文件或目录（级联，移动到回收站由主进程负责）
 */
async function deletePathRecursive(fullPath: string): Promise<{ deleted: boolean; message: string }> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC renderer not available')
  }
  const ipc = messageBridge.getIpc()
  const normalized = normalizePath(fullPath)

  if (isInMetaDoc(normalized)) {
    return {
      deleted: false,
      message: `已跳过 .metadoc 工作目录内的删除操作: ${normalized}`
    }
  }

  try {
    const exists = await ipc.invoke('file-exists', normalized)
    if (!exists) {
      return { deleted: false, message: `目标不存在，已跳过: ${normalized}` }
    }
  } catch (error) {
    logger.warn(`检查路径是否存在失败: ${normalized}`, error)
  }

  try {
    await ipc.invoke('delete-file-or-folder', normalized)
    return { deleted: true, message: `已删除（移动到回收站）: ${normalized}` }
  } catch (error) {
    logger.warn(`删除路径失败: ${normalized}`, error)
    throw new Error(`删除路径失败: ${normalized}`)
  }
}

/**
 * 解析路径字符串，提取路径和行数范围
 * 支持格式：
 * - "path/to/file.txt" - 完整文件
 * - "path/to/file.txt:L123" - 单行
 * - "path/to/file.txt:L123-L456" - 行范围
 */
function parsePathString(pathStr: string): {
  path: string
  startLine?: number
  endLine?: number
} {
  const lineRangeMatch = pathStr.match(/^(.+?):L(\d+)-L(\d+)$/)
  if (lineRangeMatch) {
    return {
      path: lineRangeMatch[1],
      startLine: parseInt(lineRangeMatch[2], 10),
      endLine: parseInt(lineRangeMatch[3], 10)
    }
  }

  const singleLineMatch = pathStr.match(/^(.+?):L(\d+)$/)
  if (singleLineMatch) {
    const lineNum = parseInt(singleLineMatch[2], 10)
    return {
      path: singleLineMatch[1],
      startLine: lineNum,
      endLine: lineNum
    }
  }

  return { path: pathStr }
}

/**
 * 获取工作区根目录列表
 */
async function getWorkspaceFolders(): Promise<string[]> {
  // 直接从 localStorage 读取工作区文件夹列表
  // WorkspaceExplorer 组件已经将工作区文件夹保存到 localStorage
  try {
    const saved = localStorage.getItem('workspaceFolders')
    if (saved) {
      const folders = JSON.parse(saved) as string[]
      if (Array.isArray(folders) && folders.length > 0) {
        return folders
      }
    }
  } catch (error) {
    logger.warn('从localStorage读取工作区文件夹失败:', error)
  }

  // 如果没有找到保存的文件夹，返回空数组
  return []
}

/**
 * 判断路径是否为目录（通过 read-directory 是否成功）
 */
async function isDirectory(fullPath: string): Promise<boolean> {
  if (!messageBridge.getIpc()) return false
  try {
    const entries = await messageBridge.invoke('read-directory', fullPath)
    return Array.isArray(entries)
  } catch {
    return false
  }
}

/**
 * 递归读取目录树（限制总条目数，用于 paths 为目录时的列举）
 */
async function readDirectoryTreeLimited(
  dirPath: string,
  maxDepth: number,
  currentDepth: number,
  maxEntries: number,
  acc: Array<{ name: string; path: string; isDirectory: boolean }>
): Promise<void> {
  if (!messageBridge.getIpc() || currentDepth >= maxDepth || acc.length >= maxEntries) return
  try {
    const entries = await messageBridge.invoke('read-directory', dirPath) as Array<{ name: string; path: string; isDirectory: boolean }>
    for (const entry of entries) {
      if (acc.length >= maxEntries) return
      acc.push(entry)
      if (entry.isDirectory && !SEARCH_EXCLUDE_DIRS.has(entry.name)) {
        await readDirectoryTreeLimited(entry.path, maxDepth, currentDepth + 1, maxEntries, acc)
      }
    }
  } catch (error) {
    logger.warn(`读取目录失败: ${dirPath}`, error)
  }
}

/**
 * 递归读取目录树（不限制条目数，用于根目录树等）
 */
async function readDirectoryTree(
  dirPath: string,
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC renderer not available')
  }

  if (currentDepth >= maxDepth) {
    return []
  }

  try {
    const entries = await messageBridge.invoke('read-directory', dirPath)
    const result: Array<{ name: string; path: string; isDirectory: boolean }> = []

    for (const entry of entries) {
      result.push(entry)

      // 递归读取子目录
      if (entry.isDirectory) {
        const subEntries = await readDirectoryTree(entry.path, maxDepth, currentDepth + 1)
        result.push(...subEntries)
      }
    }

    return result
  } catch (error) {
    logger.error(`读取目录失败: ${dirPath}`, error)
    return []
  }
}

/**
 * 对树/列表结果做上下文截断：超过 MAX_TREE_ENTRIES 则只保留前 N 条并附加说明
 */
function truncateTreeResult<T>(
  arr: T[],
  maxEntries: number = MAX_TREE_ENTRIES
): { items: T[]; truncated: boolean; totalCount: number; truncationMessage?: string } {
  const totalCount = arr.length
  if (totalCount <= maxEntries) {
    return { items: arr, truncated: false, totalCount }
  }
  return {
    items: arr.slice(0, maxEntries),
    truncated: true,
    totalCount,
    truncationMessage: `列表过长，仅显示前 ${maxEntries} 项，共 ${totalCount} 项。可根据路径再读具体文件。`
  }
}

/**
 * 对单段文本做上下文截断
 */
function truncateText(text: string, maxChars: number, suffix = '...[内容已截断]'): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return {
    text: text.slice(0, maxChars) + suffix,
    truncated: true
  }
}

/**
 * 读取文件内容（支持行数范围）
 */
async function readFileContent(
  filePath: string,
  startLine?: number,
  endLine?: number
): Promise<{ content: string; totalLines: number }> {
  if (!messageBridge.getIpc()) {
    throw new Error('IPC renderer not available')
  }

  const fileContent = await messageBridge.invoke('read-file-content', filePath)

  if (!fileContent) {
    throw new Error(`文件不存在或无法读取: ${filePath}`)
  }

  const lines = fileContent.split(/\r?\n/)
  const totalLines = lines.length

  // 如果没有指定行数范围，返回完整内容
  if (startLine === undefined || endLine === undefined) {
    return { content: fileContent, totalLines }
  }

  // 处理行数范围（1-based）
  const actualStartLine = Math.max(1, Math.min(startLine, totalLines))
  const actualEndLine = Math.max(actualStartLine, Math.min(endLine, totalLines))

  const selectedLines = lines.slice(actualStartLine - 1, actualEndLine)
  const content = selectedLines.join('\n')

  return { content, totalLines }
}

/**
 * 使用AI总结文件内容
 */
async function summarizeContent(
  content: string,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<string> {
  const summaryPrompt = `请简要概括以下文档内容。要求：
1. 语言简洁，不包含多余内容
2. 突出文档的核心要点和主要内容
3. 控制在200字以内

文档内容：
${content.substring(0, 10000)}  ${content.length > 10000 ? '...(已截断)' : ''}`

  const target = ref('')
  const originKey = `workspace-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: summaryPrompt
    }
  ]

  const { handle, done } = createAiTask('总结文档内容', messages, target, 'chat', originKey, {
    stream: true
  })

  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'summarizing',
          summaryTargetRef: target,
          summaryDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 50,
        message: '正在总结文档内容...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false, false)
    })
  }

  try {
    await done
    await new Promise((resolve) => setTimeout(resolve, 50))
  } catch (error) {
    if (signal?.aborted) {
      throw new Error('操作已取消')
    }
    throw error
  }

  if (signal?.aborted) {
    throw new Error('操作已取消')
  }

  const summary = target.value.trim()
  if (!summary) {
    throw new Error('AI返回内容为空，无法生成摘要')
  }

  return summary
}

/**
 * Workspace Tool回调函数
 */
const workspaceToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  // 关键说明：workspace-tool 依赖 Electron 渲染进程的 IPC。
  // 如果 agent 在无 UI / 无 IPC 的环境中运行（例如 CLI 测试或对话恢复到后台环境），
  // 这里会直接返回失败，而不是静默返回空结果，避免“搜索什么都是空”的误导。
  if (!messageBridge.getIpc()) {
    logger.warn('WorkspaceTool 调用时 IPC 不可用，通常表示当前会话不在可访问工作区文件的环境中。')
    return {
      status: 'failed',
      error: createDetailedError(
        'workspace-tool 当前不可用：IPC 未就绪',
        [
          'workspace-tool 依赖可见的工作区界面和文件系统 IPC 才能工作',
          '请在 MetaDoc 应用内、打开目标工作区后再调用该工具'
        ],
        [
          '避免在纯终端 / CLI 环境中使用 workspace-tool',
          '如果是在恢复的 agent 对话中，请确保前端页面仍然打开并连接到同一工作区'
        ]
      )
    }
  }

  const paths = params.paths as string | string[] | undefined
  const summarized = params.summarized === true
  const workspaceFolder = params.workspaceFolder as string | undefined
  const searchQuery = params.search != null ? String(params.search).trim() : ''
  const operationsParam = params.operations as
    | WorkspaceOperationInput
    | WorkspaceOperationInput[]
    | undefined

  const operations: WorkspaceOperationInput[] = operationsParam
    ? Array.isArray(operationsParam)
      ? operationsParam
      : [operationsParam]
    : []

  /**
   * 规范化写操作目标路径：
   * - 绝对路径：直接使用
   * - 相对路径：挂到 workspaceFolder / 第一个工作区根目录下
   */
  const resolveTargetPath = async (targetPath: string): Promise<string> => {
    if (isAbsolutePath(targetPath)) {
      return normalizePath(targetPath)
    }

    const folders = workspaceFolder ? [workspaceFolder] : await getWorkspaceFolders()
    if (!folders.length) {
      throw new Error('没有工作区文件夹，无法解析相对路径')
    }

    const root = folders[0].replace(/[/\\]+$/, '')
    const clean = targetPath.replace(/^[/\\]+/, '')
    return normalizePath(`${root}/${clean}`)
  }

  /** 文件/目录写操作（创建/删除） */
  const runOperations = async (): Promise<ToolCallbackResult> => {
    if (!operations.length) {
      return {
        status: 'failed',
        error: 'operations 参数为空，未指定任何文件/目录操作'
      }
    }

    onUpdate(
      {
        content: {
          stage: 'operating',
          operations: operations.map((op) => ({ type: op.type, path: op.path }))
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      {
        percentage: 5,
        message: i18n.global.t(
          'agent.tool.workspace.progress.operating',
          '正在执行文件/目录操作...'
        )
      }
    )

    const results: WorkspaceOperationResult[] = []

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      if (signal?.aborted) {
        return { status: 'cancelled' }
      }

      let fullPath = ''
      try {
        fullPath = await resolveTargetPath(op.path)
        let resMessage = ''
        let success = true

        switch (op.type) {
          case 'createDirectory': {
            const { created, message, pathsCreated } = await ensureDirectoryRecursive(fullPath)
            resMessage = message
            success = true
            for (const p of pathsCreated) {
              notifyWorkspaceFilesystemChange(p, 'addDir')
            }
            if (!created) {
              // 已存在也视为成功，只是提示不同
            }
            break
          }
          case 'deleteDirectory': {
            const { deleted, message } = await deletePathRecursive(fullPath)
            resMessage = message
            success = deleted
            break
          }
          case 'createFile': {
            const { created, message } = await createFileWithDirs(fullPath, op.content)
            resMessage = message
            success = true
            if (!created) {
              // 已存在视为成功但会返回“已存在，未重复创建”
            }
            break
          }
          case 'deleteFile': {
            const { deleted, message } = await deletePathRecursive(fullPath)
            resMessage = message
            success = deleted
            break
          }
          default: {
            success = false
            resMessage = `未知的操作类型: ${String(op.type)}`
          }
        }

        results.push({
          type: op.type,
          path: fullPath,
          success,
          message: resMessage
        })
      } catch (error) {
        logger.warn('执行 workspace 文件操作失败:', error)
        results.push({
          type: op.type,
          path: fullPath || op.path,
          success: false,
          message: error instanceof Error ? error.message : String(error)
        })
      }

      onUpdate(
        {
          content: {
            stage: 'operating',
            operations: results
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 5 + ((i + 1) / operations.length) * 80,
          message: i18n.global.t('agent.tool.workspace.progress.operatingStep', {
            index: i + 1,
            total: operations.length
          })
        }
      )
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          operations: results
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t(
          'agent.tool.workspace.progress.operationsCompleted',
          '文件/目录操作已完成'
        )
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          operations: results
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      result: {
        operations: results
      }
    }
  }

  /** 模糊搜索：在整个工作区内按关键词匹配路径/文件名，返回匹配项及其路径与目录结构 */
  const runFuzzySearch = async (): Promise<ToolCallbackResult> => {
    try {
      onUpdate(
        {
          content: { stage: 'searching', query: searchQuery },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 5,
          message: i18n.global.t('agent.tool.workspace.progress.searching', '正在模糊搜索…')
        }
      )
      let folders: string[] = workspaceFolder ? [workspaceFolder] : await getWorkspaceFolders()
      if (folders.length === 0) {
        return {
          status: 'failed',
          error: createDetailedError(
            '没有工作区文件夹',
            [
              '请先在WorkspaceExplorer中添加工作区文件夹',
              '或者通过workspaceFolder参数指定文件夹路径'
            ],
            [
              'workspace-tool需要工作区文件夹才能执行搜索',
              '可以在UI中通过WorkspaceExplorer添加文件夹',
              '或者在调用时通过workspaceFolder参数指定'
            ]
          )
        }
      }

      const maxSearchEntries = 800
      const allEntries: Array<{ name: string; path: string; isDirectory: boolean }> = []

      for (const folderPath of folders) {
        if (allEntries.length >= maxSearchEntries) break
        await readDirectoryTreeForSearch(
          folderPath,
          15,
          0,
          maxSearchEntries - allEntries.length,
          allEntries
        )
        if (signal?.aborted) {
          return { status: 'cancelled' }
        }
      }

      const matched = allEntries.filter(
        (e) => fuzzyMatch(searchQuery, e.path) || fuzzyMatch(searchQuery, e.name)
      )
      const sorted = matched.sort((a, b) => a.path.localeCompare(b.path))
      const { items: treeItems, truncated: treeTruncated, totalCount: matchCount, truncationMessage: treeTruncationMessage } = truncateTreeResult(sorted, MAX_TREE_ENTRIES)

      const primaryFolder = folders[0]
      onUpdate(
        {
          content: {
            stage: 'completed',
            tree: treeItems,
            workspaceFolder: primaryFolder,
            searchQuery,
            ...(treeTruncated && { treeTruncated: true, treeTotalCount: matchCount, treeTruncationMessage: treeTruncationMessage })
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 100,
          message: i18n.global.t('agent.tool.workspace.progress.searchCompleted', {
            count: matchCount,
            query: searchQuery
          })
        }
      )
      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            tree: treeItems,
            workspaceFolder: primaryFolder,
            searchQuery,
            ...(treeTruncated && { treeTruncated: true, treeTotalCount: matchCount, treeTruncationMessage: treeTruncationMessage })
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        result: {
          tree: treeItems,
          workspaceFolder: primaryFolder,
          searchQuery,
          matchCount,
          ...(treeTruncated && { truncated: true, totalMatchCount: matchCount, truncationMessage: treeTruncationMessage })
        }
      }
    } catch (error) {
      logger.error('模糊搜索失败:', error)
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // 如果指定了写操作（目录/文件创建与删除），优先执行写操作；
  // 为了安全和语义清晰，写操作与读取/搜索建议分开调用。
  if (operations.length > 0) {
    return runOperations()
  }

  /** 无 paths 或 paths 为空时，返回工作区根目录树（不报错，便于 AI 先“看看有什么”再读具体文件） */
  const returnWorkspaceRootTree = async (): Promise<ToolCallbackResult> => {
    try {
      onUpdate(
        {
          content: { stage: 'loading-tree' },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 10,
          message: i18n.global.t('agent.tool.workspace.progress.loadingTree', '正在加载目录树...')
        }
      )
      let folders: string[] = workspaceFolder ? [workspaceFolder] : await getWorkspaceFolders()
      if (folders.length === 0) {
        return {
          status: 'failed',
          error: createDetailedError(
            '没有工作区文件夹',
            [
              '请先在WorkspaceExplorer中添加工作区文件夹',
              '或者通过workspaceFolder参数指定文件夹路径'
            ],
            [
              'workspace-tool需要工作区文件夹才能读取文件',
              '可以在UI中通过WorkspaceExplorer添加文件夹',
              '或者在调用时通过workspaceFolder参数指定'
            ]
          )
        }
      }
      const folderPath = folders[0]
      const fullTree = await readDirectoryTree(folderPath)
      const { items: tree, truncated: treeTruncated, totalCount: treeTotalCount, truncationMessage: treeTruncationMessage } = truncateTreeResult(fullTree, MAX_TREE_ENTRIES)
      onUpdate(
        {
          content: {
            stage: 'completed',
            tree,
            workspaceFolder: folderPath,
            ...(treeTruncated && { treeTruncated: true, treeTotalCount, treeTruncationMessage })
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 100,
          message: i18n.global.t('agent.tool.workspace.progress.completed', '目录树加载完成')
        }
      )
      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            tree,
            workspaceFolder: folderPath,
            ...(treeTruncated && { treeTruncated: true, treeTotalCount, treeTruncationMessage })
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        result: {
          tree,
          workspaceFolder: folderPath,
          ...(treeTruncated && { truncated: true, totalCount: treeTotalCount, truncationMessage: treeTruncationMessage })
        }
      }
    } catch (error) {
      logger.error('加载目录树失败:', error)
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  // 指定了 search 时优先执行模糊搜索（无需先列根目录）
  if (searchQuery.length > 0) {
    return runFuzzySearch()
  }

  // 未指定 paths 或 paths 为空数组/空字符串：返回工作区根目录树，不报错
  const pathArray = Array.isArray(paths)
    ? (paths as string[]).filter((p) => p != null && String(p).trim() !== '')
    : paths != null && String(paths).trim() !== ''
      ? [paths as string]
      : []

  if (pathArray.length === 0) {
    return returnWorkspaceRootTree()
  }

  // 处理文件读取

  try {
    onUpdate(
      {
        content: {
          stage: 'reading',
          paths: pathArray
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      {
        percentage: 10,
        message: i18n.global.t('agent.tool.workspace.progress.reading', '正在读取文件...')
      }
    )

    const results: WorkspaceFileResult[] = []
    const directoryListings: Array<{
      path: string
      tree: Array<{ name: string; path: string; isDirectory: boolean }>
      truncated?: boolean
      totalEntries?: number
      message?: string
    }> = []
    const workspaceFoldersList = await getWorkspaceFolders()

    if (workspaceFoldersList.length === 0 && !workspaceFolder) {
      return {
        status: 'failed',
        error: createDetailedError(
          '没有工作区文件夹',
          [
            '请先在WorkspaceExplorer中添加工作区文件夹',
            '或者通过workspaceFolder参数指定文件夹路径'
          ],
          [
            'workspace-tool需要工作区文件夹才能读取文件',
            '可以在UI中通过WorkspaceExplorer添加文件夹',
            '或者在调用时通过workspaceFolder参数指定'
          ]
        )
      }
    }

    // 确定要使用的工作区文件夹列表
    const foldersToSearch = workspaceFolder ? [workspaceFolder] : workspaceFoldersList

    // 在所有工作区文件夹中查找文件（对于相对路径）
    const findFileInWorkspaceFolders = async (filePath: string): Promise<string | null> => {
      // 如果是绝对路径，直接尝试读取
      if (isAbsolutePath(filePath)) {
        if (!messageBridge.getIpc()) return null

        try {
          const exists = await messageBridge.invoke('file-exists', filePath)
          return exists ? filePath : null
        } catch {
          return null
        }
      }

      // 相对路径：在所有工作区文件夹中搜索
      if (!messageBridge.getIpc()) return null

      for (const folderPath of foldersToSearch) {
        const cleanFilePath = filePath.replace(/^[/\\]+/, '')
        const fullPath = `${folderPath.replace(/[/\\]+$/, '')}/${cleanFilePath}`
          .replace(/[/\\]+/g, '/')
          .replace(/\/+/g, '/')

        try {
          const exists = await messageBridge.invoke('file-exists', fullPath)
          if (exists) {
            return fullPath
          }
        } catch {
          // 继续尝试下一个文件夹
          continue
        }
      }

      // 如果没找到，返回null
      return null
    }

    // 处理每个 path（可能是文件或目录）
    for (let i = 0; i < pathArray.length; i++) {
      const pathStr = pathArray[i]
      const { path: filePath, startLine, endLine } = parsePathString(pathStr)

      // 解析为完整路径（文件或目录）
      const fullPath = await findFileInWorkspaceFolders(filePath)

      if (!fullPath) {
        logger.warn(
          `路径未找到: ${filePath}（已在 ${foldersToSearch.length} 个工作区文件夹中搜索）`
        )
        continue
      }

      onUpdate(
        {
          content: {
            stage: 'reading',
            paths: pathArray,
            currentPath: fullPath,
            currentIndex: i,
            totalFiles: pathArray.length
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 20 + (i / pathArray.length) * 60,
          message: i18n.global.t('agent.tool.workspace.progress.readingFile', {
            path: filePath,
            index: i + 1,
            total: pathArray.length
          })
        }
      )

      const isDir = await isDirectory(fullPath)
      if (isDir) {
        // paths 中传入的是目录：递归列举该目录下文件/文件夹（带数量限制）
        const listAcc: Array<{ name: string; path: string; isDirectory: boolean }> = []
        await readDirectoryTreeLimited(
          fullPath,
          12,
          0,
          MAX_DIRECTORY_LIST_ENTRIES,
          listAcc
        )
        const { items, truncated, totalCount, truncationMessage } = truncateTreeResult(
          listAcc,
          MAX_TREE_ENTRIES
        )
        directoryListings.push({
          path: filePath,
          tree: items,
          truncated: truncated || listAcc.length >= MAX_DIRECTORY_LIST_ENTRIES,
          totalEntries: totalCount,
          message: truncationMessage
        })
      } else {
        // 文件：读取内容，并对过长内容截断
        try {
          const { content, totalLines } = await readFileContent(fullPath, startLine, endLine)

          let summary: string | undefined = undefined
          if (summarized) {
            summary = await summarizeContent(content, signal, onUpdate)
          }

          const { text: contentToStore, truncated: contentTruncated } = truncateText(
            content,
            MAX_FILE_CONTENT_CHARS
          )

          results.push({
            path: filePath,
            content: contentToStore,
            startLine,
            endLine,
            totalLines,
            summarized,
            summary,
            ...(contentTruncated && { truncated: true, truncationMessage: `文件内容过长，仅保留前 ${MAX_FILE_CONTENT_CHARS} 字符` })
          })
        } catch (error) {
          logger.warn(`读取文件失败: ${fullPath}`, error)
        }
      }

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }
    }

    const resultPayload = {
      files: results,
      totalFiles: results.length,
      summarized,
      ...(directoryListings.length > 0 && { directoryListings })
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result: resultPayload
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.workspace.progress.completed', {
          count: results.length + directoryListings.length
        })
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result: resultPayload
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      result: {
        files: results,
        totalFiles: results.length,
        summarized,
        ...(directoryListings.length > 0 && { directoryListings })
      }
    }
  } catch (error) {
    logger.error('Workspace工具执行失败:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const WORKSPACE_TOOL_NAME = 'Workspace File & Workspace Manager'
const WORKSPACE_TOOL_DESCRIPTION =
  'Read workspace files, fuzzy-search by path/name, manage directories and files (create/delete), or list root directory. Prefer this tool for workspace file operations instead of terminal commands. Use search to match paths across the whole workspace (Everything-style); omit paths to get directory tree; use paths to read file(s). Supports line ranges, optional AI summarization, recursive directory creation, and safe delete-to-recycle for files/folders.'

export const workspaceToolConfig: AgentToolConfig = {
  id: 'workspace',
  name: WORKSPACE_TOOL_NAME,
  description: WORKSPACE_TOOL_DESCRIPTION,
  origin: 'internal',
  spec: {
    name: 'workspace',
    brief:
      'Read workspace files, fuzzy-search by path/name (Everything-style), manage directories/files (create/delete), or list root directory. Use \`search\` to find files/folders across the whole workspace without listing root first. Use \`paths\` to read file(s); use \`operations\` to create/delete directories and files. Omit both to get directory tree. Prefer this tool for workspace file operations instead of terminal commands. Supports line ranges, optional AI summarization, recursive directory creation, and safe delete-to-recycle.',
    fullSpec: `# Workspace File & Workspace Manager Tool

## Description
Read files from workspace folders, **fuzzy-search** by path/file name across the whole workspace (like Everything: type text, get matching paths and directory structure), **create/delete directories and files** in the workspace, or list the workspace root directory.

**⚠️ IMPORTANT:** For any workspace-level file operations (creating/deleting directories or files), you should **use this workspace tool instead of terminal commands**. Do not call raw shell tools (\`rm\`, \`mkdir\`, etc.) for normal workspace management; rely on this tool so that operations are safe, cross-platform, and recorded in the agent context.

- **\`search\` (recommended when you don't know exact paths)** – Pass a string to fuzzy-match against all file and folder paths in the workspace. Returns matched entries with full path and structure. No need to list root first.
- **No \`paths\`, no \`search\`, and no \`operations\`** – Returns workspace root directory tree (no error).
- **\`paths\`** – Read specific file(s) **or list directory contents**. If a path points to a **directory**, the tool returns a recursive listing of that directory (files and subfolders) instead of failing; if it points to a file, reads the file content. Supports path strings with optional line ranges for files.
- **\`operations\`** – Create/delete directories and files in the workspace. Supports recursive directory creation (mkdir -p style) and safe delete-to-recycle for files/folders.

**⚠️ Use this tool (not grep) when you need to read full file content or large portions of a file.** Grep only returns matching snippets; for full content use \`workspace\` with \`paths\`.

## Usage Scenarios
- **Fuzzy search** – \`{"search": "wrktool"}\` or \`{"search": "config"}\` to find files/folders by name across the whole workspace; then use \`paths\` to read the ones you need
- **List workspace root** – \`{}\` or \`{"paths": []}\` to get directory tree
- **Read** workspace files to understand codebase structure
- Read specific lines from large files
- Batch read multiple related files
- Summarize long files to save token usage
- **Create directories** recursively (mkdir -p style), e.g. \`{"operations":[{"type":"createDirectory","path":"src/new/module"}]}\`
- **Delete directories** recursively to recycle bin, e.g. \`{"operations":[{"type":"deleteDirectory","path":"tmp/test-cache"}]}\`
- **Create files** (auto-create missing directories; skip if exists with message), e.g. \`{"operations":[{"type":"createFile","path":"src/config/new.json","content":"{}"}]}\`
- **Delete files** to recycle bin, e.g. \`{"operations":[{"type":"deleteFile","path":"src/old/unused.ts"}]}\`

## Input Format
\`\`\`json
{
  "search": "string",           // Optional. Fuzzy-search query: match file/folder paths across entire workspace (Everything-style). When provided, returns matching entries with path and structure; no need to list root first
  "paths": "string|string[]",   // Optional. Omit (or empty) to get directory tree or search results; otherwise file path(s) to read
  "summarized": false,          // Optional, whether to use AI summarization, default false
  "workspaceFolder": "string",  // Optional, workspace folder path. If not provided, uses first workspace folder
  "operations": {               // Optional. Single operation or array of operations; when provided, write operations (create/delete) will be executed.
    "type": "createDirectory | deleteDirectory | createFile | deleteFile",
    "path": "path/to/dir-or-file",   // Relative to workspace root or absolute path
    "content": "string"              // Optional, used only when type === "createFile" as initial file content
  } | [
    {
      "type": "createDirectory | deleteDirectory | createFile | deleteFile",
      "path": "path/to/dir-or-file",
      "content": "string"
    }
  ]
}
\`\`\`

## Path String Format
- \`"path/to/file.txt"\` - Read entire file
- \`"path/to/folder"\` - List directory contents (recursive listing; if the path is a directory, returns \`directoryListings\` with that folder's tree instead of error)
- \`"path/to/file.txt:L123"\` - Read single line (line 123)
- \`"path/to/file.txt:L123-L456"\` - Read line range (lines 123 to 456)

## Output Format
- When \`operations\` is provided (recommended to use without mixing \`paths\`/\`search\` in the same call): returns
\`\`\`json
{
  "operations": [
    {
      "type": "createDirectory | deleteDirectory | createFile | deleteFile",
      "path": "string",       // Resolved absolute path or root-relative path
      "success": true,
      "message": "human readable message"
    }
  ]
}
\`\`\`
- When \`search\` is provided (and no \`operations\`): returns \`{ tree, workspaceFolder, searchQuery, matchCount }\` — \`tree\` is the list of matched entries (each \`{ name, path, isDirectory }\`), sorted by path.
- When \`paths\` is omitted/empty and no \`search\` and no \`operations\`: returns \`{ tree, workspaceFolder }\` (full directory tree).
- When \`paths\` is provided (and no \`operations\`): returns \`files\` (for file paths) and optionally \`directoryListings\` (when a path was a directory). Listings and file/tree results may be **truncated** when too large; \`truncated\` and \`truncationMessage\` or \`message\` indicate truncation.
\`\`\`json
{
  "files": [
    {
      "path": "string",
      "content": "string",
      "startLine": 123,
      "endLine": 456,
      "totalLines": 1000,
      "summarized": false,
      "summary": "string",
      "truncated": false,
      "truncationMessage": "string"
    }
  ],
  "totalFiles": 1,
  "summarized": false,
  "directoryListings": [
    { "path": "string", "tree": [{ "name": "string", "path": "string", "isDirectory": true }], "truncated": false, "totalEntries": 10, "message": "string" }
  ]
}
\`\`\`

## Important Notes
- **\`search\`**: Fuzzy match (like Everything): query characters need only appear in order in the path/name (e.g. \`wrktool\` matches \`workspace-tool.ts\`). Search scope is the whole workspace. Use this first when you don't know exact paths.
- **\`operations\`**:
  - \`createDirectory\`: recursively creates directories (mkdir -p style). If some levels already exist, they are reused and considered successful; the message will indicate whether new directories were created or everything already existed.
  - \`deleteDirectory\`: deletes a directory recursively. Implementation uses the workspace file service (\`delete-file-or-folder\` IPC) which should move content to the recycle bin when possible rather than permanent deletion.
  - \`createFile\`: creates a file. If parent directories do not exist, they will be created automatically. If the file already exists, it will be **left untouched** and a message will indicate it was skipped.
  - \`deleteFile\`: deletes a file. Implementation uses \`delete-file-or-folder\` IPC to move to recycle bin instead of permanent delete when possible.
  - Paths under \`.metadoc\` are protected **except** \`.metadoc/skills/\` (Agent workspace skills): you may \`createFile\` / \`deleteFile\` there for \`SKILL.md\`; other \`.metadoc\` paths are still skipped.
- **No paths, no search, no operations**: returns workspace root directory tree (no error).
- Line numbers are 1-based (first line is 1)
- If line range exceeds file length, automatically truncates
- AI summarization emphasizes concise language without redundant content
- Supports batch reading of multiple files
- Paths can be relative to workspace folder or absolute
- **Prefer this tool over raw terminal commands** (like \`rm\`, \`mkdir\`, etc.) whenever you need to manage workspace files or directories inside MetaDoc. This keeps operations safe, undoable via recycle bin, and visible to agents.`
  },
  instruction: WORKSPACE_TOOL_DESCRIPTION,
  callback: workspaceToolCallback,
  displayComponent: WorkspaceDisplay,
  tags: ['workspace', 'file', 'read'],
  enabled: true,
  editable: false,
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description:
          '模糊搜索关键词（类似 Everything）。在整个工作区内按路径/文件名模糊匹配，返回匹配项及路径与目录结构；无需先列根目录。有值时优先执行搜索'
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description:
          '文件路径列表（单路径用单元素数组）。亦兼容实现侧将裸字符串规范为单元素数组。不提供、空数组时返回工作区根目录树或搜索结果；有值时读取对应文件。支持行数范围：":L123-L456" 或 ":L123"'
      },
      summarized: {
        type: 'boolean',
        description: '是否使用AI摘要。如果为true，会对每个文件内容进行AI摘要，节省上下文空间',
        default: false
      },
      workspaceFolder: {
        type: 'string',
        description: '工作区文件夹路径。如果不提供，使用第一个工作区文件夹'
      },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'createDirectory | deleteDirectory | createFile | deleteFile'
            },
            path: {
              type: 'string'
            },
            content: {
              type: 'string'
            }
          },
          required: ['type', 'path']
        },
        description:
          '文件/目录操作列表（单条操作用单元素数组）。类型：createDirectory（递归创建目录）、deleteDirectory（删除目录并移动到回收站）、createFile（创建文件，已存在则跳过）、deleteFile（删除文件并移动到回收站）。路径可为工作区相对或绝对路径。'
      }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: '文件读取结果列表'
      },
      totalFiles: {
        type: 'number',
        description: '总文件数'
      },
      summarized: {
        type: 'boolean',
        description: '是否使用了AI摘要'
      },
      operations: {
        type: 'array',
        description: '文件/目录操作结果列表',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: '操作类型：createDirectory | deleteDirectory | createFile | deleteFile'
            },
            path: {
              type: 'string',
              description: '操作目标路径（解析后的绝对路径或根相对路径）'
            },
            success: {
              type: 'boolean',
              description: '操作是否成功'
            },
            message: {
              type: 'string',
              description: '人类可读的操作结果说明'
            }
          }
        }
      }
    }
  }
}
