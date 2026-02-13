import { reactive } from "vue";
// import AiLogo from "../assets/ai-logo.svg";
// import AiLogoWhite from "../assets/ai-logo-white.svg";

import AiLogo from "../assets/icons/ai-black.svg";
import AiLogoWhite from "../assets/icons/ai-white.svg";
import ToolBlack from "../assets/tool-black.svg";
import ToolWhite from "../assets/tool-white.svg";
// 菜单图标导入
import EditorIconBlack from "../assets/icons/editor-black.svg";
import EditorIconWhite from "../assets/icons/editor-white.svg";
import OutlineIconBlack from "../assets/icons/outline-black.svg";
import OutlineIconWhite from "../assets/icons/outline-white.svg";
import VisualIconBlack from "../assets/icons/visual-black.svg";
import VisualIconWhite from "../assets/icons/visual-white.svg";
import AgentIconBlack from "../assets/icons/agent-black.svg";
import AgentIconWhite from "../assets/icons/agent-white.svg";
import ProofreadIconBlack from "../assets/icons/proofread-black.svg";
import ProofreadIconWhite from "../assets/icons/proofread-white.svg";
import HomeIconBlack from "../assets/icons/home-black.svg";
import HomeIconWhite from "../assets/icons/home-white.svg";
// 文档图标导入
import MdDocIconBlack from "../assets/icons/md-doc-black.svg";
import MdDocIconWhite from "../assets/icons/md-doc-white.svg";
import TexDocIconBlack from "../assets/icons/tex-doc-black.svg";
import TexDocIconWhite from "../assets/icons/tex-doc-white.svg";
import BaseDocIconBlack from "../assets/icons/base-doc-black.svg";
import BaseDocIconWhite from "../assets/icons/base-doc-white.svg";
// 工作区图标导入
import RefreshIconBlack from "../assets/icons/refresh-black.svg";
import RefreshIconWhite from "../assets/icons/refresh-white.svg";
import FolderAddIconBlack from "../assets/icons/folder-add-black.svg";
import FolderAddIconWhite from "../assets/icons/folder-add-white.svg";
// 菜单图标导入（新增）
import SettingIconBlack from "../assets/icons/setting-black.svg";
import SettingIconWhite from "../assets/icons/setting-white.svg";
import RecentIconBlack from "../assets/icons/recent-black.svg";
import RecentIconWhite from "../assets/icons/recent-white.svg";
import KnowledgeIconBlack from "../assets/icons/knowledge-black.svg";
import KnowledgeIconWhite from "../assets/icons/knowledge-white.svg";
import FolderIconBlack from "../assets/icons/folder-black.svg";
import FolderIconWhite from "../assets/icons/folder-white.svg";
import DebugIconBlack from "../assets/icons/debug-black.svg";
import DebugIconWhite from "../assets/icons/debug-white.svg";
import MoreIconBlack from "../assets/icons/more-black.svg";
import MoreIconWhite from "../assets/icons/more-white.svg";
import LanguageIconBlack from "../assets/icons/language-black.svg";
import LanguageIconWhite from "../assets/icons/language-white.svg";
import FileIconBlack from "../assets/icons/file-black.svg";
import FileIconWhite from "../assets/icons/file-white.svg";
import MetaIconBlack from "../assets/icons/meta-black.svg";
import MetaIconWhite from "../assets/icons/meta-white.svg";
import PenAiIconBlack from "../assets/icons/pen-ai-black.svg";
import PenAiIconWhite from "../assets/icons/pen-ai-white.svg";
import FeedbackIconBlack from "../assets/icons/feedback-black.svg";
import FeedbackIconWhite from "../assets/icons/feedback-white.svg";
// 窗口控制图标（标题栏最小化/最大化/还原）
import MinimizeIconBlack from "../assets/icons/minimize-black.svg";
import MinimizeIconWhite from "../assets/icons/minimize-white.svg";
import MaximizeIconBlack from "../assets/icons/maximize-black.svg";
import MaximizeIconWhite from "../assets/icons/maximize-white.svg";
import RestoreIconBlack from "../assets/icons/restore-black.svg";
import RestoreIconWhite from "../assets/icons/restore-white.svg";
// PDF查看模式图标导入
import CursorIconBlack from "../assets/icons/cursor-black.svg";
import CursorIconWhite from "../assets/icons/cursor-white.svg";
import HandIconBlack from "../assets/icons/hand-black.svg";
import HandIconWhite from "../assets/icons/hand-white.svg";
// 公式识别画布工具图标
import BrushIconBlack from "../assets/icons/brush-black.svg";
import BrushIconWhite from "../assets/icons/brush-white.svg";
import EraserIconBlack from "../assets/icons/eraser-black.svg";
import EraserIconWhite from "../assets/icons/eraser-white.svg";
import UndoIconBlack from "../assets/icons/undo-black.svg";
import UndoIconWhite from "../assets/icons/undo-white.svg";
import RedoIconBlack from "../assets/icons/redo-black.svg";
import RedoIconWhite from "../assets/icons/redo-white.svg";
import ClearIconBlack from "../assets/icons/clear-black.svg";
import ClearIconWhite from "../assets/icons/clear-white.svg";
// theme.js
export const contentThemes = [
  { label: 'Ant Design', value: 'ant-design' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'WeChat', value: 'wechat' }
];

export const codeThemes = [
  'abap', 'algol', 'algol_nu', 'arduino', 'autumn', 'borland', 'bw', 'colorful',
  'dracula', 'emacs', 'friendly', 'fruity', 'github', 'igor', 'lovelace', 'manni',
  'monokai', 'monokailight', 'murphy', 'native', 'paraiso-dark', 'paraiso-light',
  'pastie', 'perldoc', 'pygments', 'rainbow_dash', 'rrt', 'solarized-dark',
  'solarized-dark256', 'solarized-light', 'swapoff', 'tango', 'trac', 'vim', 'vs', 'xcode'
];

import tinycolor from 'tinycolor2';
// 辅助函数：HEX转RGB
const hexToRgb = (hex) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

// 辅助函数：RGB转HEX
const rgbToHex = (r, g, b) => {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
};

// 辅助函数：混合两种颜色
export const mixColors = (color1, color2, weight) => {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(c1.r * (1 - weight) + c2.r * weight);
  const g = Math.round(c1.g * (1 - weight) + c2.g * weight);
  const b = Math.round(c1.b * (1 - weight) + c2.b * weight);

  return rgbToHex(r, g, b);
};

// 辅助函数：计算颜色亮度（0-255）
const getLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// 辅助函数：调整颜色饱和度
const adjustSaturation = (hex, factor) => {
  const { r, g, b } = hexToRgb(hex);
  const avg = (r + g + b) / 3;

  const adjust = (c) => {
    const diff = c - avg;
    return Math.round(avg + diff * factor);
  };

  return rgbToHex(
    Math.min(255, Math.max(0, adjust(r))),
    Math.min(255, Math.max(0, adjust(g))),
    Math.min(255, Math.max(0, adjust(b)))
  );
};

// 辅助函数：将颜色转换为带透明度的版本
export const colorWithOpacity = (color, opacity) => {
  // 如果是 hex 颜色（如 #ffffff 或 #fff）
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    // 处理 3 位 hex（如 #fff）
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    // 确保是 6 位 hex
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }
  // 如果是 rgb 或 rgba 颜色
  if (color.startsWith('rgb')) {
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const [, r, g, b] = match;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }
  // 其他情况直接返回原颜色
  return color;
};

/**
 * 根据亮暗色模式选择图标的辅助函数
 * @param {boolean} isDarkMode - 是否为暗色模式
 * @param {Object} iconPair - 包含 light 和 dark 属性的图标对象
 * @returns {string} 返回对应模式的图标路径
 */
const selectIconByTheme = (isDarkMode, iconPair) => {
  return isDarkMode ? iconPair.dark : iconPair.light;
};

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
    ProofreadIcon: selectIconByTheme(isDarkMode, { light: ProofreadIconBlack, dark: ProofreadIconWhite }),
    MdDocIcon: selectIconByTheme(isDarkMode, { light: MdDocIconBlack, dark: MdDocIconWhite }),
    TexDocIcon: selectIconByTheme(isDarkMode, { light: TexDocIconBlack, dark: TexDocIconWhite }),
    BaseDocIcon: selectIconByTheme(isDarkMode, { light: BaseDocIconBlack, dark: BaseDocIconWhite }),
    RefreshIcon: selectIconByTheme(isDarkMode, { light: RefreshIconBlack, dark: RefreshIconWhite }),
    FolderAddIcon: selectIconByTheme(isDarkMode, { light: FolderAddIconBlack, dark: FolderAddIconWhite }),
    SettingIcon: selectIconByTheme(isDarkMode, { light: SettingIconBlack, dark: SettingIconWhite }),
    RecentIcon: selectIconByTheme(isDarkMode, { light: RecentIconBlack, dark: RecentIconWhite }),
    KnowledgeIcon: selectIconByTheme(isDarkMode, { light: KnowledgeIconBlack, dark: KnowledgeIconWhite }),
    FolderIcon: selectIconByTheme(isDarkMode, { light: FolderIconBlack, dark: FolderIconWhite }),
    DebugIcon: selectIconByTheme(isDarkMode, { light: DebugIconBlack, dark: DebugIconWhite }),
    MoreIcon: selectIconByTheme(isDarkMode, { light: MoreIconBlack, dark: MoreIconWhite }),
    LanguageIcon: selectIconByTheme(isDarkMode, { light: LanguageIconBlack, dark: LanguageIconWhite }),
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
    FeedbackIcon: selectIconByTheme(isDarkMode, { light: FeedbackIconBlack, dark: FeedbackIconWhite }),
    MinimizeIcon: selectIconByTheme(isDarkMode, { light: MinimizeIconBlack, dark: MinimizeIconWhite }),
    MaximizeIcon: selectIconByTheme(isDarkMode, { light: MaximizeIconBlack, dark: MaximizeIconWhite }),
    RestoreIcon: selectIconByTheme(isDarkMode, { light: RestoreIconBlack, dark: RestoreIconWhite }),
  };
};

// 主函数：生成自定义主题
// themeColor: 主题色
// overrides: 可选的覆盖对象，用于覆盖某些颜色值（主要用于保持 lightTheme 和 darkTheme 的原始值）
export const customTheme = (themeColor = '#000000', overrides = {}) => {
  // 确定主题模式（基于主题色亮度）
  const baseLuminance = getLuminance(themeColor);
  const isDarkMode = baseLuminance < 160;

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
        SideActiveTextColor: mixColors(themeColor, '#ffffff', 0.95),
        SideTextColor2: mixColors(themeColor, '#dddddd', 0.8),
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
        // 新增配色项
        borderColor: mixColors(themeColor, '#404040', 0.5),
        codeColor: adjustSaturation(mixColors(themeColor, '#e0e0e0', 0.8), 0.9),
        primaryColor: adjustSaturation(mixColors(themeColor, '#ffffff', 0.7), 1.2),
        secondaryColor: adjustSaturation(mixColors(themeColor, '#cccccc', 0.6), 1.0),
        // 引用标签颜色
        referenceActiveBg: adjustSaturation(mixColors(themeColor, '#4a9eff', 0.6), 1.1),
        referenceActiveText: '#ffffff',
        referenceInactiveBg: mixColors(themeColor, '#3a3a3a', 0.7),
        referenceInactiveText: adjustSaturation(mixColors(themeColor, '#cccccc', 0.85), 0.7),
        // 引用容器边框颜色
        referenceContainerBorderColor: mixColors(themeColor, '#404040', 0.5)
      };
      // 应用覆盖值
      return { ...baseColors, ...overrides };
    } else {
      // 亮色模式配色方案
      const baseColors = {
        background: mixColors(themeColor, '#ffffff', 0.7),
        background2nd: mixColors(themeColor, '#f8f8f8', 0.75),
        textColor: mixColors(themeColor, '#222222', 0.8),
        textColor2: mixColors(themeColor, '#444444', 0.7),
        headerBackground: mixColors(themeColor, '#f5f5f5', 0.4),
        sidebarBackground: mixColors(themeColor, '#f0f0f0', 0.05),
        sidebarBackground2: mixColors(themeColor, '#e8e8e8', 0.12),
        SideBackgroundColor: adjustSaturation(mixColors(themeColor, '#f5f5f5', 0.6), 0.8),
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
        // 新增配色项
        borderColor: mixColors(themeColor, '#e0e0e0', 0.5),
        codeColor: adjustSaturation(mixColors(themeColor, '#333333', 0.8), 0.9),
        primaryColor: adjustSaturation(mixColors(themeColor, '#000000', 0.7), 1.2),
        secondaryColor: adjustSaturation(mixColors(themeColor, '#666666', 0.6), 1.0),
        // 引用标签颜色
        referenceActiveBg: adjustSaturation(mixColors(themeColor, '#409eff', 0.5), 1.1),
        referenceActiveText: '#ffffff',
        referenceInactiveBg: mixColors(themeColor, '#f5f5f5', 0.8),
        referenceInactiveText: adjustSaturation(mixColors(themeColor, '#666666', 0.7), 0.8),
        // 引用容器边框颜色
        referenceContainerBorderColor: mixColors(themeColor, '#e0e0e0', 0.5)
      };
      // 应用覆盖值
      return { ...baseColors, ...overrides };
    }
  };

  const colorSet = generateColorSet();
  const themeIcons = generateThemeIcons(isDarkMode);
  
  return {
    type: isDarkMode ? 'dark' : 'light',
    ...themeIcons,
    ...colorSet,
  };
};

// 浅色主题：使用白色作为主题色，通过 customTheme 生成，但使用 overrides 保持原始颜色值
export const lightTheme = customTheme('#ffffff', {
  background: '#ffffff',
  background2nd: '#f5f5f5',
  textColor: '#000000',
  textColor2: '#000000',
  headerBackground: '#f5f5f5',
  sidebarBackground: '#f0f0f0',
  sidebarBackground2: '#f0f0f0',
  SideBackgroundColor: "#FEFEFE",
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
  // 引用标签颜色
  referenceActiveBg: '#409eff',
  referenceActiveText: '#ffffff',
  referenceInactiveBg: '#f5f5f5',
  referenceInactiveText: '#666666',
    // 引用容器边框颜色
    referenceContainerBorderColor: '#e0e0e0'
  ,...generateThemeIcons(false)
});

// 深色主题：使用深灰色作为主题色，通过 customTheme 生成，但使用 overrides 保持原始颜色值
export const darkTheme = customTheme('#2c2c2c', {
  background: '#2c2c2c',//背景色1，需要体现主题色，但不能过于突出，应当还是以偏黑或偏白为主
  background2nd: '#3a3a3a',//背景色2，次要背景色，可以是背景色1的变体或浅色调
  textColor: '#ffffff',//文字颜色1，主要文字颜色，应当与背景色形成对比
  textColor2: '#dddddd',//文字颜色2，次要文字颜色，可以是文字颜色1的变体或浅色调
  headerBackground: '#3a3a3a',//顶部栏背景色，与背景色2一致
  sidebarBackground: '#1e1e1e',//设置界面侧边栏背景色，比背景色1更深，形成层次感
  sidebarBackground2: '#2e2e2e',//设置界面侧边栏次要背景色，可以是侧边栏背景色的变体或浅色调
  SideBackgroundColor: "#545c64",//主界面侧边栏背景色，应当是主题色的变体或深色调
  SideTextColor: "#fff",//侧边栏文字颜色，与文字颜色1一致
  SideActiveTextColor: "#ffd04b",//侧边栏激活状态文字颜色，应当和背景色形成对比，突出显示，可以是主题色的亮色调
  SideTextColor2: "#ffd0ee",//侧边栏次要文字颜色，可以是侧边栏文字颜色的变体或浅色调,
  editorPanelBackgroundColor: '#24292e',//编辑器面板背景色，应当是主题色的变体或深色调
  editorToolbarBackgroundColor: '#1d2125',//编辑器工具栏背景色，应当是主题色的变体或浅色调
  editorTextareaBackgroundColor: '#2f363d',//编辑器文本区域背景色，应当是主题色的变体或浅色调
  vditorTheme: 'dark',//亮色版为'classic'，固定
  codeTheme: 'a11y-dark',//亮色版为'github'，固定
  titleMenuBackground: '#111111AA',//AI章节标题菜单背景色，直接使用主题色，透明度固定为AA
  outlineBackground: '#978882',//大纲背景色，应当与背景色形成对比，但是不能过于突出，建议使用主题色的变体或浅色调
  outlineNode: '#79706e',//大纲节点颜色，要和背景色形成对比，建议使用主题色的变体或深色调
  quickStartBackground1: '#66333311',//快速开始背景色1，建议使用主题色的变体或浅色调
  quickStartBackground2: '#33336611',//快速开始背景色2，在背景色1的基础上进行色彩偏移，与背景色1形成对比
  mdeditorClass: 'md-editor-dark',//暗色为'mc-editor-dark'，浅色版为'md-editor'
  mdeditorTheme: 'dark',//暗色版为'dark'，浅色版为'light'
  // 新增配色项：基于原始主题的合理值
  borderColor: '#404040',
  codeColor: '#e0e0e0',
  primaryColor: '#ffd04b',
  secondaryColor: '#ffd0ee',
  // 引用标签颜色
  referenceActiveBg: '#4a9eff',
  referenceActiveText: '#ffffff',
  referenceInactiveBg: '#3a3a3a',
  referenceInactiveText: '#cccccc',
    // 引用容器边框颜色
    referenceContainerBorderColor: '#404040'
    ,...generateThemeIcons(true)
});

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
  '#c71585',
]

// 预设主题配置
export const presetThemes = [
  // 原色系
  { color: '#ff4500', nameKey: 'presetThemeCoralRed' },      // 珊瑚红
  { color: '#ff8c00', nameKey: 'presetThemeGoldenOrange' },   // 金橙色
  { color: '#ffd700', nameKey: 'presetThemeLemonYellow' },    // 柠檬黄
  { color: '#90ee90', nameKey: 'presetThemeMintGreen' },     // 薄荷绿
  { color: '#00ced1', nameKey: 'presetThemeLakeBlue' },      // 湖水蓝
  { color: '#1e90ff', nameKey: 'presetThemeSkyBlue' },       // 天空蓝
  { color: '#c71585', nameKey: 'presetThemeRosePurple' },   // 玫瑰紫
  // 浅色系
  { color: '#777777', nameKey: 'presetThemeSpaceGray' },     // 太空灰
  { color: '#ffe0e0', nameKey: 'presetThemeLightRed' },      // 浅红色
  { color: '#ffe4b5', nameKey: 'presetThemeLightOrange' },   // 浅橙色
  { color: '#fffacd', nameKey: 'presetThemeLightYellow' },   // 浅黄色
  { color: '#e0ffe0', nameKey: 'presetThemeLightGreen' },    // 浅绿色
  { color: '#e0ffff', nameKey: 'presetThemeLightCyan' },     // 浅青色
  { color: '#e0f0ff', nameKey: 'presetThemeLightBlue' },     // 浅蓝色
  { color: '#f0e0ff', nameKey: 'presetThemeLightPurple' },  // 浅紫色
  { color: '#fafafa', nameKey: 'presetThemeOffWhite' },      // 米白色
]


export const themeState = reactive({
  currentTheme: lightTheme
})

// 获取系统主题信息的辅助函数
async function getOsThemeInfo(ipcRenderer) {
  try {
    if (ipcRenderer && 'invoke' in ipcRenderer) {
      return await ipcRenderer.invoke('get-os-theme-info')
    } else {
      // Web 环境
      const mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
      return { mode, accentColor: undefined }
    }
  } catch (e) {
    console.error('获取系统主题信息失败:', e)
    return { mode: 'light', accentColor: undefined }
  }
}

// 应用主题类到 document
function applyThemeClasses(themeType) {
  if (themeType === 'light') {
    document.documentElement.classList.add('light')
    document.documentElement.classList.remove('dark')
  } else {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  }
}

/**
 * 应用主题（从设置中加载并应用主题）
 * @param {Function} getSetting - 获取设置的函数，如果未提供则从 settings.js 导入
 * @param {Object} ipcRenderer - IPC Renderer 实例，如果未提供则自动获取
 * @returns {Promise<void>}
 */
export async function applyTheme(getSettingFn = null, ipcRendererInstance = null) {
  // 动态导入 getSetting 和 ipcRenderer（避免循环依赖）
  let getSetting = getSettingFn
  let ipcRenderer = ipcRendererInstance
  
  if (!getSetting) {
    const settingsModule = await import('./settings.js')
    getSetting = settingsModule.getSetting
  }
  
  if (!ipcRenderer) {
    if (window && window.electron) {
      ipcRenderer = window.electron.ipcRenderer
    } else {
      const localIpcRenderer = await import('./web-adapter/local-ipc-renderer')
      ipcRenderer = localIpcRenderer.default
    }
  }
  
  try {
    // 获取主题设置
    const globalTheme = await getSetting('globalTheme')
    
    // 获取系统主题信息（用于 sync-color）
    const osThemeInfo = await getOsThemeInfo(ipcRenderer)
    
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
  } catch (error) {
    console.error('应用主题失败，使用默认亮色主题:', error)
    // 出错时回退到 light
    themeState.currentTheme = lightTheme
    applyThemeClasses('light')
  }
}
