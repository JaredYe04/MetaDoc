/**
 * 终端执行 Tool 单元测试（渲染进程）
 * 覆盖：单命令、批量、异步、会话上下文、参数校验等
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { closeHandlers, mockInvoke, mockOn, mockRemoveListener } = vi.hoisted(() => {
  const closeHandlers: Array<
    (e: unknown, data: { invocationId: string; exitCode: number }) => void
  > = []
  const mockInvoke = vi.fn()
  const mockOn = vi.fn((_channel: string, handler: (...args: unknown[]) => void) => {
    if (_channel === 'terminal-close') closeHandlers.push(handler as any)
  })
  const mockRemoveListener = vi.fn()
  return { closeHandlers, mockInvoke, mockOn, mockRemoveListener }
})

vi.mock('../../bridge/message-bridge', () => ({
  default: {
    getIpc: () => ({ invoke: mockInvoke }),
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: mockOn,
    removeListener: mockRemoveListener
  }
}))

vi.mock('../logger', () => ({
  createRendererLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

vi.mock('../../i18n', () => ({
  i18n: {
    global: {
      t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
      locale: { value: 'zh_CN' }
    }
  }
}))

vi.mock('../settings.js', () => ({
  getSetting: vi.fn(() => Promise.resolve(true))
}))

vi.mock('../ai_tasks', () => ({
  createAiTask: vi.fn(() => ({ handle: 'mock', done: Promise.resolve() })),
  cancelAiTask: vi.fn()
}))

vi.mock('../event-bus.js', () => ({ default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }))

vi.mock('./components/TerminalExecutionDisplay.vue', () => ({ default: {} }))
vi.mock('../monaco-worker-config', () => ({ setupMonacoWorker: vi.fn() }))

import {
  terminalToolConfig,
  normalizeCommands,
  resolveCwd,
  getSessionCwd,
  setSessionCwd,
  clearAllSessions,
  getAllSessionIds
} from './terminal-tool'
import { tryParseCdTarget, updateSessionAfterRun, clearSession } from './terminal-session-manager'

const noop = () => {}

function setupExecuteSuccess() {
  mockInvoke.mockImplementation((channel: string, payload: any) => {
    if (channel === 'execute-terminal-command') {
      setImmediate(() => {
        closeHandlers.forEach((h) => h(null, { invocationId: payload.invocationId, exitCode: 0 }))
      })
      return Promise.resolve({ success: true })
    }
    return Promise.reject(new Error('unknown channel'))
  })
}

describe('terminal-tool', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockClear()
    closeHandlers.length = 0
    clearAllSessions()
  })

  describe('normalizeCommands', () => {
    it('单条 command 转为单元素数组', () => {
      const r = normalizeCommands({ command: 'echo hi' })
      expect(r).toEqual([{ command: 'echo hi', cwd: undefined, sessionId: undefined }])
    })

    it('commands 数组原样返回（过滤空命令）', () => {
      const r = normalizeCommands({
        commands: [
          { command: 'cd /tmp' },
          { command: '' },
          { command: '  ' },
          { command: 'ls -la' }
        ]
      })
      expect(r).toHaveLength(2)
      expect(r![0].command).toBe('cd /tmp')
      expect(r![1].command).toBe('ls -la')
    })

    it('缺少 command 和 commands 返回 null', () => {
      expect(normalizeCommands({})).toBeNull()
      expect(normalizeCommands({ command: '' })).toBeNull()
      expect(normalizeCommands({ commands: [] })).toBeNull()
      expect(normalizeCommands({ commands: [{ command: '' }] })).toBeNull()
    })

    it('单条 command 可带 cwd 和 sessionId', () => {
      const r = normalizeCommands({
        command: 'ls',
        cwd: '/home',
        sessionId: 's1'
      })
      expect(r).toEqual([{ command: 'ls', cwd: '/home', sessionId: 's1' }])
    })
  })

  describe('resolveCwd', () => {
    it('显式 cwd 优先', () => {
      setSessionCwd('s1', '/session-cwd')
      expect(resolveCwd({ command: 'ls', cwd: '/explicit' }, '/param')).toBe('/param')
      expect(resolveCwd({ command: 'ls', cwd: '/explicit' })).toBe('/explicit')
    })

    it('无显式 cwd 时使用 session cwd', () => {
      setSessionCwd('s1', '/session-cwd')
      expect(resolveCwd({ command: 'ls', sessionId: 's1' })).toBe('/session-cwd')
    })

    it('无 session 时返回 undefined', () => {
      expect(resolveCwd({ command: 'ls' })).toBeUndefined()
    })
  })

  describe('terminal-session-manager', () => {
    it('tryParseCdTarget 解析 cd 命令', () => {
      expect(tryParseCdTarget('cd /tmp')).toBe('/tmp')
      expect(tryParseCdTarget('cd /home/user')).toBe('/home/user')
      expect(tryParseCdTarget('cd "C:\\Users\\test"')).toBe('C:\\Users\\test')
      expect(tryParseCdTarget('cd')).toBeUndefined()
      expect(tryParseCdTarget('echo hello')).toBeUndefined()
    })

    it('getSessionCwd / setSessionCwd 读写会话 cwd', () => {
      expect(getSessionCwd('s1')).toBeUndefined()
      setSessionCwd('s1', '/tmp')
      expect(getSessionCwd('s1')).toBe('/tmp')
      clearSession('s1')
      expect(getSessionCwd('s1')).toBeUndefined()
    })

    it('updateSessionAfterRun 更新会话', () => {
      updateSessionAfterRun('s2', { cwd: '/new', exitCode: 0 })
      expect(getSessionCwd('s2')).toBe('/new')
    })

    it('getAllSessionIds 返回所有会话', () => {
      setSessionCwd('a', '/a')
      setSessionCwd('b', '/b')
      expect(getAllSessionIds()).toContain('a')
      expect(getAllSessionIds()).toContain('b')
      clearAllSessions()
      expect(getAllSessionIds()).toHaveLength(0)
    })
  })

  describe('execute-terminal-command 调用参数', () => {
    it('单命令调用时传入 encoding: utf-8', async () => {
      setupExecuteSuccess()
      const result = await terminalToolConfig.callback!(
        { command: 'echo hello' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledWith(
        'execute-terminal-command',
        expect.objectContaining({ encoding: 'utf-8', command: 'echo hello' })
      )
    })

    it('含中文命令原样传递', async () => {
      setupExecuteSuccess()
      const result = await terminalToolConfig.callback!(
        { command: 'echo 你好世界' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledWith(
        'execute-terminal-command',
        expect.objectContaining({ command: 'echo 你好世界', encoding: 'utf-8' })
      )
    })
  })

  describe('参数校验', () => {
    it('缺少 command 和 commands 时返回 failed', async () => {
      const result = await terminalToolConfig.callback!({}, new AbortController().signal, noop)
      expect(result.status).toBe('failed')
      expect(result.error).toBeDefined()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('command 为空字符串时返回 failed', async () => {
      const result = await terminalToolConfig.callback!(
        { command: '' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('failed')
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('batch 批量执行', () => {
    it('commands 数组顺序执行', async () => {
      setupExecuteSuccess()
      const result = await terminalToolConfig.callback!(
        {
          commands: [
            { command: 'cd /tmp', sessionId: 'batch-s1' },
            { command: 'ls', sessionId: 'batch-s1' }
          ]
        },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenNthCalledWith(
        1,
        'execute-terminal-command',
        expect.objectContaining({ command: 'cd /tmp' })
      )
      expect(mockInvoke).toHaveBeenNthCalledWith(
        2,
        'execute-terminal-command',
        expect.objectContaining({ command: 'ls' })
      )
      expect(result.result).toBeDefined()
      expect((result.result as any).batchResults).toHaveLength(2)
    })
  })

  describe('sessionId 会话上下文', () => {
    it('sessionId 存在时使用 session cwd', async () => {
      setSessionCwd('ctx1', '/home/agent')
      setupExecuteSuccess()
      const result = await terminalToolConfig.callback!(
        { command: 'pwd', sessionId: 'ctx1' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledWith(
        'execute-terminal-command',
        expect.objectContaining({ cwd: '/home/agent' })
      )
    })

    it('显式 cwd 覆盖 session cwd', async () => {
      setSessionCwd('ctx2', '/session')
      setupExecuteSuccess()
      await terminalToolConfig.callback!(
        { command: 'ls', sessionId: 'ctx2', cwd: '/override' },
        new AbortController().signal,
        noop
      )
      expect(mockInvoke).toHaveBeenCalledWith(
        'execute-terminal-command',
        expect.objectContaining({ cwd: '/override' })
      )
    })
  })

  describe('async 异步模式', () => {
    it('async: true 时立即返回，不等待执行完成', async () => {
      let resolved = false
      mockInvoke.mockImplementation((channel: string, payload: any) => {
        if (channel === 'execute-terminal-command') {
          setTimeout(() => {
            closeHandlers.forEach((h) =>
              h(null, { invocationId: payload.invocationId, exitCode: 0 })
            )
          }, 100)
          return Promise.resolve({ success: true })
        }
        return Promise.reject(new Error('unknown'))
      })

      const start = Date.now()
      const result = await terminalToolConfig.callback!(
        { command: 'sleep 10', async: true },
        new AbortController().signal,
        noop
      )
      const elapsed = Date.now() - start

      expect(result.status).toBe('succeeded')
      expect((result.result as any).taskId).toBeDefined()
      expect((result.result as any).message).toContain('后台')
      expect(elapsed).toBeLessThan(500)
    })

    it('async 模式下 batch 也立即返回', async () => {
      mockInvoke.mockImplementation((channel: string, payload: any) => {
        if (channel === 'execute-terminal-command') {
          setImmediate(() => {
            closeHandlers.forEach((h) =>
              h(null, { invocationId: payload.invocationId, exitCode: 0 })
            )
          })
          return Promise.resolve({ success: true })
        }
        return Promise.reject(new Error('unknown'))
      })

      const result = await terminalToolConfig.callback!(
        {
          commands: [{ command: 'echo 1' }, { command: 'echo 2' }],
          async: true
        },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect((result.result as any).commandsCount).toBe(2)
    })
  })

  describe('并发多会话', () => {
    it('不同 sessionId 可独立维护 cwd', async () => {
      setSessionCwd('worker-1', '/proj/a')
      setSessionCwd('worker-2', '/proj/b')
      setupExecuteSuccess()

      const [r1, r2] = await Promise.all([
        terminalToolConfig.callback!(
          { command: 'ls', sessionId: 'worker-1' },
          new AbortController().signal,
          noop
        ),
        terminalToolConfig.callback!(
          { command: 'ls', sessionId: 'worker-2' },
          new AbortController().signal,
          noop
        )
      ])

      expect(r1.status).toBe('succeeded')
      expect(r2.status).toBe('succeeded')
      const calls = mockInvoke.mock.calls.filter((c: any[]) => c[0] === 'execute-terminal-command')
      expect(calls.some((c: any[]) => c[1].cwd === '/proj/a')).toBe(true)
      expect(calls.some((c: any[]) => c[1].cwd === '/proj/b')).toBe(true)
    })
  })

  describe('上下文管理', () => {
    it('cd 命令后更新 session cwd', async () => {
      setSessionCwd('cd-session', '/initial')
      setupExecuteSuccess()

      await terminalToolConfig.callback!(
        {
          commands: [
            { command: 'cd /tmp', sessionId: 'cd-session' },
            { command: 'pwd', sessionId: 'cd-session' }
          ]
        },
        new AbortController().signal,
        noop
      )

      expect(getSessionCwd('cd-session')).toBeDefined()
    })
  })
})
