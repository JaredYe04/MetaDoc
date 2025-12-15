/**
 * 字体服务
 * 获取系统已安装的字体列表
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { readFileSync, existsSync } from 'fs';
import { createMainLogger } from '../logger';

const execAsync = promisify(exec);
const logger = createMainLogger('FontService');

export interface SystemFont {
  name: string;
  family: string;
  style?: string;
}

let cachedFonts: SystemFont[] | null = null;

/**
 * 获取系统字体列表
 */
export async function getSystemFonts(): Promise<SystemFont[]> {
  // 如果已缓存，直接返回
  if (cachedFonts) {
    return cachedFonts;
  }

  try {
    const osPlatform = detectRuntimePlatform();
    let fonts: SystemFont[] = [];

    switch (osPlatform) {
      case 'win32':
        fonts = await getWindowsFonts();
        break;
      case 'darwin':
        fonts = await getMacOSFonts();
        break;
      case 'linux':
      case 'wsl': // WSL 依旧沿用 Linux 命令（fc-list）
        fonts = await getLinuxFonts();
        break;
      default:
        logger.warn(`不支持的操作系统: ${osPlatform}，返回默认字体列表`);
        fonts = getDefaultFonts();
    }

    // 去重并排序
    fonts = deduplicateAndSortFonts(fonts);
    
    // 缓存结果
    cachedFonts = fonts;
    
    logger.info(`获取到 ${fonts.length} 个系统字体`);
    return fonts;
  } catch (error) {
    logger.error('获取系统字体失败:', error);
    // 返回默认字体列表
    return getDefaultFonts();
  }
}

/**
 * 检测运行平台（包含 WSL 场景）
 */
function detectRuntimePlatform(): 'win32' | 'darwin' | 'linux' | 'wsl' {
  const osPlatform = platform();

  if (osPlatform === 'linux') {
    try {
      if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
        return 'wsl';
      }
      if (existsSync('/proc/version')) {
        const content = readFileSync('/proc/version', 'utf-8');
        if (/microsoft/i.test(content)) {
          return 'wsl';
        }
      }
    } catch {
      // 静默降级
    }
  }

  return osPlatform as 'win32' | 'darwin' | 'linux';
}

/**
 * Windows 系统获取字体
 */
async function getWindowsFonts(): Promise<SystemFont[]> {
  try {
    // 使用 PowerShell 获取字体列表
    const command =
      `powershell -Command "& {Get-ChildItem -Path 'C:\\Windows\\Fonts' -Include '*.ttf','*.otf','*.ttc' -File -Recurse | ForEach-Object { $_.BaseName } | Sort-Object -Unique}"`;
    const { stdout } = await execAsync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    const fontNames = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(name => {
        // 移除字体样式后缀（如 Bold, Italic 等）
        const cleanName = name
          .replace(/\s+(Bold|Italic|Regular|Light|Medium|SemiBold|ExtraBold|Black|Thin|UltraLight)$/i, '')
          .trim();
        
        return {
          name: cleanName,
          family: cleanName,
        };
      });

    return fontNames;
  } catch (error) {
    logger.error('Windows 字体获取失败:', error);
    return getDefaultFonts();
  }
}

/**
 * macOS 系统获取字体
 */
async function getMacOSFonts(): Promise<SystemFont[]> {
  try {
    // 使用 system_profiler 获取字体列表
    const command = `system_profiler SPFontsDataType | grep "Font:" | sed 's/.*Font: //' | sort -u`;
    const { stdout } = await execAsync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    const fontNames = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(name => ({
        name,
        family: name,
      }));

    return fontNames;
  } catch (error) {
    logger.error('macOS 字体获取失败:', error);
    // 尝试使用 fc-list（如果安装了 fontconfig）
    try {
      return await getLinuxFonts();
    } catch {
      return getDefaultFonts();
    }
  }
}

/**
 * Linux 系统获取字体
 */
async function getLinuxFonts(): Promise<SystemFont[]> {
  try {
    // 使用 fc-list 获取字体列表
    const command = `fc-list : family | sort -u`;
    const { stdout } = await execAsync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    
    const fontNames = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(name => ({
        name,
        family: name,
      }));

    return fontNames;
  } catch (error) {
    logger.error('Linux 字体获取失败:', error);
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
 * 去重并排序字体列表
 */
function deduplicateAndSortFonts(fonts: SystemFont[]): SystemFont[] {
  const seen = new Set<string>();
  const unique: SystemFont[] = [];

  for (const font of fonts) {
    const key = font.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(font);
    }
  }

  // 按名称排序
  return unique.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * 清除字体缓存（用于刷新字体列表）
 */
export function clearFontCache(): void {
  cachedFonts = null;
  logger.info('字体缓存已清除');
}

