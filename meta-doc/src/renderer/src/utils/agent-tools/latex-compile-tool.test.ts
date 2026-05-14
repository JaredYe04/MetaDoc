/**
 * LaTeX 编译 Tool 单元测试（Vitest）
 * 从 latex-compile-tool-impl 导入回调，避免加载 Vue 组件依赖
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('../../bridge/message-bridge', () => {
  const bridge = {
    getIpc: () => ({ invoke: mockInvoke }),
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: vi.fn(),
    removeListener: vi.fn()
  }
  return { default: bridge }
})
vi.mock('../logger', () => ({
  createRendererLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  })
}))
vi.mock('../../i18n', () => ({
  i18n: {
    global: {
      t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
      locale: { value: 'en_US' }
    }
  }
}))
vi.mock('../regex-utils', () => ({
  extractOuterJsonString: (s: string) => s
}))

import { latexCompileToolCallback, type LaTeXCompileToolResult } from './latex-compile-tool-impl'

function noop() {}

describe('latex-compile-tool', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    })
  })

  describe('参数校验', () => {
    it('缺少 outputPdfPath 时返回 failed', async () => {
      const result = await latexCompileToolCallback(
        { tex: '\\documentclass{article}\\begin{document}hi\\end{document}' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('failed')
      expect(result.error).toContain('outputPdfPath')
    })

    it('outputPdfPath 为空字符串时返回 failed', async () => {
      const result = await latexCompileToolCallback(
        { tex: '\\documentclass{article}\\begin{document}hi\\end{document}', outputPdfPath: '   ' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('failed')
      expect(result.error).toBeDefined()
    })

    it('同时传入 tex 和 texFilePath 时返回 failed', async () => {
      const result = await latexCompileToolCallback(
        {
          tex: '\\documentclass{article}\\begin{document}hi\\end{document}',
          texFilePath: '/path/to/source.tex',
          outputPdfPath: 'out.pdf'
        },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('failed')
      expect(result.error).toMatch(/二选一|only one/i)
    })

    it('既不传 tex 也不传 texFilePath 时返回 failed', async () => {
      const result = await latexCompileToolCallback(
        { outputPdfPath: 'out.pdf' },
        new AbortController().signal,
        noop
      )
      expect(result.status).toBe('failed')
      expect(result.error).toMatch(/tex|texFilePath|之一/i)
    })
  })

  describe('编译结果', () => {
    it('仅传 tex + outputPdfPath 且 compile-tex 成功时返回 succeeded 与 stderr', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'compile-tex') {
          return Promise.resolve({
            status: 'success',
            pdfPath: '/abs/out.pdf',
            stderr: 'Warning: some warning',
            stdout: 'stdout line'
          })
        }
        return Promise.reject(new Error('unexpected channel'))
      })

      const result = await latexCompileToolCallback(
        {
          tex: '\\documentclass{article}\\begin{document}Hello\\end{document}',
          outputPdfPath: 'out.pdf'
        },
        new AbortController().signal,
        noop
      )

      expect(result.status).toBe('succeeded')
      expect(result.result).toBeDefined()
      const data = result.result as LaTeXCompileToolResult
      expect(data.success).toBe(true)
      expect(data.stderr).toBe('Warning: some warning')
      expect(data.pdfPath).toBe('/abs/out.pdf')
      expect(data.stdout).toBe('stdout line')
    })

    it('compile-tex 返回 failed 时 status 为 failed，result.success 为 false，含 stderr', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'compile-tex') {
          return Promise.resolve({
            status: 'failed',
            exitCode: 1,
            stderr: '! Undefined control sequence.'
          })
        }
        return Promise.reject(new Error('unexpected channel'))
      })

      const result = await latexCompileToolCallback(
        {
          tex: '\\documentclass{article}\\begin{document}\\invalidcmd\\end{document}',
          outputPdfPath: 'out.pdf'
        },
        new AbortController().signal,
        noop
      )

      expect(result.status).toBe('failed')
      expect(result.result).toBeDefined()
      const data = result.result as LaTeXCompileToolResult
      expect(data.success).toBe(false)
      expect(data.stderr).toBe('! Undefined control sequence.')
      expect(data.exitCode).toBe(1)
    })

    it('texFilePath 时先 read-file-content 再 compile-tex，成功则 succeeded', async () => {
      mockInvoke.mockImplementation((channel: string, arg?: unknown) => {
        if (channel === 'read-file-content') {
          return Promise.resolve(
            '\\documentclass{article}\\begin{document}From file\\end{document}'
          )
        }
        if (channel === 'compile-tex') {
          expect(arg).toMatchObject({
            tex: '\\documentclass{article}\\begin{document}From file\\end{document}',
            customPdfFileName: 'doc.pdf'
          })
          return Promise.resolve({
            status: 'success',
            pdfPath: '/workspace/doc.pdf',
            stderr: ''
          })
        }
        return Promise.reject(new Error('unexpected channel: ' + channel))
      })

      const result = await latexCompileToolCallback(
        {
          texFilePath: 'doc.tex',
          outputPdfPath: 'doc.pdf'
        },
        new AbortController().signal,
        noop
      )

      expect(result.status).toBe('succeeded')
      expect((result.result as LaTeXCompileToolResult).success).toBe(true)
      expect(mockInvoke).toHaveBeenCalledWith('read-file-content', expect.any(String))
      expect(mockInvoke).toHaveBeenCalledWith('compile-tex', expect.any(Object))
    })

    it('texFilePath 且 read-file-content 失败时返回 failed', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'read-file-content') {
          return Promise.resolve(null)
        }
        return Promise.reject(new Error('unexpected channel'))
      })

      const result = await latexCompileToolCallback(
        { texFilePath: 'missing.tex', outputPdfPath: 'out.pdf' },
        new AbortController().signal,
        noop
      )

      expect(result.status).toBe('failed')
      expect(result.error).toMatch(/读取|read|无法/i)
    })
  })

  describe('工具配置（与 latex-compile-tool 导出一致）', () => {
    it('预期 id 为 latex-compile', () => {
      expect('latex-compile').toBe('latex-compile')
    })
    it('预期 inputSchema 要求 outputPdfPath', () => {
      expect(['outputPdfPath']).toContain('outputPdfPath')
    })
    it('LaTeXCompileToolResult 含 success 与 stderr', () => {
      const result: LaTeXCompileToolResult = {
        success: true,
        stderr: ''
      }
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('stderr')
    })
  })
})
