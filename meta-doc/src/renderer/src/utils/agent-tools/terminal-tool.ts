/**
 * 终端执行Tool
 * 执行终端命令，需要用户批准（可设置信任模式）
 */

import type {
  AgentToolConfig,
  ToolCallback,
  ToolCallbackResult,
  ToolCallbackData,
  ToolProgress
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
import {
  getSessionCwd,
  setSessionCwd,
  updateSessionAfterRun,
  tryParseCdTarget
} from './terminal-session-manager'

const logger = createRendererLogger('TerminalTool')

/** 终端输出（stdout+stderr）最大总字符数，超过则截断以控制上下文长度 */
const MAX_TERMINAL_OUTPUT_CHARS = 50000

const STORAGE_KEY = 'agent-tool-terminal-trust-mode'
const SETTING_KEY_TERMINAL_ALLOWED = 'agentTerminalExecutionAllowed'

interface TerminalExecutionResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  summary?: string
  approved: boolean
  /** 输出是否因过长被截断 */
  outputTruncated?: boolean
  truncationMessage?: string
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
    const tipsEn =
      'The shell below is the one actually used to run your command; use only that shell’s syntax.'
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

const TERMINAL_TOOL_NAME = 'Terminal Execution'
const TERMINAL_TOOL_DESCRIPTION =
  'Execute terminal commands, requires user approval (can set trust mode)'
const TERMINAL_INSTRUCTION = `
# Terminal Execution Tool

## Description
Executes terminal/command line commands and returns results. Requires user approval by default, user can choose to trust AI for automatic execution. Supports session context (same terminal), batch execution, and async mode.

## Input Format
\`\`\`json
{
  "command": "string", // Required (or use "commands" for batch)
  "commands": [{"command":"...","cwd":"...","sessionId":"..."}], // Optional, batch
  "sessionId": "string", // Optional, reuse same terminal context (shared cwd)
  "cwd": "string", // Optional, working directory (overrides session cwd)
  "timeout": 30000, // Optional, timeout in milliseconds, default 30s
  "analyze": false, // Optional, whether to use LLM to analyze output
  "async": false // Optional, if true, run without waiting (returns taskId)
}
\`\`\`

## Execution environment and syntax (important)
Commands are run in the **main process** with a specific shell (see the "Current execution environment" block below). **You must read which Shell is shown there (cmd.exe / PowerShell / /bin/sh) and use only that terminal’s syntax**; wrong syntax causes failures (e.g. PowerShell syntax under cmd, or cmd \`&&\` under PowerShell).
- If the block says **cmd.exe**: chain with \`&&\`, escape with \`^\`; do not use PowerShell-only syntax.
- If it says **PowerShell**: chain with \`;\`, use \`$\` variables etc.; do not use cmd-only syntax.
- If it says **/bin/sh**: chain with \`&&\` or \`;\`; do not rely on bash-only syntax.
`

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

/** 单条命令项（batch 模式） */
export interface CommandItem {
  command: string
  cwd?: string
  sessionId?: string
}

/** 解析并规范化输入：支持 command 或 commands */
export function normalizeCommands(params: Record<string, unknown>): CommandItem[] | null {
  const commands = params.commands as CommandItem[] | undefined
  if (Array.isArray(commands) && commands.length > 0) {
    const valid = commands.filter((c) => c && typeof c.command === 'string' && c.command.trim())
    if (valid.length === 0) return null
    return valid
  }
  const cmd = params.command as string | undefined
  if (cmd && typeof cmd === 'string' && cmd.trim()) {
    return [
      {
        command: cmd.trim(),
        cwd: params.cwd as string | undefined,
        sessionId: params.sessionId as string | undefined
      }
    ]
  }
  return null
}

/** 解析单条命令的 cwd（考虑 session 继承） */
export function resolveCwd(item: CommandItem, explicitCwd?: string): string | undefined {
  if (explicitCwd) return explicitCwd
  if (item.cwd) return item.cwd
  if (item.sessionId) return getSessionCwd(item.sessionId)
  return undefined
}

/**
 * 终端执行Tool回调函数
 */
const terminalToolCallback: ToolCallback = async (params, signal, onUpdate) => {
  const timeout = (params.timeout as number) || 30000
  const analyze = params.analyze ?? false
  const asyncMode = params.async === true
  const batch = normalizeCommands(params as Record<string, unknown>)

  if (!batch) {
    return {
      status: 'failed',
      error: createDetailedError(
        '缺少必需参数: command 或 commands（要执行的终端命令）',
        [
          '{"command": "ls -la"}',
          '{"command": "echo Hello", "cwd": "/path/to/directory"}',
          '{"commands": [{"command": "cd /tmp"}, {"command": "ls"}], "sessionId": "s1"}',
          '{"command": "npm install", "async": true}'
        ],
        [
          '可以设置 sessionId 在同一终端上下文中连续执行',
          '可以设置 commands 批量执行多条命令',
          '可以设置 async: true 异步执行不等待结果',
          '支持Windows、macOS和Linux命令'
        ]
      )
    }
  }

  try {
    // 异步模式：后台执行，立即返回
    if (asyncMode) {
      const taskId = `async-terminal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const first = batch[0]
      const cwd = resolveCwd(first, params.cwd as string | undefined)
      ;(async () => {
        try {
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i]
            const itemCwd = resolveCwd(item, params.cwd as string | undefined)
            await executeCommand(item.command, itemCwd, timeout)
            if (item.sessionId) {
              const cdTarget = tryParseCdTarget(item.command)
              updateSessionAfterRun(item.sessionId, {
                cwd: cdTarget || itemCwd,
                exitCode: 0,
                command: item.command
              })
            }
          }
        } catch (e) {
          logger.warn('异步终端任务执行失败', e)
        }
      })()
      return {
        status: 'succeeded',
        data: {
          content: { stage: 'async_started', taskId, commandsCount: batch.length },
          format: 'json',
          componentName: 'TerminalExecutionDisplay'
        },
        result: { taskId, message: '命令已在后台执行', commandsCount: batch.length }
      }
    }

    // 同步模式：逐条执行 batch，或单条
    const results: TerminalExecutionResult[] = []
    let lastCwd: string | undefined = params.cwd as string | undefined

    for (let idx = 0; idx < batch.length; idx++) {
      const item = batch[idx]
      const command = item.command
      const cwd = resolveCwd(item, lastCwd)

      // 检查是否需要用户批准
      let approved = false
      if (isAgentCliActive()) {
        approved = true
      } else if (isTrustMode()) {
        approved = true
      } else if (await isTerminalExecutionAllowedBySetting()) {
        approved = true
      } else {
        onUpdate(
          {
            content: { stage: 'waiting_approval', command },
            format: 'json',
            componentName: 'TerminalExecutionDisplay'
          },
          {
            percentage: 10,
            message: i18n.global.t('agent.tool.terminal.progress.approving', '等待用户批准...')
          }
        )
        try {
          approved = await requestApproval(command)
        } catch {
          onUpdate(
            {
              content: { stage: 'rejected', command },
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

      const invocationId = `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      let accumulatedStdout = ''
      let accumulatedStderr = ''

      const handleStreamUpdate = (type: 'stdout' | 'stderr', data: string) => {
        if (type === 'stdout') accumulatedStdout += data
        else accumulatedStderr += data
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
              20 +
              Math.min(50, ((accumulatedStdout.length + accumulatedStderr.length) / 1000) * 30),
            message: i18n.global.t('agent.tool.terminal.progress.executing', '正在执行命令...')
          }
        )
      }

      onUpdate(
        {
          content: { stage: 'executing', command, approved, stdout: '', stderr: '' },
          format: 'json',
          componentName: 'TerminalExecutionDisplay'
        },
        {
          percentage: 20,
          message: i18n.global.t('agent.tool.terminal.progress.executing', '正在执行命令...')
        }
      )

      const { exitCode, stdout, stderr } = await executeCommand(
        command,
        cwd,
        timeout,
        invocationId,
        handleStreamUpdate
      )
      let finalStdout = accumulatedStdout || stdout
      let finalStderr = accumulatedStderr || stderr

      // 更新 session cwd（若为 cd 命令），供后续同 session 命令继承
      if (item.sessionId) {
        const cdTarget = tryParseCdTarget(command)
        if (cdTarget) {
          setSessionCwd(item.sessionId, cdTarget)
          lastCwd = cdTarget
        } else {
          lastCwd = cwd
        }
        updateSessionAfterRun(item.sessionId, { cwd: cdTarget || cwd, exitCode, command })
      } else {
        lastCwd = cwd
      }

      let outputTruncated = false
      let truncationMessage: string | undefined
      const totalLen = finalStdout.length + finalStderr.length
      if (totalLen > MAX_TERMINAL_OUTPUT_CHARS) {
        const maxStdout = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.6)
        const maxStderr = Math.floor(MAX_TERMINAL_OUTPUT_CHARS * 0.4)
        if (finalStdout.length > maxStdout) {
          finalStdout = finalStdout.slice(0, maxStdout) + '\n...[stdout 已截断]'
          outputTruncated = true
        }
        if (finalStderr.length > maxStderr) {
          finalStderr = finalStderr.slice(0, maxStderr) + '\n...[stderr 已截断]'
          outputTruncated = true
        }
        truncationMessage = `终端输出过长，已截断至约 ${MAX_TERMINAL_OUTPUT_CHARS} 字符。`
      }

      let summary: string | undefined
      if (analyze && batch.length === 1) {
        try {
          summary = await analyzeOutput(
            command,
            finalStdout,
            finalStderr,
            exitCode,
            signal,
            onUpdate
          )
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
        approved: true,
        ...(outputTruncated && { outputTruncated: true, truncationMessage })
      }
      results.push(result)
    }

    const lastResult = results[results.length - 1]!
    onUpdate(
      {
        content: {
          stage: 'completed',
          ...lastResult,
          batchResults: batch.length > 1 ? results : undefined
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
          ...lastResult,
          batchResults: batch.length > 1 ? results : undefined
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      },
      result: batch.length > 1 ? { batchResults: results } : lastResult
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
  name: TERMINAL_TOOL_NAME,
  description: TERMINAL_TOOL_DESCRIPTION,
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
  instruction: TERMINAL_INSTRUCTION,
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
      command: { type: 'string', description: 'Terminal command to execute' },
      commands: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            cwd: { type: 'string' },
            sessionId: { type: 'string' }
          },
          required: ['command']
        },
        description: 'Batch commands (sequential)'
      },
      sessionId: { type: 'string', description: 'Reuse same terminal context (shared cwd)' },
      cwd: { type: 'string', description: 'Working directory' },
      timeout: { type: 'number', description: 'Timeout in milliseconds', default: 30000 },
      analyze: {
        type: 'boolean',
        description: 'Whether to use LLM to analyze output',
        default: false
      },
      async: {
        type: 'boolean',
        description: 'Run without waiting (fire and forget)',
        default: false
      }
    },
    required: []
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
  }
}

// 导出信任模式相关函数供UI使用
export { isTrustMode, requestApproval }

// 导出会话管理供测试使用
export {
  getSessionCwd,
  setSessionCwd,
  clearSession,
  clearAllSessions,
  getAllSessionIds
} from './terminal-session-manager'
