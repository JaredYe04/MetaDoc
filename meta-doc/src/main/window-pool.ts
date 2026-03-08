/**
 * 窗口池：预创建空闲窗口，使 Tab 拖出创建新窗口时瞬间显示
 * 保持 2 个空闲窗口就绪，用掉后异步补充
 */

import { BrowserWindow } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { is } from '@electron-toolkit/utils'
import { registerMainWindow, getWindowId, getPoolParentWindow } from './index'
import { createMainLogger } from './logger'

const logger = createMainLogger('WindowPool')

const POOL_SIZE = 2
const pool: BrowserWindow[] = []
/** 应用是否正在退出，用于避免退出过程中异步补充的窗口残留 */
let isShuttingDown = false

function getPoolUrl(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL'] + '/#/home?windowType=home&skipAutoHome=1'
  }
  const indexPath = join(__dirname, '../renderer/index.html')
  const fileURL = pathToFileURL(indexPath).toString()
  return `${fileURL}#/home?windowType=home&skipAutoHome=1`
}

function createPoolWindow(): BrowserWindow {
  const parent = getPoolParentWindow()
  const win = new BrowserWindow({
    parent: parent ?? undefined,
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon: undefined } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true,
      webSecurity: false
    }
  })

  registerMainWindow(win)
  return win
}

function waitForVueReady(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      if (!resolved) {
        resolved = true
        resolve()
      }
    }
    let resolved = false

    win.webContents.once('did-finish-load', () => {
      const check = async () => {
        if (resolved || win.isDestroyed()) return
        try {
          const isReady = await win.webContents.executeJavaScript(`
            (function() {
              return typeof document !== 'undefined' &&
                     document.querySelector('.main-tabs-wrapper') !== null;
            })();
          `)
          if (isReady) {
            done()
          } else {
            setTimeout(check, 50)
          }
        } catch {
          done()
        }
      }
      check()
      setTimeout(done, 5000)
    })
  })
}

/** 创建并预加载一个池窗口，就绪后加入 pool */
async function createAndAddToPool(): Promise<void> {
  if (isShuttingDown) return
  const win = createPoolWindow()
  win.loadURL(getPoolUrl())
  await waitForVueReady(win)
  if (isShuttingDown) {
    if (!win.isDestroyed()) win.destroy()
    return
  }
  if (!win.isDestroyed() && pool.length < POOL_SIZE) {
    pool.push(win)
    win.once('closed', () => {
      const idx = pool.indexOf(win)
      if (idx !== -1) pool.splice(idx, 1)
    })
    logger.debug(`窗口池: 已补充，当前 ${pool.length} 个`)
  } else if (!win.isDestroyed()) {
    win.close()
  }
}

/**
 * 从池中取出一个就绪窗口用于 Tab 拖出
 * @returns 若池中有可用窗口则返回，否则返回 null
 */
export function acquirePoolWindow(params: {
  tabData: any
  position: { x: number; y: number }
  width: number
  height: number
}): BrowserWindow | null {
  const { tabData, position, width, height } = params
  const win = pool.shift()
  if (!win || win.isDestroyed()) {
    return null
  }

  // 解除父子关系，使该窗口成为独立顶层窗口，避免随原父窗口关闭
  try {
    win.setParentWindow(null)
  } catch (_) {
    // 部分 Electron 版本或平台可能不支持，忽略
  }

  // 鼠标位置作为新窗口左上角，留 10px 安全边距避免贴边
  const x = Math.max(10, position.x)
  const y = Math.max(10, position.y)

  win.setBounds({ x, y, width, height })
  win.show()
  win.webContents.send('add-tab-from-drag', { tabData, insertIndex: 0 })
  win.focus()

  logger.info(`窗口池: 使用预加载窗口 ${getWindowId(win)}, Tab: ${tabData?.tab?.id || 'unknown'}`)

  // 异步补充
  createAndAddToPool().catch((err) => logger.warn('窗口池补充失败', err))

  return win
}

/** 初始化窗口池：在应用就绪后延迟创建 */
export function initWindowPool(): void {
  const create = () => {
    const need = POOL_SIZE - pool.length
    for (let i = 0; i < need; i++) {
      createAndAddToPool().catch((err) => logger.warn('窗口池初始化失败', err))
    }
  }

  // 主窗口加载后再创建池，避免竞争
  setTimeout(create, 3000)
}

/**
 * 应用退出前销毁窗口池中所有预创建窗口，避免进程残留。
 * 应在 before-quit 中调用。
 */
export function destroyWindowPool(): void {
  isShuttingDown = true
  const toDestroy = pool.splice(0, pool.length)
  for (const win of toDestroy) {
    if (!win.isDestroyed()) {
      try {
        const id = getWindowId(win)
        win.destroy()
        logger.debug(`窗口池: 已销毁预加载窗口 ${id}`)
      } catch (e) {
        logger.warn('窗口池: 销毁窗口时出错', e)
      }
    }
  }
}
