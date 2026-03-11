/**
 * Workspace Tool
 * 读取工作区文件夹中的文件，支持路径字符串和行数范围
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import { createAiTask, cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import type { AIDialogMessage } from '@/types'
import { createDetailedError } from './tool-utils'
import WorkspaceDisplay from './components/WorkspaceDisplay.vue'
import eventBus from '../event-bus'
import messageBridge from '../../bridge/message-bridge'

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
}

/**
 * 工作区工具结果
 */
export interface WorkspaceToolResult {
  files: WorkspaceFileResult[]
  totalFiles: number
  summarized: boolean
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
 * 递归读取目录树
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
  const paths = params.paths as string | string[] | undefined
  const summarized = params.summarized === true
  const workspaceFolder = params.workspaceFolder as string | undefined
  const searchQuery = params.search != null ? String(params.search).trim() : ''

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
      const sorted = matched.slice(0, 500).sort((a, b) => a.path.localeCompare(b.path))

      const primaryFolder = folders[0]
      onUpdate(
        {
          content: {
            stage: 'completed',
            tree: sorted,
            workspaceFolder: primaryFolder,
            searchQuery
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 100,
          message: i18n.global.t('agent.tool.workspace.progress.searchCompleted', {
            count: sorted.length,
            query: searchQuery
          })
        }
      )
      return {
        status: 'succeeded',
        data: {
          content: {
            stage: 'completed',
            tree: sorted,
            workspaceFolder: primaryFolder,
            searchQuery
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        result: { tree: sorted, workspaceFolder: primaryFolder, searchQuery, matchCount: sorted.length }
      }
    } catch (error) {
      logger.error('模糊搜索失败:', error)
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
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
      const tree = await readDirectoryTree(folderPath)
      onUpdate(
        {
          content: { stage: 'completed', tree, workspaceFolder: folderPath },
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
          content: { stage: 'completed', tree, workspaceFolder: folderPath },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        result: { tree, workspaceFolder: folderPath }
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

    // 检查路径是否是绝对路径
    const isAbsolutePath = (path: string): boolean => {
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

    // 处理每个文件
    for (let i = 0; i < pathArray.length; i++) {
      const pathStr = pathArray[i]
      const { path: filePath, startLine, endLine } = parsePathString(pathStr)

      // 查找文件的完整路径
      const fullPath = await findFileInWorkspaceFolders(filePath)

      if (!fullPath) {
        logger.warn(
          `文件未找到: ${filePath}（已在 ${foldersToSearch.length} 个工作区文件夹中搜索）`
        )
        // 继续处理其他文件，不中断整个过程
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

      try {
        const { content, totalLines } = await readFileContent(fullPath, startLine, endLine)

        let summary: string | undefined = undefined
        if (summarized) {
          summary = await summarizeContent(content, signal, onUpdate)
        }

        results.push({
          path: filePath,
          content: summarized ? content : content, // 如果summarized为true，content仍然保留，summary字段包含摘要
          startLine,
          endLine,
          totalLines,
          summarized,
          summary
        })
      } catch (error) {
        logger.warn(`读取文件失败: ${fullPath}`, error)
        // 继续处理其他文件，不中断整个过程
      }

      if (signal?.aborted) {
        return {
          status: 'cancelled'
        }
      }
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          result: {
            files: results,
            totalFiles: results.length,
            summarized
          }
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.workspace.progress.completed', { count: results.length })
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          result: {
            files: results,
            totalFiles: results.length,
            summarized
          }
        },
        format: 'json',
        componentName: 'WorkspaceDisplay'
      },
      result: {
        files: results,
        totalFiles: results.length,
        summarized
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

const workspaceToolLocales: ToolLocales = {
  zh_cn: {
    name: '工作区文件读取',
    description:
      '读取工作区文件、模糊搜索或列出根目录。传 search 时在整个工作区内模糊匹配路径/文件名（类似 Everything）；不传 paths 时返回目录树；传 paths 时读取文件，支持行数范围与 AI 摘要'
  },
  en_us: {
    name: 'Workspace File Reader',
    description:
      'Read workspace files, fuzzy-search by path/name, or list root directory. Use search to match paths across the whole workspace (Everything-style); omit paths to get directory tree; use paths to read file(s). Supports line ranges and optional AI summarization'
  },
  de_DE: {
    name: 'Arbeitsbereich-Dateileser',
    description:
      'Dateien lesen, Fuzzy-Suche nach Pfad/Name im gesamten Arbeitsbereich oder Stammverzeichnis auflisten. Pfadzeichenfolgen, Zeilenbereiche, optionale KI-Zusammenfassung'
  },
  fr_FR: {
    name: "Lecteur de fichiers d'espace de travail",
    description:
      "Lire les fichiers, recherche floue par chemin/nom sur tout l'espace de travail ou lister la racine. Chaînes de chemin, plages de lignes, résumé IA optionnel"
  },
  ja_JP: {
    name: 'ワークスペースファイルリーダー',
    description:
      'ファイル読み取り、パス/ファイル名の曖昧検索（ワークスペース全体）、またはルート一覧。行範囲・AI要約対応'
  },
  ko_KR: {
    name: '작업 공간 파일 읽기',
    description:
      '파일 읽기, 전체 작업 공간에서 경로/파일명 퍼지 검색 또는 루트 목록. 줄 범위 및 AI 요약 지원'
  }
}

export const workspaceToolConfig: AgentToolConfig = {
  id: 'workspace',
  name: workspaceToolLocales,
  description: workspaceToolLocales,
  origin: 'internal',
  spec: {
    name: 'workspace',
    brief:
      'Read workspace files, fuzzy-search by path/name (Everything-style), or list root directory. Use \`search\` to find files/folders across the whole workspace without listing root first. Use \`paths\` to read file(s); omit both to get directory tree. Supports line ranges and optional AI summarization.',
    fullSpec: `# Workspace File Reader Tool

## Description
Read files from workspace folders, **fuzzy-search** by path/file name across the whole workspace (like Everything: type text, get matching paths and directory structure), or list the workspace root directory.

- **\`search\` (recommended when you don't know exact paths)** – Pass a string to fuzzy-match against all file and folder paths in the workspace. Returns matched entries with full path and structure. No need to list root first.
- **No \`paths\` and no \`search\`** – Returns workspace root directory tree (no error).
- **\`paths\`** – Read specific file(s). Supports path strings with optional line ranges.

**⚠️ Use this tool (not grep) when you need to read full file content or large portions of a file.** Grep only returns matching snippets; for full content use \`workspace\` with \`paths\`.

## Usage Scenarios
- **Fuzzy search** – \`{"search": "wrktool"}\` or \`{"search": "config"}\` to find files/folders by name across the whole workspace; then use \`paths\` to read the ones you need
- **List workspace root** – \`{}\` or \`{"paths": []}\` to get directory tree
- Read workspace files to understand codebase structure
- Read specific lines from large files
- Batch read multiple related files
- Summarize long files to save token usage

## Input Format
\`\`\`json
{
  "search": "string",           // Optional. Fuzzy-search query: match file/folder paths across entire workspace (Everything-style). When provided, returns matching entries with path and structure; no need to list root first
  "paths": "string|string[]",   // Optional. Omit (or empty) to get directory tree or search results; otherwise file path(s) to read
  "summarized": false,          // Optional, whether to use AI summarization, default false
  "workspaceFolder": "string"   // Optional, workspace folder path. If not provided, uses first workspace folder
}
\`\`\`

## Path String Format
- \`"path/to/file.txt"\` - Read entire file
- \`"path/to/file.txt:L123"\` - Read single line (line 123)
- \`"path/to/file.txt:L123-L456"\` - Read line range (lines 123 to 456)

## Output Format
- When \`search\` is provided: returns \`{ tree, workspaceFolder, searchQuery, matchCount }\` — \`tree\` is the list of matched entries (each \`{ name, path, isDirectory }\`), sorted by path.
- When \`paths\` is omitted/empty and no \`search\`: returns \`{ tree, workspaceFolder }\` (full directory tree).
- When \`paths\` is provided:
\`\`\`json
{
  "files": [
    {
      "path": "string",
      "content": "string",
      "startLine": 123,      // Optional, if line range specified
      "endLine": 456,        // Optional, if line range specified
      "totalLines": 1000,
      "summarized": false,
      "summary": "string"    // Optional, AI-generated summary if summarized=true
    }
  ],
  "totalFiles": 1,
  "summarized": false
}
\`\`\`

## Important Notes
- **\`search\`**: Fuzzy match (like Everything): query characters need only appear in order in the path/name (e.g. \`wrktool\` matches \`workspace-tool.ts\`). Search scope is the whole workspace. Use this first when you don't know exact paths.
- **No paths and no search**: returns workspace root directory tree (no error).
- Line numbers are 1-based (first line is 1)
- If line range exceeds file length, automatically truncates
- AI summarization emphasizes concise language without redundant content
- Supports batch reading of multiple files
- Paths can be relative to workspace folder or absolute`
  },
  instruction: `
# 工作区文件读取工具

## 功能描述
读取工作区文件、**模糊搜索**（类似 Everything：输入文本即可按路径/文件名模糊匹配整个工作区，展示匹配项的路径与目录结构），或列出工作区根目录。

- **\`search\`（推荐在不知道确切路径时使用）**：传字符串，在整个工作区内对文件/文件夹路径做模糊匹配，返回匹配项及完整路径与结构，无需先列根目录。
- **不传 \`paths\` 且不传 \`search\`**：返回工作区根目录树（不报错）。
- **传 \`paths\`**：读取指定文件，支持路径字符串和行数范围。支持可选的AI摘要。

**⚠️ 需要读整个文件或大段内容时请用本工具（不要用 grep）**。grep 只返回匹配片段；要完整内容请用 \`workspace\` 传 \`paths\`。

## 使用场景
- **模糊搜索**：\`{"search": "wrktool"}\` 或 \`{"search": "config"}\` 在整个工作区内按名称找文件/文件夹，再根据返回的 path 用 \`paths\` 读具体文件
- **先看目录再读文件**：\`{}\` 或 \`{"paths": []}\` 获取根目录树
- 读取工作区文件，了解代码库结构
- 从大文件中读取特定行
- 批量读取多个相关文件
- 对长文件进行摘要，节省token使用

## 输入格式
\`\`\`json
{
  "search": "string",           // 可选。模糊搜索关键词：在整个工作区内匹配路径/文件名（类似 Everything）。有值时返回匹配项及路径与结构，无需先列根目录
  "paths": "string|string[]",   // 可选。不传或为空时返回目录树或搜索结果；有值时读取对应文件
  "summarized": false,          // 可选，是否使用AI摘要，默认false
  "workspaceFolder": "string"   // 可选，工作区文件夹路径。不提供则使用第一个工作区文件夹
}
\`\`\`

## 路径字符串格式
- \`"path/to/file.txt"\` - 读取完整文件
- \`"path/to/file.txt:L123"\` - 读取单行（第123行）
- \`"path/to/file.txt:L123-L456"\` - 读取行范围（第123行到第456行）

## 输出格式
- 传了 \`search\` 时：返回 \`{ tree, workspaceFolder, searchQuery, matchCount }\`，\`tree\` 为匹配项列表（每项 \`{ name, path, isDirectory }\`），按路径排序。
- \`paths\` 未传或为空且未传 \`search\`：返回 \`{ tree, workspaceFolder }\`（完整目录树）。
- \`paths\` 有值时：
\`\`\`json
{
  "files": [
    {
      "path": "string",
      "content": "string",
      "startLine": 123,      // 可选，如果指定了行范围
      "endLine": 456,        // 可选，如果指定了行范围
      "totalLines": 1000,
      "summarized": false,
      "summary": "string"    // 可选，如果summarized=true，包含AI生成的摘要
    }
  ],
  "totalFiles": 1,
  "summarized": false
}
\`\`\`

## 注意事项
- **\`search\`**：模糊匹配（类似 Everything），关键词字符按顺序出现在路径/名称中即算匹配（如 \`wrktool\` 可匹配 \`workspace-tool.ts\`）。搜索范围为整个工作区。不知道确切路径时优先用 \`search\`。
- **无 paths 且无 search**：返回工作区根目录树（不报错）。
- 行号从1开始（第一行是1）
- 如果行数范围超出文件总行数，自动截断
- AI摘要功能强调语言简洁，不包含多余内容
- 支持批量读取多个文件
- 路径可以是相对于工作区文件夹的相对路径，也可以是绝对路径
- 如果文件不存在或无法读取，会跳过该文件，继续处理其他文件
`,
  callback: workspaceToolCallback,
  displayComponent: WorkspaceDisplay,
  tags: ['workspace', 'file', 'read'],
  enabled: true,
  editable: false,
  locales: workspaceToolLocales,
  inputSchema: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description:
          '模糊搜索关键词（类似 Everything）。在整个工作区内按路径/文件名模糊匹配，返回匹配项及路径与目录结构；无需先列根目录。有值时优先执行搜索'
      },
      paths: {
        oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        description:
          '文件路径（字符串或数组）。不提供、空数组或空字符串时返回工作区根目录树或搜索结果；有值时读取对应文件。支持行数范围：":L123-L456" 或 ":L123"'
      },
      summarized: {
        type: 'boolean',
        description: '是否使用AI摘要。如果为true，会对每个文件内容进行AI摘要，节省上下文空间',
        default: false
      },
      workspaceFolder: {
        type: 'string',
        description: '工作区文件夹路径。如果不提供，使用第一个工作区文件夹'
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
      }
    }
  }
}
