import { watch } from 'vue'
import { themeState, applyElementPlusTheme } from './themes.js'

/**
 * 将 HEX 颜色转换为 HSL 格式
 * @param {string} hex - HEX 颜色值 (如: #ff4500 或 #fff)
 * @returns {string} HSL 格式字符串 (如: "15 100% 50%")
 */
function hexToHsl(hex) {
  // 处理 3 位 hex (如 #fff)
  let normalizedHex = hex.replace(/^#/, '')
  if (normalizedHex.length === 3) {
    normalizedHex = normalizedHex
      .split('')
      .map((c) => c + c)
      .join('')
  }

  // 解析 RGB 值
  const r = parseInt(normalizedHex.substring(0, 2), 16) / 255
  const g = parseInt(normalizedHex.substring(2, 4), 16) / 255
  const b = parseInt(normalizedHex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h,
    s,
    l = (max + min) / 2

  if (max === min) {
    h = s = 0 // 灰色
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  // 转换为 CSS HSL 格式: "H S% L%"
  const hue = Math.round(h * 360)
  const saturation = Math.round(s * 100)
  const lightness = Math.round(l * 100)

  return `${hue} ${saturation}% ${lightness}%`
}

/**
 * 将主题颜色同步到 shadcn-vue CSS 变量
 * 根据 themeState 中的颜色更新 document.documentElement 的 CSS 自定义属性
 */
function applyShadcnTheme() {
  const root = document.documentElement
  const theme = themeState.currentTheme

  if (!theme) return

  // 颜色映射: themeState → shadcn CSS 变量
  const colorMappings = [
    { source: 'primaryColor', target: '--primary' },
    { source: 'background', target: '--background' },
    { source: 'textColor', target: '--foreground' },
    { source: 'background2nd', target: '--muted' },
    { source: 'borderColor', target: '--border' }
  ]

  colorMappings.forEach(({ source, target }) => {
    const colorValue = theme[source]
    if (colorValue && typeof colorValue === 'string' && colorValue.startsWith('#')) {
      try {
        const hslValue = hexToHsl(colorValue)
        root.style.setProperty(target, hslValue)
      } catch (error) {
        console.warn(`[shadcn-theme-bridge] 转换颜色失败: ${source} = ${colorValue}`, error)
      }
    }
  })

  applyElementPlusTheme()
}

/**
 * 初始化 shadcn 主题桥接
 * - 立即应用当前主题
 * - 监听 themeState 变化并自动更新
 */
export function syncShadcnTheme() {
  // 立即应用当前主题
  applyShadcnTheme()

  // 监听 themeState.currentTheme 的变化
  watch(
    () => themeState.currentTheme,
    () => {
      applyShadcnTheme()
    },
    { deep: true }
  )

  console.log('[shadcn-theme-bridge] 主题桥接已初始化')
}

export { hexToHsl }
