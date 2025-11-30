import { reactive, ref, computed } from 'vue';
import type { ComputedRef } from 'vue';
import type {
  ArticleMetaData,
  DocumentOutlineNode,
  AIDialog,
  AIDialogMessage,
} from '../../../types';
import type { AgentSession } from '../types/agent';
import eventBus from '../utils/event-bus';
import { createRendererLogger } from '../utils/logger';
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils.js';
import { convertLatexToMarkdown } from '../utils/latex-utils.js';
import { findFormatById, findFormatTemplate, getSupportedFormats } from '../constants/supported-formats';
import type { SupportedFormat } from '../types/formats';
import { saveWorkspaceDocument } from '../services/document-save';
import {
  DEFAULT_ARTICLE_META,
  DEFAULT_AI_DIALOGS,
  DEFAULT_OUTLINE_TREE,
  DEFAULT_AGENT_SESSIONS,
} from '../constants/document';

export type WorkspaceTabKind = 'new' | 'file';
export type WorkspaceTabFormat = 'md' | 'tex';

export interface WorkspaceTab {
  id: string;
  kind: WorkspaceTabKind;
  title: string;
  subtitle: string;
  path: string;
  format: WorkspaceTabFormat;
  dirty: boolean;
  readonly?: boolean;
}

export interface WorkspaceDocument {
  id: string;
  tabId: string;
  path: string;
  format: WorkspaceTabFormat;
  markdown: string;
  tex: string;
  outline: DocumentOutlineNode;
  meta: ArticleMetaData;
  aiDialogs: AIDialog[];
  agentSessions: AgentSession[];
  lastView: 'outline' | 'article';
  renderedHtml: string;
  dirty: boolean;
  savedMarkdown: string;
  savedTex: string;
  savedOutline: DocumentOutlineNode;
  savedMeta: ArticleMetaData;
  savedAiDialogs: AIDialog[];
  savedAgentSessions: AgentSession[];
}



const UNTITLED_TITLE = '未命名文档';

export const tabs = reactive<WorkspaceTab[]>([]);
export const activeTabId = ref<string>('');

const documents = reactive<Record<string, WorkspaceDocument>>({});

let suppressDirtyBroadcast = false;

function withDirtyBroadcastSuppressed<T>(fn: () => T): T {
  const prev = suppressDirtyBroadcast;
  suppressDirtyBroadcast = true;
  try {
    return fn();
  } finally {
    suppressDirtyBroadcast = prev;
  }
}

// ===== 全局UI锁：用于在执行关键任务时禁用导航、切换等交互 =====
const uiLockCount = ref(0);
const uiLocked = computed(() => uiLockCount.value > 0);
function lockUI(): void {
  uiLockCount.value += 1;
}
function unlockUI(): void {
  uiLockCount.value = Math.max(0, uiLockCount.value - 1);
}

ensureInitialTab();

/**
 * 确保一个标签页的文档存在
 * @param tabId 标签页ID
 * @returns 标签页文档
 */
function ensureDocument(tabId: string): WorkspaceDocument {
  let doc = documents[tabId];
  if (!doc) {
    const tabInfo = tabs.find((tab) => tab.id === tabId);
    const snapshot =
      tabInfo?.kind === 'new'
        ? createDocumentSnapshotFromTemplate('md', '')
        : captureCurrentDocumentSnapshot(tabId);
    doc = reactive(snapshot) as WorkspaceDocument;
    doc.dirty = false;
    doc.markdown = snapshot.markdown;
    doc.tex = snapshot.tex;
    doc.meta = structuredCloneFallback(snapshot.meta);
    doc.outline = structuredCloneFallback(snapshot.outline);
    doc.aiDialogs = structuredCloneFallback(snapshot.aiDialogs);
    doc.agentSessions = structuredCloneFallback(snapshot.agentSessions);
    doc.renderedHtml = snapshot.renderedHtml;
    doc.lastView = snapshot.lastView;
    doc.savedMarkdown = snapshot.markdown;
    doc.savedTex = snapshot.tex;
    doc.savedMeta = structuredCloneFallback(snapshot.meta);
    doc.savedOutline = structuredCloneFallback(snapshot.outline);
    doc.savedAiDialogs = structuredCloneFallback(snapshot.aiDialogs);
    doc.savedAgentSessions = structuredCloneFallback(snapshot.agentSessions);
    documents[tabId] = doc;
  }
  return doc;
}



const activeTab = computed(() => {
  const currentId = activeTabId.value;
  return tabs.find((tab) => tab.id === currentId) ?? null;
}) as ComputedRef<WorkspaceTab | null>;

const activeDocument = computed<WorkspaceDocument | null>(() => {
  const tab = activeTab.value;
  if (!tab) return null;
  return ensureDocument(tab.id);
});

/**
 * 提取文件名
 * @param fullPath 文件路径
 * @returns 文件名
 */
function extractFileName(fullPath: string): string {
  if (!fullPath) return '';
  const segments = fullPath.split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] ?? '';
}

/**
 * 结构化克隆一个值
 * @param value 要克隆的值
 * @returns 克隆后的值
 */
function structuredCloneFallback<T>(value: T): T {
  if (typeof value === 'undefined' || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeContent(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\r\n/g, '\n');
}

function ensureInitialTab(): void {
  if (tabs.length === 0) {
    const tab = createNewDocumentTabInternal();
    activeTabId.value = tab.id;
  } else if (!activeTabId.value) {
    activeTabId.value = tabs[0].id;
  }
}

/**
 * 捕获当前活动标签页的文档快照
 * @param tabId 标签页ID
 * @returns 文档快照
 */
function captureCurrentDocumentSnapshot(tabId: string): WorkspaceDocument {
  const existing = documents[tabId];
  if (existing) {
    const cloned = structuredCloneFallback(existing);
    cloned.id = tabId;
    cloned.tabId = tabId;
    return cloned;
  }

  const template = createDocumentSnapshotFromTemplate('md', '');
  template.id = tabId;
  template.tabId = tabId;
  return template;
}

/**
 * 刷新当前活动标签页的元数据
 */
function refreshActiveTabMetadata(): void {
  const tab = activeTab.value;
  if (!tab || tab.kind !== 'file') return;
  const doc = ensureDocument(tab.id);
  const fileName = extractFileName(doc.path);
  const metaTitle = (doc.meta?.title || '').trim();
  tab.subtitle = fileName;
  tab.title = metaTitle || fileName || UNTITLED_TITLE;
}


/**
 * 生成一个唯一的标签页ID
 * @returns 唯一的标签页ID
 */
function generateTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 添加一个标签页
 * @param snapshot 标签页快照
 * @param overrides 标签页覆盖选项
 * @returns 添加的标签页
 */
function addDocumentTab(
  snapshot: WorkspaceDocument,
  overrides: Partial<WorkspaceTab> = {},
): WorkspaceTab {
  const id = overrides.id ?? generateTabId();
  const clonedSnapshot = structuredCloneFallback(snapshot);
  clonedSnapshot.id = id;
  clonedSnapshot.tabId = id;
  clonedSnapshot.dirty = Boolean(clonedSnapshot.dirty);
  documents[id] = reactive(clonedSnapshot) as WorkspaceDocument;

  const fallbackTitle =
    clonedSnapshot.meta.title ||
    extractFileName(clonedSnapshot.path) ||
    UNTITLED_TITLE;
  const fallbackSubtitle = extractFileName(clonedSnapshot.path) || '';

  const tab = reactive<WorkspaceTab>({
    id,
    kind: overrides.kind !== undefined ? overrides.kind : 'file',
    title: overrides.title !== undefined ? overrides.title : fallbackTitle,
    subtitle: overrides.subtitle !== undefined ? overrides.subtitle : fallbackSubtitle,
    path: clonedSnapshot.path,
    format: clonedSnapshot.format,
    dirty: overrides.dirty !== undefined ? overrides.dirty : clonedSnapshot.dirty,
    readonly: overrides.readonly !== undefined ? overrides.readonly : false,
  });

  tabs.push(tab);
  return tab;
}

function createNewDocumentTabInternal(): WorkspaceTab {
  const snapshot = createDocumentSnapshotFromTemplate('md', '');
  return addDocumentTab(snapshot, {
    kind: 'new',
    title: '新建文档',
    subtitle: '',
    dirty: false,
    readonly: false,
  });
}

/**
 * 删除一个标签页
 * @param id 标签页ID
 */
function removeTab(id: string): void {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const wasActive = activeTabId.value === id;
  tabs.splice(index, 1);
  delete documents[id];

  if (!tabs.length) {
    const tab = createNewDocumentTabInternal();
    activeTabId.value = tab.id;
    updateDocumentDirty(tab.id);
    return;
  }

  if (wasActive) {
    const fallback = tabs[index] || tabs[index - 1] || tabs[0];
    if (fallback) {
      activateTab(fallback.id);
    }
  }
}

/**
 * 激活一个标签页
 * @param id 标签页ID
 */
function activateTab(id: string): void {
  if (activeTabId.value === id) return;
  if (!tabs.some((tab) => tab.id === id)) return;
  activeTabId.value = id;
  refreshActiveTabMetadata();
}

/**
 * 检测内容格式（LaTeX或Markdown）
 * @param content 文档内容
 * @returns 'tex' | 'md' 检测到的格式
 */
export function detectDocumentFormat(content: string): 'tex' | 'md' {
  if (!content || content.trim().length === 0) {
    return 'md' // 空内容默认Markdown
  }
  
  // LaTeX特征检测
  const latexPatterns = [
    /\\documentclass/i,           // \documentclass
    /\\begin\{document\}/i,        // \begin{document}
    /\\section\{/i,                // \section{
    /\\subsection\{/i,            // \subsection{
    /\\subsubsection\{/i,          // \subsubsection{
    /\\chapter\{/i,                // \chapter{
    /\\part\{/i,                   // \part{
    /\\usepackage\{/i,             // \usepackage{
    /\\newcommand/i,               // \newcommand
    /\\def\s+\\/i,                 // \def \
    /\\title\{/i,                  // \title{
    /\\author\{/i,                 // \author{
    /\\maketitle/i,                // \maketitle
    /\\begin\{equation\}/i,        // \begin{equation}
    /\\begin\{align\}/i,           // \begin{align}
    /\\begin\{figure\}/i,          // \begin{figure}
    /\\begin\{table\}/i,           // \begin{table}
    /\\includegraphics/i,          // \includegraphics
    /\\ref\{/i,                    // \ref{
    /\\cite\{/i,                   // \cite{
    /\\label\{/i,                  // \label{
  ]
  
  // 检查是否包含LaTeX特征
  for (const pattern of latexPatterns) {
    if (pattern.test(content)) {
      return 'tex'
    }
  }
  
  // 默认返回Markdown
  return 'md'
}

/**
 * 更新一个标签页的Markdown内容
 * @param tabId 标签页ID
 * @param markdown 新的Markdown内容
 */
function updateDocumentMarkdown(tabId: string, markdown: string): void {
  //logger.debug('更新一个标签页的Markdown内容', { tabId, markdownPreview: markdown.substring(0, 100) });
  const doc = ensureDocument(tabId);
  const tab = tabs.find((t) => t.id === tabId)
  const normalized = normalizeContent(markdown);
  if (doc.markdown !== normalized) {
    doc.markdown = normalized;
    
    // 自动检测并设置格式（如果格式未确定或内容明显是LaTeX）
    if (tab && tab.kind === 'new' && !tab.path) {
      // 新建文档且未保存，可以自动检测格式
      const detectedFormat = detectDocumentFormat(normalized)
      if (detectedFormat === 'tex' && doc.format !== 'tex') {
        // 检测到LaTeX格式，更新格式
        doc.format = 'tex'
        tab.format = 'tex'
      } else if (detectedFormat === 'md' && doc.format !== 'md' && normalized.trim().length > 0) {
        // 检测到Markdown格式（且内容不为空），更新格式
        doc.format = 'md'
        tab.format = 'md'
      }
    }
    
    // 自动同步大纲树（从Markdown内容提取）
    if (doc.format === 'md' && normalized.trim().length > 0) {
      try {
        const newOutline = extractOutlineTreeFromMarkdown(normalized)
        if (newOutline && newOutline.children && newOutline.children.length >= 0) {
          // 只有当提取到有效大纲时才更新（允许空大纲）
          updateDocumentOutline(tabId, newOutline)
        }
      } catch (error) {
        // 提取大纲失败时，不更新大纲树，避免破坏现有结构
        const logger = createRendererLogger('Workspace')
        logger.warn('自动同步大纲树失败:', error)
      }
    }
    
    updateDocumentDirty(tabId);
  }
}

/**
 * 更新一个标签页的LaTeX内容
 * @param tabId 标签页ID
 * @param tex 新的LaTeX内容
 */
function updateDocumentTex(tabId: string, tex: string): void {
  const doc = ensureDocument(tabId);
  const tab = tabs.find((t) => t.id === tabId)
  const normalized = normalizeContent(tex);
  if (doc.tex !== normalized) {
    doc.tex = normalized;
    
    // 自动检测并设置格式（如果格式未确定）
    if (tab && tab.kind === 'new' && !tab.path) {
      // 新建文档且未保存，可以自动检测格式
      const detectedFormat = detectDocumentFormat(normalized)
      if (detectedFormat === 'tex' && doc.format !== 'tex') {
        // 检测到LaTeX格式，更新格式
        doc.format = 'tex'
        tab.format = 'tex'
      } else if (detectedFormat === 'md' && doc.format !== 'md' && normalized.trim().length > 0) {
        // 检测到Markdown格式（且内容不为空），更新格式
        doc.format = 'md'
        tab.format = 'md'
      }
    }
    
    // 自动同步大纲树（LaTeX需要先转换为Markdown再提取）
    if (doc.format === 'tex' && normalized.trim().length > 0) {
      try {
        // 将LaTeX转换为Markdown，然后提取大纲树
        const markdown = convertLatexToMarkdown(normalized)
        const newOutline = extractOutlineTreeFromMarkdown(markdown)
        if (newOutline && newOutline.children && newOutline.children.length >= 0) {
          // 只有当提取到有效大纲时才更新（允许空大纲）
          updateDocumentOutline(tabId, newOutline)
        }
      } catch (error) {
        // 提取大纲失败时，不更新大纲树，避免破坏现有结构
        const logger = createRendererLogger('Workspace')
        logger.warn('自动同步大纲树失败（LaTeX转换）:', error)
      }
    }
    
    updateDocumentDirty(tabId);
  }
}

/**
 * 更新一个标签页的元数据
 * @param tabId 标签页ID
 * @param updater 元数据更新函数
 */
function updateDocumentMeta(tabId: string, updater: (meta: ArticleMetaData) => void): void {
  const doc = ensureDocument(tabId);
  const before = JSON.stringify(doc.meta);
  updater(doc.meta);
  if (JSON.stringify(doc.meta) !== before) {
    syncTabMetadataFromDocument(tabId);
    updateDocumentDirty(tabId);
  }
}

/**
 * 更新一个标签页的大纲树
 * @param tabId 标签页ID
 * @param outline 新的大纲树
 */
function updateDocumentOutline(tabId: string, outline: DocumentOutlineNode): void {
  const doc = ensureDocument(tabId);
  const serialized = JSON.stringify(outline);
  if (JSON.stringify(doc.outline) !== serialized) {
    doc.outline = structuredCloneFallback(outline);
    updateDocumentDirty(tabId);
  }
}

/**
 * 更新一个标签页的AI对话消息
 * @param tabId 标签页ID
 * @param dialogs 新的AI对话消息
 */
function updateDocumentAiDialogs(tabId: string, dialogs: AIDialogMessage[]): void {
  const doc = ensureDocument(tabId);
  const serialized = JSON.stringify(dialogs);
  if (JSON.stringify(doc.aiDialogs) !== serialized) {
    doc.aiDialogs = structuredCloneFallback(dialogs);
    updateDocumentDirty(tabId);
  }
}

function updateDocumentAgentSessions(tabId: string, sessions: AgentSession[], skipDirtyCheck = false): void {
  const doc = ensureDocument(tabId);
  const serialized = JSON.stringify(sessions);
  if (JSON.stringify(doc.agentSessions) !== serialized) {
    doc.agentSessions = structuredCloneFallback(sessions);
    if (skipDirtyCheck) {
      // 如果跳过dirty检查，同步到savedAgentSessions，这样就不会被认为是dirty
      doc.savedAgentSessions = structuredCloneFallback(sessions);
      // 重新计算dirty状态（现在应该是false了）
      updateDocumentDirty(tabId);
    } else {
      updateDocumentDirty(tabId);
    }
  }
}

/**
 * 更新一个标签页的脏状态，根据文档内容计算脏状态
 * @param tabId 标签页ID
 */
function updateDocumentDirty(tabId: string): void {
  const doc = ensureDocument(tabId);
  function computeDocumentDirty(): boolean {
    if (doc.markdown !== doc.savedMarkdown) return true;
    if (doc.tex !== doc.savedTex) return true;
    if (JSON.stringify(doc.meta) !== JSON.stringify(doc.savedMeta)) return true;
    if (JSON.stringify(doc.outline) !== JSON.stringify(doc.savedOutline)) return true;
    if (JSON.stringify(doc.aiDialogs) !== JSON.stringify(doc.savedAiDialogs)) return true;
    if (JSON.stringify(doc.agentSessions) !== JSON.stringify(doc.savedAgentSessions)) return true;
    return false;
  }
  const dirty = computeDocumentDirty();
  doc.dirty = dirty;

  const tab = tabs.find((item) => item.id === tabId);
  if (tab) {
    tab.dirty = dirty;
    if (tab.id === activeTabId.value) {
      eventBus.emit('is-need-save', dirty);
    }
  }
}

/**
 * 更新一个标签页的最后视图
 * @param tabId 标签页ID
 * @param view 新的最后视图
 */
function updateDocumentLastView(tabId: string, view: 'outline' | 'article'): void {
  const doc = ensureDocument(tabId);
  if (doc.lastView !== view) {
    doc.lastView = view;
  }
}

/**
 * 更新一个标签页的渲染后的HTML
 * @param tabId 标签页ID
 * @param html 新的渲染后的HTML
 */
function updateDocumentRenderedHtml(tabId: string, html: string): void {
  const doc = ensureDocument(tabId);
  if (doc.renderedHtml !== html) {
    doc.renderedHtml = html;
  }
}

function syncTabMetadataFromDocument(tabId: string): void {
  const tab = tabs.find((item) => item.id === tabId);
  const doc = documents[tabId];
  if (!tab || !doc) return;

  const fileName = extractFileName(doc.path);
  const title = (doc.meta?.title || '').trim();

  tab.path = doc.path;
  tab.format = doc.format;
  tab.subtitle = fileName;
  tab.title = title || fileName || UNTITLED_TITLE;
}

function markDocumentSaved(tabId: string, newPath?: string): void {
  const doc = ensureDocument(tabId);
  if (typeof newPath === 'string') {
    doc.path = newPath;
  }

  doc.savedMarkdown = doc.markdown;
  doc.savedTex = doc.tex;
  doc.savedOutline = structuredCloneFallback(doc.outline);
  doc.savedMeta = structuredCloneFallback(doc.meta);
  doc.savedAiDialogs = structuredCloneFallback(doc.aiDialogs);
  doc.savedAgentSessions = structuredCloneFallback(doc.agentSessions);
  doc.dirty = false;

  const tab = tabs.find((item) => item.id === tabId);
  if (tab) {
    if (typeof newPath === 'string') {
      tab.path = newPath;
    }
    tab.dirty = false;
  }

  syncTabMetadataFromDocument(tabId);

  if (activeTabId.value === tabId) {
    eventBus.emit('is-need-save', false);
  }
}

function createDocumentSnapshotFromTemplate(
  formatId: WorkspaceTabFormat,
  templateContent: string,
): WorkspaceDocument {
  const normalizedContent = normalizeContent(templateContent ?? '');
  const markdownContent =
    formatId === 'md' ? normalizedContent : convertLatexToMarkdown(normalizedContent);
  const texContent = formatId === 'tex' ? normalizedContent : '';

  const outlineSource = markdownContent || '';
  const outline =
    extractOutlineTreeFromMarkdown(outlineSource) ??
    structuredCloneFallback(DEFAULT_OUTLINE_TREE);

  const meta = structuredCloneFallback(DEFAULT_ARTICLE_META);

  return {
    id: '',
    tabId: '',
    path: '',
    format: formatId,
    markdown: markdownContent,
    tex: texContent,
    outline: structuredCloneFallback(outline),
    meta: structuredCloneFallback(meta),
    aiDialogs: structuredCloneFallback(DEFAULT_AI_DIALOGS),
    agentSessions: structuredCloneFallback(DEFAULT_AGENT_SESSIONS),
    lastView: 'article',
    renderedHtml: '',
    dirty: false,
    savedMarkdown: markdownContent,
    savedTex: texContent,
    savedOutline: structuredCloneFallback(outline),
    savedMeta: structuredCloneFallback(meta),
    savedAiDialogs: structuredCloneFallback(DEFAULT_AI_DIALOGS),
    savedAgentSessions: structuredCloneFallback(DEFAULT_AGENT_SESSIONS),
  };
}

function initializeDocumentFromTemplate(
  tabId: string,
  formatId: WorkspaceTabFormat,
  templateId?: string,
): void {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return;
  const format = findFormatById(formatId);
  if (!format) {
    throw new Error(`不支持的文档格式: ${formatId}`);
  }
  const template =
    findFormatTemplate(formatId, templateId) ??
    findFormatTemplate(formatId, format.defaultTemplateId) ??
    format.templates[0];

  const doc = ensureDocument(tabId);
  const snapshot = createDocumentSnapshotFromTemplate(formatId, template?.content ?? '');
  snapshot.id = tabId;
  snapshot.tabId = tabId;

  Object.assign(doc, snapshot);

  tab.kind = 'file';
  tab.format = formatId;
  tab.path = '';
  tab.dirty = false;
  tab.readonly = false;
  tab.subtitle = '';
  tab.title = UNTITLED_TITLE;

  markDocumentSaved(tabId);
  refreshActiveTabMetadata();
  updateDocumentDirty(tabId);
}

function openNewDocumentTab(): WorkspaceTab {
  const tab = createNewDocumentTabInternal();
  activateTab(tab.id);
  return tab;
}

function moveTab(tabId: string, targetId: string): void {
  if (tabId === targetId) return;
  const fromIndex = tabs.findIndex((tab) => tab.id === tabId);
  const toIndex = tabs.findIndex((tab) => tab.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [tab] = tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, tab as WorkspaceTab);
}

async function saveDocument(tabId: string, options?: { saveAs?: boolean }): Promise<boolean> {
  const logger = createRendererLogger('Workspace');
  logger.debug('保存文档', { tabId, options });
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab || tab.kind !== 'file') {
    return false;
  }
  const doc = ensureDocument(tabId);
  try {
    const result = await saveWorkspaceDocument(doc, options);
    if (result?.path) {
      markDocumentSaved(tabId, result.path);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('保存文档失败', error);
    throw error;
  }
}

async function saveAllDocuments(): Promise<{ saved: string[]; failed: string[] }> {
  const saved: string[] = [];
  const failed: string[] = [];
  const logger = createRendererLogger('Workspace');
  for (const tab of tabs) {
    if (tab.kind !== 'file') continue;
    const doc = ensureDocument(tab.id);
    const requiresSave = doc.path === '' || doc.dirty;
    if (!requiresSave) {
      continue;
    }

    try {
      const result = await saveWorkspaceDocument(doc, { saveAs: doc.path === '' });
      if (result?.path) {
        markDocumentSaved(tab.id, result.path);
        saved.push(tab.id);
      } else {
        failed.push(tab.id);
        break;
      }
    } catch (error) {
      logger.error('保存文档失败', error);
      failed.push(tab.id);
    }
  }

  return { saved, failed };
}

// ===== 跨窗口文档信息获取（用于设置窗口的Agent Tool测试） =====
import { sendBroadcast } from '../utils/event-bus'

/**
 * 初始化workspace的跨窗口事件监听器
 * 应该在应用启动时调用，而不是在模块加载时
 */
export function initializeWorkspaceBroadcastListeners(): void {
  // 监听来自设置窗口的文档信息请求
  eventBus.on('request-active-document-info', (requestId: string) => {
    const doc = activeDocument.value
    if (!doc) {
      sendBroadcast('setting', 'response-active-document-info', {
        requestId,
        document: null,
        error: '没有活动的文档'
      })
      return
    }

    // 根据文档格式获取对应的内容
    // 对于 LaTeX 文档，优先使用 tex 内容；对于 Markdown 文档，使用 markdown 内容
    const content = doc.format === 'tex' ? doc.tex : doc.markdown
    const hasContent = Boolean(content && content.trim().length > 0)

    // 发送文档信息（不包含完整内容，只包含必要信息）
    sendBroadcast('setting', 'response-active-document-info', {
      requestId,
      document: {
        id: doc.id,
        tabId: doc.tabId,
        path: doc.path,
        format: doc.format,
        meta: structuredCloneFallback(doc.meta),
        outline: structuredCloneFallback(doc.outline),
        markdown: doc.markdown,
        tex: doc.tex,
        hasContent: hasContent
      }
    })
  })

  // 监听来自设置窗口的文档内容请求
  eventBus.on('request-document-content', (requestId: string) => {
    const doc = activeDocument.value
    if (!doc) {
      sendBroadcast('setting', 'response-document-content', {
        requestId,
        content: null,
        error: '没有活动的文档'
      })
      return
    }

    sendBroadcast('setting', 'response-document-content', {
      requestId,
      content: {
        markdown: doc.markdown,
        tex: doc.tex,
        format: doc.format
      }
    })
  })
}

export function useWorkspace() {
  return {
    tabs,
    activeTabId,
    activeTab,
    documents,
    activeDocument,
    uiLocked,
    lockUI,
    unlockUI,
    activateTab,
    captureCurrentDocumentSnapshot,
    addDocumentTab,
    removeTab,
    ensureDocument,
    updateDocumentMarkdown,
    updateDocumentTex,
    updateDocumentMeta,
    updateDocumentOutline,
    updateDocumentAiDialogs,
    updateDocumentAgentSessions,
    updateDocumentDirty,
    updateDocumentLastView,
    updateDocumentRenderedHtml,
    markDocumentSaved,
    initializeDocumentFromTemplate,
    openNewDocumentTab,
    moveTab,
    saveDocument,
    saveAllDocuments,
    supportedFormats: getSupportedFormats(),
  };
}


