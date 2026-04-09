import { extractOutlineTreeFromMarkdown, filterMetaDataFromMd } from '../utils/md-utils'
import { convertLatexToMarkdown } from '../utils/latex-utils'
import { deserializeMetadataFromBase64 } from '../utils/metadata/metadata-serializer'
import { deserializeMetadataFromBuffer, getSidecarPath } from '../utils/metadata/metadata-sidecar'
import { createRendererLogger } from '../utils/common/logger'
import type {
  ArticleMetaData,
  AIDialog,
  AIDialogMessage,
  DocumentOutlineNode
} from '../../../types'
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

const META_INFO_COMMENT_PATTERN = /<!--meta-info:\s*([^-\s]+?)\s*-->/
const META_INFO_TEX_PATTERN = /%META-INFO:\s*([^\n]+)/
const WARNING_TEX_PATTERN = /% 请勿手动修改此行及下面的 META-INFO.*\n/

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
 * 尝试从Sidecar文件读取元信息
 * @param filePath 文件路径
 * @returns 元信息对象，如果读取失败返回null
 */
async function tryLoadMetadataFromSidecar(filePath: string): Promise<any | null> {
  try {
    const messageBridge = (await import('../bridge/message-bridge')).default
    if (!messageBridge.getIpc()) {
      logger.warn('[tryLoadMetadataFromSidecar] IPC不可用')
      return null
    }

    const sidecarPath = getSidecarPath(filePath)
    const buffer = await messageBridge.invoke('read-sidecar-file', { path: sidecarPath })

    if (!buffer || (Array.isArray(buffer) && buffer.length === 0)) {
      logger.warn('[tryLoadMetadataFromSidecar] Buffer为空或长度为0', {
        buffer: buffer,
        isNull: buffer === null,
        isUndefined: buffer === undefined,
        isArray: Array.isArray(buffer),
        length: buffer?.length
      })
      return null
    }

    // 将Buffer转换为Uint8Array（渲染进程兼容）
    // 在渲染进程中，Buffer可能被序列化为ArrayBuffer、Uint8Array或数组
    let uint8Buffer: Uint8Array
    if (buffer instanceof Uint8Array) {
      uint8Buffer = buffer
    } else if (Array.isArray(buffer)) {
      uint8Buffer = new Uint8Array(buffer)
    } else if (buffer instanceof ArrayBuffer) {
      uint8Buffer = new Uint8Array(buffer)
    } else {
      // 尝试从其他类型转换（包括Buffer，在渲染进程中会被序列化）
      uint8Buffer = new Uint8Array(buffer as any)
    }

    const metadata = await deserializeMetadataFromBuffer(uint8Buffer)
    logger.info('[tryLoadMetadataFromSidecar] 成功从Sidecar文件读取元信息', {
      hasMeta: !!metadata?.current_article_meta_data,
      hasSessions: !!metadata?.current_agent_sessions
    })
    return metadata
  } catch (error) {
    // Sidecar文件不存在或读取失败，返回null（不抛出错误，继续尝试其他方式）
    logger.warn('[tryLoadMetadataFromSidecar] 读取Sidecar文件失败', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      filePath
    })
    return null
  }
}

export const loadDocumentFromMarkdown = async (
  content: string,
  filePath?: string
): Promise<LoadedDocumentData> => {
  const normalized = normalizeLineEndings(content ?? '')
  const metaMatch = normalized.match(META_INFO_COMMENT_PATTERN)
  const pureMarkdown = filterMetaDataFromMd(normalized)

  let outline = deriveMarkdownOutline(pureMarkdown)
  let meta = cloneMeta(DEFAULT_ARTICLE_META)
  let dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)
  let sessions = cloneAgentSessions(DEFAULT_AGENT_SESSIONS)

  // 优先尝试从Sidecar文件读取元信息
  if (filePath) {
    logger.debug('[loadDocumentFromMarkdown] 尝试从Sidecar文件读取元信息', { filePath })
    const sidecarMetadata = await tryLoadMetadataFromSidecar(filePath)
    if (sidecarMetadata && typeof sidecarMetadata === 'object') {
      logger.info('[loadDocumentFromMarkdown] 成功从Sidecar文件读取元信息，使用Sidecar数据')
      if (sidecarMetadata.current_article_meta_data) {
        meta = cloneMeta(sidecarMetadata.current_article_meta_data as ArticleMetaData)
        logger.debug('[loadDocumentFromMarkdown] 已加载元信息', { title: meta.title })
      }
      if (sidecarMetadata.current_agent_sessions) {
        sessions = ensureArrayAgentSessions(sidecarMetadata.current_agent_sessions)
        logger.debug('[loadDocumentFromMarkdown] 已加载Agent会话', {
          sessionCount: sessions.length
        })
      }
    } else {
      logger.debug('[loadDocumentFromMarkdown] Sidecar文件读取失败或为空，尝试从注释中解析', {
        hasSidecarMetadata: !!sidecarMetadata,
        sidecarMetadataType: typeof sidecarMetadata,
        hasCommentMeta: !!metaMatch
      })
      // 如果没有Sidecar文件，尝试从注释中解析（向后兼容）
      if (metaMatch && metaMatch[1]) {
        try {
          const metadata = await deserializeMetadataFromBase64(metaMatch[1])
          if (metadata && typeof metadata === 'object') {
            if (metadata.current_article_meta_data) {
              meta = cloneMeta(metadata.current_article_meta_data as ArticleMetaData)
            }
            if (metadata.current_agent_sessions) {
              sessions = ensureArrayAgentSessions(metadata.current_agent_sessions)
            }
          }
        } catch (error) {
          logger.warn('[loadDocumentFromMarkdown] 解析 Markdown 注释中的元信息失败', error)
          outline = deriveMarkdownOutline(pureMarkdown)
          meta = cloneMeta(DEFAULT_ARTICLE_META)
          dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)
        }
      }
    }
  } else if (metaMatch && metaMatch[1]) {
    logger.debug('[loadDocumentFromMarkdown] 没有文件路径，从注释中解析元信息')
    // 如果没有文件路径，只能从注释中解析
    try {
      const metadata = await deserializeMetadataFromBase64(metaMatch[1])
      if (metadata && typeof metadata === 'object') {
        if (metadata.current_article_meta_data) {
          meta = cloneMeta(metadata.current_article_meta_data as ArticleMetaData)
        }
        if (metadata.current_agent_sessions) {
          sessions = ensureArrayAgentSessions(metadata.current_agent_sessions)
        }
      }
    } catch (error) {
      logger.warn('[loadDocumentFromMarkdown] 解析 Markdown 注释中的元信息失败', error)
      outline = deriveMarkdownOutline(pureMarkdown)
      meta = cloneMeta(DEFAULT_ARTICLE_META)
      dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)
    }
  } else {
    logger.debug('[loadDocumentFromMarkdown] 没有找到元信息（既没有Sidecar文件也没有注释）')
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
  const normalized = normalizeLineEndings(content ?? '')
  const metaMatch = normalized.match(META_INFO_TEX_PATTERN)
  let pureTex = normalized.replace(META_INFO_TEX_PATTERN, '')
  pureTex = pureTex.replace(WARNING_TEX_PATTERN, '')
  let agentSessions = cloneAgentSessions(DEFAULT_AGENT_SESSIONS)
  let meta = cloneMeta(DEFAULT_ARTICLE_META)
  let dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)

  // 优先尝试从Sidecar文件读取元信息
  if (filePath) {
    logger.debug('[loadDocumentFromTex] 尝试从Sidecar文件读取元信息', { filePath })
    const sidecarMetadata = await tryLoadMetadataFromSidecar(filePath)
    if (sidecarMetadata && typeof sidecarMetadata === 'object') {
      logger.info('[loadDocumentFromTex] 成功从Sidecar文件读取元信息，使用Sidecar数据')
      if (sidecarMetadata.current_article_meta_data) {
        meta = cloneMeta(sidecarMetadata.current_article_meta_data as ArticleMetaData)
        logger.debug('[loadDocumentFromTex] 已加载元信息', { title: meta.title })
      }
      if (sidecarMetadata.current_agent_sessions) {
        agentSessions = ensureArrayAgentSessions(sidecarMetadata.current_agent_sessions)
        logger.debug('[loadDocumentFromTex] 已加载Agent会话', {
          sessionCount: agentSessions.length
        })
      }
    } else {
      logger.debug('[loadDocumentFromTex] Sidecar文件读取失败或为空，尝试从注释中解析', {
        hasSidecarMetadata: !!sidecarMetadata,
        sidecarMetadataType: typeof sidecarMetadata,
        hasCommentMeta: !!metaMatch
      })
      // 如果没有Sidecar文件，尝试从注释中解析（向后兼容）
      if (metaMatch && metaMatch[1]) {
        try {
          const metadata = await deserializeMetadataFromBase64(metaMatch[1])
          if (metadata && typeof metadata === 'object') {
            if (metadata.current_article_meta_data) {
              meta = cloneMeta(metadata.current_article_meta_data as ArticleMetaData)
            }
            if (metadata.current_agent_sessions) {
              agentSessions = ensureArrayAgentSessions(metadata.current_agent_sessions)
            }
          }
        } catch (error) {
          logger.warn('[loadDocumentFromTex] 解析 LaTeX 注释中的元信息失败', error)
        }
      }
    }
  } else if (metaMatch && metaMatch[1]) {
    logger.debug('[loadDocumentFromTex] 没有文件路径，从注释中解析元信息')
    // 如果没有文件路径，只能从注释中解析
    try {
      const metadata = await deserializeMetadataFromBase64(metaMatch[1])
      if (metadata && typeof metadata === 'object') {
        if (metadata.current_article_meta_data) {
          meta = cloneMeta(metadata.current_article_meta_data as ArticleMetaData)
        }
        if (metadata.current_agent_sessions) {
          agentSessions = ensureArrayAgentSessions(metadata.current_agent_sessions)
        }
      }
    } catch (error) {
      logger.warn('[loadDocumentFromTex] 解析 LaTeX 注释中的元信息失败', error)
    }
  } else {
    logger.debug('[loadDocumentFromTex] 没有找到元信息（既没有Sidecar文件也没有注释）')
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

  // 纯文本格式不支持元信息、大纲等，使用默认值
  return {
    format: 'txt',
    markdown: normalized, // 纯文本内容存储在 markdown 字段中（作为普通文本处理）
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

    // 检查是否是 MetaDoc 的 JSON 格式（包含 current_article 字段）
    if ('current_article' in data || 'current_article_meta_data' in data) {
      // 历史遗留的 MetaDoc JSON 格式，尝试解析
      const markdown = normalizeLineEndings((data.current_article as string) ?? '')
      const outline = deriveMarkdownOutline(markdown)
      const meta = cloneMeta(
        (data.current_article_meta_data as ArticleMetaData | undefined) ?? DEFAULT_ARTICLE_META
      )
      const dialogs = cloneDialogs(DEFAULT_AI_DIALOGS)
      const sessions = ensureArrayAgentSessions(data.current_agent_sessions)

      return {
        format: 'md', // 历史格式仍当作 markdown 处理
        markdown,
        tex: '',
        outline,
        meta: autoGenerateTitle(meta, markdown),
        aiDialogs: dialogs,
        agentSessions: sessions,
        lastView: 'editor'
      }
    } else {
      // 普通 JSON 文件，当作纯文本处理
      return loadDocumentFromPlainText(content)
    }
  } catch (error) {
    // JSON 解析失败，当作普通文本处理
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
