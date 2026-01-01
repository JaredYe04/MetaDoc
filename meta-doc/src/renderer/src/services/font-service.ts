/**
 * 字体服务（Renderer 进程）
 * 通过 IPC 获取系统字体列表
 */

export interface SystemFont {
  name: string; // 字体内部名称（用于实际使用）
  family: string; // 字体族名称
  displayName?: string; // 本地化显示名称（如：微软雅黑）
  style?: string;
}

let cachedFonts: SystemFont[] | null = null;
let fontsPromise: Promise<SystemFont[]> | null = null;

/**
 * 获取系统字体列表
 */
export async function getSystemFonts(): Promise<SystemFont[]> {
  // 如果已缓存，直接返回
  if (cachedFonts) {
    return cachedFonts;
  }

  // 如果正在加载，返回同一个 Promise
  if (fontsPromise) {
    return fontsPromise;
  }

  // 创建新的加载 Promise
  fontsPromise = loadFonts();
  
  try {
    const fonts = await fontsPromise;
    cachedFonts = fonts;
    return fonts;
  } catch (error) {
    fontsPromise = null;
    console.error('获取系统字体失败:', error);
    // 返回默认字体列表
    return getDefaultFonts();
  }
}

/**
 * 从主进程加载字体列表
 */
async function loadFonts(): Promise<SystemFont[]> {
  // 获取 ipcRenderer
  const { default: localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer');
  const { webMainCalls } = await import('../utils/web-adapter/web-main-calls');
  const ipcRenderer = (window as any)?.electron?.ipcRenderer ?? (webMainCalls(), localIpcRenderer);

  try {
    const fonts = await ipcRenderer.invoke('get-system-fonts');
    return fonts || getDefaultFonts();
  } catch (error) {
    console.error('IPC 调用失败:', error);
    return getDefaultFonts();
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
    { name: 'Comic Sans MS', family: 'Comic Sans MS' },
  ];
}

/**
 * 清除字体缓存（用于刷新字体列表）
 */
export function clearFontCache(): void {
  cachedFonts = null;
  fontsPromise = null;
}

