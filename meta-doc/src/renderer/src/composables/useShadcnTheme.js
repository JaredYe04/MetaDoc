import { watch } from 'vue'
import tinycolor from 'tinycolor2'
import { themeState, mixColors } from '../utils/themes.js'

/**
 * Convert hex color to HSL string for CSS variables
 * @param {string} hex - Hex color code
 * @returns {string} HSL values as "H S% L%"
 */
function hexToHSL(hex) {
  const color = tinycolor(hex)
  const hsl = color.toHsl()
  return `${Math.round(hsl.h)} ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%`
}

/**
 * Get contrasting foreground color (black or white) for a background
 * @param {string} backgroundColor - Background hex color
 * @returns {string} Foreground color as HSL
 */
function getForegroundColor(backgroundColor) {
  const color = tinycolor(backgroundColor)
  const isLight = color.isLight()
  return isLight ? '0 0% 9%' : '0 0% 98%'
}

/**
 * Map themeState colors to shadcn-vue CSS variables
 * @param {Object} theme - Current theme object from themeState
 * @returns {Object} Mapped CSS variable values
 */
function mapThemeToCSSVariables(theme) {
  const isDark = theme.type === 'dark'

  // 计算 accent 颜色：混合 background2nd 和 textColor，与 activeBackgroundColor 逻辑一致
  const accentColor = mixColors(theme.background2nd || theme.background, theme.textColor, 0.3)

  return {
    // Background and foreground
    '--background': hexToHSL(theme.background),
    '--foreground': hexToHSL(theme.textColor),

    // Card colors - use secondary background
    '--card': hexToHSL(theme.background2nd || theme.background),
    '--card-foreground': hexToHSL(theme.textColor),

    // Popover - similar to card
    '--popover': hexToHSL(theme.background2nd || theme.background),
    '--popover-foreground': hexToHSL(theme.textColor),

    // Primary colors
    '--primary': hexToHSL(theme.primaryColor),
    '--primary-foreground': getForegroundColor(theme.primaryColor),

    // Secondary colors
    '--secondary': hexToHSL(theme.secondaryColor),
    '--secondary-foreground': getForegroundColor(theme.secondaryColor),

    // Muted - subtle background variation
    '--muted': hexToHSL(theme.sidebarBackground2 || theme.background2nd || theme.background),
    '--muted-foreground': hexToHSL(theme.textColor2 || theme.textColor),

    // Accent - 基于主题计算，与 activeBackgroundColor 逻辑一致
    '--accent': hexToHSL(accentColor),
    '--accent-foreground': getForegroundColor(accentColor),

    // Destructive - red tones
    '--destructive': isDark ? '0 62.8% 30.6%' : '0 84.2% 60.2%',
    '--destructive-foreground': '0 0% 98%',

    // Border and input
    '--border': hexToHSL(theme.borderColor),
    '--input': hexToHSL(theme.borderColor),
    '--ring': hexToHSL(theme.primaryColor),

    // Sidebar specific - use existing sidebar colors
    '--sidebar-background': hexToHSL(theme.sidebarBackground || theme.background),
    '--sidebar-foreground': hexToHSL(theme.SideTextColor || theme.textColor),
    '--sidebar-primary': hexToHSL(theme.primaryColor),
    '--sidebar-primary-foreground': getForegroundColor(theme.primaryColor),
    '--sidebar-accent': hexToHSL(
      theme.SideBackgroundColor || theme.sidebarBackground2 || theme.background
    ),
    '--sidebar-accent-foreground': hexToHSL(theme.SideActiveTextColor || theme.textColor),
    '--sidebar-border': hexToHSL(theme.borderColor),
    '--sidebar-ring': hexToHSL(theme.primaryColor)
  }
}

/**
 * Apply CSS variables to document root
 * @param {Object} variables - Object of CSS variable names and values
 */
function applyCSSVariables(variables) {
  const root = document.documentElement
  Object.entries(variables).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
}

/**
 * Initialize shadcn-vue theme bridge
 * Watches themeState and updates CSS variables automatically
 */
export function useShadcnTheme() {
  // Initial sync
  const initialVars = mapThemeToCSSVariables(themeState.currentTheme)
  applyCSSVariables(initialVars)

  // Watch for theme changes and sync CSS variables
  watch(
    () => themeState.currentTheme,
    (newTheme) => {
      const vars = mapThemeToCSSVariables(newTheme)
      applyCSSVariables(vars)
    },
    { deep: true, immediate: false }
  )

  return {
    refresh: () => {
      const vars = mapThemeToCSSVariables(themeState.currentTheme)
      applyCSSVariables(vars)
    }
  }
}

export default useShadcnTheme
