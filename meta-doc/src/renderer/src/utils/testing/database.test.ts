/**
 * 数据库相关单元测试（Vitest）
 * 数据库测试依赖 Electron IPC (messageBridge.invoke)，在 Node 环境下不可用。
 * 完整测试请在应用内「设置 → 调试 → 单元测试」中运行批量测试。
 */
import { describe, it } from 'vitest'

describe('数据库 (需在应用内运行)', () => {
  it.skip('测试数据库连接', () => {
    // 需 messageBridge.invoke('test-database-connection')
  })

  it.skip('测试创建表结构', () => {
    // 需 messageBridge.invoke('test-database-create-tables')
  })

  it.skip('测试知识库文件 CRUD', () => {
    // 需 IPC 调用 test-database-create-file, read-file, update-file, delete-file
  })

  it.skip('测试数据块与向量', () => {
    // 需 IPC
  })

  it.skip('测试向量搜索', () => {
    // 需 IPC
  })

  it.skip('测试批量操作', () => {
    // 需 IPC
  })
})
