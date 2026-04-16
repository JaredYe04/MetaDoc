import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import type { MetadocUgcManifest } from './metadoc-ugc-types'

const MANIFEST_NAME = 'metadoc-ugc.json'

export async function writeMetadocUgcZipToFile(
  outFile: string,
  manifest: MetadocUgcManifest,
  files: Record<string, Buffer>
): Promise<void> {
  const zip = new JSZip()
  zip.file(MANIFEST_NAME, JSON.stringify(manifest, null, 2))
  for (const [rel, buf] of Object.entries(files)) {
    const safe = rel.replace(/^\/+/, '').replace(/\.\./g, '')
    if (!safe) continue
    zip.file(safe, buf)
  }
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, data)
}

export function readMetadocUgcManifestFromDir(dir: string): MetadocUgcManifest | null {
  const p = path.join(dir, MANIFEST_NAME)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as MetadocUgcManifest
    if (!raw || raw.schemaVersion !== 1 || typeof raw.kind !== 'string') return null
    return raw
  } catch {
    return null
  }
}

export async function extractMetadocUgcZipBuffer(buf: Buffer, outDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(buf)
  fs.mkdirSync(outDir, { recursive: true })
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const dest = path.join(outDir, name)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const content = await entry.async('nodebuffer')
    fs.writeFileSync(dest, content)
  }
}
