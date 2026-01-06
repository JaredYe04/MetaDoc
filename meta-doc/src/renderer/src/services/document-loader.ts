import { extractOutlineTreeFromMarkdown, filterMetaDataFromMd } from '../utils/md-utils';
import { convertLatexToMarkdown } from '../utils/latex-utils';
import { deserializeMetadataFromBase64 } from '../utils/metadata-serializer';
import type { ArticleMetaData, AIDialog, AIDialogMessage, DocumentOutlineNode } from '../../../types';
import type { AgentSession } from '../types/agent';
import {
  DEFAULT_ARTICLE_META,
  DEFAULT_AI_DIALOGS,
  DEFAULT_OUTLINE_TREE,
  DEFAULT_AGENT_SESSIONS,
} from '../constants/document';

export type LoadedDocumentFormat = 'md' | 'tex';

export interface LoadedDocumentData {
  format: LoadedDocumentFormat;
  markdown: string;
  tex: string;
  outline: DocumentOutlineNode;
  meta: ArticleMetaData;
  aiDialogs: AIDialog[];
  agentSessions: AgentSession[];
  lastView: 'editor' | 'outline' | 'article';
}

const META_INFO_COMMENT_PATTERN = /<!--meta-info:\s*([^-\s]+?)\s*-->/;
const META_INFO_TEX_PATTERN = /%META-INFO:\s*([^\n]+)/;
const WARNING_TEX_PATTERN = /% 请勿手动修改此行及下面的 META-INFO.*\n/;

const cloneOutline = (node: DocumentOutlineNode): DocumentOutlineNode =>
  JSON.parse(JSON.stringify(node));

const cloneMeta = (meta: ArticleMetaData): ArticleMetaData => ({
  ...meta,
  keywords: Array.isArray(meta.keywords) ? [...meta.keywords] : [],
});

const cloneDialogs = (dialogs: AIDialog[]): AIDialog[] =>
  JSON.parse(JSON.stringify(dialogs));

const cloneAgentSessions = (sessions: AgentSession[]): AgentSession[] =>
  JSON.parse(JSON.stringify(sessions));

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/g, '\n');

const autoGenerateTitle = (meta: ArticleMetaData, source: string): ArticleMetaData => {
  if (meta.title && meta.title.trim().length > 0) {
    return meta;
  }

  const lines = source.trim().split(/\n+/);
  for (const line of lines) {
    const match = line.match(/^(#+)\s+(.*)$/);
    if (match) {
      return { ...meta, title: match[2].trim().slice(0, 50) };
    }
  }

  return {
    ...meta,
    title: source.trim().slice(0, 50),
  };
};

const deriveMarkdownOutline = (markdown: string): DocumentOutlineNode =>
  cloneOutline(extractOutlineTreeFromMarkdown(markdown) ?? DEFAULT_OUTLINE_TREE);

const ensureArrayDialogs = (value: unknown): AIDialog[] => {
  if (Array.isArray(value)) {
    return cloneDialogs(value as AIDialog[]);
  }
  return cloneDialogs(DEFAULT_AI_DIALOGS);
};

const ensureArrayAgentSessions = (value: unknown): AgentSession[] => {
  if (Array.isArray(value)) {
    return cloneAgentSessions(value as AgentSession[]);
  }
  return cloneAgentSessions(DEFAULT_AGENT_SESSIONS);
};

export const loadDocumentFromMarkdown = async (content: string): Promise<LoadedDocumentData> => {
  const normalized = normalizeLineEndings(content ?? '');
  const metaMatch = normalized.match(META_INFO_COMMENT_PATTERN);
  const pureMarkdown = filterMetaDataFromMd(normalized);

  let outline = deriveMarkdownOutline(pureMarkdown);
  let meta = cloneMeta(DEFAULT_ARTICLE_META);
  let dialogs = cloneDialogs(DEFAULT_AI_DIALOGS);
  let sessions = cloneAgentSessions(DEFAULT_AGENT_SESSIONS);

  if (metaMatch && metaMatch[1]) {
    try {
      const metadata = await deserializeMetadataFromBase64(metaMatch[1]);
      if (metadata && typeof metadata === 'object') {
        if (metadata.current_article_meta_data) {
          meta = cloneMeta(metadata.current_article_meta_data as ArticleMetaData);
        }
        if (metadata.current_agent_sessions) {
          sessions = ensureArrayAgentSessions(metadata.current_agent_sessions);
        }
      }
    } catch (error) {
      console.warn('[DocumentLoader] 解析 Markdown 元信息失败', error);
      outline = deriveMarkdownOutline(pureMarkdown);
      meta = cloneMeta(DEFAULT_ARTICLE_META);
      dialogs = cloneDialogs(DEFAULT_AI_DIALOGS);
    }
  }

  meta = autoGenerateTitle(meta, pureMarkdown);

  return {
    format: 'md',
    markdown: pureMarkdown,
    tex: '',
    outline,
    meta,
    aiDialogs: dialogs,
    agentSessions: sessions,
    lastView: 'editor',
  };
};

export const loadDocumentFromTex = async (content: string): Promise<LoadedDocumentData> => {
  const normalized = normalizeLineEndings(content ?? '');
  const metaMatch = normalized.match(META_INFO_TEX_PATTERN);
  let pureTex = normalized.replace(META_INFO_TEX_PATTERN, '');
  pureTex = pureTex.replace(WARNING_TEX_PATTERN, '');
  let agentSessions = cloneAgentSessions(DEFAULT_AGENT_SESSIONS);
  let meta = cloneMeta(DEFAULT_ARTICLE_META);
  let dialogs = cloneDialogs(DEFAULT_AI_DIALOGS);

  if (metaMatch && metaMatch[1]) {
    try {
      const metadata = await deserializeMetadataFromBase64(metaMatch[1]);
      if (metadata && typeof metadata === 'object') {
        if (metadata.current_article_meta_data) {
          meta = cloneMeta(metadata.current_article_meta_data as ArticleMetaData);
        }
        if (metadata.current_agent_sessions) {
          agentSessions = ensureArrayAgentSessions(metadata.current_agent_sessions);
        }
      }
    } catch (error) {
      console.warn('[DocumentLoader] 解析 LaTeX 元信息失败', error);
    }
  }

  const markdown = convertLatexToMarkdown(pureTex ?? '');
  const outline = deriveMarkdownOutline(markdown);
  meta = autoGenerateTitle(meta, markdown);

  return {
    format: 'tex',
    markdown,
    tex: pureTex,
    outline,
    meta,
    aiDialogs: dialogs,
    agentSessions: agentSessions,
    lastView: 'editor',
  };
};

export const loadDocumentFromJson = (content: string): LoadedDocumentData => {
  try {
    const data = JSON.parse(content ?? '{}') as Record<string, unknown>;
    // JSON 格式现在只包含 meta 和 agent_sessions
    // 为了向后兼容，如果没有 markdown，使用空字符串
    const markdown = normalizeLineEndings((data.current_article as string) ?? '');
    // outline 从 markdown 内容提取（不再从 JSON 加载）
    const outline = deriveMarkdownOutline(markdown);
    const meta = cloneMeta(
      (data.current_article_meta_data as ArticleMetaData | undefined) ?? DEFAULT_ARTICLE_META,
    );
    // dialogs 不再从 JSON 加载，使用默认值
    const dialogs = cloneDialogs(DEFAULT_AI_DIALOGS);
    // agent_sessions 从 JSON 加载（如果存在）
    const sessions = ensureArrayAgentSessions(data.current_agent_sessions);

    return {
      format: 'md',
      markdown,
      tex: '',
      outline,
      meta: autoGenerateTitle(meta, markdown),
      aiDialogs: dialogs,
      agentSessions: sessions,
      lastView: 'editor',
    };
  } catch (error) {
    console.error('[DocumentLoader] 解析 JSON 文档失败', error);
    return {
      format: 'md',
      markdown: '',
      tex: '',
      outline: cloneOutline(DEFAULT_OUTLINE_TREE),
      meta: cloneMeta(DEFAULT_ARTICLE_META),
      aiDialogs: cloneDialogs(DEFAULT_AI_DIALOGS),
      agentSessions: cloneAgentSessions(DEFAULT_AGENT_SESSIONS),
      lastView: 'editor',
    };
  }
};

export const createEmptyDocument = (): LoadedDocumentData => ({
  format: 'md',
  markdown: '',
  tex: '',
  outline: cloneOutline(DEFAULT_OUTLINE_TREE),
  meta: cloneMeta(DEFAULT_ARTICLE_META),
  aiDialogs: cloneDialogs(DEFAULT_AI_DIALOGS),
  agentSessions: cloneAgentSessions(DEFAULT_AGENT_SESSIONS),
  lastView: 'editor',
});

