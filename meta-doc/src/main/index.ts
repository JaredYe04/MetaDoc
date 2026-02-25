/**
 * 主进程入口文件 - TypeScript 重构版本
 * 负责应用初始化、窗口管理和生命周期控制
 */

import { app, shell, BrowserWindow, IpcMainEvent, dialog } from 'electron'
import { ipcBridge } from './bridge/ipc-bridge'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// import icon from '../../resources/icon.png?asset';
const icon = undefined // 暂时禁用icon导入
import fs from 'fs'
import http from 'http'
import os from 'os'
import {
  mainCalls,
  refreshMainWindowTitle,
  openDoc,
  findWindowWithToolTab,
  globalTabRegistry
} from './main-calls'
import { registerDragManagerIPC } from './drag-manager'
import { initWindowPool } from './window-pool'
import { startFileRegistry, stopFileRegistry } from './file-registry'
import {
  initUpdateService,
  checkForUpdates,
  downloadUpdate,
  setUpdateChannel,
  type UpdateChannel
} from './utils/update-service'
import {
  registerExternalOpenHandler,
  registerFocusRequestHandler,
  runExpressServer,
  refreshKnowledgeItems
} from './express-server'
import { initializeUtils } from './utils'
import { initLogger, shutdownLogger, createMainLogger } from './logger'
import { broadcastServiceStatus } from './service-status'
import { initI18n, t, dispatchLanguageToWindow, setLocale, broadcastLanguage } from './i18n'
import {
  initWindowManager,
  preloadAuxiliaryWindows,
  openAuxiliaryWindow,
  refreshAuxiliaryWindowTitles,
  dispatchLanguageToAuxWindows
} from './window-manager'
import { ensureInitialized } from './database/knowledge-db'

const url = require('url')
const path = require('path')

// 加载环境变量
import dotenv from 'dotenv'

// 加载 .env 文件
// 在开发环境中，从项目根目录加载；在打包后，从 resources 目录加载
let envPath: string
if (app.isPackaged) {
  // 打包后：从 resources 目录加载（resources 目录会被 asarUnpack 解包）
  envPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', '.env')
} else {
  // 开发环境：从项目根目录加载
  envPath = path.resolve(__dirname, '../../.env')
}
dotenv.config({ path: envPath })

// 关键修复：在应用启动时设置 Java 环境变量，确保 PlantUML 使用 UTF-8 编码
// 这必须在所有其他初始化之前设置，确保全局生效
if (!process.env.JAVA_OPTS || !process.env.JAVA_OPTS.includes('-Dfile.encoding')) {
  process.env.JAVA_OPTS = (process.env.JAVA_OPTS || '') + ' -Dfile.encoding=UTF-8'
}
if (!process.env._JAVA_OPTIONS || !process.env._JAVA_OPTIONS.includes('-Dfile.encoding')) {
  process.env._JAVA_OPTIONS = (process.env._JAVA_OPTIONS || '') + ' -Dfile.encoding=UTF-8'
}

// GPU 兼容性检测：根据环境自动决定是否禁用 GPU 硬件加速
// 这必须在 app.whenReady() 之前执行
function shouldDisableGPU(): boolean {
  // 无显示器 / CI / Linux server / WSL
  if (process.env.CI) return true
  if (process.env.WSL_DISTRO_NAME) return true
  if (os.platform() === 'linux' && !process.env.DISPLAY) return true

  // Windows 系统：检查是否明确指定禁用 GPU（通过环境变量）
  if (process.env.DISABLE_GPU === '1' || process.env.DISABLE_GPU === 'true') {
    return true
  }

  return false
}

if (shouldDisableGPU()) {
  const logger = createMainLogger('MainProcess')
  logger.info('GPU Acceleration Disabled')
  app.disableHardwareAcceleration()
  // 同时设置命令行参数，确保完全禁用 GPU
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
} else {
  // 对于有 GPU 的系统，允许 GPU 进程崩溃后继续运行，自动回退到软件渲染
  // 这样可以避免在没有 GPU 或 GPU 驱动不兼容时应用直接崩溃
  const logger = createMainLogger('MainProcess')
  logger.info('GPU Acceleration Enabled')
  app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
}

initLogger()
initI18n()
const logger = createMainLogger('MainProcess')

import { getRuntimeServerHost, getRuntimeServerPort } from './runtime-server-config'

const SUPPORTED_FILE_EXTENSIONS = new Set(['.md', '.json', '.txt', '.tex'])

const startupFileArgument = findSupportedFileArgument(process.argv)
const prelaunchDelegationPromise = attemptDelegationToRunningInstance(startupFileArgument)

// ============ 全局变量 ============

export let mainWindow: BrowserWindow | null = null
export let dirname: string
export let is_need_save: boolean = false

// 窗口管理：维护所有主窗口实例
export const mainWindows = new Map<number, BrowserWindow>()

/**
 * 注册主窗口
 */
export function registerMainWindow(win: BrowserWindow): void {
  const id = win.webContents.id
  mainWindows.set(id, win)
  logger.debug(`注册主窗口: ${id}`)

  // 为窗口附加快捷键处理器（支持 Linux Wayland）
  attachShortcutHandler(win)

  // 最大化/还原时通知渲染进程，用于切换标题栏图标（含 Aero 贴边等系统操作）
  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', true)
  })
  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window-maximized-changed', false)
  })

  // 窗口关闭时自动移除，释放引用，防止内存泄漏
  win.on('closed', () => {
    // 清理全局注册表中该窗口的标签页，防止野 Tab 残留
    globalTabRegistry.cleanupWindowTabs(id)
    mainWindows.delete(id)
    logger.debug(`移除主窗口: ${id}`)

    // 若已关闭的是 mainWindow 指向的窗口，立即更新引用，避免持有已销毁窗口导致内存泄漏
    if (mainWindow === win) {
      mainWindow = null
      const visible = getVisibleMainWindows()
      if (visible.length > 0) {
        mainWindow = visible[0]
      }
    }

    if (!isAppQuitting) {
      const visible = getVisibleMainWindows()
      if (visible.length === 0) {
        logger.debug('无已显示窗口，退出应用')
        isAppQuitting = true // 立即标记，防止 activate 事件创建新窗口
        app.quit()
      }
    }
  })
}

/**
 * 获取窗口ID
 */
export function getWindowId(win: BrowserWindow): number {
  return win.webContents.id
}

/**
 * 根据窗口ID获取窗口实例（已销毁的返回 undefined，避免持有陈旧引用）
 */
export function getWindowById(windowId: number): BrowserWindow | undefined {
  const win = mainWindows.get(windowId)
  return win && !win.isDestroyed() ? win : undefined
}

/**
 * 获取所有主窗口（已过滤已销毁的，避免持有陈旧引用）
 */
export function getAllMainWindows(): BrowserWindow[] {
  return Array.from(mainWindows.values()).filter((win) => !win.isDestroyed())
}

/**
 * 获取所有已显示的主窗口（排除窗口池中未显示的预加载窗口）
 */
export function getVisibleMainWindows(): BrowserWindow[] {
  return getAllMainWindows().filter((win) => !win.isDestroyed() && win.isVisible())
}

let isShortcutPressed: boolean = false
let isAppQuitting = false
// 已绑定快捷键处理器的窗口 ID 集合，防止重复绑定
const shortcutBoundWindows = new Set<number>()
// Ctrl+K 后按 S 触发「保存全部」的等待截止时间（0 表示未在等待）
let pendingSaveAllUntil = 0
const SAVE_ALL_SEQUENCE_MS = 1500

function focusMainApplicationWindow(): void {
  // 仅操作已显示的窗口，避免误显示窗口池中的备用窗口
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
    const visible = getVisibleMainWindows()
    if (visible.length > 0) {
      mainWindow = visible[0]
    } else {
      return
    }
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

// ============ 主窗口创建和管理 ============

/**
 * 创建主窗口
 */
function createWindow(): void {
  dirname = __dirname

  // 启用日志输出
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')

  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false, // 隐藏默认窗口栏
    titleBarStyle: 'hidden', // macOS 隐藏标题栏
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      webSecurity: false
    }
  })

  // 注册主窗口
  registerMainWindow(mainWindow)

  initWindowManager(() => mainWindow)

  mainWindow.webContents.on('did-finish-load', () => {
    dispatchLanguageToWindow(mainWindow)
  })

  // 窗口准备好显示时
  mainWindow.on('ready-to-show', () => {
    // 显示窗口
    mainWindow?.show()
    mainWindow?.focus()
    broadcastServiceStatus()

    // 初始化工具服务（包括知识库服务）
    ;(async () => {
      try {
        logger.info('🚀 正在后台初始化工具服务（包括知识库服务）...')
        await initializeUtils()
        // 工具服务初始化完成后，刷新知识库列表
        refreshKnowledgeItems()
        logger.info('✅ 工具服务初始化完成，知识库列表已刷新')
      } catch (error) {
        logger.error('❌ 工具服务初始化失败:', error)
      }
    })()

    // 注释掉预加载辅助窗口的代码
    // 说明：由于已经将所有AI工具窗口和设置窗口改为在主窗口Tab中显示，不再需要独立窗口
    // 因此不再需要预加载辅助窗口。保留代码以便将来如果需要恢复独立窗口功能时参考。
    // (async () => {
    //   try {
    //     logger.info('🚀 开始串行预加载辅助窗口...');
    //     await preloadAuxiliaryWindows();
    //     logger.info('✅ 所有辅助窗口预加载完成');
    //   } catch (error) {
    //     logger.error('❌ 预加载辅助窗口失败:', error);
    //   }
    // })();
  })

  // 处理窗口关闭
  mainWindow.on('close', async (e) => {
    if (is_need_save) {
      e.preventDefault()

      // 通过 IPC 调用获取所有未保存的tabs信息
      let unsavedTabs: Array<{ tabId: string; fileName: string; path: string }> = []
      try {
        // 发送请求获取所有未保存的tabs信息
        mainWindow?.webContents.send('request-unsaved-tabs-info')

        // 等待响应
        unsavedTabs = await new Promise<Array<{ tabId: string; fileName: string; path: string }>>(
          (resolve) => {
            const handler = (
              _event: IpcMainEvent,
              tabs: Array<{ tabId: string; fileName: string; path: string }>
            ) => {
              ipcBridge.removeListener('unsaved-tabs-info-response', handler)
              resolve(tabs || [])
            }
            ipcBridge.registerOnce('unsaved-tabs-info-response', handler)
            // 设置超时，避免无限等待
            setTimeout(() => {
              ipcBridge.removeListener('unsaved-tabs-info-response', handler)
              resolve([])
            }, 1000)
          }
        )
      } catch (error) {
        logger.error('获取未保存tabs信息失败:', error)
      }

      // 如果没有未保存的tabs，直接关闭
      if (unsavedTabs.length === 0) {
        is_need_save = false
        mainWindow?.close()
        return
      }

      // 依次处理每个未保存的tab
      for (let i = 0; i < unsavedTabs.length; i++) {
        const tab = unsavedTabs[i]
        const fileName = tab.fileName || t('main.dialogs.unsavedDocument', '未保存的文档')
        const isLastTab = i === unsavedTabs.length - 1

        // 显示系统级对话框
        const result = await dialog.showMessageBox(mainWindow!, {
          type: 'question',
          buttons: [
            t('leftMenu.save', '保存'),
            t('leftMenu.discard', '放弃'),
            t('common.cancel', '取消')
          ],
          defaultId: 0,
          cancelId: 2,
          title: t('main.dialogs.closeWindowTitle', '关闭窗口'),
          message: t('main.dialogs.askSaveWithFileName', '是否保存 {fileName}？', { fileName }),
          detail: isLastTab
            ? t('main.dialogs.unsavedChangesDetail', '您的更改尚未保存。')
            : t('main.dialogs.unsavedChangesDetail', '您的更改尚未保存。') +
              ` (${i + 1}/${unsavedTabs.length})`
        })

        if (result.response === 0) {
          // 用户选择保存
          try {
            // 发送保存请求
            mainWindow?.webContents.send('save-tab', tab.tabId)

            // 等待保存响应
            const saveResult = await new Promise<{
              tabId: string
              success: boolean
              error?: string
            }>((resolve) => {
              const handler = (
                _event: IpcMainEvent,
                result: { tabId: string; success: boolean; error?: string }
              ) => {
                if (result.tabId === tab.tabId) {
                  ipcBridge.removeListener('save-tab-response', handler)
                  resolve(result)
                }
              }
              ipcBridge.registerOn('save-tab-response', handler)
              // 设置超时，避免无限等待
              setTimeout(() => {
                ipcBridge.removeListener('save-tab-response', handler)
                resolve({ tabId: tab.tabId, success: false, error: '保存超时' })
              }, 10000)
            })

            if (!saveResult.success) {
              // 保存失败，询问用户是否继续
              const continueResult = await dialog.showMessageBox(mainWindow!, {
                type: 'error',
                buttons: [t('common.continue', '继续'), t('common.cancel', '取消')],
                defaultId: 0,
                cancelId: 1,
                title: t('main.dialogs.saveFailed', '保存失败'),
                message: t('main.dialogs.saveFailedMessage', '保存 {fileName} 失败', { fileName }),
                detail:
                  saveResult.error || t('main.dialogs.saveFailedDetail', '是否继续关闭其他文档？')
              })

              if (continueResult.response === 1) {
                // 用户选择取消，停止处理
                return
              }
            }
          } catch (error) {
            logger.error('保存tab失败:', error)
            // 保存出错，询问用户是否继续
            const continueResult = await dialog.showMessageBox(mainWindow!, {
              type: 'error',
              buttons: [t('common.continue', '继续'), t('common.cancel', '取消')],
              defaultId: 0,
              cancelId: 1,
              title: t('main.dialogs.saveFailed', '保存失败'),
              message: t('main.dialogs.saveFailedMessage', '保存 {fileName} 失败', { fileName }),
              detail: t('main.dialogs.saveFailedDetail', '是否继续关闭其他文档？')
            })

            if (continueResult.response === 1) {
              // 用户选择取消，停止处理
              return
            }
          }
        } else if (result.response === 1) {
          // 用户选择放弃
          try {
            // 发送放弃请求
            mainWindow?.webContents.send('discard-tab', tab.tabId)

            // 等待放弃响应（通常很快，但我们也设置超时）
            await new Promise<void>((resolve) => {
              const handler = (
                _event: IpcMainEvent,
                result: { tabId: string; success: boolean }
              ) => {
                if (result.tabId === tab.tabId) {
                  ipcBridge.removeListener('discard-tab-response', handler)
                  resolve()
                }
              }
              ipcBridge.registerOn('discard-tab-response', handler)
              // 设置超时，避免无限等待
              setTimeout(() => {
                ipcBridge.removeListener('discard-tab-response', handler)
                resolve()
              }, 1000)
            })
          } catch (error) {
            logger.error('放弃tab更改失败:', error)
          }
        } else {
          // 用户选择取消（response === 2），停止处理，窗口保持打开
          return
        }
      }

      // 所有未保存的tabs都已处理完毕，关闭所有剩余的tabs（没有脏标记的tabs）
      try {
        // 发送请求关闭所有剩余的tabs
        mainWindow?.webContents.send('close-all-tabs')

        // 等待响应（通常很快，但我们也设置超时）
        await new Promise<void>((resolve) => {
          const handler = (_event: IpcMainEvent, result: { success: boolean }) => {
            ipcBridge.removeListener('close-all-tabs-response', handler)
            resolve()
          }
          ipcBridge.registerOnce('close-all-tabs-response', handler)
          // 设置超时，避免无限等待
          setTimeout(() => {
            ipcBridge.removeListener('close-all-tabs-response', handler)
            resolve()
          }, 2000)
        })
      } catch (error) {
        logger.error('关闭所有tabs失败:', error)
      }

      // 更新标志并关闭窗口
      is_need_save = false
      mainWindow?.close()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (!isAppQuitting) {
      // 仅从已显示的窗口中选下一个 mainWindow，排除窗口池中未显示的备用窗口
      const visibleRemaining = getVisibleMainWindows()
      if (visibleRemaining.length > 0) {
        mainWindow = visibleRemaining[0]
      } else {
        app.quit()
      }
    }
  })

  // 处理关闭单个tab的请求
  ipcBridge.registerOn('request-close-tab', async (event, tabId: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    try {
      // 发送请求获取tab信息
      mainWindow.webContents.send('request-tab-info', tabId)

      // 等待响应
      const tabInfo = await new Promise<{ fileName: string; path: string; dirty: boolean } | null>(
        (resolve) => {
          const handler = (
            _event: IpcMainEvent,
            info: { fileName: string; path: string; dirty: boolean } | null
          ) => {
            ipcBridge.removeListener('tab-info-response', handler)
            resolve(info)
          }
          ipcBridge.registerOnce('tab-info-response', handler)
          // 设置超时，避免无限等待
          setTimeout(() => {
            ipcBridge.removeListener('tab-info-response', handler)
            resolve(null)
          }, 1000)
        }
      )

      if (!tabInfo) {
        // 如果获取tab信息失败，直接关闭tab
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'discard' })
        return
      }

      // 如果tab没有脏标记，直接关闭
      if (!tabInfo.dirty) {
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'discard' })
        return
      }

      // 如果有脏标记，显示系统对话框
      const fileName = tabInfo.fileName || t('main.dialogs.unsavedDocument', '未保存的文档')
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: [
          t('leftMenu.save', '保存'),
          t('leftMenu.discard', '放弃'),
          t('common.cancel', '取消')
        ],
        defaultId: 0,
        cancelId: 2,
        title: t('main.dialogs.closeTabTitle', '未保存的更改'),
        message: t('main.dialogs.askSaveWithFileName', '是否保存 {fileName}？', { fileName }),
        detail: t('main.dialogs.unsavedChangesDetail', '您的更改尚未保存。')
      })

      if (result.response === 0) {
        // 用户选择保存
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'save' })
      } else if (result.response === 1) {
        // 用户选择放弃
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'discard' })
      } else {
        // 用户选择取消
        mainWindow.webContents.send('close-tab-response', { tabId, action: 'cancel' })
      }
    } catch (error) {
      logger.error('处理关闭tab请求失败:', error)
      mainWindow.webContents.send('close-tab-response', { tabId, action: 'cancel' })
    }
  })

  // 处理新窗口打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 处理命令行参数
  handleCommandLineArgs(startupFileArgument)

  // 设置为全局变量
  ;(global as any).mainWindow = mainWindow

  registerExternalOpenHandler(async ({ path }) => {
    try {
      if (!path) return

      // 只在已显示的窗口中查找（排除窗口池中未显示的备用窗口）
      const windows = getVisibleMainWindows()
      let foundWindow: BrowserWindow | null = null
      let foundTabId: string | null = null

      // 查询所有窗口
      for (const win of windows) {
        const result = await new Promise<{ tabId: string | null }>((resolve) => {
          const handler = (_event: IpcMainEvent, response: { tabId: string | null } | null) => {
            ipcBridge.removeListener('file-exists-in-window-response', handler)
            resolve(response || { tabId: null })
          }

          ipcBridge.registerOnce('file-exists-in-window-response', handler)
          win.webContents.send('check-file-exists-in-window', path)

          // 超时处理
          setTimeout(() => {
            ipcBridge.removeListener('file-exists-in-window-response', handler)
            resolve({ tabId: null })
          }, 1000)
        })

        if (result.tabId) {
          foundWindow = win
          foundTabId = result.tabId
          break
        }
      }

      // 如果文件已在某个窗口打开，切换到该窗口
      if (foundWindow && foundTabId) {
        foundWindow.webContents.send('activate-tab-by-id', foundTabId)
        if (foundWindow.isMinimized()) {
          foundWindow.restore()
        }
        foundWindow.show()
        foundWindow.focus()
        return
      }

      // 如果文件未打开，选择当前 focus 的窗口或第一个已显示窗口（不选池中备用窗口）
      const focusedWindow = BrowserWindow.getFocusedWindow()
      let targetWindow: BrowserWindow | null = null

      if (focusedWindow && !focusedWindow.isDestroyed() && focusedWindow.isVisible()) {
        targetWindow = focusedWindow
      } else if (windows.length > 0) {
        targetWindow = windows[0]
      } else if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        targetWindow = mainWindow
      }

      if (targetWindow) {
        await openDoc(path, getWindowId(targetWindow))
      } else {
        // 如果没有窗口，focus主窗口
        focusMainApplicationWindow()
        await openDoc(path)
      }
    } catch (error) {
      logger.error('处理外部打开文件请求失败', error as Error)
    }
  })

  registerFocusRequestHandler(async () => {
    focusMainApplicationWindow()
  })

  // 启动Express服务器
  runExpressServer()
}

/**
 * 处理命令行参数
 */
function handleCommandLineArgs(initialFilePath?: string | null): void {
  const filePath = initialFilePath || findSupportedFileArgument(process.argv)
  const queryParams = filePath ? `&file=${encodeURIComponent(filePath)}` : ''

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow?.loadURL(
      process.env['ELECTRON_RENDERER_URL'] + '/#/home?windowType=home' + queryParams
    )
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html')
    const fileURL = url.pathToFileURL(indexPath).toString()
    mainWindow?.loadURL(`${fileURL}#/home?windowType=home${queryParams}`)
  }
}

// ============ 应用生命周期管理 ============

/**
 * 应用准备就绪时
 */
app.whenReady().then(async () => {
  // 使用与 electron-builder.yml 中一致的 appId
  electronApp.setAppUserModelId('com.byte-light.metadoc')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  if (await prelaunchDelegationPromise) {
    const delegationAction = startupFileArgument ? '转发文件打开请求' : '发送聚焦请求'
    logger.info(`检测到已有 MetaDoc 实例，已${delegationAction}，本实例即将退出`)
    app.quit()
    return
  }

  // 在创建窗口之前执行数据库迁移，确保表已创建
  try {
    logger.info('🚀 正在执行数据库迁移...')
    ensureInitialized()
    logger.info('✅ 数据库迁移完成')
  } catch (error) {
    logger.error('❌ 数据库迁移失败:', error)
  }

  createWindow()
  mainCalls()
  registerDragManagerIPC()
  initWindowPool()
  startFileRegistry()

  // 初始化更新服务
  initUpdateService()

  // 自动检查更新（延迟执行，避免阻塞应用启动）
  setTimeout(() => {
    autoCheckForUpdates()
  }, 5000) // 延迟5秒后检查更新

  app.on('activate', function () {
    // 若正在退出（如关闭最后一个窗口触发 quit），则不要创建新窗口
    if (isAppQuitting) return
    // 使用 getAllMainWindows：启动时主窗口可能尚未 show，getVisibleMainWindows 会误判为 0 导致重复创建窗口
    const allWindows = getAllMainWindows().filter((w) => !w.isDestroyed())
    if (allWindows.length === 0) {
      createWindow()
    }
  })

  // 错误处理（通过process监听）
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error)
  })
})

/**
 * 监听保存状态
 */
ipcBridge.registerOn('is-need-save', (event: IpcMainEvent, arg: boolean) => {
  is_need_save = arg
})

/**
 * 所有窗口关闭时（由 Electron 触发，当 BrowserWindow.getAllWindows() 为空时）
 * 仅当无已显示窗口时退出；实际退出逻辑由 registerMainWindow 的 closed 处理器负责
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isAppQuitting) {
    const visible = getVisibleMainWindows()
    if (visible.length === 0) {
      app.quit()
    }
  }
})

app.on('before-quit', () => {
  isAppQuitting = true
  stopFileRegistry()
  shutdownLogger()
})

// ============ 自动更新检查 ============

/**
 * 自动检查更新
 */
async function autoCheckForUpdates(): Promise<void> {
  try {
    const Store = require('electron-store')
    const store = new Store()

    // 检查是否启用自动检查更新
    const autoCheck = store.get('autoCheckUpdates')
    if (autoCheck === false) {
      logger.info('自动检查更新已禁用，跳过更新检查')
      return
    }

    // 获取更新渠道
    const channel = (store.get('updateChannel') as UpdateChannel) || 'release'

    logger.info(`开始自动检查更新（渠道: ${channel}）...`)

    // 设置更新渠道
    setUpdateChannel(channel)

    // 检查更新
    const status = await checkForUpdates(channel)

    if (status.updateAvailable) {
      logger.info(`发现新版本: ${status.updateInfo?.version}`)

      // 如果启用了自动检查更新，自动下载
      if (autoCheck !== false) {
        logger.info('开始自动下载更新...')
        try {
          // 监听下载进度并发送到渲染进程
          const { autoUpdater } = require('electron-updater')
          const progressHandler = (progressObj: { percent: number }) => {
            if (mainWindow) {
              mainWindow.webContents.send('update-download-progress', {
                percent: progressObj.percent
              })
            }
          }

          autoUpdater.on('download-progress', progressHandler)

          try {
            await downloadUpdate()
            autoUpdater.removeListener('download-progress', progressHandler)
            logger.info('更新下载完成，等待用户安装')

            // 通知主窗口有更新可用
            if (mainWindow) {
              mainWindow.webContents.send('update-downloaded', {
                version: status.updateInfo?.version
              })
            }
          } catch (error) {
            autoUpdater.removeListener('download-progress', progressHandler)
            throw error
          }
        } catch (error) {
          logger.error('自动下载更新失败:', error)
        }
      }
    } else if (status.updateNotAvailable) {
      logger.info('当前已是最新版本')
    } else if (status.error) {
      logger.warn('检查更新时出错:', status.error)
    }
  } catch (error) {
    logger.error('自动检查更新失败:', error)
  }
}

// ============ 快捷键绑定 ============

/**
 * 为窗口附加快捷键处理器（使用 before-input-event 替代 globalShortcut）
 * 支持 Linux Wayland 环境
 */
function attachShortcutHandler(win: BrowserWindow): void {
  const wcId = win.webContents.id
  if (shortcutBoundWindows.has(wcId)) return
  shortcutBoundWindows.add(wcId)

  win.on('closed', () => {
    shortcutBoundWindows.delete(wcId)
  })

  win.webContents.on('before-input-event', (event, input) => {
    // 仅处理按下事件
    if (input.type !== 'keyDown') return

    const ctrl = input.control || input.meta
    const key = input.key.toLowerCase()
    const shift = input.shift

    // 两键序列：Ctrl+K 后按 S → 保存全部
    if (pendingSaveAllUntil > 0) {
      if (Date.now() > pendingSaveAllUntil) {
        pendingSaveAllUntil = 0
      } else if (key === 's') {
        pendingSaveAllUntil = 0
        if (!input.isAutoRepeat) {
          event.preventDefault()
          win.webContents.send('save-all-triggered')
        }
        return
      } else {
        pendingSaveAllUntil = 0
      }
    }

    if (!ctrl) return

    // Ctrl+K：进入「保存全部」等待第二键 S
    if (key === 'k' && !shift) {
      if (!input.isAutoRepeat) {
        pendingSaveAllUntil = Date.now() + SAVE_ALL_SEQUENCE_MS
        event.preventDefault()
      }
      return
    }

    // 匹配单键快捷键
    let channel: string | null = null

    if (key === 's' && !shift) channel = 'save-triggered'
    else if (key === 's' && shift) channel = 'save-as-triggered'
    else if (key === 'tab' && !shift) channel = 'next-tab-triggered'
    else if (key === 'tab' && shift) channel = 'prev-tab-triggered'
    else if (key === 'w' && !shift) channel = 'close-tab-triggered'
    else if (key === 't' && shift) channel = 'reopen-tab-triggered'
    else if (key === 't' && !shift) channel = 'new-tab-triggered'
    else if (key === 'n' && !shift) channel = 'new-doc-triggered'

    if (channel === 'new-doc-triggered') {
      if (!input.isAutoRepeat && !isShortcutPressed) {
        isShortcutPressed = true
        setTimeout(() => {
          isShortcutPressed = false
        }, 1000)
        event.preventDefault()
        win.webContents.send(channel)
      }
      return
    }

    // Ctrl+O：打开文件对话框（主进程直接调 openDoc，无需经渲染进程）
    if (key === 'o' && !shift) {
      if (!input.isAutoRepeat && !isShortcutPressed) {
        isShortcutPressed = true
        setTimeout(() => {
          isShortcutPressed = false
        }, 1000)
        event.preventDefault()
        openDoc(undefined, win.webContents.id)
      }
      return
    }

    if (!channel) return

    // 仅 Ctrl+Tab / Ctrl+Shift+Tab 循环切换不需要防抖且允许 auto-repeat
    const isCycleShortcut = channel === 'next-tab-triggered' || channel === 'prev-tab-triggered'

    if (!isCycleShortcut && input.isAutoRepeat) return
    if (!isCycleShortcut && isShortcutPressed) {
      logger.debug('快捷键防抖：忽略重复按键', channel)
      return
    }

    if (!isCycleShortcut) {
      isShortcutPressed = true
      // 缩短防抖时间到 200ms，防止快速双击但仍保持响应性
      setTimeout(() => {
        isShortcutPressed = false
      }, 200)
    }

    event.preventDefault()
    win.webContents.send(channel)
  })
}

/**
 * 绑定全局快捷键（为主窗口附加处理器）
 */
// ============ 子窗口管理 ============

const WINDOW_IDS = {
  setting: 'setting',
  aiChat: 'aiChat',
  formulaRecognition: 'formulaRecognition',
  aiGraph: 'aiGraph'
} as const

/** 在触发窗口打开工具 Tab；若其它窗口已打开则 focus 到该窗口 */
async function openToolTabInWindow(
  toolType: string,
  senderWebContents?: Electron.WebContents
): Promise<void> {
  const { windowId: existingWindowId, tabId } = await findWindowWithToolTab({ toolType })
  const senderWindow = senderWebContents ? BrowserWindow.fromWebContents(senderWebContents) : null
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const targetWindow = senderWindow || focusedWindow || mainWindow

  if (existingWindowId != null && tabId) {
    const win = getWindowById(existingWindowId)
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      // 先 focus 再激活 Tab；略微延迟确保窗口已聚焦
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.webContents.send('activate-tab-by-id', tabId)
        }
      }, 50)
      return
    }
  }

  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send('receive-broadcast', {
      eventName: 'open-tool-tab',
      data: { toolType }
    })
    if (targetWindow.isMinimized()) targetWindow.restore()
    targetWindow.show()
    targetWindow.focus()
  }
}

export const openSettingDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('setting', event?.sender)
}

export const openAiChatDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('aiChat', event?.sender)
}

export const openFomulaRecognitionDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('formulaRecognition', event?.sender)
}

export const openDataAnalysisDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('dataAnalysis', event?.sender)
}

export const openOcrDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('ocr', event?.sender)
}

export const openAttachmentDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('attachment', event?.sender)
}

export const openGraphDialog = async (event?: IpcMainEvent): Promise<void> => {
  openToolTabInWindow('graph', event?.sender)
}

export const openAiGraphDialog = async (event?: IpcMainEvent): Promise<void> => {
  openGraphDialog(event)
}

// ============ 广播频道管理 ============

interface HttpRequestResult {
  ok: boolean
  statusCode?: number
  body: string
}

function findSupportedFileArgument(args: string[]): string | null {
  for (const arg of args) {
    if (!arg || arg.startsWith('--')) continue
    const ext = path.extname(arg).toLowerCase()
    if (SUPPORTED_FILE_EXTENSIONS.has(ext) && fs.existsSync(arg)) {
      return path.resolve(arg)
    }
  }
  return null
}

async function attemptDelegationToRunningInstance(filePath?: string | null): Promise<boolean> {
  const statusResponse = await performHttpRequest({
    host: getRuntimeServerHost(),
    port: getRuntimeServerPort(),
    path: '/api/runtime/status',
    method: 'GET'
  })

  if (!statusResponse.ok) {
    return false
  }

  if (filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`启动参数指定的文件不存在: ${filePath}`)
        return false
      }
    } catch (error) {
      logger.warn('检测启动文件是否存在时出错', error as Error)
      return false
    }

    const payload = JSON.stringify({ path: path.resolve(filePath) })
    const openResponse = await performHttpRequest(
      {
        host: getRuntimeServerHost(),
        port: getRuntimeServerPort(),
        path: '/api/runtime/open-document',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString()
        }
      },
      payload
    )

    if (!openResponse.ok) {
      logger.warn(`向已有实例发送打开文件请求失败，状态码: ${openResponse.statusCode}`)
      return false
    }

    return true
  }

  const focusResponse = await performHttpRequest({
    host: getRuntimeServerHost(),
    port: getRuntimeServerPort(),
    path: '/api/runtime/focus-window',
    method: 'POST',
    headers: {
      'Content-Length': '0'
    }
  })

  if (!focusResponse.ok) {
    logger.warn(`向已有实例发送聚焦请求失败，状态码: ${focusResponse.statusCode}`)
    return false
  }

  return true
}

function performHttpRequest(
  options: http.RequestOptions,
  body?: string
): Promise<HttpRequestResult> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: getRuntimeServerHost(),
        port: getRuntimeServerPort(),
        timeout: 500,
        ...options,
        headers: {
          Connection: 'close',
          ...(options.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        res.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks)
          const text = bodyBuffer.toString('utf-8')
          resolve({
            ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: text
          })
        })
      }
    )

    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, statusCode: 0, body: '' })
    })

    req.on('error', (error) => {
      logger.debug('检测已有实例时请求失败', error)
      resolve({ ok: false, statusCode: 0, body: '' })
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

/**
 * 初始化广播频道
 */
export const initBroadcastChannel = (): void => {
  ipcBridge.registerOn('send-broadcast', (event: IpcMainEvent, message: any) => {
    if (
      message &&
      typeof message === 'object' &&
      message.eventName === 'lang-changed' &&
      typeof message.data === 'string'
    ) {
      setLocale(message.data, { notifyRenderer: false })

      refreshMainWindowTitle()
      refreshAuxiliaryWindowTitles()
      dispatchLanguageToAuxWindows()
      broadcastLanguage()
    }

    // 向所有窗口广播消息
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('receive-broadcast', message)
    })
  })
}
