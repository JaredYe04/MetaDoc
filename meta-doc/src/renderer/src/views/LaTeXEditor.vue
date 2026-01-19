<template>
    <div class="main-container">
        <div class="content-container">

            <!-- 菜单组件 -->
                <SectionOptimizer
                    v-if="showSectionOptimizer" 
                :title="currentSectionTitle" 
                :position="sectionOptimizerPosition"
                :path="currentTitlePath"
                :tree="extractOutlineTreeFromLatex(currentTex, true)"
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
                :tree="extractOutlineTreeFromLatex(currentTex, true)"
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
                :key="editorKey"
                :editorId="editorId"
                format="tex"
                @accepted="onAcceptSuggestion"
                @cancelled="onCancelSuggestion"
            />

            <div class="latex-layout">
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
                                            mainWidth - LATEX_LAYOUT.left.minWidth
                                        )
                                        : LATEX_LAYOUT.pdf.minWidth
                                "
                                :divider-size="8"
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
                                <div class="editor-console-container" ref="editorConsoleContainerRef">
                                    <div class="editor-wrapper" :class="{ 'console-visible': showConsole }">
                                        <div class="editor" :key="editorKey" :id="editorDomId" ref="editorEl"
                                            @contextmenu.prevent="openContextMenu($event)"></div>
                                    </div>
                                    <div v-if="showConsole" class="console-resizer" @mousedown="startResizeConsole"></div>
                                    <div v-show="showConsole" class="console-wrapper" :style="{ height: consoleHeight + 'px' }">
                                        <div class="console-panel" :style="{
                                            background: themeState.currentTheme.background
                                        }">
                                            <ConsoleOutput console-key="latex" />
                                        </div>
                                    </div>
                                </div>
                                </div>
                                </template>

                                <template #sidebar>
                                    <keep-alive>
                                        <div class="latex-column pdf-column" v-show="showPdfPanel">
                                            <div class="pdf-toolbar" v-if="isValidPdfUrl"
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

                                                <span class="pdf-toolbar__page" :title="`${inputPdfPage} / ${totalPdfPages} ${$t('latexEditor.pages')}`">
                                                    <input type="number" v-model.number="inputPdfPage" @change="jumpToPage" :min="1"
                                                        :max="totalPdfPages"
                                                    />
                                                    <span class="pdf-toolbar__page-label">/ {{ totalPdfPages }} {{ $t('latexEditor.pages') }}</span>
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

                                            <el-scrollbar
                                                ref="pdfScrollbarRef"
                                                v-if="isValidPdfUrl && totalPdfPages > 0"
                                                class="pdf-preview-container"
                                                :style="{ background: themeState.currentTheme.background }"
                                                @contextmenu.prevent="openPdfContextMenu($event)">
                                                <div 
                                                    ref="pdfPagesContainer"
                                                    class="pdf-pages-container"
                                                    :style="pdfContainerStyle"
                                                    @wheel="handlePdfScroll">
                                                    <div
                                                        v-for="pageNum in totalPdfPages"
                                                        :key="`pdf-page-${pageNum}-${pdfUrl}-${pdfRenderKey}`"
                                                        :ref="el => setPageRef(el, pageNum)"
                                                        class="pdf-page-wrapper"
                                                        :data-page-number="pageNum">
                                                        <VuePdf
                                                            :key="`vue-pdf-${pageNum}-${zoomScale}`"
                                                            :src="pdfUrl"
                                                            :page="pageNum"
                                                            :scale="zoomScale"
                                                            :enable-text-selection="true"
                                                            :enable-annotations="false"
                                                            @total-pages="handleNumPages"
                                                            @pdf-loaded="pageNum === 1 ? handlePdfLoaded($event) : undefined"
                                                            class="vue-pdf-wrapper"
                                                        />
                                                    </div>
                                                </div>
                                            </el-scrollbar>
                                            <div v-else class="pdf-preview-container" :style="{ background: themeState.currentTheme.background }">
                                                <h3 class="pdf-empty-text">
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
            </div>
        </div>
    </div>
</template>


<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, computed, watch, onUnmounted, shallowRef } from "vue";
import { ElButton, ElDialog, ElLoading, ElScrollbar } from 'element-plus';
import { Icon } from 'tdesign-icons-vue-next';

import "../assets/aero-div.css";
import "../assets/aero-btn.css";
import "../assets/aero-input.css";
import "../assets/title-menu.css";
import eventBus, { getWindowType } from '../utils/event-bus';
import { searchNode } from "../utils/outline-helpers";
import { extractOutlineTreeFromMarkdown } from '../utils/md-utils';
import { extractOutlineTreeFromLatex } from '../utils/latex-utils';
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
import AISuggestionGhost from "../components/AISuggestionGhost.vue";
import { aiCompletionService } from "../utils/ai-completion-service";
import { MonacoEditorAdapter } from "../utils/editor-adapters";
import "../assets/ai-suggestion.css";
import ResizableContainer from "../components/base/ResizableContainer.vue";
import { getArticleContextMenuItems } from "../components/contextMenus/ArticleContextMenu";
import ContextMenu from "../components/ContextMenu.vue";
import ConsoleOutput from "../components/ConsoleOutput.vue";
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { createRendererLogger } from '../utils/logger.ts'
import { waitForService } from "../utils/service-status.ts";
import * as monaco from "monaco-editor";
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useWorkspace } from '../stores/workspace';

import 'monaco-latex';
import { ArrowLeft, ArrowRight, Document, Refresh, ZoomIn, ZoomOut, Rank } from "@element-plus/icons-vue";
import { debounce } from 'lodash';
import localIpcRenderer from "../utils/web-adapter/local-ipc-renderer";
import { webMainCalls } from "../utils/web-adapter/web-main-calls";
import { createMonacoAdapter } from "../editor/monaco-adapter";
import { prependAiChatDialog } from '../utils/ai-chat-storage';
import { setupMonacoWorker, registerLatexLanguage } from '../utils/monaco-worker-config';
import { createAiTask, ai_types, cancelAiTask } from '../utils/ai_tasks';
import { getCurrentLocalePrompts } from '../utils/prompts';

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
        minWidth: 400,  // 降低最小宽度，允许更灵活的调整
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

const currentOutline = computed({
    get: () => documentRef.value.outline,
    set: (val) => workspace.updateDocumentOutline(props.tabId, val),
});

const currentOutlineJson = computed(() => {
    try {
        // 直接从 LaTeX 文本提取大纲树，而不是依赖可能为空的 markdown
        //logger.debug('currentOutlineJson: ' + currentTex.value);
        const outline = extractOutlineTreeFromLatex(currentTex.value, false);
        //logger.debug('currentOutlineJson: ' + JSON.stringify(outline));
        return JSON.stringify(outline);
    } catch (error) {
        logger.warn('构建 LaTeX 大纲 JSON 失败', error);
        return JSON.stringify({ path: 'dummy', title: '', text: '', title_level: 0, children: [] });
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
const editor = ref<monaco.editor.IStandaloneCodeEditor | null>(null);
const articleContextMenuItems = ref<any[]>([]);//右键菜单项
const textEditorAdapter = shallowRef<any>(null);

const loadingInstance = ElLoading.service({ fullscreen: false });
const showTitleMenu = ref(false);
const showSectionOptimizer = ref(false);
const currentTitle = ref("");
const currentSectionTitle = ref("");
const menuPosition = ref({ top: 0, left: 0 });
const sectionOptimizerPosition = ref({ top: 0, left: 0 });
const sectionOptimizerAdapter = shallowRef<any>(null);
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

// PDF右键菜单
const pdfContextMenuVisible = ref(false);
const pdfMenuX = ref(0);
const pdfMenuY = ref(0);
const pdfContextMenuItems = ref<any[]>([
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
    if (!editor.value || !props.tabId || !editorId.value) return
    
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId.value) || editor.value;
    if (!monacoEditor) return

    // 获取当前光标位置
    const position = monacoEditor.getPosition()
    if (!position) return

    // 创建适配器
    const adapter = new LaTeXSectionAdapter(props.tabId, editorId.value)
    adapter.setEditorId(editorId.value)
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


const replaceDialogs = (builder: (dialogs: any[]) => any[]) => {
    const base = [...currentDialogs.value];
    const next = builder(base);
    workspace.updateDocumentAiDialogs(props.tabId, next);
};

const addDialogEntry = (dialog: any, addToFront = false) => {
    replaceDialogs((dialogs) => {
        if (addToFront) {
            dialogs.unshift(dialog);
        } else {
            dialogs.push(dialog);
        }
        return dialogs;
    });
};

const acceptGeneratedText = async (payload: any) => {
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

const editorEl = ref<HTMLElement | null>(null);
const editorKey = ref(Date.now());
const mainContainerRef = ref<HTMLElement | null>(null);
const pdfResizableRef = ref<any>(null);
const mainWidth = ref(0);
let mainObserver: ResizeObserver | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clampPdfWidth = (size: number) => {
    if (!showPdfPanel.value) return LATEX_LAYOUT.pdf.minWidth;
    const width = mainWidth.value || size + LATEX_LAYOUT.left.minWidth;
    const minAllowed = LATEX_LAYOUT.pdf.minWidth;
    // 允许 PDF 面板占据更多空间，但至少保留 left 的最小宽度
    const maxByEditor = width - LATEX_LAYOUT.left.minWidth;
    // 可选：仍然应用 maxRatio 作为软限制，但不强制
    const maxByRatio = width * LATEX_LAYOUT.pdf.maxRatio;
    // 使用更大的值作为上限，允许更灵活的调整
    const maxAllowed = Math.max(maxByEditor, maxByRatio);
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

const handlePdfResize = (size: number) => {
    // 只在超出边界时才进行限制，允许在正常范围内自由拖动
    const clamped = clampPdfWidth(size);
    // 只有当被限制的值与输入值不同时才更新（说明超出了边界）
    // 这样可以避免在正常拖动时频繁调用 setSidebarSize，影响拖动流畅性
    if (Math.abs(clamped - size) > 1 && pdfResizableRef.value?.setSidebarSize) {
        pdfResizableRef.value.setSidebarSize(clamped);
    }
    // 在 PDF 面板大小变化时，暂时禁用 minimap 避免闪烁
    temporarilyDisableMinimap();
};

const editorDomId = computed(() => props.editorDomId || 'latex-editor');

// 增量同步缓存
let textBuffer = currentTex.value;

// 标记是否正在从外部更新编辑器（避免循环更新）
let isUpdatingFromExternal = false;

// 获取当前激活的 Monaco 编辑器（始终从全局获取，避免引用过期实例）
const getActiveMonacoEditor = () => {
    const editors = monaco.editor.getEditors();
    const byId = editorId.value
        ? editors.find(e => e.getId?.() === editorId.value)
        : undefined;
    return byId || editors[0] || editor.value;
};

// 文本到大纲的同步（类似 MarkdownEditor）
let suppressOutlineSync = false;
const syncOutlineFromTex = debounce(() => {
    if (suppressOutlineSync) return;
    if (!isActive.value) return;
    
    // 只在编辑器视图时才同步大纲，避免在outline视图时触发不必要的同步
    const currentView = documentRef.value.lastView ?? 'editor';
    // 兼容旧的'article'值（已被'editor'替代）
    if (currentView !== 'editor' && (currentView as string) !== 'article') {
        return;
    }
    
    try {
        const adapter = getOutlineAdapter('tex');
        const extractedOutline = adapter.fromText(currentTex.value);
        currentOutline.value = extractedOutline;
    } catch (error) {
        logger.warn('从 LaTeX 同步大纲树失败', error);
    }
}, 200);

const undo = () => editor.value?.trigger("keyboard", "undo", null);
const redo = () => editor.value?.trigger("keyboard", "redo", null);
const zoomIn = () => {
    if (!editor.value) return;
    const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize);
    editor.value.updateOptions({ fontSize: currentFontSize + 1 });
}
const zoomOut = () => {
    if (!editor.value) return;
    const currentFontSize = editor.value.getOption(monaco.editor.EditorOption.fontSize);
    editor.value.updateOptions({ fontSize: currentFontSize - 1 });
}
let enableMinimap = true;
let enableRowNumber = true;
const toggleMinimap = () => {
    if (!editor.value) return;
    enableMinimap = !enableMinimap;
    editor.value.updateOptions({
        minimap: { enabled: enableMinimap }
    });
}

// Minimap 防抖处理：在窗口或组件大小变化时暂时禁用 minimap，避免闪烁
let isMinimapTemporarilyDisabled = false;

// 重新启用 minimap 的防抖函数
const reenableMinimap = debounce(() => {
    if (!editor.value || !enableMinimap) return;
    
    // 如果 minimap 原本是启用的，重新启用它
    if (isMinimapTemporarilyDisabled) {
        editor.value.updateOptions({
            minimap: { enabled: true }
        });
        isMinimapTemporarilyDisabled = false;
    }
}, 300); // 300ms 防抖延迟

// 暂时禁用 minimap（在 resize 开始时调用）
const temporarilyDisableMinimap = () => {
    if (!editor.value || !enableMinimap) return;
    
    // 如果 minimap 当前是启用的，暂时禁用它
    if (!isMinimapTemporarilyDisabled) {
        editor.value.updateOptions({
            minimap: { enabled: false }
        });
        isMinimapTemporarilyDisabled = true;
    }
    
    // 触发防抖重新启用
    reenableMinimap();
}
const toggleRowNumber = () => {
    if (!editor.value) return;
    enableRowNumber = !enableRowNumber;
    editor.value.updateOptions({
        lineNumbers: enableRowNumber ? 'on' : 'off'
    });
}

const showPdfPanel = ref(false)  // 默认不显示，只有在存在 PDF 文件时才显示
const showConsole = ref(false)  // 默认隐藏终端
const pdfUrl = ref('')

// AI 错误分析相关
const aiErrorAnalysisOutput = ref('')
let lastOutputLength = 0 // 用于增量输出
let errorAnalysisWatchStop: (() => void) | null = null
let currentAiTaskHandle: string | null = null // 当前AI任务的handle
const enableAiAnalysis = ref(true) // AI分析开关（默认开启）

// 收集编译过程中的 console 输出
let compileConsoleOutput: { stdout: string; stderr: string } = { stdout: '', stderr: '' }
let compileConsoleListeners: { 
    onStdout?: (data: unknown) => void
    onStderr?: (data: unknown) => void
} = {}

// 检查 PDF URL 是否有效
const isValidPdfUrl = computed(() => {
    return pdfUrl.value && 
           pdfUrl.value !== '' && 
           pdfUrl.value !== 'file:///' && 
           pdfUrl.value.trim() !== '';
})
const pdfScrollbarRef = ref<InstanceType<typeof ElScrollbar> | null>(null);
const pdfPagesContainer = ref<HTMLElement | null>(null);
// 存储每个页面的DOM引用，用于跳转定位
const pageRefs = new Map<number, HTMLElement>();

import { VuePdf, createLoadingTask } from 'vue3-pdfjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { wholeArticleContextPrompt } from "../utils/prompts.ts";
let pdfInitialized = false;

let ipcRenderer: any = null
if (window && (window as any).electron) {
    ipcRenderer = (window as any).electron.ipcRenderer

} else {
    webMainCalls();
    ipcRenderer = localIpcRenderer
    //todo 说明当前环境不是electron环境，需要另外适配
}
// 计算最优缩放比例（使用整数倍或接近整数倍，避免模糊）
function calculateOptimalScale(baseScale: number): number {
    // 将缩放比例调整为接近整数倍，提高清晰度
    // 使用0.1的倍数以确保缩放能产生明显变化
    // 例如：1.0 + 0.1 = 1.1, 1.0 - 0.1 = 0.9
    const rounded = Math.round(baseScale * 10) / 10; // 四舍五入到0.1的倍数
    const result = Math.max(0.2, Math.min(5, rounded));
    return result;
}

// PDF缩放比例（用于VuePdf组件的scale属性，动态调整以优化渲染质量）
const zoomScale = ref(1.0); // 默认缩放比例

// 容器样式（不需要CSS transform，因为VuePdf的scale已经处理了缩放）
const pdfContainerStyle = computed(() => {
    return {
        // 不需要transform，VuePdf的scale已经处理了缩放
        // 容器大小会自动匹配PDF的渲染尺寸
    };
});

// 用于强制重新渲染的 key（文件重新加载时更新）
const pdfRenderKey = ref(0);
// Monaco编辑器高亮装饰ID
let highlightDecorationIds: string[] = [];

// watch 监听器将在 currentPdfPage 定义后添加

// 将文件路径编码为 file:// URL
// 注意：file:// URL 需要正确编码路径中的特殊字符（如 #、空格、中文字符等）
function encodeFilePathToUrl(filePath: string): string {
    if (!filePath) return '';
    
    // 移除 file:/// 前缀（如果存在）
    let path = filePath.replace(/^file:\/\/\//, '');
    
    // Windows 路径处理：将反斜杠转换为正斜杠
    path = path.replace(/\\/g, '/');
    
    // 分割路径为各个部分，对每个部分进行编码
    // 但保留路径分隔符和驱动器号（如 C:）
    const parts = path.split('/');
    const encodedParts = parts.map((part: string, index: number) => {
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

// 设置页面DOM引用
function setPageRef(el: any, pageNum: number) {
    if (el && el instanceof HTMLElement) {
        pageRefs.set(pageNum, el);
    } else if (el === null) {
        pageRefs.delete(pageNum);
    }
}

// 处理PDF滚动事件（用于Ctrl+滚轮缩放）
function handlePdfScroll(event?: WheelEvent) {
    if (event && (event.ctrlKey || event.metaKey)) {
        // Ctrl/Cmd + 滚轮：缩放
        event.preventDefault();
        event.stopPropagation();
        const currentValue = zoomScale.value;
        const delta = event.deltaY > 0 ? -0.1 : 0.1; // 上滚放大，下滚缩小
        const newScale = Math.min(Math.max(currentValue + delta, 0.2), 5);
        const optimalScale = calculateOptimalScale(newScale);
        
        // 只有当optimalScale与currentValue不同时才更新，避免无效更新
        if (Math.abs(optimalScale - currentValue) > 0.05) {
            zoomScale.value = optimalScale;
            console.log('handlePdfScroll: zoomScale changed to', optimalScale);
        }
    }
}

async function initPdfJs() {
    if(currentPath.value && currentPath.value.toLowerCase().endsWith(".tex")){
        const pdfPath = currentPath.value.toLowerCase().replace('.tex','.pdf');
        pdfUrl.value = encodeFilePathToUrl(pdfPath);
    }else{
        pdfUrl.value="";
    }
    
    pdfInitialized = true;
    
    // 等待容器准备好后加载PDF
    await nextTick();
    if (pdfUrl.value) {
        // 尝试加载 PDF，如果成功则显示面板
        const loaded = await loadPdf(pdfUrl.value);
        if (loaded) {
            showPdfPanel.value = true;
        } else {
            showPdfPanel.value = false;
        }
    } else {
        showPdfPanel.value = false;
    }
    
    // 绑定wheel事件到容器（用于Ctrl+滚轮缩放）
    await nextTick();
    if (pdfPagesContainer.value) {
        pdfPagesContainer.value.addEventListener('wheel', handlePdfScroll as any, { passive: false });
    }
    
    // 设置滚动监听器（用于自动检测当前页面）
    await nextTick();
    setupScrollListener();
}
const pdfZoomIn = () => {
    const currentValue = zoomScale.value;
    const newScale = Math.min(Math.max(currentValue + 0.1, 0.2), 5);
    const optimalScale = calculateOptimalScale(newScale);
    zoomScale.value = optimalScale;
}
const pdfZoomOut = () => {
    const currentValue = zoomScale.value;
    const newScale = Math.min(Math.max(currentValue - 0.1, 0.2), 5);
    const optimalScale = calculateOptimalScale(newScale);
    zoomScale.value = optimalScale;
}
const pdfZoomReset = () => {
    zoomScale.value = calculateOptimalScale(1.0);
}
let pdfDoc: any = null;        // pdfjs document
const currentPdfPage = ref(1);
const totalPdfPages = ref(0);
const inputPdfPage = ref(1);

// 滚动到指定页面
async function scrollToPage(pageNumber: number) {
    await nextTick();
    const pageElement = pageRefs.get(pageNumber);
    if (pageElement && pdfScrollbarRef.value) {
        const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null;
        const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null;
        if (scrollbarWrap && pageElement) {
            const containerRect = scrollbarWrap.getBoundingClientRect();
            const pageRect = pageElement.getBoundingClientRect();
            const scrollTop = scrollbarWrap.scrollTop;
            const targetScrollTop = scrollTop + pageRect.top - containerRect.top - 20; // 20px 顶部边距
            scrollbarWrap.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
            });
        }
    }
}

// 标志：是否正在自动更新页码（避免触发跳转）
let isAutoUpdatingPage = false;

// 监听页码变化，自动滚动到对应页面（仅在非自动更新时）
watch(
    () => currentPdfPage.value,
    (newPage) => {
        if (!isAutoUpdatingPage) {
            scrollToPage(newPage);
        }
    }
);

// 检测当前视口显示的页面
function detectCurrentPage() {
    if (!pdfScrollbarRef.value || !pdfPagesContainer.value || totalPdfPages.value === 0) {
        return;
    }
    
    const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null;
    const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null;
    if (!scrollbarWrap) return;
    
    const containerRect = scrollbarWrap.getBoundingClientRect();
    const viewportCenter = containerRect.top + containerRect.height / 2;
    
    // 查找视口中心对应的页面
    let currentPage = 1;
    let minDistance = Infinity;
    
    for (let pageNum = 1; pageNum <= totalPdfPages.value; pageNum++) {
        const pageElement = pageRefs.get(pageNum);
        if (!pageElement) continue;
        
        const pageRect = pageElement.getBoundingClientRect();
        const pageCenter = pageRect.top + pageRect.height / 2;
        const distance = Math.abs(viewportCenter - pageCenter);
        
        // 如果页面在视口内，优先选择
        if (pageRect.top <= viewportCenter && pageRect.bottom >= viewportCenter) {
            if (distance < minDistance) {
                minDistance = distance;
                currentPage = pageNum;
            }
        } else if (minDistance === Infinity) {
            // 如果还没有找到在视口内的页面，记录最近的页面
            if (distance < minDistance) {
                minDistance = distance;
                currentPage = pageNum;
            }
        }
    }
    
    // 如果检测到的页面与当前页面不同，更新页码（不触发跳转）
    if (currentPage !== currentPdfPage.value) {
        isAutoUpdatingPage = true;
        currentPdfPage.value = currentPage;
        inputPdfPage.value = currentPage;
        // 使用nextTick确保watch已经处理完
        nextTick(() => {
            isAutoUpdatingPage = false;
        });
    }
}

// 滚动事件处理（防抖）
const handleScrollDebounced = debounce(() => {
    detectCurrentPage();
}, 100);

// 监听滚动事件
function setupScrollListener() {
    if (!pdfScrollbarRef.value) return;
    
    const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null;
    const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null;
    if (scrollbarWrap) {
        scrollbarWrap.addEventListener('scroll', handleScrollDebounced, { passive: true });
    }
}

// 移除滚动监听器
function removeScrollListener() {
    if (!pdfScrollbarRef.value) return;
    
    const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null;
    const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null;
    if (scrollbarWrap) {
        scrollbarWrap.removeEventListener('scroll', handleScrollDebounced);
    }
}

// 始终启用文本选择监听
onMounted(() => {
    nextTick(() => {
        setupTextSelectionListener();
    });
});

// 文本选择监听器
let textSelectionHandler: ((e: Event) => void) | null = null;

function setupTextSelectionListener() {
    if (textSelectionHandler) return;
    
    textSelectionHandler = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const selectedText = selection.toString().trim();
        if (!selectedText || selectedText.length < 2) return;
        
        // 使用选中的文本定位到Monaco编辑器
        locateTextInMonaco(selectedText);
    };
    
    // 监听文本选择变化
    document.addEventListener('selectionchange', textSelectionHandler);
}

function removeTextSelectionListener() {
    if (textSelectionHandler) {
        document.removeEventListener('selectionchange', textSelectionHandler);
        textSelectionHandler = null;
    }
}

// 高亮代码行
function highlightCodeLine(monacoEditor: monaco.editor.IStandaloneCodeEditor | monaco.editor.ICodeEditor, lineNumber: number) {
    // 清除之前的高亮
    if (highlightDecorationIds.length > 0) {
        monacoEditor.deltaDecorations(highlightDecorationIds, []);
        highlightDecorationIds = [];
    }
    
    // 获取该行的内容，计算列范围
    const model = monacoEditor.getModel();
    if (!model) return;
    
    const lineContent = model.getLineContent(lineNumber);
    const lineLength = lineContent.length;
    
    // 创建整行高亮装饰
    const decoration: monaco.editor.IModelDeltaDecoration = {
        range: new monaco.Range(lineNumber, 1, lineNumber, lineLength + 1),
        options: {
            isWholeLine: true,
            className: 'pdf-locate-highlight-line',
            minimap: {
                color: 'rgba(64, 158, 255, 0.3)',
                position: monaco.editor.MinimapPosition.Inline
            },
            overviewRuler: {
                color: 'rgba(64, 158, 255, 0.8)',
                position: monaco.editor.OverviewRulerLane.Full
            },
            hoverMessage: { value: '从PDF定位到此位置' }
        }
    };
    
    highlightDecorationIds = monacoEditor.deltaDecorations([], [decoration]);
    
    // 3秒后自动清除高亮
    setTimeout(() => {
        if (highlightDecorationIds.length > 0) {
            monacoEditor.deltaDecorations(highlightDecorationIds, []);
            highlightDecorationIds = [];
        }
    }, 3000);
}

// 高亮代码范围
function highlightCodeRange(monacoEditor: monaco.editor.IStandaloneCodeEditor | monaco.editor.ICodeEditor, range: any) {
    // 清除之前的高亮
    if (highlightDecorationIds.length > 0) {
        monacoEditor.deltaDecorations(highlightDecorationIds, []);
        highlightDecorationIds = [];
    }
    
    // 处理不同的range格式：可能是 {start: {line, column}, end: {line, column}} 或 monaco.IRange
    let startLine: number, startColumn: number, endLine: number, endColumn: number;
    
    if (range.start && range.end) {
        // TextRange 格式：{start: {line, column}, end: {line, column}}
        startLine = range.start.line || range.start.lineNumber;
        startColumn = range.start.column || range.start.column;
        endLine = range.end.line || range.end.lineNumber;
        endColumn = range.end.column || range.end.column;
    } else {
        // monaco.IRange 格式：{startLineNumber, startColumn, endLineNumber, endColumn}
        startLine = range.startLineNumber;
        startColumn = range.startColumn;
        endLine = range.endLineNumber;
        endColumn = range.endColumn;
    }
    
    // 创建范围高亮装饰
    const monacoRange = new monaco.Range(
        startLine,
        startColumn,
        endLine,
        endColumn
    );
    
    const decoration: monaco.editor.IModelDeltaDecoration = {
        range: monacoRange,
        options: {
            isWholeLine: false,
            className: 'pdf-locate-highlight-range',
            minimap: {
                color: 'rgba(64, 158, 255, 0.3)',
                position: monaco.editor.MinimapPosition.Inline
            },
            overviewRuler: {
                color: 'rgba(64, 158, 255, 0.8)',
                position: monaco.editor.OverviewRulerLane.Full
            },
            hoverMessage: { value: '从PDF定位到此位置' }
        }
    };
    
    highlightDecorationIds = monacoEditor.deltaDecorations([], [decoration]);
    
    // 同时选中文本
    monacoEditor.setSelection(monacoRange);
    
    // 3秒后自动清除高亮
    setTimeout(() => {
        if (highlightDecorationIds.length > 0) {
            monacoEditor.deltaDecorations(highlightDecorationIds, []);
            highlightDecorationIds = [];
        }
    }, 3000);
}

// 使用选中的文本定位到Monaco编辑器
function locateTextInMonaco(selectedText: string) {
    if (!textEditorAdapter.value || !editorId.value) return;
    
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId.value) || editors[0];
    if (!monacoEditor) return;
    
    try {
        if (typeof textEditorAdapter.value.locateText === 'function') {
            const range = (textEditorAdapter.value as any).locateText(selectedText, {
                matchCase: false,
                wholeWord: false,
                useRegex: false,
            });
            
                if (range) {
                    const monacoPosition = new monaco.Position(range.start.line, range.start.column);
                    monacoEditor.setPosition(monacoPosition);
                    monacoEditor.revealLineInCenter(range.start.line);
                    // 高亮找到的文本范围
                    highlightCodeRange(monacoEditor, range);
                }
        }
    } catch (error) {
        logger.error('定位文本到Monaco失败', error);
    }
}

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
        const monacoEditor = getActiveMonacoEditor();
        if (!monacoEditor) return;
        
        // 检查Monaco编辑器中的内容是否与currentTex不同
        const editorContent = monacoEditor.getValue();
        
        // 如果内容不同，说明是外部更新，需要同步到Monaco
        if (editorContent !== nextValue) {
            // 设置标志，避免触发onDidChangeModelContent中的同步逻辑
            isUpdatingFromExternal = true;
            
            try {
                // 保存当前光标位置
                const position = monacoEditor.getPosition();
                
                // 更新Monaco编辑器内容
                monacoEditor.setValue(nextValue);
                
                // 恢复光标位置（如果可能）
                if (position) {
                    monacoEditor.setPosition(position);
                    monacoEditor.revealLineInCenter(position.lineNumber);
                }
                
                logger.debug('LaTeXEditor: 已同步外部文件修改到Monaco编辑器', {
                    contentLength: nextValue.length,
                    editorLength: editorContent.length
                });
            } catch (error) {
                logger.error('LaTeXEditor: 同步外部文件修改失败', error);
            } finally {
                // 使用setTimeout确保在Monaco的onDidChangeModelContent事件处理完成后重置标志
                // Monaco的setValue可能会异步触发内容变化事件
                setTimeout(() => {
                    isUpdatingFromExternal = false;
                }, 0);
            }
        }
        
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
            nextTick(async () => {
                const loaded = await loadPdf(pdfUrl.value);
                showPdfPanel.value = loaded;
            });
        }
    },
    { immediate: true },
);

watch(
    currentPath,
    async (path) => {
        //logger.debug("LaTeXEditor currentPath changed", { path })
        if (!path || !path.toLowerCase().endsWith('.tex')) {
            pdfUrl.value = '';
            showPdfPanel.value = false;
            return;
        }
        const pdfPath = path.toLowerCase().replace('.tex', '.pdf');
        const nextUrl = encodeFilePathToUrl(pdfPath);
        pdfUrl.value = nextUrl;
        if (!isActive.value) return;
        if (pdfInitialized) {
            // 尝试加载 PDF，根据结果设置面板显示状态
            const loaded = await loadPdf(nextUrl);
            showPdfPanel.value = loaded;
        }
    },
);

watch(
    () => showPdfPanel.value,
    (visible) => {
        //logger.debug("LaTeXEditor showPdfPanel changed", { visible })
        nextTick(() => {
            if (visible) {
                ensurePdfWithinBounds();
                // 如果PDF URL存在且已初始化，重新加载PDF
                if (pdfUrl.value && pdfInitialized && pdfDoc) {
                    // PDF文档已存在，VuePdf 组件会自动响应 page 和 scale 变化
                } else if (pdfUrl.value && pdfInitialized) {
                    // PDF文档不存在，需要重新加载
                    loadPdf(pdfUrl.value, true); // 保留当前页码
                }
            } else {
                // 当PDF面板隐藏时，调整面板大小
                if (pdfResizableRef.value?.setSidebarSize) {
                    pdfResizableRef.value.setSidebarSize(LATEX_LAYOUT.pdf.minWidth);
                }
            }
        });
    },
);

function goPrevPage() {
    if (currentPdfPage.value > 1) {
        currentPdfPage.value--;
        inputPdfPage.value = currentPdfPage.value;
        // watch会自动触发滚动
    }
}

function goNextPage() {
    if (currentPdfPage.value < totalPdfPages.value) {
        currentPdfPage.value++;
        inputPdfPage.value = currentPdfPage.value;
        // watch会自动触发滚动
    }
}

function jumpToPage() {
    let page = Math.min(Math.max(inputPdfPage.value, 1), totalPdfPages.value);
    currentPdfPage.value = page;
    inputPdfPage.value = page;
    // watch会自动触发滚动
}

// 获取PDF页面对象（用于映射功能）
async function getPdfPage(pageNumber: number) {
    if (!pdfDoc) return null;
    return await pdfDoc.getPage(pageNumber);
}


// 处理PDF文本双击定位
async function handlePdfTextClick(event: MouseEvent) {
    // 从Monaco全局获取编辑器实例
    if (!editorId.value) return;
    const editors = monaco.editor.getEditors();
    const monacoEditor = editors.find(e => e.getId?.() === editorId.value) || editors[0];
    
    if (!pdfDoc || !monacoEditor) {
        logger.warn('PDF双击定位失败: pdfDoc或editor不存在');
        return;
    }
    
    try {
        const page = await pdfDoc.getPage(currentPdfPage.value);
        const viewport = page.getViewport({ scale: 1 }); // 使用标准viewport（scale=1）用于坐标转换
        
        // 获取当前页面的DOM元素
        const currentPageElement = pageRefs.get(currentPdfPage.value);
        if (!currentPageElement) {
            logger.warn('PDF双击定位失败: 当前页面元素不存在');
            return;
        }
        
        // VuePdf 组件会在容器内渲染 canvas，查找当前页面的 canvas 元素
        const canvas = currentPageElement.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
            logger.warn('PDF双击定位失败: canvas不存在');
            return;
        }
        
        const pageRect = currentPageElement.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        
        // 获取canvas的样式尺寸（逻辑像素）
        const canvasStyleWidth = canvasRect.width || viewport.width;
        const canvasStyleHeight = canvasRect.height || viewport.height;
        
        // 计算点击位置相对于canvas的坐标
        const canvasX = event.clientX - canvasRect.left;
        const canvasY = event.clientY - canvasRect.top;
        
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
                    
                    // 高亮整行代码
                    highlightCodeLine(monacoEditor, position.line);
                    return;
                } catch (error) {
                    logger.error('设置Monaco位置失败', error);
                    throw error;
                }
            }
        }
        
        // 如果映射系统不可用，使用文本搜索方式
        // 获取点击位置附近的文本项，查找上下文本
        const textContent = await page.getTextContent();
        const textItems = textContent.items;
        
        // 获取标准viewport（scale=1）用于坐标转换
        const standardViewport = page.getViewport({ scale: 1 });
        
        // 转换为PDF坐标（左下角为原点）
        const pdfX = relativeX * standardViewport.width;
        const pdfY = relativeY * standardViewport.height;
        
        // 查找点击位置附近的文本项，按Y坐标排序
        const nearbyItems = [];
        for (const item of textItems) {
            if (!item.transform || !item.str || !item.str.trim()) continue;
            
            const itemX = item.transform[4];
            const itemY = item.transform[5];
            const itemHeight = item.height || 12;
            const itemWidth = item.width || 0;
            
            // 计算到点击位置的距离（考虑Y坐标的优先级）
            const deltaX = Math.abs(itemX + itemWidth / 2 - pdfX);
            const deltaY = Math.abs(itemY + itemHeight / 2 - pdfY);
            
            // 如果文本项在点击位置的合理范围内
            if (deltaX < standardViewport.width * 0.3 && deltaY < standardViewport.height * 0.1) {
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                nearbyItems.push({
                    item,
                    distance,
                    y: itemY,
                    text: item.str.trim()
                });
            }
        }
        
        // 按距离和Y坐标排序，优先选择距离近且Y坐标接近的
        nearbyItems.sort((a, b) => {
            if (Math.abs(a.y - pdfY) < Math.abs(b.y - pdfY)) return -1;
            if (Math.abs(a.y - pdfY) > Math.abs(b.y - pdfY)) return 1;
            return a.distance - b.distance;
        });
        
        // 尝试定位文本：优先使用最近的文本，如果失败则尝试上下文本
        let found = false;
        for (let i = 0; i < Math.min(nearbyItems.length, 5); i++) {
            const nearbyItem = nearbyItems[i];
            const searchText = nearbyItem.text;
            
            if (!textEditorAdapter.value || typeof textEditorAdapter.value.locateText !== 'function') continue;
            
            try {
                const range = (textEditorAdapter.value as any).locateText(searchText, {
                    matchCase: false,
                    wholeWord: false,
                    useRegex: false,
                });
                
                if (range) {
                    const monacoPosition = new monaco.Position(range.start.line, range.start.column);
                    monacoEditor.setPosition(monacoPosition);
                    monacoEditor.revealLineInCenter(range.start.line);
                    // 高亮找到的文本范围
                    highlightCodeRange(monacoEditor, range);
                    found = true;
                    break;
                }
            } catch (error) {
                logger.error('locateText调用失败', error);
                continue;
            }
        }
        
        if (!found) {
            eventBus.emit("show-info", t("latexEditor.notification.clickToLocate"));
        }
    } catch (error) {
        logger.error('PDF文本定位失败', error);
    }
}

// 建立PDF文本到源码的映射（异步）
async function buildPdfToSourceMapping() {
    logger.debug('=== 开始建立PDF到源码映射 ===');
    
    if (!editorId) return;
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const id = editorId && typeof editorId === 'object' && 'value' in editorId ? editorId.value : editorId;
    const monacoEditor = editors.find(e => e.getId?.() === id) || editors[0];

    if (!pdfDoc) {
        logger.warn('建立映射失败: pdfDoc不存在');
        return;
    }
    if (!monacoEditor) {
        logger.warn('建立映射失败: editor不存在', { 
            editorId: editorId.value,
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
                            if (!textEditorAdapter.value || typeof textEditorAdapter.value.locateText !== 'function') continue;
                            const range = (textEditorAdapter.value as any).locateText(cleanText, {
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

// 处理 PDF 总页数事件
function handleNumPages(numPages: number) {
    totalPdfPages.value = numPages;
    //logger.debug('PDF 总页数:', numPages);
}

// 处理 PDF 加载完成事件
function handlePdfLoaded(pdf: any) {
    logger.debug('PDF 加载完成:', pdf);
    // 可以在这里处理 PDF 加载后的逻辑
    if (pdf && pdf.numPages) {
        totalPdfPages.value = pdf.numPages;
    }
}

// 在加载 PDF 后初始化
// 返回 true 表示加载成功，false 表示加载失败（文件不存在等）
async function loadPdf(url: string, preservePage = false): Promise<boolean> {
    if (!url || url.trim() === '') {
        // 如果 URL 为空，不加载 PDF
        return false;
    }
    
    // 保存当前页码（如果要求保留）
    const savedPage = preservePage ? currentPdfPage.value : 1;
    
    try {
        // 使用 createLoadingTask 获取 PDF 文档对象（用于映射功能）
        const loadingTask = createLoadingTask(url);
        pdfDoc = await loadingTask.promise;
        totalPdfPages.value = pdfDoc.numPages;
        
        // 恢复或设置页码
        const targetPage = preservePage ? Math.min(Math.max(savedPage, 1), pdfDoc.numPages) : 1;
        currentPdfPage.value = targetPage;
        inputPdfPage.value = targetPage;
        
        // 更新渲染key，强制重新渲染所有页面组件
        pdfRenderKey.value++;
        
        // 清空页面引用
        pageRefs.clear();
        
        // 等待DOM更新后滚动到目标页面
        await nextTick();
        scrollToPage(targetPage);
        
        // 设置滚动监听器（用于自动检测当前页面）
        await nextTick();
        setupScrollListener();
        
        // 异步建立映射关系
        buildPdfToSourceMapping();
        
        return true; // 加载成功
    } catch (error: any) {
        // 捕获 PDF 加载错误，避免未处理的 rejection
        const errorMessage = error?.message || String(error);
        logger.warn('加载 PDF 失败', { 
            url, 
            error: errorMessage,
            errorName: error?.name,
            status: error?.status
        });
        
        // 如果是文件不存在或无法访问的错误（包括未编译的情况），不显示错误提示
        const isFileNotFound = 
            error?.name === 'ResponseException' || 
            error?.status === 0 ||
            (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('missing pdf'));
        
        if (isFileNotFound) {
            // 文件不存在是正常情况（可能还未编译），只记录警告，不显示错误提示
            logger.warn(t('latexEditor.notification.pdfFileNotFoundOrInaccessible'))
        } else {
            eventBus.emit('show-error', 
                t('latexEditor.notification.pdfLoadFailed', { 
                    reason: errorMessage
                })
            );
        }
        
        // 清空 PDF URL，避免重复尝试加载
        pdfUrl.value = '';
        
        return false; // 加载失败
    }
}
// 切换 PDF 显示
function togglePdf() {
    showPdfPanel.value = !showPdfPanel.value
}


const compile = async () => {
    if (!editor.value || !ipcRenderer) return;
    // 自动打开终端输出界面
    showConsole.value = true;
    eventBus.emit('clear-console', { key: 'latex' })
    eventBus.emit('cancel-suggestion')
    
    // 取消之前的AI分析任务（如果存在）
    if (currentAiTaskHandle) {
        cancelAiTask(currentAiTaskHandle, false);
        currentAiTaskHandle = null;
    }
    
    if(!currentPath.value || !currentPath.value.toLowerCase().endsWith(".tex")){
        eventBus.emit("show-warning",t("latexEditor.notification.pleaseSaveFirst"));
        eventBus.emit('save');
        return;
    }
    
    // 重置收集的 console 输出
    compileConsoleOutput = { stdout: '', stderr: '' }
    
    // 设置 console 输出监听器来收集输出
    compileConsoleListeners.onStdout = (data: unknown) => {
        const payload = typeof data === 'object' && data !== null && 'key' in data && (data as any).key === 'latex'
            ? (data as any)
            : null;
        if (payload?.content) {
            compileConsoleOutput.stdout += payload.content;
        }
    };
    compileConsoleListeners.onStderr = (data: unknown) => {
        const payload = typeof data === 'object' && data !== null && 'key' in data && (data as any).key === 'latex'
            ? (data as any)
            : null;
        if (payload?.content) {
            compileConsoleOutput.stderr += payload.content;
        }
    };
    
    // 注册监听器
    eventBus.on('console-out', compileConsoleListeners.onStdout);
    eventBus.on('console-err', compileConsoleListeners.onStderr);
    
    editor.value.updateOptions({
        readOnly: true
    });
    
    try {
        const compileResult: any = await ipcRenderer.invoke("compile-tex",{
            tex:currentTex.value,
            texPath:currentPath.value??'',
            outputDir:"",//todo:用户后续可以设置保存在哪
            customPdfFileName:"",//todo
        })
        
        editor.value.updateOptions({
            readOnly: false
        });
        
        //logger.log(compileResult)
        if(compileResult?.status==='success'){
            // 移除监听器
            if (compileConsoleListeners.onStdout) {
                eventBus.off('console-out', compileConsoleListeners.onStdout);
            }
            if (compileConsoleListeners.onStderr) {
                eventBus.off('console-err', compileConsoleListeners.onStderr);
            }
            compileConsoleListeners = {};
            
            eventBus.emit("show-success",t("latexEditor.notification.compileSuccess"));
            pdfUrl.value = encodeFilePathToUrl(compileResult.pdfPath);
            
            // 重新加载PDF并建立映射
            const loaded = await loadPdf(pdfUrl.value);
            // 编译成功后，如果 PDF 加载成功，自动显示 PDF 面板
            if (loaded) {
                showPdfPanel.value = true;
            }
        }
        else{
            eventBus.emit("show-error",t("latexEditor.notification.compileFailed",{ code:compileResult?.exitCode || compileResult?.code }));
            
            // 等待一小段时间，确保所有异步的 console 输出都被收集到
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // 如果编译失败，使用AI分析错误（在移除监听器之前调用，确保能收集到所有输出）
            await analyzeCompileError(compileResult);
            
            // 移除监听器（在AI分析开始后移除）
            if (compileConsoleListeners.onStdout) {
                eventBus.off('console-out', compileConsoleListeners.onStdout);
            }
            if (compileConsoleListeners.onStderr) {
                eventBus.off('console-err', compileConsoleListeners.onStderr);
            }
            compileConsoleListeners = {};
        }
    } catch (error) {
        // 确保移除监听器
        if (compileConsoleListeners.onStdout) {
            eventBus.off('console-out', compileConsoleListeners.onStdout);
        }
        if (compileConsoleListeners.onStderr) {
            eventBus.off('console-err', compileConsoleListeners.onStderr);
        }
        compileConsoleListeners = {};
        
        editor.value.updateOptions({
            readOnly: false
        });
        
        logger.error('编译过程出错', error);
    }
    //logger.log("编译 LaTeX");
};

// 分析编译错误
const analyzeCompileError = async (compileResult: any) => {
    // 检查AI分析开关
    if (!enableAiAnalysis.value) {
        logger.debug('AI分析已关闭，跳过错误分析');
        return;
    }
    
    try {
        // 停止之前的监听
        if (errorAnalysisWatchStop) {
            errorAnalysisWatchStop();
            errorAnalysisWatchStop = null;
        }
        
        // 重置状态
        aiErrorAnalysisOutput.value = '';
        lastOutputLength = 0;
        
        // 提取错误输出（只包含错误部分，即红色部分）
        // 优先使用 stderr（这应该是错误输出）
        let errorOutput = compileConsoleOutput.stderr || 
                           compileResult?.errorOutput || compileResult?.stderr || '';
        
        // 如果 stderr 为空，尝试从 stdout 中提取错误行
        if (!errorOutput || errorOutput.trim().length === 0) {
            if (compileConsoleOutput.stdout) {
                // 从 stdout 中提取包含 "error" 或 "Error" 的行（不区分大小写）
                const stdoutLines = compileConsoleOutput.stdout.split('\n');
                const errorLines = stdoutLines.filter((line: string) => {
                    const lowerLine = line.toLowerCase().trim();
                    return lowerLine.includes('error') || 
                           lowerLine.startsWith('!') || // LaTeX 错误通常以 ! 开头
                           /error:\s/i.test(line); // 匹配 "error: " 模式
                });
                if (errorLines.length > 0) {
                    errorOutput = errorLines.join('\n');
                }
            }
        }
        
        // 如果还是没有错误输出，尝试从 compileResult.stdout 中提取
        if (!errorOutput || errorOutput.trim().length === 0) {
            if (compileResult?.stdout) {
                const stdoutLines = compileResult.stdout.split('\n');
                const errorLines = stdoutLines.filter((line: string) => {
                    const lowerLine = line.toLowerCase().trim();
                    return lowerLine.includes('error') || 
                           lowerLine.startsWith('!') ||
                           /error:\s/i.test(line);
                });
                if (errorLines.length > 0) {
                    errorOutput = errorLines.join('\n');
                }
            }
        }
        
        logger.debug('AI错误分析 - 收集到的错误信息', {
            hasStderr: !!compileConsoleOutput.stderr,
            hasStdout: !!compileConsoleOutput.stdout,
            stderrLength: compileConsoleOutput.stderr?.length || 0,
            stdoutLength: compileConsoleOutput.stdout?.length || 0,
            compileResultStatus: compileResult?.status,
            compileResultExitCode: compileResult?.exitCode || compileResult?.code,
            errorOutputLength: errorOutput.length
        });
        
        // 如果错误输出为空，使用备用信息
        if (!errorOutput || errorOutput.trim().length === 0) {
            const exitCode = compileResult?.exitCode || compileResult?.code;
            if (exitCode !== undefined && exitCode !== null) {
                errorOutput = `编译失败，退出代码: ${exitCode}`;
                logger.info('使用备用错误信息进行AI分析', { exitCode });
            } else {
                logger.warn('没有错误输出信息，跳过AI分析', {
                    compileResult: compileResult,
                    compileConsoleOutput: compileConsoleOutput
                });
                return;
            }
        }
        
        // 获取 LaTeX 原文并添加行号
        const rawLatexSource = currentTex.value || '';
        // 在每一行前面添加行号，格式为 "1: xxx\n2: xxx\n3: xxx"
        const latexSourceWithLineNumbers = rawLatexSource
            .split('\n')
            .map((line, index) => `${index + 1}: ${line}`)
            .join('\n');
        
        // 获取提示词模板
        const prompts = getCurrentLocalePrompts();
        const template = prompts.prompts?.latexCompileErrorAnalysisPrompt;
        
        let prompt = '';
        if (template) {
            prompt = template
                .replace(/{errorOutput}/g, errorOutput)
                .replace(/{texPath}/g, currentPath.value || '未知路径')
                .replace(/{latexSource}/g, latexSourceWithLineNumbers);
        } else {
            // 回退提示词
            prompt = `你是一个专业的LaTeX编译错误分析助手。请简洁精炼地分析以下编译错误：

**编译错误输出：**
\`\`\`
${errorOutput}
\`\`\`

**LaTeX 原文（已标注行号）：**
\`\`\`latex
${latexSourceWithLineNumbers}
\`\`\`

**请分析并输出：**
1. **错误原因**：一句话说明错误原因
2. **错误位置**：指出具体行号或命令
3. **解决方法**：提供简洁的修复方案（如需要添加的包、修改的代码等）

**输出要求：**
- 语言精炼，直击要害，不要过于详细
- 直接输出分析结果，从第一行开始就是分析内容
- 避免冗长的解释和前缀，只输出必要的分析和建议`;
        }
        
        // 输出分析开始提示
        eventBus.emit('console-out', {
            key: 'latex',
            content: '\n' + t('latexEditor.notification.analyzingError'),
            type: 'out'
        });
        
        // 设置增量输出监听
        errorAnalysisWatchStop = watch(
            () => aiErrorAnalysisOutput.value,
            (newValue) => {
                // 计算新增的内容（增量部分）
                if (newValue.length > lastOutputLength) {
                    const newContent = newValue.substring(lastOutputLength);
                    
                    // 如果 lastOutputLength === 0，说明是第一次输出，创建新行
                    // 否则，说明是增量输出，追加到当前行
                    const shouldAppend = lastOutputLength > 0;
                    
                    // 输出增量内容到Console
                    eventBus.emit('console-out', {
                        key: 'latex',
                        content: newContent,
                        type: 'out',
                        append: shouldAppend
                    });
                    
                    lastOutputLength = newValue.length;
                }
            },
            { immediate: false }
        );
        
        // 创建AI任务
        const messages = [{
            role: 'user' as const,
            content: prompt
        }];
        
        const { done, handle } = createAiTask(
            t('latexEditor.notification.analyzingError'),
            messages,
            aiErrorAnalysisOutput,
            ai_types.chat,
            'latex-error-analysis',
            { stream: true }
        );
        
        // 保存当前AI任务的handle，以便后续取消
        currentAiTaskHandle = handle;
        
        // 等待任务完成
        try {
            await done;
        } catch (err) {
            logger.error('AI错误分析失败', err);
            eventBus.emit('console-err', {
                key: 'latex',
                content: '\n' + t('latexEditor.notification.errorAnalysisFailed'),
                type: 'err'
            });
        }
    } catch (error) {
        logger.error('启动AI错误分析失败', error);
        eventBus.emit('console-err', {
            key: 'latex',
            content: '\n' + t('latexEditor.notification.errorAnalysisFailed'),
            type: 'err'
        });
    }
};

const toggleConsole = async () => {
    showConsole.value = !showConsole.value;
};




// 打开右键菜单
const openContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuVisible.value = true;
};

// 存储右键菜单时的鼠标位置
let contextMenuMouseEvent: MouseEvent | null = null;

// 打开PDF右键菜单
const openPdfContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    pdfMenuX.value = event.clientX;
    pdfMenuY.value = event.clientY;
    contextMenuMouseEvent = event; // 保存鼠标事件，用于定位
    pdfContextMenuVisible.value = true;
};

// PDF右键菜单点击处理
const handlePdfMenuClick = async (item: string) => {
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

// 从PDF定位到代码（右键菜单或双击）
async function locateToCodeFromPdf(event?: MouseEvent) {
    if (!editorId) return;
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    // editorId 可能是 Ref<string|null>，取其 value
    const currentEditorId = typeof editorId === 'object' && editorId !== null && 'value' in editorId ? editorId.value : editorId;
    const monacoEditor = editors.find(e => e.getId?.() === currentEditorId) || editors[0];

    if (!pdfDoc || !monacoEditor) {
        eventBus.emit("show-info", t("latexEditor.notification.editorNotAvailable"));
        return;
    }
    
    // 使用传入的事件或保存的右键菜单事件
    const targetEvent = event || contextMenuMouseEvent;
    if (!targetEvent) {
        // 如果没有事件，使用中心位置
        return await locateToCodeFromPdfCenter();
    }
    
    // 使用右键位置进行定位
    await handlePdfTextClick(targetEvent);
}

// 从PDF中心位置定位到代码（备用方法）
async function locateToCodeFromPdfCenter() {
    if (!editorId) return;
    const editors = monaco.editor.getEditors();
    const currentEditorId = typeof editorId === 'object' && editorId !== null && 'value' in editorId ? editorId.value : editorId;
    const monacoEditor = editors.find(e => e.getId?.() === currentEditorId) || editors[0];

    if (!pdfDoc || !monacoEditor) {
        eventBus.emit("show-info", t("latexEditor.notification.editorNotAvailable"));
        return;
    }
    
    try {
        // 获取当前页面的DOM元素
        const currentPageElement = pageRefs.get(currentPdfPage.value);
        if (!currentPageElement) {
            eventBus.emit("show-info", t("latexEditor.notification.noCodeMapping"));
            return;
        }
        
        const page = await pdfDoc.getPage(currentPdfPage.value);
        const viewport = page.getViewport({ scale: 1 }); // 使用标准viewport（scale=1）用于坐标转换
        
        // 获取当前页面的canvas元素
        const canvas = currentPageElement.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
            eventBus.emit("show-info", t("latexEditor.notification.noCodeMapping"));
            return;
        }
        
        const pageRect = currentPageElement.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        
        // 使用页面中心位置
        const centerX = pageRect.width / 2;
        const centerY = pageRect.height / 2;
        
        const canvasStyleWidth = canvasRect.width || viewport.width;
        const canvasStyleHeight = canvasRect.height || viewport.height;
        
        const canvasX = centerX;
        const canvasY = centerY;
        
        const relativeX = canvasX / canvasStyleWidth;
        const relativeY = 1 - (canvasY / canvasStyleHeight);
        
        // 查找映射
        const pageMappings = pdfToSourceMap.get(currentPdfPage.value);
        if (pageMappings && pageMappings.length > 0) {
            // 使用页面中心的映射（选择最接近中心的映射）
            let closestMapping = null;
            let minDistance = Infinity;
            
            for (const mapping of pageMappings) {
                const range = mapping.pdfRange;
                const rangeCenterX = range.x + range.width / 2;
                const rangeCenterY = range.y + range.height / 2;
                const distance = Math.sqrt(
                    Math.pow(relativeX - rangeCenterX, 2) + Math.pow(relativeY - rangeCenterY, 2)
                );
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestMapping = mapping;
                }
            }
            
            if (closestMapping) {
                const position = closestMapping.monacoPosition;
                const monacoPosition = new monaco.Position(position.line, position.column);
                monacoEditor.setPosition(monacoPosition);
                monacoEditor.revealLineInCenter(position.line);
                // 高亮整行代码
                highlightCodeLine(monacoEditor, position.line);
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
        
        if (!ipcRenderer) return;
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
        
        if (!ipcRenderer) return;
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
const insertText = (text: string) => {
  if (textEditorAdapter.value && typeof textEditorAdapter.value.insertText === 'function') {
    (textEditorAdapter.value as any).insertText(text);
  }
};

// 处理粘贴图片（用于LaTeX编辑器）
const handlePasteImage = async () => {
    try {
        // 获取IPC渲染器
        let ipcRenderer: any = null;
        if (window && (window as any).electron) {
            ipcRenderer = (window as any).electron.ipcRenderer;
        } else {
            const { localIpcRenderer } = await import("../utils/web-adapter/local-ipc-renderer");
            ipcRenderer = localIpcRenderer;
        }
        
        if (!ipcRenderer) {
            logger.warn('IPC渲染器不可用，无法读取剪切板图片');
            return false;
        }
        
        // 读取剪切板图片
        const clipboardImage = await ipcRenderer.invoke('read-clipboard-image') as string | null;
        if (!clipboardImage) {
            return false; // 没有图片，返回false让后续处理文本粘贴
        }
        
        // 将base64图片转换为Blob
        const base64Data = clipboardImage.includes(',') ? clipboardImage.split(',')[1] : clipboardImage;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        
        // 使用图片上传服务上传图片
        const { uploadImage } = await import("../utils/image-upload-service");
        const fileName = `clipboard-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        
        // 获取文档路径（用于相对路径计算）
        const documentPath = workspace.ensureDocument(props.tabId).path;
        
        const uploadResult = await uploadImage({
            file: file,
            fileName: fileName,
            documentPath: documentPath,
        });
        
        if (!uploadResult.success || !uploadResult.imagePath) {
            throw new Error(uploadResult.error || '上传失败');
        }
        
        // 生成LaTeX图片嵌入代码
        // 使用处理后的路径，统一转换为正斜杠（LaTeX使用正斜杠）
        let normalizedPath = uploadResult.imagePath.replace(/\\/g, '/');
        
        // 转义LaTeX特殊字符（#、%、&、{}、_等）
        // 注意：转义顺序很重要，先转义反斜杠，再转义其他字符
        // 注意：如果配置中已经启用了URL转义，这里可能需要调整
        const imageUploadConfig = await getSetting('imageUpload');
        let escapedPath: string;
        if (imageUploadConfig?.autoEscapeImageUrl) {
            // 如果已经转义过，只需要转义LaTeX特殊字符（但需要先解码）
            // 这里简化处理：直接转义LaTeX特殊字符
            escapedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1');
        } else {
            // 如果未转义，先转义LaTeX特殊字符
            escapedPath = normalizedPath.replace(/([#%&{}_])/g, '\\$1');
        }
        
        // 使用标准的 includegraphics 格式，带宽度选项
        const latexCode = `\\includegraphics[width=0.8\\textwidth]{${escapedPath}}`;
        
        // 插入到编辑器
        insertText(latexCode);
        
        logger.debug('图片已上传并插入LaTeX代码', { imagePath: uploadResult.imagePath, normalizedPath, latexCode });
        return true; // 成功处理图片
    } catch (error) {
        logger.error('粘贴图片失败', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        eventBus.emit('show-error', t('latexEditor.notification.pasteImageFailed') || `粘贴图片失败: ${errorMessage}`);
        return false;
    }
};

// 使用textEditorAdapter来触发复制粘贴剪切操作（更可靠）
const executeMonacoCommand = async (command: string) => {
    if (!editor.value || !textEditorAdapter.value) return;
    
    // 确保编辑器获得焦点
    editor.value.focus();
    
    // 对于粘贴操作，先检查是否有图片
    if (command === 'editor.action.clipboardPasteAction') {
        const imageHandled = await handlePasteImage();
        if (imageHandled) {
            // 图片已处理，不需要执行文本粘贴
            return;
        }
        // 没有图片，使用 textEditorAdapter 的 paste 方法
        if (textEditorAdapter.value && typeof textEditorAdapter.value.paste === 'function') {
            await textEditorAdapter.value.paste();
            return;
        }
    }
    
    // 对于复制和剪切，使用 textEditorAdapter 的方法
    try {
        if (command === 'editor.action.clipboardCutAction') {
            if (textEditorAdapter.value && typeof textEditorAdapter.value.cut === 'function') {
                await textEditorAdapter.value.cut();
            }
        } else if (command === 'editor.action.clipboardCopyAction') {
            if (textEditorAdapter.value && typeof textEditorAdapter.value.copy === 'function') {
                await textEditorAdapter.value.copy();
            }
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
            let messages: any[] = []
            messages.push({
                role: 'system' as const,
                content: wholeArticleContextPrompt(text)
            })
            messages.push({
                role: 'assistant' as const,
                content: t('article.ai_understood')
            })
            const newDialog = {
                title: t('article.ai_analyze_title'),
                messages: messages
            };
            addDialogEntry(newDialog, true)
            prependAiChatDialog(newDialog);
            // 单窗口多Tab架构：直接使用eventBus，不再通过broadcast
            eventBus.emit('ai-chat-dialogs-updated', null);
            eventBus.emit('ai-chat')
            break;
        case 'cut':
            // 使用命令API处理剪切操作
            await executeMonacoCommand('editor.action.clipboardCutAction');
            break;
        case 'copy':
            // 使用命令API处理复制操作
            await executeMonacoCommand('editor.action.clipboardCopyAction');
            break;
        case 'paste':
            // executeMonacoCommand 内部会先检查图片，然后处理文本粘贴
            await executeMonacoCommand('editor.action.clipboardPasteAction');
            break;
        case 'selectAll':
            if (textEditorAdapter.value && typeof textEditorAdapter.value.selectAll === 'function') {
                (textEditorAdapter.value as any).selectAll();
            }
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
        case 'trigger-auto-completion':
            // 手动触发AI补全
            if (aiCompletionService.getAdapter()) {
                aiCompletionService.triggerCompletion('manual');
            } else {
                // 如果适配器不存在，先创建
                if (editorId.value) {
                    const adapter = new MonacoEditorAdapter(editorId.value, () => isActive.value);
                    aiCompletionService.setAdapter(adapter);
                    aiCompletionService.triggerCompletion('manual');
                }
            }
            break;

    }
    await refreshContextMenu();
    contextMenuVisible.value = false;
};

// 定位到PDF位置（从代码行定位到PDF）
async function locateToPdf() {
    if (!editorId) return;
    // 从Monaco全局获取编辑器实例
    const editors = monaco.editor.getEditors();
    const resolvedEditorId = typeof editorId === 'object' && 'value' in editorId ? editorId.value : editorId;
    const monacoEditor = editors.find(e => e.getId?.() === resolvedEditorId) || editors[0];

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
            // 设置标志，避免自动更新页码时触发跳转
            isAutoUpdatingPage = true;
            
            // 更新页码
            currentPdfPage.value = pdfLocation.pageNumber;
            inputPdfPage.value = pdfLocation.pageNumber;
            
            // 等待DOM更新后，滚动到页面内的具体位置
            await nextTick();
            
            // 滚动到页面内的具体位置
            await scrollToPdfLocation(pdfLocation);
            
            // 重置标志
            nextTick(() => {
                isAutoUpdatingPage = false;
            });
            
        } else {
            eventBus.emit("show-info", t("latexEditor.notification.noPdfMapping"));
        }
    } catch (error) {
        logger.error('定位到PDF位置失败', error);
        eventBus.emit("show-error", t("latexEditor.notification.locateToPdfFailed"));
    }
}

// 滚动到PDF页面内的具体位置
async function scrollToPdfLocation(pdfLocation: { pageNumber: number; pdfRange: { x: number; y: number; width: number; height: number } }) {
    if (!pdfScrollbarRef.value || !pdfDoc) return;
    
    try {
        // 等待页面元素准备好
        await nextTick();
        const pageElement = pageRefs.get(pdfLocation.pageNumber);
        if (!pageElement) {
            // 如果页面元素还没有准备好，先滚动到页面顶部
            await scrollToPage(pdfLocation.pageNumber);
            // 等待一下再重试
            await new Promise(resolve => setTimeout(resolve, 300));
            const retryPageElement = pageRefs.get(pdfLocation.pageNumber);
            if (!retryPageElement) {
                logger.warn('页面元素仍未准备好，无法精确定位');
                return;
            }
        }
        
        const finalPageElement = pageRefs.get(pdfLocation.pageNumber);
        if (!finalPageElement) return;
        
        const scrollbarEl = (pdfScrollbarRef.value as any).$el as HTMLElement | null;
        const scrollbarWrap = scrollbarEl?.querySelector('.el-scrollbar__wrap') as HTMLElement | null;
        if (!scrollbarWrap) return;
        
        // 获取页面元素的位置（相对于视口）
        const pageRect = finalPageElement.getBoundingClientRect();
        const containerRect = scrollbarWrap.getBoundingClientRect();
        
        // pdfRange是相对坐标（0-1之间），y坐标是从下往上的（PDF坐标系）
        // 需要转换为从上往下的坐标（DOM坐标系）
        const pdfRelativeY = pdfLocation.pdfRange.y; // PDF坐标系：0=底部，1=顶部
        const domRelativeY = 1 - pdfRelativeY; // DOM坐标系：0=顶部，1=底部
        
        // 获取页面的实际渲染高度
        const pageHeight = pageRect.height;
        
        // 计算目标位置在页面元素内的像素位置（从顶部开始）
        const targetPageY = domRelativeY * pageHeight;
        
        // 计算页面在滚动容器中的位置
        const scrollTop = scrollbarWrap.scrollTop;
        // 页面顶部相对于滚动容器内容的位置
        const pageTopInScrollContent = pageRect.top - containerRect.top + scrollTop;
        
        // 计算目标位置在滚动容器中的位置
        const targetInScrollContent = pageTopInScrollContent + targetPageY;
        
        // 计算需要滚动的距离，使目标位置显示在视口的上1/3处（更易见）
        const viewportHeight = containerRect.height;
        const targetScrollTop = targetInScrollContent - viewportHeight / 3;
        
        // 执行滚动
        scrollbarWrap.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
        });
        
        // 等待滚动完成后再选中文字
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // 选中对应的文字
        await selectPdfText(finalPageElement, pdfLocation.pdfRange);
        
        logger.debug('定位到PDF位置', {
            pageNumber: pdfLocation.pageNumber,
            pdfRange: pdfLocation.pdfRange,
            targetPageY,
            targetScrollTop
        });
        
    } catch (error) {
        logger.error('滚动到PDF位置失败', error);
        // 如果精确定位失败，至少滚动到页面顶部
        await scrollToPage(pdfLocation.pageNumber);
    }
}

// 选中PDF中的文字
async function selectPdfText(
    pageElement: HTMLElement,
    pdfRange: { x: number; y: number; width: number; height: number }
) {
    try {
        // 查找textLayer容器（尝试多种选择器）
        let textLayer = pageElement.querySelector('.textLayer.vue-pdf__wrapper-text-layer') as HTMLElement | null;
        if (!textLayer) {
            textLayer = pageElement.querySelector('.textLayer') as HTMLElement | null;
        }
        if (!textLayer) {
            textLayer = pageElement.querySelector('.vue-pdf__wrapper-text-layer') as HTMLElement | null;
        }
        
        if (!textLayer) {
            logger.warn('找不到textLayer容器，无法选中文字');
            return;
        }
        
        // 获取textLayer的实际尺寸
        const textLayerRect = textLayer.getBoundingClientRect();
        const textLayerWidth = textLayerRect.width;
        const textLayerHeight = textLayerRect.height;
        
        if (textLayerWidth === 0 || textLayerHeight === 0) {
            logger.warn('textLayer尺寸为0，无法选中文字');
            return;
        }
        
        // pdfRange是相对坐标（0-1之间），y坐标是从下往上的（PDF坐标系）
        const pdfRelativeY = pdfRange.y;
        const domRelativeY = 1 - pdfRelativeY; // 转换为DOM坐标系（从上往下）
        
        // 计算目标区域在textLayer中的像素坐标
        const targetX = pdfRange.x * textLayerWidth;
        const targetY = domRelativeY * textLayerHeight;
        const targetWidth = pdfRange.width * textLayerWidth;
        const targetHeight = pdfRange.height * textLayerHeight;
        
        // 获取所有span元素
        const spans = textLayer.querySelectorAll('span') as NodeListOf<HTMLElement>;
        if (spans.length === 0) {
            logger.warn('textLayer中没有找到span元素');
            return;
        }
        
        // 找到与目标区域重叠的span元素
        const targetSpans: HTMLElement[] = [];
        const tolerance = 5; // 容差（像素），稍微增大以提高匹配率
        
        for (const span of spans) {
            const spanRect = span.getBoundingClientRect();
            // 计算span相对于textLayer的位置
            const spanX = spanRect.left - textLayerRect.left;
            const spanY = spanRect.top - textLayerRect.top;
            const spanRight = spanX + spanRect.width;
            const spanBottom = spanY + spanRect.height;
            
            // 检查span是否与目标区域重叠（使用更宽松的条件）
            const overlaps = !(
                spanRight < targetX - tolerance ||
                spanX > targetX + targetWidth + tolerance ||
                spanBottom < targetY - tolerance ||
                spanY > targetY + targetHeight + tolerance
            );
            
            if (overlaps) {
                targetSpans.push(span);
            }
        }
        
        if (targetSpans.length === 0) {
            logger.warn('没有找到匹配的span元素', {
                targetX, targetY, targetWidth, targetHeight,
                textLayerWidth, textLayerHeight,
                spansCount: spans.length
            });
            return;
        }
        
        // 按位置排序span（从上到下，从左到右）
        targetSpans.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            const topDiff = rectA.top - rectB.top;
            if (Math.abs(topDiff) > 5) {
                return topDiff; // 按Y坐标排序
            }
            return rectA.left - rectB.left; // Y坐标相近时按X坐标排序
        });
        
        // 使用Selection API选中文字
        const selection = window.getSelection();
        if (!selection) return;
        
        // 清除当前选择
        selection.removeAllRanges();
        
        // 创建新的Range
        const range = document.createRange();
        
        // 设置起始位置为第一个span的开始
        const firstSpan = targetSpans[0];
        // 尝试找到文本节点
        let startNode: Node | null = null;
        let startOffset = 0;
        
        if (firstSpan.firstChild) {
            startNode = firstSpan.firstChild;
            if (startNode.nodeType === Node.TEXT_NODE) {
                startOffset = 0;
            }
        } else {
            startNode = firstSpan;
        }
        
        if (startNode) {
            range.setStart(startNode, startOffset);
        } else {
            range.setStartBefore(firstSpan);
        }
        
        // 设置结束位置为最后一个span的结束
        const lastSpan = targetSpans[targetSpans.length - 1];
        let endNode: Node | null = null;
        let endOffset = 0;
        
        if (lastSpan.lastChild) {
            endNode = lastSpan.lastChild;
            if (endNode.nodeType === Node.TEXT_NODE) {
                endOffset = endNode.textContent?.length || 0;
            } else {
                endNode = lastSpan;
            }
        } else {
            endNode = lastSpan;
        }
        
        if (endNode) {
            if (endNode.nodeType === Node.TEXT_NODE) {
                range.setEnd(endNode, endOffset);
            } else {
                range.setEndAfter(endNode);
            }
        } else {
            range.setEndAfter(lastSpan);
        }
        
        // 应用选择
        selection.addRange(range);
        
        const selectedText = selection.toString();
        logger.debug('已选中PDF文字', {
            spansCount: targetSpans.length,
            selectedText: selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : ''),
            textLength: selectedText.length
        });
        
        // 3秒后自动清除选择（可选）
        setTimeout(() => {
            const currentSelection = window.getSelection();
            if (currentSelection && currentSelection.toString() === selectedText) {
                currentSelection.removeAllRanges();
            }
        }, 3000);
        
    } catch (error) {
        logger.error('选中PDF文字失败', error);
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
    // disposeEditor 函数已移除，直接重置
    editorKey.value = Date.now(); // Vue 会销毁原 DOM，创建新 DOM
    nextTick(() => initEditor());
};

eventBus.on('search-replace', (payload?: any) => {
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
const editorConsoleContainerRef = ref<HTMLElement | null>(null);
let isResizingConsole = false;
let resizeStartY = 0;
let resizeStartHeight = 0;

function startResizeConsole(e: MouseEvent) {
  if (!showConsole.value || !editorConsoleContainerRef.value) return;
  
  // 检查事件目标，确保是在 console-resizer 上
  const target = e.target as HTMLElement;
  if (!target || !target.classList.contains('console-resizer')) {
    return; // 如果不是在 console-resizer 上，不处理，让事件继续冒泡
  }
  
  // 阻止默认行为和事件冒泡，因为这是我们的 resize bar
  e.preventDefault();
  e.stopPropagation();
  
  isResizingConsole = true;
  resizeStartY = e.clientY;
  resizeStartHeight = consoleHeight.value;
  // 确保初始高度有效
  if (resizeStartHeight < 100) {
    resizeStartHeight = 200;
    consoleHeight.value = 200;
  }
  document.addEventListener('mousemove', onResizingConsole);
  document.addEventListener('mouseup', stopResizeConsole);
  // 防止文本选择
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'row-resize';
}

function onResizingConsole(e: MouseEvent) {
  if (!isResizingConsole || !editorConsoleContainerRef.value) return;
  // 阻止默认行为和事件冒泡
  e.preventDefault();
  e.stopPropagation();
  
  // 计算新的高度：从初始高度减去鼠标移动的距离（向上拖拽增加高度，向下拖拽减少高度）
  const deltaY = resizeStartY - e.clientY; // 向上为正，向下为负
  const newHeight = resizeStartHeight + deltaY;
  
  // 获取容器尺寸
  const containerRect = editorConsoleContainerRef.value.getBoundingClientRect();
  const containerHeight = containerRect.height;
  
  // 限制高度范围：最小100px，最大为容器高度的80%
  const minHeight = 100;
  const maxHeight = Math.max(containerHeight * 0.8, minHeight);
  
  // 确保高度在有效范围内
  const clampedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
  
  // 只有当新高度有效时才更新
  if (clampedHeight >= minHeight && clampedHeight <= maxHeight) {
    consoleHeight.value = clampedHeight;
    
    // 在 resize 过程中，确保 Console 滚动到底部
    nextTick(() => {
      scrollConsoleToBottom();
    });
  }
}

function stopResizeConsole() {
  if (!isResizingConsole) return;
  isResizingConsole = false;
  document.removeEventListener('mousemove', onResizingConsole);
  document.removeEventListener('mouseup', stopResizeConsole);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  
  // 确保最终高度有效
  if (consoleHeight.value < 100) {
    consoleHeight.value = 200;
  }
  
  // resize 结束后，确保 Console 滚动到底部
  nextTick(() => {
    scrollConsoleToBottom();
  });
}

// 滚动 Console 到底部
function scrollConsoleToBottom() {
  // 通过 eventBus 通知 ConsoleOutput 组件滚动到底部
  eventBus.emit('console-scroll-to-bottom', { key: 'latex' });
}

const refreshContextMenu = async () => {
    articleContextMenuItems.value = await getArticleContextMenuItems({ isLatexEditor: true }) as any[];
}

// LaTeX 语言注册已由 registerLatexLanguage() 处理

let contentChangeListener: monaco.IDisposable | null = null;
const editorId = ref<string | null>(null);
const initEditor = () => {
    // 使用统一的 Monaco Worker 配置
    setupMonacoWorker();
    // 注册 LaTeX 语言支持
    registerLatexLanguage();

    //logger.debug("LaTeXEditor initEditor")
    if (!editorEl.value) return;
    editor.value = monaco.editor.create(editorEl.value, {
        value: currentTex.value,
        language: "latex", // 语言模式
        theme: themeState.currentTheme.type === 'dark' ? "vs-dark" : "vs",  // 主题 (vs, vs-dark, hc-black)
        mouseWheelZoom: true,
        automaticLayout: true, // 自动适应容器大小
        fontSize: 14,
        wordWrap: "on",  // 自动换行
        wrappingIndent: "same", // 缩进方式，"none" | "same" | "indent" | "deepIndent"
        lineNumbers: enableRowNumber ? 'on' : 'off',
        minimap: { enabled: enableMinimap },
        contextmenu: false,
        quickSuggestions: {
            other: true,  // 在其他字符后自动显示补全建议
            comments: false,  // 在注释中不显示
            strings: false   // 在字符串中不显示
        },
        suggestOnTriggerCharacters: true,  // 在触发字符（如 \）后自动显示补全
        acceptSuggestionOnCommitCharacter: true,  // 在输入提交字符时接受补全
        acceptSuggestionOnEnter: 'on'  // 按 Enter 时接受补全
    })
    editorId.value = editor.value.getId();
    textEditorAdapter.value = createMonacoAdapter(editorId.value);
    
    // 设置编辑器适配器（必须在内容变化监听之前设置）
    const adapter = new MonacoEditorAdapter(editorId.value, () => isActive.value);
    aiCompletionService.setAdapter(adapter);
    
    //editor.value.onKeyDown((e)=>logger.log(e));
    // 增量监听
    // 标志：是否正在更新ghost text（防止递归触发）
    let isUpdatingGhostText = false
    
    // 监听ghost text更新事件
    eventBus.on('ai-ghost-text-updating', (updating: unknown) => {
        isUpdatingGhostText = updating === true
    })
    
    contentChangeListener = editor.value.onDidChangeModelContent((event: monaco.editor.IModelContentChangedEvent) => {
        const monacoEditor = getActiveMonacoEditor();
        if (!monacoEditor) return;

        // 如果正在从外部更新，跳过同步逻辑（避免循环更新）
        if (isUpdatingFromExternal) {
            // 更新textBuffer以保持一致性
            textBuffer = monacoEditor.getValue();
            return;
        }
        
        // 直接从编辑器获取完整文本，避免手动对 model 进行操作
        textBuffer = monacoEditor.getValue();

        // 如果正在更新ghost text，只同步文本，不触发新的补全
        if (isUpdatingGhostText) {
            // 重要：即使正在更新ghost text，也要同步文本到文件，否则文本会丢失
            debounceSync();
            return
        }
        
        // 按需同步到 Vue 响应式变量，比如防抖或定时同步
        debounceSync();
        
        // 检测是否是粘贴操作（粘贴通常涉及大量文本变化或多个changes）
        // 如果是粘贴，跳过AI补全触发，避免卡死
        const isPasteOperation = event.changes.length > 1 || 
            event.changes.some(change => change.text.length > 100);
        
        if (isPasteOperation) {
            // 粘贴操作，不触发AI补全
            return;
        }
        
        // 确保适配器已设置（双重保险）
        if (!aiCompletionService.getAdapter()) {
            const adapter = new MonacoEditorAdapter(editorId.value ?? '', () => isActive.value);
            aiCompletionService.setAdapter(adapter);
        }
        
        // 用户继续打字时，立即取消当前补全
        aiCompletionService.cancelCurrentCompletion();
        
        // 触发AI补全（使用双层防抖，自动检测关键字符）
        aiCompletionService.triggerCompletion('input');
        
    });
    const debounceSync = debounce(() => {
        if(currentTex.value!==textBuffer){
            currentTex.value = textBuffer;
            // 同步大纲树
            syncOutlineFromTex();
        }
    }, 100);
    
    // 监听光标位置变化（光标切换时不触发补全，只在用户停止输入后触发）
    // 注意：光标变化本身不触发补全，只有输入停止后才会触发
    // editor.value.onDidChangeCursorPosition(() => {
    //     // 光标变化时不触发补全（避免频繁触发）
    // });
    
    // 监听鼠标点击事件，切换光标位置时取消补全并切换到被动状态
    // 注意：只处理左键点击，右键点击用于打开上下文菜单，不应该拦截
    editor.value.onMouseDown((e: monaco.editor.IEditorMouseEvent) => {
        // 只处理左键点击（button === 0），右键点击（button === 2）不处理
        if (e.event.browserEvent.button === 0) {
            aiCompletionService.handleMouseClick();
        }
    });
    
    // 拦截 Monaco 的粘贴命令（处理 Ctrl+V 粘贴图片）
    // 使用 addCommand 来拦截粘贴命令，这样可以在 Monaco 处理之前检查图片
    if (editor.value) {
        editor.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
            // 先尝试 IPC 读取图片（更可靠）
            const imageHandled = await handlePasteImage();
            if (imageHandled) {
                // 图片已处理，阻止默认粘贴行为（不执行任何操作）
                return;
            }
            
            // 如果没有图片，执行默认的粘贴命令
            if (editor.value) {
                editor.value.trigger('keyboard', 'editor.action.clipboardPasteAction', null);
            }
        });
    }
    
    // 同时监听 DOM 粘贴事件（作为备用，处理某些边缘情况）
    if (editorEl.value) {
        const handlePasteEvent = async (e: ClipboardEvent) => {
            // 先快速检查 clipboardData.items 是否有图片（同步检查，立即决定是否阻止）
            const items = e.clipboardData?.items;
            let hasImageInClipboard = false;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.type.indexOf('image') !== -1) {
                        hasImageInClipboard = true;
                        break;
                    }
                }
            }
            
            // 如果有图片，立即阻止默认粘贴行为，然后异步处理图片
            if (hasImageInClipboard) {
                e.preventDefault();
                e.stopPropagation();
                
                // 异步处理图片（使用 IPC 读取，更可靠）
                const imageHandled = await handlePasteImage();
                if (!imageHandled) {
                    logger.warn('检测到图片但处理失败');
                }
                return;
            }
            
            // 如果没有在 clipboardData 中检测到图片，也尝试使用 IPC 读取（作为备用检查）
            // 这适用于某些情况下 clipboardData 不可用的情况
            const imageHandled = await handlePasteImage();
            if (imageHandled) {
                // IPC 检测到图片并已处理，阻止默认粘贴行为
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // 如果没有图片，不阻止事件，让 Monaco 正常处理文本粘贴
        };
        
        editorEl.value.addEventListener('paste', handlePasteEvent, true); // 使用 capture 阶段确保优先处理
        
        // 保存清理函数
        (editor.value as any)._pasteHandler = handlePasteEvent;
    }
    
    // 监听键盘事件，检测Enter、Space等触发按键
    editor.value.onKeyDown((e: monaco.IKeyboardEvent) => {
        // 注意：Ctrl+F 和 Ctrl+H 现在由 App.vue 全局监听，这里不再处理
        // 手动触发（Ctrl+Tab 或 Mac 上的 Command+Tab）
        const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
        const modifierKey = isMac ? e.metaKey : e.ctrlKey;
        if (modifierKey && e.keyCode === monaco.KeyCode.Tab) {
            e.preventDefault();
            e.stopPropagation();
            aiCompletionService.triggerCompletion('manual');
            return;
        }
        
        // 重要：Tab键用于接受补全，不应该触发取消
        // Tab键的处理由AISuggestionGhost组件的命令处理
        if (e.keyCode === monaco.KeyCode.Tab) {
            return;
        }
        
        // 检测触发按键（Enter、Space、;、,）
        const key = e.keyCode === monaco.KeyCode.Enter ? 'Enter' :
                   e.keyCode === monaco.KeyCode.Space ? 'Space' :
                   e.keyCode === monaco.KeyCode.Semicolon ? ';' :
                   e.keyCode === monaco.KeyCode.Comma ? ',' : null;
        
        if (key) {
            // 用户继续打字时，立即取消当前补全
            aiCompletionService.cancelCurrentCompletion();
            // 触发补全（按键触发）
            aiCompletionService.triggerCompletion('key', key);
        } else {
            // 其他按键：用户继续打字，立即取消补全
            aiCompletionService.cancelCurrentCompletion();
        }
    });
    
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
        
        // 监听AI分析开关变化
        eventBus.on('console-ai-analysis-toggle', (payload: any) => {
            if (payload && payload.key === 'latex') {
                enableAiAnalysis.value = payload.enabled;
            }
        });

        eventBus.on('sync-editor-theme', () => {
            const isDark = themeState.currentTheme.type === 'dark';
            const themeName = isDark ? 'vs-dark' : 'vs';
            const toMonacoColor = (color: string) => color.replace('#', '') || 'FFFFFF';
            const deeperColor = (color: string) => {
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
            const initialWidth = (mainContainerRef.value as HTMLElement).clientWidth;
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
                    // 在组件大小变化时，暂时禁用 minimap 避免闪烁
                    temporarilyDisableMinimap();
                }
            });
            mainObserver.observe(mainContainerRef.value);
        }
        
        // 监听窗口大小变化，暂时禁用 minimap 避免闪烁
        const handleWindowResize = () => {
            temporarilyDisableMinimap();
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', handleWindowResize);
            // 保存清理函数
            (window as any)._latexEditorResizeHandler = handleWindowResize;
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
    
    // 停止错误分析监听
    if (errorAnalysisWatchStop) {
        errorAnalysisWatchStop();
        errorAnalysisWatchStop = null;
    }
    
    // 移除 console 输出监听器
    if (compileConsoleListeners.onStdout) {
        eventBus.off('console-out', compileConsoleListeners.onStdout);
    }
    if (compileConsoleListeners.onStderr) {
        eventBus.off('console-err', compileConsoleListeners.onStderr);
    }
    compileConsoleListeners = {};
    
    // 移除文本选择监听器
    removeTextSelectionListener();
    
    // 移除wheel事件监听器
    if (pdfPagesContainer.value) {
        pdfPagesContainer.value.removeEventListener('wheel', handlePdfScroll as any);
    }
    
    // 移除滚动监听器
    removeScrollListener();
    
    // 移除编辑器适配器
    aiCompletionService.removeAdapter();
    
    // 清理内容变化监听器
    if (contentChangeListener) {
        contentChangeListener.dispose();
        contentChangeListener = null;
    }
    
    eventBus.emit('is-need-save', true)
    
    // 清理粘贴事件监听器
    if (editorEl.value && (editor.value as any)?._pasteHandler) {
        editorEl.value.removeEventListener('paste', (editor.value as any)._pasteHandler);
        delete (editor.value as any)._pasteHandler;
    }
    
    if (editorId.value) {
        try {
            const editors = monaco.editor.getEditors();
            editors.forEach(ed => {
                if (ed.getId() === editorId.value) {
                    try {
                        ed.dispose(); // 释放 editor 的所有资源，包括模型、事件监听等
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
        // 移除窗口 resize 监听器
        if ((window as any)._latexEditorResizeHandler) {
            window.removeEventListener('resize', (window as any)._latexEditorResizeHandler);
            delete (window as any)._latexEditorResizeHandler;
        }
    }
    
    // 如果 minimap 被暂时禁用，恢复它
    if (isMinimapTemporarilyDisabled && editor.value && enableMinimap) {
        editor.value.updateOptions({
            minimap: { enabled: true }
        });
        isMinimapTemporarilyDisabled = false;
    }
    
    // 移除AI分析开关监听器
    eventBus.off('console-ai-analysis-toggle');
});

function onAcceptSuggestion(text: string) {
    //logger.log("补全已接受:", text);
    // AISuggestionGhost已经帮忙插入了
}

function onCancelSuggestion() {
    //logger.log("补全已取消");
}

</script>

<style scoped>
.main-container {
    /* 设置主题背景色 */
    background-color: v-bind('themeState.currentTheme.background');
}

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
    overflow: hidden;
    position: relative;
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
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--el-bg-color-page);
}

.editor-wrapper {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
}

.editor-wrapper.console-visible {
    flex: 1 1 auto;
    min-height: 0;
}

.editor {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 0;
}

.console-resizer {
    height: 4px;
    cursor: row-resize;
    background: var(--el-border-color-lighter);
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    transition: background-color 0.2s;
}

.console-resizer:hover {
    background: var(--el-color-primary);
}

.console-wrapper {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--console-background);
    border-top: 1px solid var(--el-border-color-lighter);
    overflow: hidden;
}

.console-panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.pdf-toolbar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    overflow: hidden; /* 防止内容溢出 */
    flex-wrap: nowrap; /* 禁止换行 */
}

.pdf-toolbar__page {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap; /* 防止换行 */
    flex-shrink: 0; /* 防止收缩 */
    min-width: 0; /* 允许内容溢出时使用省略号 */
}

.pdf-toolbar__page input {
    width: 50px;
    text-align: center;
    flex-shrink: 0;
}

.pdf-toolbar__page-label {
    white-space: nowrap; /* 防止标签换行 */
    flex-shrink: 1; /* 允许在空间不足时收缩 */
    overflow: hidden;
    text-overflow: ellipsis;
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

.pdf-toolbar-icon.active {
    background-color: rgba(0, 0, 0, 0.15);
    color: var(--el-color-primary);
}

.pdf-toolbar-icon.active .el-icon {
    color: var(--el-color-primary);
}

.pdf-preview-container {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--el-border-color-lighter);
}

/* el-scrollbar 作为 pdf-preview-container 时的样式 */
.pdf-preview-container :deep(.el-scrollbar__wrap) {
    overflow-x: auto;
    overflow-y: auto;
}

.pdf-pages-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    gap: 20px;
    min-height: 100%;
    min-width: 100%;  /* 允许内容横向扩展，触发横向滚动 */
    box-sizing: border-box;
    overflow: visible;  /* 内层直接 visible，让内容自然溢出 */
    /* 优化渲染质量 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}


.pdf-page-wrapper {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background-color: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    /* 容器大小自动匹配内容，不设置固定宽度 */
    width: fit-content;
    /* 移除 max-width 限制，允许页面在缩放后超出容器宽度，触发横向滚动 */
    margin: 0 auto;
    flex-shrink: 0;  /* 防止页面被压缩 */
}

.vue-pdf-wrapper {
    /* VuePdf组件会自动根据scale调整大小，容器跟随内容 */
    display: inline-block;
}

/* 确保PDF页面本身有白色背景，避免暗色模式下的闪烁 */
.pdf-page-wrapper .vue-pdf-main {
    background-color: #ffffff;
}

.pdf-page-wrapper .vue-pdf {
    background-color: #ffffff;
}

.pdf-page-wrapper .vue-pdf__wrapper {
    background-color: #ffffff;
}

/* PDF页面canvas应该有白色背景，并优化渲染质量 */
.pdf-page-wrapper canvas {
    background-color: #ffffff;
    /* 优化缩放时的渲染质量 */
    image-rendering: auto; /* 使用默认渲染，避免crisp-edges导致的锯齿 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /* 启用硬件加速 */
    transform: translateZ(0);
    will-change: transform;
}

/* 优化文本层渲染 */
.pdf-page-wrapper .textLayer {
    opacity: 1;
}

/* PDF定位高亮样式 */
:global(.pdf-locate-highlight-line) {
    background-color: rgba(64, 158, 255, 0.15) !important;
    border-left: 3px solid rgba(64, 158, 255, 0.8) !important;
}

:global(.pdf-locate-highlight-range) {
    background-color: rgba(64, 158, 255, 0.25) !important;
    border: 1px solid rgba(64, 158, 255, 0.6) !important;
    border-radius: 2px;
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
