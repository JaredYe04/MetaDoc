/**
 * 字体服务（Renderer 进程）
 * 通过 IPC 获取系统字体列表，支持缓存、预加载与增量刷新
 */

export interface SystemFont {
  name: string // 字体内部名称（用于实际使用）
  family: string // 字体族名称
  displayName?: string // 本地化显示名称（如：微软雅黑）
  style?: string
}

let cachedFonts: SystemFont[] | null = null
let fontsPromise: Promise<SystemFont[]> | null = null

/**
 * 获取当前缓存的字体列表（不触发加载）
 * 用于下拉打开时立即展示，避免卡顿
 */
export function getCachedFonts(): SystemFont[] | null {
  return cachedFonts
}

/**
 * 预加载字体列表（后台执行，不阻塞）
 * 建议在设置页挂载时调用，这样用户展开下拉时缓存已就绪
 */
export function preloadFonts(): void {
  if (cachedFonts || fontsPromise) return
  fontsPromise = loadFonts()
  fontsPromise
    .then((fonts) => {
      cachedFonts = fonts
      fontsPromise = null
    })
    .catch(() => {
      fontsPromise = null
    })
}

/**
 * 获取系统字体列表（使用缓存，同一加载中复用 Promise）
 */
export async function getSystemFonts(): Promise<SystemFont[]> {
  if (cachedFonts) return cachedFonts
  if (fontsPromise) return fontsPromise

  fontsPromise = loadFonts()
  try {
    const fonts = await fontsPromise
    cachedFonts = fonts
    return fonts
  } catch (error) {
    fontsPromise = null
    console.error('获取系统字体失败:', error)
    return getDefaultFonts()
  } finally {
    fontsPromise = null
  }
}

/**
 * 增量刷新：后台拉取最新系统字体，与当前缓存合并（只增加新字体，不删已有）
 * 用于用户点击「刷新」时，避免清空列表造成的闪烁，且只追加新发现的字体
 */
export async function refreshFontsIncremental(): Promise<SystemFont[]> {
  const messageBridge = (await import('../bridge/message-bridge')).default
  const ipc = messageBridge.getIpc()
  if (!ipc?.invoke) return cachedFonts || getDefaultFonts()

  try {
    await ipc.invoke('clear-main-font-cache')
    const freshList = (await ipc.invoke('get-system-fonts')) as SystemFont[]
    const current = cachedFonts || []
    const seen = new Set(current.map((f) => f.family.toLowerCase()))
    const toAdd = (freshList || []).filter((f) => {
      const key = f.family.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const merged = [...current, ...toAdd].sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name, undefined, {
        sensitivity: 'base'
      })
    )
    cachedFonts = merged
    return merged
  } catch (e) {
    console.error('增量刷新字体失败:', e)
    return cachedFonts || getDefaultFonts()
  }
}

/**
 * 从主进程加载字体列表
 */
async function loadFonts(): Promise<SystemFont[]> {
  const messageBridge = (await import('../bridge/message-bridge')).default
  if (!messageBridge.getIpc()?.invoke) {
    return getDefaultFonts()
  }

  try {
    const fonts = await messageBridge.invoke('get-system-fonts')
    return fonts || getDefaultFonts()
  } catch (error) {
    console.error('IPC 调用失败:', error)
    return getDefaultFonts()
  }
}

/**
 * 获取默认字体列表（作为后备）
 */
function getDefaultFonts(): SystemFont[] {
  return [
    { name: 'Microsoft YaHei', family: 'Microsoft YaHei' },
    { name: 'SimSun', family: 'SimSun' },
    { name: 'SimHei', family: 'SimHei' },
    { name: 'KaiTi', family: 'KaiTi' },
    { name: 'FangSong', family: 'FangSong' },
    { name: 'Arial', family: 'Arial' },
    { name: 'Times New Roman', family: 'Times New Roman' },
    { name: 'Courier New', family: 'Courier New' },
    { name: 'Calibri', family: 'Calibri' },
    { name: 'Verdana', family: 'Verdana' },
    { name: 'Georgia', family: 'Georgia' },
    { name: 'Helvetica', family: 'Helvetica' },
    { name: 'Tahoma', family: 'Tahoma' },
    { name: 'Trebuchet MS', family: 'Trebuchet MS' },
    { name: 'Comic Sans MS', family: 'Comic Sans MS' }
  ]
}

/**
 * 清除字体缓存（用于强制下次重新拉取完整列表）
 * 一般优先使用 refreshFontsIncremental 做增量更新
 */
export function clearFontCache(): void {
  cachedFonts = null
  fontsPromise = null
}
