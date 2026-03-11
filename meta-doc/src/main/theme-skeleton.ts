/**
 * 骨架屏主题色计算（主进程用，与 renderer themes.js 逻辑一致）
 * 仅计算 skeleton 所需的 5 个颜色，供 URL 参数注入
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tinycolor = require('tinycolor2') as typeof import('tinycolor2')

function mixColors(hex1: string, hex2: string, weightOfSecond: number): string {
  const c1 = tinycolor(hex1)
  const c2 = tinycolor(hex2)
  // weightOfSecond 为 1 时全为 hex2；tinycolor.mix 的 amount 为 0~100，0=first, 100=second
  return tinycolor.mix(c1, c2, weightOfSecond * 100).toHexString()
}

function getLuminance(hex: string): number {
  return tinycolor(hex).getLuminance() * 255
}

function adjustSaturation(hex: string, factor: number): string {
  const c = tinycolor(hex)
  const [h, s, l] = c.toHsl()
  return tinycolor({ h, s: Math.max(0, Math.min(1, s * factor)), l }).toHexString()
}

export interface SkeletonThemeSnapshot {
  type: 'light' | 'dark'
  side: string
  top: string
  list: string
  content: string
  tip: string
}

/**
 * 根据 globalTheme、customThemeColor、系统暗色 计算骨架屏用的 5 个颜色（与 themes.js 一致）
 */
export function getSkeletonThemeSnapshot(
  globalTheme: string | undefined,
  customThemeColor: string | undefined,
  isOsDark: boolean
): SkeletonThemeSnapshot {
  let themeColor: string
  let type: 'light' | 'dark'

  if (globalTheme === 'dark') {
    return {
      type: 'dark',
      side: '#1e1e1e',
      top: '#3a3a3a',
      list: '#2e2e2e',
      content: '#2c2c2c',
      tip: '#dddddd'
    }
  }
  if (globalTheme === 'light' || globalTheme === undefined) {
    return {
      type: 'light',
      side: '#f0f0f0',
      top: '#f5f5f5',
      list: '#f0f0f0',
      content: '#ffffff',
      tip: '#000000'
    }
  }
  if (globalTheme === 'sync' || globalTheme === 'sync-color') {
    type = isOsDark ? 'dark' : 'light'
    themeColor = type === 'dark' ? '#2c2c2c' : '#ffffff'
    if (type === 'dark') {
      return {
        type: 'dark',
        side: '#1e1e1e',
        top: '#3a3a3a',
        list: '#2e2e2e',
        content: '#2c2c2c',
        tip: '#dddddd'
      }
    }
    return {
      type: 'light',
      side: '#f0f0f0',
      top: '#f5f5f5',
      list: '#f0f0f0',
      content: '#ffffff',
      tip: '#000000'
    }
  }
  if (globalTheme === 'custom' && customThemeColor) {
    const baseLuminance = getLuminance(customThemeColor)
    type = baseLuminance < 160 ? 'dark' : 'light'
    themeColor = customThemeColor
  } else {
    type = 'light'
    themeColor = '#ffffff'
  }

  if (type === 'dark') {
    return {
      type: 'dark',
      side: mixColors(themeColor, '#121212', 0.2),
      top: mixColors(themeColor, '#2a2a2a', 0.4),
      list: mixColors(themeColor, '#1e1e1e', 0.25),
      content: mixColors(themeColor, '#1a1a1a', 0.8),
      tip: adjustSaturation(mixColors(themeColor, '#cccccc', 0.85), 0.7)
    }
  }

  return {
    type: 'light',
    side: mixColors(themeColor, '#e8e8e8', 0.15),
    top: mixColors(themeColor, '#f5f5f5', 0.4),
    list: mixColors(themeColor, '#f0f0f0', 0.25),
    content: mixColors(themeColor, '#ffffff', 0.7),
    tip: mixColors(themeColor, '#444444', 0.7)
  }
}

/** 转为 URL 查询参数字符串（不含前导 ?），值为 hex 无 # */
export function skeletonThemeToQueryString(snapshot: SkeletonThemeSnapshot): string {
  const params = new URLSearchParams()
  params.set('theme', snapshot.type)
  params.set('side', snapshot.side.replace(/^#/, ''))
  params.set('top', snapshot.top.replace(/^#/, ''))
  params.set('list', snapshot.list.replace(/^#/, ''))
  params.set('content', snapshot.content.replace(/^#/, ''))
  params.set('tip', snapshot.tip.replace(/^#/, ''))
  return params.toString()
}
