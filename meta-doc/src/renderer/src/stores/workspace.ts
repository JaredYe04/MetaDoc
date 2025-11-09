import { reactive, ref, computed, watch } from 'vue';
import type { ComputedRef } from 'vue';
import type {
  ArticleMetaData,
  DocumentOutlineNode,
  AIDialogMessage,
} from '../../../types';
import eventBus from '../utils/event-bus';
import {
  current_article,
  current_article_meta_data,
  current_outline_tree,
  current_tex_article,
  current_ai_dialogs,
  current_file_path,
  current_format,
  latest_view,
  renderedHtml,
  setSaveNotificationSuppressed,
} from '../utils/common-data';
import { createRendererLogger } from '../utils/logger';

export type WorkspaceTabKind = 'legacy' | 'file';
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
  aiDialogs: AIDialogMessage[];
  lastView: 'outline' | 'article';
  renderedHtml: string;
  dirty: boolean;
  savedMarkdown: string;
  savedTex: string;
  savedOutline: DocumentOutlineNode;
  savedMeta: ArticleMetaData;
  savedAiDialogs: AIDialogMessage[];
}

const logger = createRendererLogger('Workspace');

const UNTITLED_TITLE = '未命名文档';
const LEGACY_TAB_ID = 'legacy-tab';

const tabs = reactive<WorkspaceTab[]>([]);
const activeTabId = ref<string>(LEGACY_TAB_ID);

const legacyTab: WorkspaceTab = reactive({
  id: LEGACY_TAB_ID,
  kind: 'legacy',
  title: UNTITLED_TITLE,
  subtitle: '',
  path: '',
  format: 'md',
  dirty: false,
  readonly: true,
});

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

if (!tabs.length) {
  tabs.push(legacyTab);
}

documents[LEGACY_TAB_ID] = reactive(captureCurrentDocumentSnapshot(LEGACY_TAB_ID)) as WorkspaceDocument;

/**
 * 确保一个标签页的文档存在
 * @param tabId 标签页ID
 * @returns 标签页文档
 */
function ensureDocument(tabId: string): WorkspaceDocument {
  let doc = documents[tabId];
  if (!doc) {
    const snapshot = captureCurrentDocumentSnapshot(tabId);
    doc = reactive(snapshot) as WorkspaceDocument;
    doc.dirty = false;
    doc.markdown = snapshot.markdown;
    doc.tex = snapshot.tex;
    doc.meta = structuredCloneFallback(snapshot.meta);
    doc.outline = structuredCloneFallback(snapshot.outline);
    doc.aiDialogs = structuredCloneFallback(snapshot.aiDialogs);
    doc.renderedHtml = snapshot.renderedHtml;
    doc.lastView = snapshot.lastView;
    doc.savedMarkdown = snapshot.markdown;
    doc.savedTex = snapshot.tex;
    doc.savedMeta = structuredCloneFallback(snapshot.meta);
    doc.savedOutline = structuredCloneFallback(snapshot.outline);
    doc.savedAiDialogs = structuredCloneFallback(snapshot.aiDialogs);
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

/**
 * 捕获当前活动标签页的文档快照
 * @param tabId 标签页ID
 * @returns 文档快照
 */
function captureCurrentDocumentSnapshot(tabId: string): WorkspaceDocument {
  const currentTab = tabs.find((tab) => tab.id === tabId) ?? null;
  const normalizedMarkdown = normalizeContent(current_article.value);
  const normalizedTex = normalizeContent(current_tex_article.value);
  return {
    id: tabId,
    tabId,
    path: current_file_path.value || '',
    format: current_format.value === 'tex' ? 'tex' : 'md',
    markdown: normalizedMarkdown,
    tex: normalizedTex,
    outline: structuredCloneFallback(current_outline_tree.value),
    meta: structuredCloneFallback(current_article_meta_data.value),
    aiDialogs: structuredCloneFallback(current_ai_dialogs.value),
    lastView: latest_view.value === 'outline' ? 'outline' : 'article',
    renderedHtml: renderedHtml.value || '',
    dirty: Boolean(currentTab?.dirty),
    savedMarkdown: normalizedMarkdown,
    savedTex: normalizedTex,
    savedOutline: structuredCloneFallback(current_outline_tree.value),
    savedMeta: structuredCloneFallback(current_article_meta_data.value),
    savedAiDialogs: structuredCloneFallback(current_ai_dialogs.value),
  };
}

/**
 * 将一个标签页的快照应用到当前活动标签页
 * @param snapshot 标签页快照
 */
function applySnapshotToLegacyState(snapshot: WorkspaceDocument): void {
  setSaveNotificationSuppressed(true);
  try {
    current_format.value = snapshot.format;
    current_file_path.value = snapshot.path || '';
    current_article.value = snapshot.markdown;
    current_tex_article.value = snapshot.tex;
    current_outline_tree.value = structuredCloneFallback(snapshot.outline);
    current_article_meta_data.value = { ...snapshot.meta };
    current_ai_dialogs.value = structuredCloneFallback(snapshot.aiDialogs);
    latest_view.value = snapshot.lastView;
    renderedHtml.value = snapshot.renderedHtml;
  } finally {
    setSaveNotificationSuppressed(false);
  }
}

/**
 * 刷新当前活动标签页的元数据
 */
function refreshActiveTabMetadata(): void {
  const tab = activeTab.value;
  if (!tab) return;

  const metaTitle = (current_article_meta_data.value.title || '').trim();
  const fileName = extractFileName(current_file_path.value);
  tab.subtitle = fileName;
  tab.title = metaTitle || fileName || UNTITLED_TITLE;
  const doc = documents[tab.id];
  if (doc) {
    doc.meta = structuredCloneFallback(current_article_meta_data.value);
  }
}

/**
 * 监听当前文档元数据变化
 */
watch(
  current_article_meta_data,
  () => {
    refreshActiveTabMetadata();
  },
  { deep: true, immediate: true },
);

/**
 * 监听当前文档路径变化
 * @param path 新的文档路径
 */
watch(
  current_file_path,
  (path) => {
    const tab = activeTab.value;
    if (!tab) return;
    tab.path = path || '';
    refreshActiveTabMetadata();
    const doc = documents[tab.id];
    if (doc) {
      doc.path = tab.path;
    }
  },
  { immediate: true },
);

/**
 * 监听当前文档格式变化
 * @param fmt 新的文档格式
 */
watch(
  current_format,
  (fmt) => {
    const tab = activeTab.value;
    if (!tab) return;
    tab.format = fmt === 'tex' ? 'tex' : 'md';
    const doc = documents[tab.id];
    if (doc) {
      doc.format = tab.format;
    }
  },
  { immediate: true },
);

/**
 * 持久化当前活动标签页的文档状态
 */
function persistActiveDocument(): void {
  const tab = activeTab.value;
  if (!tab) return;
  const snapshot = captureCurrentDocumentSnapshot(tab.id);
  const doc = ensureDocument(tab.id);
  withDirtyBroadcastSuppressed(() => {
    setSaveNotificationSuppressed(true);
    try {
      Object.assign(doc, snapshot);
    } finally {
      setSaveNotificationSuppressed(false);
    }
  });
}

/**
 * 重新加载当前活动标签页的文档状态
 */
function reloadActiveDocument(): void {
  const id = activeTabId.value;
  if (!id) return;
  applyDocumentForActiveTab(id);
}

/**
 * 
 * @param targetTabId 目标标签页ID
 * 将目标标签页的文档状态应用到当前标签页
 */
function applyDocumentForActiveTab(targetTabId: string): void {
  withDirtyBroadcastSuppressed(() => {
    const snapshot = ensureDocument(targetTabId);
    if (!snapshot) return;
    applySnapshotToLegacyState(snapshot);
    refreshActiveTabMetadata();
    updateDocumentDirty(targetTabId);
  });
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
  documents[id] = clonedSnapshot;

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

/**
 * 删除一个标签页
 * @param id 标签页ID
 */
function removeTab(id: string): void {
  if (id === LEGACY_TAB_ID) {
    return;
  }
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const wasActive = activeTabId.value === id;
  if (wasActive) {
    persistActiveDocument();
  }

  tabs.splice(index, 1);
  delete documents[id];

  if (!tabs.length) {
    tabs.push(legacyTab);
    activeTabId.value = legacyTab.id;
    applyDocumentForActiveTab(legacyTab.id);
    updateDocumentDirty(legacyTab.id);
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

  withDirtyBroadcastSuppressed(() => persistActiveDocument());

  activeTabId.value = id;

  applyDocumentForActiveTab(id);
}

/**
 * 更新一个标签页的Markdown内容
 * @param tabId 标签页ID
 * @param markdown 新的Markdown内容
 */
function updateDocumentMarkdown(tabId: string, markdown: string): void {
  const doc = ensureDocument(tabId);
  const normalized = normalizeContent(markdown);
  if (doc.markdown !== normalized) {
    doc.markdown = normalized;
    if (activeTabId.value === tabId) {
      current_article.value = normalized;
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
  const normalized = normalizeContent(tex);
  if (doc.tex !== normalized) {
    doc.tex = normalized;
    if (activeTabId.value === tabId) {
      current_tex_article.value = normalized;
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
    return false;
  }
  const dirty = computeDocumentDirty();
  doc.dirty = dirty;

  const tab = tabs.find((item) => item.id === tabId);
  if (tab) {
    tab.dirty = dirty;
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
    if (activeTabId.value === tabId) {
      latest_view.value = view;
    }
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
    if (activeTabId.value === tabId) {
      renderedHtml.value = html;
    }
  }
}

export function useWorkspace() {
  return {
    tabs,
    activeTabId,
    activeTab,
    documents,
    activeDocument,
    activateTab,
    persistActiveDocument,
    reloadActiveDocument,
    captureCurrentDocumentSnapshot,
    addDocumentTab,
    removeTab,
    ensureDocument,
    updateDocumentMarkdown,
    updateDocumentTex,
    updateDocumentMeta,
    updateDocumentOutline,
    updateDocumentAiDialogs,
    updateDocumentDirty,
    updateDocumentLastView,
    updateDocumentRenderedHtml,
  };
}


