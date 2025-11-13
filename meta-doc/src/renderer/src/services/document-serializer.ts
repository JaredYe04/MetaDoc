import { encodeJsonToBase64 } from '../utils/base64-utils';
import { filterMetaDataFromMd } from '../utils/md-utils.js';
import { convertMarkdownToLatex, convertLatexToMarkdown } from '../utils/latex-utils.js';
import type { WorkspaceDocument } from '../stores/workspace';

export interface SaveDataPayload {
  path: string;
  md: string;
  json: string;
  tex: string;
  format: string;
  args?: {
    format: string;
  };
}

const WARNING_HEADER =
  '% 请勿手动修改此行及下面的 META-INFO，否则可能导致 MetaDoc 无法识别元信息。Please do not manually modify this line and the META-INFO below, as it may cause MetaDoc to not recognize the metadata.\n';

const META_INFO_PATTERN = /%META-INFO:\s*[^\n]+\n?/;
const WARNING_PATTERN = /% 请勿手动修改此行及下面的 META-INFO.*\n/;

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/g, '\n');

const buildMarkdownMetadataPayload = (doc: WorkspaceDocument, markdown: string) => ({
  current_outline_tree: doc.outline,
  current_article: markdown,
  current_article_meta_data: doc.meta,
  current_ai_dialogs: doc.aiDialogs,
  current_agent_sessions: doc.agentSessions,
});

const buildTexMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_ai_dialogs: doc.aiDialogs,
  current_agent_sessions: doc.agentSessions,
});

const composeMarkdownWithMeta = (doc: WorkspaceDocument, markdown: string): string => {
  const pureMarkdown = filterMetaDataFromMd(markdown ?? '');
  const metaBase64 = encodeJsonToBase64({
    current_outline_tree: doc.outline,
    current_article_meta_data: doc.meta,
    current_ai_dialogs: doc.aiDialogs,
    current_agent_sessions: doc.agentSessions,
  });
  return `${pureMarkdown}\n<!--meta-info: ${metaBase64} -->`;
};

const composeTexWithMeta = (doc: WorkspaceDocument, texContent: string): string => {
  const metaBase64 = encodeJsonToBase64(buildTexMetadataPayload(doc));
  let pureTex = texContent ?? '';

  pureTex = normalizeLineEndings(pureTex);
  pureTex = pureTex.replace(WARNING_PATTERN, '').replace(META_INFO_PATTERN, '');

  return `${WARNING_HEADER}%META-INFO: ${metaBase64}\n${pureTex}`.trimStart();
};

export const serializeDocument = (doc: WorkspaceDocument): SaveDataPayload => {
  const isTex = doc.format === 'tex';
  const markdownSource = isTex ? convertLatexToMarkdown(doc.tex ?? '') : doc.markdown ?? '';
  const normalizedMarkdown = normalizeLineEndings(markdownSource);
  const markdownWithMeta = composeMarkdownWithMeta(doc, normalizedMarkdown);

  const jsonPayload = buildMarkdownMetadataPayload(doc, normalizeLineEndings(markdownWithMeta));
  const json = JSON.stringify(jsonPayload);

  const texSource = isTex
    ? doc.tex ?? ''
    : convertMarkdownToLatex(normalizedMarkdown, doc.meta?.title || 'Generated Document');
  const tex = composeTexWithMeta(doc, texSource);

  return {
    path: doc.path,
    md: markdownWithMeta,
    json,
    tex,
    format: doc.format,
    args: {
      format: doc.format,
    },
  };
};

