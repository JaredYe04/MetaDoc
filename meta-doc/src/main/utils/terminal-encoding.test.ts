/**
 * 终端编码工具单元测试（主进程）
 * 验证 UTF-8/GBK 解码及 Windows chcp 命令拼接，保证中文等字符正确显示。
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { decodeTerminalBuffer, buildRunCommandForAgent } from './terminal-encoding'

describe('terminal-encoding', () => {
  describe('decodeTerminalBuffer', () => {
    it('decodes UTF-8 buffer when encoding is utf-8', () => {
      const buf = Buffer.from('你好世界', 'utf8')
      const out = decodeTerminalBuffer(buf, { encoding: 'utf-8' })
      expect(out).toBe('你好世界')
    })

    it('decodes UTF-8 buffer when encoding is utf8 (no hyphen)', () => {
      const buf = Buffer.from('Hello 中文', 'utf8')
      const out = decodeTerminalBuffer(buf, { encoding: 'utf8' })
      expect(out).toBe('Hello 中文')
    })

    it('on Windows with utf-8 and replacement chars falls back to GBK', () => {
      // 模拟 chcp 未生效时控制台输出 GBK 字节，却被当成 UTF-8 读会出
      const gbkBytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]) // "你好" in GBK
      const decoded = decodeTerminalBuffer(gbkBytes, {
        encoding: 'utf-8',
        platform: 'win32'
      })
      expect(decoded).toBe('你好')
    })

    it('on non-Windows uses UTF-8 when encoding is utf-8', () => {
      const buf = Buffer.from('日本語', 'utf8')
      const out = decodeTerminalBuffer(buf, {
        encoding: 'utf-8',
        platform: 'darwin'
      })
      expect(out).toBe('日本語')
    })

    it('with no encoding on win32 decodes as GBK', () => {
      const gbkBytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
      const out = decodeTerminalBuffer(gbkBytes, { platform: 'win32' })
      expect(out).toBe('你好')
    })

    it('with no encoding on darwin decodes as utf8', () => {
      const buf = Buffer.from('中文', 'utf8')
      const out = decodeTerminalBuffer(buf, { platform: 'darwin' })
      expect(out).toBe('中文')
    })
  })

  describe('buildRunCommandForAgent', () => {
    it('on Windows with useUtf8 prepends chcp 65001', () => {
      const cmd = buildRunCommandForAgent('echo 你好', true, 'win32')
      expect(cmd).toBe('chcp 65001 >nul && echo 你好')
    })

    it('on Windows without useUtf8 leaves command unchanged', () => {
      const cmd = buildRunCommandForAgent('echo 你好', false, 'win32')
      expect(cmd).toBe('echo 你好')
    })

    it('on darwin with useUtf8 leaves command unchanged', () => {
      const cmd = buildRunCommandForAgent('echo 你好', true, 'darwin')
      expect(cmd).toBe('echo 你好')
    })

    it('on linux with useUtf8 leaves command unchanged', () => {
      const cmd = buildRunCommandForAgent('ls -la', true, 'linux')
      expect(cmd).toBe('ls -la')
    })
  })
})
