/**
 * 终端编码工具（主进程）
 * 用于 Agent 终端执行时统一 UTF-8 与 Windows 下 chcp/解码逻辑，便于单元测试。
 */

import iconv from 'iconv-lite'

export type NodePlatform = NodeJS.Platform | string

/**
 * 将子进程 stdout/stderr 的 Buffer 按指定编码解码为字符串。
 * - 当 encoding 为 utf-8 时，Windows 下若 UTF-8 解码出现大量替换符则回退为 GBK（chcp 有时未生效）。
 */
export function decodeTerminalBuffer(
  data: Buffer,
  options: { encoding?: string; platform?: NodePlatform }
): string {
  const platform = options.platform ?? process.platform
  const enc = (options.encoding || '').toLowerCase().replace(/_/g, '-')

  if (enc === 'utf8' || enc === 'utf-8') {
    const utf8Str = data.toString('utf8')
    if (platform === 'win32') {
      const replacementCount = (utf8Str.match(/\uFFFD/g) || []).length
      if (replacementCount > 0) {
        try {
          return iconv.decode(data, 'gbk')
        } catch {
          return utf8Str
        }
      }
    }
    return utf8Str
  }

  if (enc) {
    try {
      return iconv.decode(data, enc)
    } catch {
      return data.toString('utf8')
    }
  }

  if (platform === 'win32') {
    return iconv.decode(data, 'gbk')
  }
  return data.toString('utf8')
}

/**
 * 为 Agent 调用构建实际传给 shell 的命令。
 * Windows 且 useUtf8 时在命令前加 chcp 65001，保证控制台输出为 UTF-8。
 */
export function buildRunCommandForAgent(
  command: string,
  useUtf8: boolean,
  platform: NodePlatform = process.platform
): string {
  if (platform === 'win32' && useUtf8) {
    return `chcp 65001 >nul && ${command}`
  }
  return command
}
