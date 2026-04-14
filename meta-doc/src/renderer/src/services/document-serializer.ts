import { convertMarkdownToLatex, convertLatexToMarkdown } from '../utils/latex-utils.js'
import type { WorkspaceDocument } from '../stores/workspace'
import { serializeMetadataToBuffer } from '../utils/metadata-sidecar'
import { getWorkspaceFoldersFromStorage } from '../utils/workspace-folders'

export interface SaveDataPayload {
  path: string
  md: string
  json: string
  tex: string
  format: string
  workspaceFolders: string[]
  documentMetadata?: Uint8Array | Buffer
  args?: {
    format: string
  }
}

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/g, '\n')

const buildMarkdownMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_agent_sessions: doc.agentSessions
})

const buildTexMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_agent_sessions: doc.agentSessions
})

export const serializeDocument = async (doc: WorkspaceDocument): Promise<SaveDataPayload> => {
  const workspaceFolders = getWorkspaceFoldersFromStorage()

  if (doc.format === 'txt') {
    const plainText = doc.markdown ?? ''
    const normalizedText = normalizeLineEndings(plainText)

    return {
      path: doc.path,
      md: normalizedText,
      json: JSON.stringify({
        current_article_meta_data: doc.meta,
        current_agent_sessions: doc.agentSessions
      }),
      tex: '',
      format: doc.format,
      workspaceFolders,
      args: {
        format: doc.format
      }
    }
  }

  const supportsMetadata = doc.format === 'md' || doc.format === 'tex'
  const isTex = doc.format === 'tex'
  const markdownSource = isTex ? convertLatexToMarkdown(doc.tex ?? '') : (doc.markdown ?? '')
  const normalizedMarkdown = normalizeLineEndings(markdownSource)

  const jsonPayload = buildMarkdownMetadataPayload(doc)
  const json = JSON.stringify(jsonPayload)

  const texSource = isTex
    ? (doc.tex ?? '')
    : await convertMarkdownToLatex(normalizedMarkdown, doc.meta?.title || 'Generated Document')
  const tex = normalizeLineEndings(texSource)

  let documentMetadata: Uint8Array | Buffer | undefined
  if (supportsMetadata) {
    const metadata = isTex ? buildTexMetadataPayload(doc) : buildMarkdownMetadataPayload(doc)
    documentMetadata = await serializeMetadataToBuffer(metadata)
  }

  return {
    path: doc.path,
    md: normalizedMarkdown,
    json,
    tex,
    format: doc.format,
    workspaceFolders,
    documentMetadata,
    args: {
      format: doc.format
    }
  }
}
