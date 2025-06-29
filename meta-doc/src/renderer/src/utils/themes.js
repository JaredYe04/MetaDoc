import { reactive } from "vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
// theme.js
export const lightTheme = {
  type: 'light',
  AiLogo: AiLogo,
    background: '#ffffff',
    background2nd: '#f5f5f5',
    textColor: '#000000',
    textColor2: '#000000',
    headerBackground: '#f5f5f5',
    sidebarBackground: '#f0f0f0',
    sidebarBackground2: '#f0f0f0',
    SideBackgroundColor:"#FEFEFE",
    SideTextColor:'#000000',
    SideTextColor2:'#000000',
    SideActiveTextColor:'#000000',
    vditorTheme: 'classic',
    codeTheme: 'github',
    titleMenuBackground:'#0066FF44',
    outlineBackground:'#4c78a8',
    outlineNode : '#9ecae9',
    quickStartBackground1:'#ADD8E61A',
    quickStartBackground2:'#D6D6FF44',
    mdeditorClass:'md-editor',
    mdeditorTheme:'light',
  };
  
export const darkTheme = {
  type: 'dark',
  AiLogo: AiLogoWhite,
    background: '#2c2c2c',//背景色1，需要体现主题色，但不能过于突出，应当还是以偏黑或偏白为主
    background2nd: '#3a3a3a',//背景色2，次要背景色，可以是背景色1的变体或浅色调
    textColor: '#ffffff',//文字颜色1，主要文字颜色，应当与背景色形成对比
    textColor2: '#dddddd',//文字颜色2，次要文字颜色，可以是文字颜色1的变体或浅色调
    headerBackground: '#3a3a3a',//顶部栏背景色，与背景色2一致
    sidebarBackground: '#1e1e1e',//设置界面侧边栏背景色，比背景色1更深，形成层次感
    sidebarBackground2: '#2e2e2e',//设置界面侧边栏次要背景色，可以是侧边栏背景色的变体或浅色调
    SideBackgroundColor:"#545c64",//主界面侧边栏背景色，应当是主题色的变体或深色调
    SideTextColor:"#fff",//侧边栏文字颜色，与文字颜色1一致
    SideActiveTextColor:"#ffd04b",//侧边栏激活状态文字颜色，应当和背景色形成对比，突出显示，可以是主题色的亮色调
    SideTextColor2:"#ffd0ee",//侧边栏次要文字颜色，可以是侧边栏文字颜色的变体或浅色调
    vditorTheme: 'dark',//亮色版为'classic'，固定
    codeTheme: 'a11y-dark',//亮色版为'github'，固定
    titleMenuBackground:'#111111AA',//AI章节标题菜单背景色，直接使用主题色，透明度固定为AA
    outlineBackground:'#bab0ac',//大纲背景色，应当与背景色形成对比，但是不能过于突出，建议使用主题色的变体或浅色调
    outlineNode : '#79706e',//大纲节点颜色，要和背景色形成对比，建议使用主题色的变体或深色调
    quickStartBackground1:'#66333311',//快速开始背景色1，建议使用主题色的变体或浅色调
    quickStartBackground2:'#33336611',//快速开始背景色2，在背景色1的基础上进行色彩偏移，与背景色1形成对比
    mdeditorClass:'md-editor-dark',//暗色为'mc-editor-dark'，浅色版为'md-editor'
    mdeditorTheme:'dark',//暗色版为'dark'，浅色版为'light'
  };
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
const mixColors = (color1, color2, weight) => {
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

// 主函数：生成自定义主题
export const customTheme = (themeColor = '#000000') => {
  // 确定主题模式（基于主题色亮度）
  const baseLuminance = getLuminance(themeColor);
  const isDarkMode = baseLuminance < 160;
  
  // 核心颜色生成算法
  const generateColorSet = () => {
    if (isDarkMode) {
      // 暗色模式配色方案
      return {
        background: mixColors(themeColor, '#1a1a1a', 0.8),
        background2nd: mixColors(themeColor, '#2a2a2a', 0.85),
        textColor: adjustSaturation(mixColors(themeColor, '#ffffff', 0.9), 0.8),
        textColor2: adjustSaturation(mixColors(themeColor, '#cccccc', 0.85), 0.7),
        headerBackground: mixColors(themeColor, '#2a2a2a', 0.3),
        sidebarBackground: mixColors(themeColor, '#121212', 0.2),
        sidebarBackground2: mixColors(themeColor, '#1e1e1e', 0.25),
        SideBackgroundColor: adjustSaturation(themeColor, 0.7),
        SideTextColor: mixColors(themeColor, '#ffffff', 0.9),
        SideActiveTextColor:  mixColors(themeColor, '#ffffff', 0.95),
        SideTextColor2: mixColors(themeColor, '#dddddd', 0.8),
        vditorTheme: 'dark',
        codeTheme: 'a11y-dark',
        titleMenuBackground: mixColors(themeColor, '#000000', 0.15) + 'AA',
        outlineBackground: mixColors(themeColor, '#7f7f7f', 0.4),
        outlineNode: mixColors(themeColor, '#4a4a4a', 0.6),
        quickStartBackground1: mixColors(themeColor, '#330000', 0.3) + '22',
        quickStartBackground2: mixColors(themeColor, '#000033', 0.3) + '22',
        mdeditorClass: 'md-editor-dark',
        mdeditorTheme: 'dark'
      };
    } else {
      // 亮色模式配色方案
      return {
        background: mixColors(themeColor, '#ffffff', 0.8),
        background2nd: mixColors(themeColor, '#f8f8f8', 0.85),
        textColor: mixColors(themeColor, '#222222', 0.9),
        textColor2: mixColors(themeColor, '#444444', 0.8),
        headerBackground: mixColors(themeColor, '#f5f5f5', 0.15),
        sidebarBackground: mixColors(themeColor, '#f0f0f0', 0.1),
        sidebarBackground2: mixColors(themeColor, '#e8e8e8', 0.12),
        SideBackgroundColor: adjustSaturation(mixColors(themeColor, '#f5f5f5', 0.2), 0.9),
        SideTextColor: mixColors(themeColor, '#333333', 0.9),
        SideActiveTextColor: mixColors(themeColor, '#333333', 0.95),
        SideTextColor2: mixColors(themeColor, '#555555', 0.8),
        vditorTheme: 'classic',
        codeTheme: 'github',
        titleMenuBackground: mixColors(themeColor, '#ffffff', 0.2) + '44',
        outlineBackground: mixColors(themeColor, '#d0d0d0', 0.3),
        outlineNode: mixColors(themeColor, '#e8e8e8', 0.4),
        quickStartBackground1: mixColors(themeColor, '#e6f7ff', 0.4) + '33',
        quickStartBackground2: mixColors(themeColor, '#f0f7ff', 0.4) + '33',
        mdeditorClass: 'md-editor',
        mdeditorTheme: 'light'
      };
    }
  };

  return {
    type: isDarkMode ? 'dark' : 'light',
    AiLogo: isDarkMode ? AiLogoWhite : AiLogo,
    ...generateColorSet(),
    // 注意：AiLogo 需要在外部根据模式设置
  };
};
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


export const themeState=reactive({
    currentTheme:darkTheme
})