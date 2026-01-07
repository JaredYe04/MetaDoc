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
import { isElectronEnv } from '../utils/event-bus';

export type WorkspaceTabKind = 'new' | 'file' | 'tool' | 'system';
export type WorkspaceTabFormat = 'md' | 'tex';

export type ToolTabType = 'ocr' | 'graph' | 'attachment' | 'dataAnalysis' | 'formulaRecognition' | 'aiChat' | 'setting';

export interface WorkspaceTab {
  id: string;
  kind: WorkspaceTabKind;
  title: string;
  subtitle: string;
  path: string;
  format: WorkspaceTabFormat;
  dirty: boolean;
  readonly?: boolean;
  toolType?: ToolTabType; // 工具Tab类型
  route?: string; // 路由路径（用于工具Tab）
}

export type DocumentView = 'outline' | 'editor' | 'visualize' | 'agent' | 'proofread';

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
  lastView: DocumentView;
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

// 懒加载logger，避免初始化顺序问题和循环依赖
let loggerInstance: ReturnType<typeof createRendererLogger> | null = null;

function getLogger() {
  if (!loggerInstance) {
    loggerInstance = createRendererLogger('Workspace');
  }
  return loggerInstance;
}

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

// ===== 抑制自动大纲同步标志：用于在从大纲生成文本时，避免反向同步导致死循环 =====
let suppressAutoOutlineSync = false;

/**
 * 在抑制自动大纲同步的情况下执行函数
 * 用于在从大纲生成文本时，避免触发自动大纲提取导致的死循环
 */
function withAutoOutlineSyncSuppressed<T>(fn: () => T): T;
function withAutoOutlineSyncSuppressed<T>(fn: () => Promise<T>): Promise<T>;
function withAutoOutlineSyncSuppressed<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const prev = suppressAutoOutlineSync;
  suppressAutoOutlineSync = true;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        suppressAutoOutlineSync = prev;
      }) as Promise<T>;
    }
    suppressAutoOutlineSync = prev;
    return result;
  } catch (error) {
    suppressAutoOutlineSync = prev;
    throw error;
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

  const tab = tabs[index];
  
  // 检查是否可以删除
  if (!canRemoveTab(id)) {
    return; // 不可删除的Tab，直接返回
  }
  
  const doc = documents[id];
  const wasActive = activeTabId.value === id;
  
  // 停止文件监听（如果文件路径存在）
  if (doc && doc.path) {
    // 异步停止文件监听（避免阻塞）
    (async () => {
      try {
        // 获取 ipcRenderer
        let ipcRenderer: any = null;
        if (typeof window !== 'undefined' && (window as any).electron) {
          ipcRenderer = (window as any).electron.ipcRenderer;
        } else {
          // 在非 Electron 环境中，使用 localIpcRenderer
          const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer');
          ipcRenderer = localIpcRenderer;
        }
        
        if (ipcRenderer) {
          ipcRenderer.send('unwatch-file', doc.path);
          const logger = createRendererLogger('Workspace');
          logger.debug('停止文件监听', { filePath: doc.path, tabId: id });
        }
      } catch (error) {
        const logger = createRendererLogger('Workspace');
        logger.warn('停止文件监听失败', { filePath: doc.path, tabId: id, error });
      }
    })();
  }
  
  tabs.splice(index, 1);
  delete documents[id];

  // 如果关闭后没有Tab了，创建一个系统Tab显示Dummy组件
  if (!tabs.length) {
    const dummyTab = openSystemTab('/dummy', '空白');
    activeTabId.value = dummyTab.id;
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
  
  // 如果激活的不是空白页Tab，检查是否有空白页Tab需要关闭
  const targetTab = tabs.find(tab => tab.id === id);
  if (targetTab && !(targetTab.kind === 'system' && targetTab.route === '/dummy')) {
    // 查找空白页Tab
    const dummyTab = tabs.find(tab => tab.kind === 'system' && tab.route === '/dummy');
    if (dummyTab && dummyTab.id !== id) {
      // 关闭空白页Tab
      const dummyIndex = tabs.findIndex(tab => tab.id === dummyTab.id);
      if (dummyIndex !== -1) {
        tabs.splice(dummyIndex, 1);
        delete documents[dummyTab.id];
      }
    }
  }
  
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
  const doc = ensureDocument(tabId);
  const tab = tabs.find((t) => t.id === tabId)
  const normalized = normalizeContent(markdown);
  const currentNormalized = normalizeContent(doc.markdown);
  
  // 如果规范化后的内容相同，说明只是规范化导致的差异，不触发更新
  if (normalized === currentNormalized) {
    getLogger().debug('忽略规范化导致的内容变化', {
      tabId,
      path: doc.path,
      markdownLength: normalized.length,
      currentMarkdownLength: currentNormalized.length,
    });
    return;
  }
  
  if (doc.markdown !== normalized) {
    // 检查是否只是末尾换行符的差异
    const savedNormalized = normalizeContent(doc.savedMarkdown ?? '');
    const normalizedTrimmed = normalized.trimEnd();
    const savedTrimmed = savedNormalized.trimEnd();
    
    // 如果去除末尾空白后内容相同，说明只是末尾空白字符的差异，不应该触发脏标记
    if (normalizedTrimmed === savedTrimmed && normalized !== savedNormalized) {
      getLogger().debug('检测到末尾空白字符差异，自动同步savedMarkdown', {
        tabId,
        path: doc.path,
        normalizedLength: normalized.length,
        savedLength: savedNormalized.length,
        normalizedEndsWith: JSON.stringify(normalized.slice(-5)),
        savedEndsWith: JSON.stringify(savedNormalized.slice(-5)),
      });
      // 自动同步 savedMarkdown，避免触发脏标记
      doc.savedMarkdown = normalized;
    }
    
    getLogger().debug('更新Markdown内容', {
      tabId,
      path: doc.path,
      oldLength: doc.markdown?.length ?? 0,
      newLength: normalized.length,
      diff: normalized.length - (doc.markdown?.length ?? 0),
    });
    
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
    // 只在编辑器视图时才自动同步，避免在outline视图时触发编辑器刷新
    // 如果设置了抑制标志，则不进行自动同步（避免从大纲生成文本时的死循环）
    if (!suppressAutoOutlineSync && doc.format === 'md' && normalized.trim().length > 0) {
      // 检查当前视图：只有在编辑器视图时才自动同步大纲树
      // 在outline视图时，大纲树是数据源，不应该从编辑器内容反向同步
      const currentView = doc.lastView ?? 'editor'
      // 兼容旧的'article'值（已被'editor'替代）
      if (currentView === 'editor' || (currentView as string) === 'article') {
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
    // 检查是否只是末尾换行符的差异
    const savedNormalized = normalizeContent(doc.savedTex ?? '');
    const normalizedTrimmed = normalized.trimEnd();
    const savedTrimmed = savedNormalized.trimEnd();
    
    // 如果去除末尾空白后内容相同，说明只是末尾空白字符的差异，不应该触发脏标记
    if (normalizedTrimmed === savedTrimmed && normalized !== savedNormalized) {
      getLogger().debug('检测到末尾空白字符差异，自动同步savedTex', {
        tabId,
        path: doc.path,
        normalizedLength: normalized.length,
        savedLength: savedNormalized.length,
        normalizedEndsWith: JSON.stringify(normalized.slice(-5)),
        savedEndsWith: JSON.stringify(savedNormalized.slice(-5)),
      });
      // 自动同步 savedTex，避免触发脏标记
      doc.savedTex = normalized;
    }
    
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
    // 只在编辑器视图时才自动同步，避免在outline视图时触发编辑器刷新
    // 如果设置了抑制标志，则不进行自动同步（避免从大纲生成文本时的死循环）
    if (!suppressAutoOutlineSync && doc.format === 'tex' && normalized.trim().length > 0) {
      // 检查当前视图：只有在编辑器视图时才自动同步大纲树
      // 在outline视图时，大纲树是数据源，不应该从编辑器内容反向同步
      const currentView = doc.lastView ?? 'editor'
      // 兼容旧的'article'值（已被'editor'替代）
      if (currentView === 'editor' || (currentView as string) === 'article') {
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
    // 大纲树是程序内部状态，不应该触发脏标记
    // 只有当大纲树被修改并同步到文档内容，导致文档内容改变时，才会通过updateDocumentMarkdown/updateDocumentTex触发脏标记
    // 因此这里不调用 updateDocumentDirty
  }
}

/**
 * 更新一个标签页的AI对话消息
 * @param tabId 标签页ID
 * @param dialogs 新的AI对话消息
 */
function updateDocumentAiDialogs(tabId: string, dialogs: AIDialog[]): void {
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
 * 找出两个文本的差异详情
 * @param current 当前文本
 * @param saved 保存的文本
 * @param maxContextLength 上下文最大长度
 * @returns 差异详情对象
 */
function findTextDiff(
  current: string,
  saved: string,
  maxContextLength: number = 50
): {
  diffPosition: number;
  diffLine: number;
  currentContext: string;
  savedContext: string;
  currentChar: string;
  savedChar: string;
} | null {
  if (current === saved) {
    return null;
  }

  const currentLength = current.length;
  const savedLength = saved.length;
  const minLength = Math.min(currentLength, savedLength);

  // 找出第一个不同的位置
  let diffPosition = minLength; // 默认差异在较短文本的末尾
  for (let i = 0; i < minLength; i++) {
    if (current[i] !== saved[i]) {
      diffPosition = i;
      break;
    }
  }
  // 如果循环完成都没有找到差异，说明差异在长度上（diffPosition已经是minLength）

  // 计算差异所在的行号（从1开始）
  const diffLine = current.substring(0, diffPosition).split('\n').length;

  // 获取差异位置的上下文
  const contextStart = Math.max(0, diffPosition - maxContextLength);
  const contextEnd = Math.min(
    currentLength,
    diffPosition + maxContextLength
  );
  const savedContextEnd = Math.min(
    savedLength,
    diffPosition + maxContextLength
  );

  const currentContext = current.substring(contextStart, contextEnd);
  const savedContext = saved.substring(contextStart, savedContextEnd);

  // 获取差异位置的字符
  const currentChar =
    diffPosition < currentLength
      ? JSON.stringify(current[diffPosition])
      : '(EOF)';
  const savedChar =
    diffPosition < savedLength
      ? JSON.stringify(saved[diffPosition])
      : '(EOF)';

  // 如果差异在末尾，尝试从末尾向前查找，找出真正的差异位置
  if (diffPosition === minLength && currentLength !== savedLength) {
    // 差异在长度上，尝试找出末尾的差异
    const maxCheck = Math.min(20, minLength); // 最多检查末尾20个字符
    let endDiffPosition = minLength;
    for (let i = 1; i <= maxCheck; i++) {
      const currentEnd = currentLength - i;
      const savedEnd = savedLength - i;
      if (currentEnd >= 0 && savedEnd >= 0 && current[currentEnd] !== saved[savedEnd]) {
        endDiffPosition = Math.min(currentEnd, savedEnd);
        break;
      }
    }
    if (endDiffPosition < minLength) {
      // 找到了末尾的差异位置
      return {
        diffPosition: endDiffPosition,
        diffLine: current.substring(0, endDiffPosition).split('\n').length,
        currentContext: current.substring(Math.max(0, endDiffPosition - maxContextLength), currentLength),
        savedContext: saved.substring(Math.max(0, endDiffPosition - maxContextLength), savedLength),
        currentChar: endDiffPosition < currentLength ? JSON.stringify(current[endDiffPosition]) : '(EOF)',
        savedChar: endDiffPosition < savedLength ? JSON.stringify(saved[endDiffPosition]) : '(EOF)',
      };
    }
  }

  return {
    diffPosition,
    diffLine,
    currentContext,
    savedContext,
    currentChar,
    savedChar,
  };
}

/**
 * 更新一个标签页的脏状态，根据文档内容计算脏状态
 * @param tabId 标签页ID
 */
function updateDocumentDirty(tabId: string): void {
  const doc = ensureDocument(tabId);
  function computeDocumentDirty(): boolean {
    // 只检查文档内容和元信息的变化，不检查大纲树
    // 大纲树是程序内部状态，不应该触发脏标记
    // 只有当大纲树被修改并同步到文档内容，导致文档内容改变时，才会通过markdownDiff或texDiff触发脏标记
    // 
    // 对于md文件：只检查markdown和元信息，不检查tex（tex是自动转换的内部状态）
    // 对于tex文件：只检查tex和元信息，不检查markdown（markdown是自动转换的内部状态）
    const markdownDiff = doc.format === 'md' && doc.markdown !== doc.savedMarkdown;
    const texDiff = doc.format === 'tex' && doc.tex !== doc.savedTex;
    const metaDiff = JSON.stringify(doc.meta) !== JSON.stringify(doc.savedMeta);
    const aiDialogsDiff = JSON.stringify(doc.aiDialogs) !== JSON.stringify(doc.savedAiDialogs);
    const agentSessionsDiff = JSON.stringify(doc.agentSessions) !== JSON.stringify(doc.savedAgentSessions);
    
    const isDirty = markdownDiff || texDiff || metaDiff || aiDialogsDiff || agentSessionsDiff;
    
    // 添加详细日志用于排查
    if (isDirty) {
      const logData: Record<string, any> = {
        tabId,
        path: doc.path,
        format: doc.format,
        markdownDiff,
        texDiff,
        metaDiff,
        aiDialogsDiff,
        agentSessionsDiff,
        markdownLength: doc.markdown?.length ?? 0,
        savedMarkdownLength: doc.savedMarkdown?.length ?? 0,
        texLength: doc.tex?.length ?? 0,
        savedTexLength: doc.savedTex?.length ?? 0,
      };

      // 如果Markdown有差异，记录详细差异信息
      if (markdownDiff) {
        const markdownDiffDetail = findTextDiff(
          doc.markdown ?? '',
          doc.savedMarkdown ?? ''
        );
        if (markdownDiffDetail) {
          logData.markdownDiffDetail = {
            diffPosition: markdownDiffDetail.diffPosition,
            diffLine: markdownDiffDetail.diffLine,
            currentContext: markdownDiffDetail.currentContext,
            savedContext: markdownDiffDetail.savedContext,
            currentChar: markdownDiffDetail.currentChar,
            savedChar: markdownDiffDetail.savedChar,
          };
        }
      }

      // 如果LaTeX有差异，记录详细差异信息
      if (texDiff) {
        const texDiffDetail = findTextDiff(
          doc.tex ?? '',
          doc.savedTex ?? ''
        );
        if (texDiffDetail) {
          logData.texDiffDetail = {
            diffPosition: texDiffDetail.diffPosition,
            diffLine: texDiffDetail.diffLine,
            currentContext: texDiffDetail.currentContext,
            savedContext: texDiffDetail.savedContext,
            currentChar: texDiffDetail.currentChar,
            savedChar: texDiffDetail.savedChar,
          };
        }
      }

      getLogger().debug('文档dirty状态检查', logData);
    }
    
    return isDirty;
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
function updateDocumentLastView(tabId: string, view: DocumentView): void {
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
  const oldPath = doc.path;
  
  // 规范化内容，确保与打开文档时使用的规范化逻辑一致
  const normalizedMarkdown = normalizeContent(doc.markdown);
  const normalizedTex = normalizeContent(doc.tex);
  
  getLogger().debug('标记文档已保存', {
    tabId,
    oldPath,
    newPath,
    format: doc.format,
    markdownLength: normalizedMarkdown.length,
    savedMarkdownLength: doc.savedMarkdown?.length ?? 0,
    texLength: normalizedTex.length,
    savedTexLength: doc.savedTex?.length ?? 0,
    markdownEqual: normalizedMarkdown === doc.savedMarkdown,
    texEqual: normalizedTex === doc.savedTex,
  });
  
  if (typeof newPath === 'string') {
    doc.path = newPath;
  }

  // 确保保存的内容是规范化后的（与编辑器更新时保持一致）
  // 注意：这里使用规范化后的内容，确保与打开文档时的处理逻辑一致
  doc.savedMarkdown = normalizedMarkdown;
  doc.savedTex = normalizedTex;
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
  
  // 重新计算dirty状态以确保一致性
  updateDocumentDirty(tabId);
  
  // 如果路径发生变化，更新文件监听
  if (typeof newPath === 'string' && newPath !== oldPath && newPath) {
    // 异步更新文件监听（避免阻塞）
    (async () => {
      try {
        // 停止旧路径的监听
        if (oldPath) {
          let ipcRenderer: any = null;
          if (typeof window !== 'undefined' && (window as any).electron) {
            ipcRenderer = (window as any).electron.ipcRenderer;
          } else {
            const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer');
            ipcRenderer = localIpcRenderer;
          }
          
          if (ipcRenderer) {
            ipcRenderer.send('unwatch-file', oldPath);
          }
        }
        
        // 启动新路径的监听
        let ipcRenderer: any = null;
        if (typeof window !== 'undefined' && (window as any).electron) {
          ipcRenderer = (window as any).electron.ipcRenderer;
        } else {
          const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer');
          ipcRenderer = localIpcRenderer;
        }
        
        if (ipcRenderer) {
          ipcRenderer.send('watch-file', newPath, tabId);
          ipcRenderer.send('update-file-watcher-tab-id', newPath, tabId);
          const logger = createRendererLogger('Workspace');
          logger.debug('更新文件监听路径', { oldPath, newPath, tabId });
        }
      } catch (error) {
        const logger = createRendererLogger('Workspace');
        logger.warn('更新文件监听失败', { oldPath, newPath, tabId, error });
      }
    })();
  } else if (doc.path && !oldPath) {
    // 如果是从无路径到有路径（首次保存），启动文件监听
    (async () => {
      try {
        let ipcRenderer: any = null;
        if (typeof window !== 'undefined' && (window as any).electron) {
          ipcRenderer = (window as any).electron.ipcRenderer;
        } else {
          const { localIpcRenderer } = await import('../utils/web-adapter/local-ipc-renderer');
          ipcRenderer = localIpcRenderer;
        }
        
        if (ipcRenderer) {
          ipcRenderer.send('watch-file', doc.path, tabId);
          const logger = createRendererLogger('Workspace');
          logger.debug('启动文件监听（首次保存）', { filePath: doc.path, tabId });
        }
      } catch (error) {
        const logger = createRendererLogger('Workspace');
        logger.warn('启动文件监听失败', { filePath: doc.path, tabId, error });
      }
    })();
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
    lastView: 'editor' as DocumentView,
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
import { mergeText } from '../utils/text-merge.js';
import { removeMetaInfo } from '../utils/meta-info-remover';

/**
 * 初始化workspace的跨窗口事件监听器
 * 应该在应用启动时调用，而不是在模块加载时
 */
/**
 * 处理外部文件变化
 * 实现类似 VSCode 的文件自动同步功能
 * 使用异步处理和防抖，避免阻塞主线程
 */
function handleExternalFileChange(payload: unknown): void {
  const typedPayload = payload as {
    filePath: string;
    tabId?: string;
    content: string;
    modifiedTime: number;
    diff?: Array<{
      type: 'insert' | 'delete' | 'replace';
      start: number;
      end: number;
      newText: string;
    }>;
  };
  
  const logger = createRendererLogger('Workspace');
  
  // 异步处理，避免阻塞主线程
  Promise.resolve().then(async () => {
    const { filePath, tabId, content, modifiedTime, diff } = typedPayload;
    // 查找匹配的标签页
    const matchingTab = tabs.find(tab => {
      if (tabId && tab.id === tabId) return true;
      const doc = documents[tab.id];
      return doc && doc.path === filePath;
    });
    
    if (!matchingTab) {
      logger.debug('文件变化但未找到匹配的标签页', { filePath, tabId });
      return;
    }
    
    const doc = ensureDocument(matchingTab.id);
    if (!doc) {
      logger.warn('无法获取文档', { tabId: matchingTab.id });
      return;
    }
    
    // 获取当前编辑器内容（根据格式）
    const currentContent = doc.format === 'tex' ? (doc.tex ?? '') : (doc.markdown ?? '');
    const savedContent = doc.format === 'tex' ? (doc.savedTex ?? '') : (doc.savedMarkdown ?? '');
    
    // 规范化内容（统一换行符）
    const normalizeContent = (text: string) => text.replace(/\r\n/g, '\n');
    
    // 移除 meta-info 以便比较（meta-info 是 MetaDoc 注入的，不应该参与比较）
    const externalContentWithoutMeta = removeMetaInfo(content, doc.format);
    const currentContentWithoutMeta = removeMetaInfo(currentContent, doc.format);
    const savedContentWithoutMeta = removeMetaInfo(savedContent, doc.format);
    
    const normalizedExternal = normalizeContent(externalContentWithoutMeta);
    const normalizedCurrent = normalizeContent(currentContentWithoutMeta);
    const normalizedSaved = normalizeContent(savedContentWithoutMeta);
    
    // 情况1：外部文件内容与已保存内容相同（文件被外部恢复或撤销）
    if (normalizedExternal === normalizedSaved) {
      // 如果当前有未保存的改动，保留这些改动
      if (normalizedCurrent !== normalizedSaved) {
        logger.info('外部文件已恢复为已保存版本，保留未保存的改动', { filePath });
        // 不更新内容，保留用户的未保存改动
        return;
      }
      // 如果当前内容与已保存内容相同，直接同步外部文件
      logger.info('外部文件已恢复为已保存版本，同步更新', { filePath });
      // 使用移除 meta-info 后的内容
      if (doc.format === 'tex') {
        updateDocumentTex(matchingTab.id, externalContentWithoutMeta);
      } else {
        updateDocumentMarkdown(matchingTab.id, externalContentWithoutMeta);
      }
      markDocumentSaved(matchingTab.id, filePath);
      return;
    }
    
    // 情况2：外部文件内容与当前编辑器内容相同（可能是我们自己的保存操作触发的）
    if (normalizedExternal === normalizedCurrent) {
      logger.debug('外部文件内容与当前编辑器内容相同，忽略', { filePath });
      // 更新已保存内容，但不触发dirty状态
      if (doc.format === 'tex') {
        doc.savedTex = content;
      } else {
        doc.savedMarkdown = content;
      }
      updateDocumentDirty(matchingTab.id);
      return;
    }
    
    // 情况3：外部文件内容与已保存内容不同，且与当前编辑器内容也不同
    // 检查当前是否有未保存的改动
    const hasUnsavedChanges = normalizedCurrent !== normalizedSaved;
    
    if (hasUnsavedChanges) {
      // 有未保存的改动，尝试智能合并
      logger.info('检测到外部文件修改且当前有未保存改动，尝试智能合并', { 
        filePath,
        externalSize: normalizedExternal.length,
        currentSize: normalizedCurrent.length,
        savedSize: normalizedSaved.length
      });
      
      // 执行三路合并（使用移除 meta-info 后的内容，避免 meta-info 干扰合并）
      const mergeResult = mergeText(savedContentWithoutMeta, currentContentWithoutMeta, externalContentWithoutMeta);
      
      // 只要有冲突，就弹出对话框让用户选择，不自动合并
      if (mergeResult.hasConflict) {
        // 有冲突，需要用户决定
        logger.warn('检测到文件冲突：需要用户选择', { 
          filePath,
          conflictCount: mergeResult.conflictRanges?.length || 0
        });
        
        // 发送冲突事件，让UI组件处理（显示对话框等）
        // 注意：传递移除 meta-info 后的内容，这样 diff 窗口不会显示 meta-info 的差异
        eventBus.emit('file-conflict-detected', {
          tabId: matchingTab.id,
          filePath,
          externalContent: externalContentWithoutMeta, // 移除 meta-info
          currentContent: currentContentWithoutMeta, // 移除 meta-info
          savedContent: savedContentWithoutMeta, // 移除 meta-info
          format: doc.format,
          mergeResult: mergeResult,
        });
      } else if (mergeResult.success) {
        // 合并成功，没有冲突，自动应用合并结果
        logger.info('智能合并成功，自动应用合并结果', { filePath });
        // 使用 nextTick 确保在下一个事件循环中更新，避免阻塞
        await new Promise(resolve => setTimeout(resolve, 0));
        // 注意：mergeResult.mergedContent 已经是移除 meta-info 后的内容，直接使用
        if (doc.format === 'tex') {
          updateDocumentTex(matchingTab.id, mergeResult.mergedContent);
        } else {
          updateDocumentMarkdown(matchingTab.id, mergeResult.mergedContent);
        }
        // 注意：不调用 markDocumentSaved，因为合并后的内容可能仍然与外部文件不同
        // 用户可以选择保存或继续编辑
        eventBus.emit('show-info', '已自动合并外部文件更改，未保存的改动已保留');
      } else {
        // 合并失败，也弹出对话框
        logger.warn('文件合并失败，需要用户选择', { filePath });
        eventBus.emit('file-conflict-detected', {
          tabId: matchingTab.id,
          filePath,
          externalContent: externalContentWithoutMeta, // 移除 meta-info
          currentContent: currentContentWithoutMeta, // 移除 meta-info
          savedContent: savedContentWithoutMeta, // 移除 meta-info
          format: doc.format,
          mergeResult: mergeResult,
        });
      }
    } else {
      // 没有未保存的改动，直接同步外部文件
      logger.info('外部文件已修改，自动同步（无未保存改动）', { filePath });
      // 使用 nextTick 确保在下一个事件循环中更新，避免阻塞
      await new Promise(resolve => setTimeout(resolve, 0));
      // 注意：使用移除 meta-info 后的内容，这样不会把外部文件的 meta-info 带进来
      // MetaDoc 会在保存时自动注入自己的 meta-info
      if (doc.format === 'tex') {
        updateDocumentTex(matchingTab.id, externalContentWithoutMeta);
      } else {
        updateDocumentMarkdown(matchingTab.id, externalContentWithoutMeta);
      }
      markDocumentSaved(matchingTab.id, filePath);
    }
  }).catch(error => {
    logger.error('处理外部文件变化失败', { filePath: typedPayload.filePath, error });
  });
}

/**
 * 处理外部文件删除
 */
function handleExternalFileDeleted(payload: unknown): void {
  const typedPayload = payload as { filePath: string; tabId?: string };
  const { filePath, tabId } = typedPayload;
  const logger = createRendererLogger('Workspace');
  
  // 查找匹配的标签页
  const matchingTab = tabs.find(tab => {
    if (tabId && tab.id === tabId) return true;
    const doc = documents[tab.id];
    return doc && doc.path === filePath;
  });
  
  if (!matchingTab) {
    logger.debug('文件删除但未找到匹配的标签页', { filePath, tabId });
    return;
  }
  
  logger.info('检测到文件被删除', { filePath, tabId: matchingTab.id });
  
  // 发送文件删除事件，让UI组件处理
  eventBus.emit('external-file-deleted-for-tab', {
    tabId: matchingTab.id,
    filePath: typedPayload.filePath,
  });
}

export async function initializeWorkspaceBroadcastListeners(): Promise<void> {
  // 监听外部文件变化事件
  eventBus.on('external-file-changed', handleExternalFileChange);
  eventBus.on('external-file-deleted', handleExternalFileDeleted);
  
  // 监听来自设置窗口的文档信息请求
  eventBus.on('request-active-document-info', (requestId: unknown) => {
    const typedRequestId = requestId as string;
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
      requestId: typedRequestId,
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
  eventBus.on('request-document-content', (requestId: unknown) => {
    const typedRequestId = requestId as string;
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
      requestId: typedRequestId,
      content: {
        markdown: doc.markdown,
        tex: doc.tex,
        format: doc.format
      }
    })
  })
}

/**
 * 从文件路径中提取目录路径（用于设置 linkBase）
 * @param filePath 文件路径
 * @returns 目录路径（在 Electron 环境中返回 file:// URL 格式，否则返回相对路径）
 */
export function getDirectoryFromPath(filePath: string): string {
  if (!filePath) return '';
  
  // 在 Electron 环境中，需要将文件路径转换为 file:// URL 格式
  // 以便 Vditor 能够正确解析相对路径
  if (isElectronEnv()) {
    // 移除 file:/// 前缀（如果存在）
    let path = filePath.replace(/^file:\/\/\//, '');
    
    // Windows 路径处理：将反斜杠转换为正斜杠
    path = path.replace(/\\/g, '/');
    
    // 分割路径为各个部分，对每个部分进行编码
    const parts = path.split('/');
    const encodedParts = parts.map((part: string, index: number) => {
      if (index === 0 && part.endsWith(':')) {
        // Windows 驱动器号（如 C:）不需要编码
        return part;
      }
      // 对路径的每一部分进行编码
      return encodeURIComponent(part).replace(/%2F/g, '/');
    });
    
    // 获取目录路径（去掉文件名）
    const dirParts = encodedParts.slice(0, -1);
    if (dirParts.length === 0) return '';
    
    // 返回 file:// URL 格式的目录路径
    return `file:///${dirParts.join('/')}/`;
  } else {
    // 在 Web 环境中，使用简单的相对路径
    const normalizedPath = filePath.replace(/\\/g, '/');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    if (lastSlashIndex === -1) return '';
    const dirPath = normalizedPath.substring(0, lastSlashIndex + 1);
    return dirPath;
  }
}

/**
 * 获取文档的 linkBase（用于 Vditor 等编辑器解析相对路径）
 * @param docPath 文档路径
 * @returns linkBase 字符串
 */
export function getLinkBase(docPath: string): string {
  if (!docPath) return '';
  return getDirectoryFromPath(docPath);
}

// 工具Tab的标题映射
const TOOL_TAB_TITLES: Record<ToolTabType, string> = {
  ocr: 'OCR识别',
  graph: '绘图',
  attachment: '附件解析',
  dataAnalysis: '数据分析',
  formulaRecognition: '公式识别',
  aiChat: 'AI对话',
  setting: '设置'
};

// 工具Tab的路由映射
const TOOL_TAB_ROUTES: Record<ToolTabType, string> = {
  ocr: '/ocr',
  graph: '/graph',
  attachment: '/attachment',
  dataAnalysis: '/data-analysis',
  formulaRecognition: '/fomula-recognition',
  aiChat: '/ai-chat',
  setting: '/setting'
};

/**
 * 打开或激活工具Tab
 * @param toolType 工具类型
 * @returns 工具Tab
 */
function openToolTab(toolType: ToolTabType): WorkspaceTab {
  // 查找是否已存在该工具Tab
  const existingTab = tabs.find(tab => tab.kind === 'tool' && tab.toolType === toolType);
  
  if (existingTab) {
    // 如果已存在，激活它
    activateTab(existingTab.id);
    return existingTab;
  }
  
  // 创建新的工具Tab
  const id = generateTabId();
  const tab = reactive<WorkspaceTab>({
    id,
    kind: 'tool',
    title: TOOL_TAB_TITLES[toolType],
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    readonly: true,
    toolType,
    route: TOOL_TAB_ROUTES[toolType]
  });
  
  tabs.push(tab);
  activateTab(id);
  return tab;
}

/**
 * 打开或激活系统Tab（主页、知识库、调试工具等不可删除的Tab）
 * @param route 路由路径
 * @param title 标题
 * @returns 系统Tab
 */
function openSystemTab(route: string, title: string): WorkspaceTab {
  // 查找是否已存在该系统Tab
  const existingTab = tabs.find(tab => tab.kind === 'system' && tab.route === route);
  
  if (existingTab) {
    activateTab(existingTab.id);
    return existingTab;
  }
  
  const id = generateTabId();
  const tab = reactive<WorkspaceTab>({
    id,
    kind: 'system',
    title,
    subtitle: '',
    path: '',
    format: 'md',
    dirty: false,
    readonly: true,
    route
  });
  
  tabs.push(tab);
  activateTab(id);
  return tab;
}

/**
 * 检查Tab是否可以删除
 */
function canRemoveTab(tabId: string): boolean {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return false;
  
  // 所有Tab都可以关闭（包括系统Tab和工具Tab）
  // 允许关闭最后一个Tab，关闭后会显示Dummy组件
  return true;
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
    withAutoOutlineSyncSuppressed,
    handleExternalFileChange,
    handleExternalFileDeleted,
    getDirectoryFromPath,
    getLinkBase,
    openToolTab,
    openSystemTab,
    canRemoveTab,
  };
}


