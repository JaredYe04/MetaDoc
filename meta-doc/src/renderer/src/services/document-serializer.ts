import { filterMetaDataFromMd } from '../utils/md-utils.js';
import { convertMarkdownToLatex, convertLatexToMarkdown } from '../utils/latex-utils.js';
import type { WorkspaceDocument } from '../stores/workspace';
import { serializeMetadataToBase64 } from '../utils/metadata-serializer';

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

const buildMarkdownMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_agent_sessions: doc.agentSessions,
});

const buildTexMetadataPayload = (doc: WorkspaceDocument) => ({
  current_article_meta_data: doc.meta,
  current_agent_sessions: doc.agentSessions,
});

const composeMarkdownWithMeta = async (doc: WorkspaceDocument, markdown: string): Promise<string> => {
  const pureMarkdown = filterMetaDataFromMd(markdown ?? '');
  // 序列化 metadata（现在是异步的，因为需要 zstd 压缩）
  const metadata = {
    current_article_meta_data: doc.meta,
    current_agent_sessions: doc.agentSessions,
  };
  const metaBase64 = await serializeMetadataToBase64(metadata);
  return `${pureMarkdown}\n<!--meta-info: ${metaBase64} -->`;
};

const composeTexWithMeta = async (doc: WorkspaceDocument, texContent: string): Promise<string> => {
  // 序列化 metadata（现在是异步的，因为需要 zstd 压缩）
  const metadata = buildTexMetadataPayload(doc);
  const metaBase64 = await serializeMetadataToBase64(metadata);
  let pureTex = texContent ?? '';

  pureTex = normalizeLineEndings(pureTex);
  pureTex = pureTex.replace(WARNING_PATTERN, '').replace(META_INFO_PATTERN, '');

  return `${WARNING_HEADER}%META-INFO: ${metaBase64}\n${pureTex}`.trimStart();
};

export const serializeDocument = async (doc: WorkspaceDocument): Promise<SaveDataPayload> => {

  const isTex = doc.format === 'tex';
  const markdownSource = isTex ? convertLatexToMarkdown(doc.tex ?? '') : doc.markdown ?? '';
  const normalizedMarkdown = normalizeLineEndings(markdownSource);
  const markdownWithMeta = await composeMarkdownWithMeta(doc, normalizedMarkdown);

  const jsonPayload = buildMarkdownMetadataPayload(doc);
  const json = JSON.stringify(jsonPayload);

  const texSource = isTex
    ? doc.tex ?? ''
    : await convertMarkdownToLatex(normalizedMarkdown, doc.meta?.title || 'Generated Document');
  const tex = await composeTexWithMeta(doc, texSource);

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

