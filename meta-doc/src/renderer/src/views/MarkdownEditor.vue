<template>
    <div class="main-container">
        <div class="content-container" ref="containerRef">
            <!-- 左边：Vditor Markdown 编辑器 -->
            <!-- 菜单组件 -->
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
            <ContextMenu :x="menuX" :y="menuY" :items="articleContextMenuItems" :selection="getSelection()"
                v-if="contextMenuVisible" @trigger="handleMenuClick" class="context-menu"
                @close="contextMenuVisible = false;" @insert="insertText" />
            <AISuggestion v-if="vditorEl" :targetEl="vditorEl" :trigger="triggerSuggestion" :rootNodeClass="'vditor-reset'"
                @accepted="onAcceptSuggestion" @cancelled="onCancelSuggestion" @reset="onResetSuggestion"
                @triggerSuggestion="trytriggerSuggestion" />

            <ResizableContainer
                ref="resizableRef"
                direction="vertical"
                :initial-sidebar-size="MARKDOWN_LAYOUT.initialSidebarWidth"
                :min-size="MARKDOWN_LAYOUT.sidebarMinWidth"
                :max-size="MARKDOWN_LAYOUT.sidebarMaxWidth"
                :reverse="true"
                sidebar-position="end"
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
                    <div style="text-align: center; font-size: large;">
                        <el-tooltip :content="$t('article.edit_meta_info')" placement="left">
                            <h1 class="interactive-text" @click="showMetaDialog"
                                :style="{ color: themeState.currentTheme.textColor }">
                                {{ $t('article.meta_info') }}
                            </h1>
                        </el-tooltip>
                    </div>
                    <el-button type="primary" text bg @click="convertToLatex" style="
                    width:fit-content">
                        {{ $t('article.convert_to_latex')  }}
                    </el-button>
                    <el-tooltip :content="$t('article.click_to_edit_title')" placement="left">
                        <h1 @click="genTitleDialogVisible = !genTitleDialogVisible" class="interactive-text"
                            :style="{ color: themeState.currentTheme.textColor }">
                            {{ $t('article.title') }}：
                            {{ currentMeta.title || $t('article.no_title') }}
                        </h1>
                    </el-tooltip>

                    <LlmDialog v-if="genTitleDialogVisible"
                        :prompt="generateTitlePrompt(JSON.stringify(extractOutlineTreeFromMarkdown(currentMarkdown, true)))"
                        :title="$t('article.generate_title')" :llmConfig="{ max_tokens: 15, temperature: 0.0 }"
                        @llm-content-accept="(content: string) => {
                            updateMeta((meta) => { meta.title = content; });
                            genTitleDialogVisible = false;
                        }" @update:visible="genTitleDialogVisible = $event; genTitleDialogVisible = false"
                        :defaultText="currentMeta.title" :defaultInputSize="1"></LlmDialog>

                    <el-tooltip :content="$t('article.click_to_edit_author')" placement="left">
                        <p @click="modifyAuthorDialogVisible = !modifyAuthorDialogVisible" class="interactive-text"
                            :style="{ color: themeState.currentTheme.textColor }">
                            <strong>{{ $t('article.author') }}：</strong>
                            {{ currentMeta.author || $t('article.no_author') }}
                        </p>
                    </el-tooltip>

                    <LlmDialog v-if="modifyAuthorDialogVisible" :prompt="''" :title="$t('article.modify_author')"
                        :llmConfig="{}" @llm-content-accept="(content: string) => {
                            updateMeta((meta) => { meta.author = content; });
                            modifyAuthorDialogVisible = false;
                        }" @update:visible="modifyAuthorDialogVisible = $event; modifyAuthorDialogVisible = false"
                        :defaultText="currentMeta.author" :defaultInputSize="1"></LlmDialog>

                    <el-tooltip :content="$t('article.click_to_edit_description')" placement="left">
                        <p @click="genDescriptionDialogVisible = !genDescriptionDialogVisible" class="interactive-text"
                            :style="{ color: themeState.currentTheme.textColor }">
                            <strong>{{ $t('article.description') }}：</strong>
                            {{ currentMeta.description || $t('article.no_description') }}
                        </p>
                    </el-tooltip>

                    <LlmDialog v-if="genDescriptionDialogVisible"
                        :prompt="generateDescriptionPrompt(JSON.stringify(extractOutlineTreeFromMarkdown(currentMarkdown, true)))"
                        :title="$t('article.generate_description')" :llmConfig="{ max_tokens: 100, temperature: 0.0 }"
                        @llm-content-accept="(content: string) => {
                            updateMeta((meta) => { meta.description = content; });
                            genDescriptionDialogVisible = false;
                        }" @update:visible="genDescriptionDialogVisible = $event; genDescriptionDialogVisible = false"
                        :defaultText="currentMeta.description" :defaultInputSize="10"></LlmDialog>
                    </div>
                </template>
            </ResizableContainer>

            <el-dialog v-model="editMetaDialogVisible" :title="$t('article.edit_meta_info')" width="30%">
                <el-form>
                    <el-form-item :label="$t('article.title')">
                        <el-input
                            :model-value="currentMeta.title"
                            @update:model-value="(val: string) => updateMeta((meta) => { meta.title = val; })"
                            autocomplete="off"
                            class="aero-input"
                        />
                    </el-form-item>
                    <el-form-item :label="$t('article.author')">
                        <el-input
                            :model-value="currentMeta.author"
                            @update:model-value="(val: string) => updateMeta((meta) => { meta.author = val; })"
                            autocomplete="off"
                            class="aero-input"
                        />
                    </el-form-item>
                    <el-form-item :label="$t('article.description')">
                        <el-input
                            type="textarea"
                            :placeholder="$t('article.description_placeholder')"
                            :model-value="currentMeta.description"
                            @update:model-value="(val: string) => updateMeta((meta) => { meta.description = val; })"
                            autocomplete="off"
                            resize="none"
                            :autoSize="{ minRows: 3, maxRows: 5 }"
                            class="aero-input"
                        />
                    </el-form-item>
                </el-form>
            </el-dialog>
        </div>
    </div>
</template>


<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, toRef, watch, shallowRef } from "vue";
import ResizableContainer from '../components/base/ResizableContainer.vue';
import { ElButton, ElDialog, ElLoading, ElMessageBox } from 'element-plus';
import Vditor from "vditor";
import "vditor/dist/index.css";
import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { isElectronEnv, getWindowType } from '../utils/event-bus';
import { createRendererLogger } from '../utils/logger.ts'
import { generateDescriptionPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import { extractOutlineTreeFromMarkdown, generateMarkdownFromOutlineTree } from '../utils/md-utils';
import LlmDialog from "../components/LlmDialog.vue";
import TitleMenu from '../components/TitleMenu.vue';
import SearchReplaceMenu from "../components/SearchReplaceMenu.vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
import { themeState } from "../utils/themes";
import { getSetting, setSetting } from "../utils/settings";
import { localVditorCDN, vditorCDN } from "../utils/vditor-cdn";
import { waitForService } from "../utils/service-status.ts";
import { useI18n } from 'vue-i18n'
import AISuggestion from "../components/AISuggestion.vue";
import "../assets/ai-suggestion.css";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
import { useWorkspace } from '../stores/workspace';
import type { ArticleMetaData, DocumentOutlineNode } from '../../../types';
import { debounce } from "lodash";
import { createVditorAdapter } from "../editor/vditor-adapter";
import type { TextEditorAdapter } from "../editor/text-editor-types";

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
const genTitleDialogVisible = ref(false);
const genDescriptionDialogVisible = ref(false);
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const modifyAuthorDialogVisible = ref(false);
const searchReplaceDialogVisible = ref(false);
const vditor = ref<Vditor | null>(null); // Vditor 实例
const editMetaDialogVisible = ref(false); // 编辑元信息对话框
const articleContextMenuItems = ref<any[]>([]);//右键菜单项
const textEditorAdapter = shallowRef<TextEditorAdapter | null>(null);
const resizableRef = ref<InstanceType<typeof ResizableContainer> | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
let layoutObserver: ResizeObserver | null = null;

const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const currentTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
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
const triggerSuggestion = ref(false);
const lastAppliedContent = ref('');

function onAcceptSuggestion(text: string) {
    //logger.log("补全已接受:", text);
    insertText(text);
    triggerSuggestion.value = false;
}
function onCancelSuggestion() {
    //logger.log("补全已取消");
    triggerSuggestion.value = false;
    //状态不切换回false,保持为true
}
function onResetSuggestion() {
    //logger.log("补全已重置");
    //triggerSuggestion.value = false;
}

// 监听输入 -> 1秒后触发
let debounceTimer: NodeJS.Timeout | null = null;
function trytriggerSuggestion() {
    if (!isActive.value) return;
    triggerSuggestion.value = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    eventBus.on('cancel-suggestion',()=>{if (debounceTimer) clearTimeout(debounceTimer);})
    debounceTimer = setTimeout(() => {
        triggerSuggestion.value = true;
    }, 5000);

}


// 打开右键菜单
const openContextMenu = (event: MouseEvent) => {
    
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuVisible.value = true;
};

// 获取选中的文本
const getSelection = () => {
    return textEditorAdapter.value?.getSelectionText() ?? '';
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
            eventBus.emit('ai-chat')
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
        
    }
    await refreshContextMenu();
    contextMenuVisible.value = false;
};

// 更新编辑器内容
const showMetaDialog = () => {
    editMetaDialogVisible.value = true;
};
const convertToLatex=()=>{
    ElMessageBox.confirm(t('article.convert_to_latex_confirm'), t('knowledgeBase.delete_confirm_title'), {
        confirmButtonText: t('article.msgbox.confirm'),
        cancelButtonText: t('article.msgbox.cancel'),
        type: 'warning'
    }).then(() => {
        eventBus.emit('save-as',{format:"tex"});
    });
}
// 单击事件处理
const handleClick = (event: MouseEvent, title: string, path: string) => {
    currentTitle.value = title;
    let top = event.clientY * 0.9;
    if (top > document.body.clientHeight * 0.6) {
        top = document.body.clientHeight * 0.6;
    }
    menuPosition.value = {
        top,
        left: event.clientX * 1.2,
    };
    currentTitlePath.value = path;
    showTitleMenu.value = true;
};

const handleRefresh = () => {
    if (!isActive.value) return;
    vditor.value?.setValue(currentMarkdown.value, true);
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
eventBus.on('search-replace', handleSearchReplace);

watch(isActive, (active) => {
    if (!active) {
        searchReplaceDialogVisible.value = false;
    }
});

const handleSyncWithHtml = () => {
    if (!isActive.value) return;
    if (!vditor.value) return;
    const html = vditor.value.getHTML();
    vditor.value.setValue(vditor.value.html2md(html), true);
    currentMarkdown.value = vditor.value.getValue();
};
eventBus.on('vditor-sync-with-html', handleSyncWithHtml);


// 接受生成的文本
const acceptGeneratedText = async (payload: any) => {
    const { append, content } = payload;
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
    vditor.value?.setValue(currentMarkdown.value);
  flushOutlineSync();
    await bindTitleMenu();
};

// 关闭标题菜单
const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};

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
    if (event.key === "Tab") {
        //如果AISuggestion在工作，不插入制表符
        if (triggerSuggestion.value) {
            //logger.log('AI Suggestion is active, tab key pressed');
            return;
        }
        else {
            //logger.log('AI Suggestion is not active, tab key pressed');
        }

        event.preventDefault();
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

                // currentMarkdown.value = value;
                currentView.value = 'article';
                workspace.updateDocumentMarkdown(props.tabId, value);
                //trytriggerSuggestion();

                syncOutlineFromMarkdown();
                await bindTitleMenu();

            },
            after: async () => {

                //logger.log(themeState);
                try {
                    flushOutlineSync();
                    await bindTitleMenu();
                } catch (e) {
                    logger.error(e);
                }
                finally {
                    loadingInstance.close();
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
    eventBus.off('search-replace', handleSearchReplace);
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
    vditor.value?.setValue(currentMarkdown.value);
};
eventBus.on('sync-editor-theme', handleSyncEditorTheme);

watch(
    () => currentMarkdown.value,
    (content) => {
        if (!isActive.value) return;
        if (!vditor.value) return;
        const incoming = content ?? '';
        const currentValue = vditor.value.getValue();
        if (incoming !== currentValue) {
            nextTick(() => {
                vditor.value?.setValue(incoming, true);
                lastAppliedContent.value = incoming;
                bindTitleMenu();
            });
        }
    },
);

watch(
    isActive,
    (active) => {
        if (!active) return;
        if (!vditor.value) return;
        const desired = currentMarkdown.value ?? '';
        const currentValue = vditor.value.getValue();
        if (desired !== currentValue) {
            nextTick(() => {
                vditor.value?.setValue(desired, true);
                lastAppliedContent.value = desired;
                bindTitleMenu();
            });
        } else {
            bindTitleMenu();
        }
    },
    { immediate: true },
);

</script>

<style scoped>
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
