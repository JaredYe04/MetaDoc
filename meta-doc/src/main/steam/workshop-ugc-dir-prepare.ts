import fs from 'fs'
import path from 'path'
import { readMetadocUgcManifestFromDir, extractMetadocUgcZipBuffer } from './metadoc-ugc-pack'

/** 在目录中查找含 metadoc-ugc.json 的子目录（浅层） */
export function findDirWithMetadocManifest(startDir: string): string | null {
  if (!fs.existsSync(startDir)) return null
  if (readMetadocUgcManifestFromDir(startDir)) return startDir
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(startDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const sub = path.join(startDir, e.name)
    if (readMetadocUgcManifestFromDir(sub)) return sub
  }
  return null
}

/**
 * 确保 dir 下可直接读到 metadoc-ugc.json：若仅有 zip（Steam 下载的工坊包），则解压到同目录。
 */
export async function ensureWorkshopDirHasManifest(dir: string): Promise<void> {
  if (readMetadocUgcManifestFromDir(dir)) return
  if (findDirWithMetadocManifest(dir)) return

  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    throw new Error('no_manifest')
  }
  const zips = names.filter((n) => n.toLowerCase().endsWith('.zip'))
  for (const z of zips) {
    const zp = path.join(dir, z)
    try {
      const buf = fs.readFileSync(zp)
      await extractMetadocUgcZipBuffer(buf, dir)
    } catch {
      continue
    }
    if (readMetadocUgcManifestFromDir(dir)) return
    const nested = findDirWithMetadocManifest(dir)
    if (nested) return
  }
  throw new Error('no_manifest')
}

/** 在已含 manifest 的目录树中解析应传给安装器的根目录（与 manifest 同级资源） */
export function resolveInstallContentDir(baseDir: string): string {
  const found = findDirWithMetadocManifest(baseDir)
  if (found) return found
  if (readMetadocUgcManifestFromDir(baseDir)) return baseDir
  throw new Error('no_manifest')
}
