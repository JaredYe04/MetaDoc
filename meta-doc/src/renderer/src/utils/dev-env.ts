/**
 * 开发环境判断工具
 */

let isDevCache: boolean | null = null

/**
 * 判断是否为开发环境
 * 开发环境：未打包的 Electron 应用或 web 环境
 */
export async function isDevEnvironment(): Promise<boolean> {
  if (isDevCache !== null) {
    return isDevCache
  }

  // 检查是否在 Electron 环境中
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    try {
      // 尝试通过 IPC 获取主进程的 isPackaged 状态
      const ipcRenderer = window.electron.ipcRenderer
      if (typeof ipcRenderer.invoke === 'function') {
        const isPackaged = await ipcRenderer.invoke('get-is-packaged')
        isDevCache = !isPackaged
        return isDevCache
      }
    } catch (error) {
      // IPC 调用失败，使用备用方法
    }
  }

  // 备用方法：检查 userAgent 和 location
  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase()
    // 如果是 Electron 环境但不在打包状态，或者是在 web 开发环境
    if (ua.includes('electron')) {
      // Electron 环境，默认认为是开发环境（除非明确是打包的）
      isDevCache = !ua.includes('packaged')
    } else {
      // Web 环境，检查是否是 localhost 或开发服务器
      const hostname = window.location.hostname
      isDevCache = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('dev')
    }
  } else {
    // Node.js 环境
    isDevCache = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
  }

  return isDevCache ?? true // 默认返回 true（开发环境）
}

/**
 * 同步判断是否为开发环境（使用缓存）
 */
export function isDevEnvironmentSync(): boolean {
  if (isDevCache !== null) {
    return isDevCache
  }
  // 如果缓存未设置，返回 true（默认开发环境）
  // 实际使用时应该先调用异步版本
  return true
}
