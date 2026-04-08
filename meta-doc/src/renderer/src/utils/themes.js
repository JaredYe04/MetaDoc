import { reactive } from 'vue'
// import AiLogo from "../assets/ai-logo.svg";
// import AiLogoWhite from "../assets/ai-logo-white.svg";

import AiLogo from '../assets/icons/ai-black.svg'
import AiLogoWhite from '../assets/icons/ai-white.svg'
import ToolBlack from '../assets/tool-black.svg'
import ToolWhite from '../assets/tool-white.svg'
// 菜单图标导入
import EditorIconBlack from '../assets/icons/editor-black.svg'
import EditorIconWhite from '../assets/icons/editor-white.svg'
import OutlineIconBlack from '../assets/icons/outline-black.svg'
import OutlineIconWhite from '../assets/icons/outline-white.svg'
import VisualIconBlack from '../assets/icons/visual-black.svg'
import VisualIconWhite from '../assets/icons/visual-white.svg'
import AgentIconBlack from '../assets/icons/agent-black.svg'
import AgentIconWhite from '../assets/icons/agent-white.svg'
import ProofreadIconBlack from '../assets/icons/proofread-black.svg'
import ProofreadIconWhite from '../assets/icons/proofread-white.svg'
import HomeIconBlack from '../assets/icons/home-black.svg'
import HomeIconWhite from '../assets/icons/home-white.svg'
// 文档图标导入
import MdDocIconBlack from '../assets/icons/md-doc-black.svg'
import MdDocIconWhite from '../assets/icons/md-doc-white.svg'
import TexDocIconBlack from '../assets/icons/tex-doc-black.svg'
import TexDocIconWhite from '../assets/icons/tex-doc-white.svg'
// 快速链接：Markdown/LaTeX 专用图标（非 doc icon）
import MdIconBlack from '../assets/icons/md-black.svg'
import MdIconWhite from '../assets/icons/md-white.svg'
import TexIconBlack from '../assets/icons/tex-black.svg'
import TexIconWhite from '../assets/icons/tex-white.svg'
import BaseDocIconBlack from '../assets/icons/base-doc-black.svg'
import BaseDocIconWhite from '../assets/icons/base-doc-white.svg'
// 工作区图标导入
import RefreshIconBlack from '../assets/icons/refresh-black.svg'
import RefreshIconWhite from '../assets/icons/refresh-white.svg'
import FolderAddIconBlack from '../assets/icons/folder-add-black.svg'
import FolderAddIconWhite from '../assets/icons/folder-add-white.svg'
// 菜单图标导入（新增）
import SettingIconBlack from '../assets/icons/setting-black.svg'
import SettingIconWhite from '../assets/icons/setting-white.svg'
import RecentIconBlack from '../assets/icons/recent-black.svg'
import RecentIconWhite from '../assets/icons/recent-white.svg'
import KnowledgeIconBlack from '../assets/icons/knowledge-black.svg'
import KnowledgeIconWhite from '../assets/icons/knowledge-white.svg'
import FolderIconBlack from '../assets/icons/folder-black.svg'
import FolderIconWhite from '../assets/icons/folder-white.svg'
import DebugIconBlack from '../assets/icons/debug-black.svg'
import DebugIconWhite from '../assets/icons/debug-white.svg'
import MoreIconBlack from '../assets/icons/more-black.svg'
import MoreIconWhite from '../assets/icons/more-white.svg'
import LanguageIconBlack from '../assets/icons/language-black.svg'
import LanguageIconWhite from '../assets/icons/language-white.svg'
import FileIconBlack from '../assets/icons/file-black.svg'
import FileIconWhite from '../assets/icons/file-white.svg'
import MetaIconBlack from '../assets/icons/meta-black.svg'
import MetaIconWhite from '../assets/icons/meta-white.svg'
import PenAiIconBlack from '../assets/icons/pen-ai-black.svg'
import PenAiIconWhite from '../assets/icons/pen-ai-white.svg'
import FeedbackIconBlack from '../assets/icons/feedback-black.svg'
import FeedbackIconWhite from '../assets/icons/feedback-white.svg'
import SearchIconBlack from '../assets/icons/search-black.svg'
import SearchIconWhite from '../assets/icons/search-white.svg'
import ReplaceAllIconBlack from '../assets/icons/replace-all-black.svg'
import ReplaceAllIconWhite from '../assets/icons/replace-all-white.svg'
// 窗口控制图标（标题栏最小化/最大化/还原）
import MinimizeIconBlack from '../assets/icons/minimize-black.svg'
import MinimizeIconWhite from '../assets/icons/minimize-white.svg'
import MaximizeIconBlack from '../assets/icons/maximize-black.svg'
import MaximizeIconWhite from '../assets/icons/maximize-white.svg'
import RestoreIconBlack from '../assets/icons/restore-black.svg'
import RestoreIconWhite from '../assets/icons/restore-white.svg'
// 专注模式（标签栏 minimap 开关）
import MinimapOffBlack from '../assets/icons/minimap-off-black.svg'
import MinimapOffWhite from '../assets/icons/minimap-off-white.svg'
import MinimapOnBlack from '../assets/icons/minimap-on-black.svg'
import MinimapOnWhite from '../assets/icons/minimap-on-white.svg'
// 专注模式顶栏按钮（未开启 / 已开启）
import WorkOffBlack from '../assets/icons/work-black.svg'
import WorkOffWhite from '../assets/icons/work-white.svg'
import WorkOnBlack from '../assets/icons/work-on-black.svg'
import WorkOnWhite from '../assets/icons/work-on-white.svg'
// PDF查看模式图标导入
import CursorIconBlack from '../assets/icons/cursor-black.svg'
import CursorIconWhite from '../assets/icons/cursor-white.svg'
import HandIconBlack from '../assets/icons/hand-black.svg'
import HandIconWhite from '../assets/icons/hand-white.svg'
// 公式识别画布工具图标
import BrushIconBlack from '../assets/icons/brush-black.svg'
import BrushIconWhite from '../assets/icons/brush-white.svg'
import EraserIconBlack from '../assets/icons/eraser-black.svg'
import EraserIconWhite from '../assets/icons/eraser-white.svg'
import UndoIconBlack from '../assets/icons/undo-black.svg'
import UndoIconWhite from '../assets/icons/undo-white.svg'
import RedoIconBlack from '../assets/icons/redo-black.svg'
import RedoIconWhite from '../assets/icons/redo-white.svg'
import ClearIconBlack from '../assets/icons/clear-black.svg'
import ClearIconWhite from '../assets/icons/clear-white.svg'
import MathIconBlack from '../assets/icons/math-black.svg'
import MathIconWhite from '../assets/icons/math-white.svg'
// AI 工具按钮图标（写作/分支）
import WriteIconBlack from '../assets/icons/write-black.svg'
import WriteIconWhite from '../assets/icons/write-white.svg'
import MultiWriteIconBlack from '../assets/icons/multi-write-black.svg'
import MultiWriteIconWhite from '../assets/icons/multi-write-white.svg'
import BranchIconBlack from '../assets/icons/branch-black.svg'
import BranchIconWhite from '../assets/icons/branch-white.svg'
import MultiBranchIconBlack from '../assets/icons/multi-branch-black.svg'
import MultiBranchIconWhite from '../assets/icons/multi-branch-white.svg'
import FormatIconBlack from '../assets/icons/format-black.svg'
import FormatIconWhite from '../assets/icons/format-white.svg'
import DeleteIconBlack from '../assets/icons/delete-black.svg'
import DeleteIconWhite from '../assets/icons/delete-white.svg'
// Logo icons
// theme.js
export const contentThemes = [
  { label: 'Ant Design', value: 'ant-design' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'WeChat', value: 'wechat' }
]

export const codeThemes = [
  'abap',
  'algol',
  'algol_nu',
  'arduino',
  'autumn',
  'borland',
  'bw',
  'colorful',
  'dracula',
  'emacs',
  'friendly',
  'fruity',
  'github',
  'igor',
  'lovelace',
  'manni',
  'monokai',
  'monokailight',
  'murphy',
  'native',
  'paraiso-dark',
  'paraiso-light',
  'pastie',
  'perldoc',
  'pygments',
  'rainbow_dash',
  'rrt',
  'solarized-dark',
  'solarized-dark256',
  'solarized-light',
  'swapoff',
  'tango',
  'trac',
  'vim',
  'vs',
  'xcode'
]

import tinycolor from 'tinycolor2'
// 辅助函数：HEX转RGB
const hexToRgb = (hex) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
  hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b)
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 0, g: 0, b: 0 }
}

// 辅助函数：RGB转HEX
const rgbToHex = (r, g, b) => {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
      })
      .join('')
  )
}

// 辅助函数：混合两种颜色
export const mixColors = (color1, color2, weight) => {
  const safeColor1 = color1 || '#ffffff'
  const safeColor2 = color2 || '#000000'

  const c1 = hexToRgb(safeColor1)
  const c2 = hexToRgb(safeColor2)

  const r = Math.round(c1.r * (1 - weight) + c2.r * weight)
  const g = Math.round(c1.g * (1 - weight) + c2.g * weight)
  const b = Math.round(c1.b * (1 - weight) + c2.b * weight)

  return rgbToHex(r, g, b)
}

// Logo 固定配色，不随亮/暗主题变化，保证品牌一致
export const FIXED_LOGO_COLORS = {
  bgColor: '#e8e8e8',
  symbolColor: '#333333'
}

// Helper: Generate logo colors using HSL for vibrant results (保留供其他需要主题联动处使用)
// Preserves saturation while adjusting lightness for contrast
export const generateLogoColors = (primaryColor, isDark) => {
  const baseColor = tinycolor(primaryColor || '#000000')

  if (!baseColor.isValid()) {
    return {
      bgColor: isDark ? '#1a1a1a' : '#f0f0f0',
      symbolColor: isDark ? '#ffffff' : '#000000'
    }
  }

  const hsl = baseColor.toHsl()

  if (isDark) {
    // Dark mode: Rich, saturated background with bright symbol
    return {
      // Background: Deep but saturated (keep hue/sat, lower lightness)
      bgColor: tinycolor({
        h: hsl.h,
        s: Math.min(1, hsl.s * 1.2), // Slightly boost saturation
        l: 0.15 // Deep but not black
      }).toHexString(),
      // Symbol: Vibrant but lighter for contrast
      symbolColor: tinycolor({
        h: hsl.h,
        s: Math.min(1, hsl.s * 0.9),
        l: 0.75 // Bright but not white
      }).toHexString()
    }
  } else {
    // Light mode: Soft tinted background with rich symbol
    return {
      // Background: Very light tint of the theme color
      bgColor: tinycolor({
        h: hsl.h,
        s: Math.min(0.6, hsl.s * 0.4), // Low saturation for subtlety
        l: 0.94 // Very light
      }).toHexString(),
      // Symbol: Full saturation theme color
      symbolColor: tinycolor({
        h: hsl.h,
        s: Math.min(1, hsl.s * 1.1),
        l: Math.max(0.25, Math.min(0.45, hsl.l)) // Rich but readable
      }).toHexString()
    }
  }
}

// 辅助函数：计算颜色亮度（0-255），线性值，仅用于混色等
const getLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 判断颜色在视觉上属于深色还是浅色（用于主题模式判定）
 * 使用 WCAG 相对亮度（sRGB 伽马校正），阈值 0.5 对应感知上的明暗中点
 * @param {string} color - 任意 CSS 颜色（hex、rgb、hsl 等）
 * @returns {boolean} true 表示深色，false 表示浅色
 */
export function isColorDark(color) {
  if (!color || typeof color !== 'string') return false
  const tc = tinycolor(color)
  if (!tc.isValid()) return false
  // getLuminance() 返回 0–1 的 WCAG 相对亮度（含 sRGB 线性化）
  const relativeLuminance = tc.getLuminance()
  return relativeLuminance < 0.5
}

// 辅助函数：调整颜色饱和度
const adjustSaturation = (hex, factor) => {
  const { r, g, b } = hexToRgb(hex)
  const avg = (r + g + b) / 3

  const adjust = (c) => {
    const diff = c - avg
    return Math.round(avg + diff * factor)
  }

  return rgbToHex(
    Math.min(255, Math.max(0, adjust(r))),
    Math.min(255, Math.max(0, adjust(g))),
    Math.min(255, Math.max(0, adjust(b)))
  )
}

// 辅助函数：将颜色转换为带透明度的版本
export const colorWithOpacity = (color, opacity) => {
  // 如果是 hex 颜色（如 #ffffff 或 #fff）
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    // 处理 3 位 hex（如 #fff）
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    // 确保是 6 位 hex
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${opacity})`
    }
  }
  // 如果是 rgb 或 rgba 颜色
  if (color.startsWith('rgb')) {
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      const [, r, g, b] = match
      return `rgba(${r}, ${g}, ${b}, ${opacity})`
    }
  }
  // 其他情况直接返回原颜色
  return color
}

/**
 * 根据亮暗色模式选择图标的辅助函数
 * @param {boolean} isDarkMode - 是否为暗色模式
 * @param {Object} iconPair - 包含 light 和 dark 属性的图标对象
 * @returns {string} 返回对应模式的图标路径
 */
const selectIconByTheme = (isDarkMode, iconPair) => {
  return isDarkMode ? iconPair.dark : iconPair.light
}

/**
 * 生成主题相关的图标集合
 * @param {boolean} isDarkMode - 是否为暗色模式
 * @returns {Object} 包含所有主题图标的对象
 */
const generateThemeIcons = (isDarkMode) => {
  return {
    AiLogo: selectIconByTheme(isDarkMode, { light: AiLogo, dark: AiLogoWhite }),
    ToolLogo: selectIconByTheme(isDarkMode, { light: ToolBlack, dark: ToolWhite }),
    HomeIcon: selectIconByTheme(isDarkMode, { light: HomeIconBlack, dark: HomeIconWhite }),
    EditorIcon: selectIconByTheme(isDarkMode, { light: EditorIconBlack, dark: EditorIconWhite }),
    OutlineIcon: selectIconByTheme(isDarkMode, { light: OutlineIconBlack, dark: OutlineIconWhite }),
    VisualIcon: selectIconByTheme(isDarkMode, { light: VisualIconBlack, dark: VisualIconWhite }),
    AgentIcon: selectIconByTheme(isDarkMode, { light: AgentIconBlack, dark: AgentIconWhite }),
    ProofreadIcon: selectIconByTheme(isDarkMode, {
      light: ProofreadIconBlack,
      dark: ProofreadIconWhite
    }),
    MdDocIcon: selectIconByTheme(isDarkMode, { light: MdDocIconBlack, dark: MdDocIconWhite }),
    TexDocIcon: selectIconByTheme(isDarkMode, { light: TexDocIconBlack, dark: TexDocIconWhite }),
    MdIcon: selectIconByTheme(isDarkMode, { light: MdIconBlack, dark: MdIconWhite }),
    TexIcon: selectIconByTheme(isDarkMode, { light: TexIconBlack, dark: TexIconWhite }),
    BaseDocIcon: selectIconByTheme(isDarkMode, { light: BaseDocIconBlack, dark: BaseDocIconWhite }),
    RefreshIcon: selectIconByTheme(isDarkMode, { light: RefreshIconBlack, dark: RefreshIconWhite }),
    FolderAddIcon: selectIconByTheme(isDarkMode, {
      light: FolderAddIconBlack,
      dark: FolderAddIconWhite
    }),
    SettingIcon: selectIconByTheme(isDarkMode, { light: SettingIconBlack, dark: SettingIconWhite }),
    RecentIcon: selectIconByTheme(isDarkMode, { light: RecentIconBlack, dark: RecentIconWhite }),
    KnowledgeIcon: selectIconByTheme(isDarkMode, {
      light: KnowledgeIconBlack,
      dark: KnowledgeIconWhite
    }),
    FolderIcon: selectIconByTheme(isDarkMode, { light: FolderIconBlack, dark: FolderIconWhite }),
    DebugIcon: selectIconByTheme(isDarkMode, { light: DebugIconBlack, dark: DebugIconWhite }),
    MoreIcon: selectIconByTheme(isDarkMode, { light: MoreIconBlack, dark: MoreIconWhite }),
    LanguageIcon: selectIconByTheme(isDarkMode, {
      light: LanguageIconBlack,
      dark: LanguageIconWhite
    }),
    FileIcon: selectIconByTheme(isDarkMode, { light: FileIconBlack, dark: FileIconWhite }),
    MetaIcon: selectIconByTheme(isDarkMode, { light: MetaIconBlack, dark: MetaIconWhite }),
    CursorIcon: selectIconByTheme(isDarkMode, { light: CursorIconBlack, dark: CursorIconWhite }),
    HandIcon: selectIconByTheme(isDarkMode, { light: HandIconBlack, dark: HandIconWhite }),
    PenAiIcon: selectIconByTheme(isDarkMode, { light: PenAiIconBlack, dark: PenAiIconWhite }),
    BrushIcon: selectIconByTheme(isDarkMode, { light: BrushIconBlack, dark: BrushIconWhite }),
    EraserIcon: selectIconByTheme(isDarkMode, { light: EraserIconBlack, dark: EraserIconWhite }),
    UndoIcon: selectIconByTheme(isDarkMode, { light: UndoIconBlack, dark: UndoIconWhite }),
    RedoIcon: selectIconByTheme(isDarkMode, { light: RedoIconBlack, dark: RedoIconWhite }),
    ClearIcon: selectIconByTheme(isDarkMode, { light: ClearIconBlack, dark: ClearIconWhite }),
    FeedbackIcon: selectIconByTheme(isDarkMode, {
      light: FeedbackIconBlack,
      dark: FeedbackIconWhite
    }),
    MinimizeIcon: selectIconByTheme(isDarkMode, {
      light: MinimizeIconBlack,
      dark: MinimizeIconWhite
    }),
    MaximizeIcon: selectIconByTheme(isDarkMode, {
      light: MaximizeIconBlack,
      dark: MaximizeIconWhite
    }),
    RestoreIcon: selectIconByTheme(isDarkMode, { light: RestoreIconBlack, dark: RestoreIconWhite }),
    MinimapOffIcon: selectIconByTheme(isDarkMode, {
      light: MinimapOffBlack,
      dark: MinimapOffWhite
    }),
    MinimapOnIcon: selectIconByTheme(isDarkMode, {
      light: MinimapOnBlack,
      dark: MinimapOnWhite
    }),
    WorkOffIcon: selectIconByTheme(isDarkMode, {
      light: WorkOffBlack,
      dark: WorkOffWhite
    }),
    WorkOnIcon: selectIconByTheme(isDarkMode, {
      light: WorkOnBlack,
      dark: WorkOnWhite
    }),
    MathIcon: selectIconByTheme(isDarkMode, { light: MathIconBlack, dark: MathIconWhite }),
    WriteIcon: selectIconByTheme(isDarkMode, { light: WriteIconBlack, dark: WriteIconWhite }),
    MultiWriteIcon: selectIconByTheme(isDarkMode, {
      light: MultiWriteIconBlack,
      dark: MultiWriteIconWhite
    }),
    BranchIcon: selectIconByTheme(isDarkMode, { light: BranchIconBlack, dark: BranchIconWhite }),
    MultiBranchIcon: selectIconByTheme(isDarkMode, {
      light: MultiBranchIconBlack,
      dark: MultiBranchIconWhite
    }),
    FormatIcon: selectIconByTheme(isDarkMode, { light: FormatIconBlack, dark: FormatIconWhite }),
    SearchIcon: selectIconByTheme(isDarkMode, { light: SearchIconBlack, dark: SearchIconWhite }),
    ReplaceAllIcon: selectIconByTheme(isDarkMode, {
      light: ReplaceAllIconBlack,
      dark: ReplaceAllIconWhite
    }),
    DeleteIcon: selectIconByTheme(isDarkMode, {
      light: DeleteIconBlack,
      dark: DeleteIconWhite
    })
  }
}

// 主函数：生成自定义主题
// themeColor: 主题色
// overrides: 可选的覆盖对象，用于覆盖某些颜色值（主要用于保持 lightTheme 和 darkTheme 的原始值）
export const customTheme = (themeColor = '#000000', overrides = {}) => {
  // 确定主题模式：使用 WCAG 相对亮度（感知亮度）判断深/浅色，阈值 0.5
  const isDarkMode = isColorDark(themeColor)

  // 核心颜色生成算法
  const generateColorSet = () => {
    if (isDarkMode) {
      // 暗色模式配色方案
      const baseColors = {
        background: mixColors(themeColor, '#1a1a1a', 0.8),
        background2nd: mixColors(themeColor, '#2a2a2a', 0.85),
        textColor: adjustSaturation(mixColors(themeColor, '#ffffff', 0.9), 0.8),
        textColor2: adjustSaturation(mixColors(themeColor, '#cccccc', 0.85), 0.7),
        headerBackground: mixColors(themeColor, '#2a2a2a', 0.4),
        sidebarBackground: mixColors(themeColor, '#121212', 0.2),
        sidebarBackground2: mixColors(themeColor, '#1e1e1e', 0.25),
        SideBackgroundColor: adjustSaturation(mixColors(themeColor, '#2a2a2a', 0.6), 0.8),
        SideTextColor: mixColors(themeColor, '#ffffff', 0.9),
        SideActiveTextColor: '#e0e0e0',
        SideTextColor2: '#b0b0b0',
        editorPanelBackgroundColor: mixColors(themeColor, '#1a1a1a', 0.8),
        editorToolbarBackgroundColor: mixColors(themeColor, '#0d0d0d', 0.9),
        editorTextareaBackgroundColor: mixColors(themeColor, '#1a1a1a', 0.8),
        vditorTheme: 'dark',
        codeTheme: 'a11y-dark',
        titleMenuBackground: mixColors(themeColor, '#000000', 0.15) + 'AA',
        outlineBackground: mixColors(themeColor, '#7f7f7f', 0.4),
        outlineNode: mixColors(themeColor, '#4a4a4a', 0.6),
        quickStartBackground1: mixColors(themeColor, '#330000', 0.3) + '22',
        quickStartBackground2: mixColors(themeColor, '#000033', 0.3) + '22',
        mdeditorClass: 'md-editor-dark',
        mdeditorTheme: 'dark',
        // 新增配色项：暗色模式统一灰度，不使用主题色避免黄/粉等色调
        borderColor: mixColors(themeColor, '#404040', 0.5),
        codeColor: adjustSaturation(mixColors(themeColor, '#e0e0e0', 0.8), 0.9),
        primaryColor: '#e0e0e0',
        secondaryColor: '#909090',
        // 引用标签颜色（灰度，与界面黑白灰一致）
        referenceActiveBg: mixColors(themeColor, '#5a5a5a', 0.7),
        referenceActiveText: '#ffffff',
        referenceInactiveBg: mixColors(themeColor, '#3a3a3a', 0.7),
        referenceInactiveText: adjustSaturation(mixColors(themeColor, '#cccccc', 0.85), 0.7),
        // 引用容器边框颜色
        referenceContainerBorderColor: mixColors(themeColor, '#404040', 0.5),
        // 左侧菜单 + 视图侧栏 + 面板统一背景（与 background2nd 一致，略浅）
        sidebarPanelBackground: mixColors(themeColor, '#2a2a2a', 0.85),
        themeColor: themeColor
      }
      // 应用覆盖值
      return { ...baseColors, ...overrides }
    } else {
      // 亮色模式配色方案
      const baseColors = {
        background: mixColors(themeColor, '#ffffff', 0.7),
        background2nd: mixColors(themeColor, '#f8f8f8', 0.75),
        textColor: mixColors(themeColor, '#222222', 0.8),
        textColor2: mixColors(themeColor, '#444444', 0.7),
        headerBackground: mixColors(themeColor, '#f5f5f5', 0.4),
        sidebarBackground: mixColors(themeColor, '#e8e8e8', 0.15),
        sidebarBackground2: mixColors(themeColor, '#f0f0f0', 0.25),
        SideBackgroundColor: mixColors(themeColor, '#f5f5f5', 0.5),
        SideTextColor: mixColors(themeColor, '#333333', 0.9),
        SideActiveTextColor: mixColors(themeColor, '#333333', 0.95),
        SideTextColor2: mixColors(themeColor, '#555555', 0.8),
        editorPanelBackgroundColor: mixColors(themeColor, '#ffffff', 0.7),
        editorToolbarBackgroundColor: mixColors(themeColor, '#f6f8fa', 0.7),
        editorTextareaBackgroundColor: mixColors(themeColor, '#fafbfc', 0.7),
        vditorTheme: 'classic',
        codeTheme: 'github',
        titleMenuBackground: 'rgba(255, 255, 255, 0.85)',
        outlineBackground: mixColors(themeColor, '#d0d0d0', 0.3),
        outlineNode: mixColors(themeColor, '#e8e8e8', 0.4),
        quickStartBackground1: mixColors(themeColor, '#e6f7ff', 0.4) + '33',
        quickStartBackground2: mixColors(themeColor, '#f0f7ff', 0.4) + '33',
        mdeditorClass: 'md-editor',
        mdeditorTheme: 'light',
        // 新增配色项：亮色模式也以灰度为主，主色/次要色不用主题色
        borderColor: mixColors(themeColor, '#e0e0e0', 0.5),
        codeColor: adjustSaturation(mixColors(themeColor, '#333333', 0.8), 0.9),
        primaryColor: '#000000',
        secondaryColor: '#666666',
        // 引用标签颜色（灰度，与界面黑白灰一致）
        referenceActiveBg: mixColors(themeColor, '#555555', 0.6),
        referenceActiveText: '#ffffff',
        referenceInactiveBg: mixColors(themeColor, '#f5f5f5', 0.8),
        referenceInactiveText: adjustSaturation(mixColors(themeColor, '#666666', 0.7), 0.8),
        // 引用容器边框颜色
        referenceContainerBorderColor: mixColors(themeColor, '#e0e0e0', 0.5),
        // 左侧菜单 + 视图侧栏 + 面板统一背景（浅色下柔和略深，避免纯白）
        sidebarPanelBackground: mixColors(themeColor, '#ebebeb', 0.25),
        themeColor: themeColor
      }
      // 应用覆盖值
      return { ...baseColors, ...overrides }
    }
  }

  const colorSet = generateColorSet()
  const themeIcons = generateThemeIcons(isDarkMode)

  return {
    type: isDarkMode ? 'dark' : 'light',
    ...themeIcons,
    ...colorSet
  }
}

// 浅色主题：使用白色作为主题色，通过 customTheme 生成，但使用 overrides 保持原始颜色值
export const lightTheme = customTheme('#ffffff', {
  background: '#ffffff',
  background2nd: '#f5f5f5',
  textColor: '#000000',
  textColor2: '#000000',
  headerBackground: '#f5f5f5',
  sidebarBackground: '#f0f0f0',
  sidebarBackground2: '#f0f0f0',
  SideBackgroundColor: '#FEFEFE',
  SideTextColor: '#000000',
  SideTextColor2: '#000000',
  SideActiveTextColor: '#000000',
  editorPanelBackgroundColor: '#fff',
  editorToolbarBackgroundColor: '#f6f8fa',
  editorTextareaBackgroundColor: '#fafbfc',
  vditorTheme: 'classic',
  codeTheme: 'github',
  titleMenuBackground: 'rgba(255, 255, 255, 0.85)',
  outlineBackground: '#4c78a8',
  outlineNode: '#9ecae9',
  quickStartBackground1: '#ADD8E61A',
  quickStartBackground2: '#D6D6FF44',
  mdeditorClass: 'md-editor',
  mdeditorTheme: 'light',
  // 新增配色项：基于原始主题的合理值
  borderColor: '#e0e0e0',
  codeColor: '#333333',
  primaryColor: '#000000',
  secondaryColor: '#666666',
  // 左侧菜单 + 视图侧栏 + 面板统一背景（浅色下柔和、略深于 #f0f0f0）
  sidebarPanelBackground: '#ebebeb',
  // 引用标签颜色（黑白灰）
  referenceActiveBg: '#555555',
  referenceActiveText: '#ffffff',
  referenceInactiveBg: '#f5f5f5',
  referenceInactiveText: '#666666',
  // 引用容器边框颜色
  referenceContainerBorderColor: '#e0e0e0',
  ...generateThemeIcons(false),
  themeColor: '#ffffff'
})

// 深色主题：使用深灰色作为主题色，通过 customTheme 生成，但使用 overrides 保持原始颜色值
export const darkTheme = customTheme('#2c2c2c', {
  background: '#2c2c2c', //背景色1，需要体现主题色，但不能过于突出，应当还是以偏黑或偏白为主
  background2nd: '#3a3a3a', //背景色2，次要背景色，可以是背景色1的变体或浅色调
  textColor: '#ffffff', //文字颜色1，主要文字颜色，应当与背景色形成对比
  textColor2: '#dddddd', //文字颜色2，次要文字颜色，可以是文字颜色1的变体或浅色调
  headerBackground: '#3a3a3a', //顶部栏背景色，与背景色2一致
  sidebarBackground: '#1e1e1e', //设置界面侧边栏背景色，比背景色1更深，形成层次感
  sidebarBackground2: '#2e2e2e', //设置界面侧边栏次要背景色，可以是侧边栏背景色的变体或浅色调
  SideBackgroundColor: '#545c64', //主界面侧边栏背景色，应当是主题色的变体或深色调
  SideTextColor: '#fff', //侧边栏文字颜色，与文字颜色1一致
  SideActiveTextColor: '#e0e0e0', //侧边栏激活状态文字颜色，灰度与背景形成对比
  SideTextColor2: '#b0b0b0', //侧边栏次要文字颜色，灰度
  editorPanelBackgroundColor: '#24292e', //编辑器面板背景色，应当是主题色的变体或深色调
  editorToolbarBackgroundColor: '#1d2125', //编辑器工具栏背景色，应当是主题色的变体或浅色调
  editorTextareaBackgroundColor: '#2f363d', //编辑器文本区域背景色，应当是主题色的变体或浅色调
  vditorTheme: 'dark', //亮色版为'classic'，固定
  codeTheme: 'a11y-dark', //亮色版为'github'，固定
  titleMenuBackground: '#111111AA', //AI章节标题菜单背景色，直接使用主题色，透明度固定为AA
  outlineBackground: '#978882', //大纲背景色，应当与背景色形成对比，但是不能过于突出，建议使用主题色的变体或浅色调
  outlineNode: '#79706e', //大纲节点颜色，要和背景色形成对比，建议使用主题色的变体或深色调
  quickStartBackground1: '#66333311', //快速开始背景色1，建议使用主题色的变体或浅色调
  quickStartBackground2: '#33336611', //快速开始背景色2，在背景色1的基础上进行色彩偏移，与背景色1形成对比
  mdeditorClass: 'md-editor-dark', //暗色为'mc-editor-dark'，浅色版为'md-editor'
  mdeditorTheme: 'dark', //暗色版为'dark'，浅色版为'light'
  // 新增配色项：黑白灰灰度，不作为彩色强调
  borderColor: '#404040',
  codeColor: '#e0e0e0',
  primaryColor: '#e0e0e0', // 按钮/开关等主色用浅灰，保持灰度
  secondaryColor: '#909090', // 次要色用中灰
  // 左侧菜单 + 视图侧栏 + 面板统一背景（与原来一致且略浅，用 background2nd）
  sidebarPanelBackground: '#3a3a3a',
  // 引用标签颜色（黑白灰）
  referenceActiveBg: '#5a5a5a',
  referenceActiveText: '#ffffff',
  referenceInactiveBg: '#3a3a3a',
  referenceInactiveText: '#cccccc',
  // 引用容器边框颜色
  referenceContainerBorderColor: '#404040',
  ...generateThemeIcons(true),
  themeColor: '#2c2c2c'
})

export const predefineColors = [
  '#ff4500',
  '#ff8c00',
  '#ffd700',
  '#90ee90',
  '#00ced1',
  '#1e90ff',
  '#c71585',
  'rgb(255, 69, 0)',
  'rgb(255, 120, 0)',
  'hsv(51, 100, 98)',
  'hsv(120, 40, 94)',
  'hsl(181, 100%, 37%)',
  'hsl(209, 100%, 56%)',
  '#c71585'
]

// 预设主题配置
export const presetThemes = [
  // 原色系
  { color: '#ff4500', nameKey: 'presetThemeCoralRed' }, // 珊瑚红
  { color: '#ff8c00', nameKey: 'presetThemeGoldenOrange' }, // 金橙色
  { color: '#ffd700', nameKey: 'presetThemeLemonYellow' }, // 柠檬黄
  { color: '#90ee90', nameKey: 'presetThemeMintGreen' }, // 薄荷绿
  { color: '#00ced1', nameKey: 'presetThemeLakeBlue' }, // 湖水蓝
  { color: '#1e90ff', nameKey: 'presetThemeSkyBlue' }, // 天空蓝
  { color: '#c71585', nameKey: 'presetThemeRosePurple' }, // 玫瑰紫
  // 浅色系
  { color: '#777777', nameKey: 'presetThemeSpaceGray' }, // 太空灰
  { color: '#ffe0e0', nameKey: 'presetThemeLightRed' }, // 浅红色
  { color: '#ffe4b5', nameKey: 'presetThemeLightOrange' }, // 浅橙色
  { color: '#fffacd', nameKey: 'presetThemeLightYellow' }, // 浅黄色
  { color: '#e0ffe0', nameKey: 'presetThemeLightGreen' }, // 浅绿色
  { color: '#e0ffff', nameKey: 'presetThemeLightCyan' }, // 浅青色
  { color: '#e0f0ff', nameKey: 'presetThemeLightBlue' }, // 浅蓝色
  { color: '#f0e0ff', nameKey: 'presetThemeLightPurple' }, // 浅紫色
  { color: '#fafafa', nameKey: 'presetThemeOffWhite' } // 米白色
]

export const themeState = reactive({
  currentTheme: lightTheme
})

/**
 * Vditor 预览内容区样式（dist/css/content-theme/*.css），与工具栏 theme `classic`/`dark` 不是同一套。
 * 参见 Vditor 文档：https://ld246.com/article/1549638745630
 */
export const VDITOR_CONTENT_THEME_IDS = ['dark', 'light', 'ant-design', 'wechat']

/**
 * 将设置里的 contentTheme（含 auto）解析为有效的 Vditor 内容区主题 id。
 * 错误地把 `classic` 当作内容主题会导致请求不存在的 classic.css，预览与代码块样式异常。
 */
export function resolveVditorContentThemeSettingValue(settingValue) {
  const ts = themeState.currentTheme
  if (settingValue === 'auto' || settingValue == null || settingValue === '') {
    return ts.vditorTheme === 'dark' ? 'dark' : 'light'
  }
  if (settingValue === 'classic') {
    return 'light'
  }
  if (VDITOR_CONTENT_THEME_IDS.includes(settingValue)) {
    return settingValue
  }
  return ts.vditorTheme === 'dark' ? 'dark' : 'light'
}

/** 将设置里的 codeTheme（含 auto）解析为 Vditor hljs 样式名（styles/*.min.css） */
export function resolveVditorCodeThemeSettingValue(settingValue) {
  const ts = themeState.currentTheme
  if (settingValue === 'auto' || settingValue == null || settingValue === '') {
    return ts.codeTheme
  }
  return settingValue
}

// 获取系统主题信息的辅助函数（通过 messageBridge）
async function getOsThemeInfo() {
  try {
    const bridge = (await import('../bridge/message-bridge')).default
    if (bridge.getIpc()?.invoke) {
      return await bridge.invoke('get-os-theme-info')
    }
    // Web 环境
    const mode =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    return { mode, accentColor: undefined }
  } catch (e) {
    console.error('获取系统主题信息失败:', e)
    return { mode: 'light', accentColor: undefined }
  }
}

// 应用主题类到 document（供首屏快速应用默认主题，不阻塞 mount）
export function applyThemeClasses(themeType) {
  if (themeType === 'light') {
    document.documentElement.classList.add('light')
    document.documentElement.classList.remove('dark')
  } else {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  }
}

// 辅助函数：HEX转HSL
function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex)
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  let h,
    s,
    l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
        break
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6
        break
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6
        break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

// 辅助函数：将颜色转换为HSL CSS变量格式
function colorToHslString(color) {
  if (!color) return null
  // 如果是 hex 颜色
  if (color.startsWith('#')) {
    const hsl = hexToHsl(color)
    return `${hsl.h} ${hsl.s}% ${hsl.l}%`
  }
  // 如果是 rgb/rgba 颜色，先转成 hex
  if (color.startsWith('rgb')) {
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      const [, r, g, b] = match
      const hex = rgbToHex(parseInt(r), parseInt(g), parseInt(b))
      const hsl = hexToHsl(hex)
      return `${hsl.h} ${hsl.s}% ${hsl.l}%`
    }
  }
  return null
}

/**
 * 将 themeState 的颜色值同步到 shadcn CSS 变量
 */
export function applyShadcnTheme() {
  const root = document.documentElement
  const theme = themeState.currentTheme

  if (!theme) return

  const isDarkMode = theme.type === 'dark'

  // 辅助函数：获取HSL值
  const getHsl = (colorKey) => {
    const colorValue = theme[colorKey]
    if (colorValue && typeof colorValue === 'string') {
      return colorToHslString(colorValue)
    }
    return null
  }

  // 基础颜色映射
  const background = getHsl('background') || (isDarkMode ? '222.2 84% 4.9%' : '0 0% 100%')
  const foreground = getHsl('textColor') || (isDarkMode ? '210 40% 98%' : '222.2 84% 4.9%')
  const primary = getHsl('primaryColor') || (isDarkMode ? '210 40% 98%' : '222.2 47.4% 11.2%')
  const secondary = getHsl('secondaryColor') || (isDarkMode ? '217.2 32.6% 17.5%' : '210 40% 96.1%')
  // muted 使用中性灰，避免自定义主题色时与主题色趋同（深色与黑灰混深，浅色与白灰混浅）
  const muted = isDarkMode ? '217.2 32.6% 17.5%' : '210 40% 96.1%'
  const mutedForeground = isDarkMode ? '215 20.2% 65.1%' : '215.4 16.3% 46.9%'
  const border = getHsl('borderColor') || (isDarkMode ? '217.2 32.6% 17.5%' : '214.3 31.8% 91.4%')
  const sidebarBg = getHsl('sidebarBackground') || (isDarkMode ? '240 5.9% 10%' : '0 0% 98%')

  // 设置所有 shadcn CSS 变量
  const shadcnVars = {
    // 基础
    '--background': background,
    '--foreground': foreground,

    // 卡片
    '--card': background,
    '--card-foreground': foreground,

    // 弹出层
    '--popover': background,
    '--popover-foreground': foreground,

    // 主题色
    '--primary': primary,
    '--primary-foreground': isDarkMode ? '222.2 47.4% 11.2%' : '210 40% 98%',

    // 次要色
    '--secondary': secondary,
    '--secondary-foreground': foreground,

    // 静音色（中性灰，避免自定义主题色时趋同）
    '--muted': muted,
    '--muted-foreground': mutedForeground,

    // 强调色
    '--accent': secondary,
    '--accent-foreground': foreground,

    // 错误色
    '--destructive': '0 84.2% 60.2%',
    '--destructive-foreground': '210 40% 98%',

    // 边框和输入
    '--border': border,
    '--input': border,
    '--ring': primary,

    // 侧边栏
    '--sidebar-background': sidebarBg,
    '--sidebar-foreground':
      getHsl('SideTextColor') || (isDarkMode ? '240 4.8% 95.9%' : '240 5.3% 26.1%'),
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': isDarkMode ? '222.2 47.4% 11.2%' : '210 40% 98%',
    '--sidebar-accent': secondary,
    '--sidebar-accent-foreground': foreground,
    '--sidebar-border': border,
    '--sidebar-ring': primary
  }

  // 应用所有变量
  Object.entries(shadcnVars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

/**
 * 将 themeState 的颜色值同步到 Element Plus CSS 变量
 * 这样组件使用 var(--el-*) 时就能获取到 themes.js 计算的颜色
 */
export function applyElementPlusTheme() {
  const root = document.documentElement
  const theme = themeState.currentTheme

  if (!theme) return

  // 映射 themeState 颜色到 Element Plus CSS 变量
  const colorMappings = [
    // 背景色
    { source: 'background', target: '--el-bg-color' },
    { source: 'background2nd', target: '--el-bg-color-page' },
    { source: 'sidebarBackground', target: '--el-fill-color' },
    { source: 'sidebarBackground2', target: '--el-fill-color-light' },

    // 文字色
    { source: 'textColor', target: '--el-text-color-primary' },
    { source: 'textColor2', target: '--el-text-color-regular' },
    { source: 'SideTextColor2', target: '--el-text-color-secondary' },

    // 边框色
    { source: 'borderColor', target: '--el-border-color' },

    // 主题色
    { source: 'primaryColor', target: '--el-color-primary' },
    { source: 'SideActiveTextColor', target: '--el-color-primary-light-3' }
  ]

  colorMappings.forEach(({ source, target }) => {
    const colorValue = theme[source]
    if (colorValue && typeof colorValue === 'string') {
      root.style.setProperty(target, colorValue)
    }
  })

  // 生成主题色的变体（light/dark）
  if (theme.primaryColor) {
    root.style.setProperty(
      '--el-color-primary-light-3',
      mixColors(theme.primaryColor, '#ffffff', 0.3)
    )
    root.style.setProperty(
      '--el-color-primary-light-5',
      mixColors(theme.primaryColor, '#ffffff', 0.5)
    )
    root.style.setProperty(
      '--el-color-primary-light-7',
      mixColors(theme.primaryColor, '#ffffff', 0.7)
    )
    root.style.setProperty(
      '--el-color-primary-light-9',
      mixColors(theme.primaryColor, '#ffffff', 0.9)
    )
    root.style.setProperty(
      '--el-color-primary-dark-2',
      mixColors(theme.primaryColor, '#000000', 0.2)
    )
  }

  // el-scrollbar：主题色与深色/浅色基底大比例混色（混色程度偏深），避免自定义主题下滚动条过艳
  // 使用自定义变量 --md-el-scrollbar-thumb，因 .el-scrollbar 组件内写死了 --el-scrollbar-bg-color
  const isDark = theme.type === 'dark'
  const scrollbarBase = isDark ? '#252525' : '#e5e5e5'
  const scrollbarHoverBase = isDark ? '#353535' : '#d8d8d8'
  const themeForScrollbar = theme.primaryColor || (isDark ? '#9ca3af' : '#374151')
  root.style.setProperty(
    '--md-el-scrollbar-thumb',
    mixColors(themeForScrollbar, scrollbarBase, 0.85)
  )
  root.style.setProperty(
    '--md-el-scrollbar-thumb-hover',
    mixColors(themeForScrollbar, scrollbarHoverBase, 0.8)
  )

  // el-input-number：侧栏映射的 --el-fill-color* 在自定义主题下含主题色比例高，加减钮会像纯色块；
  // 中间区域默认跟 --el-fill-color-blank，易显死黑/死白。单独用中性灰底 + 少量主题色混色。
  let inputNumberAccent = themeForScrollbar
  if (typeof theme.themeColor === 'string') {
    const tcAccent = tinycolor(theme.themeColor)
    if (tcAccent.isValid()) {
      inputNumberAccent = tcAccent.toHexString()
    }
  }
  const inCtrlBase = isDark ? '#2f2f33' : '#e4e4ea'
  const inCtrlHoverBase = isDark ? '#3a3a40' : '#d8d8e0'
  const inFieldBase = isDark ? '#26262a' : '#eeeff3'
  root.style.setProperty(
    '--md-el-input-number-control-bg',
    mixColors(inputNumberAccent, inCtrlBase, 0.9)
  )
  root.style.setProperty(
    '--md-el-input-number-control-bg-hover',
    mixColors(inputNumberAccent, inCtrlHoverBase, 0.86)
  )
  root.style.setProperty(
    '--md-el-input-number-field-bg',
    mixColors(inputNumberAccent, inFieldBase, 0.93)
  )
}

/**
 * 应用主题（从设置中加载并应用主题）
 * @param {Function} getSetting - 获取设置的函数，如果未提供则从 settings.js 导入
 * @param {Object} _ipcRendererInstance - 已废弃，保留参数仅为兼容；IPC 通过 messageBridge 获取
 * @returns {Promise<void>}
 */
export async function applyTheme(getSettingFn = null, _ipcRendererInstance = null) {
  let getSetting = getSettingFn

  if (!getSetting) {
    const settingsModule = await import('./settings.js')
    getSetting = settingsModule.getSetting
  }

  try {
    // 获取主题设置
    const globalTheme = await getSetting('globalTheme')

    // 获取系统主题信息（用于 sync-color）
    const osThemeInfo = await getOsThemeInfo()

    // 根据设置应用主题
    if (globalTheme === 'light' || globalTheme === undefined) {
      themeState.currentTheme = lightTheme
      applyThemeClasses('light')
    } else if (globalTheme === 'dark') {
      themeState.currentTheme = darkTheme
      applyThemeClasses('dark')
    } else if (globalTheme === 'sync') {
      const theme = osThemeInfo?.mode || 'light'
      themeState.currentTheme = theme === 'dark' ? darkTheme : lightTheme
      applyThemeClasses(theme)
    } else if (globalTheme === 'sync-color') {
      // 跟随系统颜色主题
      const accentColor = osThemeInfo?.accentColor
      if (accentColor) {
        themeState.currentTheme = customTheme(accentColor)
      } else {
        // 如果没有系统主题色，使用系统亮暗色
        const theme = osThemeInfo?.mode || 'light'
        themeState.currentTheme = theme === 'dark' ? darkTheme : lightTheme
      }
      applyThemeClasses(themeState.currentTheme.type)
    } else if (globalTheme === 'custom') {
      // 自定义主题
      const customThemeColor = await getSetting('customThemeColor')
      if (customThemeColor) {
        themeState.currentTheme = customTheme(customThemeColor)
        applyThemeClasses(themeState.currentTheme.type)
      } else {
        // 如果没有自定义主题色，回退到 light
        themeState.currentTheme = lightTheme
        applyThemeClasses('light')
      }
    } else {
      // 未知的主题类型，回退到 light
      themeState.currentTheme = lightTheme
      applyThemeClasses('light')
    }

    applyElementPlusTheme()
    applyShadcnTheme()

    // 应用字体设置
    await applyFontSettings(getSetting)
  } catch (error) {
    console.error('应用主题失败，使用默认亮色主题:', error)
    // 出错时回退到 light
    themeState.currentTheme = lightTheme
    applyThemeClasses('light')
    applyElementPlusTheme()
    applyShadcnTheme()
  }
}

/**
 * 应用字体设置
 * @param {Function} getSetting - 获取设置的函数
 */
async function applyFontSettings(getSetting) {
  try {
    const fontUi = (await getSetting('fontUi')) || 'OPPO Sans 4.0'
    const fontEditorChinese = (await getSetting('fontEditorChinese')) || 'OPPO Sans 4.0'
    const fontEditorWestern = (await getSetting('fontEditorWestern')) || 'Fira Code'
    const fontPreviewChinese = (await getSetting('fontPreviewChinese')) || 'OPPO Sans 4.0'
    const fontPreviewWestern = (await getSetting('fontPreviewWestern')) || 'New York'

    const root = document.documentElement

    // UI字体
    root.style.setProperty('--font-family-ui', fontUi)

    // 编辑器字体组合
    root.style.setProperty(
      '--font-family-editor',
      `${fontEditorWestern}, ${fontEditorChinese}, -apple-system, BlinkMacSystemFont, sans-serif`
    )

    // 渲染预览字体组合
    root.style.setProperty(
      '--font-family-preview',
      `${fontPreviewWestern}, ${fontPreviewChinese}, -apple-system, BlinkMacSystemFont, sans-serif`
    )

    // 更新基础字体
    root.style.setProperty(
      '--font-family-base',
      `${fontUi}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
    )
    root.style.setProperty(
      '--font-family-chinese',
      `${fontUi}, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`
    )
  } catch (error) {
    console.error('应用字体设置失败:', error)
  }
}
