<template>
    <div class="main-container">
        <div class="content-container" ref="containerRef">
            <!-- 左边：Vditor Markdown 编辑器 -->
            <!-- 菜单组件 -->
                <SectionOptimizer
                    v-if="showSectionOptimizer" 
                :title="currentSectionTitle" 
                :position="sectionOptimizerPosition"
                :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(currentMarkdown, true)"
                :adapter="sectionOptimizerAdapter"
                :sectionInfo="currentSectionInfo"
                language="markdown"
                @close="handleSectionOptimizerClose" 
                @accept="async (payload: any) => { await acceptGeneratedText(payload); }" 
                style="max-width: 500px;" 
            />
            <!-- 保留TitleMenu以兼容旧代码 -->
            <TitleMenu v-if="showTitleMenu" :title="currentTitle.replace(/#+/g, '').trim()" :position="menuPosition"
                @close="handleTitleMenuClose" :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(currentMarkdown, true)"
                        @accept="async (payload: any) => { await acceptGeneratedText(payload); }" style="max-width: 500px;" />
            <SearchReplaceMenu
                v-if="searchReplaceDialogVisible"
                :adapter="textEditorAdapter"
                :position="SRMenuPosition"
                @close="handleSearchReplaceClose"
            />

            <!-- 右键菜单组件 -->
            <ContextMenu :x="menuX" :y="menuY" :items="articleContextMenuItems"
                v-if="contextMenuVisible" @trigger="handleMenuClick" class="context-menu"
                @close="contextMenuVisible = false;" />
            <AISuggestionGhost 
                v-if="vditor"
                format="md"
                :targetEl="vditorEl"
                rootNodeClass="vditor-reset"
                @accepted="onAcceptSuggestion"
                @cancelled="onCancelSuggestion"
            />

            <ResizableContainer
                ref="resizableRef"
                direction="vertical"
                :initial-sidebar-size="MARKDOWN_LAYOUT.initialSidebarWidth"
                :min-size="MARKDOWN_LAYOUT.sidebarMinWidth"
                :max-size="MARKDOWN_LAYOUT.sidebarMaxWidth"
                :reverse="true"
                sidebar-position="end"
                :collapsible="true"
                :auto-collapse-width="MARKDOWN_LAYOUT.editorMinWidth + MARKDOWN_LAYOUT.sidebarMinWidth + 100"
                collapse-button-title="折叠元信息面板"
                expand-button-title="展开元信息面板"
                @resize="onMetaInfoResize"
            >
                <template #main>
                    <!-- 主编辑器区域 -->
                    <div :id="props.editorDomId" ref="vditorEl" class="editor" @keydown="handleTab"
                        @contextmenu.prevent="openContextMenu($event)" :style="{
                            '--panel-background-color': themeState.currentTheme.editorPanelBackgroundColor,
                            '--toolbar-background-color': themeState.currentTheme.editorToolbarBackgroundColor,
                            '--textarea-background-color': themeState.currentTheme.editorTextareaBackgroundColor,
                            '--editor-min-width': MARKDOWN_LAYOUT.editorMinWidth + 'px',
                        }"></div>
                </template>
                
                <template #sidebar>
                    <!-- 右边：元信息显示 -->
                    <div class="meta-info"
                        :style="{
                            backgroundColor: themeState.currentTheme.background2nd,
                            minWidth: MARKDOWN_LAYOUT.sidebarMinWidth + 'px',
                            maxWidth: MARKDOWN_LAYOUT.sidebarMaxWidth + 'px'
                        }">
                    <MetaInfoPanel
                        :meta="currentMeta"
                        :markdown="currentMarkdown"
                        :outline-json="currentOutlineJson"
                        @update-meta="handleMetaPatch"
                    />
                    </div>
                </template>
            </ResizableContainer>

        </div>
    </div>
</template>


<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, toRef, watch, shallowRef } from "vue";
import ResizableContainer from '../components/base/ResizableContainer.vue';
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import Vditor from "vditor";
import "vditor/dist/index.css";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { isElectronEnv, getWindowType, sendBroadcast } from '../utils/event-bus';
import { createRendererLogger } from '../utils/logger.ts'
import { extractOutlineTreeFromMarkdown, generateMarkdownFromOutlineTree } from '../utils/md-utils';
import { wholeArticleContextPrompt } from '../utils/prompts.ts';
import TitleMenu from '../components/TitleMenu.vue';
import SectionOptimizer from '../components/SectionOptimizer.vue';
import { MarkdownSectionAdapter } from '../components/section-optimizer/adapters/markdown-adapter';
import SearchReplaceMenu from "../components/SearchReplaceMenu.vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
import { themeState } from "../utils/themes";
import { getSetting, setSetting } from "../utils/settings";
import { localVditorCDN, vditorCDN } from "../utils/vditor-cdn";
import { waitForService } from "../utils/service-status.ts";
import { useI18n } from 'vue-i18n'
import AISuggestionGhost from "../components/AISuggestionGhost.vue";
import { aiCompletionService } from "../utils/ai-completion-service";
import { VditorEditorAdapter } from "../utils/editor-adapters";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
import MetaInfoPanel from "../components/MetaInfoPanel.vue";
import { useWorkspace } from '../stores/workspace';
import type { ArticleMetaData, DocumentOutlineNode } from '../../../types';
import { debounce } from "lodash";
import { createVditorAdapter } from "../editor/vditor-adapter";
import type { TextEditorAdapter } from "../editor/text-editor-types";
import { prependAiChatDialog } from '../utils/ai-chat-storage';

const MARKDOWN_LAYOUT = {
  editorMinWidth: 700,
  sidebarMinWidth: 200,
  sidebarMaxWidth: 600,
  initialSidebarWidth: 300,
};

const { t } = useI18n()
const logger = createRendererLogger('MarkdownEditor', {
  windowTypeProvider: () => getWindowType()
})

const workspace = useWorkspace()
const activeTabIdRef = workspace.activeTabId;

const props = withDefaults(defineProps<{
  tabId: string
  active: boolean
  editorDomId?: string
}>(), {
  active: true,
  editorDomId: 'vditor',
})

const isActive = toRef(props, 'active')

const documentRef = computed(() => workspace.ensureDocument(props.tabId))

const currentMarkdown = computed<string>({
  get: () => documentRef.value.markdown ?? '',
  set: (val) => workspace.updateDocumentMarkdown(props.tabId, val),
})

const currentMeta = computed<ArticleMetaData>(() => documentRef.value.meta)

const currentOutline = computed<DocumentOutlineNode>({
  get: () => documentRef.value.outline,
  set: (val) => workspace.updateDocumentOutline(props.tabId, val),
})

const currentOutlineJson = computed(() => {
  try {
    // 优先使用 workspace 中的 outline，如果为空或无效，再从 markdown 提取
    const outline = currentOutline.value;
    if (outline && outline.path === 'dummy' && outline.children && outline.children.length > 0) {
      return JSON.stringify(outline);
    }
    // 如果 workspace 中的 outline 为空，尝试从 markdown 提取
    const extracted = extractOutlineTreeFromMarkdown(currentMarkdown.value, true);
    if (extracted && extracted.path === 'dummy' && extracted.children && extracted.children.length > 0) {
      return JSON.stringify(extracted);
    }
    // 如果都没有内容，返回空数组的 JSON
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] });
  } catch (error) {
    logger.warn('构建大纲 JSON 失败', error);
    return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] });
  }
});

const currentDialogs = computed<any[]>({
  get: () => documentRef.value.aiDialogs,
  set: (val) => workspace.updateDocumentAiDialogs(props.tabId, val),
})

const currentView = computed<'outline' | 'article'>({
  get: () => documentRef.value.lastView ?? 'outline',
  set: (val) => workspace.updateDocumentLastView(props.tabId, val),
})

const currentRenderedHtml = computed<string>({
  get: () => documentRef.value.renderedHtml ?? '',
  set: (val) => workspace.updateDocumentRenderedHtml(props.tabId, val),
})

function findNodeByPath(node: DocumentOutlineNode, targetPath: string): DocumentOutlineNode | null {
  if (!node) return null;
  if (node.path === targetPath) {
    return node;
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNodeByPath(child, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function updateMeta(updater: (meta: ArticleMetaData) => void) {
  workspace.updateDocumentMeta(props.tabId, updater)
}

const handleMetaPatch = (patch: Partial<ArticleMetaData>) => {
  updateMeta((meta) => Object.assign(meta, patch));
};

function replaceDialogs(builder: (dialogs: any[]) => any[]) {
  const next = builder([...currentDialogs.value])
  workspace.updateDocumentAiDialogs(props.tabId, next)
}

function addDialog(dialog: any, add2front = false) {
  replaceDialogs((dialogs) => {
    if (add2front) {
      dialogs.unshift(dialog)
    } else {
      dialogs.push(dialog)
    }
    return dialogs
  })
}

let suppressOutlineSync = false;

const syncOutlineFromMarkdown = debounce(() => {
  if (suppressOutlineSync) return;
  const outline = extractOutlineTreeFromMarkdown(currentMarkdown.value);
  currentOutline.value = outline;
}, 200);

function flushOutlineSync() {
  if ('flush' in syncOutlineFromMarkdown) {
    syncOutlineFromMarkdown.flush();
  }
}

function syncMarkdownFromOutline() {
  suppressOutlineSync = true;
  syncOutlineFromMarkdown.cancel();
  try {
    const markdown = generateMarkdownFromOutlineTree(currentOutline.value);
    workspace.updateDocumentMarkdown(props.tabId, markdown);
  } finally {
    suppressOutlineSync = false;
  }
}

function getEditorRoot(): HTMLElement | null {
  return document.getElementById(props.editorDomId) as HTMLElement | null
}



// 状态变量
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const searchReplaceDialogVisible = ref(false);
const vditor = ref<Vditor | null>(null); // Vditor 实例
const articleContextMenuItems = ref<any[]>([]);//右键菜单项
const textEditorAdapter = shallowRef<TextEditorAdapter | null>(null);
const resizableRef = ref<InstanceType<typeof ResizableContainer> | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
let layoutObserver: ResizeObserver | null = null;

const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const showSectionOptimizer = ref(false);
const currentTitle = ref("");
const currentSectionTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
const sectionOptimizerPosition = ref({ top: 0, left: 0 });
const sectionOptimizerAdapter = shallowRef<MarkdownSectionAdapter | null>(null);
const currentSectionInfo = ref<any>(null);
const getDefaultSearchMenuPosition = () => {
    if (typeof window === "undefined") {
        return { top: 24, left: 24 };
    }
    const margin = 24;
    return {
        top: margin,
        left: margin,
    };
};
const SRMenuPosition = ref(getDefaultSearchMenuPosition());
const updateSearchMenuPosition = () => {
    SRMenuPosition.value = getDefaultSearchMenuPosition();
};
const currentTitlePath = ref('');
const contextMenuVisible = ref(false); // 右键菜单可见性
const menuX = ref(0); // 菜单 X 坐标
const menuY = ref(0); // 菜单 Y 坐标

const vditorEl = ref<HTMLElement | null>(null);
const lastAppliedContent = ref('');
const isEditorInteracting = ref(false);
let pendingExternalUpdate: { value: string; clearHistory?: boolean } | undefined;

type SetValueOptions = {
    clearHistory?: boolean;
    timeoutMs?: number;
};

const flushPendingExternalUpdate = () => {
    const pending = pendingExternalUpdate;
    if (!pending) return;
    pendingExternalUpdate = undefined;
    scheduleSetValue(pending.value, { clearHistory: pending.clearHistory, timeoutMs: 0 });
};

const resetInteractionFlag = debounce(() => {
    isEditorInteracting.value = false;
    flushPendingExternalUpdate();
}, 300);

const markEditorInteraction = () => {
    isEditorInteracting.value = true;
    resetInteractionFlag();
};

const scheduleSetValue = (value: string, options: SetValueOptions = {}) => {
    const normalized = value ?? '';
    if (!vditor.value) return;
    if (normalized === lastAppliedContent.value) return;

    const run = () => {
        if (!vditor.value) return;
        if (isEditorInteracting.value) {
            pendingExternalUpdate = { value: normalized, clearHistory: options.clearHistory };
            return;
        }
        vditor.value.setValue(normalized, options.clearHistory ?? true);
        lastAppliedContent.value = normalized;
    };

    if (isEditorInteracting.value) {
        pendingExternalUpdate = { value: normalized, clearHistory: options.clearHistory };
        return;
    }

    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(run, { timeout: options.timeoutMs ?? 300 });
    } else {
        setTimeout(run, options.timeoutMs ?? 0);
    }
};

function onAcceptSuggestion(text: string) {
    //logger.log("补全已接受:", text);
    // 注意：对于Vditor，文本已经在acceptVditorGhostText中插入到DOM了
    // 所以这里不需要再次插入，否则会导致重复
    // 但对于Monaco，可能需要这里插入，所以保留这个函数但暂时不调用insertText
    // insertText(text);
}

function onCancelSuggestion() {
    //logger.log("补全已取消");
}


// 打开右键菜单
const openContextMenu = (event: MouseEvent) => {
    
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuVisible.value = true;
};

// 插入文本到编辑器
const insertText = (text: string) => {
    textEditorAdapter.value?.insertText(text);
};

// 菜单项点击事件处理
const handleMenuClick = async (item: string) => {
    switch (item) {
        case 'ai-assistant':
            let text = currentMarkdown.value;
            const bypassCodeBlock = await getSetting('bypassCodeBlock');
            if (bypassCodeBlock) {
                text = text.replace(/```[\s\S]*?```/g, '');
            }
            let messages: any[] = []
            messages.push({
                role: 'system',
                content: wholeArticleContextPrompt(text)
            })
            messages.push({
                role: 'assistant',
                content: t('article.ai_understood')
            })
            const newDialog = {
                title: t('article.ai_analyze_title'),
                messages: messages
            };
            //logger.log(newDialog)
            addDialog(newDialog, true)
            prependAiChatDialog(newDialog);
            sendBroadcast('ai-chat', 'ai-chat-dialogs-updated', null);
            eventBus.emit('ai-chat')
            break;
        case 'section-optimizer':
            await openSectionOptimizerFromContext();
            break;
        case 'cut':
            await textEditorAdapter.value?.cut();
            break;
        case 'copy':
            await textEditorAdapter.value?.copy();
            break;
        case 'paste':
            await textEditorAdapter.value?.paste();
            break;
        case 'selectAll':
            textEditorAdapter.value?.selectAll();
            break;
        case 'openAutoCompletion':
            await setSetting("autoCompletion",true);
             break;
        case 'closeAutoCompletion':
            await setSetting("autoCompletion",false);
             break;
        case 'openKnowledgeBase':
            await setSetting("enableKnowledgeBase",true);
             break;
        case 'closeKnowledgeBase':
            await setSetting("enableKnowledgeBase",false);
             break;
        case 'trigger-auto-completion':
            // 手动触发AI补全
            if (aiCompletionService.getAdapter()) {
                aiCompletionService.triggerCompletion('manual');
            } else {
                // 如果适配器不存在，先创建
                const adapter = new VditorEditorAdapter(vditor.value, props.editorDomId);
                aiCompletionService.setAdapter(adapter);
                aiCompletionService.triggerCompletion('manual');
            }
            break;
        
    }
    await refreshContextMenu();
    contextMenuVisible.value = false;
};

// 单击事件处理
const handleClick = async (event: MouseEvent, title: string, path: string) => {
    // 使用新的 SectionOptimizer 而不是旧的 TitleMenu
    if (!props.tabId) return
    
    // 创建适配器
    const adapter = new MarkdownSectionAdapter(props.tabId)
    sectionOptimizerAdapter.value = adapter
    
    // 从大纲树中获取节点信息
    const outline = extractOutlineTreeFromMarkdown(currentMarkdown.value, true)
    let sectionInfo: any = null
    
    if (outline && path) {
        const { searchNode } = await import('../utils/outline-helpers')
        const node = searchNode(path, outline)
        if (node) {
            // 获取标题在文档中的位置
            const lines = currentMarkdown.value.split('\n')
            let titleLine = -1
            let titleLevel = 6
            let endLine = lines.length - 1
            
            // 查找标题行
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
                if (match && match[2].trim() === title) {
                    titleLine = i
                    titleLevel = match[1].length
                    break
                }
            }
            
            // 查找章节结束位置
            if (titleLine >= 0) {
                for (let i = titleLine + 1; i < lines.length; i++) {
                    const line = lines[i]
                    const match = line.match(/^(#{1,6})\s+/)
                    if (match) {
                        const level = match[1].length
                        if (level <= titleLevel) {
                            endLine = i - 1
                            break
                        }
                    }
                }
            }
            
            // 获取节点内容（去掉标题部分）
            let content = node.text || ''
            const nodeLines = content.split('\n')
            let titleIndex = -1
            for (let i = 0; i < nodeLines.length; i++) {
                const match = nodeLines[i].match(/^(#{1,6})\s+(.+)$/)
                if (match && match[2].trim() === title) {
                    titleIndex = i
                    break
                }
            }
            if (titleIndex >= 0) {
                content = nodeLines.slice(titleIndex + 1).join('\n').trim()
            } else if (nodeLines.length > 0 && nodeLines[0].match(/^(#{1,6})\s+/)) {
                content = nodeLines.slice(1).join('\n').trim()
            } else {
                content = content.trim()
            }
            
            // 如果内容为空，从源码提取
            if (!content && titleLine >= 0) {
                const contentLines = lines.slice(titleLine + 1, endLine + 1)
                content = contentLines.join('\n').trim()
            }
            
            sectionInfo = {
                title: title,
                path: path,
                content: content,
                range: titleLine >= 0 ? {
                    start: { line: titleLine, column: 0 },
                    end: { line: endLine, column: lines[endLine]?.length || 0 }
                } : undefined
            }
        }
    }
    
    // 设置标题和路径
    currentSectionTitle.value = title
    currentTitlePath.value = path
    currentSectionInfo.value = sectionInfo
    
    // 设置菜单位置
    let top = event.clientY * 0.9
    if (top > document.body.clientHeight * 0.6) {
        top = document.body.clientHeight * 0.6
    }
    sectionOptimizerPosition.value = {
        top,
        left: event.clientX * 1.2,
    }
    
    showSectionOptimizer.value = true
};

const handleRefresh = () => {
    if (!isActive.value) return;
    scheduleSetValue(currentMarkdown.value, { clearHistory: true, timeoutMs: 0 });
};
eventBus.on('refresh', handleRefresh);

const handleSyncActiveEditor = (payload?: { tabId?: string }) => {
    const resolvedTabId = payload?.tabId ?? activeTabIdRef?.value;
    if (resolvedTabId !== props.tabId) return;
    if (!vditor.value) return;
    const latest = vditor.value.getValue();
    currentView.value = 'article';
    workspace.updateDocumentMarkdown(props.tabId, latest);
    syncOutlineFromMarkdown.cancel();
    syncOutlineFromMarkdown();
    flushOutlineSync();
};
eventBus.on('sync-active-editor', handleSyncActiveEditor as (payload?: unknown) => void);

const handleSearchReplace = (payload?: { expandReplace?: boolean }) => {
    if (!isActive.value) return;
    searchReplaceDialogVisible.value = true;
    if (payload?.expandReplace) {
        nextTick(() => eventBus.emit('search-replace-expand'));
    }
};
const handleSearchReplaceClose = () => {
    searchReplaceDialogVisible.value = false;
};
eventBus.on('search-replace', handleSearchReplace as (payload?: unknown) => void);

watch(isActive, (active) => {
    if (!active) {
        searchReplaceDialogVisible.value = false;
    }
});


const handleSyncWithHtml = () => {
    if (!isActive.value) return;
    if (!vditor.value) return;
    const html = vditor.value.getHTML();
    const markdown = vditor.value.html2md(html);
    currentMarkdown.value = markdown;
    scheduleSetValue(markdown, { clearHistory: true, timeoutMs: 0 });
};
eventBus.on('vditor-sync-with-html', handleSyncWithHtml);


// 接受生成的文本
const acceptGeneratedText = async (payload: any) => {
    const { append, content, sectionInfo } = payload;
    
    // 如果有sectionInfo，使用适配器来应用内容
    if (sectionInfo && sectionOptimizerAdapter.value) {
        try {
            await sectionOptimizerAdapter.value.applyContent(sectionInfo, content, append)
            showSectionOptimizer.value = false
            sectionOptimizerAdapter.value = null
            return
        } catch (e) {
            console.warn('Failed to apply content via adapter:', e)
        }
    }
    
    // 回退到旧的方式（用于TitleMenu兼容）
    const outlineTree = extractOutlineTreeFromMarkdown(currentMarkdown.value, false);
    const path = currentTitlePath.value;
    const node = findNodeByPath(outlineTree, path);
    if (node) {
        if (append) {
            node.text += content;
        }
        else {
            node.text = content;
        }
    }
    currentOutline.value = outlineTree;
  syncMarkdownFromOutline();
  currentView.value = 'article';
    scheduleSetValue(currentMarkdown.value, { clearHistory: false });
  flushOutlineSync();
    await bindTitleMenu();
    showSectionOptimizer.value = false;
};

// 关闭标题菜单
const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};

// 从右键菜单打开段落优化工具
const openSectionOptimizerFromContext = async () => {
    logger.debug('[MarkdownEditor] ========== openSectionOptimizerFromContext 开始 ==========')
    
    if (!vditor.value || !props.tabId) {
        logger.debug('[MarkdownEditor] ✗ vditor 或 tabId 不存在')
        return
    }
    
    // 获取当前光标在文本中的位置
    // vditor 的 getCursorPosition() 返回的是像素坐标，我们需要通过 DOM 获取文本位置
    let cursorLine = 0
    let cursorColumn = 0
    
    try {
        const markdown = vditor.value.getValue()
        const vditorInstance = vditor.value.vditor
        const lines = markdown.split('\n')
        
        // 通过 vditor IR 模式的 DOM 元素获取光标位置
        if (vditorInstance?.ir?.element) {
            const editorElement = vditorInstance.ir.element
            const selection = window.getSelection()
            
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                let node = range.startContainer
                
                // 向上查找包含 path 属性的元素（这是 vditor 标记的标题元素）
                while (node && node !== editorElement) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement
                        const path = element.getAttribute('path')
                        
                        // 如果找到了 path 属性，说明这是一个标题元素
                        // 通过 path 在大纲树中找到对应的节点，然后找到对应的行号
                        if (path) {
                            const outline = extractOutlineTreeFromMarkdown(markdown, true)
                            if (outline) {
                                const { searchNode } = await import('../utils/outline-helpers')
                                const outlineNode = searchNode(path, outline)
                                if (outlineNode) {
                                    // 在 markdown 中查找这个标题
                                    const nodeTitle = outlineNode.title || outlineNode.text?.split('\n')[0]?.replace(/^#+\s*/, '') || ''
                                    for (let i = 0; i < lines.length; i++) {
                                        const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
                                        if (match && match[2].trim() === nodeTitle) {
                                            cursorLine = i
                                            // 尝试计算列号：获取光标在元素内的位置
                                            const elementText = element.textContent || ''
                                            const textOffset = range.startOffset
                                            cursorColumn = Math.min(textOffset, elementText.length)
                                            logger.debug('[MarkdownEditor] 通过 path 属性找到光标位置:', { 
                                                line: cursorLine, 
                                                column: cursorColumn,
                                                path,
                                                title: nodeTitle
                                            })
                                            break
                                        }
                                    }
                                    if (cursorLine > 0) break
                                }
                            }
                        }
                    }
                    node = node.parentNode
                }
                
                // 如果通过 path 没找到，尝试通过文本内容匹配
                if (cursorLine === 0) {
                    // 获取光标所在元素的文本内容
                    let currentNode = range.startContainer
                    while (currentNode && currentNode !== editorElement) {
                        if (currentNode.nodeType === Node.TEXT_NODE || currentNode.nodeType === Node.ELEMENT_NODE) {
                            const textContent = currentNode.textContent || ''
                            if (textContent.trim().length > 0) {
                                // 在 markdown 中查找包含这个文本的行
                                for (let i = 0; i < lines.length; i++) {
                                    if (lines[i].includes(textContent.substring(0, Math.min(50, textContent.length)))) {
                                        cursorLine = i
                                        cursorColumn = 0
                                        logger.debug('[MarkdownEditor] 通过文本内容匹配找到光标位置:', { 
                                            line: cursorLine, 
                                            column: cursorColumn,
                                            matchedText: textContent.substring(0, 30)
                                        })
                                        break
                                    }
                                }
                                if (cursorLine > 0) break
                            }
                        }
                        currentNode = currentNode.parentNode
                    }
                }
            }
        }
        
        // 如果还是 0，使用文档中间位置作为默认值
        if (cursorLine === 0) {
            cursorLine = Math.floor(lines.length / 2)
            cursorColumn = 0
            logger.debug('[MarkdownEditor] 使用默认光标位置（文档中间）:', { line: cursorLine, column: cursorColumn })
        }
    } catch (e) {
        logger.warn('[MarkdownEditor] 获取光标位置失败:', e)
        // 如果出错，使用文档中间位置
        const markdown = vditor.value.getValue()
        const lines = markdown.split('\n')
        cursorLine = Math.floor(lines.length / 2)
        cursorColumn = 0
    }
    
    logger.debug('[MarkdownEditor] 最终光标位置:', { line: cursorLine, column: cursorColumn })

    // 创建适配器
    const adapter = new MarkdownSectionAdapter(props.tabId)
    sectionOptimizerAdapter.value = adapter

    logger.debug('[MarkdownEditor] 调用 adapter.getSectionAtCursor，参数:', { line: cursorLine, column: cursorColumn })
    
    // 获取当前章节信息
    const sectionInfo = await adapter.getSectionAtCursor({ line: cursorLine, column: cursorColumn })
    
    logger.debug('[MarkdownEditor] 获取到的 sectionInfo:', sectionInfo ? {
        title: sectionInfo.title,
        path: sectionInfo.path,
        contentLength: sectionInfo.content?.length || 0,
        range: sectionInfo.range
    } : null)
    if (!sectionInfo) {
        // 如果没有找到章节，尝试使用第一个章节
        const outline = extractOutlineTreeFromMarkdown(currentMarkdown.value, true)
        if (outline && outline.children && outline.children.length > 0) {
            const firstSection = outline.children[0]
            const { searchNode } = await import('../utils/outline-helpers')
            const node = searchNode(firstSection.path, outline)
            
            // 获取内容
            let content = node?.text || ''
            const nodeLines = content.split('\n')
            if (nodeLines.length > 0 && nodeLines[0].match(/^(#{1,6})\s+/)) {
                content = nodeLines.slice(1).join('\n').trim()
            } else {
                content = content.trim()
            }
            
            currentSectionTitle.value = firstSection.title || firstSection.text?.split('\n')[0]?.replace(/^#+\s*/, '') || '段落优化'
            currentTitlePath.value = firstSection.path || ''
            currentSectionInfo.value = {
                title: currentSectionTitle.value,
                path: currentTitlePath.value,
                content: content
            }
        } else {
            // 没有章节，使用全文
            currentSectionTitle.value = '全文'
            currentTitlePath.value = 'full-document'
            currentSectionInfo.value = {
                title: '全文',
                path: 'full-document',
                content: currentMarkdown.value
            }
        }
    } else {
        currentSectionTitle.value = sectionInfo.title
        currentTitlePath.value = sectionInfo.path
        currentSectionInfo.value = sectionInfo
    }

    // 设置菜单位置
    sectionOptimizerPosition.value = {
        top: menuY.value,
        left: menuX.value
    }

    showSectionOptimizer.value = true
}

const handleSectionOptimizerClose = () => {
    showSectionOptimizer.value = false
    sectionOptimizerAdapter.value = null
}

// 更新大纲
const bindTitleMenu = async () => {
    if (!isActive.value) return;
    const editorRoot = getEditorRoot();
    if (!editorRoot) return;
    let sections = Array.from(editorRoot.querySelectorAll('.vditor-ir__node')).filter(node =>
        ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes((node as Element).tagName));

    // 处理大纲树和标题绑定
    const outlineTree = currentOutline.value;
    const treeNodeQueue: any[] = [];
    const dfsOutlineTree = (node: any) => {
        treeNodeQueue.push(node);
        if (node.children) {
            node.children.forEach(dfsOutlineTree);
        }
    };
    dfsOutlineTree(outlineTree);
    treeNodeQueue.shift(); // 移除 'dummy' 节点

    sections.forEach((section, i) => {
        const node = treeNodeQueue[i];
        if (node?.path) {
            (section as Element).setAttribute('path', node.path);
        }
        section.addEventListener('mousedown', (event) => mouseDownEvent(event as MouseEvent, section as HTMLElement));
        section.addEventListener('mouseup', (event) => mouseUpEvent(event as MouseEvent, section as HTMLElement));
        section.addEventListener('mouseleave', (event) => mouseLeaveEvent(event as MouseEvent, section as HTMLElement));
        //添加tooltip
        (section as Element).setAttribute('title', t('article.long_press_optimize'));
    });

    const outlineNode = editorRoot.querySelector('.vditor-outline__content');
    //获取所有的span子标签，并且这些标签没有data-target-id属性
    const outlineSections = outlineNode
        ? Array.from(outlineNode.getElementsByTagName('span'))
            .filter(node => !node.hasAttribute('data-target-id'))
        : [];
    outlineSections.forEach((section, i) => {
        const node = treeNodeQueue[i];
        const target = section;
        if (node?.path) {
            target.setAttribute('path', node.path);
        }
        target.addEventListener('mousedown', (event) => outlineMouseDownEvent(event, section));
        target.addEventListener('mouseup', (event) => mouseUpEvent(event, section));
        target.addEventListener('mouseleave', (event) => mouseLeaveEvent(event, section));
        //鼠标指针改成pointer
        target.style.cursor = 'pointer';
        //添加tooltip
        target.setAttribute('title', t('article.click_jump_long_press_optimize'));

    });
};

// 鼠标事件处理
let pressTimer: NodeJS.Timeout | null = null;
let isLongPress = false;


const outlineMouseDownEvent = (event: MouseEvent, section: HTMLElement) => {
    const editorRoot = getEditorRoot();
    const titles = editorRoot ? editorRoot.getElementsByClassName('vditor-ir__node') : [];
    const path = section.getAttribute('path');
    //找到titles里面的第一个包含path的元素
    const title = Array.from(titles).find(title => title.getAttribute('path') === path);
    //聚焦到这个元素
    title?.scrollIntoView({ behavior: 'instant', block: 'start' });
    mouseDownEvent(event, section);
};
const mouseDownEvent = (event: MouseEvent, section: HTMLElement) => {
    isLongPress = false;
    pressTimer = setTimeout(() => {
        section.style.cursor = 'pointer';
        isLongPress = true;
        section.style.filter = "brightness(3.0)";
    }, 500);
};

const mouseUpEvent = (event: MouseEvent, section: HTMLElement) => {
    if (pressTimer) clearTimeout(pressTimer);
    if (isLongPress) {
        section.style.cursor = 'text';
        const title = section.innerText;
        const path = section.getAttribute('path');
        if (path) {
            handleClick(event, title, path);
        }
        section.style.filter = "brightness(1)";
    } else {
        section.style.filter = "brightness(1)";
    }
};

const mouseLeaveEvent = (event: MouseEvent, section: HTMLElement) => {
    if (pressTimer) clearTimeout(pressTimer);
    section.style.filter = "brightness(1)";
    section.style.cursor = 'text';
};

// 监听 Tab 键，插入制表符
const handleTab = (event: KeyboardEvent) => {
    // 如果按下了 Ctrl+Tab 或 Command+Tab，不处理（由 handleKeyDown 处理）
    const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
    const modifierKey = isMac ? event.metaKey : event.ctrlKey;
    if (modifierKey && event.key === 'Tab') {
        return;
    }
    
    if (event.key === "Tab") {
        // 检查是否有AI补全的ghost text（通过检查DOM中是否存在ai-suggestion元素）
        // 包括新的绿色背景样式类
        const hasAISuggestion = document.querySelector('.ai-suggestion, .ai-suggestion-dark, .ai-suggestion-insert, .ai-suggestion-insert-dark')
        if (hasAISuggestion) {
            // 如果有AI补全，让AISuggestionGhost组件处理，不插入制表符
            // 但不要阻止事件，让AISuggestionGhost在capture阶段处理
            return;
        }
        
        //如果AISuggestion在工作，不插入制表符
        if (triggerSuggestion.value) {
            //logger.log('AI Suggestion is active, tab key pressed');
            return;
        }
        else {
            //logger.log('AI Suggestion is not active, tab key pressed');
        }

        // 没有AI补全时，正常插入制表符
        event.preventDefault();
        event.stopPropagation();
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const tabNode = document.createTextNode("\t");
            range.insertNode(tabNode);
            range.setStartAfter(tabNode);
            range.setEndAfter(tabNode);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
};



const logMetaResize = debounce((size: number) => {
    logger.debug('元信息面板宽度调整', { size });
}, 100);

const clampSidebarSize = (size: number): number => {
    const width = containerWidth.value;
    const rawMin = MARKDOWN_LAYOUT.sidebarMinWidth;
    const rawMax = MARKDOWN_LAYOUT.sidebarMaxWidth;
    if (!width) {
        return Math.min(Math.max(size, rawMin), rawMax);
    }
    const maxByMainMin = width - MARKDOWN_LAYOUT.editorMinWidth;
    const maxAllowed = Math.min(rawMax, Math.max(rawMin, maxByMainMin));
    return Math.min(Math.max(size, rawMin), maxAllowed);
};

function onMetaInfoResize(size: number, event: MouseEvent) {
    const clamped = clampSidebarSize(size);
    if (clamped !== size) {
        resizableRef.value?.setSidebarSize(clamped);
    }
    logMetaResize(clamped);
}

const ensureSidebarWithinBounds = () => {
    const sidebarSize = resizableRef.value?.getSidebarSize?.();
    if (typeof sidebarSize === 'number') {
        const clamped = clampSidebarSize(sidebarSize);
        if (clamped !== sidebarSize) {
            resizableRef.value?.setSidebarSize(clamped);
        }
    } else {
        const fallback = clampSidebarSize(MARKDOWN_LAYOUT.initialSidebarWidth);
        resizableRef.value?.setSidebarSize(fallback);
    }
};

const refreshContextMenu = async () => {
    articleContextMenuItems.value = await getArticleContextMenuItems();
}

// 编辑器初始化
onMounted(async () => {
    if (typeof window !== "undefined") {
        window.addEventListener('resize', updateSearchMenuPosition);
    }
    await nextTick();
    if (containerRef.value) {
        layoutObserver = new ResizeObserver((entries) => {
            if (!entries.length) return;
            const width = entries[0].contentRect.width;
            containerWidth.value = width;
            ensureSidebarWithinBounds();
        });
        layoutObserver.observe(containerRef.value);
        containerWidth.value = containerRef.value.clientWidth;
        ensureSidebarWithinBounds();
    }
    try {
        await waitForService('express');
        await refreshContextMenu();
        let cdn = '';
        if (isElectronEnv()) {
            cdn = localVditorCDN;
        }
        else {
            cdn = vditorCDN;
        }
        const autoSaveExternalImage = await getSetting('autoSaveExternalImage');
        const supportedLang = ["en_US", "fr_FR", "pt_BR", "ja_JP", "ko_KR", "ru_RU", "sv_SE", "zh_CN", "zh_TW"]
        vditor.value = new Vditor(props.editorDomId, {
            lang: supportedLang.includes(t('lang') as string) ? (t('lang') as any) : 'en_US',
            toolbarConfig: { pin: true },
            theme: themeState.currentTheme.vditorTheme as any,
            preview: {
                theme: {
                    current: themeState.currentTheme.vditorTheme,
                },
                hljs: {
                    style: themeState.currentTheme.codeTheme,
                    lineNumber: await getSetting('lineNumber'),
                },
            },
            upload: {
                url: 'http://localhost:52521/api/image/upload',
                linkToImgUrl: autoSaveExternalImage ? 'http://localhost:52521/api/image/url-upload' : undefined,
                success: (editor, msg) => {
                    const data = JSON.parse(msg);
                    const filePaths = data.data.succMap;
                    for (const key in filePaths) {
                        const imageUrl = filePaths[key]; // 直接使用返回的路径
                        vditor.value?.insertValue(`![](${imageUrl})`);  // 插入图片链接
                    }
                },
                error: (msg) => {
                    logger.error('Upload Error:', msg);
                },
            },
            toolbar: [
                {
                    name: 'undo',
                    tip: t('article.toolbar.undo'),
                    tipPosition: 's',
                },
                {
                    name: 'redo',
                    tip: t('article.toolbar.redo'),
                    tipPosition: 's',
                },
                {
                    name: 'outline',
                    tip: t('article.toolbar.toggle_outline'),
                    tipPosition: 's',
                    
                },
                {
                    name: 'headings',
                    tip: t('article.toolbar.headings'),
                    tipPosition: 's',
                },
                {
                    name: 'bold',
                    tip: t('article.toolbar.bold'),
                    tipPosition: 's',
                },
                {
                    name: 'italic',
                    tip: t('article.toolbar.italic'),
                    tipPosition: 's',
                },
                {
                    name: 'strike',
                    tip: t('article.toolbar.strike'),
                    tipPosition: 's',
                },
                {
                    name: 'link',
                    tip: t('article.toolbar.link'),
                    tipPosition: 's',
                },
                {
                    name: 'list',
                    tip: t('article.toolbar.list'),
                    tipPosition: 's',
                },
                {
                    name: 'table',
                    tip: t('article.toolbar.table'),
                    tipPosition: 's',
                },
                {
                    name: 'code',
                    tip: t('article.toolbar.code'),
                    tipPosition: 's',
                },
                {
                    name: 'preview',
                    tip: t('article.toolbar.preview'),
                    tipPosition: 's',
                },
                {
                    name: 'fullscreen',
                    tip: t('article.toolbar.fullscreen'),
                    tipPosition: 's',
                },
                {
                    name: "quote",
                    tip: t('article.toolbar.quote'),
                    tipPosition: "s",
                },

                {
                    name: 'search-replace',
                    tip: t('article.toolbar.search_replace'),
                    tipPosition: 's',
                    className: 'right',
                    icon: '<svg><use xlink:href="#vditor-icon-info"></use></svg>',
                    click() { eventBus.emit('search-replace') },
                },
                {
                    name: 'ai-assistant',
                    tip: t('article.toolbar.ai_assistant'),
                    tipPosition: 's',
                    className: 'right',
                    icon: `<img src="${currentAiLogo.value}" style="width: 20px; height: 20px; " />`,
                    click() { handleMenuClick('ai-assistant') },
                },
            ],

            cdn: cdn,
            cache: { enable: false },
            placeholder: t('article.input_placeholder'),
            outline: {
                enable: true,
                position: "left",
            },
            value: currentMarkdown.value,
            input: async (value) => {

                markEditorInteraction();
                lastAppliedContent.value = value;
                // currentMarkdown.value = value;
                currentView.value = 'article';
                workspace.updateDocumentMarkdown(props.tabId, value);
                
                // 确保适配器已设置（如果还没有设置）
                if (!aiCompletionService.getAdapter() && vditor.value) {
                    const adapter = new VditorEditorAdapter(
                        vditor.value,
                        'vditor-reset',
                        () => isActive.value
                    );
                    aiCompletionService.setAdapter(adapter);
                }
                
                // 用户继续打字时，立即取消当前补全
                aiCompletionService.cancelCurrentCompletion();
                
                // 触发AI补全（使用双层防抖，自动检测关键字符）
                aiCompletionService.triggerCompletion('input');

                syncOutlineFromMarkdown();
                await bindTitleMenu();

            },
            after: async () => {

                //logger.log(themeState);
                try {
                    flushOutlineSync();
                    await bindTitleMenu();
                    // 初始化大纲显示状态
                    await nextTick();

                } catch (e) {
                    logger.error(e);
                }
                finally {
                    loadingInstance.close();
                }
                
                // 设置编辑器适配器（确保在after回调中也设置，以防input事件还没触发）
                if (vditor.value) {
                    const adapter = new VditorEditorAdapter(
                        vditor.value,
                        'vditor-reset',
                        () => isActive.value
                    );
                    aiCompletionService.setAdapter(adapter);
                    
                        // 监听键盘事件，检测Enter、Space等触发按键和手动触发（Ctrl+Space）
                        const editorElement = vditor.value?.vditor?.element;
                        if (editorElement) {
                            // 监听鼠标点击事件，切换光标位置时取消补全并切换到被动状态
                            // 注意：只处理左键点击，右键点击用于打开上下文菜单，不应该拦截
                            const handleMouseDown = (e: MouseEvent) => {
                                // 只处理左键点击（button === 0），右键点击（button === 2）不处理
                                if (e.button === 0) {
                                    // 检查是否点击在编辑器内容区域（不是工具栏等）
                                    const target = e.target as HTMLElement;
                                    if (target && (target.closest('.vditor-content') || target.closest('.vditor-ir'))) {
                                        markEditorInteraction();
                                        aiCompletionService.handleMouseClick();
                                    }
                                }
                            };
                            
                            editorElement.addEventListener('mousedown', handleMouseDown);
                            
                            // 监听键盘事件
                            const handleKeyDown = (e: KeyboardEvent) => {
                                // 手动触发（Ctrl+Tab 或 Mac 上的 Command+Tab）
                                const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
                                const modifierKey = isMac ? e.metaKey : e.ctrlKey;
                                if (modifierKey && e.key === 'Tab') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    markEditorInteraction();
                                    aiCompletionService.triggerCompletion('manual');
                                    return;
                                }
                                
                                // 检测触发按键（Enter、Space、;、,）
                                const key = e.key === 'Enter' ? 'Enter' :
                                           e.key === ' ' ? 'Space' :
                                           e.key === ';' ? ';' :
                                           e.key === ',' ? ',' : null;
                                
                                if (key) {
                                    // 用户继续打字时，立即取消当前补全
                                    markEditorInteraction();
                                    aiCompletionService.cancelCurrentCompletion();
                                    // 触发补全（按键触发）
                                    aiCompletionService.triggerCompletion('key', key);
                                } else {
                                    // 其他按键：用户继续打字，立即取消补全
                                    aiCompletionService.cancelCurrentCompletion();
                                }
                            };
                            
                            editorElement.addEventListener('keydown', handleKeyDown);
                        
                        // 保存清理函数
                        const originalCleanup = (vditor.value as any)._aiCompletionCleanup || [];
                        (vditor.value as any)._aiCompletionCleanup = [
                            ...originalCleanup,
                            () => {
                                clearInterval(checkCursorInterval);
                                if (editorElement) {
                                    editorElement.removeEventListener('mousedown', handleMouseDown);
                                    editorElement.removeEventListener('keydown', handleKeyDown);
                                }
                            }
                        ];
                    }
                }

            },
        });
        textEditorAdapter.value = createVditorAdapter({
            getInstance: () => vditor.value as unknown as Vditor | null,
            syncMarkdown: (markdown: string) => {
                workspace.updateDocumentMarkdown(props.tabId, markdown);
            }
        });
    }
    catch (e) {
        logger.error(e);
        eventBus.emit('show-error',
            t('article.vditor_init_failed') + e
        );
    }
    finally {
        loadingInstance.close();
    }
});
const currentAiLogo = computed(() => {

    return themeState.currentTheme.type === 'dark' ? AiLogoWhite : AiLogo;
});
// 清理资源
onBeforeUnmount(() => {
    flushOutlineSync();
    
    // 移除编辑器适配器
    aiCompletionService.removeAdapter();
    
    const instance = vditor.value;
    if (instance && (instance as any).element) {
        try {
            instance.destroy();
        } catch (error) {
            logger.warn('销毁 Vditor 失败，将忽略', error);
        }
    }
    eventBus.off('refresh', handleRefresh);
    eventBus.off('sync-active-editor');
    eventBus.off('search-replace');
    eventBus.off('vditor-sync-with-html', handleSyncWithHtml);
    eventBus.off('sync-editor-theme', handleSyncEditorTheme);
    if (layoutObserver) {
        layoutObserver.disconnect();
        layoutObserver = null;
    }
    textEditorAdapter.value = null;
    if (typeof window !== "undefined") {
        window.removeEventListener('resize', updateSearchMenuPosition);
    }
});

const handleSyncEditorTheme = async () => {
    if (!isActive.value) return;
    let contentTheme = await getSetting('contentTheme');
    if (contentTheme === 'auto') {
        contentTheme = themeState.currentTheme.vditorTheme;
    }
    let codeTheme = await getSetting('codeTheme');
    if (codeTheme === 'auto') {
        codeTheme = themeState.currentTheme.vditorTheme;
    }

    vditor.value?.setTheme(themeState.currentTheme.vditorTheme as any, contentTheme as any, codeTheme as any);
    scheduleSetValue(currentMarkdown.value, { clearHistory: true, timeoutMs: 0 });
};
eventBus.on('sync-editor-theme', handleSyncEditorTheme);

watch(
    () => currentMarkdown.value,
    (content) => {
        if (!isActive.value) return;
        const incoming = content ?? '';
        if (incoming !== lastAppliedContent.value) {
            scheduleSetValue(incoming, { clearHistory: true });
            bindTitleMenu();
        }
    },
);

watch(
    isActive,
    (active) => {
        if (!active) return;
        const desired = currentMarkdown.value ?? '';
        if (desired !== lastAppliedContent.value) {
            scheduleSetValue(desired, { clearHistory: true });
        }
        bindTitleMenu();
    },
    { immediate: true },
);

</script>

<style scoped>
.main-container {
    /* 设置主题背景色 */
    background-color: v-bind('themeState.currentTheme.background');
}
.meta-info-menu {
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: center;
}

.footer-menu {
    display: flex;
    justify-content: center;
    align-items: center;
    border-top: 1px solid #ddd;
    background-color: #fff;
}

/* 上下两部分 */
.content-container {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
}

/* 左边的编辑器样式 */
.editor {
    flex: 1 1 auto;
    border-right: 1px solid #ddd;
    width: 100%;
    min-width: var(--editor-min-width, 360px);
    height: 100%;
    overflow: auto;
    scrollbar-color: #888 #63636300;
    scrollbar-width: thin;
}


/* 右边的元信息样式 */
.meta-info {
    color: black;
    flex: 0 0 auto;
    background-color: #f9f9f9;
    overflow: auto;
    box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
    padding: 5px;
    height: 100%;
}



/* 底部菜单样式 */
.footer-menu {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    border-top: 1px solid #ddd;
    background-color: #fff;
}

.context-menu {
    position: fixed;
    z-index: 1000;
}
</style>
