<template>
    <div class="main-container">
        <div class="content-container" ref="containerRef">
            <!-- 左边：Vditor Markdown 编辑器 -->
            <!-- 菜单组件 -->
                <SectionOptimizer
                    v-if="showSectionOptimizer && sectionOptimizerAdapter" 
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

            <!-- 主编辑器区域 -->
            <div :id="props.editorDomId" ref="vditorEl" class="editor" @keydown="handleTab"
                @contextmenu.prevent="openContextMenu($event)" :style="{
                    '--panel-background-color': themeState.currentTheme.editorPanelBackgroundColor,
                    '--toolbar-background-color': themeState.currentTheme.editorToolbarBackgroundColor,
                    '--textarea-background-color': themeState.currentTheme.editorTextareaBackgroundColor,
                    '--editor-min-width': MARKDOWN_LAYOUT.editorMinWidth + 'px',
                    '--editor-text-color': themeState.currentTheme.textColor,
                    color: themeState.currentTheme.textColor,
                }"></div>

        </div>
    </div>
</template>


<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, toRef, watch, shallowRef } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import Vditor from "vditor";
import "vditor/dist/index.css";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { isElectronEnv, getWindowType } from '../utils/event-bus';
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
import { useWorkspace } from '../stores/workspace';
import type { ArticleMetaData, DocumentOutlineNode } from '../../../types';
import { debounce } from "lodash";
import { createVditorAdapter } from "../editor/vditor-adapter";
import type { TextEditorAdapter } from "../editor/text-editor-types";
import { prependAiChatDialog } from '../utils/ai-chat-storage';
import { TitleIndex } from '../utils/title-index';

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

// 计算当前文档的 linkBase（使用公共函数）
const currentLinkBase = computed(() => {
  const path = documentRef.value.path;
  if (!path) return '';
  return workspace.getLinkBase(path);
})

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
    const extracted = extractOutlineTreeFromMarkdown(currentMarkdown.value, false);
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

// currentView不再需要，因为视图切换由Main.vue根据lastView控制
// 保留这个computed只是为了兼容旧代码，但不应该被设置
const currentView = computed(() => {
  const view = documentRef.value.lastView ?? 'editor'
  // 兼容旧的'article'值，转换为'editor'
  return (view as string) === 'article' ? 'editor' : view
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
  
  // 只在编辑器视图时才同步大纲，避免在outline视图时触发不必要的同步
  const currentView = documentRef.value.lastView ?? 'editor';
  // 兼容旧的'article'值（已被'editor'替代）
  if (currentView !== 'editor' && (currentView as string) !== 'article') {
    return;
  }
  
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
const titleIndex = ref<TitleIndex | null>(null);
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
// 关键修复：保存时抑制 watch 的 setValue，避免不必要的回写导致闪烁
// 保存时内容是从编辑器读取的，编辑器已经有最新内容，不需要回写
let isSavingFromEditor = false;

type SetValueOptions = {
    clearHistory?: boolean;
    timeoutMs?: number;
    preserveTheme?: boolean; // 是否在设置值后保留主题（防止主题被重置）
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
    // 检查 Vditor 实例是否已完全初始化（是否有 vditor 内部实例）
    if (!vditor.value.vditor || !vditor.value.vditor.ir) {
        // 如果未完全初始化，延迟执行
        setTimeout(() => {
            scheduleSetValue(normalized, options);
        }, 100);
        return;
    }
    if (normalized === lastAppliedContent.value) return;

    // 检查用户是否正在交互，如果是则缓存更新请求（避免打断用户输入）
    if (isEditorInteracting.value) {
        pendingExternalUpdate = { value: normalized, clearHistory: options.clearHistory };
        return;
    }

    const run = async () => {
        // 再次检查（因为 run 是异步执行的，可能在执行时用户已经开始输入）
        if (isEditorInteracting.value) {
            pendingExternalUpdate = { value: normalized, clearHistory: options.clearHistory };
            return;
        }
        try {
            // 如果设置了 preserveTheme 选项，则跳过主题重新应用（由调用者控制）
            // 否则，在 setValue 前先准备主题设置，准备在 setValue 后立即应用
            // 关键优化：直接从 themeState 获取主题（同步），避免 await getSetting 的延迟
            // 如果用户设置了具体值（非 auto），在 requestAnimationFrame 双重保障中会使用完整逻辑获取
            let themeToApply: { vditorTheme: string; contentTheme: string; codeTheme: string } | null = null;
            if (!options.preserveTheme && vditor.value) {
                // 直接从 themeState 获取主题（同步，避免延迟）
                // 大多数情况下，contentTheme 和 codeTheme 都是 'auto'，所以直接从 themeState 获取是正确的
                // 如果用户设置了具体值（非 auto），会在 requestAnimationFrame 双重保障中处理
                const vditorTheme = themeState.currentTheme.vditorTheme;
                // contentTheme 默认从 themeState 获取（auto 模式下的值）
                const contentTheme = vditorTheme === 'dark' ? 'dark' : 'light';
                // codeTheme 默认从 themeState 获取
                const codeTheme = themeState.currentTheme.codeTheme;
                
                themeToApply = {
                    vditorTheme: vditorTheme,
                    contentTheme: contentTheme,
                    codeTheme: codeTheme
                };
            }
            
            // 执行 setValue（这可能会重置主题）
            // 关键修复：不要在 setValue 前应用主题，因为 setValue 会重置它，浪费性能
            // 只在 setValue 后立即应用主题，使用同步方式避免闪烁
            vditor.value?.setValue(normalized, options.clearHistory ?? true);
            lastAppliedContent.value = normalized;
            
            // 关键修复：setValue 后立即（同步）重新应用主题，避免闪烁
            // 使用同步方式应用主题，不要延迟，确保在浏览器渲染前主题已经正确
            if (themeToApply && vditor.value && isActive.value) {
                try {
                    // 立即同步应用主题（不等待异步操作，使用已准备好的主题设置）
                    // 使用同步方式，确保在浏览器渲染前主题已经正确，避免闪烁
                    vditor.value.setTheme(
                        themeToApply.vditorTheme as any,
                        themeToApply.contentTheme as any,
                        themeToApply.codeTheme as any
                    );
                    logger.debug('Vditor 主题已同步（setValue后立即）', {
                        vditorTheme: themeToApply.vditorTheme,
                        contentTheme: themeToApply.contentTheme,
                        codeTheme: themeToApply.codeTheme
                    });
                    
                    // 使用 requestAnimationFrame 双重保障，确保主题在浏览器渲染后仍然正确
                    // 延迟到下一帧后再次验证和应用主题，处理可能的异步渲染导致的主题丢失
                    // 注意：使用双重 requestAnimationFrame 确保在浏览器完成渲染后执行
                    requestAnimationFrame(() => {
                        requestAnimationFrame(async () => {
                            if (vditor.value && isActive.value) {
                                // 再次确保主题正确（因为 setValue 可能会触发异步渲染，导致主题丢失）
                                // 这里使用完整的 handleSyncEditorTheme，确保主题设置是最新的
                                await handleSyncEditorTheme();
                            }
                        });
                    });
                } catch (error) {
                    logger.warn('setValue 后同步主题失败，尝试异步应用:', error);
                    // 如果同步应用失败，回退到异步方式
                    await handleSyncEditorTheme();
                }
            }
        } catch (error) {
            logger.warn('设置 Vditor 值失败，可能未完全初始化:', error);
        }
    };

    // 关键修复：对于保存操作（timeoutMs: 0），使用 setTimeout 立即执行，
    // 而不是 requestIdleCallback，避免延迟导致主题应用延迟
    // requestIdleCallback 会在浏览器空闲时执行，即使用 timeout 参数，也可能有延迟
    if (options.timeoutMs === 0) {
        // 立即执行，不使用 requestIdleCallback
        setTimeout(run, 0);
    } else if (typeof requestIdleCallback !== 'undefined') {
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

// 使用 document.execCommand 来触发复制粘贴剪切操作（Vditor 会自动处理）
const executeEditorCommand = (command: string) => {
    const editorRoot = getEditorRoot();
    if (!editorRoot || !vditor.value) return;
    
    // 获取可编辑元素（Vditor的内容区域）
    const editableElement = editorRoot.querySelector('.vditor-content') || 
                           editorRoot.querySelector('.vditor-ir') || 
                           editorRoot.querySelector('.vditor-wysiwyg') || 
                           editorRoot.querySelector('.vditor-sv') ||
                           editorRoot;
    
    if (!editableElement) return;
    
    // 确保元素获得焦点
    (editableElement as HTMLElement).focus();
    
    // 使用 document.execCommand，Vditor 会自动处理这些命令
    // 对于 Vditor，execCommand 会触发其内部的粘贴处理逻辑（包括图片）
    try {
        const success = document.execCommand(command);
        if (!success && command === 'paste') {
            // 如果 execCommand 失败，尝试使用 Vditor 的 API
            // Vditor 会自动处理粘贴事件，包括图片上传
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
            });
            editableElement.dispatchEvent(pasteEvent);
        }
    } catch (error) {
        logger.warn('执行编辑器命令失败', { command, error });
    }
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
            // 获取文章标题：优先使用 meta.title，如果没有则从内容中提取
            let articleTitle = documentRef.value.meta?.title?.trim() || '';
            if (!articleTitle) {
                const { extractTitleFromContent } = await import('../utils/title-extractor');
                const extractedTitle = extractTitleFromContent(currentMarkdown.value, 'md');
                articleTitle = extractedTitle || '';
            }
            // 如果没有标题，使用默认文本
            const titleDisplay = articleTitle || t('article.untitled_document', '未命名文档');
            
            let messages: any[] = []
            messages.push({
                role: 'system',
                content: wholeArticleContextPrompt(text)
            })
            messages.push({
                role: 'assistant',
                content: t('article.ai_understood', { title: titleDisplay })
            })
            const newDialog = {
                title: t('article.ai_analyze_title', { title: titleDisplay }),
                messages: messages
            };
            //logger.log(newDialog)
            addDialog(newDialog, true)
            prependAiChatDialog(newDialog);
            // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
            eventBus.emit('ai-chat-dialogs-updated', null);
            eventBus.emit('ai-chat')
            break;
        case 'section-optimizer':
            await openSectionOptimizerFromContext();
            break;
        case 'insert-graph':
            await handleInsertGraph();
            break;
        case 'cut':
            // 使用 document.execCommand，让 Vditor 自己处理剪切操作
            executeEditorCommand('cut');
            break;
        case 'copy':
            // 使用 document.execCommand，让 Vditor 自己处理复制操作
            executeEditorCommand('copy');
            break;
        case 'paste':
            // 使用 document.execCommand，让 Vditor 自己处理粘贴操作（包括图片）
            executeEditorCommand('paste');
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
    
    // 设置菜单位置：居中显示在窗口中间
    // 使用窗口中心位置，组件会通过 transform 居中
    sectionOptimizerPosition.value = {
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
    }
    
    showSectionOptimizer.value = true
};

const handleRefresh = async () => {
    if (!isActive.value) return;
    scheduleSetValue(currentMarkdown.value, { clearHistory: true, timeoutMs: 0 });
};
eventBus.on('refresh', handleRefresh);

const handleSyncActiveEditor = async (payload?: { tabId?: string }) => {
    const resolvedTabId = payload?.tabId ?? activeTabIdRef?.value;
    if (resolvedTabId !== props.tabId) return;
    if (!vditor.value) return;
    
    // 关键修复：标记正在保存，抑制 watch 的 setValue，避免不必要的回写导致闪烁
    // 保存时内容是从编辑器读取的，编辑器已经有最新内容，不需要回写
    isSavingFromEditor = true;
    try {
        const latest = vditor.value.getValue();
        const currentContent = currentMarkdown.value;
        
        // 规范化函数：将 \r\n 转换为 \n（与 workspace 中的 normalizeContent 保持一致）
        const normalizeContent = (content: string) => content.replace(/\r\n/g, '\n');
        const normalizedLatest = normalizeContent(latest);
        const normalizedCurrent = normalizeContent(currentContent ?? '');
        
        // 保存操作：从编辑器读取内容并写入文件
        // 如果规范化后的内容相同，说明文档模型已经和编辑器内容同步，
        // 不需要调用 updateDocumentMarkdown，避免触发不必要的 watch 和 setValue
        if (normalizedLatest !== normalizedCurrent) {
            // 只有内容确实变化时才更新文档模型
            // 关键修复：在保存时，先更新 lastAppliedContent，避免 watch 触发 setValue
            // 这样 watch 检测到 incoming === lastAppliedContent，就不会调用 scheduleSetValue
            lastAppliedContent.value = normalizedLatest;
            // 然后调用 updateDocumentMarkdown 更新文档模型（会触发 watch，但 watch 会跳过 setValue）
            workspace.updateDocumentMarkdown(props.tabId, latest);
            // 注意：updateDocumentMarkdown 会触发 watch(currentMarkdown)，
            // 但由于我们已经设置了 isSavingFromEditor = true，watch 会跳过 setValue
            // 而且我们已经更新了 lastAppliedContent，即使 watch 执行，也会检测到 incoming === lastAppliedContent
            // 所以不会调用 scheduleSetValue，也就不会触发 setValue，不会闪烁
            
            // 为了确保主题正确，我们也在这里主动应用主题（双重保障）
            await nextTick();
            await handleSyncEditorTheme();
            requestAnimationFrame(async () => {
                await handleSyncEditorTheme();
            });
        } else {
            // 即使内容相同，也确保大纲是最新的（避免大纲提取算法的差异导致不一致）
            // 但只有在编辑器视图时才同步，避免在outline视图时触发
            const currentView = documentRef.value.lastView ?? 'editor';
            if (currentView === 'editor' || (currentView as string) === 'article') {
                syncOutlineFromMarkdown.cancel();
                syncOutlineFromMarkdown();
                flushOutlineSync();
            }
            
            // 关键修复：即使内容相同，也确保主题正确（防止之前的操作导致主题异常）
            await nextTick();
            await handleSyncEditorTheme();
            requestAnimationFrame(async () => {
                await handleSyncEditorTheme();
            });
        }
    } finally {
        // 关键修复：等待下一个 tick，确保 watch 已经处理完，再清除标志位
        // 这样 watch 在检查 isSavingFromEditor 时，标志位仍然是 true
        await nextTick();
        // 再等待一个 tick，确保所有 reactivity 更新都已完成
        await nextTick();
        isSavingFromEditor = false;
    }
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
  // 不修改视图，保持当前视图状态
    scheduleSetValue(currentMarkdown.value, { clearHistory: false });
  flushOutlineSync();
    bindTitleMenu();
    showSectionOptimizer.value = false;
};

// 关闭标题菜单
const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};

// 从右键菜单打开段落优化工具
// 处理插入绘图
const handleInsertGraph = async () => {
    if (!vditor.value || !props.tabId) {
        eventBus.emit('show-warning', t('graph.noEditor', '编辑器未就绪'))
        return
    }
    
    try {
        // 获取光标位置的上下文（类似自动补全）
        const markdown = vditor.value.getValue()
        const vditorInstance = vditor.value.vditor
        
        // 获取光标位置
        let cursorOffset = 0
        if (vditorInstance?.ir?.element) {
            const editorElement = vditorInstance.ir.element
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0)
                const preCaretRange = range.cloneRange()
                preCaretRange.selectNodeContents(editorElement)
                preCaretRange.setEnd(range.endContainer, range.endOffset)
                cursorOffset = preCaretRange.toString().length
            }
        }
        
        // 获取上下文（前后各200字符）
        const contextStart = Math.max(0, cursorOffset - 200)
        const contextEnd = Math.min(markdown.length, cursorOffset + 200)
        const context = markdown.substring(contextStart, contextEnd)
        
        // 打开绘图工具窗口，并传递上下文
        eventBus.emit('graph', { context, insertPosition: cursorOffset })
        
        // 监听绘图完成事件
        const onGraphComplete = (data: { imageUrl: string; imageMarkdown: string }) => {
            // 插入图片Markdown
            const imageMarkdown = data.imageMarkdown || `![生成的图片](${data.imageUrl})`
            insertText(imageMarkdown)
            eventBus.off('graph-complete', onGraphComplete as (payload?: unknown) => void)
        }
        
        eventBus.on('graph-complete', onGraphComplete as (payload?: unknown) => void)
    } catch (error) {
        logger.error('打开绘图工具失败:', error)
        eventBus.emit('show-error', error)
        }
}

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
                    const parent = node.parentNode;
                    if (!parent) break;
                    node = parent;
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
                        const parent = currentNode.parentNode;
                        if (!parent) break;
                        currentNode = parent;
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
            const firstSection = outline.children[0] as DocumentOutlineNode
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
            
            currentSectionTitle.value = firstSection.title || (firstSection.text?.split('\n')[0]?.replace(/^#+\s*/, '') || '段落优化')
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

    // 设置菜单位置：居中显示在窗口中间
    // 使用窗口中心位置，组件会通过 transform 居中
    sectionOptimizerPosition.value = {
        top: window.innerHeight / 2,
        left: window.innerWidth / 2
    }

    showSectionOptimizer.value = true
}

const handleSectionOptimizerClose = () => {
    showSectionOptimizer.value = false
    sectionOptimizerAdapter.value = null
}

// 切换Vditor编辑模式
const switchVditorMode = async (mode: 'wysiwyg' | 'ir' | 'sv') => {
    if (!vditor.value) return;
    try {
        // Vditor的setMode方法在工具栏按钮中，这里通过工具栏按钮触发
        const vditorInstance = vditor.value.vditor;
        if (vditorInstance && (vditorInstance as any).setMode) {
            (vditorInstance as any).setMode(mode);
        } else {
            // 如果setMode不存在，尝试通过工具栏按钮触发
            const toolbarElement = vditorInstance?.element?.querySelector('.vditor-toolbar');
            const modeButton = toolbarElement?.querySelector(`[data-name="mode"]`) as HTMLElement;
            if (modeButton) {
                // 点击模式按钮会循环切换模式，需要多次点击直到切换到目标模式
                const currentMode = vditor.value.getCurrentMode?.() || 'ir';
                const modes: ('wysiwyg' | 'ir' | 'sv')[] = ['wysiwyg', 'ir', 'sv'];
                const currentIndex = modes.indexOf(currentMode as any);
                const targetIndex = modes.indexOf(mode);
                if (currentIndex !== targetIndex) {
                    const clicks = (targetIndex - currentIndex + modes.length) % modes.length;
                    for (let i = 0; i < clicks; i++) {
                        modeButton.click();
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
        }
        await setSetting('vditorMode', mode);
        await nextTick();
        bindTitleMenu();
    } catch (error) {
        logger.error('切换Vditor模式失败', error);
    }
};

// 更新大纲
const bindTitleMenu = async () => {
    if (!isActive.value) return;
    // 检查 Vditor 是否已初始化
    if (!vditor.value || !vditor.value.vditor || !vditor.value.vditor.ir) {
        // 如果未初始化，延迟执行
        setTimeout(() => {
            bindTitleMenu();
        }, 100);
        return;
    }
    const editorRoot = getEditorRoot();
    if (!editorRoot) return;
    
    // 根据当前模式选择不同的选择器
    let currentMode: 'wysiwyg' | 'ir' | 'sv' = 'ir';
    try {
        currentMode = (vditor.value?.getCurrentMode?.() as 'wysiwyg' | 'ir' | 'sv') || 'ir';
    } catch (error) {
        logger.warn('获取 Vditor 模式失败，使用默认模式 ir:', error);
        currentMode = 'ir';
    }
    let sections: Element[] = [];
    
    if (currentMode === 'ir') {
        // IR模式：使用.vditor-ir__node
        sections = Array.from(editorRoot.querySelectorAll('.vditor-ir__node')).filter(node =>
            ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes((node as Element).tagName));
    } else if (currentMode === 'wysiwyg') {
        // WYSIWYG模式：标题直接在.vditor-reset下的H1-H6标签
        // 根据实际DOM结构：<div class="vditor-wysiwyg"><pre class="vditor-reset"><h1>...</h1></pre></div>
        const wysiwygContainer = editorRoot.querySelector('.vditor-wysiwyg .vditor-reset') || editorRoot.querySelector('.vditor-wysiwyg');
        if (wysiwygContainer) {
            // 直接查找.vditor-reset下的H1-H6标签
            sections = Array.from(wysiwygContainer.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(node => {
                // 确保不在预览区域
                const isInPreview = (node as Element).closest('.vditor-preview');
                return !isInPreview;
            });
            
            // 如果没找到，尝试查找.vditor-wysiwyg__block下的标题（备用方案）
            if (sections.length === 0) {
                const wysiwygBlocks = Array.from(wysiwygContainer.querySelectorAll('.vditor-wysiwyg__block'));
                sections = wysiwygBlocks.filter(block => {
                    if (!block || !block.classList) return false;
                    const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
                    return heading !== null;
                });
            }
        }
    } else if (currentMode === 'sv') {
        // SV模式：使用.vditor-sv__node
        sections = Array.from(editorRoot.querySelectorAll('.vditor-sv__node')).filter(node =>
            ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes((node as Element).tagName));
    }

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

    // 移除编辑器 DOM 的长按事件绑定，用户只能通过右键菜单优化段落
    // 只建立标题索引和设置 path 属性（用于搜索替换等功能）
    
    // 建立标题索引（用于优化查找替换性能）
    const titleElements: HTMLElement[] = [];
    sections.forEach((section, i) => {
        const node = treeNodeQueue[i];
        if (!section || !node?.path) return;
        
        // 检查元素是否仍然在DOM中
        if (!section.isConnected) {
            logger.debug('元素已不在DOM中，跳过', { i });
            return;
        }
        
        // 收集标题元素用于建立索引
        let titleElement: HTMLElement | null = null;
        if (currentMode === 'wysiwyg') {
            if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes((section as Element).tagName)) {
                titleElement = section as HTMLElement;
            } else if (section.classList && section.classList.contains && section.classList.contains('vditor-wysiwyg__block')) {
                const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
                titleElement = heading as HTMLElement;
            }
        } else {
            titleElement = section as HTMLElement;
        }
        if (titleElement) {
            titleElements.push(titleElement);
        }
        
        try {
            // 只设置 path 属性（用于搜索替换等功能），不绑定长按事件
            // 用户需要通过右键菜单或大纲面板来优化段落
            if (currentMode === 'wysiwyg') {
                // 检查是否是H1-H6标签
                if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes((section as Element).tagName)) {
                    if (section.isConnected) {
                        (section as Element).setAttribute('path', node.path);
                    }
                } else if (section.classList && section.classList.contains && section.classList.contains('vditor-wysiwyg__block')) {
                    // 如果是block，找到其中的标题元素来设置path
                    const heading = section.querySelector('h1, h2, h3, h4, h5, h6');
                    if (heading && heading.isConnected) {
                        heading.setAttribute('path', node.path);
                    }
                    // 也在block上设置path，方便查找
                    if (section.isConnected) {
                        (section as Element).setAttribute('path', node.path);
                    }
                } else {
                    if (section.isConnected) {
                        (section as Element).setAttribute('path', node.path);
                    }
                }
            } else {
                if (section.isConnected) {
                    (section as Element).setAttribute('path', node.path);
                }
            }
        } catch (error) {
            logger.warn('设置标题 path 属性失败', { error, section, node, isConnected: section.isConnected });
        }
    });
    
    // 建立标题索引
    try {
        titleIndex.value = TitleIndex.buildFromMarkdown(
            currentMarkdown.value,
            titleElements,
            outlineTree
        );
        logger.debug('标题索引建立完成', { count: titleIndex.value.getAllEntries().length });
    } catch (error) {
        logger.warn('建立标题索引失败', error);
        titleIndex.value = null;
    }

    const outlineNode = editorRoot.querySelector('.vditor-outline__content');
    //获取所有的span子标签，并且这些标签没有data-target-id属性
    const outlineSections = outlineNode
        ? Array.from(outlineNode.getElementsByTagName('span'))
            .filter(node => !node.hasAttribute('data-target-id'))
        : [];
    
    // 先移除所有旧的事件监听器（通过data-bound标记）
    outlineSections.forEach((section) => {
        const target = section as HTMLElement;
        if ((target as any)._outlineClickHandler) {
            target.removeEventListener('click', (target as any)._outlineClickHandler);
            target.removeEventListener('mousedown', (target as any)._outlineMousedownHandler);
            target.removeEventListener('mouseup', (target as any)._outlineMouseupHandler);
            target.removeEventListener('mouseleave', (target as any)._outlineMouseleaveHandler);
        }
    });
    
    outlineSections.forEach((section, i) => {
        const node = treeNodeQueue[i];
        const target = section as HTMLElement;
        if (node?.path) {
            target.setAttribute('path', node.path);
        }
        
        // 创建事件处理函数
        const handleClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            outlineMouseDownEvent(event, target);
        };
        
        const handleMousedown = (event: MouseEvent) => outlineMouseDownEvent(event, target);
        const handleMouseup = (event: MouseEvent) => mouseUpEvent(event, target);
        const handleMouseleave = (event: MouseEvent) => mouseLeaveEvent(event, target);
        
        // 保存处理函数引用以便后续移除
        (target as any)._outlineClickHandler = handleClick;
        (target as any)._outlineMousedownHandler = handleMousedown;
        (target as any)._outlineMouseupHandler = handleMouseup;
        (target as any)._outlineMouseleaveHandler = handleMouseleave;
        
        // 添加事件监听器
        target.addEventListener('click', handleClick);
        target.addEventListener('mousedown', handleMousedown);
        target.addEventListener('mouseup', handleMouseup);
        target.addEventListener('mouseleave', handleMouseleave);
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
    if (!editorRoot || !vditor.value) return;
    
    const currentMode = (vditor.value.getCurrentMode?.() as 'wysiwyg' | 'ir' | 'sv') || 'ir';
    
    const path = section.getAttribute('path');
    if (!path) return;
    
    // 确保只在编辑器内容区域查找，而不是大纲区域
    let editorContent: Element | null = null;
    if (currentMode === 'ir') {
        editorContent = editorRoot.querySelector('.vditor-ir');
    } else if (currentMode === 'wysiwyg') {
        editorContent = editorRoot.querySelector('.vditor-wysiwyg .vditor-reset') || editorRoot.querySelector('.vditor-wysiwyg');
    } else if (currentMode === 'sv') {
        editorContent = editorRoot.querySelector('.vditor-sv.vditor-reset') || editorRoot.querySelector('.vditor-sv');
    }
    
    if (!editorContent) {
        logger.warn('无法找到编辑器内容区域', { currentMode });
        return;
    }
    
    let title: Element | null = null;
    
    // 根据当前模式选择不同的查找方式，只在编辑器内容区域查找
    if (currentMode === 'ir') {
        const titles = editorContent.getElementsByClassName('vditor-ir__node');
        title = Array.from(titles).find(t => t.getAttribute('path') === path) || null;
    } else if (currentMode === 'wysiwyg') {
        // WYSIWYG模式：标题直接在.vditor-reset下的H1-H6标签
        // 方法1：直接查找所有H1-H6标签
        const headings = editorContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
        title = Array.from(headings).find(h => {
            // 确保不在预览区域和大纲区域
            const isInPreview = h.closest('.vditor-preview');
            const isInOutline = h.closest('.vditor-outline');
            return !isInPreview && !isInOutline && h.getAttribute('path') === path;
        }) || null;
        
        // 方法2：如果方法1没找到，尝试查找.vditor-wysiwyg__block下的标题
        if (!title) {
            const blocks = editorContent.getElementsByClassName('vditor-wysiwyg__block');
            const block = Array.from(blocks).find(b => {
                const blockPath = b.getAttribute('path');
                if (blockPath === path) return true;
                // 也检查block内的标题
                const heading = b.querySelector('h1, h2, h3, h4, h5, h6');
                return heading && heading.getAttribute('path') === path;
            });
            
            if (block) {
                // 优先使用标题元素
                const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
                if (heading && heading.getAttribute('path') === path) {
                    title = heading;
                } else if (block.getAttribute('path') === path) {
                    // 如果block有path，使用block
                    title = block;
                } else if (heading) {
                    // 如果block有path但标题没有，也使用标题（可能path在block上）
                    title = heading;
                }
            }
        }
        
        // 方法3：如果还是没找到，尝试查找所有有path的元素（但排除大纲区域和预览区域）
        if (!title) {
            const allElements = editorContent.querySelectorAll('[path]');
            title = Array.from(allElements).find(el => {
                // 确保不在大纲区域和预览区域
                const isInOutline = el.closest('.vditor-outline');
                const isInPreview = el.closest('.vditor-preview');
                return !isInOutline && !isInPreview && el.getAttribute('path') === path;
            }) || null;
        }
    } else if (currentMode === 'sv') {
        const titles = editorContent.getElementsByClassName('vditor-sv__node');
        title = Array.from(titles).find(t => t.getAttribute('path') === path) || null;
    }
    
    if (title) {
        // 聚焦到这个元素（在编辑器内容区域内）
        title.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        
        // 如果是IR或SV模式，尝试将光标定位到标题
        if (currentMode === 'ir' || currentMode === 'sv') {
            const range = document.createRange();
            const sel = window.getSelection();
            if (sel && title.firstChild) {
                range.setStart(title.firstChild, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } else if (currentMode === 'wysiwyg') {
            // WYSIWYG模式：尝试聚焦到标题元素或block
            const targetElement = title.querySelector('h1, h2, h3, h4, h5, h6') || title;
            (targetElement as HTMLElement).focus?.();
            
            // 尝试设置光标位置
            const range = document.createRange();
            const sel = window.getSelection();
            if (sel && targetElement.firstChild) {
                range.setStart(targetElement.firstChild, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    } else {
        logger.warn('未找到对应的标题元素', { path, currentMode });
    }
    
    // 如果不是点击事件（而是mousedown），继续处理长按逻辑
    if (event.type === 'mousedown') {
        mouseDownEvent(event, section);
    }
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
        
        // 检查是否有AI补全正在进行（通过检查ghost text是否存在）
        const hasActiveSuggestion = document.querySelector('.ai-suggestion-insert, .ai-suggestion-insert-dark');
        if (hasActiveSuggestion) {
            // AI补全正在进行，不插入制表符
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
        });
        layoutObserver.observe(containerRef.value);
        containerWidth.value = containerRef.value.clientWidth;
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
        // 读取图片上传配置
        const imageUploadConfig = await getSetting('imageUpload');
        // 如果 action 是 'none' 或未设置，fallback 到 'upload'
        const action = (imageUploadConfig?.action === 'none' || !imageUploadConfig?.action) ? 'upload' : imageUploadConfig.action;
        const uploadService = imageUploadConfig?.uploadService || 'local';
        
        // 根据配置决定上传 URL
        // 如果 action === 'upload'，使用配置的上传服务
        // 如果 action === 'saveToDocumentDir' 或 'saveToAssetsDir'，使用本地服务并传递 targetDir
        let uploadUrl: string | undefined;
        if (action === 'upload') {
            if (uploadService === 'custom' && imageUploadConfig?.customUploadApiUrl) {
                uploadUrl = imageUploadConfig.customUploadApiUrl;
            } else {
                // 本地服务：如果设置了 localImageDir，通过 targetDir 参数传递
                const localImageDir = imageUploadConfig?.localImageDir;
                if (localImageDir) {
                    uploadUrl = `http://localhost:52521/api/image/upload?targetDir=${encodeURIComponent(localImageDir)}`;
                } else {
                    uploadUrl = 'http://localhost:52521/api/image/upload';
                }
            }
        } else if (action === 'saveToDocumentDir' || action === 'saveToAssetsDir') {
            // 保存到文档目录，需要传递 targetDir
            // 注意：这里使用当前文档路径，如果文档未保存，会在 success 回调中处理
            const docPath = documentRef.value.path;
            if (docPath) {
                const { dirname, join } = await import('../utils/path-utils.js');
                const docDir = dirname(docPath);
                const targetDir = action === 'saveToDocumentDir' 
                    ? docDir 
                    : join(docDir, 'assets');
                uploadUrl = `http://localhost:52521/api/image/upload?targetDir=${encodeURIComponent(targetDir)}`;
            } else {
                // 文档未保存，使用默认上传目录
                uploadUrl = 'http://localhost:52521/api/image/upload';
            }
        }
        
        // 读取Vditor模式设置，如果不存在则使用默认值'ir'，并保存默认值
        let vditorMode = await getSetting('vditorMode');
        if (!vditorMode || !['wysiwyg', 'ir', 'sv'].includes(vditorMode)) {
            vditorMode = 'ir'; // 默认使用ir模式
            await setSetting('vditorMode', vditorMode); // 保存默认值
        }
        const supportedLang = ["en_US", "fr_FR", "pt_BR", "ja_JP", "ko_KR", "ru_RU", "sv_SE", "zh_CN", "zh_TW"]
        // 获取当前文档的目录路径作为 linkBase
        const linkBase = currentLinkBase.value;
        
        // 导入图片上传服务
        const { uploadImage, processImagePath } = await import('../utils/image-upload-service');
        
        vditor.value = new Vditor(props.editorDomId, {
            lang: supportedLang.includes(t('lang') as string) ? (t('lang') as any) : 'en_US',
            mode: vditorMode as 'wysiwyg' | 'ir' | 'sv',
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
                markdown: {
                    linkBase: linkBase,
                },
            },
            upload: uploadUrl ? {
                url: uploadUrl,

                linkToImgUrl: !imageUploadConfig?.keepNetworkImageUrl
                    ? (uploadService === 'custom' && imageUploadConfig?.customUploadApiUrl
                        ? imageUploadConfig.customUploadApiUrl
                        : 'http://localhost:52521/api/image/url-upload')
                    : undefined,
                success: async (editor, msg) => {
                    try {
                        // 重新读取配置，确保获取最新的设置（因为用户可能在运行时修改了设置）
                        const currentImageUploadConfig = await getSetting('imageUpload');
                        const currentAction = (currentImageUploadConfig?.action === 'none' || !currentImageUploadConfig?.action) ? 'upload' : currentImageUploadConfig.action;
                        
                        const data = JSON.parse(msg);
                        const filePaths = data.data.succMap;
                        for (const key in filePaths) {
                            const imageUrl = filePaths[key]; // 服务器返回的绝对路径
                            
                            // 检查图片是否在正确的位置
                            // 1. 如果 action === 'saveToDocumentDir' 或 'saveToAssetsDir'，检查是否在文档目录
                            // 2. 如果 action === 'upload' 且设置了 localImageDir，检查是否在设置的目录
                            let needReupload = false;
                            let expectedDir: string | null = null;
                            
                            if ((currentAction === 'saveToDocumentDir' || currentAction === 'saveToAssetsDir') && documentRef.value.path) {
                                // 检查是否在文档目录
                                const { dirname, join } = await import('../utils/path-utils.js');
                                const docDir = dirname(documentRef.value.path);
                                expectedDir = currentAction === 'saveToDocumentDir' ? docDir : join(docDir, 'assets');
                                
                                const imagePathNormalized = imageUrl.replace(/\\/g, '/');
                                const expectedDirNormalized = expectedDir.replace(/\\/g, '/');
                                
                                if (!imagePathNormalized.startsWith(expectedDirNormalized)) {
                                    needReupload = true;
                                }
                            } else if (currentAction === 'upload' && currentImageUploadConfig?.localImageDir) {
                                // 检查是否在设置的本地图片目录
                                const localImageDir = currentImageUploadConfig.localImageDir;
                                const imagePathNormalized = imageUrl.replace(/\\/g, '/');
                                const localImageDirNormalized = localImageDir.replace(/\\/g, '/');
                                
                                if (!imagePathNormalized.startsWith(localImageDirNormalized)) {
                                    needReupload = true;
                                    expectedDir = localImageDir;
                                }
                            }
                            
                            if (needReupload) {
                                // 图片不在正确位置，需要重新上传到正确位置
                                logger.debug('图片不在预期位置，重新上传到正确位置', {
                                    currentPath: imageUrl,
                                    expectedDir: expectedDir,
                                    action: currentAction
                                });
                                
                                const uploadResult = await uploadImage({
                                    url: imageUrl,
                                    documentPath: documentRef.value.path,
                                });
                                
                                if (uploadResult.success && uploadResult.imagePath) {
                                    vditor.value?.insertValue(`![](${uploadResult.imagePath})`);
                                    continue;
                                } else {
                                    logger.warn('重新上传失败，使用原始路径', uploadResult.error);
                                }
                            }
                            
                            // 使用 processImagePath 处理路径（会根据 action 和配置处理相对路径、URL转义等）
                            const processedPath = await processImagePath(
                                imageUrl,
                                documentRef.value.path
                            );
                            vditor.value?.insertValue(`![](${processedPath})`);
                        }
                    } catch (error) {
                        logger.error('Process image path failed:', error);
                        // 如果处理失败，使用原始路径
                        try {
                        const data = JSON.parse(msg);
                        const filePaths = data.data.succMap;
                        for (const key in filePaths) {
                            const imageUrl = filePaths[key];
                            vditor.value?.insertValue(`![](${imageUrl})`);
                            }
                        } catch (e) {
                            logger.error('Failed to parse upload response:', e);
                        }
                    }
                },
                error: (msg) => {
                    logger.error('Upload Error:', msg);
                },
            } : undefined,
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
                // {
                //     name: 'fullscreen',
                //     tip: t('article.toolbar.fullscreen'),
                //     tipPosition: 's',
                // },
                {
                    name: "quote",
                    tip: t('article.toolbar.quote'),
                    tipPosition: "s",
                },
                {
                    name: 'edit-mode',
                    tip: t('article.toolbar.mode'),
                    tipPosition: 's',
                    hotkey: '⌘⇧M',
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
            // 显式设置 customWysiwygToolbar 为空函数以避免类型错误
            customWysiwygToolbar: () => {
                // 空函数，不使用自定义工具栏
            },
            value: currentMarkdown.value,
            input: async (value) => {

                markEditorInteraction();
                lastAppliedContent.value = value;
                // currentMarkdown.value = value;
                // 不修改视图，保持当前视图状态
                workspace.updateDocumentMarkdown(props.tabId, value);
                // 注意：workspace.updateDocumentMarkdown 内部已经自动同步大纲树，
                // 所以不需要再调用 syncOutlineFromMarkdown，避免重复计算
                
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

                // 移除 syncOutlineFromMarkdown 调用，因为 workspace.updateDocumentMarkdown 已经自动同步大纲
                // 只在需要重新绑定标题菜单时调用 bindTitleMenu（延迟执行，避免频繁调用）
                bindTitleMenu();


            },
            after: async () => {

                //logger.log(themeState);
                try {
                    // 确保初始化后应用正确的主题
                    await handleSyncEditorTheme();
                    
                    // 确保初始化后同步内容（特别是对于新创建的tab）
                    // 如果当前tab是激活的，确保内容正确显示
                    if (isActive.value && vditor.value) {
                        const desired = currentMarkdown.value ?? '';
                        // 初始化时设置 lastAppliedContent，确保后续watch能正确检测变化
                        if (lastAppliedContent.value === '') {
                            lastAppliedContent.value = desired;
                        }
                        // 如果内容不一致，同步到编辑器
                        // 注意：scheduleSetValue 内部会在 setValue 后自动重新应用主题
                        if (desired !== lastAppliedContent.value) {
                            await nextTick();
                            scheduleSetValue(desired, { clearHistory: true, timeoutMs: 0, preserveTheme: false });
                        } else {
                            // 即使内容相同，也确保编辑器显示正确的内容
                            const currentValue = vditor.value.getValue();
                            if (currentValue !== desired) {
                                await nextTick();
                                scheduleSetValue(desired, { clearHistory: true, timeoutMs: 0, preserveTheme: false });
                            } else {
                                // 内容已经正确，确保主题也正确（可能初始化时主题未正确应用）
                                await nextTick();
                                await handleSyncEditorTheme();
                            }
                        }
                    }
                    flushOutlineSync();
                    bindTitleMenu();

                    
                    // 监听模式切换事件
                    if (vditor.value?.vditor?.element) {
                        const editorElement = vditor.value.vditor.element;
                        // 保存上一次的模式，用于检测变化
                        let lastMode = vditor.value?.getCurrentMode?.() as 'wysiwyg' | 'ir' | 'sv' || 'ir';
                        
                        const handleModeChange = async () => {
                            // 延迟一下，确保模式已经切换完成
                            await new Promise(resolve => setTimeout(resolve, 100));
                            await nextTick();
                            
                            // 获取当前模式并保存到设置
                            if (vditor.value) {
                                const currentMode = vditor.value.getCurrentMode?.() as 'wysiwyg' | 'ir' | 'sv';
                                if (currentMode && currentMode !== lastMode) {
                                    await setSetting('vditorMode', currentMode);
                                    lastMode = currentMode;
                                    logger.debug('Vditor模式已切换并保存', { mode: currentMode });
                                }
                            }
                            bindTitleMenu();
                        };
                        
                        // 监听Vditor内部的模式切换
                        const vditorInstance = vditor.value.vditor;
                        if (vditorInstance) {
                            // 通过监听工具栏按钮点击来检测模式切换
                            const toolbarElement = editorElement.querySelector('.vditor-toolbar');
                            if (toolbarElement) {
                                // 监听模式切换按钮（Vditor内部使用的是 'edit-mode' 作为按钮名称）
                                const modeButton = toolbarElement.querySelector('[data-name="edit-mode"]');
                                if (modeButton) {
                                    modeButton.addEventListener('click', handleModeChange);
                                }
                                
                                // 也监听可能的其他模式切换方式
                                const modeButtons = toolbarElement.querySelectorAll('[data-name="mode"], [data-name="edit-mode"]');
                                modeButtons.forEach(btn => {
                                    // 避免重复添加监听器
                                    if (!(btn as any)._modeChangeHandler) {
                                        (btn as any)._modeChangeHandler = handleModeChange;
                                        btn.addEventListener('click', handleModeChange);
                                    }
                                });
                                
                                // 使用MutationObserver监听编辑器内容区域的变化，检测模式切换
                                const editorContent = editorElement.querySelector('.vditor-content');
                                if (editorContent) {
                                    const modeObserver = new MutationObserver(async () => {
                                        if (vditor.value) {
                                            const currentMode = vditor.value.getCurrentMode?.() as 'wysiwyg' | 'ir' | 'sv';
                                            if (currentMode && currentMode !== lastMode) {
                                                await setSetting('vditorMode', currentMode);
                                                lastMode = currentMode;
                                                logger.debug('通过MutationObserver检测到模式切换并保存', { mode: currentMode });
                                                bindTitleMenu();
                                            }
                                        }
                                    });
                                    
                                    modeObserver.observe(editorContent, {
                                        childList: true,
                                        subtree: true,
                                        attributes: true,
                                        attributeFilter: ['class']
                                    });
                                    
                                    // 保存observer以便后续清理
                                    (vditor.value as any)._modeObserver = modeObserver;
                                }
                                
                                // 监听大纲按钮的点击事件
                                const outlineButton = toolbarElement.querySelector('[data-name="outline"]');
                                if (outlineButton) {
                                    outlineButton.addEventListener('click', async () => {
                                        // 等待大纲显示/隐藏动画完成
                                        await new Promise(resolve => setTimeout(resolve, 300));
                                        await nextTick();
                                        bindTitleMenu();
                                    });
                                }
                            }
                            
                            // 使用MutationObserver监听大纲DOM的变化
                            const outlineContainer = editorElement.querySelector('.vditor-outline');
                            if (outlineContainer) {
                                const outlineObserver = new MutationObserver(async (mutations) => {
                                    // 检查大纲是否从隐藏变为显示
                                    const isVisible = outlineContainer.classList.contains('vditor-outline--show') || 
                                                       (outlineContainer as HTMLElement).offsetWidth > 0;
                                    
                                    if (isVisible) {
                                        // 等待DOM更新完成
                                        await nextTick();
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                        bindTitleMenu();
                                    }
                                });
                                
                                outlineObserver.observe(outlineContainer, {
                                    attributes: true,
                                    attributeFilter: ['class', 'style'],
                                    childList: true,
                                    subtree: true
                                });
                                
                                // 保存observer以便清理
                                (vditor.value as any)._outlineObserver = outlineObserver;
                            }
                        }
                    }

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
                                    // 检查是否点击在ghost text上
                                    const target = e.target as HTMLElement;
                                    const isGhostText = target?.closest('.ai-suggestion-insert, .ai-suggestion-insert-dark');
                                    
                                    if (isGhostText) {
                                        // 如果点击的是ghost text，不取消补全，让AISuggestionGhost组件处理接受
                                        // 不调用handleMouseClick，让点击事件传播到ghost text元素
                                        return;
                                    }
                                    
                                    // 检查是否点击在编辑器内容区域（不是工具栏等）
                                    if (target && (target.closest('.vditor-content') || target.closest('.vditor-ir') || target.closest('.vditor-wysiwyg') || target.closest('.vditor-sv'))) {
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
            },
            getTitleIndex: () => titleIndex.value as TitleIndex | null
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
            // 清理大纲Observer
            if ((instance as any)._outlineObserver) {
                (instance as any)._outlineObserver.disconnect();
                (instance as any)._outlineObserver = null;
            }
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
    if (!isActive.value || !vditor.value) return;
    
    // 确保 Vditor 完全初始化
    if (!vditor.value.vditor) {
        // 如果未完全初始化，延迟执行
        setTimeout(() => {
            handleSyncEditorTheme();
        }, 100);
        return;
    }
    
    // 获取主题设置（等待完成，确保获取到正确的值）
    let contentTheme = await getSetting('contentTheme');
    if (contentTheme === 'auto') {
        // contentTheme应该是'light'或'dark'，根据vditorTheme来判断
        contentTheme = themeState.currentTheme.vditorTheme === 'dark' ? 'dark' : 'light';
    }
    
    let codeTheme = await getSetting('codeTheme');
    if (codeTheme === 'auto') {
        // codeTheme是代码高亮主题（hljs样式），应该使用themeState中的codeTheme
        codeTheme = themeState.currentTheme.codeTheme;
    }

    try {
        // 应用主题（setTheme的第一个参数是工具栏主题，第二个是内容预览主题，第三个是代码高亮主题）
        // 根据 Vditor API 文档：setTheme(theme: 'classic' | 'dark', contentTheme?: 'light' | 'dark', codeTheme?: string)
        vditor.value.setTheme(
            themeState.currentTheme.vditorTheme as any, 
            contentTheme as any, 
            codeTheme as any
        );
        
        logger.debug('Vditor 主题已同步', {
            vditorTheme: themeState.currentTheme.vditorTheme,
            contentTheme,
            codeTheme,
            isActive: isActive.value,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.warn('同步 Vditor 主题失败:', error);
    }
    
    // 注意：不要在这里调用scheduleSetValue，因为：
    // 1. setTheme本身不会改变内容，不需要重新设置内容
    // 2. scheduleSetValue可能会触发Vditor内部重新渲染，导致主题丢失
    // 3. 如果确实需要重新渲染（比如内容已改变），应该由其他逻辑（如watch）来触发
};
eventBus.on('sync-editor-theme', handleSyncEditorTheme);

watch(
    () => currentMarkdown.value,
    (content) => {
        if (!isActive.value) return;
        // 关键修复：保存时不触发 setValue，避免不必要的回写导致闪烁
        // 保存时内容是从编辑器读取的，编辑器已经有最新内容，不需要回写
        if (isSavingFromEditor) {
            // 保存操作：只是同步 lastAppliedContent，不调用 setValue
            const incoming = content ?? '';
            lastAppliedContent.value = incoming;
            return;
        }
        const incoming = content ?? '';
        if (incoming !== lastAppliedContent.value) {
            // 注意：scheduleSetValue 内部会在 setValue 后自动重新应用主题
            // 关键修复：使用 timeoutMs: 0 立即执行，避免 requestIdleCallback 延迟导致主题应用延迟
            // 这里才是真正的"外部更新"（如打开文件、大纲同步、Tab 切换等），需要回写到编辑器
            scheduleSetValue(incoming, { clearHistory: true, timeoutMs: 0 });
            bindTitleMenu();
        }
    },
);

watch(
    isActive,
    async (active) => {
        if (!active) return;
        // 如果Vditor还未初始化，等待初始化完成
        if (!vditor.value) {
            // 等待Vditor初始化（通过监听vditor的创建）
            await new Promise<void>((resolve) => {
                let attempts = 0;
                const maxAttempts = 50; // 最多等待5秒
                const checkVditor = () => {
                    attempts++;
                    if (vditor.value && vditor.value.vditor && vditor.value.vditor.ir) {
                        resolve();
                    } else if (attempts < maxAttempts) {
                        setTimeout(checkVditor, 100);
                    } else {
                        logger.warn('等待 Vditor 初始化超时');
                        resolve(); // 超时后也继续，避免无限等待
                    }
                };
                checkVditor();
            });
        } else {
            // 即使有 vditor.value，也要检查是否完全初始化
            if (!vditor.value.vditor || !vditor.value.vditor.ir) {
                // 等待完全初始化
                await new Promise<void>((resolve) => {
                    let attempts = 0;
                    const maxAttempts = 50;
                    const checkInitialized = () => {
                        attempts++;
                        if (vditor.value && vditor.value.vditor && vditor.value.vditor.ir) {
                            resolve();
                        } else if (attempts < maxAttempts) {
                            setTimeout(checkInitialized, 100);
                        } else {
                            logger.warn('等待 Vditor 完全初始化超时');
                            resolve();
                        }
                    };
                    checkInitialized();
                });
            }
        }
        // 确保DOM已经更新
        await nextTick();
        const desired = currentMarkdown.value ?? '';
        if (desired !== lastAppliedContent.value) {
            scheduleSetValue(desired, { clearHistory: true, timeoutMs: 0 });
        } else if (vditor.value && vditor.value.vditor && vditor.value.vditor.ir) {
            // 即使内容相同，也检查Vditor内部的值是否一致
            try {
                const currentValue = vditor.value.getValue();
                if (currentValue !== desired) {
                    scheduleSetValue(desired, { clearHistory: true, timeoutMs: 0 });
                }
            } catch (error) {
                logger.warn('获取 Vditor 当前值失败:', error);
            }
        }
        // 确保主题正确（Tab 激活时可能主题未同步）
        await nextTick();
        await handleSyncEditorTheme();
        
        // 延迟执行 bindTitleMenu，确保 Vditor 完全准备好
        await nextTick();
        setTimeout(() => {
            bindTitleMenu();
        }, 50);
    },
    { immediate: true },
);

// 监听文档路径变化，更新 linkBase
watch(
    () => documentRef.value.path,
    (newPath) => {
        if (!vditor.value || !isActive.value) return;
        const newLinkBase = workspace.getLinkBase(newPath || '');
        // 尝试更新 Vditor 内部的 linkBase 配置
        try {
            const vditorInstance = vditor.value.vditor;
            if (vditorInstance && (vditorInstance as any).options?.preview?.markdown) {
                (vditorInstance as any).options.preview.markdown.linkBase = newLinkBase;
                logger.debug('已更新 Vditor linkBase', { newLinkBase, path: newPath });
            }
        } catch (error) {
            logger.warn('更新 Vditor linkBase 失败', error);
        }
    },
);

// 监听 themeState 变化，确保 Vditor 主题同步
watch(
    () => [themeState.currentTheme.vditorTheme, themeState.currentTheme.codeTheme, themeState.currentTheme.type],
    () => {
        if (!isActive.value || !vditor.value) return;
        // 当主题变化时，触发主题同步
        handleSyncEditorTheme();
    },
    { deep: false }
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
    border-right: 1px solid rgba(128, 128, 128, 0.3);
    width: 100%;
    min-width: var(--editor-min-width, 360px);
    height: 100%;
    overflow: auto;
    scrollbar-color: #888 #63636300;
    scrollbar-width: thin;
    color: var(--editor-text-color, inherit);
}

/* 强制覆盖 Vditor 的文字颜色 */
.editor :deep(.vditor-reset),
.editor :deep(.vditor-ir),
.editor :deep(.vditor-wysiwyg),
.editor :deep(.vditor-sv) {
    color: var(--editor-text-color, inherit) !important;
}

.editor :deep(.vditor-reset *),
.editor :deep(.vditor-ir *),
.editor :deep(.vditor-wysiwyg *),
.editor :deep(.vditor-sv *) {
    color: inherit;
}

/* 确保标题、段落等文字颜色正确 */
.editor :deep(.vditor-reset h1),
.editor :deep(.vditor-reset h2),
.editor :deep(.vditor-reset h3),
.editor :deep(.vditor-reset h4),
.editor :deep(.vditor-reset h5),
.editor :deep(.vditor-reset h6),
.editor :deep(.vditor-reset p),
.editor :deep(.vditor-reset li),
.editor :deep(.vditor-reset td),
.editor :deep(.vditor-reset th),
.editor :deep(.vditor-ir__node),
.editor :deep(.vditor-wysiwyg__block),
.editor :deep(.vditor-sv__node) {
    color: var(--editor-text-color, inherit) !important;
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
