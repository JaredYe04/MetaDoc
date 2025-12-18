/**
 * AIChat历史会话迁移工具
 * 从localStorage迁移到SQLite
 */

import { readAiChatDialogs } from '../ai-chat-storage'
import { aiChatSessionsDb } from './tool-sessions-db'
import { createRendererLogger } from '../logger'
import { getAppVersion } from '../version'

const logger = createRendererLogger('AIChatMigration')

/**
 * 比较版本号
 * @param version1 版本号1，如 "1.0.0" 或 "Beta0.0.1"
 * @param version2 版本号2，如 "1.0.0"
 * @returns 如果 version1 >= version2 返回 true，否则返回 false
 */
function compareVersion(version1: string, version2: string): boolean {
  // 提取数字版本号部分（移除 "Beta"、"dev" 等前缀和后缀）
  const extractVersionNumbers = (version: string): number[] => {
    // 移除 "Beta" 前缀
    let cleanVersion = version.replace(/^Beta/i, '')
    // 移除 "-dev" 等后缀
    cleanVersion = cleanVersion.split('-')[0]
    // 移除所有非数字和点的字符
    cleanVersion = cleanVersion.replace(/[^\d.]/g, '')
    // 分割为数字数组
    const parts = cleanVersion.split('.').map(Number)
    // 确保至少有3个部分（主版本号.次版本号.修订号）
    while (parts.length < 3) {
      parts.push(0)
    }
    return parts.slice(0, 3)
  }
  
  const v1Parts = extractVersionNumbers(version1)
  const v2Parts = extractVersionNumbers(version2)
  
  // 逐级比较版本号
  for (let i = 0; i < 3; i++) {
    if (v1Parts[i] > v2Parts[i]) {
      return true
    } else if (v1Parts[i] < v2Parts[i]) {
      return false
    }
  }
  
  // 版本号完全相同
  return true
}

/**
 * 等待表创建（最多等待5秒）
 */
async function waitForTable(tableName: string, maxWaitMs: number = 5000): Promise<boolean> {
  let ipcRenderer: any = null
  if (typeof window !== 'undefined') {
    if ((window as any).electron?.ipcRenderer) {
      ipcRenderer = (window as any).electron.ipcRenderer
    } else {
      const { localIpcRenderer } = await import('../web-adapter/local-ipc-renderer')
      ipcRenderer = localIpcRenderer
    }
  }
  
  if (!ipcRenderer) {
    return false
  }
  
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const result = await ipcRenderer.invoke('db-table-exists', tableName) as { success: boolean; exists?: boolean }
      if (result.success && result.exists) {
        return true
      }
    } catch (error) {
      // 忽略错误，继续重试
    }
    // 等待100ms后重试
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}

/**
 * 检查是否已迁移
 */
export async function isAIChatMigrated(): Promise<boolean> {
  try {
    // 先等待表创建（如果表不存在，等待迁移完成）
    const tableExists = await waitForTable('ai_chat_sessions', 5000)
    if (!tableExists) {
      logger.warn('ai_chat_sessions 表不存在，可能迁移尚未执行')
      return false
    }
    
    // 检查表中是否有数据（如果有数据，说明可能已经迁移过）
    let ipcRenderer: any = null
    if (typeof window !== 'undefined') {
      if ((window as any).electron?.ipcRenderer) {
        ipcRenderer = (window as any).electron.ipcRenderer
      } else {
        const { localIpcRenderer } = await import('../web-adapter/local-ipc-renderer')
        ipcRenderer = localIpcRenderer
      }
    }
    
    if (!ipcRenderer) {
      return false
    }
    
    const countResult = await ipcRenderer.invoke('db-query',
      'SELECT COUNT(*) as count FROM ai_chat_sessions',
      []
    ) as { success: boolean; data?: any[] }
    
    // 如果表存在且有数据，认为已迁移
    return !!(countResult.success && countResult.data && countResult.data[0]?.count > 0)
  } catch (error) {
    logger.error('检查迁移状态失败:', error)
    return false
  }
}

/**
 * 执行迁移
 */
export async function migrateAIChatSessions(): Promise<{ success: boolean; migrated: number; error?: string }> {
  try {
    // 先等待表创建（如果表不存在，等待迁移完成）
    const tableExists = await waitForTable('ai_chat_sessions', 5000)
    if (!tableExists) {
      const errorMsg = 'ai_chat_sessions 表不存在，请确保数据库迁移已执行'
      logger.error(errorMsg)
      return { success: false, migrated: 0, error: errorMsg }
    }
    
    // 检查是否已迁移
    const alreadyMigrated = await isAIChatMigrated()
    if (alreadyMigrated) {
      logger.info('AIChat会话已迁移，跳过')
      return { success: true, migrated: 0 }
    }
    
    // 从localStorage读取数据
    const dialogs = readAiChatDialogs()
    if (dialogs.length === 0) {
      logger.info('没有需要迁移的AIChat会话')
      return { success: true, migrated: 0 }
    }
    
    logger.info(`开始迁移 ${dialogs.length} 个AIChat会话`)
    
    // 迁移每个会话
    let migrated = 0
    for (const dialog of dialogs) {
      try {
        // 转换数据格式
        const sessionId = (dialog as any).id || `ai-chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const createdAt = (dialog as any).createdAt || Date.now()
        const updatedAt = (dialog as any).updatedAt || Date.now()
        const messages = JSON.stringify(dialog.messages || [])
        const referenceStore = JSON.stringify((dialog as any).referenceStore || [])
        
        // 插入到SQLite
        await aiChatSessionsDb.create({
          id: sessionId,
          title: dialog.title || '未命名对话',
          created_at: createdAt,
          updated_at: updatedAt,
          messages: messages,
          reference_store: referenceStore
        })
        migrated++
      } catch (error) {
        const dialogId = (dialog as any).id || 'unknown'
        logger.error(`迁移会话失败 (ID: ${dialogId}):`, error)
        // 继续迁移其他会话
      }
    }
    
    logger.info(`迁移完成，成功迁移 ${migrated}/${dialogs.length} 个会话`)
    return { success: true, migrated }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('迁移AIChat会话失败:', error)
    return { success: false, migrated: 0, error: errorMessage }
  }
}

/**
 * 在应用启动时自动执行迁移
 */
export async function autoMigrateAIChatSessions(): Promise<void> {
  return;//decrypt by 2025-12-18
  try {
    // 检查应用版本，如果版本 >= 1.0.0，则不需要执行迁移
    const appVersion = await getAppVersion()
    if (compareVersion(appVersion, '1.0.0')) {
      logger.debug(`应用版本 ${appVersion} >= 1.0.0，跳过AIChat会话迁移`)
      return
    }
    
    logger.debug(`应用版本 ${appVersion} < 1.0.0，执行AIChat会话迁移`)
    const result = await migrateAIChatSessions()
    if (result.success) {
      if (result.migrated > 0) {
        logger.info(`AIChat会话迁移完成，迁移了 ${result.migrated} 个会话`)
      }
    } else {
      logger.error('AIChat会话迁移失败:', result.error)
    }
  } catch (error) {
    logger.error('自动迁移AIChat会话失败:', error)
  }
}

