/**
 * 文档信息广播辅助函数
 * 用于在设置窗口中通过广播获取主窗口的文档信息
 */

import eventBus from '../event-bus'
import { sendBroadcast, getWindowType } from '../event-bus'

/**
 * 获取活动文档信息（通过广播）
 * 仅在设置窗口中使用
 */
export async function getActiveDocumentInfoViaBroadcast(): Promise<{
  id: string
  tabId: string
  path: string
  format: 'md' | 'tex'
  meta: any
  outline: any
  markdown: string
  tex: string
  hasContent: boolean
} | null> {
  const windowType = getWindowType()
  
  // 如果不在设置窗口，直接返回null（应该使用workspace直接获取）
  if (windowType !== 'setting') {
    console.warn('getActiveDocumentInfoViaBroadcast 只能在设置窗口中使用')
    return null
  }

  return new Promise((resolve) => {
    const requestId = `doc-info-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let resolved = false

    // 设置超时
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        eventBus.off('response-active-document-info', handler)
        resolve(null)
      }
    }, 5000)

    const handler = (data: any) => {
      if (data.requestId === requestId && !resolved) {
        resolved = true
        clearTimeout(timeout)
        eventBus.off('response-active-document-info', handler)
        if (data.error) {
          console.warn('获取文档信息失败:', data.error)
          resolve(null)
        } else {
          resolve(data.document)
        }
      }
    }

    eventBus.on('response-active-document-info', handler)
    
    // 发送请求到主窗口
    sendBroadcast('home', 'request-active-document-info', requestId)
  })
}

/**
 * 获取文档内容（通过广播）
 * 仅在设置窗口中使用
 */
export async function getDocumentContentViaBroadcast(): Promise<{
  markdown: string
  tex: string
  format: 'md' | 'tex'
} | null> {
  const windowType = getWindowType()
  
  if (windowType !== 'setting') {
    console.warn('getDocumentContentViaBroadcast 只能在设置窗口中使用')
    return null
  }

  return new Promise((resolve) => {
    const requestId = `doc-content-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        eventBus.off('response-document-content', handler)
        resolve(null)
      }
    }, 5000)

    const handler = (data: any) => {
      if (data.requestId === requestId && !resolved) {
        resolved = true
        clearTimeout(timeout)
        eventBus.off('response-document-content', handler)
        if (data.error) {
          console.warn('获取文档内容失败:', data.error)
          resolve(null)
        } else {
          resolve(data.content)
        }
      }
    }

    eventBus.on('response-document-content', handler)
    
    sendBroadcast('home', 'request-document-content', requestId)
  })
}

