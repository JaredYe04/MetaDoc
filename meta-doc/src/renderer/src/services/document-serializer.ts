import { filterMetaDataFromMd } from '../utils/md-utils.js'
import { convertMarkdownToLatex, convertLatexToMarkdown } from '../utils/latex-utils.js'
import type { WorkspaceDocument } from '../stores/workspace'
import { serializeMetadataToBase64 } from '../utils/metadata-serializer'
import { serializeMetadataToBuffer } from '../utils/metadata-sidecar'
import { getSetting } from '../utils/settings.js'

export interface SaveDataPayload {
  path: string
  md: string
  json: string
  tex: string
  format: string
  sidecarMetadata?: Uint8Array | Buffer // Sidecar文件的元信息（二进制，渲染进程是Uint8Array，主进程是Buffer）
  args?: {
    format: string
  }
}

const WARNING_HEADER =
  '% 请勿手动修改此行及下面的 META-INFO，否则可能导致 MetaDoc 无法识别元信息。Please do not manually modify this line and the META-INFO below, as it may cause MetaDoc to not recognize the metadata.\n'

const META_INFO_PATTERN = /%META-INFO:\s*[^\n]+\n?/
const WARNING_PATTERN = /% 请勿手动修改此行及下面的 META-INFO.*\n/

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/g, '\n')

const buildMarkdownMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_agent_sessions: doc.agentSessions
})

const buildTexMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_agent_sessions: doc.agentSessions
})

/**
 * 获取元信息保存模式
 * 'sidecar' - 保存到隐藏的伴生文件（默认）
 * 'embed' - 嵌入到文件注释中（当前模式）
 * 'none' - 不保存元信息
 */
async function getMetadataSaveMode(): Promise<'sidecar' | 'embed' | 'none'> {
  const mode = await getSetting('metadataSaveMode')
  if (mode === 'sidecar' || mode === 'embed' || mode === 'none') {
    return mode
  }
  return 'sidecar' // 默认使用sidecar模式
}

const composeMarkdownWithMeta = async (
  doc: WorkspaceDocument,
  markdown: string,
  mode: 'sidecar' | 'embed' | 'none'
): Promise<string> => {
  const pureMarkdown = filterMetaDataFromMd(markdown ?? '')

  if (mode === 'none') {
    return pureMarkdown
  }

  if (mode === 'sidecar') {
    // Sidecar模式：不嵌入元信息，返回纯Markdown
    return pureMarkdown
  }

  // Embed模式：嵌入元信息到注释中
  const metadata = {
    current_article_meta_data: doc.meta,
    current_agent_sessions: doc.agentSessions
  }
  const metaBase64 = await serializeMetadataToBase64(metadata)
  return `${pureMarkdown}\n<!--meta-info: ${metaBase64} -->`
}

const composeTexWithMeta = async (
  doc: WorkspaceDocument,
  texContent: string,
  mode: 'sidecar' | 'embed' | 'none'
): Promise<string> => {
  let pureTex = texContent ?? ''
  pureTex = normalizeLineEndings(pureTex)
  pureTex = pureTex.replace(WARNING_PATTERN, '').replace(META_INFO_PATTERN, '')

  if (mode === 'none') {
    return pureTex
  }

  if (mode === 'sidecar') {
    // Sidecar模式：不嵌入元信息，返回纯LaTeX
    return pureTex
  }

  // Embed模式：嵌入元信息到注释中
  const metadata = buildTexMetadataPayload(doc)
  const metaBase64 = await serializeMetadataToBase64(metadata)
  return `${WARNING_HEADER}%META-INFO: ${metaBase64}\n${pureTex}`.trimStart()
}

export const serializeDocument = async (doc: WorkspaceDocument): Promise<SaveDataPayload> => {
  // 对于纯文本格式（txt），不添加 meta-info，直接返回纯文本内容
  if (doc.format === 'txt') {
    const plainText = doc.markdown ?? ''
    const normalizedText = normalizeLineEndings(plainText)

    return {
      path: doc.path,
      md: normalizedText, // 纯文本，不添加 meta-info
      json: JSON.stringify({
        current_article_meta_data: doc.meta,
        current_agent_sessions: doc.agentSessions
      }),
      tex: '', // txt 格式不需要 tex
      format: doc.format,
      args: {
        format: doc.format
      }
    }
  }

  // 只有md和tex格式支持元信息
  const supportsMetadata = doc.format === 'md' || doc.format === 'tex'
  const metadataMode = supportsMetadata ? await getMetadataSaveMode() : 'none'

  const isTex = doc.format === 'tex'
  const markdownSource = isTex ? convertLatexToMarkdown(doc.tex ?? '') : (doc.markdown ?? '')
  const normalizedMarkdown = normalizeLineEndings(markdownSource)
  const markdownWithMeta = await composeMarkdownWithMeta(doc, normalizedMarkdown, metadataMode)

  const jsonPayload = buildMarkdownMetadataPayload(doc)
  const json = JSON.stringify(jsonPayload)

  const texSource = isTex
    ? (doc.tex ?? '')
    : await convertMarkdownToLatex(normalizedMarkdown, doc.meta?.title || 'Generated Document')
  const tex = await composeTexWithMeta(doc, texSource, metadataMode)

  // 如果使用sidecar模式，准备元信息Buffer
  // 在渲染进程中返回Uint8Array，主进程会转换为Buffer
  let sidecarMetadata: Uint8Array | Buffer | undefined
  if (supportsMetadata && metadataMode === 'sidecar') {
    const metadata = isTex ? buildTexMetadataPayload(doc) : buildMarkdownMetadataPayload(doc)
    sidecarMetadata = await serializeMetadataToBuffer(metadata)
  }

  return {
    path: doc.path,
    md: markdownWithMeta,
    json,
    tex,
    format: doc.format,
    sidecarMetadata,
    args: {
      format: doc.format
    }
  }
}
