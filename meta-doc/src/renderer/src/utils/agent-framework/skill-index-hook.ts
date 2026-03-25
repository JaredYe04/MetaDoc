/**
 * 在写入 `.metadoc/skills/<folder>/SKILL.md` 后触发增量索引（embedding + SQLite）
 */

import messageBridge from '../../bridge/message-bridge'
import { createRendererLogger } from '../logger'

const logger = createRendererLogger('SkillIndexHook')

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 400

export function pathLooksLikeWorkspaceSkillMd(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false
  const n = filePath.replace(/\\/g, '/')
  return /\/\.metadoc\/skills\/[^/]+\/SKILL\.md$/i.test(n)
}

/**
 * 在 edit / workspace 写盘成功后调用；会去抖并请求主进程 upsert 单文件索引
 */
export function scheduleSkillIndexSyncAfterWrite(absPath: string): void {
  if (!pathLooksLikeWorkspaceSkillMd(absPath)) return
  const key = absPath.replace(/\\/g, '/').toLowerCase()
  const prev = debounceTimers.get(key)
  if (prev) clearTimeout(prev)
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key)
      messageBridge
        .invoke('agent-capabilities-upsert-skill-path', { path: absPath })
        .then((res: { success?: boolean; message?: string }) => {
          if (!res?.success) {
            logger.warn('[skill-index] upsert failed', res?.message)
          }
        })
        .catch((e) => logger.warn('[skill-index] upsert error', e))
    }, DEBOUNCE_MS)
  )
}
