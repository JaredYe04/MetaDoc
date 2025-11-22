<template>
    <div class="main-container">
        <div class="content-container">

            <!-- 菜单组件 -->
                <SectionOptimizer
                    v-if="showSectionOptimizer" 
                :title="currentSectionTitle" 
                :position="sectionOptimizerPosition"
                :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(currentMarkdown, true)"
                :adapter="sectionOptimizerAdapter"
                :sectionInfo="currentSectionInfo"
                language="latex"
                @close="handleSectionOptimizerClose" 
                @accept="async (payload) => { await acceptGeneratedText(payload); }" 
                style="max-width: 500px;" 
            />
            <!-- 保留TitleMenu以兼容旧代码 -->
            <TitleMenu v-if="showTitleMenu" :title="currentTitle.replaceAll('#', '').trim()" :position="menuPosition"
                @close="handleTitleMenuClose" :path="currentTitlePath"
                :tree="extractOutlineTreeFromMarkdown(currentMarkdown, true)"
                @accept="async (payload) => { await acceptGeneratedText(payload); }" style="max-width: 500px;" />
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
            <AISuggestion :targetEl="editorEl" :trigger="triggerSuggestion" :rootNodeClass="'view-lines'"
                :context="suggestionContext" 
                @accepted="onAcceptSuggestion" @cancelled="onCancelSuggestion" @reset="onResetSuggestion" 
                @triggerSuggestion="trytriggerSuggestion"/>

            <div class="latex-layout">
                <ResizableContainer
                    direction="vertical"
                    :initial-sidebar-size="LATEX_LAYOUT.meta.initialWidth"
                    :min-size="LATEX_LAYOUT.meta.minWidth"
                    :max-size="LATEX_LAYOUT.meta.maxWidth"
                    :reverse="true"
                    sidebar-position="end"
                >
                    <template #main>
                        <div class="latex-main" ref="mainContainerRef">
                            <ResizableContainer
                                ref="pdfResizableRef"
                                direction="vertical"
                                :initial-sidebar-size="LATEX_LAYOUT.pdf.minWidth"
                                :min-size="LATEX_LAYOUT.pdf.minWidth"
                                :max-size="
                                    mainWidth > 0
                                        ? Math.max(
                                            LATEX_LAYOUT.pdf.minWidth,
                                            Math.min(
                                                mainWidth * LATEX_LAYOUT.pdf.maxRatio,
                                                mainWidth - LATEX_LAYOUT.left.minWidth
                                            )
                                        )
                                        : LATEX_LAYOUT.pdf.minWidth
                                "
                                sidebar-position="end"
                                :show-sidebar="showPdfPanel"
                                @resize="handlePdfResize"
                            >
                                <template #main>
                                    <div class="latex-column left-column">
                                <div class="toolbar" :style="{
                                    backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
                                }">
                                    <el-tooltip :content="$t('latexEditor.toolbar.undo')" placement="bottom">
                                        <div class="toolbar-icon" @click="undo">
                                            <el-icon>
                                                <ArrowLeft />
                                            </el-icon>
                                        </div>
                                    </el-tooltip>

                                    <el-tooltip :content="$t('latexEditor.toolbar.redo')" placement="bottom">
                                        <div class="toolbar-icon" @click="redo">
                                            <el-icon>
                                                <ArrowRight />
                                            </el-icon>
                                        </div>
                                    </el-tooltip>

                                    <el-tooltip :content="$t('latexEditor.toolbar.zoomIn')" placement="bottom">
                                        <div class="toolbar-icon" @click="zoomIn">
                                            <el-icon>
                                                <ZoomIn />
                                            </el-icon>
                                        </div>
                                    </el-tooltip>

                                    <el-tooltip :content="$t('latexEditor.toolbar.zoomOut')" placement="bottom">
                                        <div class="toolbar-icon" @click="zoomOut">
                                            <el-icon>
                                                <ZoomOut />
                                            </el-icon>
                                        </div>
                                    </el-tooltip>

                                    <el-tooltip :content="$t('latexEditor.toolbar.toggleLineNumbers')" placement="bottom">
                                        <div class="toolbar-icon" @click="toggleRowNumber">
                                            <icon name="numbers-1" />
                                        </div>
                                    </el-tooltip>

                                    <el-tooltip :content="$t('latexEditor.toolbar.togglePreview')" placement="bottom">
                                        <div class="toolbar-icon" @click="toggleMinimap">
                                            <el-icon>
                                                <Memo />
                                            </el-icon>
                                        </div>
                                    </el-tooltip>

                                    <el-divider direction="vertical"></el-divider>

                                    <el-tooltip :content="$t('latexEditor.toolbar.showPdf')" placement="bottom">
                                        <div class="toolbar-icon" @click="togglePdf">
                                            <icon name="terminal" />
                                        </div>
                                    </el-tooltip>

                                    <el-tooltip :content="$t('latexEditor.toolbar.showConsole')" placement="bottom">
                                        <div class="toolbar-icon" @click="toggleConsole">
                                            <icon name="terminal-rectangle" />
                                        </div>
                                    </el-tooltip>
                                    <el-tooltip :content="$t('latexEditor.toolbar.compile')" placement="bottom">
                                        <div class="toolbar-icon" @click="compile">
                                            <icon name="code" />
                                        </div>
                                    </el-tooltip>
                                </div>
                                <div class="editor-console-container">
                                    <div class="editor" :key="editorKey" :id="editorDomId" ref="editorEl"
                                        @contextmenu.prevent="openContextMenu($event)"></div>
                                    <div v-show="showConsole" class="console-wrapper" :style="{ height: consoleHeight + 'px' }">
                                        <div class="editor-resizer" @mousedown="startResizeConsole"></div>
                                        <div class="console-panel" :style="{
                                            background: themeState.currentTheme.background
                                        }">
                                            <Console console-key="latex" />
                                        </div>
                                    </div>
                                </div>
                                </div>
                                </template>

                                <template #sidebar>
                                    <keep-alive>
                                        <div class="latex-column pdf-column" v-show="showPdfPanel">
                                            <div class="pdf-toolbar" v-if="pdfUrl"
                                                :style="{
                                                    backgroundColor: themeState.currentTheme.editorToolbarBackgroundColor
                                                }">
                                                <el-button size="small" @click="goPrevPage" :disabled="currentPdfPage <= 1">
                                                    {{ $t('latexEditor.prevPage') }}
                                                </el-button>

                                                <el-button size="small" @click="goNextPage"
                                                    :disabled="currentPdfPage >= totalPdfPages">
                                                    {{ $t('latexEditor.nextPage') }}
                                                </el-button>

                                                <span class="pdf-toolbar__page">
                                                    <input type="number" v-model.number="inputPdfPage" @change="jumpToPage" :min="1"
                                                        :max="totalPdfPages"
                                                    />
                                                    / {{ totalPdfPages }} {{ $t('latexEditor.pages') }}
                                                </span>
                                                <el-tooltip :content="$t('latexEditor.toolbar.zoomIn')" placement="bottom">
                                                    <div class="pdf-toolbar-icon" @click="pdfZoomIn">
                                                        <el-icon>
                                                            <ZoomIn />
                                                        </el-icon>
                                                    </div>
                                                </el-tooltip>

                                                <el-tooltip :content="$t('latexEditor.toolbar.zoomOut')" placement="bottom">
                                                    <div class="pdf-toolbar-icon" @click="pdfZoomOut">
                                                        <el-icon>
                                                            <ZoomOut />
                                                        </el-icon>
                                                    </div>
                                                </el-tooltip>
                                                <el-tooltip :content="$t('latexEditor.toolbar.zoomReset')" placement="bottom">
                                                    <div class="pdf-toolbar-icon" @click="pdfZoomReset">
                                                        <el-icon>
                                                            <Refresh />
                                                        </el-icon>
                                                    </div>
                                                </el-tooltip>
                                            </div>

                                            <div class="pdf-preview-container"
                                                :style="{ background: themeState.currentTheme.background }"
                                                @contextmenu.prevent="openPdfContextMenu($event)">
                                                <div ref="pdfContainer" id="pdfContainer" v-if="pdfUrl" class="pdf-container">
                                                    <div class="canvas-wrapper" ref="canvasWrapper"></div>
                                                </div>
                                                <h3 v-else class="pdf-empty-text">
                                                    {{ $t('latexEditor.pdfEmpty') }}
                                                </h3>
                                            </div>
                                            <ContextMenu 
                                                :x="pdfMenuX" 
                                                :y="pdfMenuY" 
                                                :items="pdfContextMenuItems"
                                                v-if="pdfContextMenuVisible" 
                                                @trigger="handlePdfMenuClick" 
                                                class="context-menu"
                                                @close="pdfContextMenuVisible = false" />
                                        </div>
                                    </keep-alive>
                                </template>
                            </ResizableContainer>
                        </div>
                    </template>

                    <template #sidebar>
                        <div
                            class="latex-column meta-column"
                            :style="{ backgroundColor: themeState.currentTheme.background2nd }"
                        >
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
    </div>
</template>


<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, watch, onUnmounted, shallowRef } from "vue";
import { ElButton, ElDialog, ElLoading } from 'element-plus';
import { Icon } from 'tdesign-icons-vue-next';

import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { getWindowType, sendBroadcast } from '../utils/event-bus';
import { searchNode } from "../utils/outline-helpers";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
import { getOutlineAdapter } from '../utils/outline-adapters';
import TitleMenu from '../components/TitleMenu.vue';
import SectionOptimizer from '../components/SectionOptimizer.vue';
import { LaTeXSectionAdapter } from '../components/section-optimizer/adapters/latex-adapter';
import SearchReplaceMenu from "../components/SearchReplaceMenu.vue";
import AiLogo from "../assets/ai-logo.svg";
import AiLogoWhite from "../assets/ai-logo-white.svg";
import { mixColors, themeState } from "../utils/themes";
import { getSetting, setSetting } from "../utils/settings";
import { useI18n } from 'vue-i18n'
import AISuggestion from "../components/AISuggestion.vue";
import "../assets/ai-suggestion.css";
import ResizableContainer from "../components/base/ResizableContainer.vue";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
import MetaInfoPanel from "../components/MetaInfoPanel.vue";
import Console from "../components/Console.vue";
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { createRendererLogger } from '../utils/logger.ts'
import { waitForService } from "../utils/service-status.ts";
import * as monaco from "monaco-editor";
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useWorkspace } from '../stores/workspace';

import 'monaco-latex';
import { ArrowLeft, ArrowRight, Document, Refresh, ZoomIn, ZoomOut } from "@element-plus/icons-vue";
import { debounce } from 'lodash';
import localIpcRenderer from "../utils/web-adapter/local-ipc-renderer";
import { webMainCalls } from "../utils/web-adapter/web-main-calls";
import { createMonacoAdapter } from "../editor/monaco-adapter";
import { prependAiChatDialog } from '../utils/ai-chat-storage';

const { t } = useI18n();
const logger = createRendererLogger('LaTeXEditor', {
    windowTypeProvider: () => getWindowType(),
});

const LATEX_LAYOUT = {
    meta: {
        minWidth: 260,
        maxWidth: 520,
        initialWidth: 320,
    },
    left: {
        minWidth: 360,
        maxRatio: 0.7,
    },
    pdf: {
        minWidth: 360,
        maxRatio: 0.55,
    },
};
const props = defineProps({
    tabId: {
        type: String,
        default: '',
    },
    active: {
        type: Boolean,
        default: true,
    },
    editorDomId: {
        type: String,
        default: 'latex-editor',
    },
});
const isActive = computed(() => props.active);

const workspace = useWorkspace();
const documentRef = computed(() => workspace.ensureDocument(props.tabId));

const currentTex = computed({
    get: () => documentRef.value.tex ?? '',
    set: (val) => {
        if (val === documentRef.value.tex) return;
        //logger.debug("LaTeXEditor currentTex set")//bugfix
        workspace.updateDocumentTex(props.tabId, val);
    },
});

const currentMeta = computed(() => documentRef.value.meta);

const currentOutline = computed({
    get: () => documentRef.value.outline,
    set: (val) => workspace.updateDocumentOutline(props.tabId, val),
});

const currentOutlineJson = computed(() => {
    try {
        return JSON.stringify(extractOutlineTreeFromMarkdown(currentMarkdown.value, true));
    } catch (error) {
        logger.warn('构建 LaTeX 大纲 JSON 失败', error);
        return '[]';
    }
});

const currentDialogs = computed(() => documentRef.value.aiDialogs ?? []);

const currentMarkdown = computed({
    get: () => documentRef.value.markdown ?? '',
    set: (val) => workspace.updateDocumentMarkdown(props.tabId, val),
});

const latestView = computed({
    get: () => documentRef.value.lastView ?? 'article',
    set: (val) => workspace.updateDocumentLastView(props.tabId, val),
});

const currentPath = computed(() => documentRef.value.path || '');

// 状态变量
const modifyContentDialogVisible = ref(false);
const continueContentDialogVisible = ref(false);
const searchReplaceDialogVisible = ref(false);
const editor = ref(null);
const articleContextMenuItems = ref([]);//右键菜单项
const textEditorAdapter = shallowRef(null);

const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const showSectionOptimizer = ref(false);
const currentTitle = ref("");
const currentSectionTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
const sectionOptimizerPosition = ref({ top: 0, left: 0 });
const sectionOptimizerAdapter = shallowRef(null);
const currentSectionInfo = ref(null);
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

// PDF右键菜单
const pdfContextMenuVisible = ref(false);
const pdfMenuX = ref(0);
const pdfMenuY = ref(0);
const pdfContextMenuItems = ref([
    { label: "latexEditor.pdfMenu.refresh", value: "refresh" },
    { label: "latexEditor.pdfMenu.locateToCode", value: "locate-to-code" },
    { type: "divider" },
    { label: "latexEditor.pdfMenu.zoomIn", value: "zoom-in" },
    { label: "latexEditor.pdfMenu.zoomOut", value: "zoom-out" },
    { label: "latexEditor.pdfMenu.zoomReset", value: "zoom-reset" },
    { type: "divider" },
    { label: "latexEditor.pdfMenu.openDirectory", value: "open-directory" },
    { label: "latexEditor.pdfMenu.save", value: "save" },
]);

const handleTitleMenuClose = () => {
    showTitleMenu.value = false;
};

// 从右键菜单打开段落优化工具
const openSectionOptimizerFromContext = async () => {
    if (!editor.value || !props.tabId) return
    
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId) || editor.value;
    if (!monacoEditor) return

    // 获取当前光标位置
    const position = monacoEditor.getPosition()
    if (!position) return

    // 创建适配器
    const adapter = new LaTeXSectionAdapter(props.tabId, editorId)
    adapter.setEditorId(editorId)
    sectionOptimizerAdapter.value = adapter

    // 获取当前章节信息
    const sectionInfo = await adapter.getSectionAtCursor({ 
        lineNumber: position.lineNumber, 
        column: position.column 
    })
    if (!sectionInfo) {
        // 如果没有找到章节，使用默认值
        currentSectionTitle.value = '段落优化'
        currentTitlePath.value = ''
        currentSectionInfo.value = null
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
const handleSearchReplaceClose = () => {
    searchReplaceDialogVisible.value = false;
};

const updateMeta = (updater) => {
    if (typeof updater === 'function') {
        workspace.updateDocumentMeta(props.tabId, updater);
    }
};

const handleMetaPatch = (patch) => {
    updateMeta((meta) => Object.assign(meta, patch));
};

const replaceDialogs = (builder) => {
    const base = [...currentDialogs.value];
    const next = builder(base);
    workspace.updateDocumentAiDialogs(props.tabId, next);
};

const addDialogEntry = (dialog, addToFront = false) => {
    replaceDialogs((dialogs) => {
        if (addToFront) {
            dialogs.unshift(dialog);
        } else {
            dialogs.push(dialog);
        }
        return dialogs;
    });
};

const acceptGeneratedText = async (payload) => {
    if (!payload) return;
    const { append, content, sectionInfo } = payload;
    
    // 如果有sectionInfo，使用它来应用内容
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
    if (!currentTitlePath.value) return;
    const clonedOutline = JSON.parse(JSON.stringify(currentOutline.value));
    const node = searchNode(currentTitlePath.value, clonedOutline);
    if (node) {
        node.text = append ? `${node.text || ''}${content}` : content;
        currentOutline.value = clonedOutline;
        latestView.value = 'outline';
    }
    showTitleMenu.value = false;
    showSectionOptimizer.value = false;
};

const editorEl = ref(null);
const editorKey = ref(Date.now());
const mainContainerRef = ref(null);
const pdfResizableRef = ref(null);
const mainWidth = ref(0);
let mainObserver = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const clampPdfWidth = (size) => {
    if (!showPdfPanel.value) return LATEX_LAYOUT.pdf.minWidth;
    const width = mainWidth.value || size + LATEX_LAYOUT.left.minWidth;
    const minAllowed = LATEX_LAYOUT.pdf.minWidth;
    const maxByEditor = width - LATEX_LAYOUT.left.minWidth;
    const maxByRatio = width * LATEX_LAYOUT.pdf.maxRatio;
    const maxAllowed = Math.max(minAllowed, Math.min(maxByEditor, maxByRatio));
    return clamp(size, minAllowed, maxAllowed);
};

const ensurePdfWithinBounds = () => {
    if (!pdfResizableRef.value || !showPdfPanel.value) return;
    const current = pdfResizableRef.value.getSidebarSize
        ? pdfResizableRef.value.getSidebarSize()
        : undefined;
    if (typeof current === 'number') {
        const clamped = clampPdfWidth(current);
        if (clamped !== current) {
            pdfResizableRef.value.setSidebarSize(clamped);
        }
    } else {
        const fallback = clampPdfWidth(LATEX_LAYOUT.pdf.minWidth);
        pdfResizableRef.value.setSidebarSize(fallback);
    }
};

const handlePdfResize = (size) => {
    const clamped = clampPdfWidth(size);
    if (clamped !== size && pdfResizableRef.value?.setSidebarSize) {
        pdfResizableRef.value.setSidebarSize(clamped);
    }
};

const editorDomId = computed(() => props.editorDomId || 'latex-editor');

// 增量同步缓存
let textBuffer = currentTex.value;

// 文本到大纲的同步（类似 MarkdownEditor）
let suppressOutlineSync = false;
const syncOutlineFromTex = debounce(() => {
    if (suppressOutlineSync) return;
    if (!isActive.value) return;
    try {
        const adapter = getOutlineAdapter('tex');
        const extractedOutline = adapter.fromText(currentTex.value);
        currentOutline.value = extractedOutline;
    } catch (error) {
        logger.warn('从 LaTeX 同步大纲树失败', error);
    }
}, 200);

const undo = () => editor.value.trigger("keyboard", "undo", null);
const redo = () => editor.value.trigger("keyboard", "redo", null);
const zoomIn = () => {
    const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize);
    editor.value.updateOptions({ fontSize: currentFontSize + 1 });
}
const zoomOut = () => {
    const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize);
    editor.value.updateOptions({ fontSize: currentFontSize + 1 });
}
let enableMinimap = true;
let enableRowNumber = true;
const toggleMinimap = () => {
    enableMinimap = !enableMinimap;
    editor.value.updateOptions({
        minimap: { enabled: enableMinimap }
    });
}
const toggleRowNumber = () => {
    enableRowNumber = !enableRowNumber;
    editor.value.updateOptions({
        lineNumbers: enableRowNumber ? 'on' : 'off'
    });
}

const showPdfPanel = ref(true)
const showConsole = ref(true)
const pdfUrl = ref('file:///')
const pdfContainer = ref(null);
const canvasWrapper = ref(null);
let isDragging = false;
let startX, startY, offsetX = 0, offsetY = 0;

import * as pdfjsLib from "pdfjs-dist";
import { wholeArticleContextPrompt } from "../utils/prompts.ts";
let pdfInitialized = false;
let pdfEventListenersAttached = false; // 标记事件监听器是否已绑定

let ipcRenderer = null
if (window && window.electron) {
    ipcRenderer = window.electron.ipcRenderer

} else {
    webMainCalls();
    ipcRenderer = localIpcRenderer
    //todo 说明当前环境不是electron环境，需要另外适配
}
let currentScale = 1;

// 将文件路径编码为 file:// URL
// 注意：file:// URL 需要正确编码路径中的特殊字符（如 #、空格、中文字符等）
function encodeFilePathToUrl(filePath) {
    if (!filePath) return '';
    
    // 移除 file:/// 前缀（如果存在）
    let path = filePath.replace(/^file:\/\/\//, '');
    
    // Windows 路径处理：将反斜杠转换为正斜杠
    path = path.replace(/\\/g, '/');
    
    // 分割路径为各个部分，对每个部分进行编码
    // 但保留路径分隔符和驱动器号（如 C:）
    const parts = path.split('/');
    const encodedParts = parts.map((part, index) => {
        if (index === 0 && part.endsWith(':')) {
            // Windows 驱动器号（如 C:）不需要编码
            return part;
        }
        // 对路径的每一部分进行编码
        // 使用 encodeURIComponent 编码，但需要处理一些特殊情况
        return encodeURIComponent(part).replace(/%2F/g, '/');
    });
    
    return `file:///${encodedParts.join('/')}`;
}

// 绑定 PDF 容器事件监听器
function attachPdfEventListeners() {
    // 如果已经绑定过，先移除旧的监听器（避免重复绑定）
    if (pdfEventListenersAttached) {
        return;
    }
    
    const container = pdfContainer.value;
    if (!container) {
        logger.debug('PDF容器尚未准备好，延迟绑定事件');
        return;
    }
    
    logger.debug('绑定PDF容器事件监听器');
    
    container.addEventListener("wheel", async (e) => {
        if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + 滚轮：缩放
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1; // 上滚放大，下滚缩小
            currentScale = Math.min(Math.max(currentScale + delta, 0.2), 5); // 限制缩放范围
            await renderPage(currentPdfPage.value, currentScale);
        } else {
            // 普通滚轮：翻页
            e.preventDefault();
            if (e.deltaY > 0) {
                // 下滚：下一页
                goNextPage();
            } else {
                // 上滚：上一页
                goPrevPage();
            }
        }
    });
    // 双击定位到源码
    let isDoubleClick = false;
    
    container.addEventListener("dblclick", async (e) => {
        // 双击事件
        e.preventDefault();
        e.stopPropagation();
        isDoubleClick = true;
        // 取消拖拽
        isDragging = false;
        container.classList.remove("dragging");
        await handlePdfTextClick(e);
    });
    
    container.addEventListener("mousedown", (e) => {
        // 如果是双击，不启动拖拽
        if (isDoubleClick) {
            isDoubleClick = false;
            return;
        }
        // 普通点击：拖拽
        isDragging = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
        container.classList.add("dragging");
    });

    container.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        canvasWrapper.value.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    container.addEventListener("mouseup", () => {
        isDragging = false;
        container.classList.remove("dragging");
    });
    
    pdfEventListenersAttached = true;
    logger.debug('PDF事件监听器绑定完成');
}

async function initPdfJs() {
    const resourcePath = await ipcRenderer.invoke('resources-path')
    pdfjsLib.GlobalWorkerOptions.workerSrc = resourcePath + "/pdf.worker.min.mjs";
    
    if(currentPath.value && currentPath.value.toLowerCase().endsWith(".tex")){
        const pdfPath = currentPath.value.toLowerCase().replace('.tex','.pdf');
        pdfUrl.value = encodeFilePathToUrl(pdfPath);
    }else{
        pdfUrl.value="";
    }
    
    pdfInitialized = true;
    
    // 等待容器准备好后再绑定事件和加载PDF
    await nextTick();
    attachPdfEventListeners();
    if (pdfUrl.value) {
        loadPdf(pdfUrl.value);
    }
}
const pdfZoomIn = async () => {
    currentScale = Math.min(Math.max(currentScale + 0.1, 0.2), 5); // 限制缩放范围
    await renderPage(currentPdfPage.value, currentScale);
}
const pdfZoomOut = async () => {
    currentScale = Math.min(Math.max(currentScale - 0.1, 0.2), 5); // 限制缩放范围
    await renderPage(currentPdfPage.value, currentScale);
}
const pdfZoomReset = async () => {
    currentScale = 1
    await renderPage(currentPdfPage.value, currentScale);
}
let pdfDoc;        // pdfjs document
const currentPdfPage = ref(1);
const totalPdfPages = ref(0);
const inputPdfPage = ref(1);

// PDF文本到Monaco源码的映射系统
// 结构：Map<pageNumber, Array<{pdfRange: {x, y, width, height}, monacoPosition: {line, column}}>>
const pdfToSourceMap = new Map();
// 反向映射：Monaco位置到PDF位置
// 结构：Map<`${line}-${column}`, {pageNumber, pdfRange}>
const sourceToPdfMap = new Map();
let isMappingInProgress = false;

// 文字更新时自动重新建立映射（debounce 3秒）
const rebuildMappingDebounced = debounce(() => {
    if (!isActive.value) return;
    if (!pdfDoc) return;
    logger.debug('文字更新，准备重新建立PDF映射');
    buildPdfToSourceMapping();
}, 3000);

watch(
    () => currentTex.value,
    (incoming) => {
        //logger.debug("LaTeXEditor currentTex changed", { incoming })
        const nextValue = incoming ?? '';
        textBuffer = nextValue;
        if (!isActive.value) return;
        if (!editor.value) return;
        
        // 触发重新建立映射
        rebuildMappingDebounced();
    },
);

watch(
    () => props.active,
    (active) => {
        //logger.debug("LaTeXEditor props.active changed", { active })
        if (!editor.value) return;
        if (!active) {
            textBuffer = currentTex.value ?? '';
            return;
        }
        if (pdfUrl.value && pdfInitialized) {
            // 确保事件监听器已绑定
            nextTick(() => {
                attachPdfEventListeners();
                if (pdfContainer.value) {
                    loadPdf(pdfUrl.value);
                }
            });
        }
    },
    { immediate: true },
);

// 监听 PDF 容器和 URL 的变化，确保事件监听器在容器准备好时绑定
watch(
    [() => pdfContainer.value, () => pdfUrl.value],
    ([container, url]) => {
        if (container && url && pdfInitialized && !pdfEventListenersAttached) {
            // 容器已准备好，URL 存在，且事件监听器未绑定
            nextTick(() => {
                attachPdfEventListeners();
            });
        }
    },
    { immediate: true },
);

watch(
    currentPath,
    (path) => {
        //logger.debug("LaTeXEditor currentPath changed", { path })
        if (!path || !path.toLowerCase().endsWith('.tex')) {
            pdfUrl.value = '';
            return;
        }
        const pdfPath = path.toLowerCase().replace('.tex', '.pdf');
        const nextUrl = encodeFilePathToUrl(pdfPath);
        pdfUrl.value = nextUrl;
        if (!isActive.value) return;
        if (pdfInitialized && pdfContainer.value) {
            loadPdf(nextUrl);
        }
    },
);

watch(
    () => showPdfPanel.value,
    (visible) => {
        //logger.debug("LaTeXEditor showPdfPanel changed", { visible })
        nextTick(() => {
            if (visible) {
                // 当PDF面板显示时，确保事件监听器已绑定
                attachPdfEventListeners();
                ensurePdfWithinBounds();
            } else if (pdfResizableRef.value?.setSidebarSize) {
                pdfResizableRef.value.setSidebarSize(LATEX_LAYOUT.pdf.minWidth);
            }
        });
    },
);

function goPrevPage() {
    if (currentPdfPage.value > 1) {
        currentPdfPage.value--;
        inputPdfPage.value = currentPdfPage.value;
        renderPage(currentPdfPage.value, currentScale);
    }
}

function goNextPage() {
    if (currentPdfPage.value < totalPdfPages.value) {
        currentPdfPage.value++;
        inputPdfPage.value = currentPdfPage.value;
        renderPage(currentPdfPage.value, currentScale);
    }
}

function jumpToPage() {
    let page = Math.min(Math.max(inputPdfPage.value, 1), totalPdfPages.value);
    currentPdfPage.value = page;
    renderPage(page, currentScale);
}

// 渲染 PDF 页面
async function renderPage(pageNumber, scale) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pageNumber);

  // 根据缩放计算 viewport
  const viewport = page.getViewport({ scale });
  currentScale = scale;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    alpha: false, // 禁用透明度以提高性能
    desynchronized: true, // 允许异步渲染
  });

  // 高清渲染：使用更高的DPI倍数以提高清晰度
  const ratio = (window.devicePixelRatio || 1) * 2; // 使用2倍DPI以提高清晰度
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);

  // 保持样式为逻辑像素，避免 CSS 再次缩放导致模糊
  canvas.style.width = Math.floor(viewport.width) + "px";
  canvas.style.height = Math.floor(viewport.height) + "px";

  // 设置高质量图像渲染
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  // 缩放 context，使得 1 CSS 像素 = ratio 个物理像素
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  // 创建白色背景canvas（用于避免闪屏）
  let backgroundCanvas = canvasWrapper.value.querySelector('.pdf-background-canvas');
  if (!backgroundCanvas) {
    backgroundCanvas = document.createElement("canvas");
    backgroundCanvas.className = 'pdf-background-canvas';
    backgroundCanvas.style.position = 'absolute';
    backgroundCanvas.style.top = '0';
    backgroundCanvas.style.left = '0';
    backgroundCanvas.style.zIndex = '0';
    backgroundCanvas.style.backgroundColor = '#ffffff';
    canvasWrapper.value.appendChild(backgroundCanvas);
  }
  
  // 更新背景canvas尺寸和位置（与PDF canvas保持一致）
  backgroundCanvas.width = Math.floor(viewport.width * ratio);
  backgroundCanvas.height = Math.floor(viewport.height * ratio);
  backgroundCanvas.style.width = Math.floor(viewport.width) + "px";
  backgroundCanvas.style.height = Math.floor(viewport.height) + "px";
  
  // 填充白色背景
  const bgContext = backgroundCanvas.getContext("2d");
  bgContext.fillStyle = '#ffffff';
  bgContext.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  
  // 清空旧 canvas（保留背景canvas）
  const existingCanvas = canvasWrapper.value.querySelector('canvas:not(.pdf-background-canvas)');
  if (existingCanvas) {
    existingCanvas.remove();
  }
  
  // 设置PDF canvas的z-index，确保在背景之上
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.zIndex = '1';
  canvas.style.backgroundColor = '#ffffff';
  canvasWrapper.value.appendChild(canvas);

  // 渲染 PDF，使用高质量渲染选项
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    // 启用文本层渲染以提高文本清晰度
    enableWebGL: false, // 使用2D渲染以确保兼容性
  };
  await page.render(renderContext).promise;
}


// 处理PDF文本双击定位
async function handlePdfTextClick(event) {
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId) || editors[0];
    
    if (!pdfDoc || !monacoEditor) {
        logger.warn('PDF双击定位失败: pdfDoc或editor不存在');
        return;
    }
    
    try {
        const page = await pdfDoc.getPage(currentPdfPage.value);
        const viewport = page.getViewport({ scale: currentScale });
        
        // 获取点击位置相对于canvas的坐标
        const canvas = canvasWrapper.value?.querySelector('canvas:not(.pdf-background-canvas)');
        if (!canvas) {
            logger.warn('PDF双击定位失败: canvas不存在');
            return;
        }
        
        const containerRect = pdfContainer.value?.getBoundingClientRect();
        if (!containerRect) {
            logger.warn('PDF双击定位失败: containerRect不存在');
            return;
        }
        
        // 获取canvas的样式尺寸（逻辑像素）
        const canvasStyleWidth = parseFloat(canvas.style.width) || viewport.width;
        const canvasStyleHeight = parseFloat(canvas.style.height) || viewport.height;
        
        // 获取canvas在容器中的位置（考虑偏移）
        const canvasWrapperRect = canvasWrapper.value?.getBoundingClientRect();
        if (!canvasWrapperRect) return;
        
        // 计算点击位置相对于canvas wrapper的坐标
        const wrapperX = event.clientX - canvasWrapperRect.left;
        const wrapperY = event.clientY - canvasWrapperRect.top;
        
        // 考虑canvas的transform偏移（拖拽产生的偏移）
        const canvasOffsetX = offsetX || 0;
        const canvasOffsetY = offsetY || 0;
        
        // 计算在canvas逻辑坐标中的位置（考虑偏移）
        const canvasX = wrapperX - canvasOffsetX;
        const canvasY = wrapperY - canvasOffsetY;
        
        // 转换为PDF相对坐标（相对于页面尺寸的比例，0-1之间）
        // 这样不受缩放影响
        // PDF坐标系统：左下角为原点，Y轴向上
        // Canvas坐标系统：左上角为原点，Y轴向下
        const relativeX = canvasX / canvasStyleWidth;
        const relativeY = 1 - (canvasY / canvasStyleHeight); // 转换为从下往上的相对坐标
        
        // 优先使用映射系统定位
        const pageMappings = pdfToSourceMap.get(currentPdfPage.value);
        
        if (pageMappings && pageMappings.length > 0) {
            // 找到点击位置最近的映射项
            let closestMapping = null;
            let minDistance = Infinity;
            
            for (const mapping of pageMappings) {
                const range = mapping.pdfRange; // range是相对坐标 {x, y, width, height} 都是0-1之间的比例
                // 检查点击是否在范围内（使用相对坐标，容差也是相对的）
                const tolerance = 0.01; // 1%的容差
                const inXRange = relativeX >= range.x - tolerance && relativeX <= range.x + range.width + tolerance;
                const inYRange = relativeY >= range.y - tolerance && relativeY <= range.y + range.height + tolerance;
                
                if (inXRange && inYRange) {
                    // 计算到文本中心的距离（使用相对坐标）
                    const centerX = range.x + range.width / 2;
                    const centerY = range.y + range.height / 2;
                    const distance = Math.sqrt(
                        Math.pow(relativeX - centerX, 2) + Math.pow(relativeY - centerY, 2)
                    );
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestMapping = mapping;
                    }
                }
            }
            
            if (closestMapping) {
                // 使用映射直接定位
                const position = closestMapping.monacoPosition;
                
                try {
                    const monacoPosition = new monaco.Position(position.line, position.column);
                    monacoEditor.setPosition(monacoPosition);
                    monacoEditor.revealLineInCenter(position.line);
                    return;
                } catch (error) {
                    logger.error('设置Monaco位置失败', error);
                    throw error;
                }
            }
        }
        
        // 如果映射系统不可用，回退到文本搜索方式
        const textContent = await page.getTextContent();
        const textItems = textContent.items;
        
        // 找到点击位置附近的文本
        let closestItem = null;
        let minDistance = Infinity;
        
        // 获取标准viewport（scale=1）用于坐标转换
        const standardViewport = page.getViewport({ scale: 1 });
        
        for (const item of textItems) {
            if (!item.transform || !item.str || !item.str.trim()) continue;
            
            // 获取文本项的绝对坐标
            const itemX = item.transform[4];
            const itemY = item.transform[5];
            const itemHeight = item.height || 12;
            const itemWidth = item.width || 0;
            
            // 转换为相对坐标（相对于标准页面尺寸）
            const itemRelativeX = itemX / standardViewport.width;
            const itemRelativeY = itemY / standardViewport.height;
            const itemRelativeWidth = itemWidth / standardViewport.width;
            const itemRelativeHeight = itemHeight / standardViewport.height;
            
            // 使用相对坐标进行比较（容差也是相对的）
            const tolerance = 0.01; // 1%的容差
            const inXRange = relativeX >= itemRelativeX - tolerance && relativeX <= itemRelativeX + itemRelativeWidth + tolerance;
            const inYRange = relativeY >= itemRelativeY - tolerance && relativeY <= itemRelativeY + itemRelativeHeight + tolerance;
            
            if (inXRange && inYRange) {
                const centerX = itemRelativeX + itemRelativeWidth / 2;
                const centerY = itemRelativeY + itemRelativeHeight / 2;
                const distance = Math.sqrt(
                    Math.pow(relativeX - centerX, 2) + Math.pow(relativeY - centerY, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestItem = item;
                }
            }
        }
        
        if (closestItem && closestItem.str && textEditorAdapter.value) {
            // 使用textEditorAdapter的locateText方法
            const searchText = closestItem.str.trim();
            
            try {
                const range = textEditorAdapter.value.locateText(searchText, {
                    matchCase: false,
                    wholeWord: false,
                    useRegex: false,
                });
                
                if (range) {
                    const monacoPosition = new monaco.Position(range.start.line, range.start.column);
                    monacoEditor.setPosition(monacoPosition);
                    monacoEditor.revealLineInCenter(range.start.line);
                } else {
                    eventBus.emit("show-info", t("latexEditor.notification.textNotFound", { text: searchText.substring(0, 20) }));
                }
            } catch (error) {
                logger.error('locateText调用失败', error);
                throw error;
            }
        } else {
            eventBus.emit("show-info", t("latexEditor.notification.clickToLocate"));
        }
    } catch (error) {
        logger.error('PDF文本定位失败', error);
    }
}

// 建立PDF文本到源码的映射（异步）
async function buildPdfToSourceMapping() {
    logger.debug('=== 开始建立PDF到源码映射 ===');
    
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId) || editors[0];
    
    if (!pdfDoc) {
        logger.warn('建立映射失败: pdfDoc不存在');
        return;
    }
    if (!monacoEditor) {
        logger.warn('建立映射失败: editor不存在', { 
            editorId,
            totalEditors: editors.length
        });
        return;
    }
    if (!textEditorAdapter.value) {
        logger.warn('建立映射失败: textEditorAdapter不存在');
        return;
    }
    if (isMappingInProgress) {
        logger.debug('映射正在进行中，跳过');
        return;
    }
    
    isMappingInProgress = true;
    pdfToSourceMap.clear();
    sourceToPdfMap.clear();
    logger.debug('清空旧映射');
    
    try {
        const totalPages = pdfDoc.numPages;
        logger.debug('开始建立PDF到源码映射', { totalPages });
        
        let totalMapped = 0;
        let totalFailed = 0;
        
        // 异步处理每一页，避免阻塞
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            try {
                logger.debug(`处理页面 ${pageNum}/${totalPages}`);
                const page = await pdfDoc.getPage(pageNum);
                const textContent = await page.getTextContent();
                const textItems = textContent.items;
                logger.debug(`页面 ${pageNum} 文本项数量`, { textItemsCount: textItems.length });
                
                // 获取标准viewport（scale=1）用于坐标转换
                const standardViewport = page.getViewport({ scale: 1 });
                
                const pageMappings = [];
                let pageMapped = 0;
                let pageFailed = 0;
                
                // 批量处理文本项，避免一次性处理太多
                const BATCH_SIZE = 50;
                for (let i = 0; i < textItems.length; i += BATCH_SIZE) {
                    const batch = textItems.slice(i, i + BATCH_SIZE);
                    
                    for (const item of batch) {
                        if (!item.transform || !item.str || !item.str.trim()) continue;
                        
                        // 获取文本项的绝对坐标
                        const itemX = item.transform[4];
                        const itemY = item.transform[5];
                        const itemHeight = item.height || 12;
                        const itemWidth = item.width || 0;
                        
                        // 转换为相对坐标（相对于标准页面尺寸，0-1之间）
                        // 这样不受缩放影响
                        const relativeX = itemX / standardViewport.width;
                        const relativeY = itemY / standardViewport.height;
                        const relativeWidth = itemWidth / standardViewport.width;
                        const relativeHeight = itemHeight / standardViewport.height;
                        
                        // 清理文本，用于查找
                        const cleanText = item.str.trim();
                        if (cleanText.length < 2) continue;
                        
                        // 使用textEditorAdapter的locateText方法查找位置
                        try {
                            const range = textEditorAdapter.value.locateText(cleanText, {
                                matchCase: false,
                                wholeWord: false,
                                useRegex: false,
                            });
                            
                            if (range) {
                                const mapping = {
                                    pdfRange: {
                                        x: relativeX,
                                        y: relativeY,
                                        width: relativeWidth,
                                        height: relativeHeight,
                                    },
                                    monacoPosition: {
                                        line: range.start.line,
                                        column: range.start.column,
                                    },
                                    text: cleanText,
                                };
                                pageMappings.push(mapping);
                                
                                // 建立反向映射
                                const key = `${range.start.line}-${range.start.column}`;
                                sourceToPdfMap.set(key, {
                                    pageNumber: pageNum,
                                    pdfRange: mapping.pdfRange,
                                });
                                
                                pageMapped++;
                                totalMapped++;
                            } else {
                                pageFailed++;
                                totalFailed++;
                            }
                        } catch (error) {
                            // 单个文本项映射失败，跳过继续
                            pageFailed++;
                            totalFailed++;
                            continue;
                        }
                    }
                    
                    // 每处理一批后，让出控制权
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                
                pdfToSourceMap.set(pageNum, pageMappings);
            } catch (error) {
                logger.warn(`页面 ${pageNum} 映射失败`, error);
                // 继续处理下一页
                continue;
            }
        }
        
        logger.debug('PDF到源码映射建立完成', { 
            totalPages: pdfToSourceMap.size,
            totalMapped,
            totalFailed
        });
    } catch (error) {
        logger.error('建立PDF到源码映射失败', error);
    } finally {
        isMappingInProgress = false;
    }
}

// 在加载 PDF 后初始化
async function loadPdf(url, preservePage = false) {
    if (!url || url.trim() === '') {
        // 如果 URL 为空，不加载 PDF
        return;
    }
    
    // 确保事件监听器已绑定
    await nextTick();
    attachPdfEventListeners();
    
    // 保存当前页码（如果要求保留）
    const savedPage = preservePage ? currentPdfPage.value : 1;
    
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        //logger.log(pdfDoc.value)
        totalPdfPages.value = pdfDoc.numPages;
        
        // 恢复或设置页码
        const targetPage = preservePage ? Math.min(Math.max(savedPage, 1), pdfDoc.numPages) : 1;
        currentPdfPage.value = targetPage;
        inputPdfPage.value = targetPage;
        renderPage(targetPage, currentScale);
        
        // 异步建立映射关系
        buildPdfToSourceMapping();
    } catch (error) {
        // 捕获 PDF 加载错误，避免未处理的 rejection
        logger.warn('加载 PDF 失败', { 
            url, 
            error: error.message || error,
            errorName: error.name,
            status: error.status
        });
        
        // 如果是文件不存在或无法访问的错误，显示友好的提示
        if (error.name === 'ResponseException' || error.status === 0) {
            eventBus.emit('show-warning', 
                t('latexEditor.notification.pdfLoadFailed', { 
                    reason: t('latexEditor.notification.pdfFileNotFoundOrInaccessible')
                })
            );
        } else {
            eventBus.emit('show-error', 
                t('latexEditor.notification.pdfLoadFailed', { 
                    reason: error.message || String(error)
                })
            );
        }
        
        // 清空 PDF URL，避免重复尝试加载
        pdfUrl.value = '';
    }
}
// 切换 PDF 显示
function togglePdf() {
    showPdfPanel.value = !showPdfPanel.value
}

const compile = async () => {
    eventBus.emit('clear-console', { key: 'latex' })
    eventBus.emit('cancel-suggestion')
    if(!currentPath.value || !currentPath.value.toLowerCase().endsWith(".tex")){
        eventBus.emit("show-warning",t("latexEditor.notification.pleaseSaveFirst"));
        eventBus.emit('save');
        return;
    }
    triggerSuggestion.value = false;//开始编译的时候就不能修改了
    editor.value.updateOptions({
        readOnly: true
    });
    const compileResult = await ipcRenderer.invoke("compile-tex",{
        tex:currentTex.value,
        texPath:currentPath.value??'',
        outputDir:"",//todo:用户后续可以设置保存在哪
        customPdfFileName:"",//todo
    })
    editor.value.updateOptions({
        readOnly: false
    });
    //logger.log(compileResult)
    if(compileResult.status==='success'){
        eventBus.emit("show-success",t("latexEditor.notification.compileSuccess"));
        pdfUrl.value = encodeFilePathToUrl(compileResult.pdfPath);
        
        // 重新加载PDF并建立映射
        await loadPdf(pdfUrl.value);
    }
    else{
        eventBus.emit("show-error",t("latexEditor.notification.compileFailed",{ code:compileResult.code }));
    }
    //logger.log("编译 LaTeX");
};

const toggleConsole = async () => {
    showConsole.value = !showConsole.value;
};




// 打开右键菜单
const openContextMenu = (event) => {
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuVisible.value = true;
};

// 打开PDF右键菜单
const openPdfContextMenu = (event) => {
    event.preventDefault();
    pdfMenuX.value = event.clientX;
    pdfMenuY.value = event.clientY;
    pdfContextMenuVisible.value = true;
};

// PDF右键菜单点击处理
const handlePdfMenuClick = async (item) => {
    switch (item) {
        case 'refresh':
            if (pdfUrl.value) {
                // 刷新时保留当前页码
                await loadPdf(pdfUrl.value, true);
                eventBus.emit("show-success", t("latexEditor.notification.refreshSuccess"));
            }
            break;
        case 'locate-to-code':
            await locateToCodeFromPdf();
            break;
        case 'zoom-in':
            await pdfZoomIn();
            break;
        case 'zoom-out':
            await pdfZoomOut();
            break;
        case 'zoom-reset':
            await pdfZoomReset();
            break;
        case 'open-directory':
            await openPdfDirectory();
            break;
        case 'save':
            await savePdf();
            break;
    }
    pdfContextMenuVisible.value = false;
};

// 从PDF定位到代码（双击的另一种方式）
async function locateToCodeFromPdf() {
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId) || editors[0];
    
    // 获取PDF中心位置或当前视图中心位置
    if (!pdfDoc || !monacoEditor) {
        eventBus.emit("show-info", t("latexEditor.notification.editorNotAvailable"));
        return;
    }
    
    try {
        const page = await pdfDoc.getPage(currentPdfPage.value);
        const viewport = page.getViewport({ scale: currentScale });
        
        // 获取PDF容器中心位置
        const containerRect = pdfContainer.value?.getBoundingClientRect();
        if (!containerRect) return;
        
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;
        
        // 转换为PDF相对坐标
        const canvas = canvasWrapper.value?.querySelector('canvas');
        if (!canvas) return;
        
        const canvasStyleWidth = parseFloat(canvas.style.width) || viewport.width;
        const canvasStyleHeight = parseFloat(canvas.style.height) || viewport.height;
        
        const canvasWrapperRect = canvasWrapper.value?.getBoundingClientRect();
        if (!canvasWrapperRect) return;
        
        const wrapperX = centerX;
        const wrapperY = centerY;
        const canvasX = wrapperX - (offsetX || 0);
        const canvasY = wrapperY - (offsetY || 0);
        
        const relativeX = canvasX / canvasStyleWidth;
        const relativeY = 1 - (canvasY / canvasStyleHeight);
        
        // 查找映射
        const pageMappings = pdfToSourceMap.get(currentPdfPage.value);
        if (pageMappings && pageMappings.length > 0) {
            let closestMapping = null;
            let minDistance = Infinity;
            
            for (const mapping of pageMappings) {
                const range = mapping.pdfRange;
                const tolerance = 0.05;
                const inXRange = relativeX >= range.x - tolerance && relativeX <= range.x + range.width + tolerance;
                const inYRange = relativeY >= range.y - tolerance && relativeY <= range.y + range.height + tolerance;
                
                if (inXRange && inYRange) {
                    const centerX = range.x + range.width / 2;
                    const centerY = range.y + range.height / 2;
                    const distance = Math.sqrt(
                        Math.pow(relativeX - centerX, 2) + Math.pow(relativeY - centerY, 2)
                    );
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestMapping = mapping;
                    }
                }
            }
            
            if (closestMapping) {
                const position = closestMapping.monacoPosition;
                const monacoPosition = new monaco.Position(position.line, position.column);
                monacoEditor.setPosition(monacoPosition);
                monacoEditor.revealLineInCenter(position.line);
            } else {
                eventBus.emit("show-info", t("latexEditor.notification.noCodeMapping"));
            }
        } else {
            eventBus.emit("show-info", t("latexEditor.notification.noCodeMapping"));
        }
    } catch (error) {
        logger.error('从PDF定位到代码失败', error);
        eventBus.emit("show-error", t("latexEditor.notification.locateToCodeFailed"));
    }
}

// 打开PDF所在目录
async function openPdfDirectory() {
    if (!pdfUrl.value || pdfUrl.value === 'file:///') {
        eventBus.emit("show-warning", t("latexEditor.notification.pdfNotAvailable"));
        return;
    }
    
    try {
        // 从file:///路径提取实际路径
        const pdfPath = pdfUrl.value.replace('file:///', '');
        
        // 使用IPC调用主进程获取目录路径
        const dirPath = await ipcRenderer.invoke('get-directory-path', pdfPath);
        
        if (dirPath) {
            // 使用shell-open事件打开目录
            ipcRenderer.send('shell-open', dirPath);
            eventBus.emit("show-success", t("latexEditor.notification.directoryOpened"));
        } else {
            eventBus.emit("show-error", t("latexEditor.notification.openDirectoryFailed"));
        }
    } catch (error) {
        logger.error('打开PDF目录失败', error);
        eventBus.emit("show-error", t("latexEditor.notification.openDirectoryFailed"));
    }
}

// 保存PDF（复制并保存对话框）
async function savePdf() {
    if (!pdfUrl.value || pdfUrl.value === 'file:///') {
        eventBus.emit("show-warning", t("latexEditor.notification.pdfNotAvailable"));
        return;
    }
    
    try {
        // 从file:///路径提取实际路径
        const pdfPath = pdfUrl.value.replace('file:///', '');
        
        // 使用IPC调用主进程保存PDF
        const result = await ipcRenderer.invoke('save-pdf-dialog', {
            sourcePath: pdfPath,
            defaultName: pdfPath.split(/[\\/]/).pop() || 'document.pdf'
        });
        
        if (result && result.success && result.filePath) {
            eventBus.emit("show-success", t("latexEditor.notification.pdfSaved", { path: result.filePath }));
        } else if (result && result.canceled) {
            // 用户取消了保存对话框，不需要提示
        } else {
            eventBus.emit("show-error", t("latexEditor.notification.savePdfFailed"));
        }
    } catch (error) {
        logger.error('保存PDF失败', error);
        eventBus.emit("show-error", t("latexEditor.notification.savePdfFailed"));
    }
}

// 插入文本到当前光标位置（支持多行）
const insertText = (text) => {
  textEditorAdapter.value?.insertText(text);
};


// 菜单项点击事件处理
const handleMenuClick = async (item) => {
    switch (item) {
        case 'ai-assistant':
            let text = currentMarkdown.value;
            const bypassCodeBlock = await getSetting('bypassCodeBlock');
            if (bypassCodeBlock) {
                text = text.replace(/```[\s\S]*?```/g, '');
            }
            let messages = []
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
            addDialogEntry(newDialog, true)
            prependAiChatDialog(newDialog);
            sendBroadcast('ai-chat', 'ai-chat-dialogs-updated', null);
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
        case 'selectAll':
            textEditorAdapter.value?.selectAll();
            break;
        case 'openAutoCompletion':
            await setSetting("autoCompletion", true);
            break;
        case 'closeAutoCompletion':
            await setSetting("autoCompletion", false);
            break;
        case 'openKnowledgeBase':
            await setSetting("enableKnowledgeBase", true);
            break;
        case 'closeKnowledgeBase':
            await setSetting("enableKnowledgeBase", false);
            break;
        case 'locate-to-pdf':
            await locateToPdf();
            break;
        case 'section-optimizer':
            await openSectionOptimizerFromContext();
            break;

    }
    await refreshContextMenu();
    contextMenuVisible.value = false;
};

// 定位到PDF位置（从代码行定位到PDF）
async function locateToPdf() {
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId) || editors[0];
    
    if (!pdfDoc || !monacoEditor) {
        eventBus.emit("show-info", t("latexEditor.notification.pdfNotAvailable"));
        return;
    }
    
    try {
        // 获取当前光标位置
        const position = monacoEditor.getPosition();
        if (!position) {
            eventBus.emit("show-info", t("latexEditor.notification.noCursorPosition"));
            return;
        }
        
        const key = `${position.lineNumber}-${position.column}`;
        let pdfLocation = sourceToPdfMap.get(key);
        
        // 如果精确匹配不存在，尝试查找同一行的映射
        if (!pdfLocation) {
            // 查找同一行的第一个映射
            for (const [mapKey, mapValue] of sourceToPdfMap.entries()) {
                const [line] = mapKey.split('-').map(Number);
                if (line === position.lineNumber) {
                    pdfLocation = mapValue;
                    break;
                }
            }
        }
        
        if (pdfLocation) {
            // 跳转到对应页面
            currentPdfPage.value = pdfLocation.pageNumber;
            inputPdfPage.value = pdfLocation.pageNumber;
            await renderPage(pdfLocation.pageNumber, currentScale);
            
            // 滚动到对应位置（需要将相对坐标转换为实际坐标）
            const page = await pdfDoc.getPage(pdfLocation.pageNumber);
            const viewport = page.getViewport({ scale: currentScale });
            
            // 计算目标位置（相对坐标转换为实际坐标）
            const targetX = pdfLocation.pdfRange.x * viewport.width;
            const targetY = pdfLocation.pdfRange.y * viewport.height;
            
            // 调整canvas偏移，使目标位置居中或可见
            const canvas = canvasWrapper.value?.querySelector('canvas');
            if (canvas) {
                const canvasStyleWidth = parseFloat(canvas.style.width) || viewport.width;
                const canvasStyleHeight = parseFloat(canvas.style.height) || viewport.height;
                
                // 计算需要偏移的距离（使目标位置在视口中心）
                const containerRect = pdfContainer.value?.getBoundingClientRect();
                if (containerRect) {
                    const centerX = containerRect.width / 2;
                    const centerY = containerRect.height / 2;
                    
                    // 计算目标位置在canvas中的坐标
                    const targetCanvasX = (targetX / viewport.width) * canvasStyleWidth;
                    const targetCanvasY = (targetY / viewport.height) * canvasStyleHeight;
                    
                    // 计算偏移量
                    offsetX = centerX - targetCanvasX;
                    offsetY = centerY - targetCanvasY;
                    
                    // 应用偏移
                    canvasWrapper.value.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                }
            }
            
        } else {
            eventBus.emit("show-info", t("latexEditor.notification.noPdfMapping"));
        }
    } catch (error) {
        logger.error('定位到PDF位置失败', error);
        eventBus.emit("show-error", t("latexEditor.notification.locateToPdfFailed"));
    }
}

// 更新编辑器内容

// 刷新文章内容
eventBus.on('refresh', () => {
    // 1. 先清理旧的
    // if (editor.value) {           // editor.value 是 Monaco 实例
    //     try {
    //         const oldModel = editor.value.getModel(); // 获取模型
    //         editor.value.dispose();                  // 销毁 Monaco 实例
    //         if (oldModel) oldModel.dispose();       // 销毁模型
    //     } catch (e) {
    //         logger.warn("释放 Monaco 实例失败：", e);
    //     }
    //     editor.value = null;
    // }
    resetEditor();

});
const resetEditor = () => {
    disposeEditor();
    editorKey.value = Date.now(); // Vue 会销毁原 DOM，创建新 DOM
    nextTick(() => initEditor());
};

eventBus.on('search-replace', (payload) => {
    //logger.log('search-replace');
    searchReplaceDialogVisible.value = true;
    if (payload && payload.expandReplace) {
        nextTick(() => eventBus.emit('search-replace-expand'));
    }
});

watch(isActive, (active) => {
    if (!active) {
        searchReplaceDialogVisible.value = false;
    }
});




const consoleHeight = ref(200);
let isResizingConsole = false;

function startResizeConsole(e) {
  if (!showConsole.value) return;
  isResizingConsole = true;
  document.addEventListener('mousemove', onResizingConsole);
  document.addEventListener('mouseup', stopResizeConsole);
}

function onResizingConsole(e) {
  if (!isResizingConsole) return;
  const container = document.querySelector('.editor-console-container');
  if (!container) return;
  const containerRect = container.getBoundingClientRect();

  // 底部向上拖拽调整高度
  const newHeight = containerRect.bottom - e.clientY;
  consoleHeight.value = Math.min(Math.max(newHeight, 100), containerRect.height - 50);
}

function stopResizeConsole() {
  isResizingConsole = false;
  document.removeEventListener('mousemove', onResizingConsole);
  document.removeEventListener('mouseup', stopResizeConsole);
}

const refreshContextMenu = async () => {
    articleContextMenuItems.value = await getArticleContextMenuItems({ isLatexEditor: true });
}

// 注册 LaTeX
monaco.languages.register({ id: 'latex' });
monaco.languages.setMonarchTokensProvider('latex', {
    defaultToken: '',
    tokenPostfix: '.tex',

    // 这里是关键，必须有 tokenizer 对象
    tokenizer: {
        root: [
            [/\\[a-zA-Z]+/, 'keyword'],      // LaTeX 命令
            [/%.*$/, 'comment'],             // 注释
            [/\$[^$]*\$/, 'string'],         // 行内公式
            [/{|}/, 'delimiter'],            // 花括号
            [/\[|\]/, 'delimiter'],          // 中括号
            [/[^\s]+/, '']                   // 其他文本
        ]
    }
});

let contentChangeListener = null;
//     if (editor.value) {
//         //logger.debug("LaTeXEditor disposeEditor")
//         try {
//             // 1. 移除监听
//             if (contentChangeListener) {
//                 contentChangeListener.dispose();
//                 contentChangeListener = null;
//                 //logger.log("移除监听成功")
//             }

//             // 2. 保存引用的 model
//             const oldModel = editor.value.getModel();

//             // 3. 释放 Monaco 实例（必须先释放编辑器，再释放模型）
//             editor.value.dispose();
//             editor.value = null;
//             //logger.log("释放Monaco成功")
            
//             // 4. 释放模型（如果编辑器已经释放，模型可能已经被自动释放，但为了安全还是手动释放）
//             if (oldModel) {
//                 try {
//                     oldModel.dispose();
//                 } catch (e) {
//                     // 模型可能已经被自动释放，忽略错误
//                 }
//             }
//             //logger.log("释放模型成功")
            
//             // 5. 清空 textBuffer
//             textBuffer = "";
//         } catch (e) {
//             logger.warn("安全释放 Monaco 实例失败:", e);
//         }
//     }
//     textEditorAdapter.value = null;
// };
let editorId = null;
const initEditor = () => {
    window.MonacoEnvironment = {
        getWorker: function (moduleId, label) {
            let workerPath = '';

            switch (label) {
                case 'json':
                    workerPath = 'http://localhost:52521/monaco/language/json/json.worker.js';
                    break;
                case 'css':
                case 'scss':
                case 'less':
                    workerPath = 'http://localhost:52521/monaco/language/css/css.worker.js';
                    break;
                case 'html':
                case 'handlebars':
                case 'razor':
                    workerPath = 'http://localhost:52521/monaco/language/html/html.worker.js';
                    break;
                case 'typescript':
                case 'javascript':
                    workerPath = 'http://localhost:52521/monaco/language/typescript/ts.worker.js';
                    break;
                default:
                    workerPath = 'http://localhost:52521/monaco/editor/editor.worker.js';
            }

            // ESM worker: 用 import() 动态导入
            const blob = new Blob(
                [`import("${workerPath}");`],
                { type: 'application/javascript' }
            );

            return new Worker(URL.createObjectURL(blob), { type: 'module' });
        }
    };

    //logger.debug("LaTeXEditor initEditor")
    editor.value = monaco.editor.create(editorEl.value, {
        value: currentTex.value,
        language: "latex", // 语言模式
        theme: themeState.currentTheme.type === 'dark' ? "vs-dark" : "vs",  // 主题 (vs, vs-dark, hc-black)
        mouseWheelZoom: true,
        automaticLayout: true, // 自动适应容器大小
        fontSize: 14,
        wordWrap: "on",  // 自动换行
        wordWrapMinified: true, // 对于 minified 文件也自动换行
        wrappingIndent: "same", // 缩进方式，"none" | "same" | "indent" | "deepIndent"
        lineNumbers: enableRowNumber ? 'on' : 'off',
        minimap: { enabled: enableMinimap },
        contextmenu: false
    })
    editorId = editor.value.getId();
    textEditorAdapter.value = createMonacoAdapter(editorId);
    //editor.value.onKeyDown((e)=>logger.log(e));
    // 增量监听
    contentChangeListener = editor.value.onDidChangeModelContent((event) => {
        // 先保存原始文本
        let oldText = textBuffer;

    // 使用原始旧文本作为基底
    let newText = textBuffer;

    // 按 **从后到前** 的顺序应用 changes，避免偏移被修改
    for (let i = event.changes.length - 1; i >= 0; i--) {
      const change = event.changes[i];
      const start = change.rangeOffset;
      const end = start + change.rangeLength;
      newText = newText.slice(0, start) + change.text + newText.slice(end);
    }

    // 更新缓存（完整文本）
    textBuffer = newText;

        
        // 按需同步到 Vue 响应式变量，比如防抖或定时同步

        //BUG:这里同步会卡死
        debounceSync();
        
    });
    const debounceSync = debounce(() => {
        triggerSuggestion.value = false;
        if(currentTex.value!==textBuffer){
            currentTex.value = textBuffer;
            // 同步大纲树
            syncOutlineFromTex();
        }
    }, 100);
    eventBus.emit("monaco-ready")
}

onMounted(async () => {
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', updateSearchMenuPosition);
        }
        //logger.debug("LaTeXEditor onMounted")
        await waitForService('express');
        await refreshContextMenu();
        initEditor();

        eventBus.on('sync-editor-theme', () => {
            const isDark = themeState.currentTheme.type === 'dark';
            const themeName = isDark ? 'vs-dark' : 'vs';
            const toMonacoColor = (color) => color.replace('#', '') || 'FFFFFF';
            const deeperColor = (color) => {
                if (isDark) return mixColors(color, '#000000', 0.3)
                else return mixColors(color, '#FFFFFF', 0.3)
            }
            monaco.editor.defineTheme('myCustomTheme', {
                base: themeName,
                inherit: true,
                rules: [
                    {
                        token: '',
                        background: toMonacoColor(deeperColor(themeState.currentTheme.background)),
                        fontStyle: ''
                    }
                ],
                colors: {
                    'editor.background': deeperColor(themeState.currentTheme.background),
                }
            });
            monaco.editor.setTheme('myCustomTheme');
        })
        eventBus.emit('sync-editor-theme')
        initPdfJs();
        await nextTick();

        if (mainContainerRef.value) {
            const initialWidth = mainContainerRef.value.clientWidth;
            if (initialWidth) {
                mainWidth.value = initialWidth;
                ensurePdfWithinBounds();
            }
            mainObserver = new ResizeObserver((entries) => {
                if (!entries.length) return;
                const width = entries[0].contentRect.width;
                if (width !== mainWidth.value) {
                    mainWidth.value = width;
                    ensurePdfWithinBounds();
                }
            });
            mainObserver.observe(mainContainerRef.value);
        }
    }
    catch (e) {
        logger.error(e);
        eventBus.emit('show-error',
            t('article.latex_init_failed') + e
        );
    }
    finally {
        loadingInstance.close();
    }
});

// 清理资源
onUnmounted(() => {
    //logger.debug("LaTeXEditor onUnmounted")
    if (mainObserver) {
        mainObserver.disconnect();
        mainObserver = null;
    }
    
    eventBus.emit('is-need-save', true)
    
    if (editorId) {
        try {
            const editors = monaco.editor.getEditors();
            editors.forEach(editor => {
                if (editor.getId() === editorId) {
                    try {
                        editor.dispose(); // 释放 editor 的所有资源，包括模型、事件监听等
                    } catch (e) {
                        // 编辑器可能已经被销毁，忽略错误
                    }
                }
            });
        } catch (e) {
            logger.warn('清理 Monaco 编辑器时出错', e);
        }
    }
    
    if (typeof window !== 'undefined') {
        window.removeEventListener('resize', updateSearchMenuPosition);
    }
});

const triggerSuggestion = ref(false);

function onAcceptSuggestion(text) {
    //logger.log("补全已接受:", text);
    //insertText(text);
    //AISuggestion已经帮忙插入了
    triggerSuggestion.value = false;
}
function onCancelSuggestion() {
    //logger.log("补全已取消");
    triggerSuggestion.value = false;
    //initiativeSuggestion.value=false;
    //状态不切换回false,保持为true
}
function onResetSuggestion() {
    //logger.log("补全已重置");
    triggerSuggestion.value = false;
}

// 监听输入 -> 1秒后触发
const suggestionContext=ref({
    preContext:"",
    postContext:""
})
// 控制是否主动触发补全
//const initiativeSuggestion = ref(true);
let suggestionTimer = null; // AI suggestion 专用防抖
function getSuggestionContext(contextSize=1000){
    const model = editor.value.getModel();
    //logger.log(selection)

    const sel = editor.value.getSelection();
    // 选择 caret 位置：若是折叠（无选区）用 start，若有选区，默认用 end（caret 通常在 end）
    const isCollapsed = (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn);
    const caretLine = isCollapsed ? sel.startLineNumber : sel.endLineNumber;
    const caretColumn = isCollapsed ? sel.startColumn : sel.endColumn;
    //logger.log("caretColumn")
        // 把位置转为 offset（字符索引）
    const caretPos = { lineNumber: caretLine, column: caretColumn };
    const caretOffset = model.getOffsetAt(caretPos);
    //logger.log("caretOffset")
    const fullLength = model.getOffsetAt(model.getFullModelRange().getEndPosition());;
    //logger.log("fullLength",fullLength)
    const startOffset = Math.max(0, caretOffset - contextSize);
    const endOffset = Math.min(fullLength, caretOffset + contextSize);
    // logger.log(startOffset)
    // logger.log(endOffset)
    const fullText = currentTex.value || "";
    suggestionContext.value.preContext = fullText.slice(startOffset, caretOffset);
    suggestionContext.value.postContext = fullText.slice(caretOffset, endOffset);
}
function trytriggerSuggestion() {
    //logger.log("尝试触发Suggestion")
    // AI suggestion 防抖逻辑
    
    //if (initiativeSuggestion.value ==false) return;//只生成一次，不是这里的问题
    triggerSuggestion.value = false;
    if (suggestionTimer) clearTimeout(suggestionTimer);
    eventBus.on('cancel-suggestion',()=>{clearTimeout(suggestionTimer);})
    suggestionTimer = setTimeout(() => {
        triggerSuggestion.value = false;
        getSuggestionContext();
        //logger.log("触发Suggestion")
        triggerSuggestion.value = true;
    }, 1500); // 1.5 秒防抖


}
// 监听输入 -> 1秒后触发

</script>

<style scoped>
.content-container {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.latex-layout {
    display: flex;
    height: 100%;
    width: 100%;
}

.latex-main {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
}

.latex-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.left-column {
    min-width: 360px;
    border-right: 1px solid var(--el-border-color-lighter);
    flex: 1 1 auto;
}

.pdf-column {
    min-width: 360px;
    border-right: 1px solid var(--el-border-color-lighter);
    background-color: var(--el-bg-color-page);
    position: relative;
    flex: 0 0 auto;
}

.meta-column {
    min-width: 260px;
    max-width: 520px;
    overflow-y: auto;
    padding: 12px;
    box-sizing: border-box;
    color: var(--el-text-color-primary);
    flex: 0 0 auto;
}

.resize-handle {
    width: 6px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
}

.resize-handle::after {
    content: '';
    width: 2px;
    height: 60%;
    background-color: var(--el-border-color);
    border-radius: 1px;
}

.toolbar {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid #bbb;
    gap: 8px;
    flex-shrink: 0;
}

.toolbar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.toolbar-icon:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.editor-console-container {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--el-bg-color-page);
}

.editor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
}

.console-wrapper {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--console-background);
  box-shadow: 0 -2px 6px rgba(0,0,0,0.3);
}

.console-panel {
  flex: 1;
  overflow: auto;
  z-index: 1000;
}

.editor-resizer {
  height: 2px;
  cursor: row-resize;
}

.pdf-toolbar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.pdf-toolbar__page {
    display: flex;
    align-items: center;
    gap: 6px;
}

.pdf-toolbar__page input {
    width: 60px;
    text-align: center;
}

.pdf-toolbar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 5px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.pdf-toolbar-icon:hover {
    background-color: rgba(0, 0, 0, 0.05);
}

.pdf-preview-container {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--el-border-color-lighter);
}

.pdf-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    cursor: grab;
}

.pdf-container.dragging {
    cursor: grabbing;
}

.canvas-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
}

.pdf-empty-text {
    color: #999;
    font-weight: normal;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    user-select: none;
    pointer-events: none;
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-color, #999);
    text-align: center;
}

.context-menu {
    position: fixed;
    z-index: 1000;
}
</style>
