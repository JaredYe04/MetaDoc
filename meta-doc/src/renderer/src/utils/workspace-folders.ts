/**
 * 与 WorkspaceExplorer 一致：从 localStorage 读取工作区根目录列表。
 */
export function getWorkspaceFoldersFromStorage(): string[] {
  try {
    const raw = localStorage.getItem('workspaceFolders')
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === 'string' && x.trim())
      : []
  } catch {
    return []
  }
}
