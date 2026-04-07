/**
 * DragManager — 主进程拖拽会话管理（阶段2架构改进版）
 *
 * 改进特性：
 * 1. 两阶段提交的标签页转移（预检 → 添加 → 确认移除）
 * 2. 多会话管理（支持并发拖拽）
 * 3. 会话超时和自动清理机制
 * 4. 请求-响应模式的安全 IPC 通信
 */

import { BrowserWindow, screen, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { ipcBridge } from './bridge/ipc-bridge'
import { createMainLogger } from './logger'
import { getAllMainWindows, getWindowId, getWindowById } from './index'
import { acquirePoolWindow } from './window-pool'
import { randomUUID } from 'crypto'

const logger = createMainLogger('DragManager')

const SESSION_TIMEOUT = 30000
const REQUEST_TIMEOUT = 5000

export interface DragSession {
  sessionId: string
  tabId: string
  sourceWindowId: number
  tabData: any
  consumed: boolean
  createdAt: number
  timeoutTimer?: NodeJS.Timeout
}

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  timer: NodeJS.Timeout
}

const activeSessions = new Map<string, DragSession>()
const pendingRequests = new Map<string, PendingRequest>()
let sessionCounter = 0

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

async function invokeRenderer(
  window: BrowserWindow,
  channel: string,
  payload: any,
  timeout: number = REQUEST_TIMEOUT
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.isDestroyed() || !window.webContents) {
      reject(new Error('目标窗口已销毁'))
      return
    }

    const requestId = generateRequestId()
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      reject(new Error(`请求超时: ${channel}`))
    }, timeout)

    pendingRequests.set(requestId, { resolve, reject, timer })

    window.webContents.send(channel, {
      ...payload,
      _requestId: requestId
    })
  })
}

function handleRendererResponse(_event: IpcMainEvent, response: any) {
  const requestId = response?._requestId
  if (!requestId) return

  const pending = pendingRequests.get(requestId)
  if (!pending) return

  clearTimeout(pending.timer)
  pendingRequests.delete(requestId)

  if (response._error) {
    pending.reject(new Error(response._error))
  } else {
    pending.resolve(response.result)
  }
}

function broadcastDragState(eventName: string, data: any): void {
  const windows = getAllMainWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(eventName, data)
    }
  }
}

function startSessionTimeout(sessionId: string): void {
  const timer = setTimeout(() => {
    const session = activeSessions.get(sessionId)
    if (session) {
      logger.warn('拖拽会话超时，强制清理:', sessionId)
      cleanupSession(sessionId, 'timeout')
    }
  }, SESSION_TIMEOUT)

  const session = activeSessions.get(sessionId)
  if (session) {
    session.timeoutTimer = timer
  }
}

function cleanupSession(sessionId: string, reason?: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return

  if (session.timeoutTimer) {
    clearTimeout(session.timeoutTimer)
  }

  if (!session.consumed && reason) {
    const sourceWindow = getWindowById(session.sourceWindowId)
    if (sourceWindow && !sourceWindow.isDestroyed()) {
      sourceWindow.webContents.send('drag:session-cancelled', {
        sessionId,
        tabId: session.tabId,
        reason
      })
    }
  }

  activeSessions.delete(sessionId)
  broadcastDragState('drag:session-ended', { sessionId })
  logger.debug('拖拽会话已清理:', sessionId, reason || '')
}

function cleanupAllSessions(): void {
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer)
    }
    if (!session.consumed) {
      const sourceWindow = getWindowById(session.sourceWindowId)
      if (sourceWindow && !sourceWindow.isDestroyed()) {
        sourceWindow.webContents.send('drag:session-cancelled', {
          sessionId,
          tabId: session.tabId,
          reason: 'app-shutdown'
        })
      }
    }
  }
  activeSessions.clear()
  logger.info('所有拖拽会话已清理')
}

function createSession(tabData: any, sourceWindowId: number): string {
  const sessionId = `drag_${Date.now()}_${++sessionCounter}_${randomUUID().substring(0, 8)}`

  const session: DragSession = {
    sessionId,
    tabId: tabData.tab.id,
    sourceWindowId,
    tabData,
    consumed: false,
    createdAt: Date.now()
  }

  activeSessions.set(sessionId, session)
  startSessionTimeout(sessionId)

  logger.debug('拖拽会话创建:', sessionId, 'Tab:', tabData.tab.id)
  return sessionId
}

async function executeTabTransfer(
  session: DragSession,
  targetWindowId: number,
  insertIndex: number = -1
): Promise<{ success: boolean; reason?: string }> {
  const { tabData, sourceWindowId, tabId } = session

  const targetWindow = getWindowById(targetWindowId)
  if (!targetWindow || targetWindow.isDestroyed()) {
    return { success: false, reason: '目标窗口不存在或已销毁' }
  }

  const sourceWindow = getWindowById(sourceWindowId)
  if (!sourceWindow || sourceWindow.isDestroyed()) {
    return { success: false, reason: '源窗口不存在或已销毁' }
  }

  try {
    const canAccept = await invokeRenderer(targetWindow, 'drag:can-accept-tab', {
      sourceWindowId,
      tabData: tabData,
      sessionId: session.sessionId
    })

    if (!canAccept) {
      logger.warn('目标窗口拒绝接收 Tab:', { targetWindowId, reason: canAccept?.reason })
      return {
        success: false,
        reason: canAccept?.reason || '目标窗口无法接收该 Tab'
      }
    }

    const addResult = await invokeRenderer(targetWindow, 'drag:add-tab-to-window', {
      sessionId: session.sessionId,
      tabData,
      insertIndex
    })

    if (!addResult || !addResult.success) {
      logger.error('目标窗口添加 Tab 失败:', { targetWindowId, error: addResult?.error })
      return {
        success: false,
        reason: addResult?.error || '目标窗口添加 Tab 失败'
      }
    }

    session.consumed = true
    sourceWindow.webContents.send('remove-tab-from-drag', tabId)

    logger.info('Tab 跨窗口转移成功:', tabId, sourceWindowId, '->', targetWindowId)
    return { success: true }
  } catch (error) {
    logger.error('Tab 转移执行失败:', error)
    return {
      success: false,
      reason: error instanceof Error ? error.message : '执行转移时发生错误'
    }
  }
}

export function registerDragManagerIPC(): void {
  ipcBridge.registerOn('drag:renderer-response', handleRendererResponse)

  ipcBridge.registerHandle(
    'drag:start',
    (
      event: IpcMainInvokeEvent,
      payload: { tabId: string; tabData: any }
    ): { sessionId: string } => {
      const sourceWindowId = event.sender.id

      for (const [_, session] of activeSessions.entries()) {
        if (session.tabId === payload.tabId && session.sourceWindowId === sourceWindowId) {
          logger.warn('该 Tab 已有活跃拖拽会话，先清理旧会话:', session.sessionId)
          cleanupSession(session.sessionId, 'replaced')
        }
      }

      const sessionId = createSession(payload.tabData, sourceWindowId)

      broadcastDragState('drag:session-started', {
        sessionId,
        tabId: payload.tabId,
        sourceWindowId
      })

      logger.debug('拖拽会话开始:', sessionId, 'Tab:', payload.tabId)
      return { sessionId }
    }
  )

  ipcBridge.registerHandle(
    'drag:drop',
    async (
      _event: IpcMainInvokeEvent,
      payload: { sessionId: string; targetWindowId: number; insertIndex?: number }
    ): Promise<{ success: boolean; reason?: string }> => {
      const session = activeSessions.get(payload.sessionId)

      if (!session) {
        logger.warn('drop 收到无效或已过期会话:', payload.sessionId)
        return { success: false, reason: '会话不存在或已过期' }
      }

      if (session.consumed) {
        logger.warn('拖拽会话已被消费:', payload.sessionId)
        return { success: false, reason: '会话已被消费' }
      }

      if (payload.targetWindowId !== session.sourceWindowId) {
        const result = await executeTabTransfer(
          session,
          payload.targetWindowId,
          payload.insertIndex ?? -1
        )

        if (result.success) {
          cleanupSession(payload.sessionId)
        }

        return result
      }

      session.consumed = true
      cleanupSession(payload.sessionId)

      return { success: true }
    }
  )

  ipcBridge.registerHandle(
    'drag:end',
    async (
      _event: IpcMainInvokeEvent,
      payload: {
        sessionId: string
        tabBarBounds?: { x: number; y: number; width: number; height: number }
      }
    ): Promise<{ action: 'none' | 'detach'; newWindowId?: number; reason?: string }> => {
      const session = activeSessions.get(payload.sessionId)

      if (!session) {
        return { action: 'none', reason: '会话不存在' }
      }

      if (session.consumed) {
        cleanupSession(payload.sessionId)
        return { action: 'none' }
      }

      const cursorPos = screen.getCursorScreenPoint()
      const sourceWindow = getWindowById(session.sourceWindowId)

      if (!sourceWindow || sourceWindow.isDestroyed()) {
        cleanupSession(payload.sessionId, 'source-window-destroyed')
        return { action: 'none', reason: '源窗口已销毁' }
      }

      const bounds = sourceWindow.getBounds()
      const padding = 10
      const isOutside =
        cursorPos.x < bounds.x - padding ||
        cursorPos.x > bounds.x + bounds.width + padding ||
        cursorPos.y < bounds.y - padding ||
        cursorPos.y > bounds.y + bounds.height + padding

      const allWindows = getAllMainWindows()
      let isOverOtherWindow = false
      let targetWindowForMerge: BrowserWindow | null = null

      for (const win of allWindows) {
        if (win === sourceWindow || win.isDestroyed() || !win.isVisible()) continue
        const wb = win.getBounds()
        if (
          cursorPos.x >= wb.x &&
          cursorPos.x <= wb.x + wb.width &&
          cursorPos.y >= wb.y &&
          cursorPos.y <= wb.y + wb.height
        ) {
          isOverOtherWindow = true
          targetWindowForMerge = win
          break
        }
      }

      if (isOverOtherWindow && targetWindowForMerge) {
        const targetWinId = getWindowId(targetWindowForMerge)

        const result = await executeTabTransfer(session, targetWinId, -1)

        if (result.success) {
          cleanupSession(payload.sessionId)
          logger.info('Tab 跨窗口合并 (fallback) 成功:', session.tabId, '->', targetWinId)
          return { action: 'none' }
        } else {
          logger.warn('跨窗口合并失败，回退到分离:', result.reason)
        }
      }

      if (isOutside) {
        const sourceTabCount = session.tabData?.sourceTabCount ?? 1
        if (sourceTabCount <= 1) {
          cleanupSession(payload.sessionId, 'single-tab-restriction')
          logger.debug('单Tab窗口不允许分离')
          return { action: 'none', reason: '单Tab窗口不允许分离' }
        }

        try {
          const sourceBounds = sourceWindow.getBounds()
          const isMaximized = sourceWindow.isMaximized()
          const width = isMaximized ? 1366 : sourceBounds.width
          const height = isMaximized ? 768 : sourceBounds.height

          const poolWindow = acquirePoolWindow({
            tabData: session.tabData,
            position: cursorPos,
            width,
            height,
            focusMode: !!session.tabData?.sourceFocusMode
          })

          if (poolWindow) {
            const newWindowId = getWindowId(poolWindow)
            session.consumed = true
            sourceWindow.webContents.send('remove-tab-from-drag', session.tabId)
            cleanupSession(payload.sessionId)
            logger.info('Tab 分离到新窗口(池):', session.tabId, '->', newWindowId)
            return { action: 'detach', newWindowId }
          }

          cleanupSession(payload.sessionId)
          sourceWindow.webContents.send('drag:create-detached-window', {
            tabData: session.tabData,
            position: cursorPos,
            width,
            height,
            focusMode: !!session.tabData?.sourceFocusMode
          })

          return { action: 'detach' }
        } catch (error) {
          logger.error('创建分离窗口失败:', error)
          cleanupSession(payload.sessionId, 'detach-error')
          return { action: 'none', reason: '创建分离窗口失败' }
        }
      }

      const tabBarBounds = payload.tabBarBounds
      if (tabBarBounds) {
        const isOverTabBar =
          cursorPos.x >= tabBarBounds.x &&
          cursorPos.x <= tabBarBounds.x + tabBarBounds.width &&
          cursorPos.y >= tabBarBounds.y &&
          cursorPos.y <= tabBarBounds.y + tabBarBounds.height

        if (!isOverTabBar) {
          const sourceTabCount = session.tabData?.sourceTabCount ?? 1
          if (sourceTabCount > 1) {
            try {
              const sourceBounds = sourceWindow.getBounds()
              const isMaximized = sourceWindow.isMaximized()
              const width = isMaximized ? 1366 : sourceBounds.width
              const height = isMaximized ? 768 : sourceBounds.height

              const poolWindow = acquirePoolWindow({
                tabData: session.tabData,
                position: cursorPos,
                width,
                height,
                focusMode: !!session.tabData?.sourceFocusMode
              })

              if (poolWindow) {
                const newWindowId = getWindowId(poolWindow)
                session.consumed = true
                sourceWindow.webContents.send('remove-tab-from-drag', session.tabId)
                cleanupSession(payload.sessionId)
                logger.info('Tab 分离到新窗口(窗口内,池):', session.tabId, '->', newWindowId)
                return { action: 'detach', newWindowId }
              }

              cleanupSession(payload.sessionId)
              sourceWindow.webContents.send('drag:create-detached-window', {
                tabData: session.tabData,
                position: cursorPos,
                width,
                height,
                focusMode: !!session.tabData?.sourceFocusMode
              })

              return { action: 'detach' }
            } catch (error) {
              logger.error('创建分离窗口失败:', error)
              cleanupSession(payload.sessionId, 'detach-error')
              return { action: 'none', reason: '创建分离窗口失败' }
            }
          }
        }
      }

      cleanupSession(payload.sessionId, 'cancelled-in-tabbar')
      return { action: 'none' }
    }
  )

  ipcBridge.registerOn('drag:cancel', (_event: IpcMainEvent, payload: { sessionId: string }) => {
    const session = activeSessions.get(payload.sessionId)
    if (session) {
      cleanupSession(payload.sessionId, 'user-cancelled')
      logger.debug('拖拽会话取消:', payload.sessionId)
    }
  })

  ipcBridge.registerHandle(
    'drag:get-active-session',
    (): { sessionId: string; tabId: string; sourceWindowId: number } | null => {
      const sessions = Array.from(activeSessions.values())
      if (sessions.length === 0) return null

      const latest = sessions.sort((a, b) => b.createdAt - a.createdAt)[0]
      return {
        sessionId: latest.sessionId,
        tabId: latest.tabId,
        sourceWindowId: latest.sourceWindowId
      }
    }
  )

  ipcBridge.registerHandle(
    'drag:get-all-sessions',
    (): Array<{
      sessionId: string
      tabId: string
      sourceWindowId: number
      consumed: boolean
      createdAt: number
    }> => {
      return Array.from(activeSessions.values()).map((s) => ({
        sessionId: s.sessionId,
        tabId: s.tabId,
        sourceWindowId: s.sourceWindowId,
        consumed: s.consumed,
        createdAt: s.createdAt
      }))
    }
  )

  logger.info('拖拽管理器 IPC 已注册')
}

export function cleanupDragManager(): void {
  cleanupAllSessions()

  for (const [, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timer)
    pending.reject(new Error('应用退出，请求被取消'))
  }
  pendingRequests.clear()

  logger.info('拖拽管理器已清理')
}

export const __testing__ = {
  getActiveSessions: () => activeSessions,
  getPendingRequests: () => pendingRequests,
  cleanupSession,
  cleanupAllSessions
}
