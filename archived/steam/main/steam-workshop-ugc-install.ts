import fs from 'fs'
import path from 'path'
import { appStore } from '../app-store'
import {
  addUserTemplate,
  setUserTemplateThumbnailCustom
} from '../user-templates/user-templates-store'
import type { MetadocUgcManifest } from './metadoc-ugc-types'

function normalizeLocaleId(raw: string): string {
  return raw.replace('-', '_').toLowerCase()
}

export function getAppLocaleForUgc(): string {
  try {
    const lang = appStore.get('lang') as string | undefined
    if (lang && typeof lang === 'string') return normalizeLocaleId(lang)
  } catch {
    /* ignore */
  }
  return 'zh_cn'
}

export function resolveUgcLocaleBlock(
  manifest: MetadocUgcManifest,
  viewerLocale: string
): { locale: string; title: string; description: string; content: string } {
  const loc = normalizeLocaleId(viewerLocale)
  const def = normalizeLocaleId(manifest.defaultLocale || 'zh_cn')
  const pick = (k: string) => manifest.locales?.[k]
  const fromViewer = pick(loc)
  if (fromViewer) {
    return { locale: loc, ...fromViewer }
  }
  const fromDef = pick(def)
  if (fromDef) {
    return { locale: def, ...fromDef }
  }
  const firstKey = Object.keys(manifest.locales || {})[0]
  const fb = firstKey ? pick(firstKey) : undefined
  if (fb) {
    return { locale: firstKey, ...fb }
  }
  return {
    locale: def,
    title: 'Imported',
    description: '',
    content: ''
  }
}

export function installDocumentTemplateFromUgcDir(
  extractDir: string,
  manifest: MetadocUgcManifest
): { templateId: string } {
  if (manifest.kind !== 'document_template') {
    throw new Error('unsupported_ugc_kind')
  }
  const viewer = getAppLocaleForUgc()
  const block = resolveUgcLocaleBlock(manifest, viewer)
  const formatGuess = block.content.trimStart().startsWith('\\documentclass') ? 'tex' : 'md'
  const rec = addUserTemplate({
    formatId: formatGuess,
    locale: block.locale,
    title: block.title,
    description: block.description,
    content: block.content
  })
  const thumbName = manifest.thumbnail?.file || 'thumbnail.png'
  const thumbPath = path.join(extractDir, path.basename(thumbName))
  if (fs.existsSync(thumbPath)) {
    try {
      const buf = fs.readFileSync(thumbPath)
      setUserTemplateThumbnailCustom(rec.id, buf)
    } catch {
      /* ignore */
    }
  }
  return { templateId: rec.id }
}
