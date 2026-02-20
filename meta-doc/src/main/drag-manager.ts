/**
 * DragManager — 主进程拖拽会话管理
 *
 * 单一拖拽会话由主进程持有，解决渲染进程间状态不一致的问题。
 * 渲染进程只通过 sessionId 引用会话，不在 DataTransfer 中传递完整 payload。
 */

import { BrowserWindow, screen, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { ipcBridge } from './bridge/ipc-bridge'
import { createMainLogger } from './logger'
import { getAllMainWindows, getWindowId, getWindowById } from './index'
import { acquirePoolWindow } from './window-pool'

const logger = createMainLogger('DragManager')

export interface DragSession {
  sessionId: string
  tabId: string
  sourceWindowId: number
  tabData: any // 完整 Tab + 文档序列化数据
  consumed: boolean // 是否已被 drop 消费
  createdAt: number
}

let activeSession: DragSession | null = null
let sessionCounter = 0

function generateSessionId(): string {
  return `drag_${Date.now()}_${++sessionCounter}`
}

/**
 * 广播拖拽状态变化到所有窗口
 */
function broadcastDragState(eventName: string, data: any): void {
  const windows = getAllMainWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(eventName, data)
    }
  }
}

/**
 * 注册拖拽管理器的 IPC 处理器
 */
export function registerDragManagerIPC(): void {
  // 渲染进程通知：拖拽开始
  ipcBridge.registerHandle(
    'drag:start',
    (
      event: IpcMainInvokeEvent,
      payload: { tabId: string; tabData: any }
    ): { sessionId: string } => {
      const sourceWindowId = event.sender.id

      // 清除可能的残留会话
      if (activeSession) {
        logger.warn('拖拽会话未正常结束，强制清理:', activeSession.sessionId)
        activeSession = null
      }

      const sessionId = generateSessionId()
      activeSession = {
        sessionId,
        tabId: payload.tabId,
        sourceWindowId,
        tabData: payload.tabData,
        consumed: false,
        createdAt: Date.now()
      }

      // 广播给所有窗口：有拖拽进行中
      broadcastDragState('drag:session-started', {
        sessionId,
        tabId: payload.tabId,
        sourceWindowId
      })

      logger.debug('拖拽会话开始:', sessionId, 'Tab:', payload.tabId)
      return { sessionId }
    }
  )

  // 渲染进程通知：Tab 被 drop 到目标窗口（同窗口排序或跨窗口合并）
  ipcBridge.registerHandle(
    'drag:drop',
    async (
      _event: IpcMainInvokeEvent,
      payload: { sessionId: string; targetWindowId: number; insertIndex?: number }
    ): Promise<{ success: boolean }> => {
      if (!activeSession || activeSession.sessionId !== payload.sessionId) {
        logger.warn('drop 收到无效会话:', payload.sessionId)
        return { success: false }
      }

      if (activeSession.consumed) {
        logger.warn('拖拽会话已被消费:', payload.sessionId)
        return { success: false }
      }

      activeSession.consumed = true
      const { tabData, sourceWindowId } = activeSession

      // 跨窗口转移：将 Tab 发送到目标窗口
      if (payload.targetWindowId !== sourceWindowId) {
        const targetWindow = getWindowById(payload.targetWindowId)
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('add-tab-from-drag', {
            tabData,
            insertIndex: payload.insertIndex ?? -1
          })

          // 通知源窗口移除 Tab
          const sourceWindow = getWindowById(sourceWindowId)
          if (sourceWindow && !sourceWindow.isDestroyed()) {
            sourceWindow.webContents.send('remove-tab-from-drag', activeSession.tabId)
          }

          logger.info(
            'Tab 跨窗口转移:',
            activeSession.tabId,
            sourceWindowId,
            '->',
            payload.targetWindowId
          )
        }
      }

      return { success: true }
    }
  )

  // 渲染进程通知：拖拽结束（用户松开鼠标）
  ipcBridge.registerHandle(
    'drag:end',
    async (
      _event: IpcMainInvokeEvent,
      payload: {
        sessionId: string
        tabBarBounds?: { x: number; y: number; width: number; height: number }
      }
    ): Promise<{ action: 'none' | 'detach'; newWindowId?: number }> => {
      if (!activeSession || activeSession.sessionId !== payload.sessionId) {
        return { action: 'none' }
      }

      // 如果已被 drop 消费，不需要做任何事
      if (activeSession.consumed) {
        const session = activeSession
        activeSession = null
        broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
        return { action: 'none' }
      }

      // 检查鼠标是否在源窗口外（意味着要分离到新窗口）
      const cursorPos = screen.getCursorScreenPoint()
      const sourceWindow = getWindowById(activeSession.sourceWindowId)

      if (!sourceWindow || sourceWindow.isDestroyed()) {
        activeSession = null
        return { action: 'none' }
      }

      const bounds = sourceWindow.getBounds()
      const padding = 10 // 容差区域
      const isOutside =
        cursorPos.x < bounds.x - padding ||
        cursorPos.x > bounds.x + bounds.width + padding ||
        cursorPos.y < bounds.y - padding ||
        cursorPos.y > bounds.y + bounds.height + padding

      // 检查是否在其他窗口上（如果是，说明浏览器 drop 未触发，这是跨窗口 fallback）
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

      const session = activeSession
      activeSession = null

      // 场景1：鼠标在另一个窗口上（跨窗口合并 fallback）
      if (isOverOtherWindow && targetWindowForMerge) {
        session.consumed = true
        const targetWinId = getWindowId(targetWindowForMerge)

        targetWindowForMerge.webContents.send('add-tab-from-drag', {
          tabData: session.tabData,
          insertIndex: -1
        })

        sourceWindow.webContents.send('remove-tab-from-drag', session.tabId)

        broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
        logger.info('Tab 跨窗口合并 (fallback):', session.tabId, '->', targetWinId)
        return { action: 'none' }
      }

      // 场景2：鼠标在源窗口外且不在任何窗口上 → 分离到新窗口
      if (isOutside) {
        // 源窗口只有1个Tab时不允许分离
        // 通过 tabData.sourceTabCount 检查
        const sourceTabCount = session.tabData?.sourceTabCount ?? 1
        if (sourceTabCount <= 1) {
          broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
          logger.debug('单Tab窗口不允许分离')
          return { action: 'none' }
        }

        session.consumed = true

        try {
          // 获取源窗口尺寸
          const sourceBounds = sourceWindow.getBounds()
          const isMaximized = sourceWindow.isMaximized()
          const width = isMaximized ? 1366 : sourceBounds.width
          const height = isMaximized ? 768 : sourceBounds.height

          // 传递原始鼠标屏幕坐标，由 acquirePoolWindow 统一计算偏移
          const poolWindow = acquirePoolWindow({
            tabData: session.tabData,
            position: cursorPos,
            width,
            height
          })

          if (poolWindow) {
            const newWindowId = getWindowId(poolWindow)
            // 通知源窗口移除 Tab
            sourceWindow.webContents.send('remove-tab-from-drag', session.tabId)
            broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
            logger.info('Tab 分离到新窗口(池):', session.tabId, '->', newWindowId)
            return { action: 'detach', newWindowId }
          }

          // 池为空时 fallback：通过 create-window-with-tab 创建
          // 这里直接调用现有的窗口创建逻辑（由 MainTabs.vue 端已有的 IPC 处理）
          broadcastDragState('drag:session-ended', { sessionId: session.sessionId })

          // 通知源窗口执行创建窗口
          sourceWindow.webContents.send('drag:create-detached-window', {
            tabData: session.tabData,
            position: cursorPos,
            width,
            height
          })

          return { action: 'detach' }
        } catch (error) {
          logger.error('创建分离窗口失败:', error)
          broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
          return { action: 'none' }
        }
      }

      // 场景2.5：鼠标在源窗口内但不在 Tab 栏上 → 分离到新窗口
      // 允许用户通过向下拖动来在窗口内分离 Tab
      const tabBarBounds = payload.tabBarBounds
      if (tabBarBounds) {
        const isOverTabBar =
          cursorPos.x >= tabBarBounds.x &&
          cursorPos.x <= tabBarBounds.x + tabBarBounds.width &&
          cursorPos.y >= tabBarBounds.y &&
          cursorPos.y <= tabBarBounds.y + tabBarBounds.height

        if (!isOverTabBar) {
          // 鼠标在窗口内但不在 Tab 栏上，执行分离
          const sourceTabCount = session.tabData?.sourceTabCount ?? 1
          if (sourceTabCount > 1) {
            session.consumed = true

            try {
              const sourceBounds = sourceWindow.getBounds()
              const isMaximized = sourceWindow.isMaximized()
              const width = isMaximized ? 1366 : sourceBounds.width
              const height = isMaximized ? 768 : sourceBounds.height

              const poolWindow = acquirePoolWindow({
                tabData: session.tabData,
                position: cursorPos,
                width,
                height
              })

              if (poolWindow) {
                const newWindowId = getWindowId(poolWindow)
                sourceWindow.webContents.send('remove-tab-from-drag', session.tabId)
                broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
                logger.info('Tab 分离到新窗口(窗口内,池):', session.tabId, '->', newWindowId)
                return { action: 'detach', newWindowId }
              }

              broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
              sourceWindow.webContents.send('drag:create-detached-window', {
                tabData: session.tabData,
                position: cursorPos,
                width,
                height
              })

              return { action: 'detach' }
            } catch (error) {
              logger.error('创建分离窗口失败:', error)
              broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
              return { action: 'none' }
            }
          }
        }
      }

      // 场景3：鼠标在源窗口内且在 Tab 栏上（回到原位，无需操作）
      broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
      return { action: 'none' }
    }
  )

  // 渲染进程通知：拖拽取消（ESC、窗口失焦等）
  ipcBridge.registerOn('drag:cancel', (_event: IpcMainEvent, payload: { sessionId: string }) => {
    if (activeSession && activeSession.sessionId === payload.sessionId) {
      const session = activeSession
      activeSession = null
      broadcastDragState('drag:session-ended', { sessionId: session.sessionId })
      logger.debug('拖拽会话取消:', session.sessionId)
    }
  })

  // 查询当前活跃会话（用于目标窗口在 dragover 时判断）
  ipcBridge.registerHandle(
    'drag:get-active-session',
    (): { sessionId: string; tabId: string; sourceWindowId: number } | null => {
      if (!activeSession) return null
      return {
        sessionId: activeSession.sessionId,
        tabId: activeSession.tabId,
        sourceWindowId: activeSession.sourceWindowId
      }
    }
  )

  // 安全措施：超时自动清理（防止拖拽卡住）
  setInterval(() => {
    if (activeSession && Date.now() - activeSession.createdAt > 30000) {
      logger.warn('拖拽会话超时，强制清理:', activeSession.sessionId)
      const sessionId = activeSession.sessionId
      activeSession = null
      broadcastDragState('drag:session-ended', { sessionId })
    }
  }, 5000)
}
