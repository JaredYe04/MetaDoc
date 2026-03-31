/**
 * Workspace Tool 单元测试（createDirectory 逻辑）
 * 验证 create-directory 以 { parentPath, folderName } 形式逐层调用，支持中文路径。
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureDirectoryRecursive, normalizePath } from './workspace-directory-helper'

describe('workspace-directory-helper', () => {
  describe('normalizePath', () => {
    it('统一为 / 并去重', () => {
      expect(normalizePath('a\\\\b/c')).toBe('a/b/c')
      expect(normalizePath('C:\\Users\\tange\\doc')).toBe('C:/Users/tange/doc')
    })
  })

  describe('ensureDirectoryRecursive', () => {
    let mockInvoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockInvoke = vi.fn()
    })

    it('逐层调用 create-directory，参数为 { parentPath, folderName }，支持中文目录名', async () => {
      mockInvoke.mockImplementation((channel: string, arg: unknown) => {
        if (channel === 'file-exists') {
          const path = arg as string
          if (path === 'C:/Users/tange/Documents/metadoc-agent-test/图表测试')
            return Promise.resolve(false)
          if (path === 'C:/Users/tange/Documents/metadoc-agent-test/图表测试/images')
            return Promise.resolve(false)
          return Promise.resolve(true)
        }
        if (channel === 'create-directory') {
          const payload = arg as { parentPath: string; folderName: string }
          if (typeof payload !== 'object' || !payload.parentPath || !payload.folderName) {
            return Promise.reject(new Error('create-directory 必须传入 { parentPath, folderName }'))
          }
          return Promise.resolve(`${payload.parentPath}/${payload.folderName}`)
        }
        return Promise.reject(new Error(`unknown: ${channel}`))
      })

      const ipc = { invoke: mockInvoke }
      const r = await ensureDirectoryRecursive(
        'C:/Users/tange/Documents/metadoc-agent-test/图表测试',
        ipc
      )

      expect(r.created).toBe(true)
      expect(r.message).toContain('目录已创建')
      expect(r.pathsCreated.length).toBeGreaterThanOrEqual(1)
      expect(r.pathsCreated).toContain('C:/Users/tange/Documents/metadoc-agent-test/图表测试')
      const createCalls = mockInvoke.mock.calls.filter(
        (c: unknown[]) => c[0] === 'create-directory'
      )
      expect(createCalls.length).toBeGreaterThanOrEqual(1)
      expect(
        createCalls.some(
          (c: unknown[]) => (c[1] as { folderName: string }).folderName === '图表测试'
        )
      ).toBe(true)
      expect(createCalls[0][1]).toEqual({
        parentPath: 'C:/Users/tange/Documents/metadoc-agent-test',
        folderName: '图表测试'
      })
    })

    it('多级路径时先创建父级再创建子级', async () => {
      mockInvoke.mockImplementation((channel: string, arg: unknown) => {
        if (channel === 'file-exists') return Promise.resolve(false)
        if (channel === 'create-directory') {
          const p = arg as { parentPath: string; folderName: string }
          return Promise.resolve(`${p.parentPath}/${p.folderName}`)
        }
        return Promise.reject(new Error(`unknown: ${channel}`))
      })

      const ipc = { invoke: mockInvoke }
      const r = await ensureDirectoryRecursive('C:/base/中文测试文件夹/images', ipc)
      expect(r.pathsCreated).toEqual([
        'C:/base',
        'C:/base/中文测试文件夹',
        'C:/base/中文测试文件夹/images'
      ])

      const createCalls = mockInvoke.mock.calls.filter(
        (c: unknown[]) => c[0] === 'create-directory'
      )
      expect(createCalls).toHaveLength(3)
      expect(createCalls[0][1]).toEqual({ parentPath: 'C:', folderName: 'base' })
      expect(createCalls[1][1]).toEqual({ parentPath: 'C:/base', folderName: '中文测试文件夹' })
      expect(createCalls[2][1]).toEqual({
        parentPath: 'C:/base/中文测试文件夹',
        folderName: 'images'
      })
    })

    it('从未传入单个字符串给 create-directory', async () => {
      mockInvoke.mockImplementation((channel: string, arg: unknown) => {
        if (channel === 'file-exists') return Promise.resolve(false)
        if (channel === 'create-directory') {
          if (typeof arg === 'string') {
            return Promise.reject(new Error('必须传 { parentPath, folderName }'))
          }
          return Promise.resolve('ok')
        }
        return Promise.reject(new Error(`unknown: ${channel}`))
      })

      const ipc = { invoke: mockInvoke }
      await ensureDirectoryRecursive('C:/test/图表测试', ipc)

      expect(mockInvoke).toHaveBeenCalledWith(
        'create-directory',
        expect.objectContaining({
          parentPath: 'C:/test',
          folderName: '图表测试'
        })
      )
      const badCalls = mockInvoke.mock.calls.filter(
        (c: unknown[]) => c[0] === 'create-directory' && typeof c[1] === 'string'
      )
      expect(badCalls).toHaveLength(0)
    })

    it('create-directory 失败时抛出包含完整路径的错误', async () => {
      mockInvoke.mockImplementation((channel: string, arg: unknown) => {
        if (channel === 'file-exists') return Promise.resolve(false)
        if (channel === 'create-directory') {
          return Promise.reject(new Error('父目录不存在'))
        }
        return Promise.reject(new Error(`unknown: ${channel}`))
      })

      const ipc = { invoke: mockInvoke }
      const fullPath = 'C:/test/图表测试'
      await expect(ensureDirectoryRecursive(fullPath, ipc)).rejects.toThrow(/创建目录失败/)
      await expect(ensureDirectoryRecursive(fullPath, ipc)).rejects.toThrow(fullPath)
      await expect(ensureDirectoryRecursive(fullPath, ipc)).rejects.toThrow(/父目录不存在/)
    })
  })
})
