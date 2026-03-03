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

  // 如果没有指定paths，返回目录树
  if (!paths) {
    try {
      onUpdate(
        {
          content: {
            stage: 'loading-tree'
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        {
          percentage: 10,
          message: i18n.global.t('agent.tool.workspace.progress.loadingTree', '正在加载目录树...')
        }
      )

      // 获取工作区文件夹列表
      let folders: string[] = []

      if (workspaceFolder) {
        folders = [workspaceFolder]
      } else {
        // 尝试从eventBus获取工作区文件夹
        const foldersFromEvent = await getWorkspaceFolders()
        folders = foldersFromEvent.length > 0 ? foldersFromEvent : []
      }

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

      // 读取第一个工作区文件夹的目录树
      const folderPath = folders[0]
      const tree = await readDirectoryTree(folderPath)

      onUpdate(
        {
          content: {
            stage: 'completed',
            tree: tree,
            workspaceFolder: folderPath
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
            tree: tree,
            workspaceFolder: folderPath
          },
          format: 'json',
          componentName: 'WorkspaceDisplay'
        },
        result: {
          tree: tree,
          workspaceFolder: folderPath
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

  // 处理文件读取
  const pathArray = Array.isArray(paths) ? paths : [paths]

  if (pathArray.length === 0) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: paths（文件路径）',
        [
          '{"paths": "path/to/file.txt"}  // 单个文件',
          '{"paths": ["file1.txt", "file2.txt"]}  // 多个文件',
          '{"paths": "file.txt:L123-L456"}  // 行数范围'
        ],
        [
          'paths可以是字符串或字符串数组',
          '支持行数范围：":L123-L456" 或 ":L123"',
          '如果不指定行数范围，返回完整文件内容'
        ]
      )
    }
  }

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
    description: '读取工作区文件夹中的文件，支持路径字符串和行数范围，可选择AI摘要'
  },
  en_us: {
    name: 'Workspace File Reader',
    description:
      'Read files from workspace folders, supports path strings and line ranges, optional AI summarization'
  },
  de_DE: {
    name: 'Arbeitsbereich-Dateileser',
    description:
      'Dateien aus Arbeitsordnern lesen, unterstützt Pfadzeichenfolgen und Zeilenbereiche, optionale KI-Zusammenfassung'
  },
  fr_FR: {
    name: "Lecteur de fichiers d'espace de travail",
    description:
      "Lire les fichiers des dossiers d'espace de travail, prend en charge les chaînes de chemin et les plages de lignes, résumé IA optionnel"
  },
  ja_JP: {
    name: 'ワークスペースファイルリーダー',
    description:
      'ワークスペースフォルダからファイルを読み取り、パス文字列と行範囲をサポート、オプションのAI要約'
  },
  ko_KR: {
    name: '작업 공간 파일 읽기',
    description: '작업 공간 폴더에서 파일 읽기, 경로 문자열 및 줄 범위 지원, 선택적 AI 요약'
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
      'Read files from workspace folders. Supports path strings with optional line ranges (e.g., "file.txt:L123-L456"). Can read multiple files in batch. Optional AI summarization to save context space.',
    fullSpec: `# Workspace File Reader Tool

## Description
Read files from workspace folders. Supports reading single files, multiple files, or file line ranges. Can optionally use AI to summarize file contents to save context space.

**⚠️ Use this tool (not grep) when you need to read full file content or large portions of a file.** Grep only returns matching snippets; for full content use \`workspace\` with \`paths\`.

## Usage Scenarios
- Read workspace files to understand codebase structure
- Read specific lines from large files
- Batch read multiple related files
- Get directory tree structure of workspace
- Summarize long files to save token usage

## Input Format
\`\`\`json
{
  "paths": "string|string[]",  // Optional, file path(s). If not provided, returns directory tree
  "summarized": false,          // Optional, whether to use AI summarization, default false
  "workspaceFolder": "string"   // Optional, workspace folder path. If not provided, uses first workspace folder
}
\`\`\`

## Path String Format
- \`"path/to/file.txt"\` - Read entire file
- \`"path/to/file.txt:L123"\` - Read single line (line 123)
- \`"path/to/file.txt:L123-L456"\` - Read line range (lines 123 to 456)

## Output Format
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
- If \`paths\` is not provided, returns directory tree structure
- Line numbers are 1-based (first line is 1)
- If line range exceeds file length, automatically truncates
- AI summarization emphasizes concise language without redundant content
- Supports batch reading of multiple files
- Paths can be relative to workspace folder or absolute`
  },
  instruction: `
# 工作区文件读取工具

## 功能描述
读取工作区文件夹中的文件，支持路径字符串和行数范围。可以读取单个文件、多个文件或指定行范围。支持可选的AI摘要功能，用于节省上下文空间。

**⚠️ 需要读整个文件或大段内容时请用本工具（不要用 grep）**。grep 只返回匹配片段；要完整内容请用 \`workspace\` 传 \`paths\`。

## 使用场景
- 读取工作区文件，了解代码库结构
- 从大文件中读取特定行
- 批量读取多个相关文件
- 获取工作区目录树结构
- 对长文件进行摘要，节省token使用

## 输入格式
\`\`\`json
{
  "paths": "string|string[]",  // 可选，文件路径（字符串或数组）。如果不提供，返回目录树
  "summarized": false,          // 可选，是否使用AI摘要，默认false
  "workspaceFolder": "string"   // 可选，工作区文件夹路径。如果不提供，使用第一个工作区文件夹
}
\`\`\`

## 路径字符串格式
- \`"path/to/file.txt"\` - 读取完整文件
- \`"path/to/file.txt:L123"\` - 读取单行（第123行）
- \`"path/to/file.txt:L123-L456"\` - 读取行范围（第123行到第456行）

## 输出格式
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
- 如果不提供\`paths\`参数，返回目录树结构
- 行号从1开始（第一行是1）
- 如果行数范围超出文件总行数，自动截断（比如总共15行，请求第16行，忽略即可）
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
      paths: {
        oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        description:
          '文件路径（字符串或字符串数组）。如果不提供，返回目录树。支持行数范围：":L123-L456" 或 ":L123"'
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
