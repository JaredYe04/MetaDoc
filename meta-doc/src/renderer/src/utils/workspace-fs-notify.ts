/**
 * Agent / IPC 直接改磁盘后，向 WorkspaceExplorer 发出与主进程 chokidar 同形状的 directory-changed，
 * 避免仅靠文件监听时出现漏事件或延迟导致侧栏不刷新。
 */

import eventBus from './event-bus'
import { dirname } from './path-utils'
import { normalizePathForCompare } from './workspace-tree-logic'

export type WorkspaceSyntheticFsEventType = 'add' | 'addDir' | 'unlink' | 'unlinkDir'

/**
 * @param absolutePath 被创建、删除的**文件或目录**的绝对路径（与 workspace 工具中 normalize 后的路径一致即可）
 * @param eventType 与 DirectoryWatcherService 一致：add / addDir / unlink / unlinkDir
 */
export function notifyWorkspaceFilesystemChange(
  absolutePath: string,
  eventType: WorkspaceSyntheticFsEventType
): void {
  const trimmed = (absolutePath || '').trim()
  if (!trimmed) return

  const filePath = normalizePathForCompare(trimmed)
  const parentRaw = dirname(trimmed.replace(/\\/g, '/'))
  const parentPath = normalizePathForCompare(parentRaw)

  // 无父路径时增量更新无法挂载；unlinkDir 仍发出以便走回退刷新逻辑
  if (!parentPath && (eventType === 'add' || eventType === 'addDir' || eventType === 'unlink')) {
    return
  }

  eventBus.emit('directory-changed', {
    directoryPath: parentPath,
    parentPath,
    eventType,
    filePath
  })
}
