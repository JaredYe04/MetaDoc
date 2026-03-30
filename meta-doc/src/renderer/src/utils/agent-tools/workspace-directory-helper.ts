/**
 * 递归创建目录逻辑（可单独测试）
 * 主进程 create-directory 接收 { parentPath, folderName }，一次只创建一层。
 */

export function normalizePath(p: string): string {
  return p.replace(/[/\\]+/g, '/').replace(/\/+/g, '/')
}

export type IpcLike = {
  invoke(channel: string, arg?: unknown): Promise<unknown>
}

/**
 * 递归创建目录（类似 mkdir -p）
 * @param fullPath 完整路径（绝对或已解析）
 * @param ipc 必须提供；主进程 create-directory 接收 { parentPath, folderName }
 */
export async function ensureDirectoryRecursive(
  fullPath: string,
  ipc: IpcLike
): Promise<{ created: boolean; message: string; pathsCreated: string[] }> {
  const normalized = normalizePath(fullPath)

  let prefix = ''
  let rest = normalized
  const winMatch = normalized.match(/^([A-Za-z]:)(\/.*)?$/)
  if (winMatch) {
    prefix = winMatch[1]
    rest = winMatch[2] || ''
  }

  const segments = rest.split('/').filter((s) => s.length > 0)
  let current = prefix || (normalized.startsWith('/') ? '/' : '')
  let createdAny = false
  const pathsCreated: string[] = []

  for (const seg of segments) {
    if (!seg) continue
    const parentPath = current
    const folderName = seg
    const fullPathForSeg =
      !current || current === '/' ? (prefix ? `${prefix}/${seg}` : `/${seg}`) : `${current}/${seg}`

    try {
      const exists = await ipc.invoke('file-exists', fullPathForSeg)
      if (!exists) {
        await ipc.invoke('create-directory', { parentPath, folderName })
        createdAny = true
        pathsCreated.push(normalizePath(fullPathForSeg))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`创建目录失败: ${normalized}。${msg}`)
    }
    current = fullPathForSeg
  }

  if (createdAny) {
    return { created: true, message: `目录已创建: ${normalized}`, pathsCreated }
  }
  return { created: false, message: `目录已存在，未重复创建: ${normalized}`, pathsCreated: [] }
}
