import { extractOutlineTreeFromMarkdown } from '../utils/md-utils'
import { convertLatexToMarkdown } from '../utils/latex-utils'
import { deserializeMetadataFromBuffer } from '../utils/metadata-sidecar'
import { getWorkspaceFoldersFromStorage } from '../utils/workspace-folders'
import { createRendererLogger } from '../utils/logger'
import type { ArticleMetaData, AIDialog, DocumentOutlineNode } from '../../../types'
import type { AgentSession } from '../types/agent'
import {
  DEFAULT_ARTICLE_META,
  DEFAULT_AI_DIALOGS,
  DEFAULT_OUTLINE_TREE,
  DEFAULT_AGENT_SESSIONS
} from '../constants/document'

const logger = createRendererLogger('DocumentLoader')

export type LoadedDocumentFormat = 'md' | 'tex' | 'txt'

export interface LoadedDocumentData {
  format: LoadedDocumentFormat
  markdown: string
  tex: string
  outline: DocumentOutlineNode
  meta: ArticleMetaData
  aiDialogs: AIDialog[]
  agentSessions: AgentSession[]
  lastView: 'editor' | 'outline' | 'article'
}

const cloneOutline = (node: DocumentOutlineNode): DocumentOutlineNode =>
  JSON.parse(JSON.stringify(node))

const cloneMeta = (meta: ArticleMetaData): ArticleMetaData => ({
  ...meta,
  keywords: Array.isArray(meta.keywords) ? [...meta.keywords] : [],
  materialBasket: Array.isArray(meta.materialBasket)
    ? JSON.parse(JSON.stringify(meta.materialBasket))
    : []
})

const cloneDialogs = (dialogs: AIDialog[]): AIDialog[] => JSON.parse(JSON.stringify(dialogs))

const cloneAgentSessions = (sessions: AgentSession[]): AgentSession[] =>
  JSON.parse(JSON.stringify(sessions))

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/g, '\n')

const autoGenerateTitle = (meta: ArticleMetaData, source: string): ArticleMetaData => {
  if (meta.title && meta.title.trim().length > 0) {
    return meta
  }

  const lines = source.trim().split(/\n+/)
  for (const line of lines) {
    const match = line.match(/^(#+)\s+(.*)$/)
    if (match) {
      return { ...meta, title: match[2].trim().slice(0, 50) }
    }
  }

  return {
    ...meta,
    title: source.trim().slice(0, 50)
  }
}

const deriveMarkdownOutline = (markdown: string): DocumentOutlineNode =>
  cloneOutline(extractOutlineTreeFromMarkdown(markdown) ?? DEFAULT_OUTLINE_TREE)

const ensureArrayDialogs = (value: unknown): AIDialog[] => {
  if (Array.isArray(value)) {
    return cloneDialogs(value as AIDialog[])
  }
  return cloneDialogs(DEFAULT_AI_DIALOGS)
}

const ensureArrayAgentSessions = (value: unknown): AgentSession[] => {
  if (Array.isArray(value)) {
    return cloneAgentSessions(value as AgentSession[])
  }
  return cloneAgentSessions(DEFAULT_AGENT_SESSIONS)
}

/**
 * 从 `.metadoc/doc-meta/` 或 userData 读取文档元数据
 */
async function tryLoadDocumentMetadata(docPath: string): Promise<any | null> {
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      logger.warn('[tryLoadDocumentMetadata] IPC不可用')
      return null
    }

    const workspaceFolders = getWorkspaceFoldersFromStorage()
    const buffer = await messageBridge.invoke('read-document-metadata', {
      docPath,
      workspaceFolders
    })

    if (!buffer || (Array.isArray(buffer) && buffer.length === 0)) {
      return null
    }

    let uint8Buffer: Uint8Array
    if (buffer instanceof Uint8Array) {
      uint8Buffer = buffer
    } else if (Array.isArray(buffer)) {
      uint8Buffer = new Uint8Array(buffer)
    } else if (buffer instanceof ArrayBuffer) {
      uint8Buffer = new Uint8Array(buffer)
    } else {
      uint8Buffer = new Uint8Array(buffer as any)
    }

    return await deserializeMetadataFromBuffer(uint8Buffer)
  } catch (error) {
    logger.warn('[tryLoadDocumentMetadata] 读取失败', {
      error: error instanceof Error ? error.message : String(error),
      docPath
    })
    return null
  }
}

export const loadDocumentFromMarkdown = async (
  content: string,
  filePath?: string
): Promise<LoadedDocumentData> => {
  const pureMarkdown = normalizeLineEndings(content ?? '')

  let outline = deriveMarkdownOutline(pureMarkdown)
  let meta = cloneMeta(DEFAULT_ARTICLE_META)
  let dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)
  let sessions = cloneAgentSessions(DEFAULT_AGENT_SESSIONS)

  if (filePath) {
    const blob = await tryLoadDocumentMetadata(filePath)
    if (blob && typeof blob === 'object') {
      if (blob.current_article_meta_data) {
        meta = cloneMeta(blob.current_article_meta_data as ArticleMetaData)
      }
      if (blob.current_agent_sessions) {
        sessions = ensureArrayAgentSessions(blob.current_agent_sessions)
      }
    }
  }

  meta = autoGenerateTitle(meta, pureMarkdown)

  return {
    format: 'md',
    markdown: pureMarkdown,
    tex: '',
    outline,
    meta,
    aiDialogs: dialogs,
    agentSessions: sessions,
    lastView: 'editor'
  }
}

export const loadDocumentFromTex = async (
  content: string,
  filePath?: string
): Promise<LoadedDocumentData> => {
  const pureTex = normalizeLineEndings(content ?? '')
  let agentSessions = cloneAgentSessions(DEFAULT_AGENT_SESSIONS)
  let meta = cloneMeta(DEFAULT_ARTICLE_META)
  let dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)

  if (filePath) {
    const blob = await tryLoadDocumentMetadata(filePath)
    if (blob && typeof blob === 'object') {
      if (blob.current_article_meta_data) {
        meta = cloneMeta(blob.current_article_meta_data as ArticleMetaData)
      }
      if (blob.current_agent_sessions) {
        agentSessions = ensureArrayAgentSessions(blob.current_agent_sessions)
      }
    }
  }

  const markdown = convertLatexToMarkdown(pureTex ?? '')
  const outline = deriveMarkdownOutline(markdown)
  meta = autoGenerateTitle(meta, markdown)

  return {
    format: 'tex',
    markdown,
    tex: pureTex,
    outline,
    meta,
    aiDialogs: dialogs,
    agentSessions: agentSessions,
    lastView: 'editor'
  }
}

/**
 * 加载纯文本文档（txt, json 等）
 * 纯文本格式不包含元信息，只存储文本内容
 */
export const loadDocumentFromPlainText = (content: string): LoadedDocumentData => {
  const normalized = normalizeLineEndings(content ?? '')

  return {
    format: 'txt',
    markdown: normalized,
    tex: '',
    outline: cloneOutline(DEFAULT_OUTLINE_TREE),
    meta: cloneMeta(DEFAULT_ARTICLE_META),
    aiDialogs: cloneDialogs(DEFAULT_AI_DIALOGS),
    agentSessions: cloneAgentSessions(DEFAULT_AGENT_SESSIONS),
    lastView: 'editor'
  }
}

/**
 * 加载 JSON 文档（历史遗留格式，现在当作纯文本处理）
 * 为了向后兼容，如果 JSON 包含特定的 MetaDoc 格式，仍然尝试解析
 * 否则当作普通 JSON 文本处理
 */
export const loadDocumentFromJson = (content: string): LoadedDocumentData => {
  try {
    const data = JSON.parse(content ?? '{}') as Record<string, unknown>

    if ('current_article' in data || 'current_article_meta_data' in data) {
      const markdown = normalizeLineEndings((data.current_article as string) ?? '')
      const outline = deriveMarkdownOutline(markdown)
      const meta = cloneMeta(
        (data.current_article_meta_data as ArticleMetaData | undefined) ?? DEFAULT_ARTICLE_META
      )
      const dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)
      const sessions = ensureArrayAgentSessions(data.current_agent_sessions)

      return {
        format: 'md',
        markdown,
        tex: '',
        outline,
        meta: autoGenerateTitle(meta, markdown),
        aiDialogs: dialogs,
        agentSessions: sessions,
        lastView: 'editor'
      }
    } else {
      return loadDocumentFromPlainText(content)
    }
  } catch (error) {
    console.warn('[DocumentLoader] JSON 解析失败，当作纯文本处理', error)
    return loadDocumentFromPlainText(content)
  }
}

export const createEmptyDocument = (): LoadedDocumentData => ({
  format: 'md',
  markdown: '',
  tex: '',
  outline: cloneOutline(DEFAULT_OUTLINE_TREE),
  meta: cloneMeta(DEFAULT_ARTICLE_META),
  aiDialogs: cloneDialogs(DEFAULT_AI_DIALOGS),
  agentSessions: cloneAgentSessions(DEFAULT_AGENT_SESSIONS),
  lastView: 'editor'
})
