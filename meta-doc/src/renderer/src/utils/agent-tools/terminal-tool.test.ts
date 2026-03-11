/**
 * 终端执行 Tool 单元测试（渲染进程）
 * 验证中文命令与 UTF-8 编码正确传给主进程，避免乱码。
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

// 需要能解析 tool 的 callback，不加载 Vue 组件
import { terminalToolConfig } from './terminal-tool'

const noop = () => {}

describe('terminal-tool', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOn.mockClear()
    closeHandlers.length = 0
  })

  describe('execute-terminal-command 调用参数（中文与 UTF-8）', () => {
    it('调用 execute-terminal-command 时始终传入 encoding: utf-8', async () => {
      mockInvoke.mockImplementation((channel: string, payload: any) => {
        if (channel === 'execute-terminal-command') {
          expect(payload.encoding).toBe('utf-8')
          expect(payload.command).toBeDefined()
          expect(payload.invocationId).toBeDefined()
          setImmediate(() => {
            closeHandlers.forEach((h) => h(null, { invocationId: payload.invocationId, exitCode: 0 }))
          })
          return Promise.resolve({ success: true })
        }
        return Promise.reject(new Error('unknown channel'))
      })

      const result = await terminalToolConfig.callback!(
        { command: 'echo hello' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledWith('execute-terminal-command', expect.objectContaining({
        encoding: 'utf-8',
        command: 'echo hello'
      }))
    })

    it('含中文的命令原样传递，不丢字不乱码', async () => {
      const chineseCommand = 'echo 你好世界'
      mockInvoke.mockImplementation((channel: string, payload: any) => {
        if (channel === 'execute-terminal-command') {
          expect(payload.encoding).toBe('utf-8')
          expect(payload.command).toBe(chineseCommand)
          setImmediate(() => {
            closeHandlers.forEach((h) => h(null, { invocationId: payload.invocationId, exitCode: 0 }))
          })
          return Promise.resolve({ success: true })
        }
        return Promise.reject(new Error('unknown channel'))
      })

      const result = await terminalToolConfig.callback!(
        { command: chineseCommand },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledWith(
        'execute-terminal-command',
        expect.objectContaining({ command: 'echo 你好世界', encoding: 'utf-8' })
      )
    })

    it('含中文路径或复杂中文时参数不变', async () => {
      const cmd = 'dir "C:\\Users\\用户\\文档"'
      mockInvoke.mockImplementation((channel: string, payload: any) => {
        if (channel === 'execute-terminal-command') {
          expect(payload.command).toBe(cmd)
          expect(payload.encoding).toBe('utf-8')
          setImmediate(() => {
            closeHandlers.forEach((h) => h(null, { invocationId: payload.invocationId, exitCode: 0 }))
          })
          return Promise.resolve({ success: true })
        }
        return Promise.reject(new Error('unknown channel'))
      })

      const result = await terminalToolConfig.callback!(
        { command: cmd },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('succeeded')
      expect(mockInvoke).toHaveBeenCalledWith(
        'execute-terminal-command',
        expect.objectContaining({ command: cmd, encoding: 'utf-8' })
      )
    })
  })

  describe('参数校验', () => {
    it('缺少 command 时返回 failed', async () => {
      const result = await terminalToolConfig.callback!(
        {},
        new AbortController().signal,
        noop
      )
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
})
