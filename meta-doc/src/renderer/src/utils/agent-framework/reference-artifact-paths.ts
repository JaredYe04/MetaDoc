/**
 * 判断引用 origin 是否可能指向本机可删除的引用产物文件（非 URL、非纯文本标签）。
 */
export function isLikelyFilesystemReferenceOrigin(origin: string): boolean {
  const o = String(origin || '').trim()
  if (!o) return false
  if (o.startsWith('http://') || o.startsWith('https://')) return false
  if (/^[a-zA-Z]:[\\/]/.test(o)) return true
  if (o.startsWith('/') || o.startsWith('\\\\')) return true
  return false
}
