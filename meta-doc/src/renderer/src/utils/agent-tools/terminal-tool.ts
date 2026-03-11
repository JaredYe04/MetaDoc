/**
 * 终端执行Tool
 * 执行终端命令，需要用户批准（可设置信任模式）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress,
  ToolLocales
} from '../../types/agent-tool'
import type { AIDialogMessage } from '@/types'
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import eventBus from '../event-bus.js'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import TerminalExecutionDisplay from './components/TerminalExecutionDisplay.vue'
import { createDetailedError } from './tool-utils'
import messageBridge from '../../bridge/message-bridge'
import { getSetting } from '../settings.js'

const logger = createRendererLogger('TerminalTool')

const STORAGE_KEY = 'agent-tool-terminal-trust-mode'
const SETTING_KEY_TERMINAL_ALLOWED = 'agentTerminalExecutionAllowed'

interface TerminalExecutionResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  summary?: string
  approved: boolean
}

interface ApprovalRequest {
  command: string
  resolve: (approved: boolean) => void
  reject: () => void
}

// 存储待处理的批准请求
const pendingApprovals = new Map<string, ApprovalRequest>()

/** 获取终端执行环境说明（当前 OS + Shell），供 AI 使用正确语法；中英文一起返回 */
async function getTerminalEnvironmentSpec(): Promise<string> {
  try {
    const ipc = messageBridge.getIpc()
    if (!ipc) return ''
    const env = await messageBridge.invoke('get-terminal-environment')
    if (!env || typeof env.platform === 'undefined') return ''
    const { platformLabel, shell, shellLabel } = env as {
      platform: string
      platformLabel: string
      shell: string
      shellLabel: string
    }
    const tipsZh = '下方 Shell 即主进程实际执行命令所用的终端，请仅使用该终端的语法。'
    const tipsEn = 'The shell below is the one actually used to run your command; use only that shell’s syntax.'
    return `
## 当前执行环境 / Current execution environment
- **OS / 操作系统**: ${platformLabel}
- **Shell / 终端**: ${shell} (${shellLabel})
- **说明 / Note**: ${tipsZh} ${tipsEn}
`
  } catch (e) {
    logger.warn('获取终端环境失败，不注入环境说明', e)
    return ''
  }
}

const terminalToolLocales: ToolLocales = {
  zh_cn: {
    name: '终端执行',
    description: '执行终端命令，执行前需要用户批准（可设置信任模式）',
    instruction: `
# 终端执行工具

## 禁止用途（必须遵守）
- **禁止用本工具创建、写入或修改任何文件内容**。不要用 echo、type、重定向（>、>>）等方式写文件。
- **创建/编辑文本文件（含新建 .txt、.md 并写入中文或任意内容）一律使用 \`edit\` 工具**，否则会产生乱码且不符合规范。
- 本工具仅用于：执行命令（如 dir、mkdir、运行程序）、查看输出；不用于写文件。

## 功能描述
执行终端/命令行指令，并返回执行结果。执行前默认需要用户批准，用户可以选择信任AI让其自动执行所有命令。

## 使用场景
- 执行系统命令（如 dir、ls、mkdir）
- 运行CLI程序
- 系统管理
- **不用于**：创建文件、写入文件内容、编辑文件 → 请用 \`edit\` 工具

## 输入格式
\`\`\`json
{
  "command": "string", // 必需，要执行的命令
  "cwd": "string", // 可选，工作目录
  "timeout": 30000, // 可选，超时时间（毫秒），默认30秒
  "analyze": false // 可选，是否使用LLM分析输出结果，默认false
}
\`\`\`

## 输出格式
\`\`\`json
{
  "command": "string",
  "exitCode": 0,
  "stdout": "string",
  "stderr": "string",
  "summary": "string", // LLM分析的结果摘要
  "approved": true
}
\`\`\`

## 注意事项
1. 危险命令需要用户明确批准
2. 可以设置信任模式，允许AI自动执行命令
3. 建议设置合理的超时时间
4. 某些命令可能需要管理员权限

## 执行环境与语法（重要）
本工具在**主进程**中通过固定规则选择实际使用的终端（见下方「当前执行环境」）。**你必须先看下方块里写的是哪种 Shell（cmd.exe / PowerShell / /bin/sh 等），然后只使用该终端的语法**；用错语法会导致命令失败（例如在 cmd 下写 PowerShell 语法，或在 PowerShell 下写 cmd 的 \`&&\`）。
- 若下方为 **cmd.exe**：用 \`&&\` 连接命令、\`^\` 转义；不要写 PowerShell 专有语法。
- 若下方为 **PowerShell**：用 \`;\` 连接命令、\`$\` 变量等；不要写 cmd 专有语法。
- 若下方为 **/bin/sh**：用 \`&&\` 或 \`;\` 连接；不要依赖仅 bash 支持的语法。
`
  },
  en_us: {
    name: 'Terminal Execution',
    description: 'Execute terminal commands, requires user approval (can set trust mode)',
    instruction: `
# Terminal Execution Tool

## Description
Executes terminal/command line commands and returns results. Requires user approval by default, user can choose to trust AI for automatic execution.

## Input Format
\`\`\`json
{
  "command": "string", // Required, command to execute
  "cwd": "string", // Optional, working directory
  "timeout": 30000, // Optional, timeout in milliseconds, default 30s
  "analyze": false // Optional, whether to use LLM to analyze output, default false
}
\`\`\`

## Execution environment and syntax (important)
Commands are run in the **main process** with a specific shell (see the "Current execution environment" block below). **You must read which Shell is shown there (cmd.exe / PowerShell / /bin/sh) and use only that terminal’s syntax**; wrong syntax causes failures (e.g. PowerShell syntax under cmd, or cmd \`&&\` under PowerShell).
- If the block says **cmd.exe**: chain with \`&&\`, escape with \`^\`; do not use PowerShell-only syntax.
- If it says **PowerShell**: chain with \`;\`, use \`$\` variables etc.; do not use cmd-only syntax.
- If it says **/bin/sh**: chain with \`&&\` or \`;\`; do not rely on bash-only syntax.
`
  },
  de_DE: {
    name: 'Terminal-Ausführung',
    description:
      'Führt Terminal-Befehle aus, erfordert Benutzerbestätigung (Vertrauensmodus kann eingestellt werden)'
  },
  fr_FR: {
    name: 'Exécution de terminal',
    description:
      "Exécute des commandes de terminal, nécessite l'approbation de l'utilisateur (mode de confiance peut être défini)"
  },
  ja_JP: {
    name: 'ターミナル実行',
    description: 'ターミナルコマンドを実行、ユーザー承認が必要（信頼モード設定可能）'
  },
  ko_KR: {
    name: '터미널 실행',
    description: '터미널 명령 실행, 사용자 승인 필요(신뢰 모드 설정 가능)'
  }
}

/**
 * 检查是否处于信任模式（用户曾在确认弹窗中勾选“信任模式”）
 */
function isTrustMode(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

/**
 * 检查设置中是否默认允许终端执行（不弹权限确认）
 * 默认 true：未配置或为 true 时直接执行，避免无 UI 时卡住
 */
async function isTerminalExecutionAllowedBySetting(): Promise<boolean> {
  try {
    const v = await getSetting(SETTING_KEY_TERMINAL_ALLOWED)
    return v !== false
  } catch {
    return true
  }
}

/** agent-cli 驱动时无 UI，终端命令需自动批准，否则会一直卡在等待批准 */
function isAgentCliActive(): boolean {
  try {
    return typeof window !== 'undefined' && !!(window as any).__agentCliActive
  } catch {
    return false
  }
}

/**
 * 请求用户批准命令执行：通过 eventBus 触发全局渲染进程弹窗（TerminalApprovalDialog），不依赖 Agent 是否渲染 Display 组件
 */
async function requestApproval(command: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`

    pendingApprovals.set(approvalId, {
      command,
      resolve,
      reject: () => {
        reject(new Error('用户拒绝了命令执行'))
      }
    })

    const handleApproved = (data: { command: string; trustMode?: boolean }) => {
      if (data.command === command) {
        if (data.trustMode) {
          try {
            localStorage.setItem(STORAGE_KEY, 'true')
          } catch (error) {
            logger.error('保存信任模式失败:', error)
          }
        }
        pendingApprovals.delete(approvalId)
        eventBus.off('terminal-command-approved', handleApproved)
        eventBus.off('terminal-command-rejected', handleRejected)
        resolve(true)
      }
    }

    const handleRejected = (data: { command: string }) => {
      if (data.command === command) {
        pendingApprovals.delete(approvalId)
        eventBus.off('terminal-command-approved', handleApproved)
        eventBus.off('terminal-command-rejected', handleRejected)
        reject(new Error('用户拒绝了命令执行'))
      }
    }

    eventBus.on('terminal-command-approved', handleApproved)
    eventBus.on('terminal-command-rejected', handleRejected)

    if (isTrustMode()) {
      setTimeout(() => {
        handleApproved({ command, trustMode: true })
      }, 100)
    } else {
      // 触发全局渲染进程弹窗（始终挂载在 App 根上，不依赖 Display 是否展示）
      eventBus.emit('terminal-approval-show-dialog', { command })
    }
  })
}

/**
 * 执行终端命令（通过IPC，支持流式输出）
 * 主进程 spawn 后立即返回，需在此处等待 terminal-close 并累积 stdout/stderr，超时则发中断。
 */
async function executeCommand(
  command: string,
  cwd?: string,
  timeoutMs?: number,
  invocationId?: string,
  onStreamUpdate?: (type: 'stdout' | 'stderr', data: string) => void
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const ipc = messageBridge.getIpc()
  if (!ipc) {
    throw new Error('终端执行功能仅在Electron环境中可用')
  }

  const invId = invocationId || `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const timeout = timeoutMs ?? 30000
  const accStdout: string[] = []
  const accStderr: string[] = []

  const stdoutHandler = (_event: any, payload: { invocationId: string; data: string }) => {
    if (payload.invocationId !== invId) return
    accStdout.push(payload.data)
    onStreamUpdate?.('stdout', payload.data)
  }
  const stderrHandler = (_event: any, payload: { invocationId: string; data: string }) => {
    if (payload.invocationId !== invId) return
    accStderr.push(payload.data)
    onStreamUpdate?.('stderr', payload.data)
  }

  messageBridge.on('terminal-stdout-stream', stdoutHandler)
  messageBridge.on('terminal-stderr-stream', stderrHandler)

  const cleanup = () => {
    messageBridge.removeListener('terminal-stdout-stream', stdoutHandler)
    messageBridge.removeListener('terminal-stderr-stream', stderrHandler)
  }

  try {
    const result = await messageBridge.invoke('execute-terminal-command', {
      command,
      cwd,
      invocationId: invId,
      encoding: 'utf-8'
    })
    if (!result?.success) {
      cleanup()
      throw new Error(result?.error || '启动命令失败')
    }

    const closed = await new Promise<{ exitCode: number }>((resolve, reject) => {
      const onClose = (_e: any, data: { invocationId: string; exitCode: number }) => {
        if (data.invocationId !== invId) return
        messageBridge.removeListener('terminal-close', onClose)
        messageBridge.removeListener('terminal-error', onError)
        if (timeoutId) clearTimeout(timeoutId)
        resolve({ exitCode: data.exitCode })
      }
      const onError = (_e: any, data: { invocationId: string; error: string }) => {
        if (data.invocationId !== invId) return
        messageBridge.removeListener('terminal-close', onClose)
        messageBridge.removeListener('terminal-error', onError)
        if (timeoutId) clearTimeout(timeoutId)
        reject(new Error(data.error || '命令执行错误'))
      }
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      if (timeout > 0) {
        timeoutId = setTimeout(async () => {
          timeoutId = null
          messageBridge.removeListener('terminal-close', onClose)
          messageBridge.removeListener('terminal-error', onError)
          try {
            await messageBridge.invoke('terminal-send-interrupt', { invocationId: invId })
          } catch {
            /* ignore interrupt errors */
          }
          resolve({
            exitCode: 124
          })
        }, timeout)
      }
      messageBridge.on('terminal-close', onClose)
      messageBridge.on('terminal-error', onError)
    })

    cleanup()
    const stdout = accStdout.join('')
    const stderr = accStderr.join('')
    return {
      exitCode: closed.exitCode,
      stdout,
      stderr: closed.exitCode === 124 ? stderr + '\n[命令超时被终止]' : stderr
    }
  } catch (error) {
    cleanup()
    logger.error('执行命令失败:', error)
    throw error
  }
}

/**
 * 使用LLM分析命令输出
 */
async function analyzeOutput(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number,
  signal?: AbortSignal,
  onUpdate?: (data: ToolCallbackData, progress?: ToolProgress) => void
): Promise<string> {
  const prompt = `分析以下终端命令的执行结果：

命令: ${command}
退出码: ${exitCode}
标准输出:
${stdout}
${stderr ? `标准错误:\n${stderr}` : ''}

请简要总结命令执行的结果和状态。`

  const target = ref('')
  const originKey = `terminal-analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`
  // 温度配置将在llm-api.js中从全局配置读取
  const messages: AIDialogMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]
  const { handle, done } = createAiTask('分析终端输出', messages, target, 'chat', originKey, {
    stream: true
  })

  // 立即通过 onUpdate 传递流式输出信息（在 await done 之前）
  if (onUpdate) {
    onUpdate(
      {
        content: {
          stage: 'analyzing-streaming',
          command,
          analysisTargetRef: target,
          analysisDonePromise: done
        },
        format: 'json'
      },
      {
        percentage: 70,
        message: '正在分析命令输出（流式输出）...'
      }
    )
  }

  if (signal) {
    signal.addEventListener('abort', () => {
      cancelAiTask(handle, false)
    })
  }

  try {
    await done
  } catch (error) {
    // 检查是否是取消错误，保留已生成的内容
    const isCancelled =
      error instanceof Error &&
      (error.message === '任务已取消' ||
        error.message.includes('任务已取消') ||
        (error as any).name === 'AbortError')

    if (!isCancelled) {
      // 重新抛出原始错误，让调用者知道任务失败
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('分析终端输出失败:', error)
      throw new Error(`AI任务失败: ${errorMessage}`)
    }
    // 取消时继续执行，使用已生成的内容
  }

  return target.value.trim()
}

/**
 * 终端执行Tool回调函数
 */
const terminalToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const command = params.command as string
  const cwd = params.cwd as string | undefined
  const timeout = (params.timeout as number) || 30000
  const analyze = params.analyze ?? false // 默认false

  if (!command || typeof command !== 'string') {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: command（要执行的终端命令）',
        [
          '{"command": "ls -la"}',
          '{"command": "echo Hello", "cwd": "/path/to/directory"}',
          '{"command": "npm install", "timeout": 300000}'
        ],
        [
          '可以设置cwd参数指定命令执行的工作目录',
          '可以设置timeout参数指定超时时间（毫秒）',
          '命令执行需要用户批准，确保安全',
          '支持Windows、macOS和Linux命令'
        ]
      )
    }
  }

  try {
    // 检查是否需要用户批准（默认允许执行，避免权限弹窗未展示时卡住）
    let approved = false
    if (isAgentCliActive()) {
      approved = true
      logger.info('agent-cli 模式，自动批准终端命令')
    } else if (isTrustMode()) {
      approved = true
      logger.info('信任模式已启用，自动批准命令执行')
    } else if (await isTerminalExecutionAllowedBySetting()) {
      approved = true
      logger.info('设置中已默认允许终端执行，自动批准命令')
    } else {
      // 显示等待批准状态
      onUpdate(
        {
          content: {
            stage: 'waiting_approval',
            command
          },
          format: 'json',
          componentName: 'TerminalExecutionDisplay'
        },
        {
          percentage: 10,
          message: i18n.global.t('agent.tool.terminal.progress.approving', '等待用户批准...')
        }
      )

      // 请求用户批准
      try {
        approved = await requestApproval(command)
      } catch (error) {
        // 用户拒绝
        onUpdate(
          {
            content: {
              stage: 'rejected',
              command
            },
            format: 'json',
            componentName: 'TerminalExecutionDisplay'
          },
          {
            percentage: 0,
            message: i18n.global.t('agent.tool.terminal.progress.rejected', '命令执行已被拒绝')
          }
        )
        return {
          status: 'failed',
          error: i18n.global.t('agent.tool.terminal.error.rejected', '用户拒绝了命令执行')
        }
      }
    }

    // 生成 invocationId 用于流式输出
    const invocationId = `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 用于累积流式输出
    let accumulatedStdout = ''
    let accumulatedStderr = ''

    // 流式输出更新回调
    const handleStreamUpdate = (type: 'stdout' | 'stderr', data: string) => {
      if (type === 'stdout') {
        accumulatedStdout += data
      } else {
        accumulatedStderr += data
      }

      // 实时更新显示
      onUpdate(
        {
          content: {
            stage: 'executing',
            command,
            approved,
            stdout: accumulatedStdout,
            stderr: accumulatedStderr
          },
          format: 'json',
          componentName: 'TerminalExecutionDisplay'
        },
        {
          percentage:
            20 + Math.min(50, ((accumulatedStdout.length + accumulatedStderr.length) / 1000) * 30),
          message: i18n.global.t('agent.tool.terminal.progress.executing', '正在执行命令...')
        }
      )
    }

    onUpdate(
      {
        content: {
          stage: 'executing',
          command,
          approved,
          stdout: '',
          stderr: ''
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      },
      {
        percentage: 20,
        message: i18n.global.t('agent.tool.terminal.progress.executing', '正在执行命令...')
      }
    )

    // 执行命令（支持流式输出）
    const { exitCode, stdout, stderr } = await executeCommand(
      command,
      cwd,
      timeout,
      invocationId,
      handleStreamUpdate
    )

    // 使用累积的输出（如果流式输出已更新）
    const finalStdout = accumulatedStdout || stdout
    const finalStderr = accumulatedStderr || stderr

    onUpdate(
      {
        content: {
          stage: 'analyzing',
          command,
          exitCode,
          stdout: finalStdout,
          stderr: finalStderr
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      },
      {
        percentage: 70,
        message: i18n.global.t('agent.tool.terminal.progress.analyzing', '正在分析输出...')
      }
    )

    // 使用LLM分析输出（如果启用）
    let summary: string | undefined
    if (analyze) {
      try {
        summary = await analyzeOutput(command, finalStdout, finalStderr, exitCode, signal, onUpdate)
      } catch (error) {
        logger.warn('LLM分析输出失败:', error)
      }
    }

    const result: TerminalExecutionResult = {
      command,
      exitCode,
      stdout: finalStdout,
      stderr: finalStderr,
      summary,
      approved: true
    }

    onUpdate(
      {
        content: {
          stage: 'completed',
          ...result
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      },
      {
        percentage: 100,
        message: i18n.global.t('agent.tool.terminal.progress.completed', '命令执行完成')
      }
    )

    return {
      status: 'succeeded',
      data: {
        content: {
          stage: 'completed',
          ...result
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      },
      result
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('终端执行失败:', error)
    return {
      status: 'failed',
      error: i18n.global.t(
        'agent.tool.terminal.error.failed',
        { error: errorMessage },
        `命令执行失败: ${errorMessage}`
      )
    }
  }
}

export const terminalToolConfig: AgentToolConfig = {
  id: 'terminal-execution',
  name: terminalToolLocales,
  description: terminalToolLocales,
  origin: 'internal',
  spec: {
    name: 'terminal-execution',
    brief:
      'Run shell commands only (e.g. dir, mkdir). Do NOT create/write/edit files—use the edit tool for any file content (avoids encoding issues).',
    fullSpec: `# Terminal Execution Tool

## Prohibition (must follow)
- **Do NOT use this tool to create, write, or modify any file content.** Do not use echo, redirection (>, >>), or similar to write files.
- **Creating or editing text files (including new .txt, .md with Chinese or any text) must use the \`edit\` tool.** Using terminal for file content causes encoding corruption (e.g. Chinese becomes garbled).
- This tool is only for: running commands (e.g. dir, mkdir, run programs), viewing output. Not for writing files.

## Description
Executes terminal/command line commands and returns results. Requires user approval by default, user can choose to trust AI for automatic execution of all commands.

## Usage Scenarios
- Execute system commands (e.g. dir, ls, mkdir)
- Run CLI programs
- System management
- **Not for**: creating files, writing file content, editing files → use \`edit\` tool

## Input Format
\`\`\`json
{
  "command": "string", // Required, command to execute
  "cwd": "string", // Optional, working directory
  "timeout": 30000, // Optional, timeout in milliseconds, default 30s
  "analyze": false // Optional, whether to use LLM to analyze output, default false
}
\`\`\`

## Output Format
\`\`\`json
{
  "command": "string",
  "exitCode": 0,
  "stdout": "string",
  "stderr": "string",
  "summary": "string", // LLM analysis result summary
  "approved": true
}
\`\`\`

## Important Notes
1. Dangerous commands require explicit user approval
2. Can set trust mode to allow AI to automatically execute commands
3. Recommend setting reasonable timeout
4. Some commands may require administrator privileges

## Execution environment and syntax (important)
Commands are run in the **main process** with a specific shell (see the "Current execution environment" block below). **You must read which Shell is shown there (cmd.exe / PowerShell / /bin/sh) and use only that terminal’s syntax**; wrong syntax causes failures (e.g. PowerShell syntax under cmd, or cmd \`&&\` under PowerShell).
- If the block says **cmd.exe**: chain with \`&&\`, escape with \`^\`; do not use PowerShell-only syntax.
- If it says **PowerShell**: chain with \`;\`, use \`$\` variables etc.; do not use cmd-only syntax.
- If it says **/bin/sh**: chain with \`&&\` or \`;\`; do not rely on bash-only syntax.`
  },
  instruction: terminalToolLocales,
  getDynamicSpec: getTerminalEnvironmentSpec,
  tags: ['terminal', 'command', 'system', 'cli'],
  running: false,
  enabled: true,
  requiresLLM: true, // 用于分析输出
  displayComponent: TerminalExecutionDisplay,
  callback: terminalToolCallback,
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的终端命令'
      },
      cwd: {
        type: 'string',
        description: '工作目录'
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒）',
        default: 30000
      },
      analyze: {
        type: 'boolean',
        description: '是否使用LLM分析输出结果',
        default: true
      }
    },
    required: ['command']
  },
  outputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      exitCode: { type: 'number' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      summary: { type: 'string' },
      approved: { type: 'boolean' }
    }
  },
  locales: terminalToolLocales
}

// 导出信任模式相关函数供UI使用
export { isTrustMode, requestApproval }
