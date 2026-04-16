/**
 * Steam 云同步：从 electron-store 导出设置时剔除敏感字段；拉取时与本地合并并保留未上云的密钥。
 */

/**
 * 不参与 settings.json 云同步的顶层 store 键：
 * - steamSyncMeta：内部元数据
 * - metadocUserTemplates：由 cloud/user-templates.json 单独同步，避免重复与体积膨胀
 */
export const STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS = new Set([
  'steamSyncMeta',
  'metadocUserTemplates'
])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 深拷贝并递归删除 apiKey（不上云） */
export function sanitizeSettingsForCloud(input: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(input)) as Record<string, unknown>
  stripSecretsInPlace(clone)
  return clone
}

function stripSecretsInPlace(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (key === 'apiKey') {
      delete obj[key]
      continue
    }
    const v = obj[key]
    if (isPlainObject(v)) {
      stripSecretsInPlace(v)
    }
  }
}

/**
 * 从 appStore 取出可推送至 Steam 的设置快照（已剔除顶层排除键与敏感字段）。
 */
export function pickSettingsForCloudPush(
  storeGetter: (key: string) => unknown,
  storeHas: (key: string) => boolean,
  listKeys: () => string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of listKeys()) {
    if (STEAM_CLOUD_EXCLUDED_TOP_LEVEL_KEYS.has(key)) continue
    if (!storeHas(key)) continue
    out[key] = storeGetter(key) as unknown
  }
  return sanitizeSettingsForCloud(out)
}

/**
 * 将云端设置合并进本地值：远程字段覆盖本地；缺失的 apiKey 等不因「空串」抹掉本地已有密钥。
 */
export function mergeSettingsFromCloudPull(local: unknown, remote: unknown): unknown {
  if (remote === undefined) return local
  if (remote === null) return local
  if (!isPlainObject(remote)) return remote
  if (!isPlainObject(local)) {
    const base: Record<string, unknown> = {}
    return mergePlainObjects(base, remote)
  }
  return mergePlainObjects({ ...local }, remote)
}

function mergePlainObjects(
  localObj: Record<string, unknown>,
  remoteObj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...localObj }
  for (const k of Object.keys(remoteObj)) {
    const rv = remoteObj[k]
    const lv = out[k]
    if (isPlainObject(rv) && isPlainObject(lv)) {
      out[k] = mergePlainObjects(lv, rv)
      continue
    }
    if (k === 'apiKey' && rv === '' && typeof lv === 'string' && lv.length > 0) {
      out[k] = lv
      continue
    }
    out[k] = rv
  }
  return out
}
