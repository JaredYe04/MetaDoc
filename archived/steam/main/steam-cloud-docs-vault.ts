import { randomUUID } from 'crypto'
import type { GreenworksApi } from './greenworks-loader'
import { readTextFromCloud, saveTextToCloud } from './steam-cloud'

const MANIFEST = 'docs/manifest.json'

export type CloudDocItem = {
  id: string
  title: string
  /** 相对路径 docs/items/<id>/body.md */
  path: string
  sizeBytes: number
  updatedAt: number
}

export type CloudDocsManifest = {
  version: 1
  items: CloudDocItem[]
}

function emptyManifest(): CloudDocsManifest {
  return { version: 1, items: [] }
}

export async function readManifestFromCloud(
  gw: GreenworksApi
): Promise<{ success: true; manifest: CloudDocsManifest } | { success: false; error: string }> {
  const r = await readTextFromCloud(gw, MANIFEST)
  if (!r.success) {
    return { success: false, error: r.error }
  }
  if (!r.content || !r.content.trim()) {
    return { success: true, manifest: emptyManifest() }
  }
  try {
    const m = JSON.parse(r.content) as CloudDocsManifest
    if (!m || m.version !== 1 || !Array.isArray(m.items)) {
      return { success: true, manifest: emptyManifest() }
    }
    return { success: true, manifest: m }
  } catch {
    return { success: false, error: 'invalid_manifest_json' }
  }
}

export async function writeManifestToCloud(
  gw: GreenworksApi,
  manifest: CloudDocsManifest
): Promise<{ success: true } | { success: false; error: string }> {
  return saveTextToCloud(gw, MANIFEST, JSON.stringify(manifest, null, 2))
}

function itemBodyPath(id: string): string {
  return `docs/items/${id}/body.md`
}

function itemMetaPath(id: string): string {
  return `docs/items/${id}/meta.json`
}

export async function listCloudDocs(
  gw: GreenworksApi
): Promise<{ success: true; items: CloudDocItem[] } | { success: false; error: string }> {
  const mr = await readManifestFromCloud(gw)
  if (!mr.success) {
    return { success: false, error: mr.error }
  }
  return { success: true, items: mr.manifest.items }
}

export async function getCloudDocBody(
  gw: GreenworksApi,
  id: string
): Promise<{ success: true; title: string; body: string } | { success: false; error: string }> {
  const mr = await readManifestFromCloud(gw)
  if (!mr.success) {
    return { success: false, error: mr.error }
  }
  const it = mr.manifest.items.find((x) => x.id === id)
  if (!it) {
    return { success: false, error: 'not_found' }
  }
  const br = await readTextFromCloud(gw, itemBodyPath(id))
  if (!br.success) {
    return br
  }
  return { success: true, title: it.title, body: br.content }
}

export async function putCloudDoc(
  gw: GreenworksApi,
  params: { id?: string; title: string; body: string }
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const title = (params.title || '').trim() || '未命名'
  const body = params.body ?? ''
  const id = params.id && params.id.length > 0 ? params.id : randomUUID()
  const mr = await readManifestFromCloud(gw)
  if (!mr.success) {
    return { success: false, error: mr.error }
  }
  const now = Date.now()
  const items = mr.manifest.items.filter((x) => x.id !== id)
  const sizeBytes = Buffer.byteLength(body, 'utf8')
  const path = itemBodyPath(id)
  const wr = await saveTextToCloud(gw, path, body)
  if (!wr.success) {
    return wr
  }
  const meta = JSON.stringify({ title, updatedAt: now }, null, 2)
  const wrMeta = await saveTextToCloud(gw, itemMetaPath(id), meta)
  if (!wrMeta.success) {
    return wrMeta
  }
  items.push({ id, title, path, sizeBytes, updatedAt: now })
  const wrM = await writeManifestToCloud(gw, { version: 1, items })
  if (!wrM.success) {
    return wrM
  }
  return { success: true, id }
}

export async function deleteCloudDoc(
  gw: GreenworksApi,
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const mr = await readManifestFromCloud(gw)
  if (!mr.success) {
    return { success: false, error: mr.error }
  }
  const next = mr.manifest.items.filter((x) => x.id !== id)
  const wrM = await writeManifestToCloud(gw, { version: 1, items: next })
  if (!wrM.success) {
    return wrM
  }
  await saveTextToCloud(gw, itemBodyPath(id), '')
  await saveTextToCloud(gw, itemMetaPath(id), '{}')
  return { success: true }
}

export async function renameCloudDoc(
  gw: GreenworksApi,
  id: string,
  title: string
): Promise<{ success: true } | { success: false; error: string }> {
  const mr = await readManifestFromCloud(gw)
  if (!mr.success) {
    return { success: false, error: mr.error }
  }
  const it = mr.manifest.items.find((x) => x.id === id)
  if (!it) {
    return { success: false, error: 'not_found' }
  }
  const t = title.trim() || it.title
  const items = mr.manifest.items.map((x) =>
    x.id === id ? { ...x, title: t, updatedAt: Date.now() } : x
  )
  return writeManifestToCloud(gw, { version: 1, items })
}

export async function estimateCloudDocsUsageBytes(
  gw: GreenworksApi
): Promise<
  { success: true; docsBytes: number; itemCount: number } | { success: false; error: string }
> {
  const mr = await readManifestFromCloud(gw)
  if (!mr.success) {
    return { success: false, error: mr.error }
  }
  let docsBytes = Buffer.byteLength(JSON.stringify(mr.manifest), 'utf8')
  for (const it of mr.manifest.items) {
    const br = await readTextFromCloud(gw, itemBodyPath(it.id))
    if (br.success) {
      docsBytes += Buffer.byteLength(br.content, 'utf8')
    }
    const tr = await readTextFromCloud(gw, itemMetaPath(it.id))
    if (tr.success) {
      docsBytes += Buffer.byteLength(tr.content, 'utf8')
    }
  }
  return { success: true, docsBytes, itemCount: mr.manifest.items.length }
}
