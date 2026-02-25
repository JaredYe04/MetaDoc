/**
 * 字体服务
 * 获取系统已安装的字体列表
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { readFileSync, existsSync } from 'fs'
import { createMainLogger } from '../logger'

const execAsync = promisify(exec)
const logger = createMainLogger('FontService')

export interface SystemFont {
  name: string // 字体内部名称（用于实际使用）
  family: string // 字体族名称
  displayName?: string // 本地化显示名称（如：微软雅黑）
  style?: string
}

let cachedFonts: SystemFont[] | null = null

/**
 * 获取系统字体列表
 */
export async function getSystemFonts(): Promise<SystemFont[]> {
  // 如果已缓存，直接返回
  if (cachedFonts) {
    return cachedFonts
  }

  try {
    const osPlatform = detectRuntimePlatform()
    let fonts: SystemFont[] = []

    switch (osPlatform) {
      case 'win32':
        fonts = await getWindowsFonts()
        break
      case 'darwin':
        fonts = await getMacOSFonts()
        break
      case 'linux':
      case 'wsl': // WSL 依旧沿用 Linux 命令（fc-list）
        fonts = await getLinuxFonts()
        break
      default:
        logger.warn(`不支持的操作系统: ${osPlatform}，返回默认字体列表`)
        fonts = getDefaultFonts()
    }

    // 去重并排序
    fonts = deduplicateAndSortFonts(fonts)

    // 缓存结果
    cachedFonts = fonts

    logger.info(`获取到 ${fonts.length} 个系统字体`)
    return fonts
  } catch (error) {
    logger.error('获取系统字体失败:', error)
    // 返回默认字体列表
    return getDefaultFonts()
  }
}

/**
 * 检测运行平台（包含 WSL 场景）
 */
function detectRuntimePlatform(): 'win32' | 'darwin' | 'linux' | 'wsl' {
  const osPlatform = platform()

  if (osPlatform === 'linux') {
    try {
      if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
        return 'wsl'
      }
      if (existsSync('/proc/version')) {
        const content = readFileSync('/proc/version', 'utf-8')
        if (/microsoft/i.test(content)) {
          return 'wsl'
        }
      }
    } catch {
      // 静默降级
    }
  }

  return osPlatform as 'win32' | 'darwin' | 'linux'
}

/**
 * Windows 系统获取字体（包含本地化显示名称）
 */
async function getWindowsFonts(): Promise<SystemFont[]> {
  try {
    // 使用 PowerShell 调用 .NET API 获取字体的本地化显示名称
    // System.Drawing.Text.InstalledFontCollection 返回的 Name 属性已经是本地化名称
    // 在中文系统上会返回"微软雅黑"而不是"Microsoft YaHei"
    // 将脚本压缩为单行以避免 PowerShell 解析错误
    const command = `powershell -Command "& { Add-Type -AssemblyName System.Drawing; $fonts = New-Object System.Drawing.Text.InstalledFontCollection; $fontFamilies = $fonts.Families; $result = @(); foreach ($family in $fontFamilies) { $fontName = $family.Name; $result += [PSCustomObject]@{ Name = $fontName; DisplayName = $fontName } }; $result | ConvertTo-Json -Compress }"`

    const { stdout } = await execAsync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })

    try {
      // 解析 JSON 输出
      const fonts = JSON.parse(stdout)
      if (Array.isArray(fonts) && fonts.length > 0) {
        return fonts.map((font: any) => {
          const displayName = font.DisplayName || font.displayName || font.Name || font.name || ''
          // 在 Windows 上，系统返回的名称已经是本地化名称
          // 我们使用它作为显示名称，同时作为内部名称（Windows 会自动处理）
          return {
            name: displayName, // 内部名称（Windows 会自动处理本地化）
            family: displayName,
            displayName: displayName // 显示名称（已经是本地化的）
          }
        })
      }
    } catch (parseError) {
      logger.warn('解析字体 JSON 失败，尝试备用方法:', parseError)
    }

    // 备用方法：使用原来的方法获取字体列表
    const fallbackCommand = `powershell -Command "& {Get-ChildItem -Path 'C:\\Windows\\Fonts' -Include '*.ttf','*.otf','*.ttc' -File -Recurse | ForEach-Object { $_.BaseName } | Sort-Object -Unique}"`
    const { stdout: fallbackStdout } = await execAsync(fallbackCommand, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    })

    const fontNames = fallbackStdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((name) => {
        // 移除字体样式后缀（如 Bold, Italic 等）
        const cleanName = name
          .replace(
            /\s+(Bold|Italic|Regular|Light|Medium|SemiBold|ExtraBold|Black|Thin|UltraLight)$/i,
            ''
          )
          .trim()

        return {
          name: cleanName,
          family: cleanName
        }
      })

    return fontNames
  } catch (error) {
    logger.error('Windows 字体获取失败:', error)
    return getDefaultFonts()
  }
}

/**
 * macOS 系统获取字体（包含本地化显示名称）
 */
async function getMacOSFonts(): Promise<SystemFont[]> {
  try {
    // 使用 system_profiler 获取字体列表
    // macOS 的 system_profiler 会根据系统语言设置返回本地化字体名称
    // 在中文系统上会返回"微软雅黑"而不是"Microsoft YaHei"
    const command = `system_profiler SPFontsDataType | grep "Font:" | sed 's/.*Font: //' | sort -u`
    const { stdout } = await execAsync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })

    const fontNames = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((name) => ({
        name, // macOS 系统返回的名称已经是本地化的（根据系统语言设置）
        family: name,
        displayName: name // 显示名称（已经是本地化的）
      }))

    return fontNames
  } catch (error) {
    logger.error('macOS 字体获取失败:', error)
    // 尝试使用 fc-list（如果安装了 fontconfig，比如通过 Homebrew）
    try {
      return await getLinuxFonts()
    } catch {
      return getDefaultFonts()
    }
  }
}

/**
 * Linux 系统获取字体（包含本地化显示名称）
 */
async function getLinuxFonts(): Promise<SystemFont[]> {
  try {
    // 使用 fc-list 获取字体列表
    // fontconfig 的 fc-list 会根据系统语言环境（LANG/LC_ALL）自动返回本地化字体名称
    // 在中文系统上会返回"微软雅黑"而不是"Microsoft YaHei"
    const command = `fc-list : family | sort -u`
    const { stdout } = await execAsync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })

    const fontNames = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((name) => ({
        name, // fontconfig 返回的名称已经是本地化的（根据系统语言环境）
        family: name,
        displayName: name // 显示名称（已经是本地化的）
      }))

    return fontNames
  } catch (error) {
    logger.error('Linux 字体获取失败:', error)
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
 * 去重并排序字体列表
 */
function deduplicateAndSortFonts(fonts: SystemFont[]): SystemFont[] {
  const seen = new Set<string>()
  const unique: SystemFont[] = []

  for (const font of fonts) {
    const key = font.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(font)
    }
  }

  // 按名称排序
  return unique.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/**
 * 清除字体缓存（用于刷新字体列表）
 */
export function clearFontCache(): void {
  cachedFonts = null
  logger.info('字体缓存已清除')
}

/**
 * 获取系统字体文件路径列表（用于 resvg 等需要直接访问字体文件的场景）
 * 跨平台支持：Windows、macOS、Linux
 * 只返回实际存在的字体文件路径
 */
export function getSystemFontFiles(): string[] {
  const osPlatform = detectRuntimePlatform()
  let fontPaths: string[] = []

  if (osPlatform === 'win32') {
    fontPaths = [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/msyh.ttc', // 微软雅黑
      'C:/Windows/Fonts/simhei.ttf', // 黑体
      'C:/Windows/Fonts/simsun.ttc', // 宋体
      'C:/Windows/Fonts/segoeui.ttf', // Segoe UI
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/trebuc.ttf', // Trebuchet MS
      'C:/Windows/Fonts/tahoma.ttf',
      'C:/Windows/Fonts/verdana.ttf'
    ]
  } else if (osPlatform === 'darwin') {
    // macOS 字体路径
    fontPaths = [
      '/System/Library/Fonts/Helvetica.ttc',
      '/System/Library/Fonts/PingFang.ttc', // 苹方（中文）
      '/System/Library/Fonts/STHeiti Light.ttc', // 黑体
      '/System/Library/Fonts/STHeiti Medium.ttc',
      '/System/Library/Fonts/Times.ttc',
      '/System/Library/Fonts/Monaco.dfont',
      '/Library/Fonts/Arial.ttf',
      '/Library/Fonts/Microsoft/Microsoft YaHei.ttf' // 如果安装了 Office
    ]
  } else {
    // Linux/WSL 字体路径
    fontPaths = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', // 文泉驿微米黑
      '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', // 文泉驿正黑
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
    ]
  }

  // 过滤掉不存在的文件
  const existingFonts = fontPaths.filter((p) => {
    try {
      return existsSync(p)
    } catch {
      return false
    }
  })

  logger.debug(`找到 ${existingFonts.length} 个系统字体文件（共检查 ${fontPaths.length} 个）`)
  return existingFonts
}
