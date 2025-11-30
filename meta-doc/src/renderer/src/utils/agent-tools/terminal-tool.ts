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
import { createRendererLogger } from '../logger'
import { i18n } from '../../i18n'
import eventBus from '../event-bus.js'
import { createAiTask } from '../ai_tasks'
import { cancelAiTask } from '../ai_tasks'
import { ref } from 'vue'
import TerminalExecutionDisplay from './components/TerminalExecutionDisplay.vue'
import { createDetailedError } from './tool-utils'

const logger = createRendererLogger('TerminalTool')

const STORAGE_KEY = 'agent-tool-terminal-trust-mode'

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

const terminalToolLocales: ToolLocales = {
  zh_cn: {
    name: '终端执行',
    description: '执行终端命令，执行前需要用户批准（可设置信任模式）',
    instruction: `
# 终端执行工具

## 功能描述
执行终端/命令行指令，并返回执行结果。执行前默认需要用户批准，用户可以选择信任AI让其自动执行所有命令。

## 使用场景
- 执行系统命令
- 运行CLI程序
- 文件操作
- 系统管理

## 输入格式
\`\`\`json
{
  "command": "string", // 必需，要执行的命令
  "cwd": "string", // 可选，工作目录
  "timeout": 30000, // 可选，超时时间（毫秒），默认30秒
  "analyze": true // 可选，是否使用LLM分析输出结果，默认true
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
  "analyze": true // Optional, whether to use LLM to analyze output, default true
}
\`\`\`
`
  }
}

/**
 * 检查是否处于信任模式
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
 * 请求用户批准命令执行（通过Display组件）
 */
async function requestApproval(command: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    // 存储批准请求
    pendingApprovals.set(approvalId, {
      command,
      resolve,
      reject: () => {
        reject(new Error('用户拒绝了命令执行'))
      }
    })

    // 监听批准事件
    const handleApproved = (data: { command: string; trustMode?: boolean }) => {
      if (data.command === command) {
        // 如果启用了信任模式，保存设置
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

    // 如果信任模式已启用，自动批准
    if (isTrustMode()) {
      setTimeout(() => {
        handleApproved({ command, trustMode: true })
      }, 100)
    }
  })
}

/**
 * 执行终端命令（通过IPC，支持流式输出）
 */
async function executeCommand(
  command: string,
  cwd?: string,
  timeout?: number,
  invocationId?: string,
  onStreamUpdate?: (type: 'stdout' | 'stderr', data: string) => void
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const ipcRenderer = (window as any).electron?.ipcRenderer || null
  
  if (!ipcRenderer) {
    throw new Error('终端执行功能仅在Electron环境中可用')
  }

  // 设置流式输出监听器
  if (invocationId && onStreamUpdate) {
    const stdoutHandler = (_event: any, payload: { invocationId: string; data: string; command: string }) => {
      if (payload.invocationId === invocationId && payload.command === command) {
        onStreamUpdate('stdout', payload.data)
      }
    }
    
    const stderrHandler = (_event: any, payload: { invocationId: string; data: string; command: string }) => {
      if (payload.invocationId === invocationId && payload.command === command) {
        onStreamUpdate('stderr', payload.data)
      }
    }

    ipcRenderer.on('terminal-stdout-stream', stdoutHandler)
    ipcRenderer.on('terminal-stderr-stream', stderrHandler)

    // 清理函数
    const cleanup = () => {
      ipcRenderer.removeListener('terminal-stdout-stream', stdoutHandler)
      ipcRenderer.removeListener('terminal-stderr-stream', stderrHandler)
    }

    try {
      const result = await ipcRenderer.invoke('execute-terminal-command', {
        command,
        cwd,
        timeout,
        invocationId
      })
      cleanup()
      return result
    } catch (error) {
      cleanup()
      logger.error('执行命令失败:', error)
      throw error
    }
  } else {
    // 不支持流式输出的旧方式
    try {
      const result = await ipcRenderer.invoke('execute-terminal-command', {
        command,
        cwd,
        timeout,
        invocationId: invocationId || `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      })
      return result
    } catch (error) {
      logger.error('执行命令失败:', error)
      throw error
    }
  }
}

/**
 * 使用LLM分析命令输出
 */
async function analyzeOutput(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number
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
  const { handle, done } = createAiTask(
    '分析终端输出',
    prompt,
    target,
    'answer',
    originKey,
    { temperature: 0, stream: true }
  )

  try {
    await done
  } catch (error) {
    // 重新抛出原始错误，让调用者知道任务失败
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('分析终端输出失败:', error)
    throw new Error(`AI任务失败: ${errorMessage}`)
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
  const analyze = params.analyze !== false // 默认true

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
    // 检查是否需要用户批准
    let approved = false
    if (isTrustMode()) {
      approved = true
      logger.info('信任模式已启用，自动批准命令执行')
    } else {
      // 显示等待批准状态
      onUpdate({
        content: {
          stage: 'waiting_approval',
          command
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      }, {
        percentage: 10,
        message: i18n.global.t('agent.tool.terminal.progress.approving', '等待用户批准...')
      })

      // 请求用户批准
      try {
        approved = await requestApproval(command)
      } catch (error) {
        // 用户拒绝
        onUpdate({
          content: {
            stage: 'rejected',
            command
          },
          format: 'json',
          componentName: 'TerminalExecutionDisplay'
        }, {
          percentage: 0,
          message: i18n.global.t('agent.tool.terminal.progress.rejected', '命令执行已被拒绝')
        })
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
      onUpdate({
        content: {
          stage: 'executing',
          command,
          approved,
          stdout: accumulatedStdout,
          stderr: accumulatedStderr
        },
        format: 'json',
        componentName: 'TerminalExecutionDisplay'
      }, {
        percentage: 20 + Math.min(50, (accumulatedStdout.length + accumulatedStderr.length) / 1000 * 30),
        message: i18n.global.t('agent.tool.terminal.progress.executing', '正在执行命令...')
      })
    }

    onUpdate({
      content: {
        stage: 'executing',
        command,
        approved,
        stdout: '',
        stderr: ''
      },
      format: 'json',
      componentName: 'TerminalExecutionDisplay'
    }, {
      percentage: 20,
      message: i18n.global.t('agent.tool.terminal.progress.executing', '正在执行命令...')
    })

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

    onUpdate({
      content: {
        stage: 'analyzing',
        command,
        exitCode,
        stdout: finalStdout,
        stderr: finalStderr
      },
      format: 'json',
      componentName: 'TerminalExecutionDisplay'
    }, {
      percentage: 70,
      message: i18n.global.t('agent.tool.terminal.progress.analyzing', '正在分析输出...')
    })

    // 使用LLM分析输出（如果启用）
    let summary: string | undefined
    if (analyze) {
      try {
        summary = await analyzeOutput(command, stdout, stderr, exitCode)
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

    onUpdate({
      content: {
        stage: 'completed',
        ...result
      },
      format: 'json',
      componentName: 'TerminalExecutionDisplay'
    }, {
      percentage: 100,
      message: i18n.global.t('agent.tool.terminal.progress.completed', '命令执行完成')
    })

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
      error: i18n.global.t('agent.tool.terminal.error.failed', { error: errorMessage }, `命令执行失败: ${errorMessage}`)
    }
  }
}

export const terminalToolConfig: AgentToolConfig = {
  id: 'terminal-execution',
  name: {
    'zh_cn': { name: '终端执行' },
    'en_us': { name: 'Terminal Execution' },
    'de_DE': { name: 'Terminal-Ausführung' },
    'fr_FR': { name: 'Exécution de terminal' },
    'ja_JP': { name: 'ターミナル実行' },
    'ko_KR': { name: '터미널 실행' }
  } as any,
  description: {
    'zh_cn': { description: '执行终端命令，执行前需要用户批准（可设置信任模式）' },
    'en_us': { description: 'Execute terminal commands, requires user approval (can set trust mode)' },
    'de_DE': { description: 'Führt Terminal-Befehle aus, erfordert Benutzerbestätigung (Vertrauensmodus kann eingestellt werden)' },
    'fr_FR': { description: 'Exécute des commandes de terminal, nécessite l\'approbation de l\'utilisateur (mode de confiance peut être défini)' },
    'ja_JP': { description: 'ターミナルコマンドを実行、ユーザー承認が必要（信頼モード設定可能）' },
    'ko_KR': { description: '터미널 명령 실행, 사용자 승인 필요(신뢰 모드 설정 가능)' }
  } as any,
  instruction: terminalToolLocales,
  origin: 'internal',
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
export { isTrustMode, setTrustMode }

